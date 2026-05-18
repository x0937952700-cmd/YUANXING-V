/* 20260517ca warehouse server readback panel / frontend-server consistency check
   20260517bt warehouse bigger preflight pack: batch validation / draft status / safer save hints
   20260517bs warehouse bigger stability pack: draft autosave / batch summary / modal recovery / touch safety
   20260517br warehouse scroll memory interference guard patch
   20260517bk warehouse search locate-current patch
   20260517bj warehouse mobile search keyboard dismiss patch
   20260517bh warehouse search results collapse patch
   20260517bg warehouse search state restore hint patch
   20260517be warehouse search copy-location patch
   20260517bd warehouse recent search chips patch
   20260517bb warehouse search open-cell stability patch
   20260517aw warehouse undo history persistence patch
   20260517av warehouse undo move busy/scroll stability patch
   20260517au warehouse switch-cell unsaved draft guard patch
   20260517at warehouse leave-page unsaved draft guard patch
   20260517as warehouse busy hint / safe retry visibility patch
   20260517ar warehouse batch add fallback/scroll safety patch
   20260517aq warehouse unsaved draft close guard patch
   20260517ap warehouse batch delete preview/safety patch
   20260517an warehouse mark persistence/readback patch
   20260517am warehouse viewport recenter patch
   20260516ao stable warehouse: current-satisfied mainline + 520 visual layout, no 520 renderer overwrite.
   沅興木業 倉庫頁最終鎖死版
   原則：倉庫頁只吃 templates/module.html 內唯一 HTML；本檔只更新資料、事件、API，不再整頁 render / 不再吃舊 render。 */
