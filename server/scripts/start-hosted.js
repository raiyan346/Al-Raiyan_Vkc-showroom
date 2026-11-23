import {spawnSync} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';
import {appEnv} from '../src/config.js';
import {db} from '../src/db.js';
if(appEnv==='production'&&(!/^[a-f0-9]{40}$/.test(process.env.PRODUCTION_APPROVED_COMMIT||'')||process.env.RENDER_GIT_COMMIT!==process.env.PRODUCTION_APPROVED_COMMIT))throw new Error('Production commit has not been approved. Promote the exact verified demo commit first.');
if(!['production','demo'].includes(appEnv))throw new Error('Hosted startup requires an explicit environment.');
const markerTables=await db.$queryRaw`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='EnvironmentIdentity') AS present`;
if(markerTables[0].present){const marker=await db.environmentIdentity.findUnique({where:{id:'environment'}});if(marker&&marker.name!==appEnv)throw new Error('Refusing migrations against a different environment.');}
await db.$disconnect();
for(const name of readdirSync('server/prisma/postgresql/migrations')){
 if(name==='migration_lock.toml')continue;
 const sql=readFileSync(`server/prisma/postgresql/migrations/${name}/migration.sql`,'utf8');
 if(/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(sql))throw new Error('Destructive migrations require separate operator review and cannot run at hosted startup.');
}
for(const file of ['server/scripts/db-setup.js','server/prisma/seed.js']){
 const r=spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);
}
await import('../src/index.js');
