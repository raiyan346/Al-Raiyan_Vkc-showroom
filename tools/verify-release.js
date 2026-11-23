import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const sha=process.argv[2];if(!/^[a-f0-9]{40}$/.test(sha||''))throw new Error('Pass the full tested Git commit SHA.');
const demo=process.env.DEMO_BASE_URL||'https://vkc-showroom-demo.onrender.com';
const production=process.env.PRODUCTION_BASE_URL||'https://al-raiyan-vkc-showroom.onrender.com';
let cookie='',csrf='';
async function call(base,path,body){const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf,Origin:base}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});const set=r.headers.getSetCookie();if(set.length)cookie=set.map(s=>s.split(';')[0]).join('; ');return r;}
const config=await(await call(demo,'/config')).json();assert.equal(config.demoMode,true);assert.equal(config.release,sha);
const start=await(await call(demo,'/auth/session')).json();csrf=start.csrfToken;assert.equal(start.authenticated,false);
const login=await(await call(demo,'/auth/demo',{})).json();csrf=login.csrfToken;assert.equal(login.authenticated,true);assert.equal(login.token,undefined);
const products=await(await call(demo,'/products')).json();assert.ok(products.length>0);assert.equal((await call(demo,'/reports')).status,200);assert.equal((await call(demo,'/backups')).status,403);
assert.equal((await call(production,'/products')).status,401,'Demo cookie must not authorize production');
const resolved=await(await call(demo,'/barcodes/resolve?value='+encodeURIComponent(products[0].barcode))).json();assert.equal(resolved.status,'UNIQUE');
await call(demo,'/auth/logout',{});
mkdirSync('.artifacts',{recursive:true});
writeFileSync(`.artifacts/release-${sha}.json`,JSON.stringify({commit:sha,verifiedAt:new Date().toISOString(),demo,production,checks:['demo login','catalogue','barcode','reports','backup restriction','cross-environment session rejection']},null,2));
console.log(`Verified demo commit ${sha}. Before production promotion: download a private backup, set PRODUCTION_APPROVED_COMMIT to this SHA in Render, then use Manual Deploy → Deploy a specific commit with exactly this SHA. Never use a different or newer SHA.`);