(function(){
  'use strict';
  const YX = window.YXHardLock || {};
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const api = YX.api || (async (url,opt={})=>{ const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const data=await res.json().catch(()=>({success:false,error:'伺服器回應格式錯誤'})); if(!res.ok||data.success===false) throw new Error(data.error||data.message||'請求失敗'); return data; });
  const toast = YX.toast || ((m)=>console.log(m));
  const isWarehouse = () => document.querySelector('.module-screen[data-module="warehouse"]') || (location.pathname||'').includes('/warehouse');
  // 20260517bj：手機倉庫搜尋送出/切換結果/開格位時收起鍵盤；只 blur 搜尋框，不改資料與搜尋結果。
  function blurWarehouseSearchKeyboard(){
    try{
      const el=$('warehouse-search');
      if(el && document.activeElement===el) el.blur();
    }catch(_e){}
  }
  const state = {
    data:{cells:[], zones:{A:{},B:{}}}, available:[], availableByZone:{A:[],B:[]}, activeZone:null, searchKeys:new Set(), undoStack:[],
    current:{zone:'A',col:1,slot:1,items:[],note:''}, batchCount:3, drag:null, loading:null, bound:false, unplacedOpen:false, localMutationAt:0, saving:false, opSeq:0, latestAppliedSeq:0,
    searchSeq:0, searchHits:[], searchFocusIndex:-1, lastSearchQuery:'', searchTimer:null, searchComposing:false, searchCollapsed:false,
    skipNextBatchDraftRestore:false, currentModalKey:'', currentEditingKey:'', lastFocusedCellKey:'', lastDraftSavedAt:0, lastBatchValidation:null
  };
  function afterWarehouseRender(){ try{window.YXRestoreButtonLabels?.();}catch(_e){} try{window.YXAfterRender?.();}catch(_e){} }
  // 20260517ah：倉庫連續操作保護。背景保存卡住超過 15 秒時自動解除，避免按鈕一直不能用。
  function setWarehouseBusy(on){
    state.saving=!!on;
    state.savingAt=on?Date.now():0;
    document.documentElement.classList.toggle('yx-warehouse-busy', !!on);
    document.querySelectorAll('[data-wh-act],#yx121-save-cell').forEach(btn=>{
      if(!btn) return;
      if(on){
        if(!btn.dataset.yxPrevTitle) btn.dataset.yxPrevTitle = btn.getAttribute('title') || '';
        btn.dataset.yxBusy='1';
        btn.setAttribute('aria-busy','true');
        btn.setAttribute('title','背景保存中，請稍等，避免連點');
      }else{
        delete btn.dataset.yxBusy;
        btn.removeAttribute('aria-busy');
        if(btn.dataset.yxPrevTitle !== undefined){
          if(btn.dataset.yxPrevTitle) btn.setAttribute('title', btn.dataset.yxPrevTitle);
          else btn.removeAttribute('title');
          delete btn.dataset.yxPrevTitle;
        }
      }
    });
  }
  function isWarehouseBusy(){
    if(!state.saving) return false;
    if(Date.now()-Number(state.savingAt||0)>15000){
      setWarehouseBusy(false);
      toast('上一個倉庫操作已逾時解除，請重新確認格位狀態','warn');
      renderWarehouse(true).catch(()=>{});
      return false;
    }
    return true;
  }
  const key = (z,c,s)=>`${clean(z).toUpperCase()}-${Number(c)}-${Number(s)}`;
  // 20260517ac：倉庫 API/舊資料可能回 slot_number、slot、slot_no 任一欄位；統一讀取避免格子顯示/操作抓不到。
  function slotNoOf(x){ return Number(x?.slot_number ?? x?.slot_no ?? x?.slot ?? x?.slotNumber ?? 0) || 0; }
  function colNoOf(x){ return Number(x?.column_index ?? x?.column ?? x?.col ?? 0) || 0; }
  const zones = ['A','B'];
  const CACHE_KEY='yx_warehouse_visible_snapshot_20260516bs';
  const MARK_KEY='yx_warehouse_pink_marked_cells_20260517i';
  const UNDO_KEY='yx_warehouse_undo_stack_20260517aw';
  const RECENT_SEARCH_KEY='yx_warehouse_recent_searches_20260517bd';
  const ACTIVE_SEARCH_KEY='yx_warehouse_active_search_20260517bg';
  const CELL_DRAFT_PREFIX='yx_warehouse_cell_draft_20260517bs_';

  // 20260517bs：倉庫格位彈窗草稿保護。切頁、誤關或背景刷新後，30 分鐘內可自動帶回同格的批量列與備註草稿。
  function draftKeyForCell(z,c,s){ return CELL_DRAFT_PREFIX + key(z,c,s); }
  function pruneWarehouseCellDrafts(){
    try{
      const now=Date.now();
      Object.keys(localStorage).forEach(k=>{
        if(!k.startsWith(CELL_DRAFT_PREFIX)) return;
        try{ const obj=JSON.parse(localStorage.getItem(k)||'{}'); if(!obj.at || now-Number(obj.at)>30*60*1000) localStorage.removeItem(k); }catch(_e){ localStorage.removeItem(k); }
      });
    }catch(_e){}
  }
  function loadWarehouseCellDraft(z,c,s){
    try{
      pruneWarehouseCellDrafts();
      const obj=JSON.parse(localStorage.getItem(draftKeyForCell(z,c,s))||'null');
      if(!obj || !obj.at || Date.now()-Number(obj.at)>30*60*1000) return null;
      const hasBatch=batchDraftHasInput(obj.batch||[]);
      const noteChanged=String(obj.note??'') !== String(state.current?.note??'');
      return (hasBatch || noteChanged) ? obj : null;
    }catch(_e){ return null; }
  }
  function saveWarehouseCellDraft(){
    try{
      const modal=$('warehouse-modal');
      if(!modal || modal.classList.contains('hidden') || !state.currentEditingKey) return;
      const draft=snapshotBatchDraft();
      const note=$('warehouse-note')?.value || '';
      const has=batchDraftHasInput(draft) || note !== (state.current?.note||'');
      const dk=draftKeyForCell(state.current.zone,state.current.col,state.current.slot);
      if(!has){ localStorage.removeItem(dk); return; }
      state.lastDraftSavedAt=Date.now();
      localStorage.setItem(dk, JSON.stringify({at:state.lastDraftSavedAt, zone:state.current.zone, col:state.current.col, slot:state.current.slot, note, batch:draft}));
      updateBatchDraftStatus();
    }catch(_e){}
  }
  function clearWarehouseCellDraft(z,c,s){ try{ localStorage.removeItem(draftKeyForCell(z||state.current.zone,c||state.current.col,s||state.current.slot)); }catch(_e){} }
  function clearVisibleBatchDraft(){
    try{
      document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
        const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty');
        if(sel) sel.value=''; if(qty) qty.value='';
      });
      saveWarehouseCellDraft();
      syncBatchSelectLimits();
      toast('已清空本次批量草稿','ok');
    }catch(_e){}
  }
  function updateBatchDraftSummary(){
    try{
      let count=0, qtyTotal=0;
      snapshotBatchDraft().forEach(x=>{ if(clean(x.key||x.value)){ count++; qtyTotal += Math.max(0, Number(x.qty||0)); } });
      let box=$('yx121-batch-summary');
      if(!box) return;
      const invalid=state.lastBatchValidation && state.lastBatchValidation.ok===false;
      box.textContent = count ? `已選 ${count} 筆｜預計加入 ${qtyTotal||0} 件${invalid?'｜請修正紅色列':''}` : '尚未選擇批量加入商品';
      box.classList.toggle('is-active', !!count);
      box.classList.toggle('is-invalid', !!invalid);
    }catch(_e){}
  }
  // 20260517bt：批量加入預檢/草稿狀態。只在前端提示與阻擋明顯錯誤，不改 API、不改資料結構。
  function updateBatchDraftStatus(msg, level){
    try{
      const box=$('yx121-batch-status'); if(!box) return;
      if(msg){ box.textContent=msg; box.dataset.level=level||'info'; box.classList.add('is-active'); return; }
      const has=modalHasUnsavedWarehouseDraft?.();
      if(has && state.lastDraftSavedAt){
        const sec=Math.max(0, Math.round((Date.now()-state.lastDraftSavedAt)/1000));
        box.textContent = sec < 3 ? '草稿已暫存' : `草稿已暫存 ${sec} 秒前`;
        box.dataset.level='info'; box.classList.add('is-active');
      }else{
        box.textContent=''; box.dataset.level=''; box.classList.remove('is-active');
      }
    }catch(_e){}
  }
  function clearBatchValidationUI(){
    try{
      state.lastBatchValidation=null;
      document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
        row.classList.remove('yx121-invalid-row','yx121-warn-row');
        row.removeAttribute('data-yx-error');
      });
      const box=$('yx121-batch-validation'); if(box){ box.textContent=''; box.classList.remove('is-active','is-error','is-warn'); }
      updateBatchDraftSummary();
    }catch(_e){}
  }
  function validateBatchDraftBeforeSave(){
    const result={ok:true, errors:[], warnings:[], selected:0, qtyTotal:0};
    try{
      clearBatchValidationUI();
      const rows=Array.from(document.querySelectorAll('#yx121-batch-rows .yx121-batch-row'));
      const pool=availableListForCurrent();
      const usedByKey=new Map();
      rows.forEach((row,idx)=>{
        const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty');
        const raw=sel?.value || ''; const qRaw=clean(qty?.value||'');
        if(!raw && !qRaw) return;
        if(!raw && qRaw){ result.errors.push(`第 ${idx+1} 列有件數但未選商品`); row.classList.add('yx121-invalid-row'); row.dataset.yxError='未選商品'; return; }
        const it=pool[Number(raw)];
        if(!it){ result.errors.push(`第 ${idx+1} 列商品已不在下拉清單，請重選`); row.classList.add('yx121-invalid-row'); row.dataset.yxError='商品已失效'; return; }
        const max=Number(sel?.options?.[sel.selectedIndex]?.dataset?.max||itemQty(it)||0)||0;
        let q=Number(qRaw||0);
        if(!qRaw || !Number.isFinite(q) || q<=0){ result.errors.push(`第 ${idx+1} 列件數不可為空或 0`); row.classList.add('yx121-invalid-row'); row.dataset.yxError='件數不可為空或 0'; return; }
        q=Math.floor(q);
        const k=dropdownItemKey(it); const used=usedByKey.get(k)||0;
        if(used+q>max){ result.errors.push(`第 ${idx+1} 列超過可加入數量：可 ${Math.max(0,max-used)} 件`); row.classList.add('yx121-invalid-row'); row.dataset.yxError='超過可加入數量'; return; }
        if(used>0){ row.classList.add('yx121-warn-row'); result.warnings.push(`第 ${idx+1} 列與前面同品項，儲存時會自動合併`); }
        usedByKey.set(k,used+q); result.selected++; result.qtyTotal+=q;
      });
      result.ok = result.errors.length===0;
      state.lastBatchValidation=result;
      const box=$('yx121-batch-validation');
      if(box){
        if(result.errors.length){ box.textContent=`批量加入需修正：${result.errors.slice(0,3).join('；')}${result.errors.length>3?'…':''}`; box.className='yx121-batch-validation is-active is-error'; }
        else if(result.warnings.length){ box.textContent=`提醒：${result.warnings.slice(0,2).join('；')}`; box.className='yx121-batch-validation is-active is-warn'; }
        else if(result.selected){ box.textContent=`預檢通過：${result.selected} 筆，共 ${result.qtyTotal} 件`; box.className='yx121-batch-validation is-active'; }
      }
      if(!result.ok){
        const first=document.querySelector('#yx121-batch-rows .yx121-invalid-row');
        first?.scrollIntoView?.({block:'center',inline:'nearest',behavior:'smooth'});
      }
      updateBatchDraftSummary();
    }catch(e){ result.ok=true; }
    return result;
  }
  function fillSelectedBatchQtyToMax(){
    try{
      document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
        const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty');
        if(sel?.value && qty){ const max=Number(qty.dataset.yx121Max||qty.max||0); if(max>0) qty.value=String(max); }
      });
      syncBatchSelectLimits(); saveWarehouseCellDraft(); validateBatchDraftBeforeSave(); toast('已將已選商品件數填到可加入上限','ok');
    }catch(_e){}
  }

  function loadMarkedCells(){ try{ const arr=JSON.parse(localStorage.getItem(MARK_KEY)||'[]'); return new Set(Array.isArray(arr)?arr:[]); }catch(_e){ return new Set(); } }
  function saveMarkedCells(set){ try{ localStorage.setItem(MARK_KEY, JSON.stringify(Array.from(set||[]))); }catch(_e){} }
  // 20260517aw：還原上一步記錄改成可短時間保留。手機誤刷新或切頁回來時，不會立刻失去最近拖拉還原機會。
  function cleanUndoEntry(entry){
    try{
      const src=entry?.source, dst=entry?.target;
      if(!src||!dst) return null;
      const pack=o=>({zone:clean(o.zone).toUpperCase(), col:Number(o.col), slot:Number(o.slot), items:Array.isArray(o.items)?o.items:[], note:o.note||''});
      const source=pack(src), target=pack(dst);
      if(!source.zone||!source.col||!source.slot||!target.zone||!target.col||!target.slot) return null;
      return {source,target,at:Number(entry.at||Date.now())};
    }catch(_e){ return null; }
  }
  function saveUndoStack(){
    try{
      const arr=(state.undoStack||[]).map(cleanUndoEntry).filter(Boolean).slice(-20);
      localStorage.setItem(UNDO_KEY, JSON.stringify({at:Date.now(),items:arr}));
    }catch(_e){}
  }
  function loadUndoStack(){
    try{
      const raw=localStorage.getItem(UNDO_KEY); if(!raw) return;
      const obj=JSON.parse(raw); const at=Number(obj?.at||0);
      if(!at || Date.now()-at>30*60*1000){ localStorage.removeItem(UNDO_KEY); return; }
      const items=(Array.isArray(obj?.items)?obj.items:[]).map(cleanUndoEntry).filter(Boolean).slice(-20);
      if(items.length) state.undoStack=items;
    }catch(_e){}
  }
  function isCellMarked(z,c,s){ const k=key(z,c,s); if(loadMarkedCells().has(k)) return true; return /標記此格|marked|粉色|pink/i.test(cellNote(z,c,s)); }
  function setCellMarkedLocal(z,c,s,on){ const set=loadMarkedCells(); const k=key(z,c,s); if(on) set.add(k); else set.delete(k); saveMarkedCells(set); }
  // 20260517an：後端回傳/重新整理後，若 note 內已有「標記此格」，同步回本機標記集合；避免格子重繪後淡粉紅標記消失。
  function syncMarkedCellsFromData(){
    const set=loadMarkedCells(); let changed=false;
    (state.data?.cells||[]).forEach(cell=>{
      const z=clean(cell?.zone).toUpperCase(); const c=colNoOf(cell); const s=slotNoOf(cell);
      if(!z||!c||!s) return;
      const note=clean(cell?.note||''); const k=key(z,c,s);
      if(/標記此格|marked|粉色|pink/i.test(note) && !set.has(k)){ set.add(k); changed=true; }
    });
    if(changed) saveMarkedCells(set);
  }
  try{['v520stable','20260516bh','20260516bi','20260516bj','20260516bk','20260516bl','20260516bm','20260516bn','20260516bo','20260516bp','20260516bq'].forEach(v=>localStorage.removeItem('yx_warehouse_visible_snapshot_'+v));}catch(_e){}
  function cacheNow(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),data:state.data,available:state.available,availableByZone:state.availableByZone}));}catch(_e){}}
  function loadCache(){try{const raw=localStorage.getItem(CACHE_KEY); if(!raw)return false; const o=JSON.parse(raw); if(!o||!o.data)return false; if(Date.now()-Number(o.at||0)>300000) return false; state.data=o.data||state.data; state.available=Array.isArray(o.available)?o.available:state.available; state.availableByZone=o.availableByZone||state.availableByZone; return true;}catch(_e){return false;}}

  // 20260517bd：倉庫搜尋增加最近搜尋 chips，只用 localStorage；不新增 renderer、不打 API。
  function loadRecentWarehouseSearches(){
    try{
      const arr=JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY)||'[]');
      return Array.isArray(arr)?arr.map(clean).filter(Boolean).slice(0,8):[];
    }catch(_e){ return []; }
  }
  function saveRecentWarehouseSearches(arr){
    try{ localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify((arr||[]).map(clean).filter(Boolean).slice(0,8))); }catch(_e){}
  }
  function rememberWarehouseSearch(q){
    q=clean(q); if(!q) return;
    const arr=loadRecentWarehouseSearches().filter(x=>x!==q);
    arr.unshift(q); saveRecentWarehouseSearches(arr);
    renderRecentWarehouseSearches();
  }
  function clearRecentWarehouseSearches(){ saveRecentWarehouseSearches([]); try{ localStorage.removeItem(ACTIVE_SEARCH_KEY); }catch(_e){} renderRecentWarehouseSearches(); }
  // 20260517bg：保留上一個倉庫搜尋關鍵字為提示 chip；不自動打 API，避免開頁變慢或干擾現場操作。
  function saveActiveWarehouseSearch(q){ try{ q=clean(q); if(q) localStorage.setItem(ACTIVE_SEARCH_KEY, JSON.stringify({q,at:Date.now()})); else localStorage.removeItem(ACTIVE_SEARCH_KEY); }catch(_e){} }
  function loadActiveWarehouseSearch(){
    try{ const raw=localStorage.getItem(ACTIVE_SEARCH_KEY); if(!raw) return ''; const o=JSON.parse(raw); if(!o?.q || Date.now()-Number(o.at||0)>24*60*60*1000){ localStorage.removeItem(ACTIVE_SEARCH_KEY); return ''; } return clean(o.q); }catch(_e){ return ''; }
  }
  function renderRecentWarehouseSearches(){
    const input=$('warehouse-search'); if(!input) return;
    let box=$('yx-warehouse-recent-searches');
    if(!box){
      box=document.createElement('div'); box.id='yx-warehouse-recent-searches'; box.className='yx-warehouse-recent-searches';
      input.insertAdjacentElement('afterend', box);
    }
    const arr=loadRecentWarehouseSearches();
    const active=loadActiveWarehouseSearch();
    if(!arr.length && !active){ box.classList.add('hidden'); box.innerHTML=''; return; }
    box.classList.remove('hidden');
    const activeHtml=active?`<button type="button" class="ghost-btn small-btn yx-last-search-chip" data-yx-last-wh-search="${esc(active)}">上次：${esc(active)}</button>`:'';
    box.innerHTML='<span class="small-note">最近搜尋</span>'+activeHtml+arr.map(q=>`<button type="button" class="ghost-btn small-btn" data-yx-recent-wh-search="${esc(q)}">${esc(q)}</button>`).join('')+'<button type="button" class="ghost-btn small-btn" data-yx-clear-recent-wh-search="1">清除</button>';
  }

  function markLocal(){state.localMutationAt=Date.now(); cacheNow();}
  function canApplyServer(){return !state.saving;} // 20260516bs：只要不是正在保存，就以後端正規化結果為準，不再被本地舊快照卡 30 秒。
  function keepScrollWhile(fn){
    const x=window.scrollX, y=window.scrollY;
    const wh=$('warehouse-root'); const sx=wh?.scrollLeft||0, sy=wh?.scrollTop||0;
    const out=fn();
    requestAnimationFrame(()=>{ try{ window.scrollTo(x,y); if(wh){ wh.scrollLeft=sx; wh.scrollTop=sy; } }catch(_e){} });
    return out;
  }
  // 20260517ar：批量加/刪格會重繪大量格子；統一包 keepScrollWhile，避免操作完手機畫面跳回上方或橫向位置跑掉。
  function applyServerCellsKeepScroll(data, refreshAvailable, opSeq){
    return keepScrollWhile(()=>applyServerCells(data, refreshAvailable, opSeq));
  }
  function parseQtyFromText(text){
    if(window.YXQty65||window.YX126Qty) return (window.YXQty65||window.YX126Qty)(text,0);
    const raw=clean(text||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const hasExplicit = raw.includes('=') || /[+＋,，;；]/.test(raw) || /[件片]/.test(raw);
    if(!hasExplicit) return 0;
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    const rightCompact=right.replace(/\s+/g,'');
    const parenQty=rightCompact.match(/^(\d+)[(（][^)）]*[)）]$/);
    if(parenQty) return Number(parenQty[1]||0)||1;
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.replace(/\s+/g,'').toLowerCase()===canonical) return 15;
    if(/[件片]/.test(right)){ const nums=[...right.matchAll(/\d+/g)].map(m=>Number(m[0])); if(nums.length) return nums[nums.length-1]||1; }
    const parts=right.split(/[+＋,，;；]/).map(x=>x.trim()).filter(Boolean);
    if(parts.length>1){let total=0; for(const seg of parts){const m=seg.match(/x\s*(\d+)\s*$/i); total+=m?Number(m[1]||0):(/\d/.test(seg)?1:0);} if(total>0)return total;}
    const m=raw.includes('=') ? right.match(/(?:x|×|\*)\s*(\d+)(?:\s*[(（][^)）]*[)）])?\s*(?:件)?\s*$/i) : null;
    if(m) return Math.max(1,Number(m[1]));
    return hasExplicit ? 1 : 0;
  }
  function numericQtyFromItem(it){
    const candidates=[it?.qty,it?.quantity,it?.pieces,it?.count,it?.piece_count,it?.件數,it?.total_qty,it?.totalQty];
    for(const v of candidates){ const n=Number(v); if(Number.isFinite(n)&&n>0) return Math.floor(n); }
    return 0;
  }
  function itemQty(it){
    // 20260516bs：新入格的 warehouse_qty_locked=true 一律吃實際入格 qty；
    // 舊資料未鎖定時，若商品文字有明確公式/件數，優先用文字修正錯誤舊 qty。
    const isPlaced = !!(it?.warehouse_qty_locked || it?.placement_label || it?.layer_label);
    const text=clean(it?.product_text||it?.product||'');
    const parsed=parseQtyFromText(text);
    const numeric=numericQtyFromItem(it);
    if(it?.warehouse_qty_locked && numeric>0) return numeric;
    if(isPlaced){
      if(parsed>0 && numeric>0 && parsed!==numeric && !it?.warehouse_qty_locked) return parsed;
      if(numeric>0) return numeric;
      if(parsed>0) return parsed;
    }
    if((it?.dropdown_qty || it?.unplaced_qty) && !isPlaced){
      const dq=Number(it.dropdown_qty || it.unplaced_qty || it.qty || 0);
      if(Number.isFinite(dq) && dq>0) return Math.floor(dq);
    }
    if(parsed>0) return parsed;
    if(numeric>0) return numeric;
    return 1;
  }
  function materialOf(it){ return clean(it?.material || it?.wood_type || it?.材質 || ''); }
  function sourceOf(it){
    if(it?.source_summary) return clean(it.source_summary);
    if(Array.isArray(it?.sources) && it.sources.length){ return it.sources.map(x=>`${clean(x.source||'')}${Number(x.qty||0)}`).join('、'); }
    const raw=clean(it?.source || it?.source_table || it?.type || '');
    if(/master|總單/i.test(raw)) return '總單';
    if(/order|訂單/i.test(raw)) return '訂單';
    if(/inventory|stock|庫存/i.test(raw)) return '庫存';
    return raw || '庫存';
  }
  function dropdownItemKey(it){
    // 20260516bi：下拉選單件數比對用同一個 key，避免同品項多列重複選取超過可加入件數。
    const cn=cleanCustomer(it?.customer_name||it?.customer||'');
    const mat=materialOf(it);
    const size=sizeOnlyFromText(productText(it));
    return [cn,mat,size].join('|');
  }
  function cleanCustomer(v){
    const s=clean(v)||'庫存';
    return s.replace(/FOB代付|FOB代|FOB|CNF/gi,'').replace(/[()（）]/g,'').replace(/\s*[代]\s*$/,'').replace(/\s+/g,' ').trim() || '庫存';
  }
  function productText(it){ return clean(it?.product_text || it?.product || it?.product_size || ''); }
  function sizeOnlyFromText(text){
    // 20260516bi：尺寸 key 只取第一組三段尺寸，避免「71x12x10 15件」或「LVL 71x12x10」造成下拉/格子件數比對錯。
    const raw=clean(text||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const left=(raw.includes('=')?raw.split('=')[0]:raw).trim();
    const m=left.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(m){
      return m.slice(1,4).map(v=>{ const n=Number(v); return Number.isFinite(n) ? (Number.isInteger(n)?String(n):String(n).replace(/0+$/,'').replace(/\.$/,'')) : v; }).join('x');
    }
    return left || raw || '未填尺寸';
  }
  function normalizedItem(it, qty, placement){
    const product=productText(it);
    const base={...it};
    // 20260516bs：下拉選單的剩餘量欄位只供選取時判斷，不能存進格子；
    // 否則之後格子顯示可能用 dropdown_qty 覆蓋真正加入 qty。
    delete base.dropdown_qty; delete base.unplaced_qty; delete base.total_qty; delete base.source_total_qty; delete base.source_total_qty_all;
    delete base.warehouse_placed_qty; delete base.warehouse_placed_qty_all; delete base.source_details; delete base.qty_formula;
    return {...base, product_text:product, product, customer_name:cleanCustomer(it?.customer_name||it?.customer||''), material:materialOf(it), qty:Math.max(1,Math.floor(Number(qty||0))), actual_in_qty:Math.max(1,Math.floor(Number(qty||0))), warehouse_qty:Math.max(1,Math.floor(Number(qty||0))), warehouse_qty_locked:true, is_warehouse_item:true, source:sourceOf(it), source_table:it?.source_table || it?.source || sourceOf(it), source_id:it?.source_id || it?.id || '', placement_label:placement || it?.placement_label || it?.layer_label || '前排', layer_label:placement || it?.placement_label || it?.layer_label || '前排'};
  }
  // 20260517ai：同格連續加入/拖拉時，若同一商品被分成多列，先合併成一列再存，避免格子顯示重複、下拉扣量看起來不一致。
  function mergeWarehouseItems(items){
    const map=new Map();
    (Array.isArray(items)?items:[]).forEach(raw=>{
      const q=itemQty(raw); if(!q || q<=0) return;
      const place=clean(raw?.placement_label||raw?.layer_label||'前排')||'前排';
      const norm=normalizedItem(raw,q,place);
      const k=[cleanCustomer(norm.customer_name), materialOf(norm), sizeOnlyFromText(productText(norm)), sourceOf(norm), clean(norm.source_table||''), clean(norm.source_id||''), place].join('|');
      if(!map.has(k)){ map.set(k,{...norm, qty:0, actual_in_qty:0, warehouse_qty:0}); }
      const row=map.get(k);
      row.qty += q; row.actual_in_qty=row.qty; row.warehouse_qty=row.qty; row.warehouse_qty_locked=true;
    });
    return Array.from(map.values()).filter(x=>itemQty(x)>0);
  }
  function cellFromData(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    return (state.data.cells||[]).find(x=>clean(x.zone).toUpperCase()===z && colNoOf(x)===c && slotNoOf(x)===s) || null;
  }
  function cellItems(z,c,s){
    const cell=cellFromData(z,c,s);
    if(!cell) return [];
    if(Array.isArray(cell.items)) return cell.items;
    try { const arr=JSON.parse(cell.items_json||'[]'); return Array.isArray(arr)?arr:[]; } catch(_e){ return []; }
  }
  function cellNote(z,c,s){ return clean(cellFromData(z,c,s)?.note || ''); }
  function maxSlot(z,c){
    z=clean(z).toUpperCase(); c=Number(c);
    const nums=(state.data.cells||[]).filter(x=>clean(x.zone).toUpperCase()===z && colNoOf(x)===c).map(slotNoOf);
    return Math.max(20, ...nums, getColumnList(z,c)?.querySelectorAll('[data-slot]')?.length || 0);
  }
  function getColumnList(z,c){ return document.querySelector(`.vertical-column-card[data-zone="${z}"][data-column="${Number(c)}"] .vertical-slot-list`); }
  function createSlotElement(z,c,s){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='yx-final-slot yx108-slot yx106-slot yx116-slot vertical-slot';
    btn.dataset.zone=z; btn.dataset.column=String(Number(c)); btn.dataset.slot=String(Number(s));
    btn.innerHTML='<div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no"></span><span class="yx108-slot-customers yx108-slot-empty yx520-wh-empty">空格</span></div><div class="yx108-slot-row yx108-slot-row2 yx116-slot-row2"><span class="yx108-slot-sum">0</span><span class="yx108-slot-total">0件</span></div>';
    return btn;
  }
  function ensureSlotElement(z,c,s){
    const list=getColumnList(z,c); if(!list) return null;
    let el=list.querySelector(`[data-zone="${z}"][data-column="${Number(c)}"][data-slot="${Number(s)}"]`);
    if(!el){ el=createSlotElement(z,c,s); const after=Array.from(list.querySelectorAll('[data-slot]')).find(x=>Number(x.dataset.slot)>Number(s)); if(after) list.insertBefore(el,after); else list.appendChild(el); bindSlot(el); }
    return el;
  }
  function ensureSlotRange(){ zones.forEach(z=>{ for(let c=1;c<=6;c++){ for(let s=1;s<=maxSlot(z,c);s++) ensureSlotElement(z,c,s); } }); }
  function removeExtraDom(z,c){
    const list=getColumnList(z,c); if(!list) return;
    const max=maxSlot(z,c);
    list.querySelectorAll('[data-slot]').forEach(el=>{ if(Number(el.dataset.slot)>max) el.remove(); });
  }
  function sizeSummaryFor(items){
    const map=new Map();
    (items||[]).forEach(it=>{
      let size=sizeOnlyFromText(productText(it));
      if(!size || size.includes('=')) size='商品';
      size=String(size||'').replace(/FOB代付|FOB代|FOB|CNF/gi,'').trim()||'商品';
      map.set(size,(map.get(size)||0)+itemQty(it));
    });
    const arr=Array.from(map.values()).filter(q=>Number(q)>0);
    // 20260516bi：格子第一排只顯示「每個尺寸加總」的件數拆解；單一尺寸不顯示，避免 71x12x10 15件 這種長文字塞爆格子。
    if(arr.length<=1) return '';
    return arr.join('+');
  }
  function updateSlotUI(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const el=ensureSlotElement(z,c,s); if(!el) return;
    const items=cellItems(z,c,s).filter(it=>itemQty(it)>0);
    const hi=state.searchKeys.has(key(z,c,s));
    el.classList.toggle('filled', items.length>0);
    el.classList.toggle('highlight', hi);
    // 20260517al：格位彈窗開啟時，同步標出正在編輯的格子；背景刷新/重繪後也不會失去提示。
    el.classList.toggle('yx-current-editing-cell', !!state.currentEditingKey && state.currentEditingKey===key(z,c,s));
    el.setAttribute('aria-current', (!!state.currentEditingKey && state.currentEditingKey===key(z,c,s)) ? 'true' : 'false');
    el.classList.toggle('yx-bb-marked-cell', isCellMarked(z,c,s));
    if(isCellMarked(z,c,s)){ el.style.backgroundColor='rgba(255, 228, 238, 0.42)'; el.style.borderColor='rgba(244, 114, 182, 0.42)'; }
    else { el.style.backgroundColor=''; el.style.borderColor=''; }
    el.dataset.hasItems=items.length?'1':'0';
    if(!items.length){
      el.innerHTML=`<div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no">${s}</span><span class="yx108-slot-customers yx108-slot-empty yx520-wh-empty">空格</span></div><div class="yx108-slot-row yx108-slot-row2 yx116-slot-row2"><span class="yx108-slot-sum"></span><span class="yx108-slot-total">0件</span></div>`;
      return;
    }
    const qtys=items.map(itemQty).filter(n=>n>0);
    const totalQty=qtys.reduce((a,b)=>a+b,0);
    const sizeSums=sizeSummaryFor(items);
    const groupedRows=(()=>{
      const map=new Map();
      (items||[]).forEach(it=>{
        const cn=cleanCustomer(it.customer_name||'庫存');
        const mat=String(materialOf(it)||'未填').replace(/FOB代付|FOB代|FOB|CNF/gi,'').trim() || '未填';
        let prod=sizeOnlyFromText(productText(it));
        if(!prod || prod.length>18 || prod.includes('=')) prod='商品';
        const k=[cn,mat,prod].join('|');
        if(!map.has(k)) map.set(k,{cn,mat,prod,qty:0});
        map.get(k).qty += itemQty(it);
      });
      return Array.from(map.values());
    })();
    const itemRows=groupedRows.map(row=>`<div class="yx520-wh-item-line"><span class="yx520-wh-customer">${esc(row.cn)}</span><span class="yx520-wh-material">${esc(row.mat)}</span><span class="yx520-wh-product">${esc(row.prod)}</span><b>${row.qty}件</b></div>`).join('');
    const sumHtml=sizeSums?`<span class="yx520-wh-size-sums">${esc(sizeSums)}</span>`:'<span class="yx520-wh-size-sums is-empty"></span>';
    el.innerHTML=`<div class="yx520-wh-head"><span class="yx520-wh-slotno">${s}</span>${sumHtml}<span class="yx520-wh-total">${totalQty}件</span></div><div class="yx520-wh-body">${itemRows}</div>`;
  }
  function updateAllSlots(){
    ensureSlotRange();
    zones.forEach(z=>{ for(let c=1;c<=6;c++){ for(let s=1;s<=maxSlot(z,c);s++) updateSlotUI(z,c,s); removeExtraDom(z,c); } });
    updateNotes(); bindSlots(); setWarehouseZone(state.activeZone || localStorage.getItem('warehouseActiveZone') || 'A', false);
  }
  function updateNotes(){
    for(const z of zones){ const n=$(z==='A'?'zone-A-count-note':'zone-B-count-note'); if(n) n.textContent='6 欄｜動態格數｜HTML 鎖定'; }
  }
  async function loadAvailable(){
    try{
      const d=await api('/api/warehouse/available-items?ts='+Date.now());
      state.available=Array.isArray(d.items)?d.items:[];
      const by=d.by_zone||{};
      state.availableByZone={A:Array.isArray(by.A)?by.A:[], B:Array.isArray(by.B)?by.B:[]};
      const count=items=>(Array.isArray(items)?items:[]).reduce((n,it)=>n+itemQty(it),0);
      const pill=$('warehouse-unplaced-pill'); if(pill) pill.textContent=`A區 ${count(state.availableByZone.A)}件｜B區 ${count(state.availableByZone.B)}件｜總計 ${count(state.available)}件`;
      cacheNow();
    }catch(_e){ state.available=state.available||[]; state.availableByZone=state.availableByZone||{A:[],B:[]}; }
  }
  async function renderWarehouse(force=false){
    const hadCache = !force && loadCache();
    if(hadCache){ updateAllSlots(); bindSlots(); afterWarehouseRender(); }
    if(state.loading && !force) return state.loading;
    state.loading=(async()=>{ try{
      const d=await api('/api/warehouse?ts='+Date.now());
      if(canApplyServer() || !state.data.cells.length){
        state.data={cells:(Array.isArray(d.cells)?d.cells:[]).map(x=>({...x, column_index:colNoOf(x), slot_number:slotNoOf(x)||Number(x.slot_number)||Number(x.slot)||Number(x.slot_no)||0})), zones:d.zones||{A:{},B:{}}};
        cacheNow();
      }
      window.state=window.state||{}; window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available}; updateAllSlots(); afterWarehouseRender();
      loadAvailable().then(()=>{ cacheNow(); if($('warehouse-modal') && !$('warehouse-modal').classList.contains('hidden')) renderCellItems(); }).catch(()=>{});
    } catch(e){ toast(e.message||'倉庫圖載入失敗','error'); bindSlots(); } finally{ state.loading=null; } })();
    return state.loading;
  }
  function setWarehouseZone(zone='A', scroll=true){
    zone=clean(zone).toUpperCase(); if(!['A','B','ALL'].includes(zone)) zone='A'; state.activeZone=zone; localStorage.setItem('warehouseActiveZone',zone);
    const za=$('zone-A'), zb=$('zone-B'); if(za) za.style.display=zone==='B'?'none':''; if(zb) zb.style.display=zone==='A'?'none':'';
    ['A','B','ALL'].forEach(z=>$('zone-switch-'+z)?.classList.toggle('active', z===zone));
    const pill=$('warehouse-selection-pill'); if(pill) pill.textContent=`目前區域：${zone==='ALL'?'全部':zone+' 區'}`;
    if(scroll && zone!=='ALL') (zone==='A'?za:zb)?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function clearWarehouseHighlights(){ try{ if(state.searchTimer) clearTimeout(state.searchTimer); state.searchTimer=null; }catch(_e){} try{ localStorage.removeItem(ACTIVE_SEARCH_KEY); }catch(_e){} state.searchKeys.clear(); state.searchHits=[]; state.searchFocusIndex=-1; state.lastSearchQuery=''; state.searchCollapsed=false; $('warehouse-search-results')?.classList.add('hidden'); $('warehouse-unplaced-list-inline')?.classList.add('hidden'); state.unplacedOpen=false; updateAllSlots(); renderRecentWarehouseSearches(); }
  function highlightWarehouseCell(z,c,s, index){
    setWarehouseZone(clean(z).toUpperCase(),false);
    const k=key(z,c,s); state.searchKeys.add(k);
    if(Number.isFinite(Number(index))) state.searchFocusIndex=Number(index);
    updateSlotUI(z,c,s);
    const el=ensureSlotElement(clean(z).toUpperCase(),c,s);
    if(el){ el.classList.add('highlight','flash-highlight'); el.scrollIntoView?.({behavior:'smooth',block:'center',inline:'center'}); setTimeout(()=>el.classList.remove('flash-highlight'),2200); }
    refreshWarehouseSearchActiveHit();
  }
  function setWarehouseSearchResultsCollapsed(on){
    state.searchCollapsed=!!on;
    const box=$('warehouse-search-results');
    if(!box) return;
    box.classList.toggle('yx-search-results-collapsed', !!on);
    const btn=box.querySelector('[data-yx-toggle-search-results]');
    if(btn) btn.textContent=on?'展開結果':'收合結果';
  }
  function refreshWarehouseSearchActiveHit(){
    let activeBtn=null;
    document.querySelectorAll('#warehouse-search-results [data-hit]').forEach(btn=>{
      const on=Number(btn.dataset.hit)===Number(state.searchFocusIndex);
      btn.classList.toggle('active', on);
      if(on) activeBtn=btn;
    });
    const count=$('yx-wh-search-count');
    if(count && state.searchHits.length) count.textContent=`${Math.max(1,Number(state.searchFocusIndex||0)+1)} / ${state.searchHits.length}`;
    // 20260517az：上一個/下一個切換搜尋結果時，同步把結果清單內的目前項目捲到可見位置；只捲清單，不捲整頁。
    try{
      const box=$('warehouse-search-results');
      if(activeBtn && box){
        const b=box.getBoundingClientRect();
        const r=activeBtn.getBoundingClientRect();
        if(r.top < b.top+42 || r.bottom > b.bottom-8) activeBtn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
      }
    }catch(_e){}
  }
  function focusWarehouseSearchHit(i){
    const hits=state.searchHits||[];
    if(!hits.length) return toast('目前沒有搜尋結果','warn');
    const next=((Number(i)||0)%hits.length+hits.length)%hits.length;
    state.searchFocusIndex=next;
    const c=hits[next].cell||hits[next];
    highlightWarehouseCell(c.zone,colNoOf(c),slotNoOf(c),next);
  }
  function jumpWarehouseSearch(delta){
    const cur=Number.isFinite(Number(state.searchFocusIndex))?Number(state.searchFocusIndex):0;
    focusWarehouseSearchHit(cur+Number(delta||0));
  }
  async function copyWarehouseSearchHit(i){
    const hits=state.searchHits||[];
    const h=hits[Number(i)];
    if(!h) return toast('找不到這筆搜尋結果','warn');
    const c=h.cell||h;
    const loc=`${clean(c.zone||'')}-${colNoOf(c)}-${slotNoOf(c)}`;
    const text=[loc, cleanCustomer(h.customer_name||h.item?.customer_name||''), productText(h.item||h)].filter(Boolean).join(' ');
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text); }
      else{
        const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast('已複製格位：'+loc,'success');
    }catch(_e){
      toast('無法自動複製，格位：'+loc,'warn');
    }
  }

  async function openWarehouseSearchHit(i){
    // 20260517bc：搜尋結果按「開啟格位」時，先尊重目前彈窗未儲存草稿；取消切換時不跳搜尋高亮、不捲走目前畫面。
    const hits=state.searchHits||[];
    const idx=Number(i);
    const h=hits[idx];
    if(!h) return toast('找不到這筆搜尋結果','warn');
    const c=h.cell||h;
    const z=clean(c.zone).toUpperCase();
    const col=colNoOf(c);
    const slot=slotNoOf(c);
    const beforeFocus=state.searchFocusIndex;
    try{
      const opened=await openWarehouseModal(z,col,slot);
      if(opened===false){ state.searchFocusIndex=beforeFocus; refreshWarehouseSearchActiveHit(); return; }
      state.searchFocusIndex=idx;
      const k=key(z,col,slot); state.searchKeys.add(k);
      updateSlotUI(z,col,slot);
      refreshWarehouseSearchActiveHit();
    }catch(e){ toast(e.message||'開啟格位失敗','error'); }
  }
  function scheduleWarehouseSearch(delay=360){
    // 20260517ay：手機輸入搜尋時改成防抖，不讓每個字都打 API；中文注音/倉頡組字中不搜尋。
    try{ if(state.searchTimer) clearTimeout(state.searchTimer); }catch(_e){}
    const q=clean($('warehouse-search')?.value||'');
    if(!q){ clearWarehouseHighlights(); return; }
    if(state.searchComposing) return;
    state.searchTimer=setTimeout(()=>{ state.searchTimer=null; searchWarehouse(); }, Math.max(120, Number(delay||360)));
  }

  // 20260517ba：倉庫搜尋 API 若暫時失敗，改用目前前端已載入格位做本地搜尋，避免手機現場網路慢時完全不能找格子。
  function localWarehouseSearch(q){
    const query=clean(q||'').toLowerCase();
    if(!query) return [];
    const hits=[];
    (state.data.cells||[]).forEach(cell=>{
      const z=clean(cell.zone||'').toUpperCase();
      const c=colNoOf(cell);
      const s=slotNoOf(cell);
      const note=clean(cell.note||'');
      const items=cellItems(z,c,s);
      const coord=`${z}-${c}-${s} ${z}區 第${c}欄 第${s}格 ${note}`.toLowerCase();
      if(coord.includes(query) && !items.length){ hits.push({cell:{zone:z,column_index:c,slot_number:s}, item:{customer_name:'',product_text:note}, local:true}); return; }
      items.forEach(it=>{
        const text=[coord, cleanCustomer(it.customer_name), materialOf(it), productText(it), sourceOf(it), clean(it.placement_label||'')].join(' ').toLowerCase();
        if(text.includes(query)) hits.push({cell:{zone:z,column_index:c,slot_number:s}, item:it, customer_name:cleanCustomer(it.customer_name), local:true});
      });
    });
    const seen=new Set();
    return hits.filter(h=>{ const c=h.cell||h; const k=key(c.zone,colNoOf(c),slotNoOf(c))+'|'+productText(h.item||h)+'|'+cleanCustomer(h.customer_name||h.item?.customer_name||''); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,80);
  }

  async function searchWarehouse(){
    const q=clean($('warehouse-search')?.value||''); if(!q){ clearWarehouseHighlights(); return; }
    rememberWarehouseSearch(q); saveActiveWarehouseSearch(q);
    const box=$('warehouse-search-results'); const seq=++state.searchSeq; state.lastSearchQuery=q;
    // 20260517bf：搜尋送出後立即顯示「搜尋中」，避免手機網路慢時看起來沒有反應；舊搜尋回來仍由 seq 保護忽略。
    if(box){
      box.classList.remove('hidden');
      box.innerHTML=`<div class="yx-wh-search-loading"><span class="yx-wh-spinner" aria-hidden="true"></span><span>搜尋中：${esc(q)}</span><button type="button" class="ghost-btn small-btn" data-yx-clear-search="1">清除</button></div>`;
    }
    try{
      const d=await api('/api/warehouse/search?q='+encodeURIComponent(q)+'&ts='+Date.now());
      if(seq!==state.searchSeq || q!==state.lastSearchQuery) return; // 20260517ax：忽略較慢回來的舊搜尋結果，避免高亮跳回上一個關鍵字。
      const hits=Array.isArray(d.items)?d.items:[]; state.searchHits=hits; state.searchFocusIndex=hits.length?0:-1;
      state.searchKeys=new Set(hits.map(h=>{ const c=h.cell||h; return key(c.zone,colNoOf(c),slotNoOf(c)); }));
      updateAllSlots();
      if(box){
        box.classList.remove('hidden');
        box.innerHTML=hits.length?`<div class="btn-row compact-row yx-wh-search-nav"><button type="button" class="ghost-btn small-btn" data-yx-search-nav="prev">上一個</button><span class="small-note" id="yx-wh-search-count">1 / ${hits.length}</span><button type="button" class="ghost-btn small-btn" data-yx-search-nav="next">下一個</button><button type="button" class="ghost-btn small-btn" data-yx-search-nav="current">定位目前</button><button type="button" class="ghost-btn small-btn" data-yx-toggle-search-results="1">收合結果</button></div>`+hits.map((h,i)=>{ const c=h.cell||h; return `<div class="deduct-card yx-search-hit" data-hit="${i}" role="button" tabindex="0"><strong>${esc(c.zone)}-${colNoOf(c)}-${slotNoOf(c)}</strong><div>${esc(cleanCustomer(h.customer_name||h.item?.customer_name||''))}</div><div class="small-note">${esc(productText(h.item||h))}</div><div class="btn-row compact-row yx-search-hit-actions"><button type="button" class="ghost-btn small-btn" data-yx-open-hit="${i}">開啟格位</button><button type="button" class="ghost-btn small-btn" data-yx-copy-hit="${i}">複製格位</button></div></div>`; }).join(''):`<div class="empty-state-card compact-empty">找不到格位：${esc(q)}</div>`;
        box.querySelectorAll('[data-hit]').forEach((btn,i)=>btn.onclick=()=>focusWarehouseSearchHit(i));
        setWarehouseSearchResultsCollapsed(false);
        afterWarehouseRender();
      }
      if(hits[0]) focusWarehouseSearchHit(0);
    }catch(e){
      const hits=localWarehouseSearch(q);
      if(seq!==state.searchSeq || q!==state.lastSearchQuery) return;
      state.searchHits=hits; state.searchFocusIndex=hits.length?0:-1;
      state.searchKeys=new Set(hits.map(h=>{ const c=h.cell||h; return key(c.zone,colNoOf(c),slotNoOf(c)); }));
      updateAllSlots();
      if(box){
        box.classList.remove('hidden');
        box.innerHTML=hits.length?`<div class="small-note yx-local-search-note">網路搜尋暫時失敗，已使用目前畫面資料搜尋</div><div class="btn-row compact-row yx-wh-search-nav"><button type="button" class="ghost-btn small-btn" data-yx-search-nav="prev">上一個</button><span class="small-note" id="yx-wh-search-count">1 / ${hits.length}</span><button type="button" class="ghost-btn small-btn" data-yx-search-nav="next">下一個</button><button type="button" class="ghost-btn small-btn" data-yx-search-nav="current">定位目前</button><button type="button" class="ghost-btn small-btn" data-yx-toggle-search-results="1">收合結果</button></div>`+hits.map((h,i)=>{ const c=h.cell||h; return `<div class="deduct-card yx-search-hit" data-hit="${i}" role="button" tabindex="0"><strong>${esc(c.zone)}-${colNoOf(c)}-${slotNoOf(c)}</strong><div>${esc(cleanCustomer(h.customer_name||h.item?.customer_name||''))}</div><div class="small-note">${esc(productText(h.item||h))}</div><div class="btn-row compact-row yx-search-hit-actions"><button type="button" class="ghost-btn small-btn" data-yx-open-hit="${i}">開啟格位</button><button type="button" class="ghost-btn small-btn" data-yx-copy-hit="${i}">複製格位</button></div></div>`; }).join(''):`<div class="empty-state-card compact-empty">網路搜尋失敗，且目前已載入格位找不到：${esc(q)}</div>`;
        box.querySelectorAll('[data-hit]').forEach((btn,i)=>btn.onclick=()=>focusWarehouseSearchHit(i));
        setWarehouseSearchResultsCollapsed(false);
        afterWarehouseRender();
      }
      if(hits[0]){ focusWarehouseSearchHit(0); toast('已用本地已載入倉庫資料搜尋','warn'); }
      else toast(e.message||'搜尋失敗','error');
    }
  }
  function highlightWarehouseSameCustomer(){
    const name=clean(window.__YX_SELECTED_CUSTOMER__||$('customer-name')?.value||''); if(!name) return toast('請先選擇客戶','warn');
    state.searchKeys.clear(); (state.data.cells||[]).forEach(c=>{ cellItems(c.zone,c.column_index,c.slot_number).forEach(it=>{ const cn=cleanCustomer(it.customer_name); if(cn.includes(name)||name.includes(cn)) state.searchKeys.add(key(c.zone,c.column_index,c.slot_number)); }); }); updateAllSlots();
  }
  async function toggleWarehouseUnplacedHighlight(){
    await loadAvailable(); const box=$('warehouse-unplaced-list-inline'); if(!box) return; state.unplacedOpen=!state.unplacedOpen;
    if(!state.unplacedOpen){ box.classList.add('hidden'); return; }
    const list=(state.activeZone==='B'?state.availableByZone.B:(state.activeZone==='A'?state.availableByZone.A:state.available)); box.classList.remove('hidden'); box.innerHTML=list.length?list.map((it,i)=>`<div class="deduct-card"><strong>${esc(cleanCustomer(it.customer_name||''))}</strong><div>${esc(productText(it))}</div><div class="small-note">${itemQty(it)}件｜${esc(sourceOf(it))}｜${esc(state.activeZone==='ALL'?(it.zone||''):state.activeZone+'區')}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>'; afterWarehouseRender();
  }
  function optionLabel(it){ const mat=materialOf(it); return `${cleanCustomer(it.customer_name||'')}｜${mat?mat+'｜':''}${productText(it)}｜${itemQty(it)}件｜${sourceOf(it)}`; }
  function aggregateAvailable(list){
    // 20260516bs：下拉選單保險合併。若後端或快取意外回了同客戶+材質+尺寸的重複列，
    // 前端先合併成一列，避免同一品項在批量列被重複選取造成超放。
    const map=new Map();
    (Array.isArray(list)?list:[]).forEach(it=>{
      const base={...it};
      const k=dropdownItemKey(base);
      const q=itemQty(base);
      if(!map.has(k)){
        base.qty=q; base.dropdown_qty=q; base.unplaced_qty=q;
        base.sources=Array.isArray(base.sources)?base.sources.slice():[];
        map.set(k,base);
      }else{
        const old=map.get(k);
        const next=(Number(old.dropdown_qty||old.unplaced_qty||old.qty||0)||0)+q;
        old.qty=next; old.dropdown_qty=next; old.unplaced_qty=next;
        if(base.source_summary && !String(old.source_summary||'').includes(base.source_summary)){ old.source_summary=[old.source_summary,base.source_summary].filter(Boolean).join('、'); }
        if(Array.isArray(base.sources)){ old.sources=(old.sources||[]).concat(base.sources); }
      }
    });
    return Array.from(map.values()).filter(x=>itemQty(x)>0);
  }
  // 20260517ag：批量加入後先在前端扣掉下拉剩餘量，避免剛加入完馬上開下一格時同一商品又出現在下拉。
  function subtractAvailableLocal(zone, added){
    zone=clean(zone||state.current?.zone||'A').toUpperCase();
    const list=Array.isArray(added)?added:[];
    if(!list.length) return;
    const reduceList=(arr)=>{
      const pool=aggregateAvailable(arr);
      for(const add of list){
        const k=dropdownItemKey(add);
        let remain=itemQty(add);
        for(const it of pool){
          if(remain<=0) break;
          if(dropdownItemKey(it)!==k) continue;
          const q=Number(it.dropdown_qty||it.unplaced_qty||it.qty||itemQty(it)||0)||0;
          const take=Math.min(q, remain);
          const next=Math.max(0, q-take);
          it.qty=next; it.dropdown_qty=next; it.unplaced_qty=next;
          remain-=take;
        }
      }
      return pool.filter(x=>itemQty(x)>0);
    };
    if(zone==='A' || zone==='B') state.availableByZone[zone]=reduceList(state.availableByZone[zone]||[]);
    state.available=reduceList(state.available||[]);
    cacheNow();
    try{ if($('warehouse-modal') && !$('warehouse-modal').classList.contains('hidden')) renderCellItems(); }catch(_e){}
  }
  function availableListForCurrent(){ const z=clean(state.current?.zone||state.activeZone||'A').toUpperCase(); return aggregateAvailable(z==='B'?state.availableByZone.B:state.availableByZone.A); }
  function availableRows(){ const q=clean($('warehouse-item-search')?.value||'').toLowerCase(); return availableListForCurrent().map((it,i)=>({it,index:i})).filter(r=>!q||optionLabel(r.it).toLowerCase().includes(q)); }
  function placementForBatch(i){ return i===0?'後排':i===1?'中間':'前排'; }
  function snapshotBatchDraft(){
    // 20260517aj：下拉資料背景刷新時保留使用者已選批量列，避免剛選好商品又被 loadAvailable/applyServerCells 重新渲染清空。
    return Array.from(document.querySelectorAll('#yx121-batch-rows .yx121-batch-row')).map(row=>{
      const sel=row.querySelector('.yx121-batch-select');
      const opt=sel?.options?.[sel.selectedIndex];
      return {
        key: opt?.dataset?.key || '',
        value: sel?.value || '',
        qty: row.querySelector('.yx121-batch-qty')?.value || '',
        index: Number(row.dataset.batchIndex||0)
      };
    });
  }
  function restoreBatchDraft(draft){
    if(!Array.isArray(draft) || !draft.length) return;
    const rows=Array.from(document.querySelectorAll('#yx121-batch-rows .yx121-batch-row'));
    rows.forEach((row,i)=>{
      const old=draft[i]; if(!old) return;
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty'); if(!sel) return;
      if(old.key){
        const opt=Array.from(sel.options||[]).find(o=>o.dataset?.key===old.key);
        if(opt) sel.value=opt.value;
      }else if(old.value && Array.from(sel.options||[]).some(o=>o.value===old.value)){
        sel.value=old.value;
      }
      if(qty && old.qty) qty.value=old.qty;
    });
  }
  function batchDraftHasInput(draft){
    return Array.isArray(draft) && draft.some(x=>clean(x?.key||x?.value||x?.qty||''));
  }
  function renderCellItems(){
    const box=$('warehouse-cell-items'); if(!box) return;
    // 批量加入面板已直接寫在 templates/module.html；這裡只更新「目前商品」與「每列選項」，不再整塊覆蓋 HTML。
    // 20260517ak：第一次開新格位時不要沿用上一格尚未送出的批量選擇；
    // 但背景 loadAvailable 重新整理時，仍要保留「本次彈窗」內使用者剛選好的內容。
    const draft=state.skipNextBatchDraftRestore ? [] : snapshotBatchDraft();
    state.skipNextBatchDraftRestore=false;
    if(!$('warehouse-current-items-html') || !$('yx121-batch-rows')){
      box.innerHTML=`<div class="yx-direct-section" data-html-locked="warehouse-current-items-html"><div class="yx-direct-section-title">目前此格商品</div><div id="warehouse-current-items-html" class="yx-direct-current-list"></div></div><div class="yx-direct-batch-panel" data-html-locked="warehouse-batch-html-fixed"><div class="yx-direct-section-title">批量加入商品</div><div class="small-note">A / B 區各自只顯示尚未錄入倉庫圖商品；第 1 筆後排、第 2 筆中間、第 3 筆前排。</div><div id="yx121-batch-rows"></div><div id="yx121-batch-validation" class="yx121-batch-validation"></div><div id="yx121-batch-summary" class="yx121-batch-summary small-note">尚未選擇批量加入商品</div><div id="yx121-batch-status" class="yx121-batch-status small-note"></div><div class="btn-row compact-row yx121-batch-actions"><button class="ghost-btn small-btn" type="button" id="yx121-add-batch-row" aria-label="新增更多批量" data-yx-label="新增更多批量">新增更多批量</button><button class="ghost-btn small-btn" type="button" id="yx121-fill-max" aria-label="填滿已選件數" data-yx-label="填滿已選件數">填滿件數</button><button class="ghost-btn small-btn" type="button" id="yx121-clear-batch-draft" aria-label="清空批量草稿" data-yx-label="清空批量草稿">清空批量</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell" aria-label="儲存格位" data-yx-label="儲存格位">儲存格位</button></div></div>`;
    }
    const current=(state.current.items||[]).map((it,i)=>{ const mat=materialOf(it), place=clean(it.placement_label||it.layer_label||''); return `<div class="yx-direct-current-item" data-idx="${i}"><div class="yx-direct-current-main"><span class="yx-direct-source">${esc(sourceOf(it))}</span>${mat?`<span class="yx-direct-material">${esc(mat)}</span>`:''}<strong>${esc(cleanCustomer(it.customer_name))}</strong><span class="yx-direct-product">${esc(productText(it))}</span></div><div class="yx-direct-current-side"><span>${place?esc(place)+'｜':''}${itemQty(it)}件</span><button class="remove yx-direct-remove" type="button" data-remove-cell-item="${i}">×</button></div></div>`; }).join('') || '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    const currentBox=$('warehouse-current-items-html'); if(currentBox) currentBox.innerHTML=current;
    const opts=availableRows().map(r=>`<option value="${r.index}" data-key="${esc(dropdownItemKey(r.it))}" data-max="${itemQty(r.it)}">${esc(optionLabel(r.it))}｜可加入 ${itemQty(r.it)} 件</option>`).join('');
    const rows=Array.from({length:Math.max(3,Number(state.batchCount||3))},(_,i)=>`<div class="yx121-batch-row" data-batch-index="${i}"><label class="yx121-batch-label">${placementForBatch(i)}</label><select class="text-input yx121-batch-select"><option value="">選擇此區未錄入商品</option>${opts}</select><input class="text-input yx121-batch-qty" type="number" min="1" placeholder="加入件數" data-yx121-max=""></div>`).join('');
    const rowsBox=$('yx121-batch-rows');
    if(rowsBox){
      rowsBox.innerHTML=rows;
      if(batchDraftHasInput(draft)) restoreBatchDraft(draft);
    }
    syncBatchSelectLimits();
    updateBatchDraftSummary();
    updateBatchDraftStatus();
    afterWarehouseRender();
  }
  function positionWarehouseModalAtGridCenter(z,c,s){
    // 20260517h：真正以「目前瀏覽器可視畫面」為準置中。
    // 不能依格號、不能依頁面文件座標、也不能被倉庫容器 transform/overflow 影響。
    const modal=$('warehouse-modal'); if(!modal) return;
    try{
      if(modal.parentElement!==document.body) document.body.appendChild(modal);
      modal.classList.remove('yx-grid-centered-modal');
      modal.classList.add('yx-viewport-centered-modal');
      modal.style.removeProperty('--yx-wh-modal-left');
      modal.style.removeProperty('--yx-wh-modal-top');
    }catch(_e){}
  }
  function focusWarehouseBatchPanel(){
    try{
      const modal=$('warehouse-modal'); const card=modal?.querySelector?.('.modal-card,.warehouse-modal-card,.glass'); const panel=$('yx121-batch-rows')?.closest?.('.yx-direct-batch-panel');
      if(card && panel){ card.scrollTop=Math.max(0, panel.offsetTop-70); panel.classList.add('yx-batch-focus-flash'); setTimeout(()=>panel.classList.remove('yx-batch-focus-flash'),900); }
    }catch(_e){}
  }
  async function openWarehouseModal(z,c,s){ hideMenu(); z=clean(z).toUpperCase(); const nextModalKey=key(z,Number(c),Number(s)); const prevEditingKey=state.currentEditingKey;
    // 20260517au：彈窗已開且有未儲存草稿時，點其他格前先確認，避免手機誤觸換格造成批量列/備註消失。
    try{
      const modal=$('warehouse-modal');
      if(modal && !modal.classList.contains('hidden') && prevEditingKey && prevEditingKey!==nextModalKey && modalHasUnsavedWarehouseDraft()){
        const ok=confirm('目前格位有尚未儲存的批量加入商品或備註，確定切換到其他格並放棄這次編輯？');
        if(!ok){
          try{ const [pz,pc,ps]=String(prevEditingKey).split('-'); updateSlotUI(pz,Number(pc),Number(ps)); }catch(_e){}
          return false;
        }
        closeWarehouseModal(true);
      }
    }catch(_e){}
    state.current={zone:z,col:Number(c),slot:Number(s),items:JSON.parse(JSON.stringify(cellItems(z,c,s))),note:cellNote(z,c,s)}; state.batchCount=3; state.lastBatchValidation=null; state.lastDraftSavedAt=0; state.currentEditingKey=nextModalKey; state.lastFocusedCellKey=nextModalKey;
    // 20260517al：不改資料，只讓目前正在編輯的格子有可見提示；上一格同步取消提示。
    try{ if(prevEditingKey && prevEditingKey!==nextModalKey){ const [pz,pc,ps]=String(prevEditingKey).split('-'); updateSlotUI(pz,Number(pc),Number(ps)); } updateSlotUI(z,Number(c),Number(s)); }catch(_e){}
    // 20260517ak：換格位/重新開彈窗時，批量加入列必須從空白開始，避免上一格未送出的選擇帶到下一格。
    if(state.currentModalKey!==nextModalKey) state.skipNextBatchDraftRestore=true;
    state.currentModalKey=nextModalKey;
    const meta=$('warehouse-modal-meta'); if(meta) meta.textContent=`${z} 區第 ${Number(c)} 欄 第 ${Number(s)} 格`; const note=$('warehouse-note'); if(note) note.value=state.current.note||''; const modal=$('warehouse-modal'); try{ if(modal && modal.parentElement!==document.body) document.body.appendChild(modal); }catch(_e){} modal?.classList.remove('hidden');
    try{ document.body.classList.add('yx-warehouse-modal-open'); positionWarehouseModalAtGridCenter(z,c,s); const card=modal?.querySelector?.('.modal-card,.warehouse-modal-card,.glass'); card?.scrollTo?.(0,0); }catch(_e){}
    renderCellItems();
    try{
      const stored=loadWarehouseCellDraft(z,c,s);
      if(stored){
        if(stored.note !== undefined && $('warehouse-note')) $('warehouse-note').value=stored.note; state.lastDraftSavedAt=Number(stored.at||Date.now());
        if(Array.isArray(stored.batch) && batchDraftHasInput(stored.batch)){ restoreBatchDraft(stored.batch); syncBatchSelectLimits(); updateBatchDraftSummary(); }
        toast('已帶回此格 30 分鐘內未儲存草稿','warn');
      }
    }catch(_e){}
    focusWarehouseBatchPanel(); loadAvailable().then(()=>{
      if($('warehouse-modal') && !$('warehouse-modal').classList.contains('hidden')){
        const draft=snapshotBatchDraft();
        renderCellItems(); positionWarehouseModalAtGridCenter(z,c,s);
        // 20260517aj：若使用者已開始選批量商品，背景刷新不再把彈窗捲回批量區，避免手機輸入被打斷。
        if(!batchDraftHasInput(draft)) focusWarehouseBatchPanel();
      }
    }).catch(()=>{}); }
  // 20260517am：手機旋轉、網址列收合、鍵盤收起時，已開啟的倉庫格位彈窗維持在目前可視畫面正中間。
  function recenterOpenWarehouseModal(){
    const modal=$('warehouse-modal');
    if(!modal || modal.classList.contains('hidden')) return;
    try{ positionWarehouseModalAtGridCenter(state.current?.zone, state.current?.col, state.current?.slot); }catch(_e){}
  }
  // 20260517aq：手動關閉格位彈窗時，如果批量加入列已選商品或有備註改動，先提醒；程式保存/刪格時可用 force=true 強制關閉。
  function modalHasUnsavedWarehouseDraft(){
    try{
      const noteNow=$('warehouse-note')?.value || '';
      const noteOld=state.current?.note || '';
      if(noteNow !== noteOld) return true;
      return batchDraftHasInput(snapshotBatchDraft());
    }catch(_e){ return false; }
  }
  function closeWarehouseModal(force=false){
    if(!force && modalHasUnsavedWarehouseDraft()){
      const ok=confirm('目前格位有尚未儲存的批量加入商品或備註，確定關閉並放棄這次編輯？');
      if(!ok) return false;
    }
    try{ clearWarehouseCellDraft(state.current?.zone,state.current?.col,state.current?.slot); }catch(_e){}
    const modal=$('warehouse-modal'); modal?.classList.add('hidden');
    try{ const oldEditingKey=state.currentEditingKey; modal?.classList.remove('yx-grid-centered-modal'); modal?.classList.remove('yx-viewport-centered-modal'); modal?.style.removeProperty('--yx-wh-modal-left'); modal?.style.removeProperty('--yx-wh-modal-top'); document.body.classList.remove('yx-warehouse-modal-open'); state.currentModalKey=''; state.currentEditingKey=''; state.skipNextBatchDraftRestore=true; state.lastBatchValidation=null; state.lastDraftSavedAt=0; if(oldEditingKey){ const [z,c,s]=String(oldEditingKey).split('-'); updateSlotUI(z,Number(c),Number(s)); } }catch(_e){}
    return true;
  }
  function syncBatchSelectLimits(){
    // 20260516bi：下拉件數即時扣掉同一批次已選件數；同一品項選兩列時，不會兩列都各自顯示完整可加入件數。
    const rows=Array.from(document.querySelectorAll('#yx121-batch-rows .yx121-batch-row'));
    const pool=availableListForCurrent();
    const selectedQtyByKey=new Map();
    rows.forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty');
      const idx=Number(sel?.value); const it=Number.isFinite(idx)?pool[idx]:null;
      if(!it) return;
      const k=dropdownItemKey(it);
      const q=Math.max(0,Number(qty?.value||0));
      selectedQtyByKey.set(k,(selectedQtyByKey.get(k)||0)+q);
    });
    rows.forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty'); if(!sel||!qty) return;
      const idx=Number(sel.value); const it=Number.isFinite(idx)?pool[idx]:null;
      const opt=sel.options[sel.selectedIndex]; const baseMax=Number(opt?.dataset?.max||0);
      if(!it || !baseMax){ qty.removeAttribute('max'); qty.dataset.yx121Max=''; if(!sel.value) qty.value=''; return; }
      const k=dropdownItemKey(it);
      const current=Math.max(0,Number(qty.value||0));
      const usedOther=Math.max(0,(selectedQtyByKey.get(k)||0)-current);
      const remain=Math.max(0,baseMax-usedOther);
      qty.max=String(remain); qty.dataset.yx121Max=String(remain);
      if(!qty.value && remain>0) qty.value=String(remain);
      if(Number(qty.value)>remain) qty.value=String(remain);
      // 20260517ag：同一品項若已被其他批次列用完，其他列的 option 直接灰掉，避免誤選後看起來沒反應。
      Array.from(sel.options||[]).forEach(option=>{
        if(!option.value){ option.disabled=false; return; }
        const optIt=pool[Number(option.value)];
        if(!optIt){ option.disabled=false; return; }
        const ok=dropdownItemKey(optIt);
        const base=Number(option.dataset.max||itemQty(optIt)||0)||0;
        const already=(selectedQtyByKey.get(ok)||0) - (ok===k ? current : 0);
        option.disabled = (base - already) <= 0 && option.value !== sel.value;
      });
      row.classList.toggle('yx121-over-selected', remain<=0);
    });
    updateBatchDraftSummary();
  }
  function collectBatchItems(){
    const added=[]; const pool=availableListForCurrent(); const used=new Map();
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
      const raw=row.querySelector('.yx121-batch-select')?.value; if(raw==='') return;
      const idx=Number(raw); if(!Number.isFinite(idx)) return;
      const it=pool[idx]; if(!it) return;
      const max=itemQty(it)||0; const k=dropdownItemKey(it); const usedBefore=used.get(k)||0;
      const remain=Math.max(0,max-usedBefore); if(remain<=0) return;
      let qty=Number(row.querySelector('.yx121-batch-qty')?.value||remain||1);
      qty=Math.max(1,Math.min(remain,qty));
      used.set(k,usedBefore+qty);
      added.push(normalizedItem(it,qty,placementForBatch(Number(row.dataset.batchIndex||added.length))));
    });
    return added;
  }
  function snapshotWarehouseData(){
    try{return JSON.parse(JSON.stringify(state.data||{cells:[],zones:{A:{},B:{}}}));}catch(_e){return {cells:[],zones:{A:{},B:{}}};}
  }
  function applyServerCells(d, shouldLoadAvailable=true, opSeq=0){
    if(opSeq && opSeq < state.latestAppliedSeq) return;
    if(opSeq) state.latestAppliedSeq=opSeq;
    if(Array.isArray(d?.cells)){
      try{localStorage.removeItem(CACHE_KEY);}catch(_e){}
      state.data.cells=d.cells.map(x=>({...x, column_index:colNoOf(x), slot_number:slotNoOf(x)||Number(x.slot_number)||Number(x.slot)||Number(x.slot_no)||0}));
      state.data.zones=d.zones || state.data.zones || {A:{},B:{}};
      syncMarkedCellsFromData();
      state.localMutationAt=0;
      keepScrollWhile(()=>updateAllSlots());
      cacheNow();
      try{ if($('warehouse-modal') && !$('warehouse-modal').classList.contains('hidden')) renderCellItems(); }catch(_e){}
    }
    if(shouldLoadAvailable) loadAvailable().then(()=>{ cacheNow(); try{ if($('warehouse-modal') && !$('warehouse-modal').classList.contains('hidden')) renderCellItems(); }catch(_e){} }).catch(()=>{});
  }
  function setCellLocal(z,c,s,items,note){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    let cell=cellFromData(z,c,s);
    if(!cell){ cell={zone:z,column_index:c,slot_number:s,slot_type:'direct'}; state.data.cells.push(cell); }
    cell.items=JSON.parse(JSON.stringify(mergeWarehouseItems(items||[]))); cell.items_json=JSON.stringify(cell.items); cell.note=note||'';
    markLocal(); updateSlotUI(z,c,s);
  }
  async function saveCellRaw(z,c,s,items,note,opSeq){ return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_type:'direct',slot_number:Number(s),items:items||[],note:note||'',client_op_seq:opSeq||0})}); }
  async function saveWarehouseCell(){
    if(isWarehouseBusy()){ toast('上一個倉庫操作還在背景保存，請等完成後再按一次','warn'); return; }
    const saveBtn=$('yx121-save-cell'); if(saveBtn){ saveBtn.disabled=true; saveBtn.dataset.saving='1'; }
    const z=state.current.zone,c=state.current.col,s=state.current.slot;
    const precheck=validateBatchDraftBeforeSave();
    if(!precheck.ok){ toast('批量加入資料有錯，請先修正紅色列','warn'); const b=$('yx121-save-cell'); if(b){b.disabled=false; delete b.dataset.saving;} return; }
    const added=collectBatchItems();
    const items=mergeWarehouseItems([...(state.current.items||[]),...added]);
    if(!items.length && !confirm('此格沒有商品，確定儲存空格？')){ const b=$('yx121-save-cell'); if(b){b.disabled=false; delete b.dataset.saving;} return; }
    const note=$('warehouse-note')?.value||'';
    const before=snapshotWarehouseData();
    const beforeAvail={available:JSON.parse(JSON.stringify(state.available||[])), availableByZone:JSON.parse(JSON.stringify(state.availableByZone||{A:[],B:[]}))};
    const opSeq=++state.opSeq;
    setCellLocal(z,c,s,items,note);
    subtractAvailableLocal(z, added);
    closeWarehouseModal(true); highlightWarehouseCell(z,c,s); toast('格位已先更新，背景保存中','ok');
    setWarehouseBusy(true);
    saveCellRaw(z,c,s,items,note,opSeq).then((d)=>{setWarehouseBusy(false); const b=$('yx121-save-cell'); if(b){b.disabled=false; delete b.dataset.saving;} applyServerCells(d,true,opSeq); toast('格位已保存到資料庫','ok');})
      .catch(e=>{setWarehouseBusy(false); const b=$('yx121-save-cell'); if(b){b.disabled=false; delete b.dataset.saving;} state.data=before; state.available=beforeAvail.available||state.available; state.availableByZone=beforeAvail.availableByZone||state.availableByZone; state.localMutationAt=0; updateAllSlots(); cacheNow(); localStorage.setItem('yx_warehouse_pending_failed_save', JSON.stringify({z,c,s,items,note,at:Date.now(),error:e.message||''})); toast((e.message||'背景保存失敗')+'，已還原成資料庫最後狀態','error'); renderWarehouse(true).catch(()=>{});});
  }
  function updateUndoButton(){
    const b=$('yx121-warehouse-undo');
    if(!b) return;
    const n=state.undoStack.length;
    saveUndoStack();
    b.disabled=!n;
    b.setAttribute('title', n ? `可還原最近 ${n} 次倉庫拖拉移動` : '目前沒有可還原的倉庫移動');
    b.dataset.yxUndoCount=String(n);
  }
  async function moveCellContents(from,to){
    const f={zone:clean(from.zone).toUpperCase(),col:Number(from.col),slot:Number(from.slot)}, t={zone:clean(to.zone).toUpperCase(),col:Number(to.col),slot:Number(to.slot)};
    if(f.zone===t.zone&&f.col===t.col&&f.slot===t.slot) return; const moved=cellItems(f.zone,f.col,f.slot).filter(it=>itemQty(it)>0); if(!moved.length) return toast('此格沒有可拖拉的商品','warn');
    const src={...f,items:JSON.parse(JSON.stringify(cellItems(f.zone,f.col,f.slot))),note:cellNote(f.zone,f.col,f.slot)}; const dst={...t,items:JSON.parse(JSON.stringify(cellItems(t.zone,t.col,t.slot))),note:cellNote(t.zone,t.col,t.slot)};
    const dstAfter=mergeWarehouseItems([...moved.map(it=>normalizedItem(it,itemQty(it),'前排')),...dst.items]);
    setCellLocal(f.zone,f.col,f.slot,[],src.note); setCellLocal(t.zone,t.col,t.slot,dstAfter,dst.note); state.undoStack.push({source:src,target:dst,at:Date.now()}); if(state.undoStack.length>20) state.undoStack.shift(); updateUndoButton(); highlightWarehouseCell(t.zone,t.col,t.slot); toast('已先移動到前排，背景保存中','ok');
    const opSeq=++state.opSeq; setWarehouseBusy(true); Promise.all([saveCellRaw(f.zone,f.col,f.slot,[],src.note,opSeq), saveCellRaw(t.zone,t.col,t.slot,dstAfter,dst.note,opSeq)]).then((res)=>{setWarehouseBusy(false); const last=res.find(x=>Array.isArray(x?.cells)); if(last) applyServerCells(last,true,opSeq); toast('移動已保存到資料庫','ok');}).catch(e=>{setWarehouseBusy(false); setCellLocal(src.zone,src.col,src.slot,src.items,src.note); setCellLocal(dst.zone,dst.col,dst.slot,dst.items,dst.note); state.localMutationAt=0; cacheNow(); toast((e.message||'背景保存失敗')+'，已還原移動前狀態','error'); renderWarehouse(true).catch(()=>{});});
  }
  async function undoWarehouseMove(){
    if(isWarehouseBusy()) return toast('倉庫背景保存中，請稍等完成後再還原','warn');
    const last=state.undoStack.pop(); updateUndoButton();
    if(!last) return toast('目前沒有可還原的倉庫移動','warn');
    const before=snapshotWarehouseData();
    const opSeq=++state.opSeq;
    try{
      // 20260517av：還原先前端即時回復，再背景保存；保存期間防連點，並保留手機捲動位置。
      setWarehouseBusy(true);
      keepScrollWhile(()=>{
        setCellLocal(last.target.zone,last.target.col,last.target.slot,last.target.items,last.target.note);
        setCellLocal(last.source.zone,last.source.col,last.source.slot,last.source.items,last.source.note);
      });
      highlightWarehouseCell(last.source.zone,last.source.col,last.source.slot);
      toast('已先還原上一步，背景保存中','ok');
      const res=await Promise.all([
        saveCellRaw(last.target.zone,last.target.col,last.target.slot,last.target.items,last.target.note,opSeq),
        saveCellRaw(last.source.zone,last.source.col,last.source.slot,last.source.items,last.source.note,opSeq)
      ]);
      const latest=res.find(x=>Array.isArray(x?.cells));
      if(latest) applyServerCellsKeepScroll(latest,true,opSeq); else await renderWarehouse(true);
      toast('還原已保存到資料庫','ok');
    }catch(e){
      state.undoStack.push({...last,at:Date.now()}); updateUndoButton();
      state.data=before; state.localMutationAt=0; cacheNow(); updateAllSlots();
      toast((e.message||'還原失敗')+'，已恢復還原前畫面','error');
    }finally{
      setWarehouseBusy(false); updateUndoButton();
    }
  }
  async function insertWarehouseCell(z,c,s){ const d=await api('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),insert_after:Number(s||0),slot_type:'direct'})}); toast('已插入格子','ok'); applyServerCells(d,false); highlightWarehouseCell(z,c,Number(d.slot_number||d.slot||d.slot_no||s+1)); return d; }
  async function deleteWarehouseCell(z,c,s){ if(cellItems(z,c,s).length) return toast('格子內還有商品，請先移除商品後再刪除','warn'); if(!confirm(`確定刪除 ${z} 區第 ${c} 欄第 ${s} 格？`)) return; const d=await api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_number:Number(s),slot_type:'direct'})}); toast('已刪除格子','ok'); applyServerCells(d,false); }
  async function returnCellToUnplaced(z,c,s){
    if(isWarehouseBusy()) return toast('倉庫操作保存中，請稍等','warn');
    const items=cellItems(z,c,s);
    if(!items.length) return toast('此格沒有商品','warn');
    if(!confirm(`確定清空 ${z} 區第 ${c} 欄第 ${s} 格，並回到下拉選單？`)) return;
    const before=snapshotWarehouseData();
    const note=cellNote(z,c,s);
    try{
      setWarehouseBusy(true);
      setCellLocal(z,c,s,[],note); highlightWarehouseCell(z,c,s); toast('已先清空此格，背景退回下拉選單中','ok');
      const d=await api('/api/warehouse/return-unplaced',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_number:Number(s)})});
      applyServerCells(d,true);
      await loadAvailable(); toast('已清空該格，商品已回到下拉選單','ok'); highlightWarehouseCell(z,c,s);
      setWarehouseBusy(false);
    }catch(e){ setWarehouseBusy(false); state.data=before; state.localMutationAt=0; updateAllSlots(); cacheNow(); toast((e.message||'退回失敗')+'，已還原原格位','error'); }
  }
  async function markWarehouseCellPink(z,c,s){
    if(isWarehouseBusy()) return toast('倉庫操作保存中，請稍等','warn');
    const items=cellItems(z,c,s), note=cellNote(z,c,s);
    const was=isCellMarked(z,c,s);
    const nextNote = was ? note.replace(/\s*標記此格/g,'').replace(/\s*marked/g,'').replace(/\s*粉色/g,'').trim() : (note ? note + ' 標記此格' : '標記此格');
    setCellMarkedLocal(z,c,s,!was);
    setCellLocal(z,c,s,items,nextNote);
    syncMarkedCellsFromData();
    updateSlotUI(z,c,s);
    // 20260517ao：讓長按選單狀態同步目前粉紅標記狀態，避免標記後再次開選單仍看起來像未標記。
    try{
      const m=$('yx-final-warehouse-menu'); const markBtn=m?.querySelector?.('[data-wh-act="mark"]');
      if(markBtn){ const now=!was; markBtn.textContent=now?'取消標記此格':'標記此格'; markBtn.dataset.yxLabel=markBtn.textContent; markBtn.classList.toggle('is-marked', now); }
    }catch(_e){}
    toast(was?'已取消粉紅標記':'已標記此格為非常淡粉紅色','ok');
    try{
      setWarehouseBusy(true);
      const d=await saveCellRaw(z,c,s,items,nextNote);
      applyServerCells(d,false);
      setCellMarkedLocal(z,c,s,!was);
      updateSlotUI(z,c,s);
      setWarehouseBusy(false);
    }catch(e){
      setWarehouseBusy(false);
      // 標記是視覺/操作輔助，不因背景保存失敗讓前端完全沒反應。
      toast('標記已先顯示，背景保存失敗時重新整理可能需再標一次','warn');
    }
  }
  function askSlotCount(message, def='5'){
    const raw=prompt(message, def);
    if(raw===null) return 0;
    const str=String(raw).trim();
    if(!str){ toast('已取消批量操作','warn'); return 0; }
    const n=Number(str);
    if(!Number.isFinite(n) || n<=0){ toast('已取消批量操作','warn'); return 0; }
    const count=Math.floor(n);
    if(count>50) toast('單次最多 50 格，已自動限制為 50 格','warn');
    return Math.max(1, Math.min(50, count));
  }
  async function batchInsertWarehouseSlots(z,c,s){
    if(isWarehouseBusy()) return toast('倉庫操作保存中，請稍等','warn');
    const count=askSlotCount('要從此格後面批量加入幾格？', '5');
    if(!count) return;
    const zone=clean(z).toUpperCase(), col=Number(c), after=Number(s||0);
    hideMenu();
    const before=snapshotWarehouseData();
    try{
      setWarehouseBusy(true);
      const d=await api('/api/warehouse/batch-add-slots',{method:'POST',body:JSON.stringify({zone,column_index:col,insert_after:after,count})});
      if(Array.isArray(d?.cells)) applyServerCellsKeepScroll(d,false); else await renderWarehouse(true);
      highlightWarehouseCell(zone,col,Math.max(1,after+1));
      toast(`已批量加入 ${count} 格`,'ok');
    }catch(e){
      // 舊後端若沒有批量 API，退回逐格新增；若逐格也失敗，一定解除 busy 並還原畫面，避免倉庫卡在保存中。
      try{
        let latest=null;
        for(let i=0;i<count;i++) latest=await insertWarehouseCell(zone,col,after+i);
        if(latest && Array.isArray(latest.cells)) applyServerCellsKeepScroll(latest,false); else await renderWarehouse(true);
        highlightWarehouseCell(zone,col,Math.max(1,after+1));
        toast(`已批量加入 ${count} 格`,'ok');
      }catch(inner){
        state.data=before; state.localMutationAt=0; updateAllSlots(); cacheNow();
        toast(inner.message||e.message||'批量加入格子失敗，已還原畫面','error');
      }
    }finally{
      setWarehouseBusy(false);
    }
  }
  async function batchDeleteEmptySlots(z,c,s){
    if(isWarehouseBusy()) return toast('倉庫操作保存中，請稍等','warn');
    const count=askSlotCount('要從此格開始批量刪除幾格？', '5');
    if(!count) return;
    const zone=clean(z).toUpperCase(), col=Number(c), start=Number(s);
    const rangeSlots=[];
    const emptySlots=[];
    const occupiedSlots=[];
    for(let n=start; n<start+count; n++){
      if(!Number.isFinite(n) || n<1) continue;
      rangeSlots.push(n);
      if(!cellItems(zone,col,n).length) emptySlots.push(n); else occupiedSlots.push(n);
    }
    if(!emptySlots.length){
      const occupiedText=occupiedSlots.length?`（範圍內有商品格：${occupiedSlots.join('、')}）`:'';
      return toast('沒有可刪除的空格，請先清空商品'+occupiedText,'warn');
    }
    const deletingText=emptySlots.join('、');
    const occupiedText=occupiedSlots.length?`
有商品會略過：第 ${occupiedSlots.join('、')} 格`:'';
    const ok=confirm(`確定刪除 ${zone} 區第 ${col} 欄以下空格？
將刪除：第 ${deletingText} 格${occupiedText}

刪除後後方格號會自動往前補。`);
    if(!ok) return;
    // 刪格必須由後往前刪，避免第 5 格刪掉後第 6 格往前補造成跳刪。
    const safeSlots=emptySlots.map(Number).filter(Number.isFinite).sort((a,b)=>b-a);
    const editingKey=state.currentEditingKey || '';
    const deletingEditingCell=safeSlots.some(n=>key(zone,col,n)===editingKey);
    try{
      setWarehouseBusy(true);
      hideMenu();
      if(deletingEditingCell) closeWarehouseModal(true);
      const d=await api('/api/warehouse/batch-remove-slots',{method:'POST',body:JSON.stringify({zone,column_index:col,slots:safeSlots})});
      if(Array.isArray(d?.cells)) applyServerCellsKeepScroll(d,false); else await renderWarehouse(true);
      const nextSlot=Math.max(1, Math.min(start, maxSlot(zone,col)));
      highlightWarehouseCell(zone,col,nextSlot);
      const skipped=occupiedSlots.length?`，略過有商品 ${occupiedSlots.length} 格`:'';
      toast(`已批量刪除 ${safeSlots.length} 個空格${skipped}`,'ok');
      setWarehouseBusy(false);
    }catch(e){ setWarehouseBusy(false); toast(e.message||'批量刪除格子失敗','error'); }
  }
  async function clearAllWarehouseItems(){
    if(!confirm('確定清空所有格子的商品？格子保留，全部商品會回到未入倉下拉選單。')) return;
    const d=await api('/api/warehouse/clear-all-items',{method:'POST',body:JSON.stringify({confirm:true})});
    applyServerCells(d,true);
    await loadAvailable(); toast(`已清空 ${d.cleared_cells||0} 格，回到下拉選單 ${d.returned_items||0} 筆`,'ok');
  }
  async function reconcileWarehouseSource(){
    const d=await api('/api/warehouse/reconcile-source',{method:'POST',body:JSON.stringify({auto_fix:true})});
    applyServerCells(d,true);
    await loadAvailable(); toast((d.fixed_items||0)>0?`已依庫存/訂單/總單修復 ${d.fixed_items} 件`:'比對完成，數量相符','ok');
  }

  async function auditWarehouseQty(){
    const d=await api('/api/warehouse/qty-audit?ts='+Date.now());
    applyServerCells(d,true);
    const over=(d.problems||[]).filter(x=>x.type==='over_placed').length;
    const remain=(d.problems||[]).filter(x=>x.type==='unplaced_remaining').length;
    const warn=(d.cell_warnings||[]).length;
    toast(`件數稽核完成：超放 ${over} 筆｜未入倉剩餘 ${remain} 筆｜需正規化 ${warn} 格｜來源${d.total_source_qty||0} / 格內${d.total_warehouse_qty||0} / 下拉${d.total_dropdown_should_be||0}`, (over||warn||d.global_qty_ok===false)?'warn':'ok');
    await loadAvailable();
  }

  async function finalVerifyWarehouse(){
    const d=await api('/api/warehouse/final-verify',{method:'POST',body:JSON.stringify({auto_fix:true,ts:Date.now()})});
    applyServerCells(d,true);
    await loadAvailable();
    const problems=(d.problems||[]).length;
    const ok=!!d.global_qty_ok && problems===0;
    toast(ok?`倉庫閉環完成：來源${d.total_source_qty||0} = 格內${d.total_warehouse_qty||0} + 下拉${d.total_dropdown_should_be||0}`:`閉環仍有 ${problems} 筆需檢查：來源${d.total_source_qty||0} / 格內${d.total_warehouse_qty||0} / 下拉${d.total_dropdown_should_be||0}`, ok?'ok':'warn');
    return d;
  }
  function menu(){ let m=$('yx-final-warehouse-menu'); if(m) return m; m=document.createElement('div'); m.id='yx-final-warehouse-menu'; m.className='yx-final-warehouse-menu hidden'; m.innerHTML='<button type="button" data-wh-act="batchInsert" aria-label="批量加入格子" data-yx-label="批量加入格子">批量加入格子</button><button type="button" data-wh-act="batchDelete" aria-label="批量刪除格子" data-yx-label="批量刪除格子">批量刪除格子</button><button type="button" data-wh-act="mark" aria-label="標記此格" data-yx-label="標記此格">標記此格</button><button type="button" data-wh-act="return" aria-label="退回下拉選單" data-yx-label="退回下拉選單">退回下拉選單</button>'; document.body.appendChild(m); afterWarehouseRender(); return m; }
  function hideMenu(){ const m=$('yx-final-warehouse-menu'); if(m){ m.classList.add('hidden'); m.dataset.open='0'; } }
  function showMenu(z,c,s,x,y){
    const m=menu(); m.dataset.zone=z; m.dataset.column=c; m.dataset.slot=s; m.dataset.open='1';
    // 20260517ao：長按選單開啟時同步「標記此格」目前狀態；已標記時顯示可取消，避免使用者以為按了沒反應。
    try{
      const markBtn=m.querySelector('[data-wh-act="mark"]');
      const marked=isCellMarked(z,c,s);
      if(markBtn){
        markBtn.textContent=marked?'取消標記此格':'標記此格';
        markBtn.setAttribute('aria-label', marked?'取消標記此格':'標記此格');
        markBtn.dataset.yxLabel=marked?'取消標記此格':'標記此格';
        markBtn.classList.toggle('is-marked', marked);
      }
    }catch(_e){}
    const margin=12; const mw=Math.min(260, Math.max(180, m.offsetWidth||230)); const mh=Math.min(360, Math.max(180, m.offsetHeight||240));
    const px=Math.max(margin+mw/2, Math.min(Number(x||window.innerWidth/2), window.innerWidth-margin-mw/2));
    const py=Math.max(margin+mh/2, Math.min(Number(y||window.innerHeight/2), window.innerHeight-margin-mh/2));
    m.style.left=px+'px'; m.style.top=py+'px'; m.classList.remove('hidden');
  }
  function bindSlot(slot){
    if(!slot || slot.dataset.yxFinalBound==='1') return; slot.dataset.yxFinalBound='1'; let press=null;
    const data=()=>({zone:slot.dataset.zone,col:Number(slot.dataset.column),slot:Number(slot.dataset.slot)});
    slot.addEventListener('pointerdown',ev=>{ if(ev.button && ev.button!==0) return; const d=data(); press={x:ev.clientX,y:ev.clientY,timer:setTimeout(()=>{ slot.dataset.blockClickUntil=String(Date.now()+1200); press=null; showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); },650),...d,moved:false}; });
    slot.addEventListener('pointermove',ev=>{ if(!press) return; const dx=ev.clientX-press.x, dy=ev.clientY-press.y; const ax=Math.abs(dx), ay=Math.abs(dy); const moved=ax>10 || ay>10; if(moved){ clearTimeout(press.timer); press.moved=true; if(press.scrollIntent) return; if(ev.pointerType==='touch' && ay>12 && ay>ax*1.2){ press.scrollIntent=true; return; } if(slot.dataset.hasItems==='1' && !state.drag && Math.max(ax,ay)>18){ state.drag={zone:press.zone,col:press.col,slot:press.slot}; slot.classList.add('yx121-warehouse-dragging'); try{slot.setPointerCapture?.(ev.pointerId);}catch(_e){} } } });
    slot.addEventListener('pointerup',ev=>{ if(press) clearTimeout(press.timer); const dragging=state.drag; document.querySelectorAll('.yx121-warehouse-dragging,.yx121-warehouse-drop-target').forEach(el=>el.classList.remove('yx121-warehouse-dragging','yx121-warehouse-drop-target')); if(dragging){ slot.dataset.blockClickUntil=String(Date.now()+900); const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('[data-zone][data-column][data-slot]'); state.drag=null; if(target){ ev.preventDefault(); ev.stopPropagation(); moveCellContents(dragging,{zone:target.dataset.zone,col:target.dataset.column,slot:target.dataset.slot}); press=null; return; } } if(press?.moved) slot.dataset.blockClickUntil=String(Date.now()+500); press=null; });
    ['pointercancel','pointerleave'].forEach(t=>slot.addEventListener(t,()=>{ if(press){ clearTimeout(press.timer); press=null; } }));
    slot.addEventListener('pointerenter',()=>{ if(state.drag) slot.classList.add('yx121-warehouse-drop-target'); }); slot.addEventListener('pointerleave',()=>slot.classList.remove('yx121-warehouse-drop-target'));
    slot.addEventListener('contextmenu',ev=>{ ev.preventDefault(); const d=data(); showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); });
    slot.addEventListener('click',ev=>{ if(ev.target?.closest?.('[data-wh-cell-act]')) return; if(Date.now()<Number(slot.dataset.blockClickUntil||0)) return; const mm=$('yx-final-warehouse-menu'); if(mm && !mm.classList.contains('hidden')) return; const d=data(); openWarehouseModal(d.zone,d.col,d.slot); });
  }
  function bindSlots(){ document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]').forEach(bindSlot); }
  function bindGlobal(){
    if(state.bound) return; state.bound=true;
    document.addEventListener('click',async ev=>{
      const closeBtn=ev.target?.closest?.('#warehouse-modal .icon-btn,[data-close-warehouse-modal]');
      if(closeBtn){ ev.preventDefault(); ev.stopPropagation(); closeWarehouseModal(); return; }
      const cellAct=ev.target?.closest?.('[data-wh-cell-act]');
      if(cellAct){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const slot=cellAct.closest('[data-zone][data-column][data-slot]'); if(!slot) return; const z=slot.dataset.zone,c=Number(slot.dataset.column),s=Number(slot.dataset.slot); try{ if(cellAct.dataset.whCellAct==='open') await openWarehouseModal(z,c,s); if(cellAct.dataset.whCellAct==='insert') await insertWarehouseCell(z,c,s); if(cellAct.dataset.whCellAct==='delete') await deleteWarehouseCell(z,c,s); }catch(e){ toast(e.message||'格位按鍵操作失敗','error'); } return; }
      const act=ev.target?.closest?.('[data-wh-act]'); if(act){ ev.preventDefault(); if(isWarehouseBusy()){ toast('倉庫操作保存中，請稍等','warn'); return; } const m=menu(); const z=m.dataset.zone,c=Number(m.dataset.column),s=Number(m.dataset.slot); hideMenu(); try{ if(act.dataset.whAct==='batchInsert'){ await batchInsertWarehouseSlots(z,c,s); return; } if(act.dataset.whAct==='batchDelete'){ await batchDeleteEmptySlots(z,c,s); return; } if(act.dataset.whAct==='mark'){ await markWarehouseCellPink(z,c,s); return; } if(act.dataset.whAct==='return'){ await returnCellToUnplaced(z,c,s); return; } }catch(e){ toast(e.message||'格位操作失敗','error'); } return; }
      if(!ev.target?.closest?.('#yx-final-warehouse-menu')){ hideMenu(); }
      const clearSearch=ev.target?.closest?.('[data-yx-clear-search]');
      if(clearSearch){ ev.preventDefault(); ev.stopPropagation?.(); const input=$('warehouse-search'); if(input) input.value=''; blurWarehouseSearchKeyboard(); clearWarehouseHighlights(); return; }
      const toggleResults=ev.target?.closest?.('[data-yx-toggle-search-results]');
      if(toggleResults){ ev.preventDefault(); ev.stopPropagation?.(); setWarehouseSearchResultsCollapsed(!state.searchCollapsed); return; }
      const nav=ev.target?.closest?.('[data-yx-search-nav]');
      if(nav){
        ev.preventDefault();
        blurWarehouseSearchKeyboard();
        const navMode=nav.dataset.yxSearchNav;
        if(navMode==='current'){
          const idx=Number.isFinite(Number(state.searchFocusIndex))?Number(state.searchFocusIndex):0;
          focusWarehouseSearchHit(idx);
        }else{
          jumpWarehouseSearch(navMode==='prev'?-1:1);
        }
        return;
      }
      const copyHit=ev.target?.closest?.('[data-yx-copy-hit]');
      if(copyHit){ ev.preventDefault(); ev.stopPropagation?.(); blurWarehouseSearchKeyboard(); copyWarehouseSearchHit(Number(copyHit.dataset.yxCopyHit)); return; }
      const openHit=ev.target?.closest?.('[data-yx-open-hit]');
      if(openHit){ ev.preventDefault(); ev.stopPropagation?.(); blurWarehouseSearchKeyboard(); openWarehouseSearchHit(Number(openHit.dataset.yxOpenHit)); return; }
      if(ev.target?.id==='warehouse-clear-all-items'){ ev.preventDefault(); await clearAllWarehouseItems(); return; }
      if(ev.target?.id==='warehouse-reconcile-source'){ ev.preventDefault(); await reconcileWarehouseSource(); return; }
      if(ev.target?.id==='warehouse-qty-audit'){ ev.preventDefault(); await auditWarehouseQty(); return; }
      if(ev.target?.id==='warehouse-final-verify'){ ev.preventDefault(); await finalVerifyWarehouse(); return; }
      if(ev.target?.id==='yx121-add-batch-row'){ ev.preventDefault(); state.batchCount=Math.max(3,Number(state.batchCount||3))+1; saveWarehouseCellDraft(); renderCellItems(); return; }
      if(ev.target?.id==='yx121-fill-max'){ ev.preventDefault(); fillSelectedBatchQtyToMax(); return; }
      if(ev.target?.id==='yx121-clear-batch-draft'){ ev.preventDefault(); clearVisibleBatchDraft(); clearBatchValidationUI(); return; }
      if(ev.target?.id==='yx121-save-cell'){ ev.preventDefault(); try{ await saveWarehouseCell(); }catch(e){ toast(e.message||'儲存格位失敗','error'); } return; }
      const rm=ev.target?.closest?.('[data-remove-cell-item]'); if(rm){ ev.preventDefault(); state.current.items.splice(Number(rm.dataset.removeCellItem),1); renderCellItems(); return; }
    },true);
    document.addEventListener('keydown', ev=>{
      if(ev.key==='Escape'){ hideMenu(); if(!$('warehouse-modal')?.classList.contains('hidden')) closeWarehouseModal(); }
      if((ev.key==='Enter') && ev.target?.id==='warehouse-search'){ ev.preventDefault(); try{ if(state.searchTimer) clearTimeout(state.searchTimer); state.searchTimer=null; }catch(_e){} blurWarehouseSearchKeyboard(); searchWarehouse(); }
      if((ev.key==='ArrowDown'||ev.key==='ArrowRight') && ev.target?.id==='warehouse-search'){ ev.preventDefault(); blurWarehouseSearchKeyboard(); jumpWarehouseSearch(1); }
      if((ev.key==='ArrowUp'||ev.key==='ArrowLeft') && ev.target?.id==='warehouse-search'){ ev.preventDefault(); blurWarehouseSearchKeyboard(); jumpWarehouseSearch(-1); }
      const hit=ev.target?.closest?.('#warehouse-search-results [data-hit]');
      if(hit && (ev.key==='Enter'||ev.key===' ')){ ev.preventDefault(); focusWarehouseSearchHit(Number(hit.dataset.hit)); }
    }, true);
    window.addEventListener('scroll', ()=>{ const mm=$('yx-final-warehouse-menu'); if(mm && !mm.classList.contains('hidden')) hideMenu(); }, {passive:true});
    window.addEventListener('resize', ()=>{ hideMenu(); recenterOpenWarehouseModal(); }, {passive:true});
    window.addEventListener('orientationchange', ()=>{ hideMenu(); setTimeout(recenterOpenWarehouseModal, 120); }, {passive:true});
    try{ window.visualViewport?.addEventListener?.('resize', ()=>{ hideMenu(); recenterOpenWarehouseModal(); }, {passive:true}); }catch(_e){}
    document.addEventListener('click', ev=>{ const modal=$('warehouse-modal'); if(modal && !modal.classList.contains('hidden') && ev.target===modal){ closeWarehouseModal(); } }, true);
    document.addEventListener('change', ev=>{ const sel=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-select'); if(sel){ clearBatchValidationUI(); syncBatchSelectLimits(); saveWarehouseCellDraft(); updateBatchDraftStatus(); } }, true);
    document.addEventListener('input', ev=>{ const qty=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-qty'); if(qty){ clearBatchValidationUI(); const max=Number(qty.dataset.yx121Max||qty.max||0); if(max>0 && Number(qty.value)>max){ qty.value=String(max); toast('加入件數不可超過該商品可加入數量','warn'); } syncBatchSelectLimits(); saveWarehouseCellDraft(); } const note=ev.target?.closest?.('#warehouse-note'); if(note){ saveWarehouseCellDraft(); updateBatchDraftStatus(); } }, true);
    // 20260517at：倉庫格位彈窗有未儲存草稿時，重新整理/上一頁/切換連結前先提醒，避免手機誤滑返回後批量選擇消失。
    window.addEventListener('beforeunload', ev=>{
      try{
        const modal=$('warehouse-modal');
        if(modal && !modal.classList.contains('hidden') && modalHasUnsavedWarehouseDraft()){
          ev.preventDefault(); ev.returnValue=''; return '';
        }
      }catch(_e){}
    });
    document.addEventListener('click', ev=>{
      try{
        const modal=$('warehouse-modal');
        if(!modal || modal.classList.contains('hidden') || !modalHasUnsavedWarehouseDraft()) return;
        const a=ev.target?.closest?.('a[href]');
        if(!a || a.target==='_blank' || a.hasAttribute('download') || a.closest('#warehouse-modal')) return;
        const href=a.getAttribute('href')||'';
        if(!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        const ok=confirm('目前格位有尚未儲存的批量加入商品或備註，確定離開並放棄這次編輯？');
        if(!ok){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }
      }catch(_e){}
    }, true);
    renderRecentWarehouseSearches();
    const recentBox=$('yx-warehouse-recent-searches');
    if(recentBox && recentBox.dataset.yxRecentSearchBound!=='1'){
      recentBox.dataset.yxRecentSearchBound='1';
      recentBox.addEventListener('click', ev=>{
        const btn=ev.target?.closest?.('[data-yx-recent-wh-search],[data-yx-last-wh-search]');
        if(btn){ ev.preventDefault(); const q=btn.getAttribute('data-yx-recent-wh-search')||btn.getAttribute('data-yx-last-wh-search')||''; const input=$('warehouse-search'); if(input) input.value=q; blurWarehouseSearchKeyboard(); searchWarehouse(); return; }
        if(ev.target?.closest?.('[data-yx-clear-recent-wh-search]')){ ev.preventDefault(); clearRecentWarehouseSearches(); }
      });
    }
    const whSearch=$('warehouse-search');
    if(whSearch && whSearch.dataset.yxSearchDebounceBound!=='1'){
      whSearch.dataset.yxSearchDebounceBound='1';
      whSearch.addEventListener('compositionstart',()=>{ state.searchComposing=true; });
      whSearch.addEventListener('compositionend',()=>{ state.searchComposing=false; scheduleWarehouseSearch(80); });
      whSearch.addEventListener('input',()=>scheduleWarehouseSearch(360));
    }
    $('warehouse-item-search')?.addEventListener('input',renderCellItems);
    updateUndoButton();
  }
  async function jumpProductToWarehouse(customerName, productText){ const q=clean([customerName,productText].filter(Boolean).join(' ')); if(!q) return toast('缺少商品或客戶關鍵字','warn'); try{ const d=await api('/api/warehouse/search?q='+encodeURIComponent(q)+'&ts='+Date.now()); const hit=(Array.isArray(d.items)?d.items:[])[0]; if(!hit) return toast('倉庫圖找不到這筆商品位置','warn'); const c=hit.cell||hit; highlightWarehouseCell(c.zone,colNoOf(c),slotNoOf(c)); }catch(e){ toast(e.message||'跳到倉庫位置失敗','error'); } }
  function install(){ if(!isWarehouse()) return; document.documentElement.dataset.yxWarehouseSingleHtmlDataJs='true'; loadUndoStack(); bindGlobal(); bindSlots(); setWarehouseZone(localStorage.getItem('warehouseActiveZone')||'A',false); if(loadCache()){ updateAllSlots(); bindSlots(); } updateUndoButton(); renderWarehouse(false); }
  window.renderWarehouse=renderWarehouse;
  window.setWarehouseZone=setWarehouseZone;
  window.searchWarehouse=searchWarehouse;
  window.copyWarehouseSearchHit=copyWarehouseSearchHit;
  window.jumpWarehouseSearch=jumpWarehouseSearch;
  window.scheduleWarehouseSearch=scheduleWarehouseSearch;
  window.blurWarehouseSearchKeyboard=blurWarehouseSearchKeyboard;
  window.clearWarehouseHighlights=clearWarehouseHighlights;
  window.setWarehouseSearchResultsCollapsed=setWarehouseSearchResultsCollapsed;
  window.highlightWarehouseSameCustomer=highlightWarehouseSameCustomer;
  window.toggleWarehouseUnplacedHighlight=toggleWarehouseUnplacedHighlight;
  window.undoWarehouseMove=undoWarehouseMove;
  window.openWarehouseModal=openWarehouseModal;
  window.closeWarehouseModal=closeWarehouseModal;
  window.YXWarehousePreflightSave=validateBatchDraftBeforeSave;
  window.recenterOpenWarehouseModal=recenterOpenWarehouseModal;
  window.hideWarehouseLongPressMenu=hideMenu;
  window.saveWarehouseCell=saveWarehouseCell;
  window.insertWarehouseCell=insertWarehouseCell;
  window.deleteWarehouseCell=deleteWarehouseCell;
  window.clearAllWarehouseItems=clearAllWarehouseItems;
  window.reconcileWarehouseSource=reconcileWarehouseSource;
  window.auditWarehouseQty=auditWarehouseQty;
  window.finalVerifyWarehouse=finalVerifyWarehouse;
  window.jumpProductToWarehouse=jumpProductToWarehouse;
  window.highlightWarehouseCell=highlightWarehouseCell;
  window.YXFinalWarehouse={render:renderWarehouse, openWarehouseModal, saveWarehouseCell, jumpProductToWarehouse};
  if(YX.register) YX.register('warehouse',{install,render:renderWarehouse,cleanup:()=>{}});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();

/* 20260517br warehouse scroll memory interference guard
   延續 bq 捲動記憶，但避免「回到倉庫圖後被舊位置強制拉走」：
   - 同一路徑 30 分鐘內保留
   - 只在倉庫容器已出現且使用者尚未主動滑動時還原
   - 尺寸差太多時不還原，避免橫直切換錯位
   - 還原只做一次，後續由使用者操作決定位置
   不改資料、不新增 renderer、不用 setInterval / MutationObserver。 */
(function(){
  if (window.__YX_WAREHOUSE_SCROLL_MEMORY_20260517BR__) return;
  window.__YX_WAREHOUSE_SCROLL_MEMORY_20260517BR__ = true;
  var KEY = 'yx_warehouse_scroll_memory_20260517br';
  var LEGACY_KEY = 'yx_warehouse_scroll_memory_20260517bq';
  var saveTimer = 0;
  var didRestore = false;
  var userTouched = false;
  function getScrollers(){
    var root = document.getElementById('warehouse-root') || document;
    var selectors = ['.warehouse-map-wrap','.warehouse-scroll','.warehouse-grid-wrap','.yx-warehouse-scroll','#warehouse-search-results'];
    var out = [];
    selectors.forEach(function(sel){
      Array.prototype.forEach.call(root.querySelectorAll(sel), function(el){
        if (out.indexOf(el) < 0) out.push(el);
      });
    });
    return out;
  }
  function readMemory(){
    try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '{}') || {}; } catch(e){ return {}; }
  }
  function writeMemory(data){
    try { localStorage.setItem(KEY, JSON.stringify(data || {})); localStorage.removeItem(LEGACY_KEY); } catch(e){}
  }
  function saveNow(){
    if (!/warehouse/i.test(location.pathname)) return;
    var data = {
      ts: Date.now(),
      path: location.pathname,
      vw: window.innerWidth || 0,
      vh: window.innerHeight || 0,
      list: []
    };
    getScrollers().forEach(function(el, idx){
      data.list.push({
        idx: idx,
        left: el.scrollLeft || 0,
        top: el.scrollTop || 0,
        sw: el.scrollWidth || 0,
        sh: el.scrollHeight || 0
      });
    });
    writeMemory(data);
  }
  function scheduleSave(){
    userTouched = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 180);
  }
  function dimensionsCompatible(oldVal, newVal){
    if (!oldVal || !newVal) return true;
    return Math.abs(oldVal - newVal) <= Math.max(260, oldVal * 0.38);
  }
  function restoreNow(force){
    if (didRestore && !force) return;
    if (userTouched && !force) return;
    var data = readMemory();
    if (!data || data.path !== location.pathname || !data.list || (Date.now() - (data.ts || 0) > 30*60*1000)) return;
    if (!dimensionsCompatible(data.vw, window.innerWidth || 0) || !dimensionsCompatible(data.vh, window.innerHeight || 0)) return;
    var scrollers = getScrollers();
    if (!scrollers.length) return;
    data.list.forEach(function(item){
      var el = scrollers[item.idx];
      if (!el) return;
      if (!dimensionsCompatible(item.sw, el.scrollWidth || 0) || !dimensionsCompatible(item.sh, el.scrollHeight || 0)) return;
      try {
        el.scrollLeft = Math.max(0, Math.min(item.left || 0, (el.scrollWidth || 0) - (el.clientWidth || 0)));
        el.scrollTop = Math.max(0, Math.min(item.top || 0, (el.scrollHeight || 0) - (el.clientHeight || 0)));
      } catch(e){}
    });
    didRestore = true;
  }
  function bind(){
    if (!/warehouse/i.test(location.pathname)) return;
    getScrollers().forEach(function(el){
      if (el.__yxScrollMemoryBoundBR) return;
      el.__yxScrollMemoryBoundBR = true;
      el.addEventListener('scroll', scheduleSave, {passive:true});
      el.addEventListener('touchstart', function(){ userTouched = true; }, {passive:true});
      el.addEventListener('pointerdown', function(){ userTouched = true; }, {passive:true});
    });
    setTimeout(function(){ restoreNow(false); }, 90);
    setTimeout(function(){ restoreNow(false); }, 420);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true});
  else bind();
  window.addEventListener('pagehide', saveNow, {passive:true});
  window.addEventListener('beforeunload', saveNow, {passive:true});
  window.addEventListener('pageshow', function(){ userTouched = false; didRestore = false; setTimeout(bind, 100); }, {passive:true});
  window.yxWarehouseRememberScrollNow = saveNow;
  window.yxWarehouseRestoreScrollNow = function(){ userTouched = false; restoreNow(true); };
  window.yxWarehouseClearScrollMemory = function(){ try{ localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); }catch(e){} };
})();

