/* ==== PACK15: final convergence for material + FIX105 warehouse + clean UI ==== */
(function(){
  'use strict';
  if(window.__YX_PACK15_FINAL_SEAL__) return;
  window.__YX_PACK15_FINAL_SEAL__ = true;

  const MATERIALS = ['TD','MER','DF','SP','SPF','HF','尤加利','LVL'];
  const $ = id => document.getElementById(id);
  const qsa = (s,root=document)=>Array.from(root.querySelectorAll(s));
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isWarehousePage = () => /\/warehouse/.test(location.pathname||'') || $('zone-A-grid') || $('zone-B-grid') || document.querySelector('.warehouse-map,.warehouse-page');
  const toast = (m,k='ok') => { try{ (window.toast||window.showToast||window.notify||console.log)(m,k); }catch(_){} };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data = {};
    try{ data = text ? JSON.parse(text) : {}; }catch(_){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false || data.ok===false) throw new Error(data.error || data.message || `請求失敗：${res.status}`);
    return data;
  });

  function patchMaterialSelects(){
    const selectors = [
      '#yx-batch-material','#batch-material','#material-select','#materialSelect',
      'select[name="material"]','select[data-material]','select.material-select',
      'select[aria-label*="材質"]'
    ].join(',');
    qsa(selectors).forEach(sel=>{
      if(sel.dataset.yx15Mats === MATERIALS.join('|')) return;
      const oldValue = sel.value;
      const first = clean(sel.querySelector('option')?.textContent || '批量增加材質');
      const label = first.includes('不指定') ? '不指定材質' : '批量增加材質';
      sel.innerHTML = `<option value="">${esc(label)}</option>` + MATERIALS.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
      if(MATERIALS.includes(oldValue)) sel.value = oldValue;
      sel.dataset.yx15Mats = MATERIALS.join('|');
    });
  }

  function parseItems(raw){ if(Array.isArray(raw)) return raw; if(!raw) return []; try{ const v=JSON.parse(raw); return Array.isArray(v)?v:[]; }catch(_){ return []; } }
  function qtyOf(it){ const n = Number(it?.qty ?? it?.quantity ?? it?.total_qty ?? it?.unplaced_qty ?? 0); return Number.isFinite(n) && n>0 ? Math.floor(n) : 1; }
  function productOf(it){ return clean(it?.product_text || it?.product_size || it?.product || it?.size || ''); }
  function materialOf(it){ const raw=clean(it?.material || it?.product_code || '未填材質'); return (!raw || raw.includes('=') || /^\d+(?:x|×)/i.test(raw)) ? '未填材質' : raw; }
  function customerOf(it){ const raw=clean(it?.customer_name || it?.customer || '庫存'); return clean(raw.replace(/\s*(FOB代|FOB|CNF)\s*$/i,'')) || '庫存'; }
  function sourceOf(it){ return clean(it?.source_summary || it?.source_table || it?.source || ''); }
  function wh(){ window.state=window.state||{}; window.state.warehouse=window.state.warehouse||{cells:[],availableItems:[],activeZone:localStorage.getItem('warehouseActiveZone')||'A'}; return window.state.warehouse; }
  function cellAt(zone,col,slot){ return (wh().cells||[]).find(c=>clean(c.zone).toUpperCase()===zone && Number(c.column_index||c.band)===Number(col) && Number(c.slot_number||c.slot)===Number(slot)); }
  function cellItems(zone,col,slot){ const c=cellAt(zone,col,slot); return parseItems(c?.items_json ?? c?.items).map(x=>({...x})); }
  function summarize(items){
    const map=new Map();
    (items||[]).forEach(it=>{ const name=customerOf(it); if(!map.has(name)) map.set(name,{name,qtys:[],total:0}); const q=qtyOf(it); map.get(name).qtys.push(q); map.get(name).total += q; });
    return Array.from(map.values());
  }
  function slotHTML(zone,col,slot){
    const groups=summarize(cellItems(zone,col,slot));
    const filled = groups.length>0;
    const body = filled ? groups.map(g=>`<div class="yx15-slot-group"><div class="yx15-slot-line1"><span class="yx15-slot-num">${slot}</span><span class="yx15-slot-customer">${esc(g.name)}</span></div><div class="yx15-slot-line2"><span class="yx15-slot-sum">${esc(g.qtys.join('+'))}</span><span class="yx15-slot-total">${g.total}件</span></div></div>`).join('') : `<div class="yx15-slot-empty"><span class="yx15-slot-num">${slot}</span><span>空格</span></div>`;
    return `<div class="yx15-slot ${filled?'filled':''}" data-zone="${zone}" data-column="${col}" data-slot="${slot}" draggable="true">${body}</div>`;
  }
  function ensureWarehouseSkeleton(){
    let wrap = $('yx15-warehouse-wrap');
    if(!wrap){
      const host = document.querySelector('#warehouse-content,.warehouse-map,#page-content,main,.page-shell') || document.body;
      wrap = document.createElement('section');
      wrap.id='yx15-warehouse-wrap';
      wrap.className='yx15-warehouse-wrap';
      wrap.innerHTML = `
        <div class="yx15-warehouse-toolbar">
          <button type="button" data-zone-btn="ALL">全部</button>
          <button type="button" data-zone-btn="A">A區</button>
          <button type="button" data-zone-btn="B">B區</button>
          <button type="button" id="yx15-refresh-unplaced">刷新未錄入</button>
          <span id="yx15-unplaced-count" class="yx15-unplaced-count">未錄入倉庫圖：--件</span>
        </div>
        <div class="yx15-zone-panel" data-zone-panel="A"><h3>A區</h3><div id="zone-A-grid" class="yx15-grid"></div></div>
        <div class="yx15-zone-panel" data-zone-panel="B"><h3>B區</h3><div id="zone-B-grid" class="yx15-grid"></div></div>`;
      host.appendChild(wrap);
    }
    qsa('[data-zone-btn]', wrap).forEach(btn=>{ if(btn.dataset.yx15Bound) return; btn.dataset.yx15Bound='1'; btn.addEventListener('click',()=>setZone(btn.dataset.zoneBtn)); });
    const refresh=$('yx15-refresh-unplaced'); if(refresh && !refresh.dataset.yx15Bound){ refresh.dataset.yx15Bound='1'; refresh.addEventListener('click',loadAvailable); }
    return wrap;
  }
  function setZone(zone){ zone=clean(zone||'A').toUpperCase(); wh().activeZone=zone; localStorage.setItem('warehouseActiveZone', zone); qsa('[data-zone-panel]').forEach(p=>{ const z=p.dataset.zonePanel; p.style.display = (zone==='ALL'||zone===z) ? '' : 'none'; }); qsa('[data-zone-btn]').forEach(b=>b.classList.toggle('active', b.dataset.zoneBtn===zone)); }
  window.setWarehouseZone = setZone;

  function bindSlot(el){
    if(el.dataset.yx15Bound) return; el.dataset.yx15Bound='1';
    let timer=null, moved=false;
    const zone=()=>clean(el.dataset.zone).toUpperCase(), col=()=>Number(el.dataset.column), slot=()=>Number(el.dataset.slot);
    el.addEventListener('click',ev=>{ if(moved) return; openCellEditor(zone(),col(),slot()); });
    el.addEventListener('contextmenu',ev=>{ ev.preventDefault(); showSlotSheet(zone(),col(),slot()); });
    el.addEventListener('pointerdown',()=>{ moved=false; clearTimeout(timer); timer=setTimeout(()=>showSlotSheet(zone(),col(),slot()),650); });
    el.addEventListener('pointermove',()=>{ moved=true; clearTimeout(timer); });
    ['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,()=>clearTimeout(timer)));
    el.addEventListener('dragstart',ev=>{ ev.dataTransfer?.setData('text/plain', JSON.stringify({kind:'warehouse-cell', zone:zone(), column_index:col(), slot_number:slot(), items:cellItems(zone(),col(),slot())})); });
    el.addEventListener('dragover',ev=>{ ev.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
    el.addEventListener('drop',async ev=>{ ev.preventDefault(); el.classList.remove('drag-over'); try{ const raw=ev.dataTransfer?.getData('text/plain')||''; const d=JSON.parse(raw||'{}'); const items=cellItems(zone(),col(),slot()); if(Array.isArray(d.items)) items.unshift(...d.items.map(x=>({...x,placement_label:'前排'}))); else if(d.product_text||d.product) items.unshift({...d,product_text:productOf(d),material:materialOf(d),qty:qtyOf(d),customer_name:customerOf(d),placement_label:'前排'}); await saveCell(zone(),col(),slot(),items); await renderWarehouse(true); }catch(e){ toast(e.message||'拖拉失敗','error'); } });
  }
  async function saveCell(zone,col,slot,items){ return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_type:'direct',slot_number:slot,items})}); }
  async function loadAvailable(){ try{ const d=await api('/api/warehouse/available-items?ts='+Date.now()); wh().availableItems = Array.isArray(d.items)?d.items:[]; const sum=wh().availableItems.reduce((a,b)=>a+qtyOf(b),0); const el=$('yx15-unplaced-count'); if(el) el.textContent=`未錄入倉庫圖：${sum}件`; return wh().availableItems; }catch(e){ toast(e.message||'未錄入商品載入失敗','error'); return []; } }
  async function loadWarehouse(){ const d=await api('/api/warehouse?yx15=1&ts='+Date.now()); wh().cells = Array.isArray(d.cells)?d.cells:[]; if($('yx15-unplaced-count')) $('yx15-unplaced-count').textContent = `未錄入倉庫圖：${Number(d.unplaced_qty||0)}件`; }
  function renderGrids(){ ensureWarehouseSkeleton(); ['A','B'].forEach(zone=>{ const grid=$(zone==='A'?'zone-A-grid':'zone-B-grid'); if(!grid) return; grid.className='yx15-grid'; grid.innerHTML=''; for(let col=1; col<=6; col++){ const column=document.createElement('div'); column.className='yx15-column'; column.innerHTML=`<div class="yx15-col-title">${zone}區 第${col}欄</div><div class="yx15-slot-list">${Array.from({length:20},(_,i)=>slotHTML(zone,col,i+1)).join('')}</div>`; grid.appendChild(column); } }); qsa('.yx15-slot').forEach(bindSlot); setZone(localStorage.getItem('warehouseActiveZone')||wh().activeZone||'A'); }
  async function renderWarehouse(force=false){ if(!isWarehousePage()) return; try{ ensureWarehouseSkeleton(); await loadWarehouse(); renderGrids(); if(!wh().availableItems?.length) loadAvailable(); }catch(e){ toast(e.message||'倉庫圖載入失敗','error'); } }
  window.renderWarehouse = renderWarehouse;
  window.yx15RenderWarehouse = renderWarehouse;

  function ensureModal(){
    let m=$('yx15-cell-modal'); if(m) return m;
    m=document.createElement('div'); m.id='yx15-cell-modal'; m.className='yx15-modal hidden';
    m.innerHTML=`<div class="yx15-modal-card"><div class="yx15-modal-head"><b id="yx15-modal-title">格位</b><button type="button" id="yx15-modal-close">關閉</button></div><div class="yx15-modal-body"><label>批量下拉加入商品</label><select id="yx15-add-select"><option value="">請選擇未錄入商品</option></select><button type="button" id="yx15-add-btn">加入此格</button><div id="yx15-current-items" class="yx15-current-items"></div></div><div class="yx15-modal-foot"><button type="button" id="yx15-save-cell">儲存格位</button></div></div>`;
    document.body.appendChild(m); $('yx15-modal-close').onclick=()=>m.classList.add('hidden'); m.addEventListener('click',e=>{ if(e.target===m) m.classList.add('hidden'); }); return m;
  }
  let editing={zone:'A',col:1,slot:1,items:[]};
  function optionLabel(it){ return `${productOf(it)||'未填尺寸'}｜${qtyOf(it)}件｜${materialOf(it)}｜${clean(it.zone||it.location||it.ab_zone||'未入倉')}｜${sourceOf(it)||it.source||'inventory'}｜${customerOf(it)}`; }
  async function openCellEditor(zone,col,slot){
    const m=ensureModal(); editing={zone,col,slot,items:cellItems(zone,col,slot)}; $('yx15-modal-title').textContent=`${zone}區 第${col}欄 第${slot}格`; await loadAvailable(); const sel=$('yx15-add-select'); sel.innerHTML='<option value="">請選擇未錄入商品</option>'+wh().availableItems.map((it,i)=>`<option value="${i}">${esc(optionLabel(it))}</option>`).join('');
    const renderItems=()=>{ $('yx15-current-items').innerHTML = editing.items.length ? editing.items.map((it,i)=>`<div class="yx15-current-row"><span>${esc(customerOf(it))}</span><span>${esc(productOf(it))}</span><span>${esc(materialOf(it))}</span><span>${qtyOf(it)}件</span><button type="button" data-remove="${i}">移除</button></div>`).join('') : '<div class="yx15-empty-note">此格目前沒有商品</div>'; qsa('[data-remove]', $('yx15-current-items')).forEach(b=>b.onclick=()=>{ editing.items.splice(Number(b.dataset.remove),1); renderItems(); }); };
    $('yx15-add-btn').onclick=()=>{ const idx=Number(sel.value); if(!Number.isFinite(idx) || idx<0) return; const it=wh().availableItems[idx]; if(!it) return; editing.items.unshift({...it,product_text:productOf(it),material:materialOf(it),qty:qtyOf(it),customer_name:customerOf(it),source_table:it.source_table||it.source||'inventory',source_id:it.source_id||it.id,placement_label:'前排'}); renderItems(); };
    $('yx15-save-cell').onclick=async()=>{ try{ await saveCell(editing.zone,editing.col,editing.slot,editing.items); m.classList.add('hidden'); toast('格位已儲存'); await renderWarehouse(true); }catch(e){ toast(e.message||'儲存失敗','error'); } };
    renderItems(); m.classList.remove('hidden');
  }
  window.openWarehouseModal = openCellEditor;
  window.openWarehouseCellEditor101 = openCellEditor;

  function ensureSheet(){ let s=$('yx15-slot-sheet'); if(s) return s; s=document.createElement('div'); s.id='yx15-slot-sheet'; s.className='yx15-sheet hidden'; s.innerHTML=`<div class="yx15-sheet-card"><b id="yx15-sheet-title"></b><button id="yx15-sheet-open">開啟 / 編輯格位</button><button id="yx15-sheet-insert">在此格後插入格子</button><button id="yx15-sheet-delete" class="danger">刪除此格</button><button id="yx15-sheet-cancel">取消</button></div>`; document.body.appendChild(s); $('yx15-sheet-cancel').onclick=()=>s.classList.add('hidden'); s.addEventListener('click',e=>{ if(e.target===s) s.classList.add('hidden'); }); return s; }
  function showSlotSheet(zone,col,slot){ const s=ensureSheet(); $('yx15-sheet-title').textContent=`${zone}區 第${col}欄 第${slot}格`; s.classList.remove('hidden'); $('yx15-sheet-open').onclick=()=>{ s.classList.add('hidden'); openCellEditor(zone,col,slot); }; $('yx15-sheet-insert').onclick=async()=>{ try{ await api('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_number:slot})}); s.classList.add('hidden'); toast('已插入格子'); renderWarehouse(true); }catch(e){ toast(e.message||'插入失敗','error'); } }; $('yx15-sheet-delete').onclick=async()=>{ if(!confirm('確定刪除此格？格內有商品時不可刪除')) return; try{ await api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_number:slot})}); s.classList.add('hidden'); toast('已刪除格子'); renderWarehouse(true); }catch(e){ toast(e.message||'刪除失敗','error'); } }; }
  window.showWarehouseSlotActionSheet = showSlotSheet;

  function fixCustomerCardsOneLine(){ qsa('.customer-card,.customer-chip,.region-customer,.client-card').forEach(el=>{ el.classList.add('yx15-customer-one-line'); }); }
  function install(){ document.documentElement.dataset.yxPack15Final='sealed'; patchMaterialSelects(); fixCustomerCardsOneLine(); if(isWarehousePage()) setTimeout(()=>renderWarehouse(true),80); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  /* pack19: disabled broad MutationObserver to avoid all-page lag; pack19 final layer handles refresh explicitly */
})();
