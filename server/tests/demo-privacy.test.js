import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withoutDemoSecrets} from '../../client/src/demo-privacy.js';

test('old demo caches lose nested confidential fields while keeping pending bills and drafts',()=>{
 const cache={settings:{shopName:'Sample shop',cipher:'QWERTYUIOP'},products:[{id:'sample',quantity:12,purchasePrice:30000,costKnown:true}],receipts:[{id:'receipt',total:49900,cost:30000,profit:19900,items:[{unitPrice:49900,unitCost:30000,costCode:'EXAMPLE'}]}],pending:[{payload:{id:'pending',items:[{productId:'sample',quantity:2,unitPrice:49900}],paymentMode:'CASH',discount:0}}],draft:[{product:{id:'sample',purchasePrice:30000},quantity:1}],held:[{id:'held',items:[]}]};
 const safe=withoutDemoSecrets(cache);
 assert.equal(safe.settings.cipher,undefined);assert.equal(safe.products[0].purchasePrice,undefined);assert.equal(safe.products[0].costKnown,undefined);
 assert.equal(safe.receipts[0].cost,undefined);assert.equal(safe.receipts[0].profit,undefined);assert.deepEqual(safe.receipts[0].items,[{unitPrice:49900}]);
 assert.equal(safe.draft[0].product.purchasePrice,undefined);assert.deepEqual(safe.pending,cache.pending);assert.deepEqual(safe.held,cache.held);
 assert.equal(safe.products[0].quantity,12);assert.equal(safe.receipts[0].total,49900);assert.equal(cache.settings.cipher,'QWERTYUIOP');
});
