(function(){
  'use strict';
  if(window.__YX_SLOW_REQUEST_HELPER__) return;
  window.__YX_SLOW_REQUEST_HELPER__ = true;
  const WATCH = ['/api/ship-preview','/api/warehouse','/api/warehouse/available-items','/api/customer-items'];
  const KEY = 'yx_slow_requests_v1';
  function save(row){
    try{
      const arr = JSON.parse(localStorage.getItem(KEY)||'[]').filter(Boolean).slice(-30);
      arr.push(Object.assign({at:new Date().toISOString(), page:location.pathname}, row));
      localStorage.setItem(KEY, JSON.stringify(arr.slice(-40)));
    }catch(_e){}
  }
  function toast(msg){
    try{
      let el=document.getElementById('yx-slow-request-toast');
      if(!el){el=document.createElement('div');el.id='yx-slow-request-toast';el.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:rgba(255,255,255,.96);border:1px solid rgba(120,80,40,.22);box-shadow:0 12px 32px rgba(0,0,0,.15);border-radius:16px;padding:10px 14px;font:600 14px/1.45 system-ui;color:#5b371d;';document.body.appendChild(el);} 
      el.textContent=msg; clearTimeout(el._t); el._t=setTimeout(()=>{el.remove();},3600);
    }catch(_e){}
  }
  const orig = window.fetch;
  if(typeof orig !== 'function') return;
  window.fetch = function(input, init){
    const url = String((input&&input.url)||input||'');
    const hit = WATCH.find(x=>url.includes(x));
    if(!hit) return orig.apply(this, arguments);
    const t0 = performance.now();
    let warned = false;
    const timer = setTimeout(()=>{warned=true; toast('資料仍在讀取：'+hit.replace('/api/','')+'，畫面會先顯示可用內容');}, 2200);
    return orig.apply(this, arguments).then(res=>{
      const ms = Math.round(performance.now()-t0); clearTimeout(timer);
      save({url:hit, elapsed_ms:ms, ok:res.ok, warned});
      return res;
    }).catch(err=>{
      const ms = Math.round(performance.now()-t0); clearTimeout(timer);
      save({url:hit, elapsed_ms:ms, ok:false, error:String(err&&err.message||err), warned});
      throw err;
    });
  };
  window.YXSlowRequestHelper = {snapshot:function(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_e){return[]}}, clear:function(){try{localStorage.removeItem(KEY)}catch(_e){}}};
})();
