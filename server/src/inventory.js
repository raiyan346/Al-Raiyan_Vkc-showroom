import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {validateBarcode,barcodeKeys} from '@alraiyan/core';
import {db,transaction} from './db.js';

const text=z.string().trim().min(1).max(150);
const amount=z.number().int().min(0).max(1_000_000_000);
export const mappingSchema=z.object({value:z.string().min(1).max(100),format:z.string().default('CODE128'),type:z.enum(['MANUFACTURER','ALIAS']).default('ALIAS')}).transform(b=>({...validateBarcode(b.value,b.format),type:b.type}));
export const variantSchema=z.object({
  id:z.string().uuid().optional(),size:text,color:text,mrp:amount,sellingPrice:amount,
  purchasePrice:amount.optional(),quantity:z.number().int().min(0).max(100000).default(0),
  minimumStock:z.number().int().min(0).max(100000).nullable().optional(),active:z.boolean().default(true),
  barcodes:z.array(mappingSchema).max(30).default([])
});
export const articleSchema=z.object({
  id:z.string().uuid().optional(),articleId:z.string().uuid().optional(),brand:text,articleNumber:z.string().trim().max(150),
  name:text,category:text,gender:text.default('Unisex'),sizeSystem:text.default('UK/India'),
  image:z.string().max(1500000).refine(s=>!s||/^https:\/\//.test(s)||/^data:image\/(png|jpeg|webp);base64,/.test(s),'Use a PNG/JPEG/WebP photo or HTTPS URL.').nullable().optional(),
  supplierId:z.string().uuid().nullable().optional(),notes:z.string().max(2000).default(''),
  barcodes:z.array(mappingSchema).max(30).optional(),variants:z.array(variantSchema).min(1).max(100)
});
const canonical=s=>s.trim().replace(/\s+/g,' ').toUpperCase();
export const articleKey=d=>createHash('sha256').update(JSON.stringify([d.brand,d.articleNumber,d.category,d.gender].map(canonical))).digest('hex');
export const productInclude={article:{include:{barcodes:{where:{variantId:null}}}},barcodes:true};
export function serializeProduct(p,role){
  const {article,barcodes=[],purchasePrice,costKnown,...safe}=p;
  const result={...safe,articleNumber:article?.articleNumber||'',gender:article?.gender||'Unisex',sizeSystem:article?.sizeSystem||'UK/India',notes:article?.notes||'',supplierId:article?.supplierId||null,
    sellingPrice:p.sellingPrice??p.mrp,internalSku:p.internalSku||p.barcode,
    barcodes:[...barcodes,...(article?.barcodes||[])].map(({value,format,type,variantId})=>({value,format,type,scope:variantId?'VARIANT':'ARTICLE'}))};
  return role==='OWNER'?{...result,purchasePrice,costKnown}:result;
}
export async function catalogue(role,all=false){
  const products=await db.product.findMany({where:all?undefined:{active:true},include:productInclude,orderBy:{name:'asc'}});
  return products.map(p=>serializeProduct(p,role));
}
export async function findBarcode(value,role){
  const keys=barcodeKeys(value);
  const products=await db.product.findMany({where:{active:true,OR:[{barcode:{in:keys}},{internalSku:{in:keys}},{barcodes:{some:{value:{in:keys}}}},{article:{barcodes:{some:{value:{in:keys},variantId:null}}}}]},include:productInclude,orderBy:[{size:'asc'},{color:'asc'}]});
  return {status:products.length===0?'UNKNOWN':products.length===1?'UNIQUE':'CHOOSE_VARIANT',variants:products.map(p=>serializeProduct(p,role))};
}
async function saveMappings(tx,articleId,variantId,mappings){
  await tx.barcode.deleteMany({where:{articleId,variantId}});
  for(const b of mappings){const targetKey=JSON.stringify([b.value,variantId||articleId]);
    await tx.barcode.upsert({where:{targetKey},update:{format:b.format,type:b.type},create:{...b,articleId,variantId,targetKey}});
  }
}
export async function saveArticle(input,user){
  const data=articleSchema.parse(input),identityKey=articleKey(data);
  if(!data.articleId&&!data.articleNumber)throw new Error('Enter an article number for a new product.');
  const {id,articleId,variants,barcodes,...metadata}=data;
  const requestHash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const run=()=>transaction(async tx=>{
    if(id){const prior=await tx.stockOperation.findUnique({where:{id}});if(prior){if(prior.actorId!==user.id||prior.requestHash!==requestHash)throw new Error('Request ID already used for different content.');return JSON.parse(prior.result);}}
    let article=articleId?await tx.article.findUniqueOrThrow({where:{id:articleId}}):null;
    if(!article){
      if(await tx.article.findUnique({where:{identityKey}}))throw new Error('This article already exists. Open its details and add missing sizes or colours.');
      article=await tx.article.create({data:{...metadata,identityKey}});
    }else{
      article=await tx.article.update({where:{id:article.id},data:{...metadata,identityKey:data.articleNumber?identityKey:article.identityKey}});
      await tx.product.updateMany({where:{articleId:article.id},data:{name:metadata.name,brand:metadata.brand,category:metadata.category,photo:metadata.image}});
    }
    const seen=new Set();
    for(const variant of variants){
      const size=canonical(variant.size),color=canonical(variant.color),variantKey=JSON.stringify([size,color]);
      if(seen.has(variantKey))throw new Error('Each size and colour must appear only once.');seen.add(variantKey);
      const existing=variant.id?await tx.product.findUniqueOrThrow({where:{id:variant.id}}):null;
      if(existing&&existing.articleId!==article.id)throw new Error('Variant belongs to another article.');
      if(!existing&&await tx.product.findFirst({where:{articleId:article.id,size,color}}))throw new Error(`Size ${size} / ${color} already exists. Edit it instead.`);
      const fields={name:metadata.name,brand:metadata.brand,category:metadata.category,photo:metadata.image,size,color,mrp:variant.mrp,sellingPrice:variant.sellingPrice,minimumStock:variant.minimumStock??null,active:variant.active};
      if(user.role==='OWNER'&&variant.purchasePrice!==undefined)Object.assign(fields,{purchasePrice:variant.purchasePrice,costKnown:true});
      let product;
      if(existing)product=await tx.product.update({where:{id:existing.id},data:fields});
      else{
        const sku=`AR${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;
        product=await tx.product.create({data:{purchasePrice:0,costKnown:false,...fields,articleId:article.id,barcode:sku,internalSku:sku,quantity:variant.quantity}});
        if(variant.quantity)await tx.stockMovement.create({data:{productId:product.id,delta:variant.quantity,kind:'OPENING',actorId:user.id,referenceId:id||article.id,note:'Opening stock by size'}});
      }
      await saveMappings(tx,article.id,product.id,variant.barcodes);
      await tx.productChange.create({data:{productId:product.id,actorId:user.id,action:existing?'EDIT_VARIANT':'CREATE_VARIANT'}});
    }
    if(barcodes!==undefined)await saveMappings(tx,article.id,null,barcodes);
    const result={id:article.id};
    if(id)await tx.stockOperation.create({data:{id,actorId:user.id,requestHash,result:JSON.stringify(result)}});
    return result;
  });
  try{return await run();}catch(e){if(e.code==='P2002'&&id){const prior=await db.stockOperation.findUnique({where:{id}});if(prior?.requestHash===requestHash&&prior.actorId===user.id)return JSON.parse(prior.result);}throw e;}
}
export async function articleDetails(id,role){
  const article=await db.article.findUniqueOrThrow({where:{id},include:{barcodes:{where:{variantId:null}},variants:{include:productInclude,orderBy:[{size:'asc'},{color:'asc'}]},supplier:true}});
  return {...article,variants:article.variants.map(p=>serializeProduct(p,role))};
}
export async function attachLegacyVariant(articleId,variantId,user){
  return transaction(async tx=>{
    const target=await tx.article.findUniqueOrThrow({where:{id:articleId},include:{variants:{select:{size:true,color:true}}}});
    const product=await tx.product.findUniqueOrThrow({where:{id:variantId},include:{article:{include:{barcodes:{where:{variantId:null}}}}}});
    if(product.articleId===articleId)return {id:product.id};
    if(product.article?.articleNumber)throw new Error('Only variants without a recorded article number can be linked this way.');
    if(!target.articleNumber)throw new Error('Choose an article with a recorded article number.');
    if(target.variants.some(v=>canonical(v.size)===canonical(product.size)&&canonical(v.color)===canonical(product.color)))throw new Error('This article already has that size and colour. Stock was not combined.');
    await tx.product.update({where:{id:variantId},data:{articleId,name:target.name,brand:target.brand,category:target.category,photo:target.image||product.photo,size:canonical(product.size),color:canonical(product.color)}});
    await tx.barcode.updateMany({where:{variantId},data:{articleId}});
    for(const b of product.article?.barcodes||[]){const targetKey=JSON.stringify([b.value,variantId]);await tx.barcode.upsert({where:{targetKey},update:{articleId},create:{articleId,variantId,targetKey,value:b.value,format:b.format,type:b.type}});}
    await tx.productChange.create({data:{productId:variantId,actorId:user.id,action:`LINK_LEGACY_VARIANT:${articleId}`}});
    return {id:variantId};
  });
}

// Additive backfill: preserve variant IDs, quantities, costs, old barcode values and all ledger rows.
export async function backfillInventory(client=db){
  await client.$transaction(async tx=>{
    const products=await tx.product.findMany({where:{articleId:null}});
    for(const p of products){
      const parent=await tx.article.upsert({where:{identityKey:`legacy:${p.id}`},update:{},create:{identityKey:`legacy:${p.id}`,articleNumber:'',brand:p.brand,name:p.name,category:p.category,image:p.photo}});
      await tx.product.update({where:{id:p.id},data:{articleId:parent.id,internalSku:p.internalSku||p.barcode,sellingPrice:p.sellingPrice??p.mrp}});
    }
  },{timeout:120000});
}
