/* 沅興木業 IndexedDB cache + sync status (mainfile infra, no overlay/hardlock/timer/observer) */
(function(){
  const DB_NAME='yx_cache_v1'; const STORE='api_cache'; const VERSION=1;
  const CACHEABLE=['/api/inventory','/api/orders','/api/master_orders','/api/warehouse','/api/today-changes','/api/shipping_records'];
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function isGet(opt){ return !opt || !opt.method || String(opt.method).toUpperCase()==='GET'; }
  function normKey(url){ try{ const u=new URL(url,location.origin); u.searchParams.delete('ts'); u.searchParams.delete('_'); return u.pathname+u.search; }catch(_){ return String(url||''); } }
  function isCacheable(url,opt){ if(!isGet(opt)) return false; const k=normKey(url); return CACHEABLE.some(p=>k===p || k.startsWith(p+'?')); }
  function openDB(){ return new Promise((resolve,reject)=>{ if(!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable')); const req=indexedDB.open(DB_NAME,VERSION); req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'key'}); }; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error||new Error('IndexedDB open failed')); }); }
  async function idbGet(key){ const db=await openDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readonly'); const req=tx.objectStore(STORE).get(key); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); }
  async function idbSet(key,data){ const db=await openDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readwrite'); const req=tx.objectStore(STORE).put({key,data,updated_at:new Date().toISOString()}); req.onsuccess=()=>resolve(true); req.onerror=()=>reject(req.error); }); }
  function statusEl(){ let el=document.getElementById('yx-sync-status'); if(el) return el; el=document.createElement('div'); el.id='yx-sync-status'; el.className='yx-sync-status'; el.textContent='同步中…'; document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(el),{once:true}); if(document.body) document.body.appendChild(el); return el; }
  function setStatus(text,type){ try{ const el=statusEl(); el.textContent=text; el.dataset.type=type||'ok'; }catch(_){} }
  window.YXCache={get:idbGet,set:idbSet,key:normKey,setStatus};
  const rawFetch=window.fetch.bind(window);
  window.fetch=async function(input,opt){
    const url=(typeof input==='string')?input:(input&&input.url)||'';
    if(!isCacheable(url,opt)) return rawFetch(input,opt);
    const key=normKey(url); setStatus('同步中…','syncing');
    try{
      const res=await rawFetch(input,{cache:'no-store',...(opt||{})});
      const clone=res.clone();
      clone.json().then(data=>{ if(res.ok && data && data.success!==false) idbSet(key,data).catch(()=>{}); }).catch(()=>{});
      setStatus('已同步 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}),'ok');
      return res;
    }catch(e){
      try{ const cached=await idbGet(key); if(cached){ setStatus('離線模式｜顯示快取資料','offline'); return new Response(JSON.stringify(cached.data),{status:200,headers:{'Content-Type':'application/json','X-YX-Cache':'1'}}); } }catch(_){}
      setStatus('同步失敗','error'); throw e;
    }
  };
})();
