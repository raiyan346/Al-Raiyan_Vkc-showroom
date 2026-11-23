import React from 'react';
import {Modal,Button} from './ui.jsx';
export default function VariantPicker({variants,value,onChoose,onClose}){
  return <Modal title="Choose size & colour / அளவைத் தேர்ந்தெடு" onClose={onClose}>
    <p>Barcode <strong>{value}</strong> matches multiple variants. Select the exact pair.</p>
    <div className="variant-choices">{variants.map(p=><Button key={p.id} className="variant-choice" disabled={!p.quantity} onClick={()=>onChoose(p)}><strong>{p.brand} {p.articleNumber||p.name}</strong><span>Size {p.size} · {p.color}</span><span>{p.quantity>0?`${p.quantity} pairs available`:'Out of stock'}</span></Button>)}</div>
  </Modal>;
}
