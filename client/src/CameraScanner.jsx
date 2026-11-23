import React,{useEffect,useRef,useState} from 'react';
import {Camera,SwitchCamera,Flashlight,Keyboard,ImagePlus} from 'lucide-react';
import {BrowserMultiFormatReader} from '@zxing/browser';
import {BarcodeFormat} from '@zxing/library';
import {Modal,Button,Field,Notice} from './ui.jsx';

const formats=[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39];
function stopControl(c){try{Promise.resolve(c?.stop()).catch(()=>{});}catch{}}
function cameraError(e){
  if(e?.name==='NotAllowedError'||e?.name==='SecurityError')return 'Camera permission was denied. Allow camera access in browser settings, or enter a barcode / upload a photo below.';
  if(e?.name==='NotFoundError')return 'No camera was found. Enter a barcode or upload a photo.';
  if(e?.name==='NotReadableError')return 'The camera is busy. Close other camera apps and try again.';
  return 'Could not start the camera. Try again, or use manual entry / a barcode photo.';
}
export default function CameraScanner({onScan,onClose}){
  const video=useRef(null),controls=useRef(null),generation=useRef(0),handled=useRef(false),alive=useRef(true);
  const [error,setError]=useState(''),[manual,setManual]=useState(''),[devices,setDevices]=useState([]),[device,setDevice]=useState(''),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[torchAvailable,setTorchAvailable]=useState(false),[torch,setTorch]=useState(false);
  function stop(){
    generation.current++;stopControl(controls.current);controls.current=null;
    const stream=video.current?.srcObject;stream?.getTracks?.().forEach(t=>t.stop());if(video.current)video.current.srcObject=null;
  }
  function finish(value,format){
    if(handled.current||!alive.current)return;handled.current=true;stop();navigator.vibrate?.(80);onScan(value,format);onClose();
  }
  async function start(selected=''){
    stop();const ticket=generation.current;handled.current=false;setError('');setBusy(true);setTorch(false);setTorchAvailable(false);
    if(!window.isSecureContext){setError('Camera scanning needs HTTPS or localhost. Manual entry and image upload still work.');setBusy(false);return;}
    if(!navigator.mediaDevices?.getUserMedia){setError('This browser cannot open a camera. Use Safari/Chrome on HTTPS, manual entry, or a photo.');setBusy(false);return;}
    const reader=new BrowserMultiFormatReader();reader.possibleFormats=formats;
    try{
      const c=await reader.decodeFromConstraints({audio:false,video:selected?{deviceId:{exact:selected}}:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},video.current,(result,err,c)=>{
        if(ticket!==generation.current||!alive.current){stopControl(c);return;}
        if(result)finish(result.getText(),BarcodeFormat[result.getBarcodeFormat()]);
      });
      if(ticket!==generation.current||!alive.current){stopControl(c);return;}
      controls.current=c;setRunning(true);setTorchAvailable(typeof c.switchTorch==='function');
      const list=await BrowserMultiFormatReader.listVideoInputDevices();
      if(alive.current&&ticket===generation.current){setDevices(list);setDevice(video.current?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().deviceId||selected);}
    }catch(e){if(alive.current&&ticket===generation.current){stop();setError(cameraError(e));setRunning(false);}}
    finally{if(alive.current)setBusy(false);}
  }
  useEffect(()=>{alive.current=true;start();return()=>{alive.current=false;stop();};},[]);
  async function image(file){
    if(!file)return;if(file.size>10_000_000){setError('Choose a barcode photo smaller than 10 MB.');return;}
    stop();setRunning(false);setBusy(true);setError('');handled.current=false;const url=URL.createObjectURL(file);
    try{const reader=new BrowserMultiFormatReader();reader.possibleFormats=formats;const r=await reader.decodeFromImageUrl(url);finish(r.getText(),BarcodeFormat[r.getBarcodeFormat()]);}
    catch{if(alive.current)setError('No supported barcode found. Use a clear, well-lit photo of the full barcode, including both white margins.');}
    finally{URL.revokeObjectURL(url);if(alive.current)setBusy(false);}
  }
  async function toggleTorch(){try{await controls.current?.switchTorch?.(!torch);setTorch(!torch);}catch{setError('Flashlight is not available on this camera/browser.');setTorchAvailable(false);}}
  return <Modal title="Scan product / பொருள் ஸ்கேன்" onClose={onClose} className="scanner-dialog">
    <div className="camera-preview"><video ref={video} muted playsInline autoPlay aria-label="Barcode camera preview"/><div className="scanning-guide" aria-hidden="true"/><span>Keep the full barcode inside the guide</span></div>
    <div className="actions scanner-actions"><Button onClick={()=>start(device)} disabled={busy}><Camera/>{busy?'Opening camera…':running?'Restart camera':'Start camera'}</Button>{devices.length>1&&<Field label="Camera"><select value={device} onChange={e=>{setDevice(e.target.value);start(e.target.value);}}>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select></Field>}{torchAvailable&&<Button onClick={toggleTorch}><Flashlight/>{torch?'Flashlight off':'Flashlight on'}</Button>}</div>
    <Notice error>{error}</Notice>
    <form onSubmit={e=>{e.preventDefault();if(manual.trim())finish(manual.trim());}} className="scanner-manual"><Field label="Manual barcode / பார்கோடு உள்ளிடு" value={manual} onChange={e=>setManual(e.target.value)} autoComplete="off"/><Button type="submit" variant="primary" disabled={!manual.trim()}><Keyboard/>Use barcode</Button></form>
    <Field label="Scan from photo / படத்திலிருந்து ஸ்கேன்"><input type="file" accept="image/*" onChange={e=>image(e.target.files[0])} disabled={busy}/></Field>
    <p className="muted">EAN-13 · EAN-8 · UPC-A · UPC-E · Code 128 · Code 39</p>
  </Modal>;
}
