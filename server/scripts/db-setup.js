import 'dotenv/config';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
const root=fileURLToPath(new URL('../../',import.meta.url));
dotenv.config({path:path.join(root,'.env')});
const dir=fileURLToPath(new URL('../',import.meta.url));
const provider=process.env.DB_PROVIDER || 'sqlite';
if(!['sqlite','postgresql'].includes(provider)) throw new Error('DB_PROVIDER must be sqlite or postgresql');
process.env.DATABASE_URL ||= 'file:./dev.db';
const target=provider==='postgresql'?path.join(dir,'prisma','postgresql','schema.prisma'):path.join(dir,'prisma','active.prisma');
mkdirSync(path.dirname(target),{recursive:true});
writeFileSync(target,readFileSync(path.join(dir,'prisma','schema.prisma'),'utf8').replace('provider = "sqlite"',`provider = "${provider}"`));
const cli=path.join(root,'node_modules','prisma','build','index.js');
if(!existsSync(cli)) throw new Error('Run npm install first');
if(provider==='sqlite'&&process.env.DATABASE_URL.startsWith('file:')){
 const file=path.resolve(path.dirname(target),process.env.DATABASE_URL.slice(5));
 if(!existsSync(file)){mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,'');}
}
const commands=[['generate','--schema',target]];
if(provider==='postgresql'&&!process.argv.includes('--generate-only')&&new URL(process.env.DIRECT_URL||process.env.DATABASE_URL).hostname.includes('-pooler.'))throw new Error('Set DIRECT_URL to the non-pooler PostgreSQL endpoint before running migrations.');
if(!process.argv.includes('--generate-only'))commands.push(provider==='postgresql'?['migrate','deploy','--schema',target]:['db','push','--schema',target]);
for(const args of commands) {
 // Migrations need a direct connection; application queries keep the pooled URL.
 const env=provider==='postgresql'&&args[0]==='migrate'&&process.env.DIRECT_URL?{...process.env,DATABASE_URL:process.env.DIRECT_URL}:process.env;
 const r=spawnSync(process.execPath,[cli,...args],{stdio:'inherit',env,cwd:root}); if(r.status!==0)process.exit(r.status||1);
}

if(!process.argv.includes('--generate-only')){const r=spawnSync(process.execPath,[path.join(dir,'scripts','backfill-inventory.js')],{cwd:root,env:process.env,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
