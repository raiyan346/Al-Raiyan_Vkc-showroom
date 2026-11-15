import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeCost,decodeCost,toPaise,calculateBill,returnValue,scanProduct,DEFAULT_CIPHER,validateCipher,weightedCost,allocate} from './index.js';
test('shop cipher examples, all digits, fractional money and alternate map roundtrip',()=>{
  assert.equal(encodeCost(300),'HAA'); assert.equal(encodeCost(1250),'JIFA');
  for(const map of [DEFAULT_CIPHER,'QWERTYUIOP']) for(const amount of [0,300,1250,123456.78,9.01]) assert.equal(decodeCost(encodeCost(amount,map),map),amount);
  assert.equal(encodeCost('12.50'),'JI.FA');
});
test('cipher and money reject ambiguity and invalid inputs',()=>{
  for(const map of ['AAAAAAAAAA','short','0123456789']) assert.throws(()=>validateCipher(map));
  for(const value of [-1,'1.005','NaN','1e3']) assert.throws(()=>toPaise(value));
  assert.throws(()=>decodeCost('K')); assert.equal(toPaise('1.01'),101);
});
test('negotiated prices and overall discount determine real profit',()=>{
  const b=calculateBill([{quantity:2,unitPrice:45000,unitCost:30000},{quantity:1,unitPrice:20000,unitCost:25000}],10000);
  assert.equal(b.total,100000); assert.equal(b.cost,85000); assert.equal(b.profit,15000);
  assert.equal(b.lines.reduce((s,l)=>s+l.net,0),b.total); assert.ok(b.lines[1].net < b.lines[1].cost);
  assert.throws(()=>calculateBill([{quantity:1,unitPrice:100}],101));
});
test('partial returns recover exact discounted amount without rounding drift',()=>{
  const net=10000; assert.equal([0,1,2].reduce((s,n)=>s+returnValue(net,3,n,1),0),net);
  assert.throws(()=>returnValue(net,3,3,1));
});
test('keyboard scanner adds, increments, rejects unknown and out-of-stock variants',()=>{
  const products=[{id:'1',barcode:'AR0001',name:'Sandal',mrp:59900,quantity:2}];
  let cart=scanProduct(products,' AR0001\n',[]); assert.equal(cart[0].quantity,1);
  cart=scanProduct(products,'AR0001',cart); assert.equal(cart[0].quantity,2);
  assert.throws(()=>scanProduct(products,'AR0001',cart)); assert.throws(()=>scanProduct(products,'UNKNOWN',cart));
  assert.ok(!('unitCost' in cart[0]));
});
test('weighted average uses remaining stock and incoming cost, rounded to paise',()=>{
 assert.equal(weightedCost(10,20000,10,30000),25000);assert.equal(weightedCost(0,99999,5,30000),30000);assert.equal(weightedCost(3,100,2,101),100);assert.throws(()=>weightedCost(5,100,0,100));
});
test('large-value allocation remains exact when multiplication exceeds safe Number precision',()=>{
 for(const amount of [999999999,999999997,123456789]){
  const weights=[333333333,333333333,333333334],parts=allocate(amount,weights);
  assert.equal(parts.reduce((a,b)=>a+b,0),amount);
  for(let i=0;i<weights.length;i++)assert.ok(Math.abs(parts[i]-Number(BigInt(amount)*BigInt(weights[i])/1000000000n))<=1);
 }
 assert.equal(weightedCost(1000000000,999999999,999999999,999999998),999999999);
});
