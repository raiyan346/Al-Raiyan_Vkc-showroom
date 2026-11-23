import '../src/config.js';
import bcrypt from 'bcryptjs';
import {appEnv} from '../src/config.js';
import {verifyDatabaseIdentity} from '../src/environment.js';
import {seedDemo} from '../scripts/demo-data.js';
import {randomUUID} from 'node:crypto';
import {db} from '../src/db.js';
import {createSale} from '../src/sales.js';
import {backfillInventory} from '../src/inventory.js';
async function main(){
 if(appEnv==='development'&&/^postgres(?:ql)?:/.test(process.env.DATABASE_URL||'')&&process.env.SEED_SAMPLE_DATA==='true')throw new Error('PostgreSQL sample seeding requires an explicitly isolated demo environment.');
 await verifyDatabaseIdentity({initialize:true});
 if(appEnv==='demo')return seedDemo();
 await db.setting.upsert({where:{id:'shop'},update:{},create:{id:'shop'}});
 const passwords={OWNER:process.env.OWNER_PASSWORD,STAFF:process.env.STAFF_PASSWORD};
 for(const [role,password] of Object.entries(passwords)){
  // Preserve the shop's existing Owner even after the login username is changed.
  if(appEnv==='production'&&role==='OWNER'&&await db.user.findFirst({where:{role:'OWNER',active:true}}))continue;
  const username=role==='OWNER'?(process.env.OWNER_USERNAME||'owner'):role.toLowerCase();if(await db.user.findUnique({where:{username}}))continue;
  if(!password||password.length<10||password.startsWith('choose-'))throw new Error(`Set ${role}_PASSWORD in .env to at least 10 characters before seeding.`);
  await db.user.create({data:{username,name:role==='OWNER'?'Shop Owner':'Shop Staff',role,passwordHash:await bcrypt.hash(password,12)}});
 }
 if(appEnv==='production'||process.env.SEED_SAMPLE_DATA!=='true'||await db.product.count()){await backfillInventory();console.log('Accounts and settings ready. Existing records preserved.');return;}
 const samples=[
  ['VKC Gents Comfort Sandal','VKC','Sandals','8','Brown',599,300,24],
  ['VKC Gents Comfort Sandal','VKC','Sandals','9','Brown',599,300,18],
  ['Lunar Daily Walk','Lunar','Slippers','8','Black',349,180,30],
  ['VKC Ladies Elegance','VKC','Ladies','6','Maroon',499,280,16],
  ['Kids School Shoe','VKC','School Shoes','2','Black',799,450,12],
  ['Kids School Shoe','VKC','School Shoes','3','Black',799,450,10],
  ['Paragon Formal Shoe','Paragon','Shoes','9','Black',1299,780,8],
  ['Walkaroo Everyday','Walkaroo','Sandals','7','Navy',699,400,20],
  ['Flite Soft Step','Flite','Ladies','7','Rose',399,210,4],
  ['VKC Kids Play','VKC','Kids','11','Blue',449,250,3],
  ['Cozy Ladies Slipper','Cozy','Ladies','6','Pink',399,220,22],
  ['Classic Leather Look','Lunar','Shoes','10','Tan',999,650,6]
 ];
 const owner=await db.user.findUniqueOrThrow({where:{username:'owner'}});
 for(const [n,s] of samples.entries()){
  const [name,brand,category,size,color,mrp,cost,quantity]=s;
  const p=await db.product.create({data:{name,brand,category,size,color,mrp:mrp*100,purchasePrice:cost*100,quantity,barcode:`ARDEMO${String(n+1).padStart(6,'0')}`,...(n===11?{createdAt:new Date(Date.now()-75*86400000)}:{})}});
  await db.stockMovement.create({data:{productId:p.id,delta:quantity,kind:'OPENING',actorId:owner.id,note:'Sample stock'}});
 }
 const supplier=await db.supplier.create({data:{name:'Sample Footwear Distributor',phone:'9876543210',address:'Tamil Nadu'}});
 const customer=await db.customer.create({data:{name:'Sample Customer',phone:'9876543211'}});
 const products=await db.product.findMany({orderBy:{barcode:'asc'}});
 for(const [i,mode] of ['CASH','UPI','CREDIT'].entries())await createSale({id:randomUUID(),items:[{productId:products[i].id,quantity:i+1,unitPrice:products[i].mrp-5000}],discount:i===0?1000:0,paymentMode:mode,cashTendered:mode==='CASH'?100000:0,customerId:mode==='CREDIT'?customer.id:null,soldAt:new Date().toISOString()},owner);
 await db.expense.create({data:{category:'Tea & Snacks',note:'Sample expense',amount:15000,actorId:owner.id}});
 await backfillInventory();
 console.log('Seeded 12 product variants, 3 sample bills, a customer, supplier, and an expense. Sample barcodes: ARDEMO000001 through ARDEMO000012.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
