import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),testRoot=path.join(root,'server','prisma'),dir=mkdtempSync(path.join(testRoot,'alraiyan-test-browser-'));
// Pre-create SQLite files: Prisma's engine can fail on a new file in a synced Windows folder.
writeFileSync(path.join(dir,'browser.db'),'');
const https=process.env.POS_TEST_HTTPS==='true';
if(https){
 const openssl=process.env.TEST_OPENSSL_PATH||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
 const cert=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')],{encoding:'utf8'});
 if(cert.status!==0)throw new Error('OpenSSL is needed for HTTPS browser tests. Set TEST_OPENSSL_PATH to its executable.');
}
const env={...process.env,DATABASE_URL:`file:${path.join(dir,'browser.db').replaceAll('\\','/')}`,JWT_SECRET:'browser-tests-secret-at-least-32-characters',PORT:'3002',OWNER_PASSWORD:'browser-owner-123',STAFF_PASSWORD:'browser-staff-123',SEED_SAMPLE_DATA:'true',BACKUP_DIR:path.join(dir,'backups'),POS_BROWSER_TEST:'true',APP_ENV:'development',PUBLIC_ACCESS:'false',APP_BASE_URL:https?'https://127.0.0.1:3002':'http://127.0.0.1:3002'};
if(https)Object.assign(env,{TLS_KEY_PATH:path.join(dir,'key.pem'),TLS_CERT_PATH:path.join(dir,'cert.pem')});else{delete env.TLS_KEY_PATH;delete env.TLS_CERT_PATH;}
async function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Command failed with exit ${code}`)));});}
try{await run(['node_modules/prisma/build/index.js','db','push','--schema','server/prisma/schema.prisma','--skip-generate']);await run(['server/prisma/seed.js']);await run(['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)]);}catch(e){console.error(e.message);process.exitCode=1;}finally{const resolved=path.resolve(dir);if(resolved.startsWith(path.resolve(testRoot)+path.sep)&&path.basename(resolved).startsWith('alraiyan-test-browser-'))rmSync(resolved,{recursive:true,force:true});}
