// Barcode text is never converted to a number: leading zeros are meaningful.
export const BARCODE_FORMATS = ['CODE128','CODE39','EAN13','EAN8','UPCA','UPCE'];
export function normalizeFormat(format='CODE128') {
  return String(format).toUpperCase().replaceAll('_','').replaceAll('-','').replaceAll(' ','');
}
export function expandUPCE(value) {
  const [n,a,b,c,d,e,f,check]=value;
  if (!/^[01]\d{7}$/.test(value)) throw new Error('UPC-E must have eight digits and start with 0 or 1.');
  if ('012'.includes(f)) return `${n}${a}${b}${f}0000${c}${d}${e}${check}`;
  if (f==='3') return `${n}${a}${b}${c}00000${d}${e}${check}`;
  if (f==='4') return `${n}${a}${b}${c}${d}00000${e}${check}`;
  return `${n}${a}${b}${c}${d}${e}0000${f}${check}`;
}
export function validateBarcode(value,format='CODE128') {
  if (typeof value!=='string') throw new Error('Barcode must be text; preserve leading zeros.');
  value=value.trim();format=normalizeFormat(format);
  if (!BARCODE_FORMATS.includes(format)) throw new Error('Unsupported barcode format.');
  if (!value || value.length>100 || !/^[\x20-\x7E]+$/.test(value)) throw new Error('Use 1–100 printable barcode characters.');
  if (format==='CODE39' && !/^[0-9A-Z .$/+%\-]+$/.test(value)) throw new Error('Code 39 uses uppercase letters, digits, spaces and - . $ / + %.');
  const length={EAN13:13,EAN8:8,UPCA:12,UPCE:8}[format];
  if (length) {
    if (!new RegExp(`^\\d{${length}}$`).test(value)) throw new Error(`${format} needs exactly ${length} digits.`);
    const digits=format==='UPCE'?expandUPCE(value):value;
    let sum=0,weight=3;
    for(let i=digits.length-2;i>=0;i--){sum+=Number(digits[i])*weight;weight=weight===3?1:3;}
    if ((10-sum%10)%10!==Number(digits.at(-1))) throw new Error(`${format} check digit is invalid.`);
  }
  return {value,format};
}
// UPC-A readers may expose the equivalent EAN-13 with a single leading zero.
export function barcodeKeys(value) {
  const keys=[String(value).trim()];
  if (/^0\d{12}$/.test(keys[0])) keys.push(keys[0].slice(1));
  if (/^\d{12}$/.test(keys[0])) keys.push('0'+keys[0]);
  return keys;
}
export function resolveBarcode(products,value) {
  const keys=barcodeKeys(value);
  return products.filter(p=>p.active!==false && (keys.includes(p.barcode)||keys.includes(p.internalSku)||p.barcodes?.some(b=>keys.includes(b.value))));
}
export function addVariantToCart(product,cart) {
  if(!product || product.active===false) throw new Error('Product is no longer available.');
  const old=cart.find(i=>i.productId===product.id);
  if((old?.quantity||0)>=product.quantity) throw new Error('No more stock available.');
  return old?cart.map(i=>i.productId===product.id?{...i,quantity:i.quantity+1}:i):[...cart,{
    productId:product.id,name:product.name,brand:product.brand,articleNumber:product.articleNumber,
    size:product.size,color:product.color,barcode:product.barcode,mrp:product.mrp,
    unitPrice:product.sellingPrice??product.mrp,quantity:1,
    ...(product.purchasePrice!==undefined?{unitCost:product.purchasePrice}:{})
  }];
}
