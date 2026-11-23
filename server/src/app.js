import './config.js';
import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import {db,transaction} from './db.js';
import {secret} from './config.js';
import {encodeCost,decodeCost,validateCipher,toPaise,rupees,weightedCost} from '@alraiyan/core';
import {createSale,createReturn,collectCredit,publicSale,saleInclude} from './sales.js';
import {report,cashClosing,indiaDay} from './reports.js';
import {invoicePdf,exportReport} from './documents.js';
import {backup} from './backup.js';
import {stockTransaction} from './stock-operations.js';
import {catalogue,serializeProduct,productInclude,findBarcode,saveArticle,articleDetails,attachLegacyVariant} from './inventory.js';
export const app=express();app.disable('x-powered-by');
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'"],'img-src':["'self'",'data:','blob:','https:'],'connect-src':["'self'"],'style-src':["'self'","'unsafe-inline'"]}}}));
app.use(express.json({limit:'12mb'}));
const route=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const owner=(req,res,next)=>req.user.role==='OWNER'?next():res.status(403).json({error:'Owner access required.'});
const safeProduct=serializeProduct;
const text=z.string().trim().min(1).max(150);
const productSchema=z.object({name:text,brand:text,category:text,size:text,color:text,mrp:z.number().int().nonnegative().max(1000000000),purchasePrice:z.number().int().nonnegative().max(1000000000).optional(),quantity:z.number().int().nonnegative().max(100000).default(0),photo:z.string().max(1500000).refine(s=>!s||/^data:image\/(png|jpeg|webp);base64,/.test(s)||/^https:\/\//.test(s),'Use an HTTPS image or PNG/JPEG/WebP upload.').nullable().optional()});
const personSchema=z.object({name:text,phone:z.string().regex(/^(?:\+91)?[6-9]\d{9}$/,'Enter a valid Indian mobile number.').transform(s=>s.replace(/^\+91/,'')),address:z.string().max(500).optional()});
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false});
app.get('/api/health',route(async(req,res)=>{await db.$queryRaw`SELECT 1`;res.json({ok:true});}));
app.post('/api/auth/login',loginLimiter,route(async(req,res)=>{
 const data=z.object({username:text,password:z.string().min(1).max(200)}).parse(req.body);
 const user=await db.user.findUnique({where:{username:data.username}});
 if(!user?.active||!await bcrypt.compare(data.password,user.passwordHash))return res.status(401).json({error:'Username or password is incorrect.'});
 const token=jwt.sign({sub:user.id,v:user.tokenVersion},secret,{expiresIn:'7d',algorithm:'HS256'});
 res.json({token,user:{id:user.id,name:user.name,role:user.role}});
}));
app.use('/api',route(async(req,res,next)=>{
 try{const token=req.headers.authorization?.replace(/^Bearer /,'');const claims=jwt.verify(token,secret,{algorithms:['HS256']});const user=await db.user.findUnique({where:{id:claims.sub}});if(!user?.active||claims.v!==user.tokenVersion)throw new Error();req.user=user;next();}catch{return res.status(401).json({error:'Please sign in again. Your saved offline bills are still on this device.'});}
}));
app.get('/api/auth/me',(req,res)=>res.json({id:req.user.id,name:req.user.name,role:req.user.role}));
app.post('/api/auth/password',route(async(req,res)=>{const data=z.object({current:z.string(),password:z.string().min(10).max(200)}).parse(req.body);if(!await bcrypt.compare(data.current,req.user.passwordHash))throw new Error('Current password is incorrect.');await db.user.update({where:{id:req.user.id},data:{passwordHash:await bcrypt.hash(data.password,12),tokenVersion:{increment:1}}});res.json({ok:true});}));
app.get('/api/settings',route(async(req,res)=>{const {cipher,...s}=await db.setting.findUniqueOrThrow({where:{id:'shop'}});res.json(req.user.role==='OWNER'?{...s,cipher}:s);}));
app.put('/api/settings',owner,route(async(req,res)=>{const data=z.object({shopName:text,address:z.string().max(500),phone:z.string().max(20),cipher:z.string().refine(s=>{try{validateCipher(s);return true;}catch{return false;}},'Use ten unique uppercase letters.'),lowStock:z.number().int().min(0).max(1000),sizeSystems:z.string().trim().min(1).max(500).optional()}).parse(req.body);res.json(await db.setting.update({where:{id:'shop'},data}));}));
app.post('/api/cost-code/decode',owner,route(async(req,res)=>{const s=await db.setting.findUniqueOrThrow({where:{id:'shop'}});res.json({amount:decodeCost(z.string().parse(req.body.code),s.cipher)});}));
app.get('/api/users',owner,route(async(req,res)=>res.json(await db.user.findMany({select:{id:true,name:true,username:true,role:true,active:true}}))));
app.post('/api/users',owner,route(async(req,res)=>{const d=z.object({name:text,username:z.string().regex(/^[a-zA-Z0-9_-]{3,40}$/),password:z.string().min(10).max(200),role:z.enum(['OWNER','STAFF'])}).parse(req.body);const {password,...data}=d;const u=await db.user.create({data:{...data,passwordHash:await bcrypt.hash(password,12)}});res.status(201).json({id:u.id});}));
app.patch('/api/users/:id',owner,route(async(req,res)=>{const d=z.object({active:z.boolean()}).parse(req.body);if(req.params.id===req.user.id)throw new Error('You cannot disable your own account.');res.json(await db.user.update({where:{id:req.params.id},data:{active:d.active,tokenVersion:{increment:1}},select:{id:true,active:true}}));}));
app.get('/api/products',route(async(req,res)=>res.json(await catalogue(req.user.role,req.query.all==='true'))));
app.get('/api/barcodes/resolve',route(async(req,res)=>res.json(await findBarcode(z.string().min(1).max(100).parse(req.query.value),req.user.role))));
app.get('/api/articles',route(async(req,res)=>{
 const where=req.query.articleNumber?{articleNumber:{equals:String(req.query.articleNumber).trim()}}:{};
 const articles=await db.article.findMany({where,include:{variants:{select:{id:true,size:true,color:true,quantity:true,active:true}}},orderBy:{brand:'asc'}});res.json(articles);
}));
app.get('/api/articles/:id',route(async(req,res)=>res.json(await articleDetails(req.params.id,req.user.role))));
app.post('/api/articles',route(async(req,res)=>res.status(201).json(await saveArticle(req.body,req.user))));
app.post('/api/articles/:id/attach-variant',route(async(req,res)=>res.json(await attachLegacyVariant(req.params.id,z.string().uuid().parse(req.body.variantId),req.user))));
app.get('/api/products/:id/changes',route(async(req,res)=>res.json(await db.productChange.findMany({where:{productId:req.params.id},orderBy:{createdAt:'desc'},take:100}))));
async function addProduct(tx,data,user){
 const isOwner=user.role==='OWNER';const parent=await tx.article.create({data:{identityKey:'legacy:'+randomUUID(),articleNumber:'',brand:data.brand,name:data.name,category:data.category,image:data.photo}});const p=await tx.product.create({data:{...data,articleId:parent.id,sellingPrice:data.mrp,purchasePrice:isOwner?(data.purchasePrice??0):0,costKnown:isOwner&&data.purchasePrice!==undefined,barcode:`AR${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`}});
 if(p.quantity)await tx.stockMovement.create({data:{productId:p.id,delta:p.quantity,kind:'OPENING',actorId:user.id}});return p;
}
app.post('/api/products',route(async(req,res)=>{const data=productSchema.parse(req.body);res.status(201).json(safeProduct(await transaction(tx=>addProduct(tx,data,req.user)),req.user.role));}));
app.put('/api/products/:id',route(async(req,res)=>{const {quantity,purchasePrice,...data}=productSchema.parse(req.body);if(req.user.role==='OWNER'&&purchasePrice!==undefined)Object.assign(data,{purchasePrice,costKnown:true});res.json(safeProduct(await db.product.update({where:{id:req.params.id},data}),req.user.role));}));
app.delete('/api/products/:id',route(async(req,res)=>{await db.product.update({where:{id:req.params.id},data:{active:false}});res.json({ok:true});}));
app.post('/api/products/:id/restore',route(async(req,res)=>res.json(safeProduct(await db.product.update({where:{id:req.params.id},data:{active:true}}),req.user.role))));
app.post('/api/products/import',route(async(req,res)=>{
 const input=z.object({format:z.enum(['csv','xlsx']),content:z.string().max(10000000),confirm:z.boolean().default(false)}).parse(req.body);let rows;
 if(input.format==='csv')rows=parse(input.content,{columns:true,skip_empty_lines:true,bom:true,trim:true});
 else{const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(input.content,'base64'));const sheet=book.worksheets[0];if(!sheet)throw new Error('Excel file has no worksheet.');const headers=sheet.getRow(1).values.slice(1).map(String);rows=[];sheet.eachRow((r,n)=>{if(n>1){const row={};headers.forEach((h,i)=>row[h]=r.getCell(i+1).text);rows.push(row);}});}
 if(!rows.length||rows.length>1000)throw new Error('Import between 1 and 1,000 rows at a time.');
 const parsed=rows.map((r,i)=>{try{return productSchema.parse({...r,mrp:toPaise(r.mrp),purchasePrice:req.user.role==='OWNER'&&r.purchasePrice!==undefined?toPaise(r.purchasePrice):undefined,quantity:Number(r.quantity||0),size:String(r.size)});}catch(e){throw new Error(`Row ${i+2}: ${e.message}`);}});
 if(!input.confirm)return res.json({count:parsed.length,preview:parsed.slice(0,10).map(p=>safeProduct(p,req.user.role))});
 const products=await transaction(async tx=>{const out=[];for(const p of parsed)out.push(await addProduct(tx,p,req.user));return out;});res.status(201).json(products.map(p=>safeProduct(p,req.user.role)));
}));
app.post('/api/labels',owner,route(async(req,res)=>{const ids=z.array(z.string().uuid()).min(1).max(1000).parse(req.body.ids);const s=await db.setting.findUniqueOrThrow({where:{id:'shop'}});const p=await db.product.findMany({where:{id:{in:ids}}});res.json({shopName:s.shopName,products:p.map(({purchasePrice,...p})=>({...p,costCode:encodeCost(rupees(purchasePrice),s.cipher)}))});}));
app.post('/api/sales',route(async(req,res)=>res.status(201).json(publicSale(await createSale(req.body,req.user),req.user.role))));
app.get('/api/sales',route(async(req,res)=>{const sales=await db.sale.findMany({where:req.query.customerId?{customerId:String(req.query.customerId)}:undefined,include:saleInclude,orderBy:{createdAt:'desc'},take:200});res.json(sales.map(s=>publicSale(s,req.user.role)));}));
app.get('/api/sales/:id',route(async(req,res)=>{const sale=await db.sale.findUnique({where:{id:req.params.id},include:saleInclude});if(!sale)return res.status(404).json({error:'Bill not found.'});res.json(publicSale(sale,req.user.role));}));
app.get('/api/sales/:id/pdf',route(async(req,res)=>{const s=await db.sale.findUniqueOrThrow({where:{id:req.params.id},include:saleInclude});invoicePdf(res,s,await db.setting.findUniqueOrThrow({where:{id:'shop'}}));}));
app.post('/api/sales/:id/returns',route(async(req,res)=>{const result=await createReturn(req.params.id,req.body,req.user);const {cost,requestHash,...safe}=result;res.status(201).json(req.user.role==='OWNER'?{...safe,cost}:safe);}));
app.get('/api/customers',route(async(req,res)=>{const c=await db.customer.findMany({include:{sales:{select:{creditDue:true}}},orderBy:{name:'asc'}});res.json(c.map(({sales,...p})=>({...p,balance:sales.reduce((s,b)=>s+b.creditDue,0)})));}));
app.post('/api/customers',route(async(req,res)=>{const {address,...data}=personSchema.parse(req.body);res.status(201).json(await db.customer.create({data}));}));
app.get('/api/customers/:id/history',route(async(req,res)=>{const c=await db.customer.findUniqueOrThrow({where:{id:req.params.id},include:{sales:{include:saleInclude,orderBy:{createdAt:'desc'}},payments:true}});res.json({...c,sales:c.sales.map(s=>publicSale(s,req.user.role)),balance:c.sales.reduce((s,b)=>s+b.creditDue,0)});}));
app.post('/api/customers/:id/payments',route(async(req,res)=>res.status(201).json(await collectCredit(req.params.id,req.body))));
app.get('/api/suppliers',route(async(req,res)=>res.json(await db.supplier.findMany({orderBy:{name:'asc'}}))));
app.post('/api/suppliers',route(async(req,res)=>res.status(201).json(await db.supplier.create({data:personSchema.parse(req.body)}))));
app.get('/api/suppliers/:id/purchases',route(async(req,res)=>{const rows=await db.purchase.findMany({where:{supplierId:req.params.id},include:{items:{include:{product:true}}},orderBy:{createdAt:'desc'}});res.json(rows.map(({total,items,...p})=>({...p,...(req.user.role==='OWNER'?{total}:{}),items:items.map(({unitCost,product,...i})=>({...i,...(req.user.role==='OWNER'?{unitCost}:{}),product:safeProduct(product,req.user.role)}))})));}));
app.get('/api/stock/movements',route(async(req,res)=>res.json(await db.stockMovement.findMany({include:{product:{select:{name:true,size:true,barcode:true}}},orderBy:{createdAt:'desc'},take:200}))));
app.post('/api/stock/adjust',route(async(req,res)=>{
 const d=z.object({id:z.string().uuid().optional(),productId:z.string().uuid(),kind:z.enum(['OUT','AUDIT','SUPPLIER_RETURN']),quantity:z.number().int().min(0).max(100000),note:z.string().trim().min(2).max(300)}).parse(req.body);
 const p=await stockTransaction(req,d,async tx=>{const old=await tx.product.findUniqueOrThrow({where:{id:d.productId}});if(d.kind!=='AUDIT'&&d.quantity===0)throw new Error('Enter a positive quantity.');const delta=d.kind==='AUDIT'?d.quantity-old.quantity:-d.quantity;if(old.quantity+delta<0)throw new Error('Stock cannot be negative.');const p=await tx.product.update({where:{id:old.id},data:{quantity:{increment:delta}}});await tx.stockMovement.create({data:{productId:p.id,delta,kind:d.kind,note:d.note,referenceId:d.id,actorId:req.user.id}});return p;});res.json(safeProduct(p,req.user.role));
}));
app.post('/api/stock/in',route(async(req,res)=>{
 const d=z.object({id:z.string().uuid().optional(),supplierId:z.string().uuid().nullable().optional(),reference:z.string().max(100),items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(100000),unitCost:z.number().int().min(0).max(1000000000).optional()})).min(1).max(200)}).parse(req.body);
 const purchase=await stockTransaction(req,d,async tx=>{let total=0;const items=[];for(const i of d.items){const old=await tx.product.findUniqueOrThrow({where:{id:i.productId}});const unitCost=req.user.role==='OWNER'?(i.unitCost??old.purchasePrice):old.purchasePrice;total+=unitCost*i.quantity;if(!Number.isSafeInteger(total)||total>1000000000)throw new Error('Stock entry is too large.');if(req.user.role==='OWNER'&&i.unitCost!==undefined&&!old.costKnown&&old.quantity>0)throw new Error('Add the missing purchase cost in Products before receiving more stock.');await tx.product.update({where:{id:i.productId},data:{quantity:{increment:i.quantity},purchasePrice:weightedCost(old.quantity,old.purchasePrice,i.quantity,unitCost),costKnown:old.costKnown||(old.quantity===0&&req.user.role==='OWNER'&&i.unitCost!==undefined)}});await tx.stockMovement.create({data:{productId:i.productId,delta:i.quantity,kind:'PURCHASE',note:d.reference,referenceId:d.id,actorId:req.user.id}});items.push({productId:i.productId,quantity:i.quantity,unitCost});}return tx.purchase.create({data:{supplierId:d.supplierId||null,reference:d.reference,total,items:{create:items}}});});res.status(201).json({id:purchase.id});
}));
app.get('/api/expenses',route(async(req,res)=>res.json(await db.expense.findMany({orderBy:{date:'desc'},take:500}))));
app.post('/api/expenses',route(async(req,res)=>{const data=z.object({category:text,note:z.string().max(300),amount:z.number().int().positive().max(1000000000),day:z.string()}).parse(req.body);const {day,...rest}=data;res.status(201).json(await db.expense.create({data:{...rest,date:new Date(`${day}T12:00:00+05:30`),actorId:req.user.id}}));}));
app.delete('/api/expenses/:id',owner,route(async(req,res)=>{await db.expense.delete({where:{id:req.params.id}});res.json({ok:true});}));
app.get('/api/reports',owner,route(async(req,res)=>res.json(await report(String(req.query.from||indiaDay()),String(req.query.to||indiaDay())))));
app.get('/api/reports/export/:format',owner,route(async(req,res)=>{if(!['xlsx','pdf'].includes(req.params.format))throw new Error('Choose xlsx or pdf.');await exportReport(res,await report(String(req.query.from||indiaDay()),String(req.query.to||indiaDay())),req.params.format);}));
app.get('/api/closing',owner,route(async(req,res)=>{const opening=z.coerce.number().int().min(0).max(1000000000).parse(req.query.opening||0);res.json(await cashClosing(String(req.query.day||indiaDay()),opening));}));
app.post('/api/closing',owner,route(async(req,res)=>{const d=z.object({day:z.string(),opening:z.number().int().nonnegative(),counted:z.number().int().nonnegative(),note:z.string().max(500)}).parse(req.body);const result=await cashClosing(d.day,d.opening);res.status(201).json(await db.closing.upsert({where:{day:d.day},create:{day:d.day,opening:d.opening,expected:result.expected,counted:d.counted,difference:d.counted-result.expected,note:d.note,actorId:req.user.id},update:{opening:d.opening,expected:result.expected,counted:d.counted,difference:d.counted-result.expected,note:d.note,actorId:req.user.id}}));}));
app.get('/api/closings',owner,route(async(req,res)=>res.json(await db.closing.findMany({orderBy:{day:'desc'},take:100}))));
app.post('/api/backups',owner,route(async(req,res)=>res.json({file:await backup()})));
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found.'}));
app.use((err,req,res,next)=>{
 if(res.headersSent)return next(err);
 const status=err instanceof z.ZodError?400:err.code==='P2025'?404:err.code==='P2002'?409:err.code?.startsWith('P')?500:400;
 const message=err instanceof z.ZodError?err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):err.code==='P2002'?'That record already exists.':err.code==='P2025'?'Record not found.':status===500?'Database request failed. Please retry.':err.message;
 if(status===500)console.error(err);res.status(status).json({error:message});
});
