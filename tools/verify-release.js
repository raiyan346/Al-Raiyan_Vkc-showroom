import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const sha=process.argv[2];if(!/^[a-f0-9]{40}$/.test(sha||''))throw new Error('Pass the full tested Git commit SHA.');
const demo=process.env.DEMO_BASE_URL||'https://vkc-showroom-demo.onrender.com';
const production=process.env.PRODUCTION_BASE_URL||'https://al-raiyan-vkc-showroom.onrender.com';
let cookie='',csrf='';
async function call(base,path,body){const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf,Origin:base}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const set=r.headers.getSetCookie();if(set.length)cookie=set.map(s=>s.split(';')[0]).join('; ');return r;}
const config=await(await call(demo,'/config')).json();assert.equal(config.demoMode,true);assert.equal(config.release,sha);
const start=await(await call(demo,'/auth/session')).json();csrf=start.csrfToken;assert.equal(start.authenticated,false);
const login=await(await call(demo,'/auth/demo',{})).json();csrf=login.csrfToken;assert.equal(login.authenticated,true);assert.equal(login.token,undefined);assert.equal(login.user.role,'STAFF');
const privateFields=new Set(['cipher','purchasePrice','costKnown','costCode','unitCost','cost','profit','netProfit','belowCost','inventoryValue','loss','passwordHash']);
function noSecrets(value){if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){assert.ok(!privateFields.has(key),`Demo must not expose ${key}`);noSecrets(item);}}
async function safeGet(path){const response=await call(demo,path);assert.equal(response.status,200,path);const data=await response.json();noSecrets(data);return data;}
const products=await safeGet('/products');assert.ok(products.length>0);
for(const path of ['/settings','/products?all=true','/sales','/customers','/suppliers','/stock/movements','/expenses','/auth/me'])await safeGet(path);
const articles=await safeGet('/articles');for(const article of articles)await safeGet('/articles/'+article.id);
const sales=await safeGet('/sales');for(const sale of sales){await safeGet('/sales/'+sale.id);if(sale.customerId)await safeGet('/customers/'+sale.customerId+'/history');}
const suppliers=await safeGet('/suppliers');for(const supplier of suppliers)await safeGet('/suppliers/'+supplier.id+'/purchases');
for(const path of ['/reports','/reports/export/pdf','/reports/export/xlsx','/closing','/closings','/users','/backups/private.json'])assert.equal((await call(demo,path)).status,403,path);
for(const path of ['/labels','/cost-code/decode','/backups','/auth/password'])assert.equal((await call(demo,path,{})).status,403,path);
const settingsWrite=await fetch(demo+'/api/settings',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,Origin:demo},body:'{}'});assert.equal(settingsWrite.status,403);
assert.equal((await call(production,'/products')).status,401,'Demo cookie must not authorize production');
const resolved=await(await call(demo,'/barcodes/resolve?value='+encodeURIComponent(products[0].barcode))).json();assert.equal(resolved.status,'UNIQUE');
noSecrets(resolved);
await call(demo,'/auth/logout',{});
mkdirSync('.artifacts',{recursive:true});
writeFileSync(`.artifacts/release-${sha}.json`,JSON.stringify({commit:sha,verifiedAt:new Date().toISOString(),demo,production,checks:['Staff-only demo login','no confidential fields across catalogue, articles, sales, customers, suppliers and settings','barcode','Owner financial and cipher endpoint restrictions','backup restriction','cross-environment session rejection']},null,2));
console.log(`Verified demo commit ${sha}. Before production promotion: download a private backup, set PRODUCTION_APPROVED_COMMIT to this SHA in Render, then use Manual Deploy → Deploy a specific commit with exactly this SHA. Never use a different or newer SHA.`);
