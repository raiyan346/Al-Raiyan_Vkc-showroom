import {db} from './db.js';
import {appEnv,validateEnvironment} from './config.js';
export async function verifyDatabaseIdentity({initialize=false}={}){
 validateEnvironment();
 if(appEnv==='development')return;
 let marker=await db.environmentIdentity.findUnique({where:{id:'environment'}});
 if(!marker&&initialize)marker=await db.environmentIdentity.create({data:{id:'environment',name:appEnv}});
 if(marker?.name!==appEnv)throw new Error('Database environment identity mismatch.');
}
export async function verifyDemoTarget(){
 if(appEnv!=='demo'||process.env.DEMO_MODE!=='true')throw new Error('This operation is restricted to the demo environment.');
 await verifyDatabaseIdentity();
 const rows=await db.$queryRaw`SELECT current_database() AS name`;
 if(rows[0]?.name!==process.env.EXPECTED_DATABASE_NAME||rows[0]?.name!=='vkc_demo')throw new Error('Unexpected demo database identity.');
}
