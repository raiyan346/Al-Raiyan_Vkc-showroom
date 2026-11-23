import {db} from '../src/db.js';
import {verifyDemoTarget} from '../src/environment.js';
import {seedDemo} from './demo-data.js';
import {PrismaClient} from '@prisma/client';
import {assertDemoResetAllowed} from '../src/maintenance-policy.js';
const maintenance=new PrismaClient({datasources:{db:{url:process.env.DIRECT_URL}}});
try{
 assertDemoResetAllowed(process.env,process.argv);
 await verifyDemoTarget();
 const tables=['ReturnItem','Return','SaleItem','Payment','Sale','PurchaseItem','Purchase','StockMovement','StockOperation','ProductChange','Barcode','Product','Article','Supplier','Customer','Expense','Closing','Session','User','Setting'];
 await maintenance.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(4097321)`;
  const marker=await tx.environmentIdentity.findUnique({where:{id:'environment'}});
  if(marker?.name!=='demo')throw new Error('Not a demo database.');
  await tx.$executeRawUnsafe('TRUNCATE TABLE '+tables.map(n=>'"'+n+'"').join(', ')+' RESTART IDENTITY CASCADE');
 },{timeout:60000});
 await seedDemo();console.log('Demo reset completed. Production was not contacted.');
}catch{console.error('Demo reset refused or failed. Verify the demo identity and explicit confirmation.');process.exitCode=1;}finally{await maintenance.$disconnect();await db.$disconnect();}
