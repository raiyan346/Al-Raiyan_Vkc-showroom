export const DEFAULT_CIPHER = 'AJIHGFEDCB';
export function validateCipher(cipher) {
  if (typeof cipher !== 'string' || !/^[A-Z]{10}$/.test(cipher) || new Set(cipher).size !== 10) throw new Error('Use ten different uppercase letters for digits 0–9.');
  return cipher;
}
// Money enters the system as rupees but is always stored and calculated as paise.
export function toPaise(value) {
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Enter a positive amount with at most two decimal places.');
  const [whole, fraction = ''] = s.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000) throw new Error('Amount is too large.');
  return result;
}
export const rupees = paise => (paise / 100).toFixed(2);
export function encodeCost(amount, cipher = DEFAULT_CIPHER) {
  validateCipher(cipher);
  const paise = toPaise(amount);
  const canonical = paise % 100 === 0 ? String(paise / 100) : rupees(paise);
  return [...canonical].map(c => c === '.' ? '.' : cipher[Number(c)]).join('');
}
export function decodeCost(code, cipher = DEFAULT_CIPHER) {
  validateCipher(cipher);
  if (typeof code !== 'string' || !code.length) throw new Error('Enter a cost code.');
  const result = [...code.toUpperCase()].map(c => {
    if (c === '.') return '.';
    const digit = cipher.indexOf(c);
    if (digit < 0) throw new Error('Unknown letter in cost code.');
    return String(digit);
  }).join('');
  return Number(rupees(toPaise(result)));
}
export function integer(value, name = 'Value', min = 0, max = 1_000_000_000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
  return value;
}
// Largest remainder allocation keeps line totals and partial returns exact to one paise.
export function allocate(amount, weights) {
  const total = weights.reduce((a,b) => a+b, 0);
  if (!total) return weights.map(() => 0);
  const denominator=BigInt(total);
  const rows = weights.map((w,i) => {const numerator=BigInt(amount)*BigInt(w);return {i,value:Number(numerator/denominator),remainder:Number(numerator%denominator)};});
  let left = amount - rows.reduce((s,r) => s+r.value,0);
  for (const r of [...rows].sort((a,b)=>b.remainder-a.remainder || a.i-b.i)) if (left-- > 0) r.value++;
  return rows.map(r=>r.value);
}
export function calculateBill(items, discount = 0) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new Error('Add between 1 and 200 items.');
  const gross = items.map(item => integer(item.quantity, 'Quantity', 1, 10000) * integer(item.unitPrice, 'Selling price'));
  const subtotal = gross.reduce((a,b)=>a+b,0);
  integer(subtotal, 'Bill total'); integer(discount, 'Discount', 0, subtotal);
  const discounts = allocate(discount, gross);
  const lines = items.map((item,i) => ({...item, gross:gross[i], discount:discounts[i], net:gross[i]-discounts[i], cost:item.unitCost === undefined ? undefined : integer(item.unitCost,'Cost')*item.quantity}));
  const cost = lines.reduce((s,r)=>s+(r.cost||0),0);
  const total = subtotal-discount;
  return {subtotal, discount, total, cost, profit:total-cost, lines};
}
export function returnValue(net, quantity, alreadyReturned, returning) {
  integer(returning,'Return quantity',1,quantity-alreadyReturned);
  return Math.floor(net*(alreadyReturned+returning)/quantity)-Math.floor(net*alreadyReturned/quantity);
}
export function weightedCost(oldQuantity,oldCost,inQuantity,inCost){
 integer(oldQuantity,'Existing stock');integer(oldCost,'Existing cost');integer(inQuantity,'Incoming quantity',1);integer(inCost,'Incoming cost');
 const quantity=BigInt(oldQuantity)+BigInt(inQuantity);
 const value=BigInt(oldQuantity)*BigInt(oldCost)+BigInt(inQuantity)*BigInt(inCost);
 return Number((value+quantity/2n)/quantity);
}
export function scanProduct(products, barcode, cart) {
  const product = products.find(p=>p.barcode === barcode.trim() && p.active !== false);
  if (!product) throw new Error('Barcode not found. Search for the product.');
  const old = cart.find(i=>i.productId === product.id);
  if ((old?.quantity || 0) >= product.quantity) throw new Error('No more stock available.');
  return old ? cart.map(i=>i.productId === product.id ? {...i,quantity:i.quantity+1} : i) : [...cart,{productId:product.id, name:product.name,size:product.size,color:product.color,barcode:product.barcode,mrp:product.mrp,unitPrice:product.mrp,quantity:1,...(product.purchasePrice !== undefined ? {unitCost:product.purchasePrice}: {})}];
}
