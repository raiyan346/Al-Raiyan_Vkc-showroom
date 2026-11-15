export function printDocument(mode){
 const style=document.createElement('style');
 style.textContent=mode==='thermal'?'@page{size:80mm 297mm;margin:3mm}':mode==='labels'?'@page{size:A4;margin:7mm}':'@page{size:A4;margin:10mm}';
 document.head.appendChild(style);document.body.dataset.print=mode;
 const cleanup=()=>{style.remove();delete document.body.dataset.print;window.removeEventListener('afterprint',cleanup);};
 window.addEventListener('afterprint',cleanup);window.print();cleanup();
}
