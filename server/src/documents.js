import {demoMode} from './config.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {rupees} from '@alraiyan/core';
import {fileURLToPath} from 'node:url';
const tamilFont=fileURLToPath(new URL('../../client/public/fonts/NotoSansTamil-Regular.ttf',import.meta.url));
export function invoicePdf(res,sale,setting){
 const doc=new PDFDocument({size:'A4',margin:42,info:{Title:demoMode?'DEMO MODE SAMPLE DOCUMENT':'Sales Receipt'}});doc.font(tamilFont);res.type('pdf');res.setHeader('Content-Disposition',`attachment; filename="${sale.number}.pdf"`);doc.pipe(res);
 const header=()=>{if(demoMode)doc.fontSize(13).text('DEMO MODE - SAMPLE DOCUMENT');doc.fontSize(20).text(setting.shopName);doc.fontSize(11).text(setting.address).text(setting.phone).moveDown();};header();
 doc.fontSize(16).text('SALES RECEIPT').fontSize(11).text(`Bill: ${sale.number}`).text(`Date: ${new Date(sale.soldAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`).text(`Customer: ${sale.customer?.name||'Walk-in'}`).moveDown();
 for(const i of sale.items){if(doc.y>700){doc.addPage();header();}doc.text(`${i.name} / ${i.size} / ${i.color}`).text(`${i.quantity} x Rs ${rupees(i.unitPrice)}     Rs ${rupees(i.unitPrice*i.quantity)}`).moveDown(.5);}
 if(doc.y>650)doc.addPage();doc.moveDown().text(`Subtotal: Rs ${rupees(sale.subtotal)}`).text(`Discount: Rs ${rupees(sale.discount)}`).fontSize(18).text(`TOTAL: Rs ${rupees(sale.total)}`).fontSize(11).text(`Payment: ${sale.paymentMode}`).text(`Credit due: Rs ${rupees(sale.creditDue)}`).moveDown().text('Thank you! Please keep this receipt for returns.');doc.end();
}
export async function exportReport(res,data,format){
 if(format==='pdf'){
  const doc=new PDFDocument({size:'A4',margin:40,info:{Title:demoMode?'DEMO MODE SAMPLE REPORT':'Owner Report'}});doc.font(tamilFont);res.type('pdf');res.setHeader('Content-Disposition','attachment; filename="report.pdf"');doc.pipe(res);
  doc.fontSize(20).text(demoMode?'DEMO MODE - SAMPLE REPORT':'Al-Raiyan - Owner report').fontSize(12).text(`${data.from} to ${data.to}`).moveDown();
  for(const key of ['sales','cost','profit','loss','expenses','netProfit'])doc.text(`${key}: Rs ${rupees(data[key])}`);
  if(data.uncosted)doc.text(`WARNING: ${data.uncosted} units have unconfirmed cost. Profit is provisional.`);
  doc.moveDown().text('Product profit');for(const p of data.bestSellers){if(doc.y>730)doc.addPage();doc.text(`${p.name} / ${p.size}: ${p.quantity} units; profit Rs ${rupees(p.profit)}`);}doc.end();return;
 }
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Summary');if(demoMode)sheet.addRow(['DEMO MODE - SAMPLE DOCUMENT']);sheet.addRow(['Period',data.from,data.to]);
 for(const key of ['sales','cost','profit','loss','expenses','netProfit','uncosted'])sheet.addRow([key,key==='uncosted'?data[key]:data[key]/100]);
 const products=book.addWorksheet('Products');products.addRow(['Name','Size','Quantity','Sales (INR)','Cost (INR)','Profit (INR)']);for(const p of data.bestSellers)products.addRow([p.name,p.size,p.quantity,p.sales/100,p.cost/100,p.profit/100]);
 const bills=book.addWorksheet('Bills');bills.addRow(['Bill','Posted','Total (INR)','Cost (INR)','Profit (INR)','Below cost']);for(const b of data.bills)bills.addRow([b.number,b.createdAt,b.total/100,b.cost/100,b.profit/100,b.belowCost]);
 res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="report.xlsx"');await book.xlsx.write(res);res.end();
}
