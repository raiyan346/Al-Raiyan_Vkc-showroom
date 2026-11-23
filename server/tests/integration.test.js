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
process.env.PUBLIC_ACCESS='false';
const cli=fileURLToPath(new URL('../../node_modules/prisma/build/index.js',import.meta.url));
const setup=spawnSync(process.execPath,[cli,'db','push','--schema',path.join(serverDir,'prisma/schema.prisma'),'--skip-generate'],{cwd:path.resolve(serverDir,'..'),env:{...process.env,RUST_LOG:'info'},encoding:'utf8'});
if(setup.status!==0)throw new Error(setup.stdout+setup.stderr);
const {app}=await import('../src/app.js');const {db}=await import('../src/db.js');
let ownerToken,staffToken,owner,product,customer;
const auth=(session)=>({Cookie:session.cookie,'X-CSRF-Token':session.csrf,Origin:'http://localhost:5173'});
async function login(username){const agent=request.agent(app);const pre=await agent.get('/api/auth/session');const response=await agent.post('/api/auth/login').set({'X-CSRF-Token':pre.body.csrfToken,Origin:'http://localhost:5173'}).send({username,password:'test-password-123'});assert.equal(response.status,200);return {cookie:response.headers['set-cookie'].map(c=>c.split(';')[0]).join('; '),csrf:response.body.csrfToken};}
const payload=(p,overrides={})=>({id:randomUUID(),items:[{productId:p.id,quantity:2,unitPrice:45000}],discount:10000,paymentMode:'CASH',cashTendered:100000,soldAt:new Date().toISOString(),...overrides});
before(async()=>{
 await db.setting.create({data:{id:'shop'}});
 const passwordHash=await bcrypt.hash('test-password-123',4);
 owner=await db.user.create({data:{name:'Owner',username:'owner',passwordHash,role:'OWNER'}});
 await db.user.create({data:{name:'Staff',username:'staff',passwordHash,role:'STAFF'}});
 product=await db.product.create({data:{name:'VKC Sandal',brand:'VKC',category:'Sandals',size:'8',color:'Brown',mrp:59900,purchasePrice:30000,quantity:50,barcode:'TEST0001'}});
 customer=await db.customer.create({data:{name:'Customer',phone:'9876543210'}});
 ownerToken=await login('owner');
 staffToken=await login('staff');
});
after(async()=>{await db.$disconnect();const resolved=path.resolve(dir);if(resolved.startsWith(path.resolve(testRoot)+path.sep)&&path.basename(resolved).startsWith('alraiyan-test-'))rmSync(resolved,{recursive:true,force:true});});
test('authentication, role checks and cost confidentiality across product/settings/sale routes',async()=>{
 assert.equal((await request(app).get('/api/auth/session')).body.authenticated,false);
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

let footwear;
const articleInput=()=>({id:randomUUID(),brand:'Walkaroo',articleNumber:'W5687',name:'Walkaroo Daily Sandal',category:"Men's Sandals",gender:'Men',sizeSystem:'UK/India',notes:'Real manufacturer details entered by shop',barcodes:[{value:'W5687-SHARED',format:'CODE128',type:'MANUFACTURER'}],variants:[6,7,8,9,10,11,12].map(size=>({size:String(size),color:'BLACK',mrp:59900,sellingPrice:45000,purchasePrice:30000,quantity:5,minimumStock:2,barcodes:[{value:'W5687-'+size,format:'CODE128',type:'MANUFACTURER'},...(size===9?[{value:'0036000291452',format:'EAN13',type:'ALIAS'}]:[])]}))});
test('article W5687 persists seven sizes, unique internal SKUs and real/shared manufacturer mappings',async()=>{
 const input=articleInput();const a=await request(app).post('/api/articles').set(auth(ownerToken)).send(input);assert.equal(a.status,201,JSON.stringify(a.body));
 const repeat=await request(app).post('/api/articles').set(auth(ownerToken)).send(input);assert.equal(repeat.body.id,a.body.id);
 const detail=await request(app).get('/api/articles/'+a.body.id).set(auth(ownerToken));assert.equal(detail.status,200);footwear=detail.body;
 assert.equal(footwear.variants.length,7);assert.equal(new Set(footwear.variants.map(v=>v.internalSku)).size,7);assert.equal(footwear.variants.reduce((s,v)=>s+v.quantity,0),35);
 const duplicate=await request(app).post('/api/articles').set(auth(ownerToken)).send({...input,id:randomUUID()});assert.equal(duplicate.status,400);
 assert.equal(await db.article.count({where:{articleNumber:'W5687'}}),1);
});
test('barcode endpoint resolves exact sizes, aliases with leading zeros, shared choices and unknown codes',async()=>{
 for(const [code,size] of [['W5687-6','6'],['W5687-9','9'],['036000291452','9'],['0036000291452','9']]){
  const r=await request(app).get('/api/barcodes/resolve').query({value:code}).set(auth(staffToken));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'UNIQUE');assert.equal(r.body.variants[0].size,size);assert.equal(r.body.variants[0].purchasePrice,undefined);
 }
 const shared=await request(app).get('/api/barcodes/resolve').query({value:'W5687-SHARED'}).set(auth(ownerToken));assert.equal(shared.body.status,'CHOOSE_VARIANT');assert.equal(shared.body.variants.length,7);
 const unknown=await request(app).get('/api/barcodes/resolve?value=NEVER-REGISTERED').set(auth(ownerToken));assert.equal(unknown.body.status,'UNKNOWN');
});
test('receive size 8 exactly once, sell size 9 exactly once and restore its original-cost return',async()=>{
 const eight=footwear.variants.find(v=>v.size==='8'),nine=footwear.variants.find(v=>v.size==='9');
 const stock={id:randomUUID(),reference:'Supplier entry W5687',items:[{productId:eight.id,quantity:2,unitCost:40000}]};
 for(let i=0;i<2;i++){const r=await request(app).post('/api/stock/in').set(auth(ownerToken)).send(stock);assert.equal(r.status,201,JSON.stringify(r.body));}
 assert.equal((await db.product.findUnique({where:{id:eight.id}})).quantity,7);assert.equal((await db.product.findUnique({where:{id:nine.id}})).quantity,5);
 assert.equal(await db.stockMovement.count({where:{referenceId:stock.id}}),1);
 const input=payload(nine,{items:[{productId:nine.id,quantity:1,unitPrice:45000}],discount:1000});
 const sale=await request(app).post('/api/sales').set(auth(ownerToken)).send(input);assert.equal(sale.status,201,JSON.stringify(sale.body));await request(app).post('/api/sales').set(auth(ownerToken)).send(input);
 assert.equal(sale.body.cost,30000);assert.equal(sale.body.profit,14000);assert.equal(sale.body.items[0].brandSnapshot,'Walkaroo');assert.equal(sale.body.items[0].articleSnapshot,'W5687');
 assert.equal((await db.product.findUnique({where:{id:nine.id}})).quantity,4);assert.equal((await db.product.findUnique({where:{id:eight.id}})).quantity,7);
 const ret=await request(app).post('/api/sales/'+sale.body.id+'/returns').set(auth(ownerToken)).send({id:randomUUID(),reason:'Size return',refundMode:'CASH',items:[{saleItemId:sale.body.items[0].id,quantity:1}]});assert.equal(ret.status,201);assert.equal((await db.product.findUnique({where:{id:nine.id}})).quantity,5);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());const r=await request(app).get('/api/reports').query({from:day,to:day}).set(auth(ownerToken));assert.equal(r.body.netProfit,r.body.sales-r.body.cost-r.body.expenses);assert.equal(r.body.profitByArticle.find(a=>a.name==='Walkaroo / W5687').profit,0);
});
test('missing sizes and non-numeric sizes can be added without rewriting existing stock or historical bills',async()=>{
 const article=await db.article.findUnique({where:{id:footwear.id}});
 const input={...articleInput(),articleId:footwear.id,variants:[{size:'XL',color:'BLUE',mrp:69900,sellingPrice:60000,purchasePrice:35000,quantity:3,minimumStock:1}]};
 const r=await request(app).post('/api/articles').set(auth(ownerToken)).send(input);assert.equal(r.status,201,JSON.stringify(r.body));
 const detail=(await request(app).get('/api/articles/'+footwear.id).set(auth(ownerToken))).body;assert.equal(detail.variants.length,8);assert.equal(detail.variants.find(v=>v.size==='XL').quantity,3);
 const bad={...input,id:randomUUID(),variants:[{...input.variants[0],size:'S',barcodes:[{value:'4006381333932',format:'EAN13'}]}]};assert.equal((await request(app).post('/api/articles').set(auth(ownerToken)).send(bad)).status,400);assert.equal(await db.product.count({where:{articleId:footwear.id}}),8);
});
test('supplier returns and audited adjustments are transactional, idempotent and never make stock negative',async()=>{
 const nine=footwear.variants.find(v=>v.size==='9');const body={id:randomUUID(),productId:nine.id,kind:'SUPPLIER_RETURN',quantity:1,note:'Returned damaged pair to supplier'};
 for(let i=0;i<2;i++)assert.equal((await request(app).post('/api/stock/adjust').set(auth(staffToken)).send(body)).status,200);
 assert.equal((await db.product.findUnique({where:{id:nine.id}})).quantity,4);assert.equal(await db.stockMovement.count({where:{referenceId:body.id}}),1);
 assert.equal((await request(app).post('/api/stock/adjust').set(auth(ownerToken)).send({...body,id:randomUUID(),quantity:99})).status,400);assert.equal((await db.product.findUnique({where:{id:nine.id}})).quantity,4);
});