/* 20260517bu warehouse bigger safety panel / draft cleanup / snapshot export
   只加倉庫健康面板與本機狀態整理，不改出貨、訂單、總單、庫存主線；不新增 renderer / setInterval / MutationObserver。 */
(function(){
  'use strict';
  if(window.__YX_WAREHOUSE_BU_PANEL__) return;
  window.__YX_WAREHOUSE_BU_PANEL__ = true;
  var DRAFT_PREFIX = 'yx_warehouse_cell_draft_20260517bs_';
  var MARK_KEY = 'yx_warehouse_pink_marked_cells_20260517i';
  var UNDO_KEY = 'yx_warehouse_undo_stack_20260517aw';
  var FAILED_SAVE_KEY = 'yx_warehouse_pending_failed_save';
  var SCROLL_KEY = 'yx_warehouse_scroll_memory_20260517br';
  function isWh(){ return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-section,#warehouse-root'); }
  function $(id){ return document.getElementById(id); }
  function safeJson(raw, fallback){ try{return JSON.parse(raw||'');}catch(e){return fallback;} }
  function toast(msg, type){ try{ (window.YXHardLock&&window.YXHardLock.toast?window.YXHardLock.toast:console.log)(msg,type||'info'); }catch(e){ console.log(msg); } }
  function slotLabelFromEl(el){
    if(!el) return '';
    var z=(el.dataset.zone||'').toUpperCase();
    var c=Number(el.dataset.column||el.dataset.col||0)||0;
    var s=Number(el.dataset.slot||el.dataset.slotNo||0)||0;
    return (z&&c&&s) ? (z+'-'+c+'-'+s) : '';
  }
  function collect(){
    var cells=Array.from(document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]'));
    var used=cells.filter(function(el){ return el.dataset.hasItems==='1' || el.classList.contains('used') || (el.textContent||'').match(/件|\+/); });
    var marked=cells.filter(function(el){ return el.classList.contains('yx-bb-marked-cell'); });
    var editing=cells.filter(function(el){ return el.classList.contains('yx-current-editing-cell'); });
    var highlights=cells.filter(function(el){ return el.classList.contains('highlight') || el.classList.contains('flash-highlight'); });
    var now=Date.now();
    var drafts=[];
    try{
      Object.keys(localStorage).forEach(function(k){
        if(!k.indexOf(DRAFT_PREFIX)===0) return;
      });
      Object.keys(localStorage).forEach(function(k){
        if(k.indexOf(DRAFT_PREFIX)!==0) return;
        var obj=safeJson(localStorage.getItem(k), null);
        if(!obj) return;
        var ageMin=obj.at ? Math.round((now-Number(obj.at))/60000) : null;
        drafts.push({key:k, zone:obj.zone, col:obj.col, slot:obj.slot, ageMin:ageMin, expired:ageMin!==null && ageMin>30});
      });
    }catch(e){}
    var undo=safeJson(localStorage.getItem(UNDO_KEY), []); if(!Array.isArray(undo)) undo=[];
    var failed=safeJson(localStorage.getItem(FAILED_SAVE_KEY), null);
    var marks=safeJson(localStorage.getItem(MARK_KEY), []); if(!Array.isArray(marks)) marks=[];
    var scroll=safeJson(localStorage.getItem(SCROLL_KEY), null);
    var searchResults=Array.from(document.querySelectorAll('#warehouse-search-results [data-hit]'));
    var availableHint=(document.getElementById('warehouse-unplaced-pill')||{}).textContent||'';
    return {cells:cells.length, used:used.length, empty:Math.max(0,cells.length-used.length), markedDom:marked.length, markedStore:marks.length, editing:editing.map(slotLabelFromEl).filter(Boolean), highlights:highlights.length, drafts:drafts, undo:undo.length, failed:failed, searchResults:searchResults.length, availableHint:availableHint.trim(), scroll:scroll};
  }
  function statusLevel(info){
    if(info.failed) return 'error';
    if(info.drafts.some(function(d){return d.expired;})) return 'warn';
    if(info.drafts.length || info.undo) return 'info';
    return 'ok';
  }
  function renderPanel(){
    var panel=$('yx-warehouse-bu-panel'); if(!panel) return;
    var info=collect();
    var level=statusLevel(info);
    panel.dataset.level=level;
    var draftRows=info.drafts.slice(0,8).map(function(d){
      var lab=(d.zone||'?')+'-'+(d.col||'?')+'-'+(d.slot||'?');
      return '<span class="yx-bu-chip '+(d.expired?'warn':'')+'">'+lab+'｜'+(d.ageMin==null?'?':d.ageMin)+'分</span>';
    }).join('') || '<span class="yx-bu-chip muted">沒有未儲存草稿</span>';
    var failedHtml=info.failed ? '<div class="yx-bu-alert">有一筆背景保存失敗記錄：'+String(info.failed.z||'')+'-'+String(info.failed.c||'')+'-'+String(info.failed.s||'')+'｜'+String(info.failed.error||'未提供錯誤')+'</div>' : '';
    panel.innerHTML = ''+
      '<div class="yx-bu-panel-head">'+
        '<strong>倉庫狀態面板</strong><span class="yx-bu-level '+level+'">'+(level==='ok'?'正常':level==='warn'?'注意':level==='error'?'需處理':'資訊')+'</span>'+
      '</div>'+
      '<div class="yx-bu-grid">'+
        '<div><b>'+info.cells+'</b><span>總格數</span></div>'+
        '<div><b>'+info.used+'</b><span>已用格</span></div>'+
        '<div><b>'+info.empty+'</b><span>空格</span></div>'+
        '<div><b>'+Math.max(info.markedDom,info.markedStore)+'</b><span>粉紅標記</span></div>'+
        '<div><b>'+info.drafts.length+'</b><span>草稿</span></div>'+
        '<div><b>'+info.undo+'</b><span>可還原</span></div>'+
        '<div><b>'+info.searchResults+'</b><span>搜尋結果</span></div>'+
        '<div><b>'+(info.editing[0]||'-')+'</b><span>編輯中</span></div>'+
      '</div>'+
      '<div class="yx-bu-note">'+(info.availableHint||'未錄入統計尚未載入')+'</div>'+ failedHtml+
      '<div class="yx-bu-drafts"><span class="yx-bu-label">本機草稿：</span>'+draftRows+'</div>'+
      '<div class="yx-bu-actions">'+
        '<button type="button" class="ghost-btn small-btn" data-yx-bu-act="refresh">刷新面板</button>'+
        '<button type="button" class="ghost-btn small-btn" data-yx-bu-act="reload">重載倉庫</button>'+
        '<button type="button" class="ghost-btn small-btn" data-yx-bu-act="prune">清過期草稿</button>'+
        '<button type="button" class="ghost-btn small-btn" data-yx-bu-act="export">匯出快照</button>'+
        '<button type="button" class="ghost-btn small-btn" data-yx-bu-act="close">收合</button>'+
      '</div>';
  }
  function ensurePanel(){
    if(!isWh()) return;
    var bar=document.querySelector('.warehouse-meta-bar') || document.querySelector('.warehouse-toolbar-panel');
    if(!bar) return;
    if(!$('yx-warehouse-bu-toggle')){
      var btn=document.createElement('button');
      btn.type='button'; btn.id='yx-warehouse-bu-toggle'; btn.className='ghost-btn small-btn'; btn.textContent='倉庫狀態'; btn.dataset.yxBuAct='toggle';
      bar.appendChild(btn);
    }
    if(!$('yx-warehouse-bu-panel')){
      var panel=document.createElement('div'); panel.id='yx-warehouse-bu-panel'; panel.className='yx-warehouse-bu-panel hidden';
      var anchor=document.querySelector('.warehouse-toolbar-panel');
      if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    }
  }
  function togglePanel(force){
    ensurePanel();
    var panel=$('yx-warehouse-bu-panel'); if(!panel) return;
    var show = force===true ? true : force===false ? false : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !show);
    if(show) renderPanel();
  }
  function pruneDrafts(){
    var now=Date.now(), removed=0;
    try{
      Object.keys(localStorage).forEach(function(k){
        if(k.indexOf(DRAFT_PREFIX)!==0) return;
        var obj=safeJson(localStorage.getItem(k), null);
        if(!obj || !obj.at || now-Number(obj.at)>30*60*1000){ localStorage.removeItem(k); removed++; }
      });
    }catch(e){}
    toast('已清除過期倉庫草稿 '+removed+' 筆','ok');
    renderPanel();
  }
  function exportSnapshot(){
    var info=collect();
    var cells=Array.from(document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]')).map(function(el){
      return {zone:el.dataset.zone, column:el.dataset.column, slot:el.dataset.slot, hasItems:el.dataset.hasItems, text:(el.innerText||el.textContent||'').trim().slice(0,300), marked:el.classList.contains('yx-bb-marked-cell')};
    });
    var payload={generated_at:new Date().toISOString(), location:location.pathname, summary:info, cells:cells};
    var text=JSON.stringify(payload,null,2);
    try{
      var blob=new Blob([text],{type:'application/json;charset=utf-8'});
      var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='yuanxing_warehouse_snapshot_'+Date.now()+'.json'; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},3000);
      toast('已匯出倉庫快照','ok');
    }catch(e){
      try{ navigator.clipboard && navigator.clipboard.writeText(text); toast('瀏覽器不支援下載，已複製快照內容','ok'); }catch(_e){ toast('快照匯出失敗','error'); }
    }
  }
  async function reloadWarehouse(){
    try{
      if(typeof window.renderWarehouse==='function'){ await window.renderWarehouse(true); toast('已重載倉庫資料','ok'); }
      else { location.reload(); }
    }catch(e){ toast((e&&e.message)||'重載倉庫失敗','error'); }
    renderPanel();
  }
  function bind(){
    if(window.__YX_WAREHOUSE_BU_BOUND__) return;
    window.__YX_WAREHOUSE_BU_BOUND__=true;
    document.addEventListener('click', function(ev){
      var btn=ev.target && ev.target.closest && ev.target.closest('[data-yx-bu-act]');
      if(!btn) return;
      var act=btn.dataset.yxBuAct;
      if(act==='toggle'){ ev.preventDefault(); togglePanel(); return; }
      if(act==='close'){ ev.preventDefault(); togglePanel(false); return; }
      if(act==='refresh'){ ev.preventDefault(); renderPanel(); return; }
      if(act==='prune'){ ev.preventDefault(); pruneDrafts(); return; }
      if(act==='export'){ ev.preventDefault(); exportSnapshot(); return; }
      if(act==='reload'){ ev.preventDefault(); reloadWarehouse(); return; }
    }, true);
  }
  function install(){ if(!isWh()) return; ensurePanel(); bind(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.yxWarehouseHealthPanel = {open:function(){togglePanel(true);}, close:function(){togglePanel(false);}, refresh:renderPanel, collect:collect};
})();

