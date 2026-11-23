import {expect} from '@playwright/test';
export async function browserLogin(page,request,role='owner'){
 const pre=await request.get('/api/auth/session');const access=await pre.json();const origin=new URL(pre.url()).origin;
 const response=await request.post('/api/auth/login',{headers:{'X-CSRF-Token':access.csrfToken,Origin:origin},data:{username:role,password:'browser-'+role+'-123'}});expect(response.ok()).toBeTruthy();const auth=await response.json();
 await page.context().addCookies((await request.storageState()).cookies);
 await page.addInitScript(()=>localStorage.setItem('pos-lang','en'));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Welcome! Let’s start a good shop day.'})).toBeVisible();await expect(page.locator('.statusbar')).toContainText('0 bills pending');return auth;
}
