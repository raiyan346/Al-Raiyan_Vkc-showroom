import './config.js';
import {PrismaClient} from '@prisma/client';
export const db = new PrismaClient();
export async function transaction(fn) {
  for(let attempt=0;attempt<4;attempt++) {
    try {return await db.$transaction(fn,{isolationLevel:'Serializable',timeout:20000,maxWait:10000});}
    catch(e){if(!['P2034','P1008'].includes(e.code)||attempt===3)throw e; await new Promise(r=>setTimeout(r,50*(attempt+1)));}
  }
}
