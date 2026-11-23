import {app} from './app.js';
import express from 'express';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:https';
import {fileURLToPath} from 'node:url';
import {scheduleBackups} from './backup.js';
import {db} from './db.js';
const frontend=fileURLToPath(new URL('../../client/dist',import.meta.url));
if(existsSync(frontend)){app.use(express.static(frontend));app.get('*',(req,res)=>res.sendFile(frontend+'/index.html'));}
const port=Number(process.env.PORT||3001);
const tls=process.env.TLS_KEY_PATH&&process.env.TLS_CERT_PATH;
const server=tls?createServer({key:readFileSync(process.env.TLS_KEY_PATH),cert:readFileSync(process.env.TLS_CERT_PATH)},app):app;
const listener=server.listen(port,'0.0.0.0',()=>console.log(`Al-Raiyan POS: ${tls?'https':'http'}://localhost:${port}`));
scheduleBackups();
let stopping=false;
function stop(){if(stopping)return;stopping=true;listener.close(async()=>{await db.$disconnect();process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
