import {mkdir,writeFile,readdir,unlink,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {db} from './db.js';
const tables=['user','setting','product','supplier','purchase','purchaseItem','stockMovement','customer','sale','saleItem','return','returnItem','payment','expense','closing','article','barcode','stockOperation','productChange'];
export function backupFile(name){
 if(!/^alraiyan-[a-zA-Z0-9T.\-]+\.json$/.test(name))throw new Error('Invalid backup filename.');
 return path.join(path.resolve(process.env.BACKUP_DIR||'./backups'),name);
}
export async function backup(){
 const dir=path.resolve(process.env.BACKUP_DIR||'./backups');await mkdir(dir,{recursive:true});
 const data=await db.$transaction(async tx=>{const result={version:2,createdAt:new Date().toISOString()};for(const model of tables)result[model]=await tx[model].findMany();return result;},{isolationLevel:'Serializable',timeout:60000});
 const name=`alraiyan-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.json`;
 await writeFile(path.join(dir,name+'.tmp'),JSON.stringify(data),{mode:0o600});await rename(path.join(dir,name+'.tmp'),path.join(dir,name));
 const old=(await readdir(dir)).filter(n=>/^alraiyan-.*\.json$/.test(n)).sort().slice(0,-30);for(const n of old)await unlink(path.join(dir,n));
 return name;
}
export function scheduleBackups(){
 let last='';const tick=async()=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());if(last===today)return;try{await backup();last=today;console.log('Daily backup saved.');}catch(e){console.error('BACKUP FAILED:',e.message);}};
 tick();const timer=setInterval(tick,60*60000);timer.unref();return timer;
}
