// CLEAN V12 single external JS for this page. Old FIX JS is not loaded.
(function(){
  'use strict';
  if (window.__YX_CLEAN_COMMON__) return; window.__YX_CLEAN_COMMON__ = true;
  window.$ = window.$ || ((s, r=document)=>r.querySelector(s));
  window.$$ = window.$$ || ((s, r=document)=>Array.from(r.querySelectorAll(s)));
  window.yxApi = async function(url, opt={}){
    const o = Object.assign({credentials:'same-origin'}, opt);
    o.headers = Object.assign({'Content-Type':'application/json'}, o.headers||{});
    const r = await fetch(url, o); let data={}; try{data=await r.json();}catch(e){}
    if(!r.ok || data.success===false){ throw new Error(data.message || data.error || ('HTTP '+r.status)); }
    return data;
  };
  window.yxToast = function(msg){
    let el = $('#yx-clean-toast'); if(!el){ el=document.createElement('div'); el.id='yx-clean-toast'; el.style.cssText='position:fixed;right:18px;top:18px;z-index:99999;background:#111827;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px #0002;font-weight:700;max-width:70vw'; document.body.appendChild(el); }
    el.textContent=msg; el.style.display='block'; clearTimeout(el._t); el._t=setTimeout(()=>el.style.display='none',2600);
  };
  window.yxErr = e => yxToast((e && e.message) ? e.message : String(e||'操作失敗'));
  window.yxQty = function(text){
    text=String(text||''); const rhs=(text.split('=')[1]||text).trim(); if(!rhs) return 0;
    return rhs.split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,p)=>{ const m=p.match(/(?:^|\D)(\d+)\s*[xX×*]\s*(\d+)$/); if(m) return sum+parseInt(m[2]||0,10); return sum+1; },0);
  };
  window.yxMaterial = function(row){ return (row.material || row.product_code || '未填材質').trim(); };
  window.yxSize = function(row){ return (row.product_text || row.product || '').trim(); };

  window.yxLoadRegionPicker = async function(){
    const mod = (document.querySelector('.module-screen')||{}).dataset?.module;
    if(!['orders','master_order','ship'].includes(mod)) return;
    try{
      const d = await yxApi('/api/customers');
      const items = d.items || [];
      const boxes = {'北區':'#region-north','中區':'#region-center','南區':'#region-south'};
      Object.entries(boxes).forEach(([region, sel])=>{
        const box = $(sel); if(!box) return;
        const list = items.filter(c=>(c.region||'北區')===region);
        box.innerHTML = list.map(c=>`<button class="customer-chip" type="button" data-yx-region-customer="${c.name}">${c.name}</button>`).join('') || '<div class="muted">無客戶</div>';
      });
    }catch(e){ yxErr(e); }
  };
  document.addEventListener('click', e=>{
    const b=e.target.closest('[data-yx-region-customer]'); if(!b) return;
    const inp=$('#customer-name'); if(inp) { inp.value=b.dataset.yxRegionCustomer; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  });
  document.addEventListener('DOMContentLoaded', ()=>{ yxLoadRegionPicker(); });

})();
