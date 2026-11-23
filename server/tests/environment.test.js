import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET='environment-test-secret-longer-than-32-characters';
const {validateEnvironment}=await import('../src/config.js');
const {assertDemoResetAllowed}=await import('../src/maintenance-policy.js');
const prod={NODE_ENV:'production',APP_ENV:'production',DEMO_MODE:'false',PUBLIC_ACCESS:'false',SESSION_SECRET:'a'.repeat(64),DB_PROVIDER:'postgresql',APP_BASE_URL:'https://private.example',EXPECTED_DATABASE_HOST:'ep-production.example',EXPECTED_DATABASE_NAME:'shop',DATABASE_URL:'postgresql://app:secret@ep-production-pooler.example/shop?sslmode=require',DIRECT_URL:'postgresql://owner:secret@ep-production.example/shop?sslmode=require',SEED_SAMPLE_DATA:'false'};
test('production rejects missing security, public access, wrong database and demo seeds',()=>{
 assert.doesNotThrow(()=>validateEnvironment(prod));
 for(const change of [{SESSION_SECRET:''},{PUBLIC_ACCESS:'true'},{PUBLIC_REGISTRATION_ENABLED:'true'},{DEMO_MODE:'true'},{DATABASE_URL:'postgresql://app:secret@ep-other.example/shop?sslmode=require'},{EXPECTED_DATABASE_HOST:''},{SEED_SAMPLE_DATA:'true'}])assert.throws(()=>validateEnvironment({...prod,...change}));
});
test('demo rejects production connection and mismatched environment flags',()=>{
 const demo={...prod,APP_ENV:'demo',DEMO_MODE:'true',EXPECTED_DATABASE_HOST:'ep-demo.example',EXPECTED_DATABASE_NAME:'vkc_demo',DATABASE_URL:'postgresql://app:secret@ep-demo-pooler.example/vkc_demo?sslmode=require',DIRECT_URL:'postgresql://owner:secret@ep-demo.example/vkc_demo?sslmode=require',PRODUCTION_DATABASE_HOST:prod.EXPECTED_DATABASE_HOST};
 assert.doesNotThrow(()=>validateEnvironment(demo));
 assert.throws(()=>validateEnvironment({...demo,DATABASE_URL:prod.DATABASE_URL}));
 assert.throws(()=>validateEnvironment({...demo,PRODUCTION_DATABASE_HOST:demo.EXPECTED_DATABASE_HOST}));
 assert.doesNotThrow(()=>assertDemoResetAllowed(demo,['--confirm-demo-reset']));
 assert.throws(()=>assertDemoResetAllowed(prod,['--confirm-demo-reset']));
 assert.throws(()=>assertDemoResetAllowed(demo,[]));
 assert.throws(()=>assertDemoResetAllowed({...demo,EXPECTED_DATABASE_NAME:'shop'},['--confirm-demo-reset']));
});