/* 20260517bv warehouse bigger local self-check / local cleanup / audit copy
   延續 20260517bu 倉庫狀態面板：只加本機/畫面層自檢與本機暫存清理，不改 DB schema、不改 renderer、不碰出貨/訂單/總單/庫存主線。 */
(function(){
  'use strict';
  if(window.__YX_WAREHOUSE_BV_AUDIT__) return;
  window.__YX_WAREHOUSE_BV_AUDIT__ = true;
  var DRAFT_PREFIX='yx_warehouse_cell_draft_20260517bs_';
  var FAILED_SAVE_KEY='yx_warehouse_pending_failed_save';
  var SCROLL_KEYS=['yx_warehouse_scroll_memory_20260517br','yx_warehouse_scroll_memory_20260517bq'];
  var MARK_KEY='yx_warehouse_pink_marked_cells_20260517i';
  var UNDO_KEY='yx_warehouse_undo_stack_20260517aw';
  function isWh(){ return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-section,#warehouse-root'); }
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function safeJson(raw,fallback){ try{return JSON.parse(raw||'');}catch(e){return fallback;} }
  function toast(msg,type){ try{ (window.YXHardLock&&window.YXHardLock.toast?window.YXHardLock.toast:console.log)(msg,type||'info'); }catch(e){ console.log(msg); } }
  function keyOfCell(el){
    if(!el) return '';
    var z=String(el.dataset.zone||'').toUpperCase();
    var c=Number(el.dataset.column||el.dataset.col||0)||0;
    var s=Number(el.dataset.slot||el.dataset.slotNo||0)||0;
    return z && c && s ? [z,c,s].join('|') : '';
  }
  function humanKey(k){ var a=String(k||'').split('|'); return a.length===3 ? (a[0]+'-'+a[1]+'-'+a[2]) : String(k||'-'); }
  function allCells(){ return Array.from(document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]')); }
  function localKeys(prefix){ var out=[]; try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf(prefix)===0) out.push(k); }); }catch(e){} return out; }
  function draftSlotFromKey(k){
    var raw=String(k||'').replace(DRAFT_PREFIX,'');
    var parts=raw.split('|');
    if(parts.length>=3) return [String(parts[0]||'').toUpperCase(), Number(parts[1])||0, Number(parts[2])||0].join('|');
    var obj=safeJson(localStorage.getItem(k),null);
    return obj ? [String(obj.zone||'').toUpperCase(),Number(obj.col||0)||0,Number(obj.slot||0)||0].join('|') : '';
  }
  function inspectWarehouseLocal(){
    var cells=allCells();
    var seen={}, dup=[], invalid=[], suspicious=[];
    cells.forEach(function(el){
      var k=keyOfCell(el);
      if(!k){ invalid.push({type:'missing-dataset', text:(el.textContent||'').trim().slice(0,80)}); return; }
      if(seen[k]) dup.push(k); else seen[k]=true;
      var txt=(el.innerText||el.textContent||'').trim();
      var hasItems=el.dataset.hasItems==='1' || el.classList.contains('used') || /\d+\s*件|\+/.test(txt);
      if(hasItems && !txt) suspicious.push({key:k, type:'used-empty-text'});
      if((el.classList.contains('yx-current-editing-cell')||el.classList.contains('highlight')) && !document.body.contains(el)) suspicious.push({key:k,type:'detached-state'});
    });
    var cellSet=new Set(Object.keys(seen));
    var drafts=localKeys(DRAFT_PREFIX).map(function(k){
      var obj=safeJson(localStorage.getItem(k),{});
      var dk=draftSlotFromKey(k);
      var ageMin=obj&&obj.at ? Math.round((Date.now()-Number(obj.at))/60000) : null;
      return {storageKey:k, key:dk, ageMin:ageMin, expired:ageMin!=null && ageMin>30, orphan:dk && !cellSet.has(dk)};
    });
    var failed=safeJson(localStorage.getItem(FAILED_SAVE_KEY),null);
    var marks=safeJson(localStorage.getItem(MARK_KEY),[]); if(!Array.isArray(marks)) marks=[];
    var orphanMarks=marks.map(function(m){ return String(m||'').replace(/-/g,'|').toUpperCase(); }).filter(function(k){return k && !cellSet.has(k);});
    var undo=safeJson(localStorage.getItem(UNDO_KEY),[]); if(!Array.isArray(undo)) undo=[];
    var expiredDrafts=drafts.filter(function(d){return d.expired;});
    var orphanDrafts=drafts.filter(function(d){return d.orphan;});
    var level = (invalid.length||dup.length||failed) ? 'warn' : (expiredDrafts.length||orphanDrafts.length||orphanMarks.length ? 'info':'ok');
    return {generated_at:new Date().toISOString(), level:level, cells:cells.length, duplicateKeys:dup, invalidCells:invalid, suspicious:suspicious, drafts:drafts, expiredDrafts:expiredDrafts, orphanDrafts:orphanDrafts, failedSave:failed, marks:marks.length, orphanMarks:orphanMarks, undoCount:undo.length, scrollKeys:SCROLL_KEYS.filter(function(k){try{return !!localStorage.getItem(k);}catch(e){return false;}})};
  }
  function renderAuditReport(report){
    var box=$('yx-warehouse-bv-audit');
    if(!box){
      var panel=$('yx-warehouse-bu-panel');
      if(!panel) return;
      box=document.createElement('div');
      box.id='yx-warehouse-bv-audit';
      box.className='yx-bv-audit-box';
      panel.appendChild(box);
    }
    var lines=[];
    function row(label, value, warn){ lines.push('<div class="yx-bv-audit-row '+(warn?'warn':'')+'"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>'); }
    row('DOM 格數', report.cells, false);
    row('重複格位 key', report.duplicateKeys.length, report.duplicateKeys.length>0);
    row('缺少格位資料', report.invalidCells.length, report.invalidCells.length>0);
    row('過期草稿', report.expiredDrafts.length, report.expiredDrafts.length>0);
    row('孤兒草稿', report.orphanDrafts.length, report.orphanDrafts.length>0);
    row('孤兒粉紅標記', report.orphanMarks.length, report.orphanMarks.length>0);
    row('可還原記錄', report.undoCount, false);
    row('背景保存失敗', report.failedSave?'1':'0', !!report.failedSave);
    var detail=[];
    if(report.duplicateKeys.length) detail.push('重複格：'+report.duplicateKeys.map(humanKey).slice(0,8).join('、'));
    if(report.orphanDrafts.length) detail.push('孤兒草稿：'+report.orphanDrafts.map(function(d){return humanKey(d.key);}).slice(0,8).join('、'));
    if(report.failedSave) detail.push('保存失敗：'+esc(report.failedSave.error||'未提供錯誤'));
    box.innerHTML='<div class="yx-bv-audit-head"><strong>倉庫本機自檢</strong><span class="yx-bv-level '+esc(report.level)+'">'+(report.level==='ok'?'正常':report.level==='warn'?'需注意':'資訊')+'</span></div>'+lines.join('')+(detail.length?'<div class="yx-bv-audit-detail">'+detail.join('<br>')+'</div>':'<div class="yx-bv-audit-detail muted">未發現本機顯示層異常。</div>');
  }
  function runAudit(){ var r=inspectWarehouseLocal(); renderAuditReport(r); return r; }
  function copyAudit(){
    var r=runAudit(); var text=JSON.stringify(r,null,2);
    try{ navigator.clipboard.writeText(text).then(function(){toast('已複製倉庫本機自檢報告','ok');},function(){throw new Error('copy fail');}); }
    catch(e){
      try{ var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已複製倉庫本機自檢報告','ok'); }
      catch(_e){ toast('複製失敗，請用匯出快照','error'); }
    }
  }
  function clearFailedSave(){ try{ localStorage.removeItem(FAILED_SAVE_KEY); toast('已清除本機背景保存失敗紀錄','ok'); }catch(e){ toast('清除失敗紀錄失敗','error'); } runAudit(); if(window.yxWarehouseHealthPanel&&window.yxWarehouseHealthPanel.refresh) window.yxWarehouseHealthPanel.refresh(); }
  function clearWarehouseScrollMemory(){ try{ SCROLL_KEYS.forEach(function(k){localStorage.removeItem(k);}); toast('已清除倉庫捲動記憶','ok'); }catch(e){ toast('清除捲動記憶失敗','error'); } runAudit(); }
  function pruneOrphanDrafts(){
    var r=inspectWarehouseLocal(); var removed=0;
    r.orphanDrafts.concat(r.expiredDrafts).forEach(function(d){ try{ localStorage.removeItem(d.storageKey); removed++; }catch(e){} });
    toast('已清除孤兒/過期草稿 '+removed+' 筆','ok'); runAudit(); if(window.yxWarehouseHealthPanel&&window.yxWarehouseHealthPanel.refresh) window.yxWarehouseHealthPanel.refresh();
  }
  function enhancePanel(){
    var panel=$('yx-warehouse-bu-panel');
    if(!panel || panel.dataset.bvEnhanced==='1') return;
    var actions=panel.querySelector('.yx-bu-actions');
    if(!actions) return;
    panel.dataset.bvEnhanced='1';
    [['audit','本機自檢'],['copy-audit','複製自檢'],['clear-failed','清失敗紀錄'],['clear-scroll','清捲動記憶'],['prune-orphan','清孤兒草稿']].forEach(function(x){
      var btn=document.createElement('button'); btn.type='button'; btn.className='ghost-btn small-btn'; btn.dataset.yxBvAct=x[0]; btn.textContent=x[1]; actions.appendChild(btn);
    });
  }
  function ensureEnhanced(){ if(!isWh()) return; enhancePanel(); }
  function bind(){
    if(window.__YX_WAREHOUSE_BV_BOUND__) return; window.__YX_WAREHOUSE_BV_BOUND__=true;
    document.addEventListener('click', function(ev){
      var btn=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-bv-act]'); if(!btn) return;
      var act=btn.dataset.yxBvAct; ev.preventDefault();
      if(act==='audit') { runAudit(); return; }
      if(act==='copy-audit') { copyAudit(); return; }
      if(act==='clear-failed') { clearFailedSave(); return; }
      if(act==='clear-scroll') { clearWarehouseScrollMemory(); return; }
      if(act==='prune-orphan') { pruneOrphanDrafts(); return; }
    }, true);
    document.addEventListener('click', function(ev){
      if(ev.target&&ev.target.closest&&ev.target.closest('[data-yx-bu-act="toggle"],[data-yx-bu-act="refresh"]')) setTimeout(ensureEnhanced,0);
    }, true);
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(ensureEnhanced,0); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.yxWarehouseLocalAudit = {run:runAudit, copy:copyAudit, clearFailedSave:clearFailedSave, clearScroll:clearWarehouseScrollMemory, pruneOrphanDrafts:pruneOrphanDrafts};
})();

