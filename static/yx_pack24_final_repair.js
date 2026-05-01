/* PACK24: stable repair without washing existing UI. Fix today summary, RDT material, customer region instant move, centered material tag, batch edit position. */
(function(){
  'use strict';
  if(window.__YX_PACK24_FINAL_REPAIR__) return; window.__YX_PACK24_FINAL_REPAIR__=true;
  const $=id=>document.getElementById(id);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page=()=>document.querySelector('.module-screen')?.dataset?.module || (location.pathname.includes('today')?'today':'');
  const api=async(url,opt={})=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{}}catch(_){d={ok:false,error:txt}};if(!r.ok||d.ok===false||d.success===false)throw new Error(d.error||d.message||txt||`HTTP ${r.status}`);return d};
  window.toast = window.toast || function(m){const t=$('clean-toast'); if(t){t.textContent=m||'完成'; t.classList.remove('hidden'); clearTimeout(window.__yx24Toast); window.__yx24Toast=setTimeout(()=>t.classList.add('hidden'),1600);} };

  const MATERIALS=['TD','MER','DF','SP','SPF','HF','尤加利','LVL','RDT'];
  function patchMaterialSelects(){
    $$('select').forEach(sel=>{
      const text=clean(sel.textContent);
      if(sel.id==='yx-batch-material'||sel.id==='batch-material'||sel.name==='material'||/批量增加材質|不指定材質|TD|MER|SPF|尤加利|RDT/.test(text)){
        const first = /不指定/.test(text) ? '不指定材質' : '批量增加材質';
        if(!MATERIALS.every(m=>text.includes(m)) || /紅木|花梨|黑檀|柚木/.test(text)){
          sel.innerHTML = `<option value="">${first}</option>` + MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('');
        }
      }
    });
  }

  async function loadTodaySummary24(){
    if(page()!=='today') return;
    const ids=['today-inbound-list','today-outbound-list','today-order-list'];
    try{
      const d=await api('/api/today?pack24=1&ts='+Date.now());
      const s=d.unplaced_summary||{};
      const A=Number(s.A||0), B=Number(s.B||0), U=Number(s['未指定']||s.unknown||0), T=A+B+U;
      const badge=$('today-unread-badge'); if(badge) badge.textContent=Number(d.unread||0);
      ids.forEach(id=>{const el=$(id); if(el) el.innerHTML='<span class="muted">無</span>';});
      const html=`<div class="yx24-today-grid">
        <div class="yx24-today-card"><b>A區未錄入</b><strong>${A}</strong><span>件</span></div>
        <div class="yx24-today-card"><b>B區未錄入</b><strong>${B}</strong><span>件</span></div>
        <div class="yx24-today-card"><b>未指定區域</b><strong>${U}</strong><span>件</span></div>
        <div class="yx24-today-card total"><b>總件數</b><strong>${T}</strong><span>件</span></div>
      </div>`;
      const u=$('today-unplaced-list'); if(u) u.innerHTML=html;
      const sum=$('today-summary-cards'); if(sum) sum.innerHTML=`<div class="yx24-today-summary"><b>未錄入倉庫圖</b><span>A區 ${A}件</span><span>B區 ${B}件</span><span>未指定 ${U}件</span><strong>總計 ${T}件</strong></div>`;
      await api('/api/today/read',{method:'POST'}).catch(()=>{});
    }catch(e){
      const u=$('today-unplaced-list')||$('today-summary-cards');
      if(u) u.innerHTML=`<div class="error-card">今日異動讀取失敗：${esc(e.message)}</div>`;
    }
  }
  function bindTodayRefresh24(){
    if(page()!=='today') return;
    const btn=$('yx112-refresh-today');
    if(btn){ btn.onclick=(ev)=>{ev.preventDefault(); ev.stopPropagation(); loadTodaySummary24();}; }
    // Force once after legacy scripts finish so stale loadToday cannot overwrite it with 無.
    [100,600,1400].forEach(t=>setTimeout(loadTodaySummary24,t));
  }

  function centerMaterialCells(){
    $$('.yx-material').forEach(td=>{
      const val=clean(td.textContent||'未填材質');
      if(!td.querySelector('.mat-tag')) td.innerHTML=`<span class="mat-tag yx24-centered-material">${esc(val)}</span>`;
    });
  }

  function patchProductToolbar24(){
    if(!['inventory','orders','master_order'].includes(page())) return;
    patchMaterialSelects();
    const tools=document.querySelector('.yx-table-tools'); if(!tools) return;
    tools.classList.add('yx24-toolbar-one-line');
    const del=$('yx-batch-delete');
    const apply=$('yx-apply-material');
    [del,apply].forEach(b=>{if(b)b.classList.add('yx24-action-btn')});
    let edit=$('yx24-batch-edit')||$('yx22-batch-edit');
    if(!edit){
      edit=document.createElement('button'); edit.id='yx24-batch-edit'; edit.type='button'; edit.className='yx-chip-btn yx24-action-btn'; edit.textContent='批量編輯';
      edit.onclick=async()=>{
        const rows=$$('.yx-row-check:checked').map(c=>({id:Number(c.value||0),src:c.dataset.source||c.closest('tr')?.dataset.source||''})).filter(x=>x.id);
        if(!rows.length) return window.toast('請先勾選商品');
        const mat=prompt('批量編輯材質（空白不修改）',''); if(mat===null) return;
        for(const r of rows){ await api(`/api/item/${r.src}/${r.id}`,{method:'POST',body:JSON.stringify({material:mat})}); }
        window.toast('已批量編輯');
        if(typeof window.selectCustomer==='function' && window.__yxSelectedCustomer) window.selectCustomer(window.__yxSelectedCustomer); else location.reload();
      };
    }
    if(del && edit.parentNode!==tools) del.insertAdjacentElement('beforebegin',edit);
    else if(del) del.insertAdjacentElement('beforebegin',edit);
    centerMaterialCells();
  }

  function regionListId(region){return region==='中區'?'region-center':region==='南區'?'region-south':'region-north'}
  function findCustomerCard(name){
    const n=clean(name).replace(/\b(CNF|FOB代付|FOB代|FOB)\b/g,'').trim();
    return $$('#region-north .customer-chip,#region-center .customer-chip,#region-south .customer-chip,#region-north button,#region-center button,#region-south button').find(el=>{
      const t=clean(el.dataset.customerName||el.textContent||'').replace(/\d+\s*件\s*\/\s*\d+\s*筆/g,'').replace(/\b(CNF|FOB代付|FOB代|FOB)\b/g,'').trim();
      return t===n || t.includes(n) || n.includes(t);
    });
  }
  function moveCustomerCardImmediately(name, region){
    const card=findCustomerCard(name); const target=$(regionListId(region));
    if(card && target){
      const muted=target.querySelector('.muted'); if(muted) muted.remove();
      target.prepend(card); card.classList.add('yx24-moved-card'); setTimeout(()=>card.classList.remove('yx24-moved-card'),1200);
      card.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  }
  function patchCustomerMove24(){
    if(!['orders','master_order','master_orders'].includes(page())) return;
    document.addEventListener('click', ev=>{
      const b=ev.target.closest('.yx18-menu button[data-act="move"]');
      if(!b) return;
      const menu=b.closest('.yx18-menu'); const title=clean(menu?.querySelector('.yx18-title')?.textContent||''); const region=b.dataset.region;
      if(title && region) setTimeout(()=>moveCustomerCardImmediately(title,region),50);
    }, true);
  }

  function boot24(){
    patchMaterialSelects(); bindTodayRefresh24(); patchProductToolbar24(); patchCustomerMove24(); centerMaterialCells();
    setTimeout(()=>{patchMaterialSelects(); patchProductToolbar24(); centerMaterialCells();},700);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot24,{once:true}); else boot24();
  new MutationObserver(()=>{clearTimeout(window.__yx24MO); window.__yx24MO=setTimeout(()=>{patchMaterialSelects(); patchProductToolbar24(); centerMaterialCells();},160);}).observe(document.documentElement,{childList:true,subtree:true});
})();
