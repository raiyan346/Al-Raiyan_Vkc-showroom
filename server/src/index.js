import {app} from './app.js';
import express from 'express';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {scheduleBackups} from './backup.js';
import {db} from './db.js';
const frontend=fileURLToPath(new URL('../../client/dist',import.meta.url));
if(existsSync(frontend)){app.use(express.static(frontend));app.get('*',(req,res)=>res.sendFile(frontend+'/index.html'));}
const port=Number(process.env.PORT||3001);const server=app.listen(port,'0.0.0.0',()=>console.log(`Al-Raiyan POS: http://localhost:${port}`));
scheduleBackups();
async function stop(){server.close();await db.$disconnect();process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
