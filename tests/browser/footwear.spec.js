import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {browserLogin as login} from './auth-helper.js';

test('article form creates W5687 sizes 6-12; shared scans require selection and repeat scans increase one size',async({page,request})=>{
  await login(page,request);await page.goto('/');await page.locator('.home-tile.amber').click();await page.getByRole('button',{name:'Add product',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByLabel(/Article number/).fill('W5687');await dialog.getByLabel(/Product name/).fill('Walkaroo Daily Sandal');
  await dialog.getByLabel(/Shared barcode/).fill('BROWSER-SHARED|CODE128');
  await dialog.getByLabel(/Purchase price/).fill('300');await dialog.getByLabel(/Selling price/).fill('450');await dialog.getByLabel(/MRP/).fill('599');await dialog.getByLabel('Opening stock').fill('5');
  await dialog.getByRole('button',{name:'Add sizes 6–12'}).click();await expect(dialog.locator('.variant-editor')).toHaveCount(7);
  await dialog.getByRole('button',{name:'Confirm & save article'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.article-card').filter({hasText:'W5687'})).toContainText('7 variants');await page.reload();await page.locator('.home-tile.amber').click();await expect(page.locator('.article-card').filter({hasText:'W5687'})).toContainText('35 pairs');
  mkdirSync('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/footwear-inventory.png',fullPage:true});
  await page.locator('.topbar nav').getByRole('button',{name:'New bill',exact:true}).click();const search=page.getByRole('textbox',{name:'Scan barcode or type product name…'});
  for(let n=0;n<2;n++){
    await search.fill('BROWSER-SHARED');await search.press('Enter');dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:/Choose size/})).toBeVisible();await expect(page.locator('.cart-table tbody tr')).toHaveCount(n===0?0:1);await dialog.getByRole('button').filter({hasText:'Size 9 · BLACK'}).click();
  }
  await expect(page.locator('.cart-table tbody tr')).toHaveCount(1);await expect(page.locator('.cart-table .stepper strong')).toHaveText('2');await expect(page.locator('.grand-total')).toContainText('₹900.00');
});
test('mobile camera denial permits manual entry and real uploaded-image decoding over a secure origin',async({page,request})=>{
  await login(page,request);await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Test permission denied','NotAllowedError');};});
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('.home-tile.amber').click();
  await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'Labels (1)',exact:true}).click();let dialog=page.getByRole('dialog');
  mkdirSync('.artifacts',{recursive:true});const svg=await dialog.locator('.barcode-label svg').first().evaluate(el=>el.outerHTML);const imagePage=await page.context().newPage();await imagePage.setContent('<body style="background:white;margin:20px">'+svg+'</body>');await imagePage.locator('svg').screenshot({path:'.artifacts/scanner-code128.png'});await imagePage.close();await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('.brand').click();await page.locator('.home-tile.blue').click();await page.getByRole('button',{name:'Camera barcode scanner'}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('permission was denied');expect(await page.evaluate(()=>window.isSecureContext)).toBeTruthy();await dialog.getByLabel(/Scan from photo/).setInputFiles('.artifacts/scanner-code128.png');
  await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:15000});await expect(page.locator('.cart-table tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Camera barcode scanner'}).click();dialog=page.getByRole('dialog');await dialog.getByLabel(/Manual barcode/).fill('UNKNOWN-CAMERA-CODE');await dialog.getByRole('button',{name:'Use barcode'}).click();await expect(page.getByRole('dialog')).toContainText('Unknown barcode');await expect(page.getByRole('dialog').getByRole('button',{name:/Add new product/})).toBeVisible();
});
test('closing the scanner stops video tracks and opening it prefers the rear camera',async({page,request})=>{
  await login(page,request);await page.addInitScript(()=>{
    window.__cameraCalls=[];window.__streams=[];
    navigator.mediaDevices.getUserMedia=async constraints=>{window.__cameraCalls.push(constraints);const c=document.createElement('canvas');c.width=640;c.height=480;const stream=c.captureStream(10);window.__streams.push(stream);return stream;};
  });
  await page.goto('/');await page.locator('.home-tile.blue').click();await page.getByRole('button',{name:'Camera barcode scanner'}).click();await page.waitForFunction(()=>window.__streams.length>0);await expect(page.getByRole('dialog').getByLabel('Barcode camera preview')).toBeVisible();
  expect(await page.evaluate(()=>window.__cameraCalls[0].video.facingMode.ideal)).toBe('environment');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
});
