import {db} from './db.js';
export function dayRange(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Use YYYY-MM-DD for date.');
 const start=new Date(`${day}T00:00:00+05:30`);if(!Number.isFinite(+start))throw new Error('Invalid date');
 return {gte:start,lt:new Date(+start+86400000)};
}
export const indiaDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export async function report(from,to){
 const range={gte:dayRange(from).gte,lt:dayRange(to).lt};
 if(range.gte>=range.lt)throw new Error('End date must follow start date.');
 const [sales,returns,expenses,products]=await Promise.all([
  db.sale.findMany({where:{createdAt:range},include:{items:{include:{product:{select:{category:true}}}}},orderBy:{createdAt:'desc'}}),
  db.return.findMany({where:{createdAt:range},include:{items:{include:{saleItem:{include:{product:{select:{category:true}}}}}}}}),
  db.expense.findMany({where:{date:range}}),db.product.findMany({where:{active:true},include:{saleItems:{select:{sale:{select:{createdAt:true}}},orderBy:{sale:{createdAt:'desc'}},take:1}}})
 ]);
 const grossSales=sales.reduce((s,b)=>s+b.total,0), refunds=returns.reduce((s,r)=>s+r.total,0);
 const revenue=grossSales-refunds,cost=sales.reduce((s,b)=>s+b.cost,0)-returns.reduce((s,r)=>s+r.cost,0),profit=revenue-cost,expenseTotal=expenses.reduce((s,e)=>s+e.amount,0);
 const productsMap={},trendMap={},categories={};let loss=0,uncosted=0;
 const addTrend=(date,revenue,cost)=>{const key=indiaDay(date);trendMap[key]||={day:key,sales:0,profit:0};trendMap[key].sales+=revenue;trendMap[key].profit+=revenue-cost;};
 for(const b of sales){addTrend(b.createdAt,b.total,b.cost);for(const i of b.items){
  const p=productsMap[i.productId]||={name:i.name,size:i.size,quantity:0,sales:0,cost:0,profit:0};p.quantity+=i.quantity;p.sales+=i.net;p.cost+=i.unitCost*i.quantity;p.profit=p.sales-p.cost;
  categories[i.product.category]=(categories[i.product.category]||0)+i.net;
  if(i.net<i.unitCost*i.quantity)loss+=i.unitCost*i.quantity-i.net;if(!i.costKnown)uncosted+=i.quantity;
 }}
 for(const r of returns){addTrend(r.createdAt,-r.total,-r.cost);for(const ri of r.items){const i=ri.saleItem;const p=productsMap[i.productId]||={name:i.name,size:i.size,quantity:0,sales:0,cost:0,profit:0};p.quantity-=ri.quantity;p.sales-=ri.amount;p.cost-=i.unitCost*ri.quantity;p.profit=p.sales-p.cost;categories[i.product.category]=(categories[i.product.category]||0)-ri.amount;}}
 const setting=await db.setting.findUnique({where:{id:'shop'}});
 return {from,to,grossSales,refunds,sales:revenue,cost,profit,loss,expenses:expenseTotal,netProfit:profit-expenseTotal,uncosted,billCount:sales.length,trend:Object.values(trendMap).sort((a,b)=>a.day.localeCompare(b.day)),bestSellers:Object.values(productsMap).sort((a,b)=>b.quantity-a.quantity),categories:Object.entries(categories).map(([name,sales])=>({name,sales})),bills:sales.map(({items,requestHash,...s})=>({...s,belowCost:items.some(i=>i.net<i.unitCost*i.quantity)})),lowStock:products.filter(p=>p.quantity<=(setting?.lowStock??5)).map(({saleItems,...p})=>p),deadStock:products.filter(p=>new Date(p.saleItems[0]?.sale.createdAt||p.createdAt)<new Date(Date.now()-60*86400000)).map(({saleItems,...p})=>p)};
}
export async function cashClosing(day,opening){
 const range=dayRange(day);
 const [sales,payments,returns,expenses]=await Promise.all([
 db.sale.aggregate({where:{createdAt:range,paymentMode:'CASH'},_sum:{total:true}}),db.payment.aggregate({where:{createdAt:range,mode:'CASH'},_sum:{amount:true}}),db.return.aggregate({where:{createdAt:range,refundMode:'CASH'},_sum:{refund:true}}),db.expense.aggregate({where:{date:range},_sum:{amount:true}})]);
 // Expenses are cash expenses. All daily reports use server posting time in IST.
 const cashSales=sales._sum.total||0,collections=payments._sum.amount||0,refunds=returns._sum.refund||0,paid=expenses._sum.amount||0;
 return {day,opening,cashSales,collections,refunds,expenses:paid,expected:opening+cashSales+collections-refunds-paid};
}
