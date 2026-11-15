import React from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.jsx';
import './styles.css';
registerSW({onNeedRefresh(){window.dispatchEvent(new Event('pos-update'));},onOfflineReady(){console.info('Al-Raiyan POS is ready for offline billing.');}});
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
