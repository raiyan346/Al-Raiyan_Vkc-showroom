import {get,set,update} from 'idb-keyval';
import {calculateBill} from '@alraiyan/core';
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((n||0)/100);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function session(){try{return JSON.parse(localStorage.getItem('pos-session'));}catch{return null;}}
export class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
export async function api(path,options={}){
 const s=session();let response;try{response=await fetch('/api'+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(s?{Authorization:`Bearer ${s.token}`} : {}),...options.headers},signal:AbortSignal.timeout(25000)});}catch{throw new ApiError('Cannot reach the shop server. Your offline bills are safe.',0);}
 if(!response.ok){let data;try{data=await response.json();}catch{data={};}throw new ApiError(data.error||'Request failed. Please try again.',response.status);}
 return response.headers.get('content-type')?.includes('json')?response.json():response.blob();
}
export const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
export const key=id=>`pos:${id}`;
export const readStore=async id=>(await get(key(id)))||{products:[],customers:[],settings:{shopName:'Al-Raiyan VKC Show Room',address:'Tamil Nadu, India',phone:''},pending:[],receipts:[],held:[],draft:[]};
export async function mutateStore(id,fn){let result;await update(key(id),state=>result=fn(state||{products:[],customers:[],settings:{},pending:[],receipts:[],held:[],draft:[]}));return result;}
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
export function draftReceipt(payload,items,customer){const b=calculateBill(items,payload.discount);return {...payload,...b,number:`OFFLINE-${payload.id.slice(0,8).toUpperCase()}`,createdAt:payload.soldAt,pending:true,customer,creditDue:payload.paymentMode==='CREDIT'?b.total:0,items:b.lines};}
export async function download(path,name){const blob=await api(path);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function whatsapp(phone,text){const normalized=phone?.replace(/\D/g,'')||'';window.open(`https://wa.me/${normalized?(normalized.length===10?'91':'')+normalized:''}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');}
export function receiptMessage(r,settings){return `${settings.shopName}\nBill ${r.number}${r.pending?' (pending sync)':''}\n${r.items.map(i=>`${i.name} (${i.size}) x ${i.quantity}: ${money(i.unitPrice*i.quantity)}`).join('\n')}\nDiscount: ${money(r.discount)}\nTotal: ${money(r.total)}\nPayment: ${r.paymentMode}\nThank you!`;}
export function beep(){try{const A=window.AudioContext||window.webkitAudioContext;const c=new A();const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=1100;g.gain.value=.06;o.start();o.stop(c.currentTime+.09);o.onended=()=>c.close();}catch{}}
export async function clearPrivateCache(id){await mutateStore(id,s=>({...s,products:[],customers:[],settings:{},receipts:[],draft:[],held:[]}));}
