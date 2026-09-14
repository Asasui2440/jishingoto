async function readyWorker(script, scope) {
  let registration=await navigator.serviceWorker.getRegistration(scope);
  if(registration?.scope!==new URL(scope,location.origin).href)registration=null;
  if(navigator.onLine||!registration?.active){
    try{registration=await navigator.serviceWorker.register(script,{scope,updateViaCache:'none'});}
    catch(error){if(!registration?.active)throw error;}
  }
  const worker=registration.installing||registration.waiting||registration.active;
  if(!worker)throw new Error('オフライン画面を準備できませんでした。');
  if(worker.state!=='activated')await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('オフライン画面の準備が時間切れになりました。')),20000);
    worker.addEventListener('statechange',()=>{
      if(worker.state==='activated'){clearTimeout(timer);resolve();}
      else if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('オフライン画面の保存に失敗しました。'));}
    });
  });
  const complete=await new Promise((resolve,reject)=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(new Error('保存状態を確認できませんでした。'));},8000);
    channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.complete);};
    worker.postMessage({type:'CHECK_SHELL'},[channel.port2]);
  });
  if(!complete)throw new Error('画面の一部を保存できませんでした。オンラインで再度開いてください。');
}
export async function prepareOfflineEntry(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)throw new Error('オフライン保存はHTTPSまたはlocalhostで利用できます。');
  // Install the fallback before enabling redirects from the usual entry point.
  await readyWorker('/offline-evac/sw.js','/offline-evac/');
  await readyWorker('/sw.js','/');
}
