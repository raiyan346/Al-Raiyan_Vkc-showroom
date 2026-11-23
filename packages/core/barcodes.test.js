import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBarcode,barcodeKeys,resolveBarcode,scanProduct} from './index.js';
test('EAN/UPC formats preserve leading zeros and validate check digits',()=>{
 for(const [value,format] of [['4006381333931','EAN13'],['96385074','EAN8'],['036000291452','UPCA'],['04252614','UPCE'],['W5687-9','CODE128'],['W5687-9','CODE39']])assert.equal(validateBarcode(value,format).value,value);
 assert.throws(()=>validateBarcode('4006381333932','EAN13'),/check digit/);assert.throws(()=>validateBarcode(36000291452,'UPCA'),/text/);assert.throws(()=>validateBarcode('lowercase','CODE39'));
 assert.deepEqual(barcodeKeys('0036000291452'),['0036000291452','036000291452']);
});
test('unique internal, manufacturer and alias barcodes resolve the exact variant; shared never auto-selects',()=>{
 const products=[{id:'6',size:'6',quantity:0,barcode:'INTERNAL6',sellingPrice:45000,mrp:59900,barcodes:[{value:'SHARED'},{value:'MANUFACTURER6'}]},{id:'9',size:'9',quantity:3,barcode:'INTERNAL9',sellingPrice:45000,mrp:59900,barcodes:[{value:'SHARED'},{value:'ALIAS9'}]}];
 assert.equal(resolveBarcode(products,'ALIAS9')[0].size,'9');assert.equal(resolveBarcode(products,'MANUFACTURER6')[0].size,'6');assert.equal(resolveBarcode(products,'SHARED').length,2);
 assert.throws(()=>scanProduct(products,'SHARED',[]),/choose a size/);assert.deepEqual(resolveBarcode(products,'UNKNOWN'),[]);
 let cart=scanProduct(products,'ALIAS9',[]);assert.equal(cart[0].unitPrice,45000);cart=scanProduct(products,'INTERNAL9',cart);assert.equal(cart.length,1);assert.equal(cart[0].quantity,2);
});
