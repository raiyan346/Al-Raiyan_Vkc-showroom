import {backfillInventory} from '../src/inventory.js';
import {db} from '../src/db.js';
backfillInventory().then(()=>console.log('Inventory extended; existing variant IDs and financial records preserved.')).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