test('linking legacy stock preserves variant ID, quantity, cost, barcode and historical bill snapshots',async()=>{
 const legacy=(await request(app).post('/api/products').set(auth(ownerToken)).send({name:'Old sandal',brand:'Walkaroo',category:'Sandals',size:'S',color:'Red',mrp:40000,purchasePrice:25000,quantity:4})).body;
 const sold=await request(app).post('/api/sales').set(auth(ownerToken)).send(payload(legacy,{items:[{productId:legacy.id,quantity:1,unitPrice:35000}],discount:0}));assert.equal(sold.status,201);
 const before=await db.product.findUnique({where:{id:legacy.id}});
 const linked=await request(app).post('/api/articles/'+footwear.id+'/attach-variant').set(auth(ownerToken)).send({variantId:legacy.id});assert.equal(linked.status,200,JSON.stringify(linked.body));
 const after=await db.product.findUnique({where:{id:legacy.id}});assert.equal(after.articleId,footwear.id);for(const key of ['id','quantity','purchasePrice','barcode','mrp'])assert.equal(after[key],before[key]);
 const history=await db.saleItem.findUnique({where:{id:sold.body.items[0].id}});assert.equal(history.name,'Old sandal');assert.equal(history.articleSnapshot,'');assert.equal(history.unitCost,25000);
});
test('only owners can download private backups and filenames cannot escape the backup directory',async()=>{
 process.env.BACKUP_DIR=path.join(dir,'backups');
 const saved=await request(app).post('/api/backups').set(auth(ownerToken)).send({});
 assert.equal(saved.status,200);
 const url='/api/backups/'+encodeURIComponent(saved.body.file);
 assert.equal((await request(app).get(url)).status,401);
 assert.equal((await request(app).get(url).set(auth(staffToken))).status,403);
 const downloaded=await request(app).get(url).set(auth(ownerToken));
 assert.equal(downloaded.status,200);
 assert.match(downloaded.headers['content-disposition'],/attachment/);
 assert.match(downloaded.headers['content-type'],/application\/octet-stream/);
 assert.equal(downloaded.headers['cache-control'],'no-store');
 const snapshot=JSON.parse(downloaded.body.toString('utf8'));
 assert.equal(snapshot.version,2);
 assert.equal(snapshot.user.length,await db.user.count());
 assert.equal((await request(app).get('/api/backups/'+encodeURIComponent('../.env')).set(auth(ownerToken))).status,400);
});

