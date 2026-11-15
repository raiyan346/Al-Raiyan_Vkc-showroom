import '../src/config.js';
import {readFile} from 'node:fs/promises';
import {db} from '../src/db.js';
const order=['user','setting','product','supplier','customer','purchase','purchaseItem','sale','saleItem','return','returnItem','payment','stockMovement','expense','closing'];
async function restore(){
 if(process.argv.length!==4||process.argv[3]!=='--confirm-empty-database')throw new Error('Usage: node server/scripts/restore.js backup.json --confirm-empty-database');
 const backup=JSON.parse(await readFile(process.argv[2],'utf8'));
 if(backup.version!==1||order.some(t=>!Array.isArray(backup[t])))throw new Error('Unsupported or incomplete backup.');
 await db.$transaction(async tx=>{
  for(const table of order)if(await tx[table].count())throw new Error('Restore requires a completely empty database. Existing records were preserved.');
  for(const table of order)if(backup[table].length)await tx[table].createMany({data:backup[table]});
 },{isolationLevel:'Serializable',timeout:120000});
 console.log('Backup restored to the empty database. Sign in with the accounts from that backup.');
}
restore().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
