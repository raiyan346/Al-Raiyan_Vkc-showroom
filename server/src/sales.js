import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {calculateBill,returnValue,weightedCost} from '@alraiyan/core';
import {db,transaction} from './db.js';
export const billSchema=z.object({
 id:z.string().uuid(),customerId:z.string().uuid().nullable().optional(),
 items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(10000),unitPrice:z.number().int().min(0).max(1000000000)})).min(1).max(200),
 discount:z.number().int().min(0).default(0),paymentMode:z.enum(['CASH','UPI','CARD','CREDIT']),cashTendered:z.number().int().min(0).max(1000000000).default(0),
 soldAt:z.string().datetime()
}).strict();
export function publicSale(sale,role) {
 const {cost,profit,requestHash,...safe}=sale;
 safe.items=sale.items?.map(({unitCost,costKnown,...i})=>role==='OWNER'?{...i,unitCost,costKnown}:i);
 safe.returns=sale.returns?.map(({cost,requestHash,...r})=>role==='OWNER'?{...r,cost}:r);
 return role==='OWNER'?{...safe,cost,profit}:safe;
}
export const saleInclude={items:true,customer:true,returns:{include:{items:true}},user:{select:{name:true}}};
export async function createSale(input,user) {
 const data=billSchema.parse(input);
 if(new Set(data.items.map(i=>i.productId)).size!==data.items.length)throw new Error('Combine repeated product rows.');
 const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const run=()=>transaction(async tx=>{
  const existing=await tx.sale.findUnique({where:{id:data.id},include:saleInclude});
  if(existing){if(existing.requestHash!==hash || existing.userId!==user.id)throw new Error('Bill ID is already used for different content.');return existing;}
  if(data.paymentMode==='CREDIT'&&!data.customerId)throw new Error('Choose a customer for a credit bill.');
  if(data.customerId&&!await tx.customer.findUnique({where:{id:data.customerId}}))throw new Error('Customer no longer exists.');
  const soldTime=new Date(data.soldAt);
  if(soldTime>new Date(Date.now()+5*60*1000))throw new Error('Bill time is in the future. Check device clock.');
  const lines=[];
  for(const i of data.items){
   const p=await tx.product.findUnique({where:{id:i.productId}});
   if(!p?.active)throw new Error('A product is no longer available.');
   const changed=await tx.product.updateMany({where:{id:p.id,quantity:{gte:i.quantity},active:true},data:{quantity:{decrement:i.quantity}}});
   if(changed.count!==1)throw new Error(`Not enough stock: ${p.name} / ${p.size}. Review this bill before retrying.`);
   lines.push({...i,name:p.name,size:p.size,color:p.color,barcode:p.barcode,mrp:p.mrp,unitCost:p.purchasePrice,costKnown:p.costKnown});
   await tx.stockMovement.create({data:{productId:p.id,delta:-i.quantity,kind:'SALE',note:data.id,actorId:user.id}});
  }
  const bill=calculateBill(lines,data.discount);
  if(data.paymentMode==='CASH'&&data.cashTendered<bill.total)throw new Error('Cash received is less than the bill total.');
  return tx.sale.create({data:{id:data.id,number:`AR-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${data.id.slice(0,8).toUpperCase()}`,requestHash:hash,userId:user.id,customerId:data.customerId||null,paymentMode:data.paymentMode,subtotal:bill.subtotal,discount:bill.discount,total:bill.total,cost:bill.cost,profit:bill.profit,cashTendered:data.paymentMode==='CASH'?data.cashTendered:0,creditDue:data.paymentMode==='CREDIT'?bill.total:0,soldAt:soldTime,items:{create:bill.lines.map(({gross,cost,productId,quantity,unitPrice,name,size,color,barcode,mrp,unitCost,costKnown,discount,net})=>({productId,quantity,unitPrice,name,size,color,barcode,mrp,unitCost,costKnown,discount,net}))}},include:saleInclude});
 });
 try{return await run();}catch(e){
  if(e.code==='P2002'){
   const existing=await db.sale.findUnique({where:{id:data.id},include:saleInclude});
   if(existing?.requestHash===hash&&existing.userId===user.id)return existing;
  }throw e;
 }
}
export const returnSchema=z.object({id:z.string().uuid(),reason:z.string().trim().min(2).max(300),refundMode:z.enum(['CASH','UPI','CARD']),items:z.array(z.object({saleItemId:z.string().uuid(),quantity:z.number().int().positive()})).min(1).max(200)});
export async function createReturn(saleId,input,user) {
 const data=returnSchema.parse(input);
 const requestHash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 if(new Set(data.items.map(i=>i.saleItemId)).size!==data.items.length)throw new Error('Combine repeated return rows.');
 return transaction(async tx=>{
  const prior=await tx.return.findUnique({where:{id:data.id},include:{items:true}});
  if(prior){if(prior.saleId!==saleId||prior.actorId!==user.id||prior.requestHash!==requestHash)throw new Error('Return ID already used for different content.');return prior;}
  const sale=await tx.sale.findUnique({where:{id:saleId},include:{items:true}});if(!sale)throw new Error('Bill not found.');
  let total=0,cost=0;const rows=[];
  for(const item of data.items){
   const line=sale.items.find(i=>i.id===item.saleItemId);if(!line)throw new Error('Item does not belong to this bill.');
   const amount=returnValue(line.net,line.quantity,line.returned,item.quantity);
   const changed=await tx.saleItem.updateMany({where:{id:line.id,returned:line.returned},data:{returned:{increment:item.quantity}}});
   if(!changed.count)throw new Error('This bill changed. Reload before returning.');
   const stock=await tx.product.findUniqueOrThrow({where:{id:line.productId}});
   await tx.product.update({where:{id:line.productId},data:{quantity:{increment:item.quantity},purchasePrice:weightedCost(stock.quantity,stock.purchasePrice,item.quantity,line.unitCost),costKnown:stock.quantity===0?line.costKnown:stock.costKnown&&line.costKnown}});
   await tx.stockMovement.create({data:{productId:line.productId,delta:item.quantity,kind:'RETURN',note:sale.number,actorId:user.id}});
   rows.push({saleItemId:line.id,quantity:item.quantity,amount}); total+=amount;cost+=line.unitCost*item.quantity;
  }
  const creditReduction=Math.min(total,sale.creditDue);
  if(creditReduction)await tx.sale.update({where:{id:saleId},data:{creditDue:{decrement:creditReduction}}});
  return tx.return.create({data:{id:data.id,requestHash,saleId,reason:data.reason,total,cost,creditReduction,refund:total-creditReduction,refundMode:data.refundMode,actorId:user.id,items:{create:rows}},include:{items:true}});
 });
}
export async function collectCredit(customerId,body){
 const data=z.object({id:z.string().uuid(),amount:z.number().int().positive().max(1000000000),mode:z.enum(['CASH','UPI','CARD'])}).parse(body);
 return transaction(async tx=>{
  // Each collection has one ID and is allocated to the oldest outstanding bills.
  const existing=await tx.payment.findMany({where:{OR:[{id:data.id},{id:{startsWith:data.id+'-'}}]}});
  if(existing.length){if(existing.some(p=>p.customerId!==customerId)||existing.reduce((s,p)=>s+p.amount,0)!==data.amount||existing.some(p=>p.mode!==data.mode))throw new Error('Payment ID already used.');return existing;}
  const bills=await tx.sale.findMany({where:{customerId,creditDue:{gt:0}},orderBy:{createdAt:'asc'}});
  if(data.amount>bills.reduce((s,b)=>s+b.creditDue,0))throw new Error('Payment is greater than outstanding credit.');
  let remaining=data.amount;const payments=[];
  for(const bill of bills){if(!remaining)break;const amount=Math.min(remaining,bill.creditDue);remaining-=amount;
   await tx.sale.update({where:{id:bill.id},data:{creditDue:{decrement:amount}}});
   payments.push(await tx.payment.create({data:{id:payments.length?`${data.id}-${payments.length}`:data.id,customerId,saleId:bill.id,amount,mode:data.mode}}));
  }return payments;
 });
}
