import {createHash} from 'node:crypto';
import {db,transaction} from './db.js';
export async function stockTransaction(req,data,fn){
  const hash=createHash('sha256').update(JSON.stringify([req.path,data])).digest('hex');
  const run=()=>transaction(async tx=>{
    if(data.id){const prior=await tx.stockOperation.findUnique({where:{id:data.id}});if(prior){if(prior.actorId!==req.user.id||prior.requestHash!==hash)throw new Error('Stock request ID already used for different content.');return JSON.parse(prior.result);}}
    const result=await fn(tx);
    if(data.id)await tx.stockOperation.create({data:{id:data.id,actorId:req.user.id,requestHash:hash,result:JSON.stringify(result)}});
    return result;
  });
  try{return await run();}catch(e){if(e.code==='P2002'&&data.id){const prior=await db.stockOperation.findUnique({where:{id:data.id}});if(prior?.requestHash===hash&&prior.actorId===req.user.id)return JSON.parse(prior.result);}throw e;}
}
