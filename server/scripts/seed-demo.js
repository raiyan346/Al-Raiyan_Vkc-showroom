import {seedDemo} from './demo-data.js';
import {db} from '../src/db.js';
try{await seedDemo();}catch{console.error('Demo seeding refused or failed. Check environment identity and configuration.');process.exitCode=1;}finally{await db.$disconnect();}
