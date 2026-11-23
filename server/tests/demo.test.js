import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import request from 'supertest';

const root=fileURLToPath(new URL('../../',import.meta.url));
const testRoot=path.join(root,'server','prisma');
const dir=mkdtempSync(path.join(testRoot,'alraiyan-test-demo-'));
writeFileSync(path.join(dir,'demo.db'),'');
Object.assign(process.env,{
 DATABASE_URL:`file:${path.join(dir,'demo.db').replaceAll('\\','/')}`,
 JWT_SECRET:'demo-tests-only-secret-at-least-32-characters',
 OWNER_PASSWORD:'demo-test-owner-password',STAFF_PASSWORD:'demo-test-staff-password',
 DEMO_MODE:'true',SEED_SAMPLE_DATA:'true',TRUST_PROXY_HOPS:'1'
});
const setup=spawnSync(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'db','push','--schema',path.join(testRoot,'schema.prisma'),'--skip-generate'],{cwd:root,env:process.env,encoding:'utf8',timeout:60000});
if(setup.status!==0)throw new Error(setup.stdout+setup.stderr);
const seed=()=>spawnSync(process.execPath,[path.join(root,'server/prisma/seed.js')],{cwd:root,env:process.env,encoding:'utf8',timeout:60000});
const seeded=seed();
if(seeded.status!==0)throw new Error(seeded.stdout+seeded.stderr);
const {app}=await import('../src/app.js');
const {db}=await import('../src/db.js');
const {checkDemoDatabase,demoShopName}=await import('../src/demo.js');
const login=await request(app).post('/api/auth/login').send({username:'owner',password:process.env.OWNER_PASSWORD});
assert.equal(login.status,200);
const headers={Authorization:`Bearer ${login.body.token}`};
after(async()=>{
 await db.$disconnect();
 const resolved=path.resolve(dir);
 if(resolved.startsWith(path.resolve(testRoot)+path.sep)&&path.basename(resolved).startsWith('alraiyan-test-demo-'))rmSync(resolved,{recursive:true,force:true});
});

test('demo has synthetic data, no real phone numbers, noindex and secret-free public config',async()=>{
 const config=await request(app).get('/api/config');
 assert.deepEqual(config.body,{demoMode:true});
 assert.equal(config.headers['x-robots-tag'],'noindex, nofollow');
 assert.match(config.headers['cache-control'],/no-store/);
 assert.equal((await request(app).get('/api/products')).status,401);
 assert.equal(await db.product.count(),12);
 assert.equal(await db.sale.count(),3);
 assert.equal((await db.setting.findUnique({where:{id:'shop'}})).shopName,demoShopName);
 assert.equal((await db.customer.findFirst()).phone,'0000000001');
 assert.equal((await db.supplier.findFirst()).phone,'0000000000');
 assert.equal((await request(app).get('/api/settings').set(headers)).body.demoMode,true);
});

test('even an owner cannot change shared passwords, users, settings, create contacts or back up credentials',async()=>{
 const original=await db.user.findUnique({where:{username:'owner'}});
 for(const [method,url,body] of [
  ['post','/api/auth/password',{current:process.env.OWNER_PASSWORD,password:'replacement-password'}],
  ['post','/api/users',{name:'Visitor',username:'visitor',password:'visitor-password',role:'OWNER'}],
  ['patch',`/api/users/${original.id}`,{active:false}],
  ['put','/api/SETTINGS/',{shopName:'Changed'}],
  ['post','/api/backups',{}],
  ['post','/api/customers',{name:'Real person',phone:'9876543210'}],
  ['post','/api/suppliers',{name:'Real person',phone:'9876543210'}]
 ]){
  const result=await request(app)[method](url).set(headers).send(body);
  assert.equal(result.status,403,url+': '+JSON.stringify(result.body));
  assert.match(result.body.error,/sample demo/);
 }
 const user=await db.user.findUnique({where:{id:original.id}});
 assert.equal(user.passwordHash,original.passwordHash);
 assert.equal(user.active,true);
 assert.equal(await db.user.count(),2);
 assert.equal(await db.customer.count(),1);
 assert.equal(await db.supplier.count(),1);
});

test('sample checkout, receipt PDF and reports still work behind the hosting proxy',async()=>{
 const product=await db.product.findFirst({where:{barcode:'ARDEMO000001'}});
 const body={id:randomUUID(),items:[{productId:product.id,quantity:1,unitPrice:product.mrp}],discount:0,paymentMode:'CASH',cashTendered:product.mrp,soldAt:new Date().toISOString()};
 const sale=await request(app).post('/api/sales').set(headers).set('X-Forwarded-For','203.0.113.10').send(body);
 assert.equal(sale.status,201,JSON.stringify(sale.body));
 assert.ok(sale.headers['ratelimit']);
 const pdf=await request(app).get(`/api/sales/${sale.body.id}/pdf`).set(headers);
 assert.equal(pdf.status,200);
 assert.match(pdf.headers['content-type'],/pdf/);
 assert.equal((await request(app).get('/api/reports').set(headers)).status,200);
});

test('demo restart preserves sample records, and seeding refuses an existing unmarked shop database',async()=>{
 const before=await db.sale.count();
 const again=seed();
 assert.equal(again.status,0,again.stderr);
 assert.equal(await db.product.count(),12);
 assert.equal(await db.sale.count(),before);
 await db.setting.update({where:{id:'shop'},data:{shopName:'Existing real shop'}});
 try{
  await assert.rejects(checkDemoDatabase(db),/new empty database/);
  const refused=seed();
  assert.equal(refused.status,1);
  assert.match(refused.stderr,/new empty database/);
  assert.equal(await db.sale.count(),before);
 }finally{
  await db.setting.update({where:{id:'shop'},data:{shopName:demoShopName}});
 }
});
