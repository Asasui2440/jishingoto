import { prepareOfflineEntry } from './registration.mjs';
void prepareOfflineEntry().then(()=>{
  document.documentElement.dataset.offlineEntryReady='true';
  const openSavedMap=()=>{
    if(!navigator.onLine&&['/','/home','/home/'].includes(location.pathname))location.replace('/offline-evac/index.html?entry=offline');
  };
  window.addEventListener('offline',openSavedMap);
  openSavedMap();
}).catch(()=>{document.documentElement.dataset.offlineEntryReady='false';});
