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

(function(){'use strict'; if(window.__YX_PAGE_TODAY__) return; window.__YX_PAGE_TODAY__=true; let filter='all';
function row(x){return `<div class="glass panel yx-today-row"><strong>${x.title||x.action||x.kind||'異動'}</strong><div>${x.message||x.detail||x.description||''}</div><small>${x.created_at||x.time||''}｜${x.username||x.operator||''}</small></div>`;}
async function load(){try{const d=await yxApi('/api/today-changes'); const items=d.items||d.logs||[]; const badge=$('#today-unread-badge'); if(badge) badge.textContent=String(d.unread_count||0); const groups={inbound:[],outbound:[],orders:[],unplaced:[]}; items.forEach(x=>{let k=String(x.kind||x.category||x.action||'').toLowerCase(); let g=k.includes('ship')||k.includes('出貨')?'outbound':k.includes('order')||k.includes('訂單')?'orders':k.includes('unplaced')||k.includes('未錄入')?'unplaced':'inbound'; groups[g].push(x);}); const ids={inbound:'#today-inbound-list',outbound:'#today-outbound-list',orders:'#today-order-list',unplaced:'#today-unplaced-list'}; Object.entries(ids).forEach(([k,sel])=>{const box=$(sel); if(box) box.innerHTML=groups[k].map(row).join('')||'<div class="muted">無資料</div>';}); const sum=$('#today-summary-cards'); if(sum) sum.innerHTML=`<div class="today-summary-card">進貨 ${groups.inbound.length}</div><div class="today-summary-card">出貨 ${groups.outbound.length}</div><div class="today-summary-card">訂單 ${groups.orders.length}</div><div class="today-summary-card">未錄入 ${groups.unplaced.length}</div>`; applyFilter(); await yxApi('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}).catch(()=>{});}catch(e){yxErr(e);}}
function applyFilter(){ $$('[data-today-panel]').forEach(p=>p.style.display=(filter==='all'||p.dataset.todayPanel===filter)?'':'none'); $$('[data-today-filter]').forEach(b=>b.classList.toggle('active',b.dataset.todayFilter===filter));}
document.addEventListener('click',e=>{const f=e.target.closest('[data-today-filter]'); if(f){filter=f.dataset.todayFilter; applyFilter();} if(e.target.id==='yx112-refresh-today') load();}); document.addEventListener('DOMContentLoaded',load); if(document.readyState!=='loading') load();
})();