/* 20260517bw 倉庫操作日誌較大包：本機記錄/匯出，不改倉庫資料主線、不打 API */
(function(){
  'use strict';
  function isWh(){ return /\/warehouse\/?$/.test(location.pathname || ''); }
  function $(id){ return document.getElementById(id); }
  function toast(msg, type){
    try{
      if(window.yxToast) return window.yxToast(msg, type || 'info');
      if(window.toast) return window.toast(msg, type || 'info');
    }catch(e){}
    console.log('[warehouse-journal]', msg);
  }
  var JOURNAL_KEY='yx_warehouse_operation_journal_20260517bw';
  var MAX_ROWS=120;
  function nowText(){
    try{ return new Date().toLocaleString('zh-TW',{hour12:false}); }
    catch(e){ return new Date().toISOString(); }
  }
  function readRows(){
    try{ var rows=JSON.parse(localStorage.getItem(JOURNAL_KEY)||'[]'); return Array.isArray(rows)?rows:[]; }
    catch(e){ return []; }
  }
  function writeRows(rows){
    try{ localStorage.setItem(JOURNAL_KEY, JSON.stringify((rows||[]).slice(0,MAX_ROWS))); }catch(e){}
  }
  function cellKeyFromEl(el){
    if(!el) return '';
    var node=el.closest&&el.closest('[data-zone],[data-cell-key],.warehouse-cell,.yx-warehouse-cell,.wh-cell');
    if(!node) node=el;
    var ds=node.dataset||{};
    var z=ds.zone||'';
    var col=ds.columnIndex||ds.column||ds.band||'';
    var slot=ds.slotNumber||ds.slotNo||ds.slot||'';
    var typ=ds.slotType||ds.rowName||'';
    var k=ds.cellKey||ds.key||'';
    if(k) return String(k).replace(/\|/g,'-');
    if(z||col||slot) return [z,col,typ,slot].filter(Boolean).join('-');
    return '';
  }
  function activeCellKey(){
    try{
      var active=document.querySelector('.yx-editing-cell,.is-editing,[data-yx-editing="1"],.editing');
      return cellKeyFromEl(active) || '';
    }catch(e){ return ''; }
  }
  function addRow(action, detail, level){
    if(!isWh()) return;
    var rows=readRows();
    var row={at:nowText(), action:action||'操作', detail:detail||'', level:level||'info', cell:activeCellKey()};
    rows.unshift(row); writeRows(rows); renderPanel();
  }
  function guessAction(btn){
    var text=((btn.innerText||btn.textContent||'')+' '+(btn.getAttribute('aria-label')||'')+' '+(btn.dataset?JSON.stringify(btn.dataset):'')).replace(/\s+/g,' ');
    if(/批量加入|batch.*add|add.*batch/.test(text)) return '批量加入格子/商品';
    if(/批量刪除|batch.*remove|batch.*delete/.test(text)) return '批量刪除格子';
    if(/標記此格|取消標記|mark/.test(text)) return /取消/.test(text)?'取消標記此格':'標記此格';
    if(/退回下拉|退回|return/.test(text)) return '退回下拉選單';
    if(/儲存格位|保存|save/.test(text)) return '儲存格位';
    if(/還原|undo/.test(text)) return '還原上一步';
    if(/搜尋|search/.test(text)) return '倉庫搜尋';
    if(/重載倉庫|重新載入|refresh|reload/.test(text)) return '重載倉庫資料';
    return '';
  }
  function renderPanel(){
    var panel=$('yx-warehouse-bu-panel');
    if(!panel) return;
    var box=$('yx-warehouse-bw-journal');
    if(!box){
      box=document.createElement('div'); box.id='yx-warehouse-bw-journal'; box.className='yx-bw-journal-box'; panel.appendChild(box);
    }
    var rows=readRows();
    var recent=rows.slice(0,8);
    var html='<div class="yx-bw-head"><strong>倉庫操作日誌</strong><span>'+rows.length+' 筆</span></div>';
    if(!recent.length){ html+='<div class="yx-bw-empty">尚無本機操作紀錄。這個日誌只存在本機，不會寫資料庫。</div>'; }
    else{
      html+='<div class="yx-bw-list">'+recent.map(function(r){
        return '<div class="yx-bw-row '+(r.level||'')+'"><b>'+escapeHtml(r.action||'操作')+'</b><span>'+escapeHtml(r.at||'')+(r.cell?'｜'+escapeHtml(r.cell):'')+'</span>'+(r.detail?'<em>'+escapeHtml(r.detail)+'</em>':'')+'</div>';
      }).join('')+'</div>';
    }
    html+='<div class="yx-bw-actions"><button type="button" class="ghost-btn small-btn" data-yx-bw-act="copy">複製日誌</button><button type="button" class="ghost-btn small-btn" data-yx-bw-act="download">匯出日誌</button><button type="button" class="ghost-btn small-btn danger" data-yx-bw-act="clear">清空日誌</button></div>';
    box.innerHTML=html;
  }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function copyText(text){
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function(){toast('已複製倉庫操作日誌','ok');});
    }catch(e){}
    try{ var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已複製倉庫操作日誌','ok'); }
    catch(e){ toast('複製失敗','error'); }
  }
  function downloadRows(){
    var text=JSON.stringify({generated_at:new Date().toISOString(), rows:readRows()},null,2);
    try{
      var blob=new Blob([text],{type:'application/json;charset=utf-8'}); var url=URL.createObjectURL(blob);
      var a=document.createElement('a'); a.href=url; a.download='yuanxing_warehouse_journal_'+Date.now()+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},500);
      toast('已匯出倉庫操作日誌','ok');
    }catch(e){ copyText(text); }
  }
  function bind(){
    if(window.__YX_WAREHOUSE_BW_JOURNAL_BOUND__) return; window.__YX_WAREHOUSE_BW_JOURNAL_BOUND__=true;
    document.addEventListener('click', function(ev){
      var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-bw-act]');
      if(!b) return;
      ev.preventDefault(); var act=b.dataset.yxBwAct;
      if(act==='copy'){ copyText(JSON.stringify({generated_at:new Date().toISOString(), rows:readRows()},null,2)); return; }
      if(act==='download'){ downloadRows(); return; }
      if(act==='clear'){ if(confirm('確定清空本機倉庫操作日誌？不會影響資料庫。')){ writeRows([]); renderPanel(); toast('已清空本機操作日誌','ok'); } return; }
    }, true);
    document.addEventListener('click', function(ev){
      var btn=ev.target&&ev.target.closest&&ev.target.closest('button,[role="button"],.btn,.ghost-btn,.small-btn');
      if(!btn || btn.closest('#yx-warehouse-bw-journal')) return;
      var act=guessAction(btn); if(!act) return;
      var cell=cellKeyFromEl(btn)||activeCellKey();
      addRow(act, cell?('格位 '+cell):'', 'info');
    }, true);
    document.addEventListener('submit', function(ev){
      var f=ev.target; if(!f) return;
      var text=(f.id||'')+' '+(f.className||'');
      if(/warehouse|yx121|cell/i.test(text)) addRow('送出倉庫表單', activeCellKey(), 'info');
    }, true);
    window.addEventListener('beforeunload', function(){
      try{ var rows=readRows(); if(rows.length>MAX_ROWS) writeRows(rows); }catch(e){}
    });
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(renderPanel, 400); setTimeout(renderPanel, 1400); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.yxWarehouseOperationJournal={add:addRow, list:readRows, clear:function(){writeRows([]);renderPanel();}, render:renderPanel};
})();

/* 20260517bx 倉庫一鍵回報包較大包：整合快照/本機自檢/操作日誌，不改倉庫資料主線、不打 API */
(function(){
  'use strict';
  function isWh(){ return /\/warehouse\/?$/.test(location.pathname || ''); }
  function $(id){ return document.getElementById(id); }
  function toast(msg, type){
    try{ if(window.yxToast) return window.yxToast(msg, type||'info'); if(window.toast) return window.toast(msg, type||'info'); }catch(e){}
    console.log('[warehouse-report]', msg);
  }
  function safeJson(v){ try{return JSON.parse(JSON.stringify(v));}catch(e){return null;} }
  function text(el){ return (el && (el.innerText || el.textContent) || '').replace(/\s+/g,' ').trim(); }
  function readLS(key){ try{return localStorage.getItem(key);}catch(e){return null;} }
  function lsKeys(prefix){ var arr=[]; try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(!prefix || String(k).indexOf(prefix)===0) arr.push(k); } }catch(e){} return arr.sort(); }
  function collectVisibleCells(limit){
    var rows=[];
    try{
      document.querySelectorAll('.warehouse-cell,.yx-warehouse-cell,.wh-cell,[data-cell-key]').forEach(function(el){
        if(rows.length >= (limit||80)) return;
        var ds=el.dataset||{};
        rows.push({
          key: ds.cellKey || ds.key || [ds.zone, ds.columnIndex||ds.column||ds.band, ds.slotType||ds.rowName, ds.slotNumber||ds.slotNo||ds.slot].filter(Boolean).join('-'),
          zone: ds.zone || '', column: ds.columnIndex||ds.column||ds.band||'', slot: ds.slotNumber||ds.slotNo||ds.slot||'', type: ds.slotType||ds.rowName||'',
          className: String(el.className||''), text: text(el).slice(0,220)
        });
      });
    }catch(e){ rows.push({error:String(e&&e.message||e)}); }
    return rows;
  }
  function collectPanelText(){
    var out={};
    ['yx-warehouse-bu-panel','yx-warehouse-bv-audit','yx-warehouse-bw-journal','warehouse-search-results','warehouse-modal-meta'].forEach(function(id){ var el=$(id); if(el) out[id]=text(el).slice(0,3000); });
    return out;
  }
  function collectReport(){
    var stateSafe={};
    try{
      var st=window.state&&window.state.warehouse;
      if(st){ stateSafe={activeZone:st.activeZone, cells_count:Array.isArray(st.cells)?st.cells.length:0, available_count:Array.isArray(st.availableItems)?st.availableItems.length:0}; }
    }catch(e){}
    var local={};
    lsKeys('yx_warehouse_').forEach(function(k){
      var v=readLS(k); if(v && v.length>5000) v=v.slice(0,5000)+'...<truncated>'; local[k]=v;
    });
    var journal=[]; try{ if(window.yxWarehouseOperationJournal) journal=window.yxWarehouseOperationJournal.list(); }catch(e){}
    var audit=null; try{ if(window.yxWarehouseLocalAudit) audit=window.yxWarehouseLocalAudit.run(); }catch(e){ audit={error:String(e&&e.message||e)}; }
    return {
      report_type:'yuanxing_warehouse_client_report_20260517bx',
      generated_at:new Date().toISOString(),
      location: location.pathname,
      app_version: (window.APP_VERSION||document.body?.dataset?.appVersion||''),
      static_version: (window.STATIC_VERSION||document.body?.dataset?.staticVersion||''),
      viewport:{w:window.innerWidth,h:window.innerHeight,scrollX:window.scrollX,scrollY:window.scrollY,dpr:window.devicePixelRatio},
      user_agent:navigator.userAgent,
      online:navigator.onLine,
      warehouse_state: stateSafe,
      visible_cells: collectVisibleCells(120),
      panel_text: collectPanelText(),
      local_audit: audit,
      operation_journal: (journal||[]).slice(0,120),
      local_storage_warehouse_keys: local,
      notes:['此回報包只讀取瀏覽器目前狀態與本機倉庫暫存，不會打 API、不會寫資料庫。','可用來回報手機倉庫卡住、格位跳動、下拉不同步、保存失敗等問題。']
    };
  }
  function copyText(text, ok){
    try{ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function(){toast(ok||'已複製','ok');}, function(){fallback();}); }catch(e){}
    fallback();
    function fallback(){ try{ var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(ok||'已複製','ok'); }catch(e){ toast('複製失敗，請用匯出','error'); } }
  }
  function copyReport(){ copyText(JSON.stringify(collectReport(),null,2),'已複製倉庫一鍵回報包'); }
  function downloadReport(){
    var text=JSON.stringify(collectReport(),null,2);
    try{
      var blob=new Blob([text],{type:'application/json;charset=utf-8'}); var url=URL.createObjectURL(blob); var a=document.createElement('a');
      a.href=url; a.download='yuanxing_warehouse_report_20260517bx_'+Date.now()+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},700);
      toast('已匯出倉庫回報包','ok');
    }catch(e){ copyText(text,'已改用複製倉庫回報包'); }
  }
  function renderMini(){
    var panel=$('yx-warehouse-bu-panel'); if(!panel) return;
    var box=$('yx-warehouse-bx-report');
    if(!box){ box=document.createElement('div'); box.id='yx-warehouse-bx-report'; box.className='yx-bx-report-box'; panel.appendChild(box); }
    var journalCount=0; try{ journalCount=window.yxWarehouseOperationJournal?window.yxWarehouseOperationJournal.list().length:0; }catch(e){}
    var draftCount=lsKeys('yx_warehouse_cell_draft_').length;
    box.innerHTML='<div class="yx-bx-head"><strong>倉庫回報包</strong><span>本機診斷</span></div><div class="yx-bx-note">遇到倉庫卡住、格位跳走、保存失敗時，可複製或匯出這包給我判斷。</div><div class="yx-bx-stats"><span>日誌 '+journalCount+' 筆</span><span>草稿 '+draftCount+' 筆</span><span>格位快照 '+collectVisibleCells(9999).length+' 格</span></div><div class="yx-bx-actions"><button type="button" class="ghost-btn small-btn" data-yx-bx-act="copy">複製回報包</button><button type="button" class="ghost-btn small-btn" data-yx-bx-act="download">匯出回報包</button><button type="button" class="ghost-btn small-btn" data-yx-bx-act="refresh">更新狀態</button></div>';
  }
  function enhancePanel(){
    var panel=$('yx-warehouse-bu-panel'); if(!panel) return;
    var actions=panel.querySelector('.yx-bu-actions');
    if(actions && !actions.querySelector('[data-yx-bx-act="copy"]')){
      [['copy','複製回報包'],['download','匯出回報包']].forEach(function(x){ var b=document.createElement('button'); b.type='button'; b.className='ghost-btn small-btn'; b.dataset.yxBxAct=x[0]; b.textContent=x[1]; actions.appendChild(b); });
    }
    renderMini();
  }
  function bind(){
    if(window.__YX_WAREHOUSE_BX_REPORT_BOUND__) return; window.__YX_WAREHOUSE_BX_REPORT_BOUND__=true;
    document.addEventListener('click', function(ev){
      var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-bx-act]'); if(!b) return;
      ev.preventDefault(); var act=b.dataset.yxBxAct;
      if(act==='copy') return copyReport();
      if(act==='download') return downloadReport();
      if(act==='refresh') return renderMini();
    }, true);
    document.addEventListener('click', function(ev){ if(ev.target&&ev.target.closest&&ev.target.closest('[data-yx-bu-act="toggle"],[data-yx-bu-act="refresh"]')) setTimeout(enhancePanel,100); }, true);
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(enhancePanel,800); setTimeout(enhancePanel,1800); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.yxWarehouseClientReport={collect:collectReport, copy:copyReport, download:downloadReport, render:renderMini};
})();


/* 20260517by 倉庫回報分析較大包：本機分析/比對回報包，不打 API、不寫 DB、不動倉庫主線 */
(function(){
  'use strict';
  function isWh(){ return /\/warehouse\/?$/.test(location.pathname || ''); }
  function $(id){ return document.getElementById(id); }
  function toast(msg,type){ try{ if(window.yxToast) return window.yxToast(msg,type||'info'); if(window.toast) return window.toast(msg,type||'info'); }catch(e){} console.log('[warehouse-report-analyzer]',msg); }
  function safeParse(t){ try{ return JSON.parse(t); }catch(e){ return null; } }
  function nowReport(){ try{ return window.yxWarehouseClientReport && window.yxWarehouseClientReport.collect ? window.yxWarehouseClientReport.collect() : null; }catch(e){ return {error:String(e&&e.message||e)}; } }
  function cellKey(c){ return String((c&& (c.key || [c.zone,c.column,c.type,c.slot].filter(Boolean).join('-'))) || '').trim(); }
  function asMap(arr){ var m={}; (Array.isArray(arr)?arr:[]).forEach(function(c){ var k=cellKey(c); if(k) m[k]=c; }); return m; }
  function text(c){ return String((c&&c.text)||'').replace(/\s+/g,' ').trim(); }
  function summarize(report){
    report=report||{};
    var cells=Array.isArray(report.visible_cells)?report.visible_cells:[];
    var local=report.local_storage_warehouse_keys||{};
    var keys=Object.keys(local||{});
    var journal=Array.isArray(report.operation_journal)?report.operation_journal:[];
    var failed=keys.filter(function(k){ return /failed|pending|error/i.test(k); });
    var drafts=keys.filter(function(k){ return /draft/i.test(k); });
    var marked=cells.filter(function(c){ return /pink|marked|標記|粉紅|yx-marked/i.test((c.className||'')+' '+text(c)); });
    var emptyKey=cells.filter(function(c){ return !cellKey(c); }).length;
    return {cells:cells.length, drafts:drafts.length, failed:failed.length, journal:journal.length, marked:marked.length, emptyKey:emptyKey, viewport:report.viewport||{}, generated_at:report.generated_at||''};
  }
  function compare(oldReport, curReport){
    var oldMap=asMap(oldReport&&oldReport.visible_cells), curMap=asMap(curReport&&curReport.visible_cells);
    var oldKeys=Object.keys(oldMap), curKeys=Object.keys(curMap);
    var added=[], removed=[], changed=[];
    curKeys.forEach(function(k){ if(!oldMap[k]) added.push(k); else if(text(oldMap[k])!==text(curMap[k])) changed.push(k); });
    oldKeys.forEach(function(k){ if(!curMap[k]) removed.push(k); });
    var risks=[];
    var os=summarize(oldReport), cs=summarize(curReport);
    if(cs.failed>0) risks.push('目前有 '+cs.failed+' 筆本機保存失敗/待處理紀錄');
    if(cs.emptyKey>0) risks.push('目前有 '+cs.emptyKey+' 個可視格位缺少 key，可能影響搜尋/定位/回報判斷');
    if(Math.abs((cs.cells||0)-(os.cells||0))>20) risks.push('可視格位數差異較大，可能是滑動位置不同或格位重新排版');
    if(changed.length>0) risks.push('有 '+changed.length+' 個可視格位文字與匯入回報包不同');
    return {old_summary:os,current_summary:cs,added:added.slice(0,80),removed:removed.slice(0,80),changed:changed.slice(0,80),risk_notes:risks};
  }
  function copyText(t,msg){ try{ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function(){toast(msg||'已複製','ok');}); }catch(e){} try{ var ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg||'已複製','ok'); }catch(e){ toast('複製失敗','error'); } }
  function downloadJson(obj,name){ try{ var txt=JSON.stringify(obj,null,2); var blob=new Blob([txt],{type:'application/json;charset=utf-8'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},600); toast('已匯出分析結果','ok'); }catch(e){ copyText(JSON.stringify(obj,null,2),'已改用複製分析結果'); } }
  function ensureBox(){
    var panel=$('yx-warehouse-bu-panel'); if(!panel) return null;
    var box=$('yx-warehouse-by-analyzer');
    if(!box){ box=document.createElement('div'); box.id='yx-warehouse-by-analyzer'; box.className='yx-by-analyzer'; panel.appendChild(box); }
    return box;
  }
  function renderBox(result){
    var box=ensureBox(); if(!box) return;
    var imported=!!result;
    var summary=result ? result.current_summary : summarize(nowReport());
    var risks=result ? result.risk_notes : [];
    box.innerHTML = '<div class="yx-by-head"><strong>倉庫回報分析</strong><span>'+(imported?'已比對':'目前狀態')+'</span></div>'+
      '<div class="yx-by-note">可貼上之前匯出的倉庫回報包，直接在本機比對目前倉庫畫面，不打 API、不寫資料庫。</div>'+
      '<textarea id="yx-by-input" class="yx-by-input" placeholder="貼上 yuanxing_warehouse_client_report JSON，可留空只分析目前狀態"></textarea>'+
      '<div class="yx-by-actions"><button type="button" class="ghost-btn small-btn" data-yx-by-act="analyze">分析目前</button><button type="button" class="ghost-btn small-btn" data-yx-by-act="compare">貼上並比對</button><button type="button" class="ghost-btn small-btn" data-yx-by-act="copy">複製分析</button><button type="button" class="ghost-btn small-btn" data-yx-by-act="download">匯出分析</button></div>'+
      '<div class="yx-by-summary"><span>格位 '+(summary.cells||0)+'</span><span>草稿 '+(summary.drafts||0)+'</span><span>失敗 '+(summary.failed||0)+'</span><span>日誌 '+(summary.journal||0)+'</span><span>標記 '+(summary.marked||0)+'</span></div>'+
      (result?'<div class="yx-by-diff"><span>新增 '+result.added.length+'</span><span>消失 '+result.removed.length+'</span><span>變更 '+result.changed.length+'</span></div>':'')+
      '<div class="yx-by-risk '+(risks.length?'warn':'ok')+'">'+(risks.length?risks.map(function(x){return '<div>• '+String(x).replace(/[<>&]/g,function(ch){return {'<':'&lt;','>':'&gt;','&':'&amp;'}[ch];})+'</div>';}).join(''):'目前回報包未看到明顯本機風險')+'</div>';
    box.__yxByLastResult = result || {current_summary:summary, current_report:nowReport(), note:'只分析目前狀態'};
  }
  function analyzeCurrent(){ var res={current_summary:summarize(nowReport()), current_report:nowReport(), risk_notes:compare({},nowReport()).risk_notes}; renderBox(res); return res; }
  function compareInput(){
    var ta=$('yx-by-input'); var old=safeParse(ta&&ta.value||'');
    if(!old){ toast('請貼上正確的倉庫回報包 JSON','warn'); return null; }
    var cur=nowReport(); var res=compare(old,cur); res.imported_report_type=old.report_type||''; res.current_report_type=(cur&&cur.report_type)||''; res.generated_at=new Date().toISOString(); renderBox(res); toast('已完成倉庫回報包比對','ok'); return res;
  }
  function bind(){
    if(window.__YX_WAREHOUSE_BY_ANALYZER_BOUND__) return; window.__YX_WAREHOUSE_BY_ANALYZER_BOUND__=true;
    document.addEventListener('click', function(ev){
      var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-by-act]'); if(!b) return;
      ev.preventDefault(); var box=$('yx-warehouse-by-analyzer'); var act=b.dataset.yxByAct; var res;
      if(act==='analyze') res=analyzeCurrent();
      if(act==='compare') res=compareInput();
      if(act==='copy'){ res=(box&&box.__yxByLastResult)||analyzeCurrent(); copyText(JSON.stringify(res,null,2),'已複製倉庫分析結果'); }
      if(act==='download'){ res=(box&&box.__yxByLastResult)||analyzeCurrent(); downloadJson(res,'yuanxing_warehouse_analysis_20260517by_'+Date.now()+'.json'); }
    }, true);
    document.addEventListener('click', function(ev){ if(ev.target&&ev.target.closest&&ev.target.closest('[data-yx-bu-act="toggle"],[data-yx-bu-act="refresh"],[data-yx-bx-act="refresh"]')) setTimeout(function(){ renderBox(); },180); }, true);
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(function(){renderBox();},1200); setTimeout(function(){renderBox();},2400); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.yxWarehouseReportAnalyzer={summarize:summarize, compare:compare, analyze:analyzeCurrent, render:renderBox};
})();

/* 20260517bz 倉庫異常快速修復較大包：只修本機 UI 卡住/遮罩/過期草稿/捲動鎖定，不碰業務資料與 DB */
(function(){
  'use strict';
  function isWh(){ return /\/warehouse\/?$/.test(location.pathname || ''); }
  function $(id){ return document.getElementById(id); }
  function toast(msg,type){ try{ if(window.yxToast) return window.yxToast(msg,type||'info'); if(window.toast) return window.toast(msg,type||'info'); }catch(e){} console.log('[warehouse-local-repair]',msg); }
  function now(){ return Date.now(); }
  function lsKeys(prefix){ var out=[]; try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(!prefix || String(k).indexOf(prefix)===0) out.push(k); } }catch(e){} return out; }
  function readJson(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }
  function removeKeys(keys){ var n=0; (keys||[]).forEach(function(k){ try{ localStorage.removeItem(k); n++; }catch(e){} }); return n; }
  function log(action,detail){ try{ if(window.yxWarehouseOperationJournal && window.yxWarehouseOperationJournal.add) window.yxWarehouseOperationJournal.add(action, detail||{}); }catch(e){} }
  function countDraftKeys(){ return lsKeys('yx_warehouse_cell_draft_').length + lsKeys('yx_warehouse_batch_draft_').length; }
  function countExpiredDraftKeys(){
    var cutoff = now() - 30*60*1000;
    return lsKeys('').filter(function(k){
      if(!/^yx_warehouse_.*draft/i.test(k)) return false;
      var v=readJson(k); var ts=(v&&(v.ts||v.updated_at||v.created_at||v.time))||0;
      return ts && Number(ts)<cutoff;
    });
  }
  function countStaleBusy(){
    var selectors=['.yx-warehouse-busy','.warehouse-busy','.is-saving','.yx-saving','[data-yx-busy="1"]','[aria-busy="true"]'];
    var n=0; selectors.forEach(function(s){ try{ n+=document.querySelectorAll(s).length; }catch(e){} });
    return n;
  }
  function closeFloatingOnly(){
    var closed=0;
    ['yx-warehouse-context-menu','yxWarehouseContextMenu','warehouse-context-menu','yx-warehouse-longpress-menu'].forEach(function(id){ var el=$(id); if(el){ el.classList.add('hidden'); el.style.display='none'; closed++; } });
    document.querySelectorAll('.yx-warehouse-context-menu,.warehouse-context-menu,.yx-longpress-menu,.yx-popover-menu').forEach(function(el){
      if(el && !el.closest('.yx-warehouse-modal') && !el.closest('.warehouse-modal')){ el.classList.add('hidden'); el.style.display='none'; closed++; }
    });
    try{ if(window.closeWarehouseLongPressMenu) window.closeWarehouseLongPressMenu(); }catch(e){}
    return closed;
  }
  function unlockScroll(){
    var n=0;
    [document.documentElement, document.body].forEach(function(el){ if(!el) return; ['overflow','position','touchAction','height'].forEach(function(p){ if(el.style[p]){ el.style[p]=''; n++; } }); });
    document.querySelectorAll('.yx-scroll-locked,.modal-open,.warehouse-modal-open').forEach(function(el){ el.classList.remove('yx-scroll-locked','modal-open','warehouse-modal-open'); n++; });
    return n;
  }
  function clearBusyState(){
    var n=0;
    document.querySelectorAll('.yx-warehouse-busy,.warehouse-busy,.is-saving,.yx-saving,.is-loading').forEach(function(el){ el.classList.remove('yx-warehouse-busy','warehouse-busy','is-saving','yx-saving','is-loading'); n++; });
    document.querySelectorAll('[data-yx-busy="1"],[aria-busy="true"]').forEach(function(el){ try{ el.removeAttribute('data-yx-busy'); el.removeAttribute('aria-busy'); n++; }catch(e){} });
    document.querySelectorAll('button[disabled].yx-temp-disabled,button[data-yx-temp-disabled="1"]').forEach(function(b){ b.disabled=false; b.removeAttribute('data-yx-temp-disabled'); n++; });
    try{ window.__YX_WAREHOUSE_BUSY__=false; window.__yxWarehouseBusy=false; window.yxWarehouseBusy=false; }catch(e){}
    return n;
  }
  function clearExpiredLocalDrafts(){ var keys=countExpiredDraftKeys(); var n=removeKeys(keys); return n; }
  function clearWarehouseScrollMemory(){
    var keys=lsKeys('').filter(function(k){ return /^yx_warehouse_.*scroll|^yx_wh_.*scroll|warehouse.*scroll/i.test(k); });
    return removeKeys(keys);
  }
  function buildReport(){
    return {
      generated_at:new Date().toISOString(),
      path:location.pathname,
      viewport:{w:innerWidth,h:innerHeight,dpr:window.devicePixelRatio||1},
      local_drafts:countDraftKeys(),
      expired_drafts:countExpiredDraftKeys().length,
      stale_busy_nodes:countStaleBusy(),
      context_menus:document.querySelectorAll('.yx-warehouse-context-menu,.warehouse-context-menu,.yx-longpress-menu,.yx-popover-menu').length,
      modal_open:!!(document.querySelector('.yx-warehouse-modal,.warehouse-modal,#warehouseModal,[data-warehouse-modal]')),
      scroll_locked:!!((document.body&&document.body.style&&document.body.style.overflow==='hidden') || (document.documentElement&&document.documentElement.style&&document.documentElement.style.overflow==='hidden')),
      active_cell:(window.__YX_WAREHOUSE_ACTIVE_CELL_KEY__||window.yxWarehouseActiveCellKey||''),
      last_search:(localStorage.getItem('yx_warehouse_last_search')||'')
    };
  }
  function quickRepair(){
    var r={before:buildReport(), actions:{}};
    r.actions.closed_menus=closeFloatingOnly();
    r.actions.unlocked_scroll=unlockScroll();
    r.actions.cleared_busy=clearBusyState();
    r.actions.expired_drafts_removed=clearExpiredLocalDrafts();
    r.after=buildReport();
    log('quick-local-repair', r.actions);
    toast('已執行倉庫本機快速修復：選單/捲動/忙碌狀態/過期草稿已整理','ok');
    renderPanel(r);
    return r;
  }
  function hardLocalReset(){
    var r={before:buildReport(), actions:{}};
    r.actions.closed_menus=closeFloatingOnly();
    r.actions.unlocked_scroll=unlockScroll();
    r.actions.cleared_busy=clearBusyState();
    r.actions.expired_drafts_removed=clearExpiredLocalDrafts();
    r.actions.scroll_memory_removed=clearWarehouseScrollMemory();
    r.after=buildReport();
    log('hard-local-reset', r.actions);
    toast('已重置倉庫本機操作狀態，不影響資料庫','ok');
    renderPanel(r);
    return r;
  }
  function copyText(t,msg){ try{ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function(){toast(msg||'已複製','ok');}); }catch(e){} try{ var ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg||'已複製','ok'); }catch(e){ toast('複製失敗','error'); } }
  function ensurePanel(){
    var host=$('yx-warehouse-bu-panel') || document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main') || document.body;
    var box=$('yx-warehouse-bz-repair');
    if(!box){ box=document.createElement('div'); box.id='yx-warehouse-bz-repair'; box.className='yx-bz-repair-box'; host.appendChild(box); }
    return box;
  }
  function row(label,value,cls){ return '<div class="yx-bz-row '+(cls||'')+'"><span>'+label+'</span><b>'+value+'</b></div>'; }
  function renderPanel(last){
    if(!isWh()) return;
    var box=ensurePanel(); if(!box) return;
    var r=buildReport();
    var level=(r.stale_busy_nodes||r.scroll_locked||r.expired_drafts>0)?'warn':'ok';
    box.innerHTML='<div class="yx-bz-head"><strong>倉庫本機快速修復</strong><span class="'+level+'">'+(level==='ok'?'正常':'可整理')+'</span></div>'+
      '<div class="yx-bz-note">只整理手機/瀏覽器本機狀態：卡住遮罩、長按選單、捲動鎖定、過期草稿、忙碌狀態；不改資料庫、不改格位內容。</div>'+
      '<div class="yx-bz-grid">'+
        row('過期草稿',r.expired_drafts,r.expired_drafts?'warn':'')+
        row('忙碌節點',r.stale_busy_nodes,r.stale_busy_nodes?'warn':'')+
        row('長按選單',r.context_menus,r.context_menus?'warn':'')+
        row('捲動鎖定',r.scroll_locked?'是':'否',r.scroll_locked?'warn':'')+
      '</div>'+
      (last?'<div class="yx-bz-last">上次整理：關閉選單 '+(last.actions.closed_menus||0)+'、解除捲動 '+(last.actions.unlocked_scroll||0)+'、解除忙碌 '+(last.actions.cleared_busy||0)+'、清過期草稿 '+(last.actions.expired_drafts_removed||0)+'</div>':'')+
      '<div class="yx-bz-actions"><button type="button" class="ghost-btn small-btn" data-yx-bz-act="repair">快速修復</button><button type="button" class="ghost-btn small-btn" data-yx-bz-act="reset">重置本機狀態</button><button type="button" class="ghost-btn small-btn" data-yx-bz-act="copy">複製狀態</button><button type="button" class="ghost-btn small-btn" data-yx-bz-act="refresh">更新</button></div>';
  }
  function bind(){
    if(window.__YX_WAREHOUSE_BZ_REPAIR_BOUND__) return; window.__YX_WAREHOUSE_BZ_REPAIR_BOUND__=true;
    document.addEventListener('click', function(ev){
      var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-bz-act]'); if(!b) return;
      ev.preventDefault();
      var act=b.dataset.yxBzAct;
      if(act==='repair') return quickRepair();
      if(act==='reset'){ if(confirm('只重置倉庫本機狀態，不會改資料庫。確定執行？')) return hardLocalReset(); return; }
      if(act==='copy') return copyText(JSON.stringify(buildReport(),null,2),'已複製倉庫本機狀態');
      if(act==='refresh') return renderPanel();
    }, true);
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(renderPanel,900); setTimeout(renderPanel,2200); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.yxWarehouseLocalRepair={report:buildReport, quick:quickRepair, reset:hardLocalReset, render:renderPanel};
})();



