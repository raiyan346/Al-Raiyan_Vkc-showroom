import React,{useRef,useEffect,useState} from 'react';
import {Mic,Search,ArrowLeft,X,Check,AlertTriangle,Camera} from 'lucide-react';
export {default as CameraScanner} from './CameraScanner.jsx';
export function Button({children,variant='',className='',...props}){return <button className={`btn ${variant} ${className}`} {...props}>{children}</button>;}
export function Field({label,children,...p}){return <label className="field"><span>{label}</span>{children||<input {...p}/>}</label>;}
export function PageTitle({title,subtitle,back,actions}){return <div className="page-title"><div>{back&&<button className="back" onClick={back}><ArrowLeft size={22}/> {back.label||'Back / பின்செல்'}</button>}<h1>{title}</h1>{subtitle&&<p className="muted">{subtitle}</p>}</div><div className="actions">{actions}</div></div>;}
export function Modal({title,children,onClose,className=''}){
 const ref=useRef(null);useEffect(()=>{const d=ref.current;d.showModal();return()=>{d.close();};},[]);
 return <dialog className={className} ref={ref} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-head"><h2>{title}</h2><button aria-label="Close" className="icon-button" onClick={onClose}><X/></button></div>{children}</dialog>;
}
export function Confirm({text,onConfirm,onClose}){return <Modal title="Please confirm / உறுதிசெய்க" onClose={onClose}><p className="confirm-copy">{text}</p><div className="actions"><Button onClick={onClose}>Cancel / ரத்து</Button><Button variant="danger" onClick={onConfirm}><Check/> Confirm / உறுதி</Button></div></Modal>;}
export function Notice({children,error=false}){return children?<div className={`notice ${error?'error':''}`} role={error?'alert':'status'}>{error&&<AlertTriangle size={24}/>}<span>{children}</span></div>:null;}
export function SearchBox({value,onChange,placeholder,lang='ta',onEnter,autoFocus=false}){
 const [warning,setWarning]=useState('');
 function voice(){const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){setWarning('Voice search is unavailable in this browser. Type or scan instead.');return;}const r=new Speech();r.lang=lang==='ta'?'ta-IN':'en-IN';r.onresult=e=>onChange(e.results[0][0].transcript);r.onerror=()=>setWarning('Could not hear you. Please try again or type.');r.start();}
 return <div><div className="search-box"><Search/><input autoFocus={autoFocus} aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onEnter?.(value);}}}/><button onClick={voice} title="Voice search / குரல் தேடல்" aria-label="Voice search"><Mic/></button></div>{warning&&<small role="status">{warning}</small>}</div>;
}
export function Empty({children}){return <div className="empty">{children}</div>;}
