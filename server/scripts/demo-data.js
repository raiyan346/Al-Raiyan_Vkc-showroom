import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {db} from '../src/db.js';
import {verifyDemoTarget} from '../src/environment.js';
import {createSale} from '../src/sales.js';
import {saveArticle} from '../src/inventory.js';
export async function seedDemo(){
 await verifyDemoTarget();
 if(await db.user.count({where:{username:'demo'}})){if(!await db.product.count())throw new Error('Incomplete demo seed; run the guarded demo reset.');return;}
 if(await db.product.count()||await db.sale.count())throw new Error('Refusing to seed an existing non-demo dataset.');
 const password=process.env.DEMO_PASSWORD;if(!password||password.length<16)throw new Error('Set DEMO_PASSWORD.');
 const user=await db.user.create({data:{username:'demo',name:'Demo Visitor',role:'OWNER',passwordHash:await bcrypt.hash(password,12)}});
 await db.setting.upsert({where:{id:'shop'},update:{},create:{id:'shop',shopName:'VKC Fictional Demo Showroom — SAMPLE',address:'Fictional Sample Street, Demo City',phone:''}});
 for(const [index,brand] of ['Walkaroo','VKC','Paragon'].entries()){
  await saveArticle({id:randomUUID(),brand,articleNumber:`DEMO-${index+1}001`,name:`${brand} Sample Sandal`,category:'Sandals',gender:'Unisex',sizeSystem:'UK/India',notes:'Fictional portfolio demo product',variants:[6,7,8,9,10,11,12].flatMap(size=>['Black','Brown'].map(color=>({size:String(size),color,mrp:59900+index*10000,sellingPrice:49900+index*10000,purchasePrice:30000+index*5000,quantity:12,minimumStock:3,barcodes:[{value:`DEMO-${index+1}-${size}-${color.toUpperCase()}`,format:'CODE128',type:'MANUFACTURER'}]})))},user);
 }
 const customer=await db.customer.create({data:{name:'Fictional Sample Customer',phone:'9000000001'}});
 await db.supplier.create({data:{name:'Fictional Demo Supplier',phone:'9000000002',address:'Sample Warehouse, Demo City'}});
 const products=await db.product.findMany({take:3,orderBy:{barcode:'asc'}});
 for(const [i,mode] of ['CASH','UPI','CREDIT'].entries())await createSale({id:randomUUID(),items:[{productId:products[i].id,quantity:i+1,unitPrice:49900}],discount:1000,paymentMode:mode,cashTendered:200000,customerId:mode==='CREDIT'?customer.id:null,soldAt:new Date().toISOString()},user);
 await db.expense.create({data:{category:'Sample shop expense',note:'Fictional demonstration expense',amount:15000,actorId:user.id}});
 console.log('Fictional demo catalogue, stock, customers and sample bills prepared.');
}
