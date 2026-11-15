import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),testRoot=path.join(root,'server','prisma'),dir=mkdtempSync(path.join(testRoot,'alraiyan-test-browser-'));
// Pre-create SQLite files: Prisma's engine can fail on a new file in a synced Windows folder.
writeFileSync(path.join(dir,'browser.db'),'');
const env={...process.env,DATABASE_URL:`file:${path.join(dir,'browser.db').replaceAll('\\','/')}`,JWT_SECRET:'browser-tests-secret-at-least-32-characters',PORT:'3002',OWNER_PASSWORD:'browser-owner-123',STAFF_PASSWORD:'browser-staff-123',SEED_SAMPLE_DATA:'true',BACKUP_DIR:path.join(dir,'backups'),POS_BROWSER_TEST:'true'};
async function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Command failed with exit ${code}`)));});}
try{await run(['node_modules/prisma/build/index.js','db','push','--schema','server/prisma/schema.prisma','--skip-generate']);await run(['server/prisma/seed.js']);await run(['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)]);}catch(e){console.error(e.message);process.exitCode=1;}finally{const resolved=path.resolve(dir);if(resolved.startsWith(path.resolve(testRoot)+path.sep)&&path.basename(resolved).startsWith('alraiyan-test-browser-'))rmSync(resolved,{recursive:true,force:true});}
