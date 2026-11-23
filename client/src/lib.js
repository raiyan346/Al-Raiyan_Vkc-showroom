import {get,set,update} from 'idb-keyval';
import {calculateBill} from '@alraiyan/core';
import {withoutDemoSecrets} from './demo-privacy.js';
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((n||0)/100);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let csrfToken='';
export let isDemo=!!session()?.demoMode;
localStorage.removeItem('pos-session');
export function session(){try{const p=JSON.parse(localStorage.getItem('pos-profile'));return p?.user&&new Date(p.expiresAt)>new Date()?p:null;}catch{return null;}}
export function saveProfile(value){localStorage.setItem('pos-profile',JSON.stringify({user:value.user,demoMode:value.demoMode,expiresAt:value.expiresAt}));}
export function clearProfile(){localStorage.removeItem('pos-profile');}
export class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
export async function api(path,options={}){
 let response;try{response=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json','X-CSRF-Token':csrfToken}:{}),...options.headers},signal:AbortSignal.timeout(25000)});}catch{throw new ApiError('Cannot reach the shop server. Your offline bills are safe.',0);}
 if(!response.ok){let data;try{data=await response.json();}catch{data={};}throw new ApiError(data.error||'Request failed. Please try again.',response.status);}
 if(!response.headers.get('content-type')?.includes('json'))return response.blob();
 const data=await response.json();if(data.csrfToken)csrfToken=data.csrfToken;if(typeof data.demoMode==='boolean')isDemo=data.demoMode;return data;
}
export const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
export const key=id=>`pos:${id}`;
export async function readStore(id){const initial={products:[],customers:[],settings:{shopName:'Al-Raiyan VKC Show Room',address:'Tamil Nadu, India',phone:''},pending:[],receipts:[],held:[],draft:[]};if(!isDemo)return(await get(key(id)))||initial;let safe;await update(key(id),state=>safe=withoutDemoSecrets(state||initial));return safe;}
export async function mutateStore(id,fn){let result;await update(key(id),state=>{result=fn(state||{products:[],customers:[],settings:{},pending:[],receipts:[],held:[],draft:[]});return result=isDemo?withoutDemoSecrets(result):result;});return result;}
export async function cachedRefresh(id){const [products,customers,settings]=await Promise.all([api('/products'),api('/customers'),api('/settings')]);return mutateStore(id,s=>({...s,products,customers,settings,lastSync:new Date().toISOString()}));}
export async function syncBills(id){
 const run=async()=>{
  const state=await readStore(id);
  for(const p of state.pending){
   if(p.error)continue;
   try{
    const receipt=await post('/sales',p.payload);
    await mutateStore(id,s=>({...s,pending:s.pending.filter(b=>b.payload.id!==p.payload.id),receipts:[receipt,...s.receipts.filter(r=>r.id!==receipt.id)].slice(0,200)}));
   }catch(e){if(e.status===0||e.status===401||e.status>=500)break;await mutateStore(id,s=>({...s,pending:s.pending.map(b=>b.payload.id===p.payload.id?{...b,error:e.message}:b)}));}
  }
  return cachedRefresh(id).catch(()=>readStore(id));
 };
 return navigator.locks?navigator.locks.request(`sync-${id}`,run):run();
}
export function availableProducts(state){const reserved={};for(const p of state.pending)for(const i of p.payload.items)reserved[i.productId]=(reserved[i.productId]||0)+i.quantity;return state.products.map(p=>({...p,quantity:Math.max(0,p.quantity-(reserved[p.id]||0))}));}
export function draftReceipt(payload,items,customer){const b=calculateBill(items,payload.discount);return {...payload,...b,demoMode:isDemo,number:`OFFLINE-${payload.id.slice(0,8).toUpperCase()}`,createdAt:payload.soldAt,pending:true,customer,creditDue:payload.paymentMode==='CREDIT'?b.total:0,items:b.lines};}
export async function download(path,name){const blob=await api(path);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function whatsapp(phone,text){if(isDemo)return false;const normalized=phone?.replace(/\D/g,'')||'';window.open(`https://wa.me/${normalized?(normalized.length===10?'91':'')+normalized:''}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');}
export function receiptMessage(r,settings){return `${isDemo?'DEMO MODE — SAMPLE DOCUMENT\n':''}${settings.shopName}\nBill ${r.number}${r.pending?' (pending sync)':''}\n${r.items.map(i=>`${i.name} (${i.size}) x ${i.quantity}: ${money(i.unitPrice*i.quantity)}`).join('\n')}\nDiscount: ${money(r.discount)}\nTotal: ${money(r.total)}\nPayment: ${r.paymentMode}\nThank you!`;}
export function beep(){try{const A=window.AudioContext||window.webkitAudioContext;const c=new A();const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=1100;g.gain.value=.06;o.start();o.stop(c.currentTime+.09);o.onended=()=>c.close();}catch{}}
export async function clearPrivateCache(id){await mutateStore(id,s=>({...s,products:[],customers:[],settings:{},receipts:[],draft:[],held:[]}));}
