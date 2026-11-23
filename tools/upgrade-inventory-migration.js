import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const previous='server/prisma/postgresql/previous-inventory.prisma';
const source=readFileSync('server/prisma/schema.prisma','utf8').replace('provider = "sqlite"','provider = "postgresql"');
// The previous schema is reconstructed by removing only the new, additive inventory fields/models.
let old=source.replace(/model (Article|Barcode|StockOperation|ProductChange) \{[\s\S]*?\n\}\n/g,'');
for(const line of ['sizeSystems String','internalSku String','articleId String','article Article?','sellingPrice Int?','minimumStock Int?','barcodes Barcode[]','articles Article[]','referenceId String?','brandSnapshot String','articleSnapshot String','@@unique([articleId,size,color])'])old=old.split('\n').filter(l=>!l.trim().startsWith(line)).join('\n');
mkdirSync('server/prisma/postgresql',{recursive:true});writeFileSync(previous,old);
writeFileSync('server/prisma/postgresql/schema.prisma',source);
const r=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-schema-datamodel',previous,'--to-schema-datamodel','server/prisma/postgresql/schema.prisma','--script'],{encoding:'utf8',env:{...process.env,DATABASE_URL:'postgresql://placeholder:placeholder@localhost:5432/pos'}});
if(r.status!==0)throw new Error(r.stderr);
const dir='server/prisma/postgresql/migrations/202611150001_article_inventory';mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/migration.sql',r.stdout);
console.log('Additive PostgreSQL inventory migration generated.');
