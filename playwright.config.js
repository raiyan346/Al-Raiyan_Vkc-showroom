import {defineConfig} from '@playwright/test';
if(process.env.POS_BROWSER_TEST!=='true')throw new Error('Run npm run test:browser to use an isolated test database.');
export default defineConfig({testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:45000,retries:0,use:{baseURL:'http://127.0.0.1:3002',channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},webServer:{command:'node server/src/index.js',url:'http://127.0.0.1:3002/api/health',reuseExistingServer:false,timeout:30000,env:process.env}});