test('backup restores all records atomically into an empty database and refuses overwrite',async()=>{
 process.env.BACKUP_DIR=path.join(dir,'backups');
 const {backup}=await import('../src/backup.js');const name=await backup();const filename=path.join(dir,'backups',name);const snapshot=JSON.parse(readFileSync(filename,'utf8'));
 assert.equal(snapshot.version,2);assert.equal(snapshot.sale.length,await db.sale.count());
 const restoredFile=path.join(dir,'restored.db');writeFileSync(restoredFile,'');
 const env={...process.env,DATABASE_URL:`file:${restoredFile.replaceAll('\\','/')}`};
 const root=path.resolve(serverDir,'..');
 const setup=spawnSync(process.execPath,[cli,'db','push','--schema',path.join(serverDir,'prisma/schema.prisma'),'--skip-generate'],{cwd:root,env,encoding:'utf8',timeout:60000});assert.equal(setup.status,0,setup.stderr);
 const restore=()=>spawnSync(process.execPath,[path.join(serverDir,'scripts/restore.js'),filename,'--confirm-empty-database'],{cwd:root,env,encoding:'utf8',timeout:60000});
 const first=restore();assert.equal(first.status,0,first.stderr);
 const {PrismaClient}=await import('@prisma/client');const restored=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
 try{assert.equal(await restored.sale.count(),snapshot.sale.length);assert.equal(await restored.return.count(),snapshot.return.length);assert.equal(await restored.payment.count(),snapshot.payment.length);const second=restore();assert.equal(second.status,1);assert.match(second.stderr,/empty database/);assert.equal(await restored.sale.count(),snapshot.sale.length);}finally{await restored.$disconnect();}
});

test('cookie sessions reject bearer tokens and CSRF, expire, and are revoked by logout',async()=>{
 assert.equal((await request(app).get('/api/products').set('Authorization','Bearer fake')).status,401);
 assert.equal((await request(app).post('/api/products').set('Cookie',ownerToken.cookie).send({})).status,403);
 assert.equal((await request(app).post('/api/products').set({...auth(ownerToken),Origin:'https://attacker.example'}).send({})).status,403);
 const fresh=await login('owner');
 const probe=await request(app).get('/api/auth/session').set('Cookie',fresh.cookie);assert.equal(probe.body.authenticated,true);assert.equal(probe.body.token,undefined);
 assert.match((await request(app).get('/api/auth/session')).headers['set-cookie'][0],/HttpOnly/);
 assert.equal((await request(app).post('/api/auth/logout').set(auth(fresh)).send({})).status,200);
 assert.equal((await request(app).get('/api/products').set('Cookie',fresh.cookie)).status,401);
 const expired=await login('owner');await db.session.updateMany({where:{userId:owner.id},data:{expiresAt:new Date(0)}});
 assert.equal((await request(app).get('/api/products').set('Cookie',expired.cookie)).status,401);
});
