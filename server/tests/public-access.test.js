import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import request from 'supertest';

const serverDir=fileURLToPath(new URL('../',import.meta.url));
const testRoot=path.join(serverDir,'prisma');
const dir=mkdtempSync(path.join(testRoot,'alraiyan-test-open-'));
writeFileSync(path.join(dir,'open.db'),'');
process.env.DATABASE_URL=`file:${path.join(dir,'open.db').replaceAll('\\','/')}`;
process.env.JWT_SECRET='public-access-test-secret-at-least-32-characters';
process.env.PUBLIC_ACCESS='true';
const cli=fileURLToPath(new URL('../../node_modules/prisma/build/index.js',import.meta.url));
const setup=spawnSync(process.execPath,[cli,'db','push','--schema',path.join(serverDir,'prisma/schema.prisma'),'--skip-generate'],{cwd:path.resolve(serverDir,'..'),env:process.env,encoding:'utf8'});
if(setup.status!==0)throw new Error(setup.stdout+setup.stderr);
const {app}=await import('../src/app.js');
const {db}=await import('../src/db.js');
let owner;

before(async()=>{
 await db.setting.create({data:{id:'shop'}});
 owner=await db.user.create({data:{name:'Shop Owner',username:'owner',passwordHash:'not-sent-to-browser',role:'OWNER'}});
});
after(async()=>{
 await db.$disconnect();
 const resolved=path.resolve(dir);
 if(resolved.startsWith(path.resolve(testRoot)+path.sep)&&path.basename(resolved).startsWith('alraiyan-test-open-'))rmSync(resolved,{recursive:true,force:true});
});

test('opening the shop provides its existing owner identity without passwords or tokens',async()=>{
 const response=await request(app).get('/api/auth/session');
 assert.equal(response.status,200);
 assert.deepEqual(response.body,{publicAccess:true,user:{id:owner.id,name:'Shop Owner',role:'OWNER'}});
 assert.equal((await request(app).get('/api/auth/me')).body.id,owner.id);
 assert.equal((await request(app).get('/api/products').set('Authorization','Bearer stale-token')).status,200);
});

test('a visitor can save stock and bill without signing in, using the actual owner for the audit trail',async()=>{
 const product=await request(app).post('/api/products').send({name:'Open shop sandal',brand:'VKC',category:'Sandals',size:'8',color:'Black',mrp:59900,purchasePrice:30000,quantity:2});
 assert.equal(product.status,201);
 const payload={id:randomUUID(),items:[{productId:product.body.id,quantity:1,unitPrice:45000}],discount:0,paymentMode:'CASH',cashTendered:50000,soldAt:new Date().toISOString()};
 const sale=await request(app).post('/api/sales').send(payload);
 assert.equal(sale.status,201,JSON.stringify(sale.body));
 assert.equal(sale.body.total,45000);
 assert.equal((await request(app).get('/api/sales/'+sale.body.id)).status,200);
 assert.equal((await db.product.findUnique({where:{id:product.body.id}})).quantity,1);
 assert.equal((await db.stockMovement.findFirst({where:{productId:product.body.id,kind:'SALE'}})).actorId,owner.id);
 assert.equal((await request(app).get('/api/reports')).status,200);
});

test('account and password controls cannot alter accounts in the shop without sign-in',async()=>{
 for(const [method,url] of [['get','/api/users'],['post','/api/users'],['patch','/api/users/'+owner.id],['post','/api/auth/password']]){
  assert.equal((await request(app)[method](url).send({})).status,403);
 }
 assert.equal((await db.user.findUnique({where:{id:owner.id}})).active,true);
});