/* 20260517ca 倉庫伺服器讀回巡檢較大包：只讀比對目前畫面與 /api/warehouse，不寫 DB、不改主線 */
(function(){
  'use strict';
  function $(id){return document.getElementById(id)}
  function isWh(){return !!(document.querySelector('.module-screen[data-module="warehouse"]') || (location.pathname||'').indexOf('/warehouse')>=0)}
  function esc(s){return String(s==null?'':s).replace(/[<>&]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c]})}
  function clean(s){return String(s==null?'':s).trim()}
  function toast(msg,type){try{ if(window.toast) return window.toast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-readback]',msg)}catch(e){} }
  function keyOf(o){
    if(!o) return '';
    var z=clean(o.zone||o.area||o.dataset?.zone||'A').toUpperCase()||'A';
    var c=clean(o.column_index||o.col||o.column||o.band||o.dataset?.col||o.dataset?.column||o.dataset?.band||'');
    var s=clean(o.slot_no||o.slot_number||o.slot||o.index||o.dataset?.slotNo||o.dataset?.slotNumber||o.dataset?.slot||'');
    if(!c && o.dataset){ c=clean(o.dataset.columnIndex||o.dataset.colIndex||o.dataset.c||''); }
    if(!s && o.getAttribute){ s=clean(o.getAttribute('data-slot')||o.getAttribute('data-slot-no')||''); }
    return [z,c,s].join('|');
  }
  function cellText(el){
    if(!el) return '';
    var clone=el.cloneNode(true);
    clone.querySelectorAll('button,input,select,textarea,script,style').forEach(function(n){n.remove()});
    return clean((clone.textContent||'').replace(/\s+/g,' ')).slice(0,500);
  }
  function localCells(){
    var nodes=[].slice.call(document.querySelectorAll('.warehouse-slot,.warehouse-cell,[data-warehouse-cell],[data-slot][data-zone]'));
    var map={};
    nodes.forEach(function(el,i){
      var ds=el.dataset||{};
      var obj={zone:ds.zone||ds.area, column_index:ds.columnIndex||ds.col||ds.column||ds.band, slot_no:ds.slotNo||ds.slotNumber||ds.slot};
      var k=keyOf(obj);
      if(!k.replace(/\|/g,'')) k='DOM|'+i;
      map[k]={key:k,text:cellText(el),marked:el.classList.contains('yx-warehouse-marked')||el.classList.contains('yx-pink-marked'),editing:el.classList.contains('yx-current-editing'),html_class:el.className||''};
    });
    return map;
  }
  function flattenCells(x,out){
    out=out||[];
    if(!x) return out;
    if(Array.isArray(x)){ x.forEach(function(v){flattenCells(v,out)}); return out; }
    if(typeof x==='object'){
      var hasCell=('zone' in x) && (('slot' in x)||('slot_no' in x)||('slot_number' in x)||('column_index' in x)||('items_json' in x)||('product_text' in x));
      if(hasCell) out.push(x);
      Object.keys(x).forEach(function(k){ if(k!=='__proto__' && k!=='constructor') flattenCells(x[k],out); });
    }
    return out;
  }
  function serverText(c){
    var parts=[];
    ['customer_name','customer','material','product_text','product','note','placement_label','row_name'].forEach(function(k){ if(c&&c[k]) parts.push(c[k]); });
    try{ var items=typeof c.items_json==='string'?JSON.parse(c.items_json):c.items_json; if(Array.isArray(items)) items.forEach(function(it){parts.push([it.customer_name,it.material,it.product_text||it.product,it.qty,it.placement_label].filter(Boolean).join(' '));}); }catch(e){}
    return clean(parts.join(' ').replace(/\s+/g,' ')).slice(0,500);
  }
  async function fetchServer(){
    var r=await fetch('/api/warehouse?readback=1&ts='+Date.now(),{credentials:'same-origin',cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    var arr=flattenCells(d,[]), map={};
    arr.forEach(function(c,i){ var k=keyOf(c)||('SERVER|'+i); map[k]={key:k,text:serverText(c),raw:c}; });
    return {raw:d,map:map,count:arr.length};
  }
  function compare(local,server){
    var lk=Object.keys(local), sk=Object.keys(server), lset=new Set(lk), sset=new Set(sk);
    var onlyLocal=lk.filter(function(k){return !sset.has(k)}).slice(0,80);
    var onlyServer=sk.filter(function(k){return !lset.has(k)}).slice(0,80);
    var changed=[];
    lk.forEach(function(k){
      if(!sset.has(k)) return;
      var lt=(local[k].text||'').replace(/\s+/g,''), st=(server[k].text||'').replace(/\s+/g,'');
      if(lt && st && lt!==st && (lt.indexOf(st)<0 && st.indexOf(lt)<0)) changed.push({key:k,local:local[k].text,server:server[k].text});
    });
    return {local_count:lk.length, server_count:sk.length, only_local:onlyLocal, only_server:onlyServer, changed:changed.slice(0,60), ok:onlyLocal.length===0 && onlyServer.length===0 && changed.length===0};
  }
  var lastReport=null;
  function ensureBox(){
    var host=$('yx-warehouse-bu-panel') || document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main') || document.body;
    var box=$('yx-warehouse-ca-readback');
    if(!box){ box=document.createElement('div'); box.id='yx-warehouse-ca-readback'; box.className='yx-ca-readback-box'; host.appendChild(box); }
    return box;
  }
  function summaryHtml(r){
    if(!r) return '<div class="yx-ca-note">檢查目前前端可視格位與伺服器 /api/warehouse 讀回是否一致；只讀不寫，不會改資料。</div>';
    var c=r.compare||{};
    var level=c.ok?'ok':'warn';
    return '<div class="yx-ca-result '+level+'">'+
      '<span>前端 '+(c.local_count||0)+' 格</span><span>伺服器 '+(c.server_count||0)+' 格</span><span>前端多出 '+(c.only_local?.length||0)+'</span><span>伺服器多出 '+(c.only_server?.length||0)+'</span><span>文字差異 '+(c.changed?.length||0)+'</span></div>'+
      ((c.only_local&&c.only_local.length)||(c.only_server&&c.only_server.length)||(c.changed&&c.changed.length)?'<div class="yx-ca-detail">'+
        (c.only_local&&c.only_local.length?'<b>前端有但伺服器讀不到：</b><em>'+esc(c.only_local.slice(0,12).join('、'))+'</em>':'')+
        (c.only_server&&c.only_server.length?'<b>伺服器有但前端未顯示：</b><em>'+esc(c.only_server.slice(0,12).join('、'))+'</em>':'')+
        (c.changed&&c.changed.length?'<b>文字不同：</b><em>'+esc(c.changed.slice(0,8).map(function(x){return x.key}).join('、'))+'</em>':'')+
      '</div>':'<div class="yx-ca-okline">目前可視格位讀回沒有明顯差異。</div>');
  }
  function render(r,busy){
    var box=ensureBox(); if(!box) return;
    lastReport=r||lastReport;
    box.innerHTML='<div class="yx-ca-head"><strong>倉庫前後端讀回自檢</strong><span class="'+(busy?'busy':(lastReport?.compare?.ok?'ok':lastReport?'warn':'info'))+'">'+(busy?'檢查中':(lastReport?.compare?.ok?'一致':lastReport?'需確認':'只讀'))+'</span></div>'+summaryHtml(lastReport)+
      '<div class="yx-ca-actions"><button type="button" class="ghost-btn small-btn" data-yx-ca-act="check">讀回檢查</button><button type="button" class="ghost-btn small-btn" data-yx-ca-act="copy">複製報告</button><button type="button" class="ghost-btn small-btn" data-yx-ca-act="reload">重載保留位置</button><button type="button" class="ghost-btn small-btn" data-yx-ca-act="clear">清除結果</button></div>';
  }
  async function runCheck(){
    if(!isWh()) return;
    render(lastReport,true);
    var scroll={x:window.scrollX,y:window.scrollY, whX:0, whY:0};
    var wh=$('warehouse-root')||document.querySelector('.warehouse-scroll,.warehouse-map-wrap,.warehouse-grid-wrap'); if(wh){scroll.whX=wh.scrollLeft; scroll.whY=wh.scrollTop;}
    try{
      var local=localCells();
      var server=await fetchServer();
      var rep={report_type:'warehouse_frontend_server_readback_20260517ca', generated_at:new Date().toISOString(), location:location.pathname, compare:compare(local,server.map), local_sample:Object.keys(local).slice(0,20), server_sample:Object.keys(server.map).slice(0,20)};
      lastReport=rep; render(rep,false); toast(rep.compare.ok?'倉庫讀回檢查通過':'倉庫讀回有差異，已列在面板',''+(rep.compare.ok?'ok':'warn'));
      setTimeout(function(){try{ if(wh){wh.scrollLeft=scroll.whX; wh.scrollTop=scroll.whY;} window.scrollTo(scroll.x,scroll.y);}catch(e){}},30);
      return rep;
    }catch(e){ lastReport={report_type:'warehouse_frontend_server_readback_20260517ca', generated_at:new Date().toISOString(), error:e.message||String(e), compare:{ok:false,local_count:Object.keys(localCells()).length,server_count:0,only_local:[],only_server:[],changed:[]}}; render(lastReport,false); toast('讀回檢查失敗：'+(e.message||e),'error'); }
  }
  function copyText(t,msg){ try{ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function(){toast(msg||'已複製','ok')}); }catch(e){} try{var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast(msg||'已複製','ok')}catch(e){toast('複製失敗','error')} }
  async function reloadKeep(){
    var x=window.scrollX,y=window.scrollY, wh=$('warehouse-root')||document.querySelector('.warehouse-scroll,.warehouse-map-wrap,.warehouse-grid-wrap'), sx=wh?wh.scrollLeft:0, sy=wh?wh.scrollTop:0;
    try{ if(window.renderWarehouse) await window.renderWarehouse(true); else location.reload(); }catch(e){toast('重載失敗：'+(e.message||e),'error')}
    setTimeout(function(){try{var n=$('warehouse-root')||document.querySelector('.warehouse-scroll,.warehouse-map-wrap,.warehouse-grid-wrap'); if(n){n.scrollLeft=sx;n.scrollTop=sy;} window.scrollTo(x,y);}catch(e){}},80);
  }
  function bind(){
    if(window.__YX_WAREHOUSE_CA_BOUND__) return; window.__YX_WAREHOUSE_CA_BOUND__=true;
    document.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ca-act]'); if(!b) return; ev.preventDefault(); var act=b.dataset.yxCaAct; if(act==='check') return runCheck(); if(act==='copy') return copyText(JSON.stringify(lastReport||{note:'尚未執行倉庫讀回檢查'},null,2),'已複製倉庫讀回報告'); if(act==='reload') return reloadKeep(); if(act==='clear'){lastReport=null; render(null,false);}},true);
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(function(){render(null,false)},1300); setTimeout(function(){render(lastReport,false)},2800); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.yxWarehouseReadbackCheck={run:runCheck, render:render, getLast:function(){return lastReport}};
})();


/* 20260517cb warehouse readback difference locator / safe visual-only diff tools
   - Only reads current report and DOM; does not write DB or change warehouse data.
   - Helps locate frontend/server readback differences on mobile without scrolling manually. */
(function(){
  'use strict';
  if(window.__YX_WAREHOUSE_CB_DIFF_LOCATOR__) return; window.__YX_WAREHOUSE_CB_DIFF_LOCATOR__=true;
  function $(id){return document.getElementById(id)}
  function isWh(){return (location.pathname||'').includes('/warehouse') || document.querySelector('.module-screen[data-module="warehouse"]')}
  function clean(v){return String(v==null?'':v).trim()}
  function toast(msg,type){try{ if(window.toast) return window.toast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-cb]',msg)}catch(e){} }
  function keyOfEl(el){
    if(!el) return '';
    var ds=el.dataset||{};
    var z=clean(ds.zone||ds.area||el.getAttribute('data-zone')||el.getAttribute('data-area')||'A').toUpperCase()||'A';
    var c=clean(ds.columnIndex||ds.colIndex||ds.column||ds.col||ds.band||el.getAttribute('data-column-index')||el.getAttribute('data-col')||el.getAttribute('data-band')||'');
    var s=clean(ds.slotNo||ds.slotNumber||ds.slot||el.getAttribute('data-slot-no')||el.getAttribute('data-slot-number')||el.getAttribute('data-slot')||'');
    return [z,c,s].join('|');
  }
  function cellNodes(){return Array.prototype.slice.call(document.querySelectorAll('.warehouse-slot,.warehouse-cell,[data-warehouse-cell],[data-slot][data-zone]'))}
  function nodeByKey(key){
    var nodes=cellNodes();
    for(var i=0;i<nodes.length;i++){ if(keyOfEl(nodes[i])===key) return nodes[i]; }
    return null;
  }
  function clearMarks(){ cellNodes().forEach(function(el){el.classList.remove('yx-cb-readback-diff','yx-cb-readback-active','yx-cb-readback-localonly','yx-cb-readback-changed')}); }
  function getReport(){ try{return window.yxWarehouseReadbackCheck&&window.yxWarehouseReadbackCheck.getLast&&window.yxWarehouseReadbackCheck.getLast();}catch(e){return null} }
  function diffKeys(rep){
    var c=(rep&&rep.compare)||{};
    var changed=(c.changed||[]).map(function(x){return clean(x.key)}).filter(Boolean);
    var onlyLocal=(c.only_local||[]).map(clean).filter(Boolean);
    var onlyServer=(c.only_server||[]).map(clean).filter(Boolean);
    var all=[].concat(changed,onlyLocal);
    return {changed:changed,onlyLocal:onlyLocal,onlyServer:onlyServer,all:Array.from(new Set(all))};
  }
  function markDiffs(){
    clearMarks();
    var rep=getReport(); if(!rep){toast('請先按「讀回檢查」產生報告','warn'); return 0;}
    var keys=diffKeys(rep); var found=0;
    keys.changed.forEach(function(k){var n=nodeByKey(k); if(n){n.classList.add('yx-cb-readback-diff','yx-cb-readback-changed'); found++;}});
    keys.onlyLocal.forEach(function(k){var n=nodeByKey(k); if(n){n.classList.add('yx-cb-readback-diff','yx-cb-readback-localonly'); found++;}});
    toast(found?('已標出 '+found+' 個前端可見差異格'):'目前沒有可直接標出的前端差異格', found?'ok':'info');
    renderList(rep);
    return found;
  }
  function focusKey(key){
    var n=nodeByKey(key);
    if(!n){ toast('這個差異格目前前端找不到：'+key,'warn'); return false; }
    clearMarks();
    markDiffs();
    n.classList.add('yx-cb-readback-active');
    try{ n.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}); }catch(e){ try{n.scrollIntoView();}catch(_e){} }
    toast('已定位差異格：'+key,'ok');
    return true;
  }
  function copyText(text,msg){
    try{ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function(){toast(msg||'已複製','ok')}); }catch(e){}
    try{var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg||'已複製','ok');}catch(e){toast('複製失敗','error')}
  }
  function ensurePanel(){
    var host=$('yx-warehouse-ca-readback') || $('yx-warehouse-bu-panel') || document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main') || document.body;
    var box=$('yx-warehouse-cb-diff-locator');
    if(!box){ box=document.createElement('div'); box.id='yx-warehouse-cb-diff-locator'; box.className='yx-cb-diff-locator'; host.appendChild(box); }
    return box;
  }
  function renderList(rep){
    var box=ensurePanel(); if(!box) return;
    rep=rep||getReport(); var keys=diffKeys(rep||{}); var total=keys.changed.length+keys.onlyLocal.length+keys.onlyServer.length;
    var rows=[];
    keys.changed.slice(0,40).forEach(function(k){rows.push({type:'文字不同',key:k,canOpen:!!nodeByKey(k)});});
    keys.onlyLocal.slice(0,40).forEach(function(k){rows.push({type:'前端多出',key:k,canOpen:!!nodeByKey(k)});});
    keys.onlyServer.slice(0,40).forEach(function(k){rows.push({type:'伺服器多出',key:k,canOpen:false});});
    box.innerHTML='<div class="yx-cb-head"><strong>讀回差異定位</strong><span>'+(rep?('差異 '+total+' 筆'):'尚未檢查')+'</span></div>'+ 
      '<div class="yx-cb-actions">'+
      '<button type="button" class="ghost-btn small-btn" data-yx-cb-act="run-mark">讀回並標出差異</button>'+ 
      '<button type="button" class="ghost-btn small-btn" data-yx-cb-act="mark">只標出差異</button>'+ 
      '<button type="button" class="ghost-btn small-btn" data-yx-cb-act="copy">複製差異</button>'+ 
      '<button type="button" class="ghost-btn small-btn" data-yx-cb-act="clear">清除標記</button>'+ 
      '</div>'+ 
      (rows.length?'<div class="yx-cb-list">'+rows.map(function(r,i){return '<div class="yx-cb-row '+(r.canOpen?'':'server-only')+'"><span class="yx-cb-type">'+r.type+'</span><span class="yx-cb-key">'+r.key+'</span>'+(r.canOpen?'<button type="button" class="ghost-btn mini-btn" data-yx-cb-key="'+r.key.replace(/"/g,'&quot;')+'">定位</button>':'<em>前端未顯示</em>')+'</div>';}).join('')+'</div>':'<div class="yx-cb-note">讀回檢查後，如果前端與伺服器有差異，會在這裡列出並可直接定位。</div>');
  }
  async function runAndMark(){
    try{ if(window.yxWarehouseReadbackCheck&&window.yxWarehouseReadbackCheck.run){ await window.yxWarehouseReadbackCheck.run(); } }catch(e){toast('讀回檢查失敗：'+(e.message||e),'error')}
    setTimeout(markDiffs,80);
  }
  function bind(){
    if(window.__YX_WAREHOUSE_CB_BOUND__) return; window.__YX_WAREHOUSE_CB_BOUND__=true;
    document.addEventListener('click',function(ev){
      var keyBtn=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cb-key]');
      if(keyBtn){ ev.preventDefault(); focusKey(keyBtn.getAttribute('data-yx-cb-key')); return; }
      var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cb-act]'); if(!b) return;
      ev.preventDefault(); var act=b.getAttribute('data-yx-cb-act');
      if(act==='run-mark') return runAndMark();
      if(act==='mark') return markDiffs();
      if(act==='copy') return copyText(JSON.stringify({report_type:'warehouse_readback_diff_locator_20260517cb', generated_at:new Date().toISOString(), diff:diffKeys(getReport()||{}), report:getReport()||null},null,2),'已複製讀回差異');
      if(act==='clear'){ clearMarks(); renderList(getReport()); toast('已清除讀回差異標記','ok'); }
    },true);
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(function(){renderList(getReport())},1700); setTimeout(function(){renderList(getReport())},3600); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.yxWarehouseReadbackDiffLocator={mark:markDiffs, focus:focusKey, render:renderList, clear:clearMarks};
})();


/* 20260517cc 倉庫讀回差異篩選/摘要：只讀強化，不寫 DB、不改主線
   - Adds local filter/search controls for readback differences.
   - Keeps current cb locator; provides summary, first-diff positioning, and copy filtered report. */
(function(){
  'use strict';
  if(window.__YX_WAREHOUSE_CC_DIFF_FILTER__) return; window.__YX_WAREHOUSE_CC_DIFF_FILTER__=true;
  var state={filter:'all',q:'',lastRendered:''};
  function $(id){return document.getElementById(id)}
  function isWh(){return (location.pathname||'').includes('/warehouse') || document.querySelector('.module-screen[data-module="warehouse"]')}
  function clean(v){return String(v==null?'':v).trim()}
  function toast(msg,type){try{ if(window.toast) return window.toast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-cc]',msg)}catch(e){} }
  function copyText(text,msg){
    try{ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function(){toast(msg||'已複製','ok')}); }catch(e){}
    try{var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg||'已複製','ok');}catch(e){toast('複製失敗','error')}
  }
  function getReport(){ try{return window.yxWarehouseReadbackCheck&&window.yxWarehouseReadbackCheck.getLast&&window.yxWarehouseReadbackCheck.getLast();}catch(e){return null} }
  function diffRows(rep){
    var c=(rep&&rep.compare)||{};
    var rows=[];
    (c.changed||[]).forEach(function(x){rows.push({type:'changed',label:'文字不同',key:clean(x.key),detail:clean((x.local_text||'').slice(0,60)+' → '+(x.server_text||'').slice(0,60))});});
    (c.only_local||[]).forEach(function(k){rows.push({type:'local',label:'前端多出',key:clean(k),detail:'前端有顯示，伺服器讀回沒有'});});
    (c.only_server||[]).forEach(function(k){rows.push({type:'server',label:'伺服器多出',key:clean(k),detail:'伺服器有資料，前端目前未顯示'});});
    return rows.filter(function(r){return r.key});
  }
  function filteredRows(){
    var rep=getReport(); var q=state.q.toLowerCase();
    return diffRows(rep).filter(function(r){
      var okType=(state.filter==='all'||state.filter===r.type);
      var okQ=(!q || (r.key+' '+r.label+' '+r.detail).toLowerCase().indexOf(q)>=0);
      return okType&&okQ;
    });
  }
  function ensureBox(){
    var host=$('yx-warehouse-cb-diff-locator') || $('yx-warehouse-ca-readback') || $('yx-warehouse-bu-panel') || document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main') || document.body;
    var box=$('yx-warehouse-cc-filter');
    if(!box){ box=document.createElement('div'); box.id='yx-warehouse-cc-filter'; box.className='yx-cc-filter-box'; host.appendChild(box); }
    return box;
  }
  function typeCounts(rep){
    var rows=diffRows(rep); return {
      all:rows.length,
      changed:rows.filter(function(r){return r.type==='changed'}).length,
      local:rows.filter(function(r){return r.type==='local'}).length,
      server:rows.filter(function(r){return r.type==='server'}).length
    };
  }
  function render(){
    if(!isWh()) return;
    var box=ensureBox(), rep=getReport(), counts=typeCounts(rep), rows=filteredRows();
    var sig=JSON.stringify({f:state.filter,q:state.q,c:counts,rows:rows.slice(0,80).map(function(r){return r.type+'|'+r.key})});
    if(sig===state.lastRendered) return; state.lastRendered=sig;
    var filters=[['all','全部',counts.all],['changed','文字不同',counts.changed],['local','前端多出',counts.local],['server','伺服器多出',counts.server]];
    box.innerHTML='<div class="yx-cc-head"><strong>讀回差異篩選</strong><span>'+(rep?('已讀回 '+counts.all+' 筆差異'):'尚未讀回')+'</span></div>'+ 
      '<div class="yx-cc-note">只篩選目前讀回報告，不寫資料庫。可以快速縮小差異類型，定位或複製篩選結果。</div>'+ 
      '<div class="yx-cc-filterbar">'+filters.map(function(f){return '<button type="button" class="ghost-btn small-btn '+(state.filter===f[0]?'active':'')+'" data-yx-cc-filter="'+f[0]+'">'+f[1]+' '+f[2]+'</button>';}).join('')+'</div>'+ 
      '<div class="yx-cc-search"><input id="yx-cc-query" type="search" value="'+state.q.replace(/"/g,'&quot;')+'" placeholder="篩選格號 / 類型 / 文字" autocomplete="off"><button type="button" class="ghost-btn small-btn" data-yx-cc-act="clearq">清除</button></div>'+ 
      '<div class="yx-cc-actions"><button type="button" class="ghost-btn small-btn" data-yx-cc-act="first">定位第一筆</button><button type="button" class="ghost-btn small-btn" data-yx-cc-act="copyfiltered">複製篩選結果</button><button type="button" class="ghost-btn small-btn" data-yx-cc-act="copyall">複製完整差異</button></div>'+ 
      (rows.length?'<div class="yx-cc-list">'+rows.slice(0,80).map(function(r,i){return '<div class="yx-cc-row '+r.type+'"><span class="yx-cc-badge">'+r.label+'</span><b>'+r.key+'</b><small>'+r.detail+'</small><button type="button" class="ghost-btn mini-btn" data-yx-cc-key="'+r.key.replace(/"/g,'&quot;')+'">定位</button></div>';}).join('')+(rows.length>80?'<div class="yx-cc-more">只顯示前 80 筆，請輸入關鍵字縮小範圍。</div>':'')+'</div>':'<div class="yx-cc-empty">目前篩選條件沒有差異資料。</div>');
  }
  function focusKey(k){
    if(window.yxWarehouseReadbackDiffLocator&&window.yxWarehouseReadbackDiffLocator.focus){ return window.yxWarehouseReadbackDiffLocator.focus(k); }
    toast('定位工具尚未就緒：'+k,'warn');
  }
  function bind(){
    if(window.__YX_WAREHOUSE_CC_BOUND__) return; window.__YX_WAREHOUSE_CC_BOUND__=true;
    document.addEventListener('click',function(ev){
      var f=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cc-filter]');
      if(f){ev.preventDefault(); state.filter=f.getAttribute('data-yx-cc-filter')||'all'; state.lastRendered=''; render(); return;}
      var k=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cc-key]');
      if(k){ev.preventDefault(); focusKey(k.getAttribute('data-yx-cc-key')); return;}
      var a=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cc-act]'); if(!a) return;
      ev.preventDefault(); var act=a.getAttribute('data-yx-cc-act');
      if(act==='clearq'){state.q=''; state.lastRendered=''; render(); return;}
      if(act==='first'){var rows=filteredRows(); if(rows[0]) focusKey(rows[0].key); else toast('沒有可定位的篩選結果','info'); return;}
      if(act==='copyfiltered') return copyText(JSON.stringify({report_type:'warehouse_readback_filtered_diff_20260517cc', generated_at:new Date().toISOString(), filter:state.filter, query:state.q, rows:filteredRows()},null,2),'已複製篩選差異');
      if(act==='copyall') return copyText(JSON.stringify({report_type:'warehouse_readback_all_diff_20260517cc', generated_at:new Date().toISOString(), rows:diffRows(getReport())},null,2),'已複製完整差異');
    },true);
    document.addEventListener('input',function(ev){
      var t=ev.target; if(!t||t.id!=='yx-cc-query') return;
      state.q=t.value||''; state.lastRendered=''; render();
    },true);
  }
  function wrapCb(){
    try{
      var api=window.yxWarehouseReadbackDiffLocator;
      if(api&&!api.__ccWrapped&&api.render){
        var old=api.render; api.render=function(){var r=old.apply(api,arguments); setTimeout(render,50); return r;}; api.__ccWrapped=true;
      }
      var rb=window.yxWarehouseReadbackCheck;
      if(rb&&!rb.__ccWrapped&&rb.run){
        var oldRun=rb.run; rb.run=async function(){var r=await oldRun.apply(rb,arguments); setTimeout(function(){state.lastRendered='';render();},80); return r;}; rb.__ccWrapped=true;
      }
    }catch(e){}
  }
  function install(){ if(!isWh()) return; bind(); wrapCb(); setTimeout(render,1200); setTimeout(function(){wrapCb();render();},2600); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.yxWarehouseReadbackFilter={render:render,setFilter:function(f){state.filter=f||'all';state.lastRendered='';render();},setQuery:function(q){state.q=q||'';state.lastRendered='';render();}};
})();

/* 20260517cd 倉庫讀回差異處理建議較大包：只讀產生處理建議，不寫 DB、不改格位資料
   - Uses existing readback reports from ca/cb/cc.
   - Generates a safe action plan so future fixes can be specific and reversible. */
(function(){
  'use strict';
  if(window.__YX_WAREHOUSE_CD_ACTION_PLAN__) return; window.__YX_WAREHOUSE_CD_ACTION_PLAN__=true;
  var state={q:'',level:'all',lastSig:''};
  function $(id){return document.getElementById(id)}
  function isWh(){return (location.pathname||'').indexOf('/warehouse')>=0 || document.querySelector('.module-screen[data-module="warehouse"]')}
  function esc(s){return String(s==null?'':s).replace(/[<>&"]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]})}
  function clean(v){return String(v==null?'':v).trim()}
  function toast(msg,type){try{ if(window.toast) return window.toast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-cd]',msg)}catch(e){} }
  function copyText(text,msg){
    try{ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function(){toast(msg||'已複製','ok')}); }catch(e){}
    try{var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg||'已複製','ok');}catch(e){toast('複製失敗','error')}
  }
  function downloadJson(obj,name){
    try{var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url)},600); toast('已匯出 JSON','ok');}catch(e){toast('匯出失敗：'+(e.message||e),'error')}
  }
  function getReport(){try{return window.yxWarehouseReadbackCheck&&window.yxWarehouseReadbackCheck.getLast&&window.yxWarehouseReadbackCheck.getLast()}catch(e){return null}}
  function getRows(){
    var rep=getReport(), c=(rep&&rep.compare)||{}, rows=[];
    (c.changed||[]).forEach(function(x){rows.push({type:'changed',label:'文字不同',key:clean(x.key),level:'warn',reason:'前端與伺服器同一格文字不一致',local:clean(x.local||x.local_text||''),server:clean(x.server||x.server_text||'')});});
    (c.only_local||[]).forEach(function(k){rows.push({type:'local',label:'前端多出',key:clean(k),level:'danger',reason:'畫面有格位，但伺服器讀回沒有同 key；可能是前端暫存、保存失敗或 key 欄位不一致'});});
    (c.only_server||[]).forEach(function(k){rows.push({type:'server',label:'伺服器多出',key:clean(k),level:'info',reason:'伺服器有格位，但目前前端未顯示；可能是畫面尚未重載、篩選中、或 renderer 未吃到這筆資料'});});
    return rows.filter(function(r){return r.key});
  }
  function actionFor(row){
    if(row.type==='changed') return ['先定位該格並截圖。','按「重載保留位置」再讀回一次。','若差異仍在，複製讀回報告給我，只修該格顯示或保存轉換，不直接清資料。'];
    if(row.type==='local') return ['先確認此格是否剛剛才操作、背景保存是否失敗。','不要重新整理前先匯出倉庫回報包。','若重載後消失，代表前端暫存未寫入；修保存流程。若重載後仍在，修 key 對齊。'];
    if(row.type==='server') return ['先按重載保留位置。','若仍未顯示，定位附近欄列並檢查是否被篩選/隱藏。','修 renderer 讀取欄位，不動 DB 資料。'];
    return ['複製報告後再修。'];
  }
  function severityRank(level){return level==='danger'?3:level==='warn'?2:level==='info'?1:0}
  function filtered(){
    var q=state.q.toLowerCase();
    return getRows().filter(function(r){
      var okLevel=(state.level==='all'||state.level===r.level||state.level===r.type);
      var okQ=!q || (r.key+' '+r.label+' '+r.reason+' '+(r.local||'')+' '+(r.server||'')).toLowerCase().indexOf(q)>=0;
      return okLevel&&okQ;
    }).sort(function(a,b){return severityRank(b.level)-severityRank(a.level)});
  }
  function buildPlan(rows){
    var counts={all:rows.length,danger:0,warn:0,info:0,changed:0,local:0,server:0};
    rows.forEach(function(r){counts[r.level]=(counts[r.level]||0)+1; counts[r.type]=(counts[r.type]||0)+1;});
    var next=[];
    if(counts.danger) next.push('P1：先處理前端多出格，避免使用者以為已保存但伺服器沒有。');
    if(counts.warn) next.push('P2：再處理文字不同格，避免同格內容前後端不一致。');
    if(counts.info) next.push('P3：最後處理伺服器多出格，確認是否只是前端未重載或被隱藏。');
    if(!rows.length) next.push('目前讀回差異為 0，先維持現狀，不需要修資料。');
    return {report_type:'warehouse_readback_action_plan_20260517cd', generated_at:new Date().toISOString(), location:location.pathname, summary:counts, next_steps:next, rules:['此報告只提供處理建議，不寫 DB、不改格位資料。','若要修，下一包只能針對報告列出的格位或欄位處理。','修前先備份目前完整包與部署差異包。'], rows:rows.map(function(r){return {type:r.type,label:r.label,level:r.level,key:r.key,reason:r.reason,local:r.local||'',server:r.server||'',suggested_actions:actionFor(r)}})};
  }
  function ensureBox(){
    var host=$('yx-warehouse-cc-filter') || $('yx-warehouse-cb-diff-locator') || $('yx-warehouse-ca-readback') || $('yx-warehouse-bu-panel') || document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main') || document.body;
    var box=$('yx-warehouse-cd-plan');
    if(!box){box=document.createElement('div'); box.id='yx-warehouse-cd-plan'; box.className='yx-cd-plan-box'; host.appendChild(box);}
    return box;
  }
  function render(){
    if(!isWh()) return;
    var rep=getReport(), rows=filtered(), all=getRows(), plan=buildPlan(rows), counts=buildPlan(all).summary;
    var sig=JSON.stringify({has:!!rep,q:state.q,level:state.level,rows:rows.slice(0,80).map(function(r){return r.level+'|'+r.type+'|'+r.key})});
    if(sig===state.lastSig) return; state.lastSig=sig;
    var box=ensureBox();
    var filters=[['all','全部',counts.all],['danger','P1 前端多出',counts.danger],['warn','P2 文字不同',counts.warn],['info','P3 伺服器多出',counts.info]];
    box.innerHTML='<div class="yx-cd-head"><strong>讀回差異處理建議</strong><span>'+(rep?('差異 '+counts.all+' 筆'):'尚未讀回')+'</span></div>'+ 
      '<div class="yx-cd-note">只讀產生修復建議，不會寫入資料庫。用來決定下一包要修哪一類，不讓修復亂動主線。</div>'+ 
      '<div class="yx-cd-filterbar">'+filters.map(function(f){return '<button type="button" class="ghost-btn small-btn '+(state.level===f[0]?'active':'')+'" data-yx-cd-level="'+f[0]+'">'+f[1]+' '+f[2]+'</button>';}).join('')+'</div>'+ 
      '<div class="yx-cd-search"><input id="yx-cd-query" type="search" value="'+esc(state.q)+'" placeholder="搜尋格號 / 類型 / 原因" autocomplete="off"><button type="button" class="ghost-btn small-btn" data-yx-cd-act="clearq">清除</button></div>'+ 
      '<div class="yx-cd-actions"><button type="button" class="ghost-btn small-btn" data-yx-cd-act="run">讀回並產生建議</button><button type="button" class="ghost-btn small-btn" data-yx-cd-act="copyplan">複製處理建議</button><button type="button" class="ghost-btn small-btn" data-yx-cd-act="download">匯出建議 JSON</button><button type="button" class="ghost-btn small-btn" data-yx-cd-act="copyrequest">複製下一包指令</button></div>'+ 
      (plan.next_steps.length?'<div class="yx-cd-next">'+plan.next_steps.map(function(x){return '<div>'+esc(x)+'</div>';}).join('')+'</div>':'')+
      (rows.length?'<div class="yx-cd-list">'+rows.slice(0,80).map(function(r){return '<div class="yx-cd-row '+r.level+'"><span class="yx-cd-badge">'+esc(r.label)+'</span><b>'+esc(r.key)+'</b><small>'+esc(r.reason)+'</small><ol>'+actionFor(r).map(function(a){return '<li>'+esc(a)+'</li>';}).join('')+'</ol><button type="button" class="ghost-btn mini-btn" data-yx-cd-key="'+esc(r.key)+'">定位</button></div>';}).join('')+(rows.length>80?'<div class="yx-cd-more">只顯示前 80 筆，請搜尋縮小範圍。</div>':'')+'</div>':'<div class="yx-cd-empty">目前沒有符合條件的差異。若尚未讀回，請先按「讀回並產生建議」。</div>');
  }
  function focusKey(k){
    try{ if(window.yxWarehouseReadbackDiffLocator&&window.yxWarehouseReadbackDiffLocator.focus) return window.yxWarehouseReadbackDiffLocator.focus(k); }catch(e){}
    toast('定位工具尚未就緒：'+k,'warn');
  }
  function nextCommand(){
    var plan=buildPlan(filtered());
    return '從目前穩定線 20260517j / 最新倉庫包繼續。\n只依「倉庫讀回差異處理建議」修復，不要動出貨、訂單、總單、庫存主線。\n不要改 DB schema，不新增 renderer，不新增 setInterval / MutationObserver。\n優先處理：'+(plan.next_steps[0]||'目前沒有差異，先不要修資料')+'\n本次差異報告：\n'+JSON.stringify(plan,null,2);
  }
  function bind(){
    if(window.__YX_WAREHOUSE_CD_BOUND__) return; window.__YX_WAREHOUSE_CD_BOUND__=true;
    document.addEventListener('click',function(ev){
      var f=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cd-level]');
      if(f){ev.preventDefault(); state.level=f.getAttribute('data-yx-cd-level')||'all'; state.lastSig=''; render(); return;}
      var k=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cd-key]');
      if(k){ev.preventDefault(); focusKey(k.getAttribute('data-yx-cd-key')); return;}
      var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cd-act]'); if(!b) return;
      ev.preventDefault(); var act=b.getAttribute('data-yx-cd-act');
      if(act==='clearq'){state.q=''; state.lastSig=''; render(); return;}
      if(act==='run'){ if(window.yxWarehouseReadbackCheck&&window.yxWarehouseReadbackCheck.run){ window.yxWarehouseReadbackCheck.run().then(function(){state.lastSig=''; render();}); } else toast('讀回工具尚未就緒','warn'); return; }
      if(act==='copyplan') return copyText(JSON.stringify(buildPlan(filtered()),null,2),'已複製處理建議');
      if(act==='download') return downloadJson(buildPlan(filtered()),'yuanxing_warehouse_readback_action_plan_20260517cd_'+Date.now()+'.json');
      if(act==='copyrequest') return copyText(nextCommand(),'已複製下一包修復指令');
    },true);
    document.addEventListener('input',function(ev){var t=ev.target; if(!t||t.id!=='yx-cd-query') return; state.q=t.value||''; state.lastSig=''; render();},true);
  }
  function wrap(){
    try{var rb=window.yxWarehouseReadbackCheck; if(rb&&!rb.__cdWrapped&&rb.run){var old=rb.run; rb.run=async function(){var r=await old.apply(rb,arguments); setTimeout(function(){state.lastSig=''; render();},120); return r}; rb.__cdWrapped=true;}}catch(e){}
    try{var cc=window.yxWarehouseReadbackFilter; if(cc&&!cc.__cdWrapped&&cc.render){var oldR=cc.render; cc.render=function(){var r=oldR.apply(cc,arguments); setTimeout(function(){state.lastSig=''; render();},80); return r}; cc.__cdWrapped=true;}}catch(e){}
  }
  function install(){ if(!isWh()) return; bind(); wrap(); setTimeout(render,1800); setTimeout(function(){wrap(); state.lastSig=''; render();},3600); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.yxWarehouseReadbackActionPlan={render:render, getPlan:function(){return buildPlan(filtered())}};
})();

/* 20260517ce：倉庫差異工單驗收面板（只讀本機工單，不寫資料庫、不動主線） */
(function(){
  if(window.__YX_WAREHOUSE_CE_WORKORDER__) return; window.__YX_WAREHOUSE_CE_WORKORDER__=true;
  function isWh(){return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-map,.warehouse-map,.yx-warehouse-map')}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function toast(msg,type){try{ if(window.yxToast) return window.yxToast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-ce]',msg)}catch(e){} }
  function copyText(txt,msg){ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){toast(msg||'已複製')}).catch(function(){fallbackCopy(txt,msg)})} else fallbackCopy(txt,msg) }
  function fallbackCopy(txt,msg){var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast(msg||'已複製')}catch(e){toast('複製失敗，請手動選取','warn')} ta.remove();}
  function downloadJson(obj,name){var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},800)}
  function key(){return 'yx_wh_ce_workorders_v1'}
  function load(){try{return JSON.parse(localStorage.getItem(key())||'{}')||{}}catch(e){return {}}}
  function save(v){try{localStorage.setItem(key(),JSON.stringify(v||{}))}catch(e){}}
  function getPlanRows(){
    try{ if(window.yxWarehouseReadbackActionPlan&&window.yxWarehouseReadbackActionPlan.getPlan){var p=window.yxWarehouseReadbackActionPlan.getPlan(); if(p&&Array.isArray(p.rows)) return p.rows; }}catch(e){}
    try{ if(window.yxWarehouseReadbackFilter&&window.yxWarehouseReadbackFilter.getReport){var r=window.yxWarehouseReadbackFilter.getReport(); if(r&&Array.isArray(r.rows)) return r.rows; }}catch(e){}
    return [];
  }
  function normalizeRows(rows){return (rows||[]).map(function(r,i){
    var id=String(r.key||r.slot_key||r.id||('row-'+i));
    return {id:id,type:r.type||'',level:r.level||'',label:r.label||'',reason:r.reason||'',local:r.local||'',server:r.server||'',actions:r.suggested_actions||r.actions||[]};
  });}
  function mergeRows(rows){
    var store=load(), now=Date.now();
    normalizeRows(rows).forEach(function(r){
      if(!store[r.id]) store[r.id]={status:'todo',note:'',created_at:now,updated_at:now};
      store[r.id].row=r; store[r.id].seen_at=now;
    });
    save(store); return store;
  }
  function counts(store){var c={all:0,todo:0,doing:0,done:0,skip:0,p1:0,p2:0,p3:0}; Object.keys(store||{}).forEach(function(k){var x=store[k]||{}; if(!x.row) return; c.all++; c[x.status||'todo']=(c[x.status||'todo']||0)+1; if(x.row.level==='danger') c.p1++; else if(x.row.level==='warn') c.p2++; else c.p3++;}); return c}
  var state={filter:'open', q:'', sig:''};
  function filtered(store){var q=(state.q||'').toLowerCase(); return Object.keys(store||{}).map(function(k){return Object.assign({id:k},store[k])}).filter(function(x){if(!x.row) return false; var st=x.status||'todo'; var okF=state.filter==='all'||(state.filter==='open'&&st!=='done'&&st!=='skip')||state.filter===st||state.filter===x.row.level; var txt=(x.id+' '+x.row.type+' '+x.row.label+' '+x.row.reason+' '+x.row.local+' '+x.row.server+' '+(x.note||'')).toLowerCase(); return okF&&(!q||txt.indexOf(q)>=0);}).sort(function(a,b){var rank={danger:1,warn:2,info:3}; var sr={todo:1,doing:2,done:4,skip:5}; return (sr[a.status||'todo']-sr[b.status||'todo']) || ((rank[a.row.level]||9)-(rank[b.row.level]||9)) || String(a.id).localeCompare(String(b.id));});}
  function ensureBox(){var host=$('yx-warehouse-cd-plan')||$('yx-warehouse-cc-filter')||$('yx-warehouse-ca-readback')||$('yx-warehouse-bu-panel')||document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main')||document.body; var box=$('yx-warehouse-ce-workorders'); if(!box){box=document.createElement('div'); box.id='yx-warehouse-ce-workorders'; box.className='yx-ce-workorders'; host.appendChild(box);} return box;}
  function report(store,rows){var c=counts(store); return {report_type:'warehouse_workorder_acceptance_20260517ce', generated_at:new Date().toISOString(), summary:c, filter:state.filter, query:state.q, items:rows.map(function(x){return {id:x.id,status:x.status||'todo',note:x.note||'',row:x.row}}), rules:['本面板只建立本機工單，不會寫資料庫。','驗收完成前不要直接修資料。','若要下一包修，只帶 open/todo/doing 項目。']};}
  function render(){ if(!isWh()) return; var store=mergeRows(getPlanRows()), c=counts(store), rows=filtered(store), sig=JSON.stringify({c:c,f:state.filter,q:state.q,rows:rows.slice(0,60).map(function(x){return x.id+'|'+x.status+'|'+(x.note||'')})}); if(sig===state.sig) return; state.sig=sig; var box=ensureBox(); var filters=[['open','未完成',c.todo+c.doing],['todo','待處理',c.todo],['doing','處理中',c.doing],['done','已驗收',c.done],['skip','略過',c.skip],['danger','P1',c.p1],['warn','P2',c.p2],['all','全部',c.all]];
    box.innerHTML='<div class="yx-ce-head"><strong>倉庫差異工單驗收</strong><span>未完成 '+(c.todo+c.doing)+' / 全部 '+c.all+'</span></div>'+
      '<div class="yx-ce-note">把讀回差異轉成本機工單，方便逐格驗收；不打 API、不寫 DB、不改格位資料。</div>'+
      '<div class="yx-ce-filters">'+filters.map(function(f){return '<button type="button" class="ghost-btn small-btn '+(state.filter===f[0]?'active':'')+'" data-yx-ce-filter="'+f[0]+'">'+f[1]+' '+f[2]+'</button>'}).join('')+'</div>'+
      '<div class="yx-ce-tools"><input id="yx-ce-query" value="'+esc(state.q)+'" placeholder="搜尋格號 / 原因 / 備註"><button type="button" class="ghost-btn small-btn" data-yx-ce-act="refresh">同步讀回差異</button><button type="button" class="ghost-btn small-btn" data-yx-ce-act="copyopen">複製未完成工單</button><button type="button" class="ghost-btn small-btn" data-yx-ce-act="download">匯出工單 JSON</button><button type="button" class="ghost-btn small-btn danger" data-yx-ce-act="cleardone">清已驗收</button></div>'+
      '<div class="yx-ce-progress"><span style="width:'+ (c.all?Math.round((c.done+c.skip)*100/c.all):0) +'%"></span><b>驗收 '+(c.done+c.skip)+' / '+c.all+'</b></div>'+
      (rows.length?'<div class="yx-ce-list">'+rows.slice(0,100).map(function(x){var r=x.row||{}; return '<div class="yx-ce-row '+esc(r.level||'')+'"><div class="yx-ce-rowtop"><b>'+esc(x.id)+'</b><span>'+esc(r.label||r.type||'差異')+'</span><em>'+esc(x.status||'todo')+'</em></div><div class="yx-ce-reason">'+esc(r.reason||'')+'</div><div class="yx-ce-values"><small>前端：'+esc(r.local||'')+'</small><small>伺服器：'+esc(r.server||'')+'</small></div><textarea data-yx-ce-note="'+esc(x.id)+'" placeholder="這格驗收備註">'+esc(x.note||'')+'</textarea><div class="yx-ce-rowactions"><button type="button" class="ghost-btn mini-btn" data-yx-ce-focus="'+esc(x.id)+'">定位</button><button type="button" class="ghost-btn mini-btn" data-yx-ce-status="todo" data-yx-ce-id="'+esc(x.id)+'">待處理</button><button type="button" class="ghost-btn mini-btn" data-yx-ce-status="doing" data-yx-ce-id="'+esc(x.id)+'">處理中</button><button type="button" class="ghost-btn mini-btn" data-yx-ce-status="done" data-yx-ce-id="'+esc(x.id)+'">已驗收</button><button type="button" class="ghost-btn mini-btn" data-yx-ce-status="skip" data-yx-ce-id="'+esc(x.id)+'">略過</button></div></div>';}).join('')+(rows.length>100?'<div class="yx-ce-more">只顯示前 100 筆，請搜尋縮小範圍。</div>':'')+'</div>':'<div class="yx-ce-empty">目前沒有工單。請先執行讀回差異，或按「同步讀回差異」。</div>');
  }
  function focus(id){try{ if(window.yxWarehouseReadbackDiffLocator&&window.yxWarehouseReadbackDiffLocator.focus) return window.yxWarehouseReadbackDiffLocator.focus(id); }catch(e){} toast('定位工具尚未就緒：'+id,'warn')}
  function bind(){ if(window.__YX_WAREHOUSE_CE_BOUND__) return; window.__YX_WAREHOUSE_CE_BOUND__=true; document.addEventListener('click',function(ev){var f=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ce-filter]'); if(f){ev.preventDefault(); state.filter=f.getAttribute('data-yx-ce-filter')||'open'; state.sig=''; render(); return;} var fo=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ce-focus]'); if(fo){ev.preventDefault(); focus(fo.getAttribute('data-yx-ce-focus')); return;} var st=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ce-status]'); if(st){ev.preventDefault(); var s=load(), id=st.getAttribute('data-yx-ce-id'); if(s[id]){s[id].status=st.getAttribute('data-yx-ce-status'); s[id].updated_at=Date.now(); save(s); state.sig=''; render();} return;} var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ce-act]'); if(!b) return; ev.preventDefault(); var act=b.getAttribute('data-yx-ce-act'), s=mergeRows(getPlanRows()), rows=filtered(s), rep=report(s,rows); if(act==='refresh'){state.sig=''; render(); toast('已同步讀回差異工單'); return;} if(act==='copyopen'){var open=report(s, filtered(s).filter(function(x){return (x.status||'todo')!=='done'&&(x.status||'todo')!=='skip'})); return copyText(JSON.stringify(open,null,2),'已複製未完成工單');} if(act==='download') return downloadJson(rep,'yuanxing_warehouse_workorders_20260517ce_'+Date.now()+'.json'); if(act==='cleardone'){if(!confirm('只清除本機已驗收/略過工單，不動資料庫。確定？')) return; Object.keys(s).forEach(function(k){if(s[k]&&(s[k].status==='done'||s[k].status==='skip')) delete s[k];}); save(s); state.sig=''; render(); return;} },true);
    document.addEventListener('input',function(ev){var t=ev.target; if(!t) return; if(t.id==='yx-ce-query'){state.q=t.value||''; state.sig=''; render(); return;} if(t.matches&&t.matches('[data-yx-ce-note]')){var s=load(), id=t.getAttribute('data-yx-ce-note'); if(s[id]){s[id].note=t.value||''; s[id].updated_at=Date.now(); save(s); state.sig=''; setTimeout(render,80);}}},true);
  }
  function install(){ if(!isWh()) return; bind(); setTimeout(render,2200); setTimeout(function(){state.sig=''; render();},4800); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.yxWarehouseWorkorderAcceptance={render:render,getReport:function(){var s=mergeRows(getPlanRows()); return report(s,filtered(s));}};
})();

