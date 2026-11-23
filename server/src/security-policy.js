import {randomInt} from 'node:crypto';

// Demo requests always use staff permissions, including sessions created before
// the visitor account was downgraded or accounts accidentally marked Owner.
export const sessionIdentity=(user,isDemo)=>user&&isDemo?{...user,role:'STAFF'}:user;

export function privateShopCipher(){
 const letters=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
 for(let i=letters.length-1;i>0;i--){const j=randomInt(i+1);[letters[i],letters[j]]=[letters[j],letters[i]];}
 return letters.slice(0,10).join('');
}
