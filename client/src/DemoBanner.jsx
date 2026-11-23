import {useEffect,useState} from 'react';
import {api} from './lib.js';

export function DemoBanner(){
 const [demo,setDemo]=useState(localStorage.getItem('pos-demo-mode')==='true');
 useEffect(()=>{
  let active=true;
  api('/config').then(config=>{
   if(!active)return;
   setDemo(config.demoMode);
   localStorage.setItem('pos-demo-mode',String(config.demoMode));
  }).catch(()=>{});
  return()=>{active=false;};
 },[]);
 if(!demo)return null;
 return <aside className="demo-banner" role="note"><strong>Sample demo</strong> — Use sample data only. Changes are shared with other visitors. Do not enter personal or real shop information. Account changes, new contacts, settings changes, and backups are disabled.</aside>;
}
