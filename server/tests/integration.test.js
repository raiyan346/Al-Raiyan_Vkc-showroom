import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import request from 'supertest';
import bcrypt from 'bcryptjs';
const serverDir=fileURLToPath(new URL('../',import.meta.url));
const testRoot=path.join(serverDir,'prisma');
const dir=mkdtempSync(path.join(testRoot,'alraiyan-test-'));
writeFileSync(path.join(dir,'test.db'),'');
process.env.DATABASE_URL=`file:${path.join(dir,'test.db').replaceAll('\\','/')}`;
process.env.JWT_SECRET='integration-test-secret-at-least-32-characters';
const cli=fileURLToPath(new URL('../../node_modules/prisma/build/index.js',import.meta.url));
const setup=spawnSync(process.execPath,[cli,'db','push','--schema',path.join(serverDir,'prisma/schema.prisma'),'--skip-generate'],{cwd:path.resolve(serverDir,'..'),env:{...process.env,RUST_LOG:'info'},encoding:'utf8'});
if(setup.status!==0)throw new Error(setup.stdout+setup.stderr);
const {app}=await import('../src/app.js');const {db}=await import('../src/db.js');
let ownerToken,staffToken,owner,product,customer;
const auth=(token)=>({Authorization:`Bearer ${token}`});
const payload=(p,overrides={})=>({id:randomUUID(),items:[{productId:p.id,quantity:2,unitPrice:45000}],discount:10000,paymentMode:'CASH',cashTendered:100000,soldAt:new Date().toISOString(),...overrides});
before(async()=>{
 await db.setting.create({data:{id:'shop'}});
 const passwordHash=await bcrypt.hash('test-password-123',4);
 owner=await db.user.create({data:{name:'Owner',username:'owner',passwordHash,role:'OWNER'}});
 await db.user.create({data:{name:'Staff',username:'staff',passwordHash,role:'STAFF'}});
 product=await db.product.create({data:{name:'VKC Sandal',brand:'VKC',category:'Sandals',size:'8',color:'Brown',mrp:59900,purchasePrice:30000,quantity:50,barcode:'TEST0001'}});
 customer=await db.customer.create({data:{name:'Customer',phone:'9876543210'}});
 ownerToken=(await request(app).post('/api/auth/login').send({username:'owner',password:'test-password-123'})).body.token;
 staffToken=(await request(app).post('/api/auth/login').send({username:'staff',password:'test-password-123'})).body.token;
});
after(async()=>{await db.$disconnect();const resolved=path.resolve(dir);if(resolved.startsWith(path.resolve(testRoot)+path.sep)&&path.basename(resolved).startsWith('alraiyan-test-'))rmSync(resolved,{recursive:true,force:true});});
test('authentication, role checks and cost confidentiality across product/settings/sale routes',async()=>{
 assert.equal((await request(app).get('/api/products')).status,401);
 for(const route of ['/api/reports','/api/users'])assert.equal((await request(app).get(route).set(auth(staffToken))).status,403);
 const products=(await request(app).get('/api/products').set(auth(staffToken))).body;
 assert.equal(products[0].purchasePrice,undefined);assert.equal(products[0].costKnown,undefined);
 const settings=(await request(app).get('/api/settings').set(auth(staffToken))).body;assert.equal(settings.cipher,undefined);
 assert.equal((await request(app).post('/api/labels').set(auth(staffToken)).send({ids:[product.id]})).status,403);
 const sale=await request(app).post('/api/sales').set(auth(staffToken)).send(payload(product));assert.equal(sale.status,201,JSON.stringify(sale.body));
 for(const key of ['cost','profit','requestHash'])assert.equal(sale.body[key],undefined);
 assert.equal(sale.body.items[0].unitCost,undefined);
 const history=(await request(app).get('/api/sales').set(auth(staffToken))).body;assert.equal(history[0].items[0].unitCost,undefined);
});
test('negotiated sale is atomic, calculates actual profit, snapshots cost and syncs exactly once',async()=>{
 const initial=(await db.product.findUnique({where:{id:product.id}})).quantity;
 const data=payload(product);const a=await request(app).post('/api/sales').set(auth(ownerToken)).send(data);
 assert.equal(a.status,201,JSON.stringify(a.body));assert.equal(a.body.total,80000);assert.equal(a.body.cost,60000);assert.equal(a.body.profit,20000);
 await db.product.update({where:{id:product.id},data:{purchasePrice:32000}});
 const b=await request(app).post('/api/sales').set(auth(ownerToken)).send(data);assert.equal(b.body.id,a.body.id);assert.equal(b.body.items[0].unitCost,30000);
 assert.equal((await db.product.findUnique({where:{id:product.id}})).quantity,initial-2);
 const altered=await request(app).post('/api/sales').set(auth(ownerToken)).send({...data,discount:0});assert.equal(altered.status,400);
});
test('invalid discount and insufficient stock roll back every stock movement',async()=>{
 const initial=await db.product.findUnique({where:{id:product.id}}),moves=await db.stockMovement.count();
 const bad=await request(app).post('/api/sales').set(auth(ownerToken)).send(payload(product,{discount:999999}));assert.equal(bad.status,400);
 const shortage=await request(app).post('/api/sales').set(auth(ownerToken)).send(payload(product,{items:[{productId:product.id,quantity:1000,unitPrice:10000}],discount:0}));assert.equal(shortage.status,400);
 assert.equal((await db.product.findUnique({where:{id:product.id}})).quantity,initial.quantity);assert.equal(await db.stockMovement.count(),moves);
});
test('concurrent checkout cannot oversell the last pair',async()=>{
 const p=await db.product.create({data:{name:'Last pair',brand:'VKC',category:'Shoes',size:'9',color:'Black',mrp:10000,purchasePrice:5000,quantity:1,barcode:'LASTPAIR'}});
 const responses=await Promise.all(Array.from({length:2},()=>request(app).post('/api/sales').set(auth(ownerToken)).send(payload(p,{items:[{productId:p.id,quantity:1,unitPrice:10000}],discount:0}))));
 assert.equal(responses.filter(r=>r.status===201).length,1,JSON.stringify(responses.map(r=>r.body)));assert.equal((await db.product.findUnique({where:{id:p.id}})).quantity,0);
});
test('credit collections and returns adjust balance, stock and refunds without double posting',async()=>{
 const created=await request(app).post('/api/sales').set(auth(ownerToken)).send(payload(product,{customerId:customer.id,paymentMode:'CREDIT'}));assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.id,line=created.body.items[0];
 const payment={id:randomUUID(),amount:50000,mode:'CASH'};
 for(let i=0;i<2;i++){const r=await request(app).post(`/api/customers/${customer.id}/payments`).set(auth(staffToken)).send(payment);assert.equal(r.status,201,JSON.stringify(r.body));}
 assert.equal((await db.sale.findUnique({where:{id}})).creditDue,30000);
 const ret={id:randomUUID(),items:[{saleItemId:line.id,quantity:1}],reason:'Wrong size',refundMode:'CASH'};
 const first=await request(app).post(`/api/sales/${id}/returns`).set(auth(staffToken)).send(ret);assert.equal(first.status,201,JSON.stringify(first.body));assert.equal(first.body.total,40000);assert.equal(first.body.creditReduction,30000);assert.equal(first.body.refund,10000);assert.equal(first.body.cost,undefined);
 const repeat=await request(app).post(`/api/sales/${id}/returns`).set(auth(staffToken)).send(ret);assert.equal(repeat.body.id,first.body.id);
 assert.equal((await db.saleItem.findUnique({where:{id:line.id}})).returned,1);
 const excessive=await request(app).post(`/api/sales/${id}/returns`).set(auth(ownerToken)).send({...ret,id:randomUUID(),items:[{saleItemId:line.id,quantity:2}]});assert.equal(excessive.status,400);
});
test('staff can manage products and stock without reading or altering costs; owner labels use edited cipher',async()=>{
 const p=await request(app).post('/api/products').set(auth(staffToken)).send({name:'New product',brand:'VKC',category:'Sandals',size:'9',color:'Brown',mrp:50000,purchasePrice:1,quantity:1});assert.equal(p.status,201);assert.equal(p.body.purchasePrice,undefined);
 const stored=await db.product.findUnique({where:{id:p.body.id}});assert.equal(stored.purchasePrice,0);assert.equal(stored.costKnown,false);
 const stock=await request(app).post('/api/stock/in').set(auth(staffToken)).send({reference:'Supplier stock',items:[{productId:product.id,quantity:3,unitCost:1}]});assert.equal(stock.status,201);
 assert.equal((await db.product.findUnique({where:{id:product.id}})).purchasePrice,32000);
 const labels=await request(app).post('/api/labels').set(auth(ownerToken)).send({ids:[product.id]});assert.equal(labels.body.products[0].costCode,'HIA');
});
test('CSV import validates all rows before committing; dry-run writes nothing',async()=>{
 const content='name,brand,category,size,color,mrp,purchasePrice,quantity\nImported,VKC,Shoes,8,Black,599,300,2';const before=await db.product.count();
 const preview=await request(app).post('/api/products/import').set(auth(ownerToken)).send({format:'csv',content});assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(await db.product.count(),before);
 const bad=await request(app).post('/api/products/import').set(auth(ownerToken)).send({format:'csv',content:content+'\nInvalid,VKC,Shoes,9,Black,bad,100,2',confirm:true});assert.equal(bad.status,400);assert.equal(await db.product.count(),before);
 const good=await request(app).post('/api/products/import').set(auth(ownerToken)).send({format:'csv',content,confirm:true});assert.equal(good.status,201);assert.equal(good.body[0].mrp,59900);
});
test('staff receipts and PDFs contain selling amounts and never purchase costs or cost codes',async()=>{
 const sale=await request(app).post('/api/sales').set(auth(staffToken)).send(payload(product));assert.equal(sale.status,201);
 const pdf=await request(app).get(`/api/sales/${sale.body.id}/pdf`).set(auth(staffToken));assert.equal(pdf.status,200);assert.match(pdf.headers['content-type'],/pdf/);assert.ok(pdf.body.length>100);
 const json=JSON.stringify(sale.body);assert.ok(!/purchasePrice|unitCost|costCode|profit|cipher/.test(json));
});
test('owner reports reconcile costs, returns and expenses in paise',async()=>{
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 await db.expense.create({data:{category:'Tea',note:'test',amount:5000,actorId:owner.id}});
 const r=await request(app).get(`/api/reports?from=${day}&to=${day}`).set(auth(ownerToken));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.netProfit,r.body.sales-r.body.cost-r.body.expenses);
 const sales=await db.sale.aggregate({_sum:{total:true,cost:true}}),returns=await db.return.aggregate({_sum:{total:true,cost:true}});
 assert.equal(r.body.sales,sales._sum.total-returns._sum.total);assert.equal(r.body.cost,sales._sum.cost-returns._sum.cost);
 const closing=await request(app).get(`/api/closing?day=${day}&opening=10000`).set(auth(ownerToken));assert.equal(closing.status,200);assert.equal(closing.body.expected,10000+closing.body.cashSales+closing.body.collections-closing.body.refunds-closing.body.expenses);
});
test('stock receipts and returns use weighted costs while existing bill cost remains fixed',async()=>{
 const p=await db.product.create({data:{name:'Weighted sandal',brand:'VKC',category:'Sandals',size:'10',color:'Black',mrp:50000,purchasePrice:20000,quantity:10,barcode:'WEIGHTED01'}});
 let r=await request(app).post('/api/stock/in').set(auth(ownerToken)).send({reference:'New purchase',items:[{productId:p.id,quantity:10,unitCost:30000}]});assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal((await db.product.findUnique({where:{id:p.id}})).purchasePrice,25000);
 const sale=await request(app).post('/api/sales').set(auth(ownerToken)).send(payload(p,{items:[{productId:p.id,quantity:1,unitPrice:50000}],discount:0}));assert.equal(sale.status,201);assert.equal(sale.body.cost,25000);
 await request(app).post('/api/stock/in').set(auth(ownerToken)).send({reference:'Later purchase',items:[{productId:p.id,quantity:10,unitCost:40000}]});
 assert.equal((await db.sale.findUnique({where:{id:sale.body.id}})).cost,25000);
 const before=await db.product.findUnique({where:{id:p.id}}),returnId=randomUUID();
 const data={id:returnId,reason:'Size exchange',refundMode:'CASH',items:[{saleItemId:sale.body.items[0].id,quantity:1}]};
 r=await request(app).post(`/api/sales/${sale.body.id}/returns`).set(auth(ownerToken)).send(data);assert.equal(r.status,201,JSON.stringify(r.body));
 const updated=await db.product.findUnique({where:{id:p.id}});assert.equal(updated.purchasePrice,Math.round((before.quantity*before.purchasePrice+25000)/(before.quantity+1)));
 const changed=await request(app).post(`/api/sales/${sale.body.id}/returns`).set(auth(ownerToken)).send({...data,reason:'Different reason'});assert.equal(changed.status,400);
});
test('backup restores all records atomically into an empty database and refuses overwrite',async()=>{
 process.env.BACKUP_DIR=path.join(dir,'backups');
 const {backup}=await import('../src/backup.js');const name=await backup();const filename=path.join(dir,'backups',name);const snapshot=JSON.parse(readFileSync(filename,'utf8'));
 assert.equal(snapshot.version,1);assert.equal(snapshot.sale.length,await db.sale.count());
 const restoredFile=path.join(dir,'restored.db');writeFileSync(restoredFile,'');
 const env={...process.env,DATABASE_URL:`file:${restoredFile.replaceAll('\\','/')}`};
 const root=path.resolve(serverDir,'..');
 const setup=spawnSync(process.execPath,[cli,'db','push','--schema',path.join(serverDir,'prisma/schema.prisma'),'--skip-generate'],{cwd:root,env,encoding:'utf8',timeout:60000});assert.equal(setup.status,0,setup.stderr);
 const restore=()=>spawnSync(process.execPath,[path.join(serverDir,'scripts/restore.js'),filename,'--confirm-empty-database'],{cwd:root,env,encoding:'utf8',timeout:60000});
 const first=restore();assert.equal(first.status,0,first.stderr);
 const {PrismaClient}=await import('@prisma/client');const restored=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
 try{assert.equal(await restored.sale.count(),snapshot.sale.length);assert.equal(await restored.return.count(),snapshot.return.length);assert.equal(await restored.payment.count(),snapshot.payment.length);const second=restore();assert.equal(second.status,1);assert.match(second.stderr,/empty database/);assert.equal(await restored.sale.count(),snapshot.sale.length);}finally{await restored.$disconnect();}
});
