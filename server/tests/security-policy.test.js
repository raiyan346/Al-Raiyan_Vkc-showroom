import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sessionIdentity,privateShopCipher} from '../src/security-policy.js';
import {validateCipher} from '@alraiyan/core';

test('demo caps every identity at Staff without changing the stored Owner',()=>{
 const owner={id:'visitor',name:'Demo Visitor',role:'OWNER',active:true};
 assert.equal(sessionIdentity(owner,true).role,'STAFF');
 assert.equal(owner.role,'OWNER');
 assert.equal(sessionIdentity({...owner,role:'STAFF'},true).role,'STAFF');
 assert.equal(sessionIdentity(null,true),null);
});

test('production keeps Owner permissions and existing identity fields',()=>{
 const owner={id:'shop-owner',role:'OWNER',tokenVersion:7};
 assert.strictEqual(sessionIdentity(owner,false),owner);
 assert.equal(sessionIdentity({role:'STAFF'},false).role,'STAFF');
});

test('new production ciphers are valid independent private mappings',()=>{
 const ciphers=Array.from({length:10},privateShopCipher);
 for(const cipher of ciphers){assert.match(cipher,/^[A-Z]{10}$/);assert.doesNotThrow(()=>validateCipher(cipher));}
 assert.ok(new Set(ciphers).size>1);
});
