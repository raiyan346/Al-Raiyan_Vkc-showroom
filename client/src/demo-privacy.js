const privateFields=new Set(['cipher','purchasePrice','costKnown','costCode','unitCost','cost','profit','netProfit','belowCost','inventoryValue','loss','requestHash']);

// Upgrade old demo caches without discarding pending bills, drafts or stock.
export function withoutDemoSecrets(value){
 if(Array.isArray(value))return value.map(withoutDemoSecrets);
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).filter(([key])=>!privateFields.has(key)).map(([key,item])=>[key,withoutDemoSecrets(item)]));
 return value;
}
