(function(){
  'use strict';
  if(window.__YX_V17_POOL_API_DEDUPE__) return;
  window.__YX_V17_POOL_API_DEDUPE__ = true;
  const VERSION='v17-pool-api-dedupe';
  const nativeFetch = window.fetch.bind(window);
  const inflight = new Map();
  const cache = new Map();
  const queue = [];
  let active = 0;
  const MAX_ACTIVE = 3;
  const CACHE_MS = 1200;
  const INFLIGHT_KEEP_MS = 250;
  function isApi(input){
    try{ const u=typeof input==='string'?input:(input && input.url)||''; return String(u).includes('/api/'); }catch(_){return false;}
  }
  function methodOf(init){ return String((init&&init.method)||'GET').toUpperCase(); }
  function keyOf(input, init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    const method=methodOf(init);
    if(method!=='GET') return '';
    return method+' '+String(url).replace(/([?&])_=[^&]*/,'$1').replace(/[?&]$/,'');
  }
  function clone(resp){ try{return resp.clone();}catch(_){return resp;} }
  function runNext(){
    if(active>=MAX_ACTIVE || !queue.length) return;
    const job=queue.shift();
    active++;
    job().finally(()=>{ active--; setTimeout(runNext,0); });
  }
  function queuedFetch(input, init){
    return new Promise((resolve,reject)=>{
      queue.push(()=>nativeFetch(input,init).then(resolve,reject));
      runNext();
    });
  }
  window.fetch = function(input, init){
    if(!isApi(input)) return nativeFetch(input, init);
    const key=keyOf(input, init);
    if(key){
      const c=cache.get(key);
      if(c && Date.now()-c.t<CACHE_MS) return Promise.resolve(clone(c.resp));
      const existing=inflight.get(key);
      if(existing) return existing.then(clone);
      const req=queuedFetch(input, init).then(resp=>{
        cache.set(key,{t:Date.now(),resp:clone(resp)});
        setTimeout(()=>inflight.delete(key), INFLIGHT_KEEP_MS);
        return resp;
      }).catch(err=>{ inflight.delete(key); throw err; });
      inflight.set(key, req);
      return req.then(clone);
    }
    return queuedFetch(input, init);
  };
  function singleFlight(name, minGap){
    const fn=window[name];
    if(typeof fn!=='function' || fn.__yxV17SingleFlight) return;
    let running=null, lastT=0, pendingArgs=null;
    async function wrapped(){
      pendingArgs=arguments;
      if(running) return running;
      const now=Date.now();
      if(now-lastT<minGap){
        await new Promise(r=>setTimeout(r, minGap-(now-lastT)));
      }
      lastT=Date.now();
      running=Promise.resolve(fn.apply(this, pendingArgs)).finally(()=>{running=null;});
      return running;
    }
    wrapped.__yxV17SingleFlight=true;
    try{ window[name]=wrapped; }catch(_e){}
  }
  function install(){
    ['loadCustomerBlocks','renderCustomers','loadShipCustomerItems','loadShipCustomerItems66','renderWarehouse','loadTodayChanges','loadShippingRecords','loadAdminUsers','loadAuditTrails','loadInlineList','renderSourceList'].forEach(n=>singleFlight(n, n==='renderWarehouse'?700:900));
    // 移除只負責重刷畫面的舊觀察器，避免 UI 跳動與重複 API；不移除按鈕事件。
    ['__YX139_OBSERVER__','__YX138_OBSERVER__','__yx137Observer','__YX136_OBSERVER__'].forEach(k=>{try{window[k]&&window[k].disconnect&&window[k].disconnect();}catch(_e){}});
    document.documentElement.dataset.yxApiDedupe=VERSION;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,80)); else setTimeout(install,80);
  setTimeout(install,800);
})();
