/* CURRENT TARGETED FIX: based on uploaded current.zip. Does not wash UI. */
(function(){
  'use strict';
  if(window.__YX_CURRENT_TARGETED_FIX__) return;
  window.__YX_CURRENT_TARGETED_FIX__=true;
  const MATERIALS=['TD','MER','DF','SP','SPF','HF','RDT','尤加利','LVL'];
  const $=id=>document.getElementById(id);
  const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const page=()=>document.querySelector('.module-screen')?.dataset?.module || '';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=async(url,opt={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',...opt}); const ct=r.headers.get('content-type')||''; const d=ct.includes('json')?await r.json():{ok:false,message:await r.text()}; if(!r.ok||d.ok===false||d.success===false) throw new Error(d.error||d.message||'操作失敗'); return d;};
  const toast=(m)=>{let t=$('clean-toast'); if(t){t.textContent=m;t.classList.remove('hidden');clearTimeout(window.__yxCurrentToast);window.__yxCurrentToast=setTimeout(()=>t.classList.add('hidden'),1800);}else alert(m);};
  function sourceByPage(){const p=page(); return p==='orders'?'orders':p==='master_order'?'master_orders':'inventory';}
  function splitProductFromRow(tr){
    const size=clean(tr.querySelector('.yx-size')?.textContent || tr.children[2]?.textContent || '');
    const expr=clean(tr.querySelector('.yx-qty')?.textContent || tr.children[3]?.textContent || '');
    return expr && !/件$/.test(expr) ? `${size}=${expr}` : size;
  }
  function normalizeMaterialText(v){
    v=clean(v).replace(/^批量增加材質/g,'').trim();
    // If old broken text concatenated all options, clear it for display/edit instead of showing garbage.
    const all=MATERIALS.join('');
    if(v.includes(all) || /^TDMERDF/.test(v)) return '';
    return v;
  }
  function patchMaterialSelects(root=document){
    $$('select',root).forEach(sel=>{
      const text=Array.from(sel.options||[]).map(o=>o.textContent).join('|');
      const id=sel.id||'';
      if(id==='yx-batch-material'||id==='batch-material'||id.includes('material')||/批量增加材質|TD|MER|RDT|尤加利|LVL|紅木|花梨|黑檀|柚木/.test(text)){
        const cur=sel.value;
        const first=/不指定/.test(text)?'不指定材質':'批量增加材質';
        sel.innerHTML=`<option value="">${first}</option>`+MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('');
        if(MATERIALS.includes(cur)) sel.value=cur;
      }
    });
  }
  function cleanMaterialCells(root=document){
    $$('.yx-product-table tbody tr',root).forEach(tr=>{
      const td=tr.querySelector('.yx-material') || tr.children[1];
      if(!td || td.querySelector('input,select')) return;
      let val=normalizeMaterialText(td.textContent);
      td.innerHTML=`<span class="yx-current-mat-pill">${esc(val||'未填材質')}</span>`;
    });
  }
  function selectedRows(){
    return $$('.yx-product-table tbody tr').filter(tr=>tr.querySelector('.yx-row-check')?.checked).filter(tr=>tr.dataset.id||tr.querySelector('.yx-row-check')?.value);
  }
  function targetRows(){
    const rows=$$('.yx-product-table tbody tr').filter(tr=>tr.querySelector('.yx-row-check') && (tr.dataset.id||tr.querySelector('.yx-row-check')?.value));
    const sel=selectedRows();
    return sel.length?sel:rows;
  }
  function bindRowSelection(root=document){
    $$('.yx-product-table tbody tr',root).forEach(tr=>{
      if(tr.dataset.yxCurrentRowBind) return; tr.dataset.yxCurrentRowBind='1';
      tr.addEventListener('click',ev=>{
        if(ev.target.closest('button,input,select,textarea,a')) return;
        const cb=tr.querySelector('.yx-row-check'); if(cb){cb.checked=!cb.checked; tr.classList.toggle('yx-row-selected',cb.checked);}
      });
      const cb=tr.querySelector('.yx-row-check'); if(cb&&!cb.dataset.yxCurrentCheckBind){cb.dataset.yxCurrentCheckBind='1';cb.addEventListener('click',ev=>{ev.stopPropagation();tr.classList.toggle('yx-row-selected',cb.checked);});}
    });
  }
  function removeExtraBatchEditButtons(){
    const tools=document.querySelector('.yx-table-tools'); if(!tools) return;
    tools.classList.add('yx-current-tools');
    const edits=$$('button',tools).filter(b=>clean(b.textContent)==='批量編輯');
    // Keep only one edit button; remove the duplicate one shown in the user's screenshot.
    let keep=$('yx-current-batch-edit') || edits[0];
    edits.forEach(b=>{if(b!==keep)b.remove();});
    if(!keep){keep=document.createElement('button');keep.type='button';keep.textContent='批量編輯';}
    keep.id='yx-current-batch-edit'; keep.classList.add('yx-chip-btn','yx22-unified-btn','yx-current-batch-edit');
    const del=$('yx-batch-delete') || $$('button',tools).find(b=>clean(b.textContent)==='批量刪除');
    if(del && keep.previousElementSibling!==del) del.insertAdjacentElement('afterend',keep); else if(!keep.parentNode) tools.appendChild(keep);
    keep.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();startBatchEdit();};
  }
  function ensureSaveButton(){
    const tools=document.querySelector('.yx-table-tools'); if(!tools) return null;
    let b=$('yx-current-save-batch-edit');
    if(!b){b=document.createElement('button');b.id='yx-current-save-batch-edit';b.type='button';b.textContent='儲存批量編輯';b.className='yx-chip-btn yx22-unified-btn yx-current-save-edit';tools.appendChild(b);}
    b.onclick=saveBatchEdit; b.style.display='inline-flex'; return b;
  }
  function startBatchEdit(){
    if(!['inventory','orders','master_order'].includes(page())) return;
    const rows=targetRows();
    if(!rows.length) return toast('目前沒有商品可編輯');
    rows.forEach(tr=>{
      if(tr.dataset.yxCurrentEditing) return; tr.dataset.yxCurrentEditing='1';
      const matCell=tr.querySelector('.yx-material')||tr.children[1], sizeCell=tr.children[2], exprCell=tr.children[3], qtyCell=tr.children[4], zoneCell=tr.children[5];
      const mat=normalizeMaterialText(matCell?.textContent||''), size=clean(sizeCell?.textContent||''), expr=clean(exprCell?.textContent||''), qty=clean(qtyCell?.textContent||''), zone=clean(zoneCell?.textContent||'');
      if(matCell) matCell.innerHTML=`<select class="yx-current-edit-select" data-field="material"><option value="">未填材質</option>${MATERIALS.map(m=>`<option value="${m}" ${m===mat?'selected':''}>${m}</option>`).join('')}</select>`;
      if(sizeCell) sizeCell.innerHTML=`<input class="yx-current-edit-input" data-field="size" value="${esc(size)}">`;
      if(exprCell) exprCell.innerHTML=`<input class="yx-current-edit-input" data-field="expr" value="${esc(expr)}">`;
      if(qtyCell) qtyCell.innerHTML=`<input class="yx-current-edit-input" data-field="qty" type="number" min="0" value="${esc(qty)}">`;
      if(zoneCell) zoneCell.innerHTML=`<select class="yx-current-edit-select" data-field="zone"><option value="">未入倉</option><option value="A" ${/A/.test(zone)?'selected':''}>A</option><option value="B" ${/B/.test(zone)?'selected':''}>B</option></select>`;
    });
    ensureSaveButton();
    toast(rows.length+' 筆可直接編輯');
  }
  async function saveBatchEdit(){
    const rows=$$('.yx-product-table tbody tr[data-yx-current-editing="1"]');
    if(!rows.length) return toast('沒有正在編輯的資料');
    const items=rows.map(tr=>{
      const mat=tr.querySelector('[data-field="material"]')?.value||'';
      const size=tr.querySelector('[data-field="size"]')?.value||'';
      const expr=tr.querySelector('[data-field="expr"]')?.value||'';
      const product=expr?`${size}=${expr}`:size;
      const qty=tr.querySelector('[data-field="qty"]')?.value||'';
      const zone=tr.querySelector('[data-field="zone"]')?.value||'';
      const cb=tr.querySelector('.yx-row-check');
      return {id:Number(tr.dataset.id||cb?.value||0), source:tr.dataset.source||cb?.dataset.source||sourceByPage(), product, product_text:product, material:mat, qty, quantity:qty, zone, location:zone};
    }).filter(x=>x.id);
    if(!items.length) return toast('找不到要儲存的資料');
    try{
      for(const it of items){await api(`/api/item/${it.source}/${it.id}`,{method:'POST',body:JSON.stringify(it)});}
      toast('已儲存批量編輯');
      setTimeout(()=>location.reload(),350);
    }catch(e){toast(e.message||'儲存失敗');}
  }
  async function batchDeleteNoConfirm(){
    const rows=selectedRows(); if(!rows.length) return toast('請先勾選商品');
    try{for(const tr of rows){const cb=tr.querySelector('.yx-row-check'); await api(`/api/item/${tr.dataset.source||cb?.dataset.source||sourceByPage()}/${tr.dataset.id||cb?.value}`,{method:'DELETE'});} toast('已批量刪除'); setTimeout(()=>location.reload(),300);}catch(e){toast(e.message||'刪除失敗');}
  }
  function patchBatchToolbar(){
    if(!['inventory','orders','master_order'].includes(page())) return;
    patchMaterialSelects();
    removeExtraBatchEditButtons();
    const del=$('yx-batch-delete') || $$('button').find(b=>clean(b.textContent)==='批量刪除');
    if(del && !del.dataset.yxCurrentDelete){del.dataset.yxCurrentDelete='1';del.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();batchDeleteNoConfirm();};}
    const apply=$('yx-apply-material');
    if(apply) apply.classList.add('yx22-unified-btn');
  }
  function unplacedHTML(s){const A=Number(s.A||0),B=Number(s.B||0),T=A+B;return `<span>A區 <span class="count">${A}件</span></span><span class="sep">｜</span><span>B區 <span class="count">${B}件</span></span><span class="sep">｜</span><span>總計 <span class="count">${T}件</span></span>`;}
  async function loadUnplaced(){
    try{const d=await api('/api/current/unplaced-summary?ts='+Date.now()); return d.summary||d.unplaced_summary||{A:0,B:0};}
    catch(e){return {A:0,B:0};}
  }
  async function renderTodayCurrent(){
    if(page()!=='today') return;
    const s=await loadUnplaced();
    ['today-inbound-list','today-outbound-list','today-order-list'].forEach(id=>{const el=$(id);if(el)el.innerHTML='<span class="muted">無</span>';});
    const html=`<div class="yx-current-unplaced-line">${unplacedHTML(s)}</div>`;
    const u=$('today-unplaced-list'); if(u)u.innerHTML=html;
    // Do not render duplicate top summary; keep original cards clean.
    const top=$('today-summary-cards'); if(top) top.innerHTML='';
    const badge=$('today-unread-badge'); if(badge)badge.textContent='0';
    try{await api('/api/today/read',{method:'POST'});}catch(e){}
  }
  function bindToday(){
    if(page()!=='today') return;
    const btn=$('yx112-refresh-today'); if(btn&&!btn.dataset.yxCurrentRefresh){btn.dataset.yxCurrentRefresh='1';btn.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();renderTodayCurrent();};}
    renderTodayCurrent();
  }
  async function renderWarehouseUnplacedCurrent(){
    if(page()!=='warehouse') return;
    const s=await loadUnplaced();
    const pill=$('warehouse-unplaced-pill') || document.querySelector('.warehouse-meta-bar .pill.warn');
    if(pill){pill.className='pill warn interactive-pill yx-current-unplaced-line';pill.innerHTML=unplacedHTML(s);pill.onclick=null;}
    $$('#yx22-unplaced-summary,.warehouse-meta-bar .pill.warn,.warehouse-toolbar-panel .pill.warn').forEach((el,i)=>{if(el!==pill)el.classList.add('yx-current-unplaced-duplicate');});
  }
  function bindWarehouseLongPress(){
    if(page()!=='warehouse') return;
    const pill=$('warehouse-unplaced-pill')||document.querySelector('.warehouse-meta-bar .pill.warn');
    if(!pill||pill.dataset.yxCurrentLong) return; pill.dataset.yxCurrentLong='1';
    let tm=null; const start=()=>{tm=setTimeout(()=>{renderWarehouseUnplacedCurrent();toast('已更新未入倉件數');},650)}; const stop=()=>clearTimeout(tm);
    pill.addEventListener('mousedown',start);pill.addEventListener('touchstart',start,{passive:true});['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>pill.addEventListener(ev,stop));
  }
  function customerCard(x){
    const terms=(x.terms||[]).join('/'); const name=x.display_name||x.name||'';
    const full=String(x.name||name).replace(/'/g,"\\'");
    return `<button type="button" class="customer-chip customer-card yx-current-region-card" data-customer="${esc(x.name||name)}" onclick="selectCustomer('${full}')"><span class="cust-name">${esc(name)}</span><span class="cust-term">${esc(terms)}</span><span class="cust-count">${Number(x.qty||0)}件 / ${Number(x.count||0)}筆</span></button>`;
  }
  async function renderRegionsCurrent(){
    if(!['orders','master_order','ship'].includes(page())) return;
    const mod=page(); const d=await api('/api/regions/'+encodeURIComponent(mod)+'?current=1&ts='+Date.now());
    const map={'北區':'region-north','中區':'region-center','南區':'region-south'};
    Object.entries(map).forEach(([r,id])=>{const host=$(id); if(!host) return; const arr=(d.details&&d.details[r])||[]; host.innerHTML=arr.length?arr.map(customerCard).join(''):'<span class="muted">無</span>';});
    if(typeof window.yx18BindCustomerLongPress==='function') setTimeout(()=>window.yx18BindCustomerLongPress(),30);
  }
  function hideLegacyRegionUI(){
    if(!['orders','master_order','ship'].includes(page())) return;
    $$('.module-screen .category-grid').forEach(g=>{if(!g.closest('#region-picker-section')) g.classList.add('yx-current-hidden');});
    $$('.module-screen .customer-board').forEach(g=>{if(!g.closest('#region-picker-section')) g.classList.add('yx-current-hidden');});
  }
  function patchAll(){
    patchMaterialSelects(); cleanMaterialCells(); bindRowSelection(); patchBatchToolbar(); hideLegacyRegionUI();
    if(page()==='today') bindToday();
    if(page()==='warehouse'){renderWarehouseUnplacedCurrent();bindWarehouseLongPress();}
  }
  // Override old region renderers by final render, but don't remove card style.
  window.yxCurrentRenderRegions=renderRegionsCurrent;
  document.addEventListener('DOMContentLoaded',()=>{patchAll(); if(['orders','master_order','ship'].includes(page())) setTimeout(renderRegionsCurrent,200);});
  // Mutation observer only patches new table/cards, not rebuilding page repeatedly.
  const mo=new MutationObserver(()=>{clearTimeout(window.__yxCurrentPatchTimer);window.__yxCurrentPatchTimer=setTimeout(patchAll,80);});
  document.addEventListener('DOMContentLoaded',()=>mo.observe(document.body,{childList:true,subtree:true}));
  // Last guard after older delayed redraws.
  setTimeout(()=>{patchAll(); if(['orders','master_order','ship'].includes(page())) renderRegionsCurrent();},900);
})();