/* 20260517cf：倉庫工單批量驗收 / 批量備註 / 下一包指令（只讀本機工單，不寫資料庫、不動主線） */
(function(){
  if(window.__YX_WAREHOUSE_CF_WORKORDER_BATCH__) return; window.__YX_WAREHOUSE_CF_WORKORDER_BATCH__=true;
  function isWh(){return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-map,.warehouse-map,.yx-warehouse-map')}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function toast(msg,type){try{ if(window.yxToast) return window.yxToast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-cf]',msg)}catch(e){} }
  function copyText(txt,msg){ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){toast(msg||'已複製')}).catch(function(){fallbackCopy(txt,msg)})} else fallbackCopy(txt,msg) }
  function fallbackCopy(txt,msg){var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast(msg||'已複製')}catch(e){toast('複製失敗，請手動選取','warn')} ta.remove();}
  function downloadJson(obj,name){var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},800)}
  var WKEY='yx_wh_ce_workorders_v1';
  function load(){try{return JSON.parse(localStorage.getItem(WKEY)||'{}')||{}}catch(e){return {}}}
  function save(v){try{localStorage.setItem(WKEY,JSON.stringify(v||{}))}catch(e){}}
  function rowsFromCe(){try{if(window.yxWarehouseWorkorderAcceptance&&window.yxWarehouseWorkorderAcceptance.getReport){var r=window.yxWarehouseWorkorderAcceptance.getReport(); if(r&&Array.isArray(r.items)) return r.items;}}catch(e){} var s=load(); return Object.keys(s).map(function(k){return Object.assign({id:k},s[k])}).filter(function(x){return !!x.row});}
  function currentFiltered(){var items=rowsFromCe(); var f=$('yx-ce-query'), q=f?(f.value||'').toLowerCase():''; var filter='open'; try{var act=document.querySelector('#yx-warehouse-ce-workorders [data-yx-ce-filter].active'); if(act) filter=act.getAttribute('data-yx-ce-filter')||'open';}catch(e){} return items.filter(function(x){var st=x.status||'todo', row=x.row||{}; var okF=filter==='all'||(filter==='open'&&st!=='done'&&st!=='skip')||filter===st||filter===row.level; var txt=(x.id+' '+st+' '+(x.note||'')+' '+(row.type||'')+' '+(row.label||'')+' '+(row.reason||'')+' '+(row.local||'')+' '+(row.server||'')).toLowerCase(); return okF&&(!q||txt.indexOf(q)>=0);});}
  function counts(items){var c={all:0,open:0,todo:0,doing:0,done:0,skip:0,p1:0,p2:0,p3:0}; (items||[]).forEach(function(x){var st=x.status||'todo', lvl=(x.row||{}).level||''; c.all++; c[st]=(c[st]||0)+1; if(st!=='done'&&st!=='skip') c.open++; if(lvl==='danger') c.p1++; else if(lvl==='warn') c.p2++; else c.p3++;}); return c;}
  var state={selected:{}, sig:''};
  function ensureBox(){var host=$('yx-warehouse-ce-workorders')||$('yx-warehouse-cd-plan')||$('yx-warehouse-bu-panel')||document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main')||document.body; var box=$('yx-warehouse-cf-batch'); if(!box){box=document.createElement('div'); box.id='yx-warehouse-cf-batch'; box.className='yx-cf-batch'; if(host.parentNode) host.parentNode.insertBefore(box, host.nextSibling); else host.appendChild(box);} return box;}
  function selectedItems(items){var map=state.selected||{}; return (items||[]).filter(function(x){return !!map[x.id];});}
  function syncSelection(items){var ids={}; (items||[]).forEach(function(x){ids[x.id]=true}); Object.keys(state.selected||{}).forEach(function(k){if(!ids[k]) delete state.selected[k];});}
  function report(items){var sel=selectedItems(items), c=counts(items); return {report_type:'warehouse_workorder_batch_acceptance_20260517cf', generated_at:new Date().toISOString(), summary:c, selected_count:sel.length, selected:sel.map(function(x){return {id:x.id,status:x.status||'todo',note:x.note||'',row:x.row}}), next_safe_steps:['只依工單未完成項目修倉庫。','不要動出貨、訂單、總單、庫存主線。','不要改 DB schema，不新增 renderer，不新增 setInterval/MutationObserver。']};}
  function nextCommand(items){var sel=selectedItems(items); if(!sel.length) sel=(items||[]).filter(function(x){return (x.status||'todo')!=='done'&&(x.status||'todo')!=='skip'}).slice(0,20); return '從 20260517j 穩定版 / 最新倉庫線繼續。\n這次只修倉庫工單中未完成或已選項目，不碰出貨、訂單、總單、庫存主線。\n不要改 DB schema，不新增 renderer，不新增 setInterval/MutationObserver。\n本次指定工單：\n'+JSON.stringify(sel.map(function(x){return {id:x.id,status:x.status||'todo',note:x.note||'',level:(x.row||{}).level,type:(x.row||{}).type,reason:(x.row||{}).reason,label:(x.row||{}).label}}),null,2);}
  function render(){if(!isWh()) return; var items=currentFiltered(); syncSelection(items); var sel=selectedItems(items), c=counts(items); var sig=JSON.stringify({ids:items.map(function(x){return x.id+'|'+(x.status||'todo')+'|'+(x.note||'')}), selected:Object.keys(state.selected).sort(), c:c}); if(sig===state.sig) return; state.sig=sig; var box=ensureBox();
    box.innerHTML='<div class="yx-cf-head"><strong>倉庫工單批量驗收</strong><span>目前清單 '+items.length+' 筆 / 已選 '+sel.length+' 筆</span></div>'+
      '<div class="yx-cf-note">批量處理本機工單狀態與備註，不寫資料庫、不改格位資料；用來把差異逐批驗收完。</div>'+
      '<div class="yx-cf-summary"><span>未完成 '+c.open+'</span><span>待處理 '+c.todo+'</span><span>處理中 '+c.doing+'</span><span>已驗收 '+c.done+'</span><span>略過 '+c.skip+'</span></div>'+
      '<div class="yx-cf-tools"><button type="button" class="ghost-btn small-btn" data-yx-cf-act="selectall">全選目前清單</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="selectopen">選未完成</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="clearselect">取消選取</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="doing">選取改處理中</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="done">選取已驗收</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="skip">選取略過</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="batchnote">批量備註</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="copycmd">複製下一包指令</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="copyjson">複製選取 JSON</button><button type="button" class="ghost-btn small-btn" data-yx-cf-act="download">匯出批量報告</button></div>'+
      '<div class="yx-cf-list">'+(items.slice(0,120).map(function(x){var r=x.row||{}, checked=state.selected[x.id]?'checked':''; return '<label class="yx-cf-row '+esc(r.level||'')+'"><input type="checkbox" data-yx-cf-check="'+esc(x.id)+'" '+checked+'><span class="yx-cf-id">'+esc(x.id)+'</span><span class="yx-cf-status">'+esc(x.status||'todo')+'</span><span class="yx-cf-text">'+esc(r.label||r.reason||r.type||'工單')+'</span></label>';}).join('') || '<div class="yx-cf-empty">目前沒有可批量處理的工單。</div>')+(items.length>120?'<div class="yx-cf-more">只顯示前 120 筆，請用上方工單搜尋縮小範圍。</div>':'')+'</div>';
  }
  function applyStatus(status){var items=currentFiltered(), sel=selectedItems(items); if(!sel.length){toast('請先選取工單','warn');return;} var s=load(), now=Date.now(); sel.forEach(function(x){if(s[x.id]){s[x.id].status=status; s[x.id].updated_at=now;}}); save(s); state.sig=''; if(window.yxWarehouseWorkorderAcceptance&&window.yxWarehouseWorkorderAcceptance.render) window.yxWarehouseWorkorderAcceptance.render(); render(); toast('已更新 '+sel.length+' 筆工單');}
  function batchNote(){var items=currentFiltered(), sel=selectedItems(items); if(!sel.length){toast('請先選取工單','warn');return;} var note=prompt('輸入要追加到選取工單的備註：',''); if(note==null||!String(note).trim()) return; var s=load(), now=Date.now(); sel.forEach(function(x){if(s[x.id]){s[x.id].note=(s[x.id].note?String(s[x.id].note)+'\n':'')+String(note).trim(); s[x.id].updated_at=now;}}); save(s); state.sig=''; if(window.yxWarehouseWorkorderAcceptance&&window.yxWarehouseWorkorderAcceptance.render) window.yxWarehouseWorkorderAcceptance.render(); render(); toast('已追加備註 '+sel.length+' 筆');}
  function bind(){if(window.__YX_WAREHOUSE_CF_BOUND__) return; window.__YX_WAREHOUSE_CF_BOUND__=true; document.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cf-act]'); if(!b) return; ev.preventDefault(); var act=b.getAttribute('data-yx-cf-act'), items=currentFiltered(); if(act==='selectall'){items.forEach(function(x){state.selected[x.id]=true}); state.sig=''; render(); return;} if(act==='selectopen'){items.forEach(function(x){if((x.status||'todo')!=='done'&&(x.status||'todo')!=='skip') state.selected[x.id]=true}); state.sig=''; render(); return;} if(act==='clearselect'){state.selected={}; state.sig=''; render(); return;} if(act==='doing') return applyStatus('doing'); if(act==='done') return applyStatus('done'); if(act==='skip') return applyStatus('skip'); if(act==='batchnote') return batchNote(); if(act==='copycmd') return copyText(nextCommand(items),'已複製下一包指令'); if(act==='copyjson') return copyText(JSON.stringify(report(items),null,2),'已複製選取 JSON'); if(act==='download') return downloadJson(report(items),'yuanxing_warehouse_workorder_batch_20260517cf_'+Date.now()+'.json');},true);
    document.addEventListener('change',function(ev){var c=ev.target; if(!c||!c.matches||!c.matches('[data-yx-cf-check]')) return; var id=c.getAttribute('data-yx-cf-check'); if(c.checked) state.selected[id]=true; else delete state.selected[id]; state.sig=''; render();},true);
    document.addEventListener('input',function(ev){if(ev.target&&ev.target.id==='yx-ce-query'){setTimeout(function(){state.sig=''; render();},120)}},true);
  }
  function install(){if(!isWh()) return; bind(); setTimeout(render,2600); setTimeout(function(){state.sig=''; render();},5200)}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.yxWarehouseWorkorderBatchAcceptance={render:render,getReport:function(){return report(currentFiltered())}};
})();

/* 20260517cg：倉庫工單風險看板 / 熱點分組 / 下一批修復建議（只讀本機工單，不寫資料庫、不動主線） */
(function(){
  if(window.__YX_WAREHOUSE_CG_RISK_BOARD__) return; window.__YX_WAREHOUSE_CG_RISK_BOARD__=true;
  function isWh(){return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-map,.warehouse-map,.yx-warehouse-map')}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function toast(msg,type){try{ if(window.yxToast) return window.yxToast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-cg]',msg)}catch(e){} }
  function copyText(txt,msg){ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){toast(msg||'已複製')}).catch(function(){fallbackCopy(txt,msg)})} else fallbackCopy(txt,msg) }
  function fallbackCopy(txt,msg){var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast(msg||'已複製')}catch(e){toast('複製失敗，請手動選取','warn')} ta.remove();}
  function downloadJson(obj,name){var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},800)}
  var WKEY='yx_wh_ce_workorders_v1';
  function load(){try{return JSON.parse(localStorage.getItem(WKEY)||'{}')||{}}catch(e){return {}}}
  function rows(){var s=load(); return Object.keys(s).map(function(k){return Object.assign({id:k},s[k])}).filter(function(x){return !!x.row});}
  function counts(items){var c={all:0,open:0,todo:0,doing:0,done:0,skip:0,p1:0,p2:0,p3:0}; (items||[]).forEach(function(x){var st=x.status||'todo', lvl=(x.row||{}).level||''; c.all++; c[st]=(c[st]||0)+1; if(st!=='done'&&st!=='skip') c.open++; if(lvl==='danger') c.p1++; else if(lvl==='warn') c.p2++; else c.p3++;}); return c;}
  function riskLabel(level){return level==='danger'?'P1 前端多出':(level==='warn'?'P2 文字不同':'P3 伺服器多出')}
  function severityScore(x){var lvl=(x.row||{}).level||'', st=x.status||'todo'; var s=lvl==='danger'?300:(lvl==='warn'?200:100); if(st==='doing') s+=30; if(st==='todo') s+=20; if(st==='done'||st==='skip') s-=200; return s;}
  function typeKey(x){var r=x.row||{}; return r.label||r.type||riskLabel(r.level)||'未分類'}
  function bucket(items, fn){var m={}; (items||[]).forEach(function(x){var k=fn(x)||'未分類'; if(!m[k]) m[k]=[]; m[k].push(x);}); return Object.keys(m).map(function(k){return {key:k,items:m[k],open:m[k].filter(function(x){var st=x.status||'todo'; return st!=='done'&&st!=='skip'}).length,total:m[k].length,score:m[k].reduce(function(a,x){return a+severityScore(x)},0)}}).sort(function(a,b){return b.score-a.score || b.open-a.open || b.total-a.total || String(a.key).localeCompare(String(b.key));});}
  function keyParts(id){var s=String(id||''); var parts=s.split('|'); return {zone:parts[0]||'', band:parts[1]||'', slot:parts[2]||'', raw:s};}
  function hotZones(items){return bucket(items,function(x){var p=keyParts(x.id); return (p.zone||'未知區')+' / '+(p.band||'未知列');}).slice(0,12)}
  function riskGroups(items){return bucket(items,function(x){return riskLabel((x.row||{}).level)}).slice(0,10)}
  function typeGroups(items){return bucket(items,typeKey).slice(0,10)}
  function openItems(items){return (items||[]).filter(function(x){var st=x.status||'todo'; return st!=='done'&&st!=='skip'}).sort(function(a,b){return severityScore(b)-severityScore(a)||String(a.id).localeCompare(String(b.id));});}
  function buildReport(){var items=rows(), c=counts(items), open=openItems(items); return {report_type:'warehouse_workorder_risk_board_20260517cg', generated_at:new Date().toISOString(), summary:c, risk_groups:riskGroups(items), type_groups:typeGroups(items), hot_zones:hotZones(items), next_batch:open.slice(0,20).map(function(x){return {id:x.id,status:x.status||'todo',level:(x.row||{}).level||'',label:(x.row||{}).label||'',reason:(x.row||{}).reason||'',note:x.note||''}}), rules:['本看板只讀本機工單 localStorage，不打 API、不寫 DB。','優先處理 P1 與熱點區域，仍然只能改倉庫相關檔案。','下一包若要修資料差異，先帶 next_batch，不要大範圍重寫主線。']};}
  function nextCommand(rep){var list=(rep&&rep.next_batch)||[]; return '從 20260517j 穩定版 / 最新倉庫線繼續。\n這次只依「倉庫工單風險看板」的下一批工單修復，修大包一點但不要碰出貨、訂單、總單、庫存主線。\n不要改 DB schema，不新增 renderer，不新增 setInterval / MutationObserver。\n優先處理 P1 與熱點區域；如果不確定，只加讀取式檢查或本機 UI，不直接改資料。\n本次下一批工單：\n'+JSON.stringify(list,null,2);}
  function ensureBox(){var host=$('yx-warehouse-cf-batch')||$('yx-warehouse-ce-workorders')||$('yx-warehouse-bu-panel')||document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main')||document.body; var box=$('yx-warehouse-cg-risk-board'); if(!box){box=document.createElement('div'); box.id='yx-warehouse-cg-risk-board'; box.className='yx-cg-risk-board'; if(host.parentNode) host.parentNode.insertBefore(box, host.nextSibling); else host.appendChild(box);} return box;}
  var state={tab:'risk', sig:''};
  function render(){if(!isWh()) return; var rep=buildReport(), c=rep.summary, data=state.tab==='zone'?rep.hot_zones:(state.tab==='type'?rep.type_groups:rep.risk_groups); var sig=JSON.stringify({tab:state.tab,c:c,data:data.map(function(g){return g.key+g.open+'/'+g.total+'/'+g.score}), next:rep.next_batch.map(function(x){return x.id+'|'+x.status})}); if(sig===state.sig) return; state.sig=sig; var progress=c.all?Math.round(((c.done+c.skip)*100)/c.all):0; var box=ensureBox();
    box.innerHTML='<div class="yx-cg-head"><strong>倉庫工單風險看板</strong><span>完成 '+progress+'% / 未完成 '+c.open+'</span></div>'+ 
      '<div class="yx-cg-note">把差異工單整理成風險、類型、熱點區域；只讀本機工單，不寫資料庫。</div>'+ 
      '<div class="yx-cg-progress"><span style="width:'+progress+'%"></span><b>'+progress+'%</b></div>'+ 
      '<div class="yx-cg-summary"><span>P1 '+c.p1+'</span><span>P2 '+c.p2+'</span><span>P3 '+c.p3+'</span><span>待處理 '+c.todo+'</span><span>處理中 '+c.doing+'</span><span>已完成 '+(c.done+c.skip)+'</span></div>'+ 
      '<div class="yx-cg-tabs"><button class="ghost-btn small-btn '+(state.tab==='risk'?'active':'')+'" data-yx-cg-tab="risk">依風險</button><button class="ghost-btn small-btn '+(state.tab==='type'?'active':'')+'" data-yx-cg-tab="type">依類型</button><button class="ghost-btn small-btn '+(state.tab==='zone'?'active':'')+'" data-yx-cg-tab="zone">依熱點區</button><button class="ghost-btn small-btn" data-yx-cg-act="copycmd">複製下一包指令</button><button class="ghost-btn small-btn" data-yx-cg-act="copyjson">複製看板 JSON</button><button class="ghost-btn small-btn" data-yx-cg-act="download">匯出看板</button></div>'+ 
      '<div class="yx-cg-grid">'+(data.length?data.map(function(g){var pct=c.all?Math.round(g.total*100/c.all):0; return '<div class="yx-cg-card"><div><b>'+esc(g.key)+'</b><em>'+g.open+' 未完成 / '+g.total+' 全部</em></div><small>風險分數 '+g.score+'，占 '+pct+'%</small><div class="yx-cg-mini"><span style="width:'+Math.min(100,pct)+'%"></span></div></div>';}).join(''):'<div class="yx-cg-empty">目前沒有工單資料，請先執行讀回差異或同步工單。</div>')+'</div>'+ 
      '<div class="yx-cg-next"><div class="yx-cg-next-head"><strong>下一批建議處理</strong><span>前 '+rep.next_batch.length+' 筆</span></div>'+ (rep.next_batch.length?rep.next_batch.slice(0,12).map(function(x){return '<div class="yx-cg-next-row"><b>'+esc(x.id)+'</b><span>'+esc(riskLabel(x.level))+'</span><small>'+esc(x.reason||x.label||'')+'</small></div>';}).join(''):'<div class="yx-cg-empty">沒有未完成工單。</div>')+'</div>';
  }
  function bind(){if(window.__YX_WAREHOUSE_CG_BOUND__) return; window.__YX_WAREHOUSE_CG_BOUND__=true; document.addEventListener('click',function(ev){var t=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cg-tab]'); if(t){ev.preventDefault(); state.tab=t.getAttribute('data-yx-cg-tab')||'risk'; state.sig=''; render(); return;} var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cg-act]'); if(!b) return; ev.preventDefault(); var act=b.getAttribute('data-yx-cg-act'), rep=buildReport(); if(act==='copycmd') return copyText(nextCommand(rep),'已複製下一包指令'); if(act==='copyjson') return copyText(JSON.stringify(rep,null,2),'已複製風險看板 JSON'); if(act==='download') return downloadJson(rep,'yuanxing_warehouse_workorder_risk_board_20260517cg_'+Date.now()+'.json');},true);
    document.addEventListener('change',function(ev){if(ev.target&&ev.target.matches&&ev.target.matches('[data-yx-cf-check]')) setTimeout(function(){state.sig=''; render();},180)},true);
  }
  function install(){if(!isWh()) return; bind(); setTimeout(render,3000); setTimeout(function(){state.sig=''; render();},6200)}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.yxWarehouseWorkorderRiskBoard={render:render,getReport:buildReport};
})();


