/* PACK20: final fixes for today, warehouse A/B unplaced, order-region visibility, and legacy UI removal */
(function(){
  'use strict';
  if(window.__YX_PACK20_FINAL_FIX__) return;
  window.__YX_PACK20_FINAL_FIX__ = true;
  const $ = id => document.getElementById(id);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page = () => (location.pathname.split('/').filter(Boolean).pop() || 'home');
  async function api(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt = await res.text(); let d={};
    try{ d = txt ? JSON.parse(txt) : {}; }catch(_){ d={ok:false,error:txt||'回應格式錯誤'}; }
    if(!res.ok || d.ok===false || d.success===false) throw new Error(d.error||d.message||`請求失敗 ${res.status}`);
    return d;
  }
  function toast(m,k='ok'){try{(window.toast||window.showToast||console.log)(m,k)}catch(_){}}

  function removeLegacyWarehouseBits(){
    // remove the old bottom area and duplicate buttons that caused jumping and stale A/B display
    $$('body > .warehouse-zone-wrap, body > .warehouse-zone-wrap *, body > .warehouse-zone-nav, body > #yx15-warehouse-wrap').forEach(el=>{
      if(!el.closest('#yx17-warehouse-root')) el.remove?.();
    });
    $$('.warehouse-zone-wrap,.warehouse-zone-nav,#yx15-warehouse-wrap,.yx15-warehouse-wrap,.yx-warehouse-final13,.yx105-warehouse-grid,#yx105-warehouse-detail-panel').forEach(el=>{
      if(!el.closest('#yx17-warehouse-root')){ el.style.display='none'; el.setAttribute('aria-hidden','true'); }
    });
    // Remove legacy toolbar buttons: current region, old unplaced highlight button, etc.
    $$('button,.pill,.badge,.chip').forEach(el=>{
      const t = clean(el.textContent);
      if(t==='未入倉' || t.startsWith('目前區域：') || t.startsWith('目前區域:')){
        el.style.display='none'; el.setAttribute('aria-hidden','true');
      }
    });
  }

  async function refreshWarehouseUnplacedSummary(){
    if(page()!=='warehouse') return;
    try{
      const d = await api('/api/warehouse/unplaced-summary?ts='+Date.now());
      const s = d.summary || {};
      const text = `未錄入：A區 ${Number(s.A||0)}件｜B區 ${Number(s.B||0)}件｜未指定 ${Number(s['未指定']||0)}件`;
      let el = $('yx20-unplaced-summary');
      const root = $('yx17-warehouse-root');
      if(root && !el){
        el = document.createElement('div'); el.id='yx20-unplaced-summary'; el.className='yx20-unplaced-summary';
        root.prepend(el);
      }
      if(el) el.textContent = text;
      const old = $('yx17-unplaced'); if(old) old.textContent = text;
    }catch(e){ console.warn('pack20 unplaced summary', e); }
  }

  async function loadTodayPack20(){
    if(page()!=='today') return;
    try{
      const d=await api('/api/today?pack20=1&ts='+Date.now());
      const b=$('today-unread-badge'); if(b)b.textContent=Number(d.unread||0);
      const logs=d.logs||d.items||[];
      const groups={inbound:[],outbound:[],orders:[]};
      logs.forEach(x=>{const c=clean(x.category||x.type||''); if(c.includes('出')) groups.outbound.push(x); else if(c.includes('訂')||c==='orders') groups.orders.push(x); else groups.inbound.push(x);});
      const ids={inbound:'today-inbound-list',outbound:'today-outbound-list',orders:'today-order-list'};
      Object.entries(ids).forEach(([k,id])=>{const host=$(id); if(!host)return; const arr=groups[k]||[]; host.innerHTML=arr.length?arr.slice(0,30).map(x=>`<div class="today-item-card"><b>${esc(x.action||'異動')}</b><span>${esc(x.customer||'')}</span><span>${esc(x.product||'')}</span><em>${Number(x.qty||0)||''}${x.qty?'件':''}</em></div>`).join(''):'<span class="muted">無</span>';});
      const host=$('today-unplaced-list');
      if(host){const s=d.unplaced_summary||{}; host.innerHTML=`<div class="today-unplaced-summary"><div class="sum-card"><div>A區</div><b>${Number(s.A||0)}件</b></div><div class="sum-card"><div>B區</div><b>${Number(s.B||0)}件</b></div><div class="sum-card"><div>未指定區域</div><b>${Number(s['未指定']||0)}件</b></div></div>`;}
      const summary=$('today-summary-cards'); if(summary) summary.innerHTML=`<div class="today-item-card"><b>今日異動</b><span>${logs.length}筆</span><em>未錄入 ${Number(d.unplaced_total||0)}件</em></div>`;
      try{ await api('/api/today/read',{method:'POST'}); }catch(_){ }
    }catch(e){
      // Avoid blocking whole page with browser alert; show readable error card instead.
      const host=$('today-summary-cards')||$('today-unplaced-list')||document.querySelector('main');
      if(host) host.innerHTML=`<div class="error-card">今日異動讀取失敗：${esc(e.message)}</div>`;
      console.error(e);
    }
  }

  async function enforceRegionCustomers(){
    const p=page();
    if(!['orders','master_order','ship'].includes(p)) return;
    try{
      const mod = p==='master_order'?'master_order':(p==='ship'?'ship':'orders');
      const d=await api('/api/regions/'+mod+'?pack20=1&ts='+Date.now());
      const map={'北區':'region-north','中區':'region-center','南區':'region-south'};
      Object.entries(map).forEach(([r,id])=>{
        const el=$(id); if(!el)return;
        const arr=(d.details&&d.details[r]||[]).filter(x=>Number(x.qty||0)>0 || Number(x.count||0)>0);
        if(!arr.length){el.innerHTML='<span class="muted">無</span>';return;}
        el.innerHTML=arr.map(x=>`<button type="button" class="customer-chip customer-card" data-customer="${esc(x.name)}"><span class="cust-name">${esc(x.display_name||x.name)}</span><span class="cust-term">${esc((x.terms||[]).join('/')||'')}</span><span class="cust-count">${Number(x.qty||0)}件 / ${Number(x.count||0)}筆</span></button>`).join('');
      });
    }catch(e){console.warn('pack20 region filter',e)}
  }

  function bindWarehouseZoneObserver(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-yx17-zone]');
      if(!b) return;
      setTimeout(()=>{removeLegacyWarehouseBits(); refreshWarehouseUnplacedSummary();},80);
    },true);
  }

  function install(){
    removeLegacyWarehouseBits();
    refreshWarehouseUnplacedSummary();
    loadTodayPack20();
    enforceRegionCustomers();
    bindWarehouseZoneObserver();
    const refreshBtn=$('today-refresh-btn')||document.querySelector('button[onclick*="loadToday"],button[onclick*="Today"]');
    if(refreshBtn && !refreshBtn.dataset.yx20Bound){refreshBtn.dataset.yx20Bound='1'; refreshBtn.addEventListener('click',()=>setTimeout(loadTodayPack20,50),true);}
    if(page()==='warehouse'){
      let n=0; const t=setInterval(()=>{removeLegacyWarehouseBits(); refreshWarehouseUnplacedSummary(); if(++n>8)clearInterval(t);},350);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
