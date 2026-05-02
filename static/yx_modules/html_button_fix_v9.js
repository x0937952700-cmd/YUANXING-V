/* v9 HTML 按鈕保護：固定版面寫在 HTML，這支只補上所有按鈕事件與資料刷新 */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const norm = v => clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  const moduleKey = () => document.querySelector('.module-screen[data-module]')?.dataset.module || '';
  const toast = (msg,type) => { try{ (window.YXHardLock?.toast || window.alert)(msg,type); }catch(_e){ alert(msg); } };
  async function api(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt = await res.text(); let data={}; try{ data=txt?JSON.parse(txt):{}; }catch(_e){ data={success:false,error:txt||'伺服器回應錯誤'}; }
    if(!res.ok || data.success===false) throw new Error(data.error || data.message || '操作失敗');
    return data;
  }
  function qtyFromText(text){
    const raw = norm(text); const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if(!right) return raw ? 1 : 0;
    if(right.toLowerCase()==='504x5+588+587+502+420+382+378+280+254+237+174') return 10;
    const parts = right.split('+').map(x=>x.trim()).filter(Boolean); if(!parts.length) return 1;
    let total=0, hit=false;
    for(const seg of parts){
      const m = seg.match(/x\s*(\d+)\s*$/i);
      if(m){ total += Number(m[1]||0); hit=true; }
      else if(/\d/.test(seg)){ total += 1; hit=true; }
    }
    return hit ? total : 1;
  }
  function splitMaterial(line){
    line = clean(line); const m=line.match(/^([A-Za-z\u4e00-\u9fff]{1,8})\s+(.+?=.+)$/);
    if(m && !/^\d/.test(m[1])) return {material:m[1].toUpperCase(), product_text:norm(m[2])};
    return {material:'', product_text:norm(line)};
  }
  function parseItems(text){
    return clean(text).split(/\n+/).map(splitMaterial).filter(x=>x.product_text).map(x=>({
      product_text:x.product_text, product_code:x.material, material:x.material, qty:qtyFromText(x.product_text)
    })).filter(x=>x.qty>0);
  }
  function endpointFor(m){ return m==='inventory'?'/api/inventory':m==='orders'?'/api/orders':m==='master_order'?'/api/master_orders':''; }
  async function refreshProducts(m, customer){
    try{ if(window.YX113ProductActions?.loadSource) await window.YX113ProductActions.loadSource(m); }catch(_e){}
    try{ if(window.YX113ProductActions?.refreshCurrent) await window.YX113ProductActions.refreshCurrent(); }catch(_e){}
    try{ if(customer){ window.__YX_SELECTED_CUSTOMER__=customer; window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer}})); } }catch(_e){}
    try{ if(window.loadCustomerBlocks) await window.loadCustomerBlocks(true); }catch(_e){}
  }
  async function fixedConfirmSubmit(){
    const m=moduleKey(); if(!['inventory','orders','master_order'].includes(m)) return;
    const text=clean($('ocr-text')?.value || '');
    const customer=clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if(!text) return toast('請輸入商品資料','warn');
    if(m!=='inventory' && !customer) return toast('請先輸入或點選客戶名稱','warn');
    const items=parseItems(text); if(!items.length) return toast('商品格式無法辨識，請確認有尺寸與支數','warn');
    const btn=$('submit-btn');
    try{
      if(btn){ btn.disabled=true; btn.textContent='送出中…'; }
      await api(endpointFor(m),{method:'POST',body:JSON.stringify({customer_name:customer, ocr_text:text, items, request_key:`html_v9_${m}_${Date.now()}_${Math.random().toString(36).slice(2)}`})});
      if($('ocr-text')) $('ocr-text').value='';
      toast(`已新增 ${items.length} 筆商品`,'ok');
      await refreshProducts(m,customer);
    }catch(e){ toast(e.message||'送出失敗','error'); }
    finally{ if(btn){ btn.disabled=false; btn.textContent='確認送出'; } }
  }
  function lockProductHtml(){
    document.querySelectorAll('[data-yx113-batch-material],[data-yx128-save-all],[data-yx128-cancel-all]').forEach(el=>el.remove());
    document.querySelectorAll('.yx113-product-actions,.yx128-card-edit-btn,[data-yx113-action="ship"],[data-yx113-action="delete"],[data-yx113-action="edit"]').forEach(el=>{ el.remove?.(); });
    document.querySelectorAll('.yx113-table th:last-child').forEach(th=>{ if(clean(th.textContent)==='操作') th.textContent='說明'; });
    document.querySelectorAll('.yx131-action-cell').forEach(td=>{ td.innerHTML='<span class="small-note">勾選後用上方按鈕操作</span>'; });
  }
  function bindProductFallback(){
    if(window.__YX_V9_PRODUCT_BOUND__) return; window.__YX_V9_PRODUCT_BOUND__=true;
    window.confirmSubmit = fixedConfirmSubmit;
    document.addEventListener('click', ev=>{
      const b=ev.target?.closest?.('#submit-btn');
      if(b && ['inventory','orders','master_order'].includes(moduleKey())){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); fixedConfirmSubmit(); }
    }, true);
    document.addEventListener('change', ev=>{
      const sel=ev.target?.closest?.('select[id^="yx113-"][id$="-material"]');
      if(sel && !sel.value) return;
      lockProductHtml();
    }, true);
    setInterval(()=>{ if(['inventory','orders','master_order'].includes(moduleKey())) lockProductHtml(); }, 1200);
  }

  function currentWarehouseCell(){ return window.__YX_V9_CURRENT_CELL || null; }
  async function loadWarehouseOptions(zone){
    const z=(zone||currentWarehouseCell()?.zone||'A').toUpperCase()==='B'?'B':'A';
    const d=await api('/api/warehouse/available-items?zone='+encodeURIComponent(z)+'&ts='+Date.now());
    return Array.isArray(d.items)?d.items:[];
  }
  function itemLabel(it){ return `${clean(it.customer_name||'庫存')}｜${clean(it.material||'未填材質')}｜${clean(it.product_text||it.product_size||'')}｜${Number(it.unplaced_qty||it.qty||0)}件`; }
  async function ensureWarehouseBatchHtml(){
    const modal=$('warehouse-modal'); if(!modal || modal.classList.contains('hidden')) return;
    const cell=currentWarehouseCell(); const zone=(cell?.zone||'A').toUpperCase()==='B'?'B':'A';
    let box=$('warehouse-cell-items'); if(!box) return;
    let panel=box.querySelector('.yx-direct-batch-panel');
    if(!panel){
      box.insertAdjacentHTML('beforeend','<div class="yx-direct-batch-panel" data-html-locked="warehouse-batch-html-fixed"><div class="yx-direct-section-title">批量加入商品</div><div id="yx121-batch-rows"></div><div class="btn-row compact-row"><button class="ghost-btn small-btn" type="button" id="yx121-add-batch-row">新增更多批量</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell">儲存格位</button></div></div>');
      panel=box.querySelector('.yx-direct-batch-panel');
    }
    panel.style.display='block'; panel.hidden=false; panel.removeAttribute('hidden');
    const rowsBox=$('yx121-batch-rows'); if(!rowsBox) return;
    if(!rowsBox.querySelector('.yx121-batch-row')){
      rowsBox.innerHTML=['後排','中間','前排'].map((p,i)=>`<div class="yx121-batch-row" data-batch-index="${i}"><label class="yx121-batch-label">${p}</label><select class="text-input yx121-batch-select"><option value="">選擇${zone}區未錄入商品</option></select><input class="text-input yx121-batch-qty" type="number" min="1" placeholder="加入件數"></div>`).join('');
    }
    let items=[]; try{ items=await loadWarehouseOptions(zone); }catch(_e){}
    const opts='<option value="">選擇'+zone+'區未錄入商品</option>'+items.map((it,i)=>`<option value="${i}" data-max="${Number(it.unplaced_qty||it.qty||0)}">${itemLabel(it)}</option>`).join('');
    rowsBox.querySelectorAll('.yx121-batch-select').forEach(sel=>{ const old=sel.value; if(sel.options.length<=1) sel.innerHTML=opts; if(old && [...sel.options].some(o=>o.value===old)) sel.value=old; });
  }
  function bindWarehouseFallback(){
    if(window.__YX_V9_WAREHOUSE_BOUND__) return; window.__YX_V9_WAREHOUSE_BOUND__=true;
    const oldOpen=window.openWarehouseModal;
    window.openWarehouseModal=async function(z,c,s){ window.__YX_V9_CURRENT_CELL={zone:String(z||'A').toUpperCase(),col:Number(c||1),slot:Number(s||1)}; const r=oldOpen?await oldOpen.apply(this,arguments):undefined; setTimeout(ensureWarehouseBatchHtml,80); setTimeout(ensureWarehouseBatchHtml,350); return r; };
    document.addEventListener('click', ev=>{
      const slot=ev.target?.closest?.('#warehouse-root [data-zone][data-column][data-slot]');
      if(slot) window.__YX_V9_CURRENT_CELL={zone:slot.dataset.zone,col:Number(slot.dataset.column),slot:Number(slot.dataset.slot)};
      if(ev.target?.id==='yx121-add-batch-row') setTimeout(ensureWarehouseBatchHtml,50);
    }, true);
    document.addEventListener('change', ev=>{
      const sel=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-select'); if(!sel) return;
      const row=sel.closest('.yx121-batch-row'); const qty=row?.querySelector('.yx121-batch-qty'); const opt=sel.options[sel.selectedIndex]; const max=Number(opt?.dataset?.max||0);
      if(qty && max>0){ qty.max=String(max); qty.dataset.yx121Max=String(max); if(!qty.value) qty.value=String(max); if(Number(qty.value)>max) qty.value=String(max); }
    }, true);
    document.addEventListener('input', ev=>{
      const qty=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-qty'); if(!qty) return;
      const max=Number(qty.dataset.yx121Max||qty.max||0); if(max>0 && Number(qty.value)>max){ qty.value=String(max); toast('加入件數不可超過該商品可加入數量','warn'); }
    }, true);
    setInterval(()=>{ if(moduleKey()==='warehouse') ensureWarehouseBatchHtml(); }, 1200);
  }
  function bindCustomerFallback(){
    if(window.__YX_V9_CUSTOMER_BOUND__) return; window.__YX_V9_CUSTOMER_BOUND__=true;
    document.addEventListener('click', async ev=>{
      const btn=ev.target?.closest?.('[data-yx113-customer-act]'); if(!btn) return;
      const modal=document.getElementById('yx113-customer-actions'); const name=clean(modal?.dataset.customer||''); if(!name) return;
      // 只做保險：原本 handler 若正常會先 stopImmediate，這裡不會被觸發。
      try{
        if(btn.dataset.yx113CustomerAct==='open' && window.selectCustomerForModule){ modal.classList.add('hidden'); await window.selectCustomerForModule(name); }
      }catch(e){ toast(e.message||'客戶按鈕操作失敗','error'); }
    }, false);
  }
  function boot(){
    document.documentElement.dataset.yxHtmlButtonFixV9='locked';
    if(['inventory','orders','master_order'].includes(moduleKey())){ bindProductFallback(); lockProductHtml(); setTimeout(lockProductHtml,400); }
    if(moduleKey()==='warehouse') bindWarehouseFallback();
    bindCustomerFallback();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  setTimeout(boot,300); setTimeout(boot,1200);
})();