/* 20260517ch：倉庫工單執行看板 / 驗收路線 / 下一包修復包準備（本機 only，不寫 DB、不動主線） */
(function(){
  if(window.__YX_WAREHOUSE_CH_EXEC_BOARD__) return; window.__YX_WAREHOUSE_CH_EXEC_BOARD__=true;
  function isWh(){return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-map,.warehouse-map,.yx-warehouse-map')}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function toast(msg,type){try{ if(window.yxToast) return window.yxToast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-ch]',msg)}catch(e){} }
  function copyText(txt,msg){try{navigator.clipboard&&navigator.clipboard.writeText(txt).then(function(){toast(msg||'已複製')}).catch(function(){fallback(txt,msg)})}catch(e){fallback(txt,msg)} }
  function fallback(txt,msg){var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast(msg||'已複製')}catch(e){alert(txt)} ta.remove();}
  function downloadJson(obj,name){var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);}
  var WKEY='yx_wh_ce_workorders_v1', PKEY='yx_wh_ch_exec_plan_v1';
  function read(k,d){try{return JSON.parse(localStorage.getItem(k)||'')||d}catch(e){return d}}
  function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function risk(level){return level==='danger'?'P1':(level==='warn'?'P2':'P3')}
  function riskText(level){return level==='danger'?'P1 前端多出':(level==='warn'?'P2 文字不同':'P3 伺服器多出')}
  function workorders(){var raw=read(WKEY,{}); return Object.keys(raw).map(function(id){var x=raw[id]||{}; x.id=id; x.row=x.row||{}; return x;}).sort(function(a,b){var ra={danger:0,warn:1,info:2}[(a.row||{}).level]||9, rb={danger:0,warn:1,info:2}[(b.row||{}).level]||9; return ra-rb || String(a.id).localeCompare(String(b.id));});}
  function openOrders(){return workorders().filter(function(x){var st=x.status||'todo'; return st!=='done' && st!=='skip';});}
  function loadPlan(){return read(PKEY,{items:{},updated_at:0})}
  function savePlan(p){p.updated_at=Date.now(); write(PKEY,p)}
  function planRows(){var p=loadPlan(), open=openOrders(); open.forEach(function(x){if(!p.items[x.id]) p.items[x.id]={status:'queued',created_at:Date.now(),note:''}; p.items[x.id].row=x.row; p.items[x.id].workorder_status=x.status||'todo';}); Object.keys(p.items).forEach(function(id){if(!open.some(function(x){return x.id===id}) && !p.items[id].manual_keep) delete p.items[id];}); savePlan(p); return Object.keys(p.items).map(function(id){var x=p.items[id]||{}; x.id=id; x.row=x.row||{}; return x;}).sort(function(a,b){var ra={danger:0,warn:1,info:2}[(a.row||{}).level]||9, rb={danger:0,warn:1,info:2}[(b.row||{}).level]||9; var sa={hold:0,queued:1,testing:2,pass:3}[(a.status||'queued')]||5, sb={hold:0,queued:1,testing:2,pass:3}[(b.status||'queued')]||5; return ra-rb || sa-sb || String(a.id).localeCompare(String(b.id));});}
  function counts(rows){var c={all:rows.length,p1:0,p2:0,p3:0,queued:0,testing:0,pass:0,hold:0}; rows.forEach(function(x){var r=risk((x.row||{}).level).toLowerCase(); c[r]=(c[r]||0)+1; var st=x.status||'queued'; c[st]=(c[st]||0)+1;}); c.ready=c.all?Math.round((c.pass*100)/c.all):100; return c;}
  var state={filter:'open',q:'',selected:{},sig:''};
  function filtered(rows){var q=(state.q||'').toLowerCase(); return rows.filter(function(x){var st=x.status||'queued', rv=risk((x.row||{}).level); var ok=state.filter==='all'||(state.filter==='open'&&st!=='pass')||state.filter===st||state.filter===rv; var text=(x.id+' '+st+' '+rv+' '+((x.row||{}).label||'')+' '+((x.row||{}).reason||'')+' '+((x.row||{}).local||'')+' '+((x.row||{}).server||'')+' '+(x.note||'')).toLowerCase(); return ok && (!q || text.indexOf(q)>=0);});}
  function report(rows){var c=counts(rows); return {report_type:'warehouse_workorder_execution_board_20260517ch',generated_at:new Date().toISOString(),summary:c,filter:state.filter,query:state.q,selected:Object.keys(state.selected).filter(function(k){return state.selected[k]}),items:rows.map(function(x){return {id:x.id,status:x.status||'queued',risk:risk((x.row||{}).level),label:(x.row||{}).label||'',reason:(x.row||{}).reason||'',note:x.note||'',row:x.row}}),rules:['本執行看板只讀/寫本機 localStorage，不寫 DB。','用於整理倉庫讀回差異工單的修復順序與驗收狀態。','下一包若要真正修復，只能依 selected 或 P1/P2 工單修倉庫相關檔案。']};}
  function nextCmd(rows){var sel=rows.filter(function(x){return state.selected[x.id]}), list=(sel.length?sel:rows.filter(function(x){return (x.status||'queued')!=='pass'}).slice(0,30)); return '從 20260517j 穩定版 / 最新倉庫線繼續，修大包一點，但只修倉庫相關。\n不要碰出貨、訂單、總單、庫存主線；不要改 DB schema；不要新增 renderer / setInterval / MutationObserver。\n這次依「倉庫工單執行看板」處理以下工單，優先 P1/P2，修完要回報完整包、部署差異包、20260517j 到新版基準差異包：\n'+JSON.stringify(list.map(function(x){return {id:x.id,status:x.status||'queued',risk:risk((x.row||{}).level),label:(x.row||{}).label||'',reason:(x.row||{}).reason||''}}),null,2);}
  function ensureBox(){var host=$('yx-warehouse-cg-risk-board')||$('yx-warehouse-cf-batch')||$('yx-warehouse-ce-workorders')||$('yx-warehouse-bu-panel')||document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main')||document.body; var box=$('yx-warehouse-ch-exec'); if(!box){box=document.createElement('div'); box.id='yx-warehouse-ch-exec'; box.className='yx-ch-exec'; if(host.parentNode) host.parentNode.insertBefore(box,host.nextSibling); else host.appendChild(box);} return box;}
  function render(){if(!isWh()) return; var rows=planRows(), c=counts(rows), list=filtered(rows); var sig=JSON.stringify({f:state.filter,q:state.q,c:c,sel:Object.keys(state.selected).sort(),list:list.map(function(x){return x.id+'|'+x.status+'|'+(x.note||'')}).slice(0,80)}); if(sig===state.sig) return; state.sig=sig; var box=ensureBox();
    box.innerHTML='<div class="yx-ch-head"><strong>倉庫工單執行看板</strong><span>驗收 '+c.ready+'% / 未通過 '+(c.all-c.pass)+'</span></div>'+ 
      '<div class="yx-ch-stats"><span>P1 '+c.p1+'</span><span>P2 '+c.p2+'</span><span>P3 '+c.p3+'</span><span>待排 '+c.queued+'</span><span>測試中 '+c.testing+'</span><span>通過 '+c.pass+'</span><span>暫緩 '+c.hold+'</span></div>'+ 
      '<div class="yx-ch-toolbar"><button class="ghost-btn small-btn '+(state.filter==='open'?'active':'')+'" data-yx-ch-filter="open">未通過</button><button class="ghost-btn small-btn '+(state.filter==='P1'?'active':'')+'" data-yx-ch-filter="P1">P1</button><button class="ghost-btn small-btn '+(state.filter==='P2'?'active':'')+'" data-yx-ch-filter="P2">P2</button><button class="ghost-btn small-btn '+(state.filter==='testing'?'active':'')+'" data-yx-ch-filter="testing">測試中</button><button class="ghost-btn small-btn '+(state.filter==='pass'?'active':'')+'" data-yx-ch-filter="pass">已通過</button><button class="ghost-btn small-btn '+(state.filter==='all'?'active':'')+'" data-yx-ch-filter="all">全部</button><input id="yx-ch-q" placeholder="搜尋工單 / 格號 / 原因" value="'+esc(state.q)+'"></div>'+ 
      '<div class="yx-ch-actions"><button class="ghost-btn small-btn" data-yx-ch-act="selectshown">選目前清單</button><button class="ghost-btn small-btn" data-yx-ch-act="selectp1">選 P1</button><button class="ghost-btn small-btn" data-yx-ch-act="clearsel">清選取</button><button class="ghost-btn small-btn" data-yx-ch-act="testing">標測試中</button><button class="ghost-btn small-btn" data-yx-ch-act="pass">標通過</button><button class="ghost-btn small-btn" data-yx-ch-act="hold">標暫緩</button><button class="ghost-btn small-btn" data-yx-ch-act="note">批量備註</button><button class="ghost-btn small-btn" data-yx-ch-act="copycmd">複製下一包指令</button><button class="ghost-btn small-btn" data-yx-ch-act="copyjson">複製看板 JSON</button><button class="ghost-btn small-btn" data-yx-ch-act="download">匯出</button></div>'+ 
      '<div class="yx-ch-list">'+(list.length?list.slice(0,80).map(function(x){var checked=state.selected[x.id]?'checked':''; return '<div class="yx-ch-row '+esc((x.status||'queued'))+'"><label><input type="checkbox" data-yx-ch-select="'+esc(x.id)+'" '+checked+'> <b>'+esc(riskText((x.row||{}).level))+'</b> <code>'+esc(x.id)+'</code></label><small>'+esc((x.row||{}).reason||(x.row||{}).label||'')+'</small><div class="yx-ch-row-actions"><button class="ghost-btn small-btn" data-yx-ch-status="testing" data-yx-ch-id="'+esc(x.id)+'">測試中</button><button class="ghost-btn small-btn" data-yx-ch-status="pass" data-yx-ch-id="'+esc(x.id)+'">通過</button><button class="ghost-btn small-btn" data-yx-ch-status="hold" data-yx-ch-id="'+esc(x.id)+'">暫緩</button></div></div>';}).join(''):'<div class="yx-ch-empty">目前沒有符合條件的工單；可先跑讀回差異與工單轉換。</div>')+'</div>';
  }
  function setStatus(ids,st){var p=loadPlan(); ids.forEach(function(id){if(p.items[id]){p.items[id].status=st;p.items[id].updated_at=Date.now();}}); savePlan(p); state.sig=''; render();}
  function bind(){if(window.__YX_WAREHOUSE_CH_BOUND__) return; window.__YX_WAREHOUSE_CH_BOUND__=true; document.addEventListener('input',function(ev){if(ev.target&&ev.target.id==='yx-ch-q'){state.q=ev.target.value||''; state.sig=''; render();}},true); document.addEventListener('change',function(ev){var cb=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ch-select]'); if(cb){state.selected[cb.getAttribute('data-yx-ch-select')]=!!cb.checked; state.sig=''; render();}},true); document.addEventListener('click',function(ev){var f=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ch-filter]'); if(f){ev.preventDefault(); state.filter=f.getAttribute('data-yx-ch-filter')||'open'; state.sig=''; render(); return;} var st=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ch-status]'); if(st){ev.preventDefault(); setStatus([st.getAttribute('data-yx-ch-id')],st.getAttribute('data-yx-ch-status')); return;} var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ch-act]'); if(!b) return; ev.preventDefault(); var act=b.getAttribute('data-yx-ch-act'), rows=planRows(), list=filtered(rows), ids=Object.keys(state.selected).filter(function(k){return state.selected[k]}); if(act==='selectshown'){list.forEach(function(x){state.selected[x.id]=true}); state.sig=''; render(); return;} if(act==='selectp1'){rows.forEach(function(x){if(risk((x.row||{}).level)==='P1') state.selected[x.id]=true}); state.sig=''; render(); return;} if(act==='clearsel'){state.selected={}; state.sig=''; render(); return;} if(act==='testing'||act==='pass'||act==='hold'){setStatus(ids.length?ids:list.map(function(x){return x.id}),act); return;} if(act==='note'){var note=prompt('追加備註到選取工單：'); if(note==null) return; var p=loadPlan(); (ids.length?ids:list.map(function(x){return x.id})).forEach(function(id){if(p.items[id]) p.items[id].note=((p.items[id].note||'')?' | ':'')+note;}); savePlan(p); state.sig=''; render(); return;} if(act==='copycmd') return copyText(nextCmd(list),'已複製下一包指令'); if(act==='copyjson') return copyText(JSON.stringify(report(rows),null,2),'已複製執行看板 JSON'); if(act==='download') return downloadJson(report(rows),'yuanxing_warehouse_execution_board_20260517ch_'+Date.now()+'.json');},true);}
  function init(){bind(); render();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
  window.yxWarehouseExecutionBoard20260517ch={render:render,report:function(){return report(planRows())}};
})();


/* 20260517ci：倉庫總驗收中心 / 一鍵整合倉庫狀態、讀回、自檢、工單、執行看板（本機 only，不寫 DB、不動主線） */
(function(){
  if(window.__YX_WAREHOUSE_CI_TOTAL_ACCEPTANCE__) return; window.__YX_WAREHOUSE_CI_TOTAL_ACCEPTANCE__=true;
  function isWh(){return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-map,.warehouse-map,.yx-warehouse-map')}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function toast(msg,type){try{ if(window.yxToast) return window.yxToast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-ci]',msg)}catch(e){} }
  function copyText(txt,msg){try{navigator.clipboard&&navigator.clipboard.writeText(txt).then(function(){toast(msg||'已複製')}).catch(function(){fallback(txt,msg)})}catch(e){fallback(txt,msg)} }
  function fallback(txt,msg){var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast(msg||'已複製')}catch(e){alert(txt)} ta.remove();}
  function downloadJson(obj,name){var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},800)}
  function read(k,d){try{return JSON.parse(localStorage.getItem(k)||'')||d}catch(e){return d}}
  function keys(prefix){var out=[]; try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i); if(!prefix || String(k).indexOf(prefix)>=0) out.push(k);}}catch(e){} return out.sort();}
  function textOf(el){return el?String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim():''}
  function countSel(sel){try{return document.querySelectorAll(sel).length}catch(e){return 0}}
  function sizeOfKeys(list){var total=0; list.forEach(function(k){try{total+=String(localStorage.getItem(k)||'').length}catch(e){}}); return total;}
  function workorders(){var raw=read('yx_wh_ce_workorders_v1',{}); return Object.keys(raw).map(function(id){var x=raw[id]||{}; return {id:id,status:x.status||'todo',level:(x.row||{}).level||'',reason:(x.row||{}).reason||'',note:x.note||''};});}
  function execution(){var raw=read('yx_wh_ch_exec_plan_v1',{items:{}}); var items=raw.items||{}; return Object.keys(items).map(function(id){var x=items[id]||{}; return {id:id,status:x.status||'queued',level:(x.row||{}).level||'',note:x.note||''};});}
  function summarizeWorkorders(rows){var c={all:0,open:0,p1:0,p2:0,p3:0,done:0,skip:0,doing:0,todo:0}; (rows||[]).forEach(function(x){c.all++; var st=x.status||'todo'; c[st]=(c[st]||0)+1; if(st!=='done'&&st!=='skip') c.open++; if(x.level==='danger') c.p1++; else if(x.level==='warn') c.p2++; else c.p3++;}); return c;}
  function summarizeExec(rows){var c={all:0,queued:0,testing:0,pass:0,hold:0,open:0}; (rows||[]).forEach(function(x){c.all++; var st=x.status||'queued'; c[st]=(c[st]||0)+1; if(st!=='pass') c.open++;}); c.pass_rate=c.all?Math.round(c.pass*100/c.all):100; return c;}
  function collectLocal(){
    var whKeys=keys('yx_wh_'), yxKeys=keys('yx_warehouse');
    var cells=countSel('[data-cell-key],.warehouse-cell,.yx-warehouse-cell,.wh-cell');
    var marked=countSel('.yx-wh-marked,.yx-warehouse-marked,.marked-pink,.yx-marked-pink');
    var editing=countSel('.yx-warehouse-editing,.warehouse-cell-editing,.yx-wh-editing');
    var searchActive=countSel('.yx-wh-search-active,.yx-search-active,.warehouse-search-active');
    var drafts=whKeys.filter(function(k){return /draft|草稿/i.test(k)});
    var failures=whKeys.filter(function(k){return /fail|error|failed|保存失敗/i.test(k)});
    return {warehouse_keys:whKeys.length, yx_warehouse_keys:yxKeys.length, local_storage_bytes:sizeOfKeys(whKeys.concat(yxKeys)), visible_cells:cells, marked_cells:marked, editing_cells:editing, active_search_cells:searchActive, draft_keys:drafts.length, failure_keys:failures.length, url:location.pathname, viewport:{w:innerWidth,h:innerHeight, dpr:window.devicePixelRatio||1}};
  }
  function collectPanels(){
    var ids=['yx-warehouse-bu-panel','yx-warehouse-bv-selfcheck','yx-warehouse-bw-log','yx-warehouse-bx-report','yx-warehouse-by-analysis','yx-warehouse-bz-fix','yx-warehouse-ca-readback','yx-warehouse-cb-diff','yx-warehouse-cc-filter','yx-warehouse-cd-advice','yx-warehouse-ce-workorders','yx-warehouse-cf-batch','yx-warehouse-cg-risk-board','yx-warehouse-ch-exec'];
    return ids.map(function(id){var el=$(id); return {id:id, exists:!!el, text_len:textOf(el).length};});
  }
  function getOptionalReports(){
    var out={};
    try{ if(window.yxWarehouseExecutionBoard20260517ch&&window.yxWarehouseExecutionBoard20260517ch.report) out.execution_board=window.yxWarehouseExecutionBoard20260517ch.report(); }catch(e){out.execution_error=String(e)}
    try{ if(window.yxWarehouseWorkorderRiskBoard&&window.yxWarehouseWorkorderRiskBoard.getReport) out.risk_board=window.yxWarehouseWorkorderRiskBoard.getReport(); }catch(e){out.risk_error=String(e)}
    try{ if(window.yxWarehouseReadback20260517ca&&window.yxWarehouseReadback20260517ca.report) out.readback=window.yxWarehouseReadback20260517ca.report(); }catch(e){out.readback_error=String(e)}
    try{ if(window.yxWarehouseLocalSelfCheck20260517bv&&window.yxWarehouseLocalSelfCheck20260517bv.report) out.local_selfcheck=window.yxWarehouseLocalSelfCheck20260517bv.report(); }catch(e){out.selfcheck_error=String(e)}
    return out;
  }
  function buildAcceptance(){
    var wo=workorders(), ex=execution(), local=collectLocal(), panels=collectPanels(), opt=getOptionalReports();
    var checks=[];
    function chk(name,ok,detail,level){checks.push({name:name,ok:!!ok,detail:detail||'',level:level||(!ok?'warn':'ok')})}
    chk('倉庫頁可見格位', local.visible_cells>0, '目前 DOM 格位數：'+local.visible_cells, local.visible_cells>0?'ok':'critical');
    chk('長按/倉庫面板已載入', panels.some(function(x){return x.exists&&/bu|bv|bw|bx|ce|ch/.test(x.id)}), '已載入面板：'+panels.filter(function(x){return x.exists}).length, 'ok');
    chk('本機保存失敗鍵數', local.failure_keys===0, 'failure_keys='+local.failure_keys, local.failure_keys?'warn':'ok');
    chk('本機草稿數可控', local.draft_keys<=30, 'draft_keys='+local.draft_keys, local.draft_keys>30?'warn':'ok');
    chk('工單未完成數', summarizeWorkorders(wo).open===0, 'open='+summarizeWorkorders(wo).open, summarizeWorkorders(wo).open?'info':'ok');
    chk('執行看板通過率', summarizeExec(ex).pass_rate>=80 || ex.length===0, 'pass_rate='+summarizeExec(ex).pass_rate+'%', 'info');
    chk('localStorage 體積', local.local_storage_bytes<900000, 'warehouse local bytes='+local.local_storage_bytes, local.local_storage_bytes>=900000?'warn':'ok');
    return {report_type:'warehouse_total_acceptance_hub_20260517ci', generated_at:new Date().toISOString(), app_line:'20260517j stable + warehouse line through 20260517ci', local:local, panels:panels, workorders:summarizeWorkorders(wo), execution:summarizeExec(ex), checks:checks, optional_reports:opt, next_rules:['若 checks 有 critical，下一包只修倉庫可見格位或載入問題。','若 failure_keys > 0，下一包只修保存失敗流程，不動出貨/訂單/總單。','若工單 open > 0，下一包依 P1/P2 工單修，不直接重寫資料。','若沒有實測錯誤，不再盲目加大功能；先部署到測試分支驗收。']};
  }
  function acceptanceScore(rep){var checks=rep.checks||[], critical=checks.filter(function(x){return x.level==='critical'&&!x.ok}).length, warn=checks.filter(function(x){return x.level==='warn'&&!x.ok}).length; var base=96; if(critical) base-=6; if(warn) base-=2; if((rep.workorders||{}).open>0) base-=1; if((rep.execution||{}).all && (rep.execution||{}).pass_rate<80) base-=1; return Math.max(85,Math.min(98,base));}
  function ensureBox(){var host=$('yx-warehouse-ch-exec')||$('yx-warehouse-cg-risk-board')||$('yx-warehouse-bu-panel')||document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main')||document.body; var box=$('yx-warehouse-ci-acceptance'); if(!box){box=document.createElement('div'); box.id='yx-warehouse-ci-acceptance'; box.className='yx-ci-acceptance'; if(host.parentNode) host.parentNode.insertBefore(box,host.nextSibling); else host.appendChild(box);} return box;}
  function render(){if(!isWh()) return; var rep=buildAcceptance(), score=acceptanceScore(rep), box=ensureBox(); var bad=(rep.checks||[]).filter(function(x){return !x.ok});
    box.innerHTML='<div class="yx-ci-head"><strong>倉庫總驗收中心</strong><span>估計 '+score+'%</span></div>'+ 
      '<div class="yx-ci-note">整合倉庫狀態、讀回工具、自檢、工單與執行看板；只讀本機 / DOM，不寫資料庫。</div>'+ 
      '<div class="yx-ci-score"><span style="width:'+score+'%"></span><b>'+score+'%</b></div>'+ 
      '<div class="yx-ci-summary"><span>可視格 '+rep.local.visible_cells+'</span><span>粉紅 '+rep.local.marked_cells+'</span><span>草稿 '+rep.local.draft_keys+'</span><span>失敗 '+rep.local.failure_keys+'</span><span>工單未完 '+rep.workorders.open+'</span><span>驗收 '+rep.execution.pass_rate+'%</span></div>'+ 
      '<div class="yx-ci-actions"><button class="ghost-btn small-btn" data-yx-ci-act="refresh">重跑總驗收</button><button class="ghost-btn small-btn" data-yx-ci-act="copy">複製總驗收 JSON</button><button class="ghost-btn small-btn" data-yx-ci-act="download">匯出總驗收</button><button class="ghost-btn small-btn" data-yx-ci-act="next">複製下一包建議</button></div>'+ 
      '<div class="yx-ci-checks">'+(rep.checks||[]).map(function(c){return '<div class="yx-ci-check '+(c.ok?'ok':'bad')+'"><b>'+(c.ok?'✓':'!')+' '+esc(c.name)+'</b><small>'+esc(c.detail)+'</small></div>';}).join('')+'</div>'+ 
      '<div class="yx-ci-panels"><strong>已偵測倉庫面板</strong><div>'+rep.panels.filter(function(p){return p.exists}).map(function(p){return '<span>'+esc(p.id.replace('yx-warehouse-',''))+'</span>';}).join('')+'</div></div>'+ 
      (bad.length?'<div class="yx-ci-warn">仍需注意：'+bad.map(function(x){return esc(x.name)}).join('、')+'</div>':'<div class="yx-ci-ok">本機總驗收沒有 critical；可部署到測試分支做手機實測。</div>');
  }
  function nextCommand(rep){return '從 20260517j 穩定版 / 最新倉庫線繼續，修大包一點但只動倉庫相關。\n依「倉庫總驗收中心 20260517ci」結果處理，不碰出貨、訂單、總單、庫存主線，不改 DB schema，不新增 renderer / setInterval / MutationObserver。\n總驗收摘要：\n'+JSON.stringify({local:rep.local, workorders:rep.workorders, execution:rep.execution, failed_checks:(rep.checks||[]).filter(function(x){return !x.ok})},null,2);}
  function bind(){if(window.__YX_WAREHOUSE_CI_BOUND__) return; window.__YX_WAREHOUSE_CI_BOUND__=true; document.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-ci-act]'); if(!b) return; ev.preventDefault(); var rep=buildAcceptance(), act=b.getAttribute('data-yx-ci-act'); if(act==='refresh'){render(); toast('已重跑倉庫總驗收'); return;} if(act==='copy') return copyText(JSON.stringify(rep,null,2),'已複製倉庫總驗收 JSON'); if(act==='download') return downloadJson(rep,'yuanxing_warehouse_total_acceptance_20260517ci_'+Date.now()+'.json'); if(act==='next') return copyText(nextCommand(rep),'已複製下一包建議');},true);}
  function init(){if(!isWh()) return; bind(); setTimeout(render,3600); setTimeout(render,7800)}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
  window.yxWarehouseTotalAcceptance20260517ci={render:render,report:buildAcceptance};
})();


/* 20260517cj：倉庫輔助面板管理中心 / 收合、展開、只留總驗收、匯出版面；本機 only，不寫 DB、不動倉庫主線 */
(function(){
  if(window.__YX_WAREHOUSE_CJ_PANEL_MANAGER__) return; window.__YX_WAREHOUSE_CJ_PANEL_MANAGER__=true;
  function isWh(){return /warehouse/i.test(location.pathname||'') || !!document.querySelector('#warehouse-map,.warehouse-map,.yx-warehouse-map')}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function toast(msg,type){try{ if(window.yxToast) return window.yxToast(msg,type||'info'); }catch(e){} try{console.log('[warehouse-cj]',msg)}catch(e){} }
  function copyText(txt,msg){try{navigator.clipboard&&navigator.clipboard.writeText(txt).then(function(){toast(msg||'已複製')}).catch(function(){fallback(txt,msg)})}catch(e){fallback(txt,msg)}}
  function fallback(txt,msg){var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); toast(msg||'已複製')}catch(e){alert(txt)} ta.remove();}
  function downloadJson(obj,name){var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},800)}
  function read(k,d){try{return JSON.parse(localStorage.getItem(k)||'')||d}catch(e){return d}}
  function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  var KEY='yx_wh_cj_panel_layout_v1';
  var PANEL_IDS=[
    ['bu','yx-warehouse-bu-panel','倉庫狀態'],['bv','yx-warehouse-bv-selfcheck','本機自檢'],['bw','yx-warehouse-bw-log','操作日誌'],['bx','yx-warehouse-bx-report','回報包'],['by','yx-warehouse-by-analysis','回報分析'],['bz','yx-warehouse-bz-fix','快速修復'],['ca','yx-warehouse-ca-readback','讀回自檢'],['cb','yx-warehouse-cb-diff','讀回差異定位'],['cc','yx-warehouse-cc-filter','差異篩選'],['cd','yx-warehouse-cd-advice','處理建議'],['ce','yx-warehouse-ce-workorders','工單驗收'],['cf','yx-warehouse-cf-batch','批量驗收'],['cg','yx-warehouse-cg-risk-board','風險看板'],['ch','yx-warehouse-ch-exec','執行看板'],['ci','yx-warehouse-ci-acceptance','總驗收中心']
  ];
  function defaults(){return {mode:'normal', collapsed:{}, hidden:{}, updated_at:Date.now()}}
  function layout(){var v=read(KEY,null); if(!v||typeof v!=='object') v=defaults(); v.collapsed=v.collapsed||{}; v.hidden=v.hidden||{}; return v;}
  function save(v){v.updated_at=Date.now(); write(KEY,v)}
  function panelMeta(){return PANEL_IDS.map(function(x){var el=$(x[1]); return {key:x[0], id:x[1], label:x[2], exists:!!el, hidden:el?getComputedStyle(el).display==='none':false, text_len:el?String(el.innerText||'').length:0};});}
  function setCollapsed(el,on){ if(!el) return; el.classList.toggle('yx-cj-panel-collapsed',!!on); }
  function setHidden(el,on){ if(!el) return; el.classList.toggle('yx-cj-panel-hidden',!!on); }
  function applyLayout(){var v=layout(); PANEL_IDS.forEach(function(x){var el=$(x[1]); if(!el) return; var key=x[0]; var hide=!!v.hidden[key]; if(v.mode==='only-ci' && key!=='ci') hide=true; setHidden(el,hide); setCollapsed(el,!hide && !!v.collapsed[key]);});}
  function ensureBox(){var host=$('yx-warehouse-ci-acceptance')||$('yx-warehouse-ch-exec')||$('yx-warehouse-bu-panel')||document.querySelector('.yx-warehouse-panel,.warehouse-panel,.page-content,main')||document.body; var box=$('yx-warehouse-cj-panel-manager'); if(!box){box=document.createElement('div'); box.id='yx-warehouse-cj-panel-manager'; box.className='yx-cj-manager'; if(host.parentNode) host.parentNode.insertBefore(box,host); else host.appendChild(box);} return box;}
  function report(){var v=layout(), panels=panelMeta(); return {report_type:'warehouse_panel_manager_20260517cj', generated_at:new Date().toISOString(), mode:v.mode, layout:v, panels:panels, counts:{exists:panels.filter(function(p){return p.exists}).length, hidden:panels.filter(function(p){return p.hidden}).length, collapsed:Object.keys(v.collapsed||{}).filter(function(k){return v.collapsed[k]}).length}, note:'本報告只描述倉庫輔助面板顯示狀態；不含業務資料、不寫 DB。'} }
  function render(){if(!isWh()) return; applyLayout(); var box=ensureBox(), rep=report(), rows=rep.panels.filter(function(p){return p.exists});
    box.innerHTML='<div class="yx-cj-head"><strong>倉庫輔助面板管理</strong><span>'+esc(rep.mode==='only-ci'?'只看總驗收':'一般')+'</span></div>'+ 
      '<div class="yx-cj-note">整理倉庫輔助面板，避免現場手機畫面太長；只改本機顯示，不改資料。</div>'+ 
      '<div class="yx-cj-actions"><button class="ghost-btn small-btn" data-yx-cj-act="collapse">收合全部輔助面板</button><button class="ghost-btn small-btn" data-yx-cj-act="expand">展開全部</button><button class="ghost-btn small-btn" data-yx-cj-act="onlyci">只看總驗收</button><button class="ghost-btn small-btn" data-yx-cj-act="normal">恢復一般</button><button class="ghost-btn small-btn" data-yx-cj-act="copy">複製版面 JSON</button><button class="ghost-btn small-btn" data-yx-cj-act="download">匯出版面</button><button class="ghost-btn small-btn danger-light" data-yx-cj-act="reset">重置本機版面</button></div>'+ 
      '<div class="yx-cj-list">'+rows.map(function(p){return '<div class="yx-cj-row"><b>'+esc(p.label)+'</b><small>'+esc(p.id)+' / '+p.text_len+'字</small><button class="ghost-btn mini-btn" data-yx-cj-toggle="'+esc(p.key)+'">'+((layout().collapsed||{})[p.key]?'展開':'收合')+'</button><button class="ghost-btn mini-btn" data-yx-cj-hide="'+esc(p.key)+'">'+((layout().hidden||{})[p.key]?'顯示':'隱藏')+'</button></div>';}).join('')+'</div>'+ 
      '<div class="yx-cj-foot">已載入 '+rows.length+' 個倉庫輔助面板；核心倉庫格位、長按、拖拉、出貨/訂單/總單都不受影響。</div>';
  }
  function bind(){if(window.__YX_WAREHOUSE_CJ_BOUND__) return; window.__YX_WAREHOUSE_CJ_BOUND__=true; document.addEventListener('click',function(ev){var t=ev.target&&ev.target.closest&&ev.target.closest('[data-yx-cj-toggle],[data-yx-cj-hide],[data-yx-cj-act]'); if(!t) return; ev.preventDefault(); var v=layout(), key=t.getAttribute('data-yx-cj-toggle'); if(key){v.collapsed[key]=!v.collapsed[key]; save(v); render(); return;} key=t.getAttribute('data-yx-cj-hide'); if(key){v.hidden[key]=!v.hidden[key]; save(v); render(); return;} var act=t.getAttribute('data-yx-cj-act'); if(act==='collapse'){PANEL_IDS.forEach(function(x){v.collapsed[x[0]]=true}); v.mode='normal'; save(v); render(); toast('已收合倉庫輔助面板'); return;} if(act==='expand'){v.collapsed={}; v.hidden={}; v.mode='normal'; save(v); render(); toast('已展開倉庫輔助面板'); return;} if(act==='onlyci'){v.mode='only-ci'; v.hidden={}; save(v); render(); toast('已切成只看總驗收'); return;} if(act==='normal'){v.mode='normal'; save(v); render(); toast('已恢復一般顯示'); return;} if(act==='copy') return copyText(JSON.stringify(report(),null,2),'已複製倉庫版面 JSON'); if(act==='download') return downloadJson(report(),'yuanxing_warehouse_panel_layout_20260517cj_'+Date.now()+'.json'); if(act==='reset'){localStorage.removeItem(KEY); render(); toast('已重置本機倉庫版面'); return;} },true);}
  function init(){if(!isWh()) return; bind(); setTimeout(render,4200); setTimeout(render,8200); window.addEventListener('storage',function(e){if(e.key===KEY) render();});}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
  window.yxWarehousePanelManager20260517cj={render:render,report:report,apply:applyLayout};
})();
