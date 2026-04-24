/* ==== FIX28：正式收斂升級版（單一防護層，清掉舊補丁衝突） ==== */
(function(){
  'use strict';
  const VERSION = 'fix28';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const state = window.state = window.state || { warehouse:{ cells:[], zones:{A:{},B:{}}, availableItems:[], activeZone:'A' }, searchHighlightKeys:new Set() };
  const moduleKey = () => document.querySelector('.module-screen')?.dataset?.module || (location.pathname.includes('/master-order')?'master_order':location.pathname.includes('/orders')?'orders':location.pathname.includes('/inventory')?'inventory':location.pathname.includes('/ship')?'ship':location.pathname.includes('/warehouse')?'warehouse':location.pathname.includes('/customers')?'customers':location.pathname.includes('/todos')?'todos':'');
  const isInventory = () => moduleKey()==='inventory' || location.pathname.includes('/inventory');
  const isWarehouse = () => moduleKey()==='warehouse' || location.pathname.includes('/warehouse');
  const isToday = () => location.pathname.includes('/today-changes') || !!$('today-summary-cards');
  const say = (msg, type='ok') => (typeof window.toast === 'function' ? window.toast(msg, type) : alert(msg));
  window.__YUANXING_FIX_VERSION__ = VERSION;
  document.documentElement.dataset.yxVersion = VERSION;

  async function api(url, options={}){
    const opts = { credentials:'same-origin', ...options };
    opts.headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const err = new Error(data.error || data.message || `請求失敗：${res.status}`);
      err.payload = data; err.status = res.status;
      throw err;
    }
    return data;
  }

  function sizeKey(text){
    const raw = String(text || '').replace(/[×X＊*]/g, 'x').replace('＝','=').trim().toLowerCase();
    const left = (raw.split('=', 1)[0] || raw).trim();
    const parts = left.split('x').filter(Boolean);
    if (parts.length >= 3 && parts.slice(0,3).every(p => /^\d+$/.test(p.trim()))) return parts.slice(0,3).map(p => String(parseInt(p,10))).join('x');
    return left;
  }
  function productKey(text){
    const raw = String(text || '').replace(/[×X＊*]/g, 'x').replace('＝','=').trim().toLowerCase();
    if (!raw.includes('=')) return sizeKey(raw);
    const [left, right] = raw.split('=', 2);
    const nums = (right.match(/\d+/g) || []).map(n => String(parseInt(n,10)));
    return sizeKey(left) + '=' + (nums.length ? nums.join('x') : right.trim());
  }
  function qtyOf(item){ return Math.max(0, parseInt(item?.unplaced_qty ?? item?.qty ?? item?.total_qty ?? '0', 10) || 0); }
  function sourceText(item){
    if (item?.source_summary) return item.source_summary;
    if (Array.isArray(item?.sources)) return item.sources.map(x => `${x.source}${x.qty}`).join('、');
    return '庫存 / 訂單 / 總單';
  }
  function normalizeItems(items){
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach(raw => {
      const product = String(raw?.product_text || raw?.product || '').trim();
      const qty = Math.max(0, parseInt(raw?.qty || '0', 10) || 0);
      if (!product || qty <= 0) return;
      const item = { ...raw, product_text:product, product_code:String(raw?.product_code || product).trim(), customer_name:String(raw?.customer_name || '').trim(), qty };
      const key = `${sizeKey(product)}||${item.customer_name}`;
      if (!map.has(key)) map.set(key, item);
      else {
        const old = map.get(key);
        old.qty = Number(old.qty || 0) + qty;
        if (!old.source_summary && item.source_summary) old.source_summary = item.source_summary;
      }
    });
    return [...map.values()];
  }
  function noOldCache(){
    try { localStorage.setItem('yuanxing_fix_version', VERSION); } catch(_) {}
    try { navigator.serviceWorker?.getRegistrations?.().then(regs => regs.forEach(r => r.unregister().catch(()=>null))).catch(()=>null); } catch(_) {}
    try { caches?.keys?.().then(keys => keys.forEach(k => caches.delete(k))).catch(()=>null); } catch(_) {}
  }
  function hardCleanBadText(){
    if (!document.body) return;
    const bad = [/庫存送出後.*庫存清單/s, /靜態檔版本改成\s*fix\d+/s, /今日異動頁面的按鈕/s, /順便修正出貨查詢/s, /更新靜態檔版本號/s, /圖二異動.*文字/s, /庫存沒加入/s, /這邊全部幫我修正/s, /異常比對/];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits=[];
    while (walker.nextNode()) {
      const n = walker.currentNode, p = n.parentElement;
      if (!p || ['SCRIPT','STYLE','TEXTAREA','INPUT'].includes(p.tagName)) continue;
      if (bad.some(re => re.test(n.nodeValue || ''))) hits.push(n);
    }
    hits.forEach(n => { const p=n.parentElement; if (!p) return; if ((p.textContent||'').trim().length < 2500 && !p.closest('.modal')) p.remove(); else n.nodeValue=''; });
    document.querySelectorAll('#today-filter-anomaly,#today-anomaly-list,[data-today-panel="anomaly"],[data-kind="anomaly"]').forEach(el => el.closest('.panel')?.remove?.() || el.remove());
  }

  // ---------- 登入 / 設定 ----------
  window.toggleLoginSave = function(){
    const now = localStorage.getItem('yx_remember_login') !== '0';
    localStorage.setItem('yx_remember_login', now ? '0' : '1');
    const label = $('remember-label'); if (label) label.textContent = now ? '關' : '開';
  };
  window.submitLogin = async function(){
    const username = ($('login-username')?.value || '').trim();
    const password = $('login-password')?.value || '';
    const err = $('login-error');
    if (!username || !password) { if (err) { err.textContent='請輸入帳號與密碼'; err.classList.remove('hidden'); } return; }
    try { await api('/api/login', {method:'POST', body:JSON.stringify({username, password})}); location.href='/'; }
    catch(e){ if (err) { err.textContent=e.message || '登入失敗'; err.classList.remove('hidden'); } else say(e.message || '登入失敗','error'); }
  };
  window.logout = async function(){ try { await api('/api/logout', {method:'POST', body:'{}'}); } catch(_) {} location.href='/login'; };
  window.changePassword = async function(){
    const old_password = $('old-password')?.value || '', new_password = $('new-password')?.value || '', confirm = $('confirm-password')?.value || '';
    const msg = $('settings-msg');
    try {
      if (!old_password || !new_password) throw new Error('請輸入舊密碼與新密碼');
      if (new_password !== confirm) throw new Error('兩次新密碼不一致');
      await api('/api/change_password', {method:'POST', body:JSON.stringify({old_password, new_password})});
      if (msg) { msg.textContent='密碼已更新'; msg.classList.remove('hidden'); }
      ['old-password','new-password','confirm-password'].forEach(id => { if ($(id)) $(id).value=''; });
      say('密碼已更新','ok');
    } catch(e){ if (msg) { msg.textContent=e.message || '修改失敗'; msg.classList.remove('hidden'); } say(e.message || '修改失敗','error'); }
  };
  async function loadCorrections(){
    const box=$('corrections-list'); if (!box) return;
    try { const data=await api('/api/corrections',{method:'GET'}); const items=data.items||[]; box.innerHTML=items.length?items.map(x=>`<div class="chip-item"><span>${esc(x.wrong_text)} → ${esc(x.correct_text)}</span><button class="remove" type="button" data-del-correction="${esc(x.wrong_text)}">刪除</button></div>`).join(''):'<div class="empty-state-card compact-empty">尚無修正詞</div>'; box.querySelectorAll('[data-del-correction]').forEach(b=>b.onclick=async()=>{ await api('/api/corrections',{method:'DELETE',body:JSON.stringify({wrong_text:b.dataset.delCorrection})}); loadCorrections(); }); } catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'載入失敗')}</div>`; }
  }
  window.saveCorrectionItem = async function(){
    try { await api('/api/corrections',{method:'POST',body:JSON.stringify({wrong_text:($('correction-wrong')?.value||'').trim(), correct_text:($('correction-correct')?.value||'').trim()})}); if($('correction-wrong')) $('correction-wrong').value=''; if($('correction-correct')) $('correction-correct').value=''; say('已更新修正詞','ok'); loadCorrections(); } catch(e){ say(e.message||'儲存失敗','error'); }
  };
  async function loadAliases(){
    const box=$('aliases-list'); if (!box) return;
    try { const data=await api('/api/customer-aliases',{method:'GET'}); const items=data.items||[]; box.innerHTML=items.length?items.map(x=>`<div class="chip-item"><span>${esc(x.alias)} → ${esc(x.target_name)}</span><button class="remove" type="button" data-del-alias="${esc(x.alias)}">刪除</button></div>`).join(''):'<div class="empty-state-card compact-empty">尚無客戶別名</div>'; box.querySelectorAll('[data-del-alias]').forEach(b=>b.onclick=async()=>{ await api('/api/customer-aliases',{method:'DELETE',body:JSON.stringify({alias:b.dataset.delAlias})}); loadAliases(); }); } catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'載入失敗')}</div>`; }
  }
  window.saveCustomerAliasItem = async function(){
    try { await api('/api/customer-aliases',{method:'POST',body:JSON.stringify({alias:($('alias-name')?.value||'').trim(), target_name:($('alias-target')?.value||'').trim()})}); if($('alias-name')) $('alias-name').value=''; if($('alias-target')) $('alias-target').value=''; say('已更新客戶別名','ok'); loadAliases(); } catch(e){ say(e.message||'儲存失敗','error'); }
  };
  window.undoLastAction = async function(){
    const ok = window.confirm ? confirm('確定要還原上一筆可還原的操作？') : true; if (!ok) return;
    try { const data=await api('/api/undo-last',{method:'POST',body:'{}'}); const el=$('undo-msg'); if(el) el.textContent=data.message || '已還原上一筆'; say(data.message || '已還原上一筆','ok'); } catch(e){ say(e.message||'還原失敗','error'); }
  };
  window.downloadReport = function(type){
    const params = new URLSearchParams({type:type||'inventory'}); const s=$('report-start')?.value||'', e=$('report-end')?.value||''; if(s)params.set('start_date',s); if(e)params.set('end_date',e); window.open('/api/reports/export?'+params.toString(), '_blank');
  };
  window.loadAuditTrails = async function(){
    const box=$('audit-trails-list'); if(!box) return; box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';
    try { const params=new URLSearchParams(); [['q','audit-q'],['username','audit-user'],['entity_type','audit-entity'],['start_date','audit-start'],['end_date','audit-end']].forEach(([k,id])=>{const v=$(id)?.value||''; if(v)params.set(k,v);}); const data=await api('/api/audit-trails?'+params.toString(),{method:'GET'}); const items=data.items||[]; box.innerHTML=items.length?items.map(x=>`<div class="recent-activity-item inline-activity-card"><strong>${esc(x.created_at||'')}</strong><div>${esc(x.username||'')}｜${esc(x.action_type||'')}｜${esc(x.entity_type||'')}</div><div class="small-note">${esc(x.entity_key||'')}</div></div>`).join(''):'<div class="empty-state-card compact-empty">沒有差異紀錄</div>'; } catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'載入失敗')}</div>`; }
  };
  window.loadAdminUsers = async function(){
    const box=$('admin-users'); if(!box) return;
    try { const data=await api('/api/admin/users',{method:'GET'}); const items=data.items||[]; box.innerHTML=items.map(u=>`<div class="table-row"><span>${esc(u.username||'')}</span><span>${esc(u.role||'')}</span><button class="ghost-btn tiny-btn" type="button" data-admin-user="${esc(u.username||'')}" data-block="${Number(u.is_blocked||0)?0:1}">${Number(u.is_blocked||0)?'解除黑名單':'加入黑名單'}</button></div>`).join('') || '<div class="empty-state-card compact-empty">尚無帳號</div>'; box.querySelectorAll('[data-admin-user]').forEach(b=>b.onclick=async()=>{ await api('/api/admin/block',{method:'POST',body:JSON.stringify({username:b.dataset.adminUser, blocked:b.dataset.block==='1'})}); loadAdminUsers(); }); } catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'載入失敗')}</div>`; }
  };
  window.loadBackups = async function(){
    const box=$('backup-panel'), status=$('system-status-panel');
    try { const data=await api('/api/backups',{method:'GET'}); const files=data.files||[]; if(status) status.innerHTML=`<div class="card"><div class="title">目前版本</div><div class="sub">${VERSION}</div></div><div class="card"><div class="title">備份數量</div><div class="sub">${files.length}</div></div>`; if(box) box.innerHTML=files.length?files.map(f=>`<div class="table-row"><span>${esc(f.filename)}</span><span>${esc(f.created_at||'')}</span><a class="ghost-btn tiny-btn" href="/api/backups/download/${encodeURIComponent(f.filename)}" target="_blank">下載</a><button class="ghost-btn tiny-btn" type="button" data-restore-backup="${esc(f.filename)}">還原</button></div>`).join(''):'<div class="empty-state-card compact-empty">尚無備份</div>'; box?.querySelectorAll('[data-restore-backup]').forEach(b=>b.onclick=async()=>{ if(!confirm('確定還原這份備份？'))return; await api('/api/backups/restore',{method:'POST',body:JSON.stringify({filename:b.dataset.restoreBackup})}); say('已還原備份','ok'); }); } catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'載入失敗')}</div>`; }
  };
  window.createBackup = async function(){ try { await api('/api/backup',{method:'POST',body:'{}'}); say('備份已建立','ok'); loadBackups(); } catch(e){ say(e.message||'備份失敗','error'); } };

  // ---------- 庫存 ----------
  function ensureInventoryPanel(){
    if (!isInventory()) return null;
    let panel = $('inventory-inline-panel') || document.querySelector('.inventory-inline-panel');
    if (!panel) {
      panel = document.createElement('div'); panel.id='inventory-inline-panel'; panel.className='result-card inventory-inline-panel';
      panel.innerHTML='<div class="section-head inventory-inline-head"><h3>庫存清單</h3><span class="muted">送出完成後會直接顯示在這裡，可點開編輯或移到訂單 / 總單</span></div><div id="inventory-inline-list" class="card-list inventory-inline-list"></div>';
      ($('module-result') || $('ocr-text')?.closest('.glass') || document.querySelector('.module-screen'))?.insertAdjacentElement('afterend', panel);
    }
    document.querySelectorAll('.inventory-inline-panel').forEach(p=>{ if(p!==panel)p.remove(); });
    panel.classList.remove('hidden'); panel.style.display='';
    if (!$('inventory-inline-list')) { const list=document.createElement('div'); list.id='inventory-inline-list'; list.className='card-list inventory-inline-list'; panel.appendChild(list); }
    if ($('inventory-summary-section')) $('inventory-summary-section').style.display='none';
    return panel;
  }
  function renderInventoryRows(rows){
    ensureInventoryPanel(); const box=$('inventory-inline-list'); if(!box) return;
    if(!rows.length){ box.innerHTML='<div class="empty-state-card compact-empty">目前沒有庫存資料</div>'; return; }
    box.innerHTML=rows.map(r=>{ const id=Number(r.id||0), qty=Number(r.qty||0), un=Number(r.unplaced_qty||0); return `<div class="card inventory-action-card ${un>0?'inventory-unplaced-card':''}" data-inventory-id="${id}"><div class="title">${esc(r.product_text||'')}</div><div class="sub">數量：${qty}${r.location?`｜格位：${esc(r.location)}`:''}${r.customer_name?`｜客戶：${esc(r.customer_name)}`:''}</div>${un>0?`<div class="small-note danger-text">未錄入倉庫圖：${un}</div>`:''}<div class="btn-row compact-row"><button class="ghost-btn tiny-btn" data-inv-edit="${id}">編輯</button><button class="ghost-btn tiny-btn" data-inv-move="orders" data-id="${id}">移到訂單</button><button class="ghost-btn tiny-btn" data-inv-move="master_order" data-id="${id}">移到總單</button><button class="ghost-btn tiny-btn danger-btn" data-inv-del="${id}">刪除</button></div></div>`; }).join('');
    box.querySelectorAll('[data-inv-edit]').forEach(b=>b.onclick=()=>editInventoryItem(rows.find(r=>Number(r.id)===Number(b.dataset.invEdit))));
    box.querySelectorAll('[data-inv-move]').forEach(b=>b.onclick=()=>moveInventoryItem(Number(b.dataset.id), b.dataset.invMove));
    box.querySelectorAll('[data-inv-del]').forEach(b=>b.onclick=()=>deleteInventoryItem(Number(b.dataset.invDel)));
  }
  window.loadInventory = async function(){
    if (!isInventory()) return;
    ensureInventoryPanel(); const box=$('inventory-inline-list'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';
    try { const data=await api('/api/inventory?ts='+Date.now(),{method:'GET'}); renderInventoryRows(Array.isArray(data.items)?data.items:[]); } catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'庫存載入失敗')}</div>`; }
  };
  async function editInventoryItem(row){
    if(!row) return; const product=prompt('商品資料', row.product_text||''); if(product===null)return; const qtyRaw=prompt('數量', String(row.qty||0)); if(qtyRaw===null)return; const location=prompt('格位 / 位置', row.location||''); if(location===null)return;
    try { await api(`/api/inventory/${row.id}`,{method:'PUT',body:JSON.stringify({product_text:product.trim(), product_code:product.trim(), qty:Math.max(0,parseInt(qtyRaw,10)||0), location:location.trim(), customer_name:row.customer_name||''})}); say('庫存已更新','ok'); await window.loadInventory(); } catch(e){ say(e.message||'編輯失敗','error'); }
  }
  async function deleteInventoryItem(id){ if(!id)return; if(!confirm('確定刪除這筆庫存？'))return; try{ await api(`/api/inventory/${id}`,{method:'DELETE'}); say('已刪除','ok'); await window.loadInventory(); }catch(e){ say(e.message||'刪除失敗','error'); } }
  async function moveInventoryItem(id, target){
    if(!id)return; const customer=(prompt('請輸入或貼上客戶名稱')||'').trim(); if(!customer)return say('請選擇客戶','warn'); const qtyRaw=prompt('要移動的數量（留空代表全部）','');
    const body={target, customer_name:customer}; if(qtyRaw && qtyRaw.trim()) body.qty=Math.max(1, parseInt(qtyRaw,10)||1);
    try { await api(`/api/inventory/${id}/move`,{method:'POST',body:JSON.stringify(body)}); say(target==='orders'?'已移到訂單':'已移到總單','ok'); await window.loadInventory(); } catch(e){ say(e.message||'移動失敗','error'); }
  }
  function parseTextItems(){
    if (typeof window.parseTextareaItems === 'function') {
      try { const items=window.parseTextareaItems(); if(Array.isArray(items)&&items.length)return items; } catch(_) {}
    }
    const text=$('ocr-text')?.value||''; const rows=[]; let prev=null;
    text.split(/\n+/).forEach(raw=>{ let line=raw.replace(/[×X＊*]/g,'x').replace('＝','=').replace(/\s+/g,'').trim(); if(!line)return; if(!line.includes('=')&&prev){ const nums=line.match(/\d+/g)||[]; if(nums.length){ line=`${prev}=${nums[0]}${nums[1]?`x${nums[1]}`:''}`; } } if(!line.includes('='))return; const [left,right]=line.split('=',2); const dims=(left.match(/\d+/g)||[]).slice(0,3); if(dims.length>=3)prev=dims.map(n=>String(parseInt(n,10))).join('x'); const nums=right.match(/\d+/g)||[]; if(prev&&nums.length){ rows.push({product_text:`${prev}=${parseInt(nums[0],10)}`,product_code:`${prev}=${parseInt(nums[0],10)}`,qty:Math.max(1,parseInt(nums[1]||'1',10)||1)}); } });
    return rows;
  }
  const previousConfirmSubmit = window.confirmSubmit;
  window.confirmSubmit = async function(){
    if (!isInventory()) return previousConfirmSubmit ? previousConfirmSubmit.apply(this, arguments) : undefined;
    const btn=$('submit-btn'), result=$('module-result');
    const items=parseTextItems();
    if(!items.length){ say('請輸入商品資料','warn'); return; }
    try{
      if(btn){btn.disabled=true;btn.textContent='送出中…';}
      const data=await api('/api/inventory',{method:'POST',body:JSON.stringify({items, ocr_text:$('ocr-text')?.value||'', location:($('location-input')?.value||'').trim(), request_key:`inventory-${Date.now()}-${Math.random().toString(36).slice(2)}`})});
      if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<div class="section-title">送出完成</div><div class="muted">已建立 ${items.length} 筆庫存資料，已顯示在下方庫存清單。</div>`; }
      if($('ocr-text')) $('ocr-text').value='';
      renderInventoryRows(Array.isArray(data.items)?data.items:[]);
      say('庫存已送出','ok');
    }catch(e){ if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<div class="section-title">送出失敗</div><div class="muted">${esc(e.message||'建立失敗')}</div>`;} say(e.message||'建立失敗','error'); }
    finally{ if(btn){btn.disabled=false;btn.textContent='確認送出';} }
  };

  // ---------- 出貨已選商品 ----------
  function shipItems(){ return normalizeItems(parseTextItems()); }
  window.clearShipSelectedItems = function(){ if($('ocr-text')) $('ocr-text').value=''; if(window.renderShipSelectedItems) window.renderShipSelectedItems(); if(window.loadShipPreview) window.loadShipPreview(); };
  window.moveShipItem = function(index, delta){ const items=shipItems(); const ni=index+delta; if(ni<0||ni>=items.length)return; [items[index],items[ni]]=[items[ni],items[index]]; if($('ocr-text')) $('ocr-text').value=items.map(it=>`${it.product_text}${Number(it.qty||1)>1?'x'+it.qty:''}`).join('\n'); window.loadShipPreview?.(); };
  window.removeShipItemAt = function(index){ const items=shipItems(); items.splice(index,1); if($('ocr-text')) $('ocr-text').value=items.map(it=>`${it.product_text}${Number(it.qty||1)>1?'x'+it.qty:''}`).join('\n'); window.loadShipPreview?.(); };

  // ---------- 今日異動 ----------
  function todayReadClass(created, readAt){ return readAt && created && created <= readAt ? 'is-read' : ''; }
  function todayCard(x, kind, readAt){ const id=Number(x.id||0); return `<div class="recent-activity-item inline-activity-card ${todayReadClass(x.created_at||'',readAt)}" data-kind="${kind}" data-log-id="${id}"><strong>${esc((x.created_at||'').slice(5,16))}</strong><div>${esc(x.username||'')}｜${esc(x.action||x.message||'')}</div>${id?`<div class="btn-row compact-row" style="justify-content:flex-end;margin-top:8px"><button class="ghost-btn tiny-btn danger-btn" type="button" onclick="deleteTodayChange(${id})">刪除</button></div>`:''}</div>`; }
  function unplacedCard(x, readAt){ return `<div class="recent-activity-item inline-activity-card ${readAt?'is-read':''}" data-kind="unplaced"><strong>${esc(x.qty||0)}</strong><div>${esc(x.product_text||x.message||'')}</div>${x.customer_name?`<div class="small-note">客戶：${esc(x.customer_name)}</div>`:''}</div>`; }
  window.setTodayCategoryFilter = function(kind='all'){
    window.__todayFilter=kind; document.querySelectorAll('[data-today-filter]').forEach(b=>b.classList.toggle('active',(b.dataset.todayFilter||'all')===kind)); document.querySelectorAll('[data-today-filter-card]').forEach(b=>b.classList.toggle('active',(b.dataset.todayFilterCard||'all')===kind));
    document.querySelectorAll('[data-today-panel]').forEach(p=>p.classList.toggle('hidden-by-filter',kind!=='all'&&p.dataset.todayPanel!==kind));
    applyTodayUnread();
  };
  function bindToday(){ document.querySelectorAll('[data-today-filter]').forEach(b=>b.onclick=()=>window.setTodayCategoryFilter(b.dataset.todayFilter||'all')); document.querySelectorAll('[data-today-filter-card]').forEach(b=>b.onclick=()=>window.setTodayCategoryFilter(b.dataset.todayFilterCard||'all')); if($('today-unread-toggle')) $('today-unread-toggle').onclick=()=>{window.__todayUnreadOnly=!window.__todayUnreadOnly; applyTodayUnread();}; if($('today-clear-read-btn')) $('today-clear-read-btn').onclick=window.markTodayChangesRead; }
  function applyTodayUnread(){ const on=!!window.__todayUnreadOnly; $('today-unread-toggle')?.classList.toggle('active',on); document.querySelectorAll('.inline-activity-card').forEach(el=>{el.style.display=(!on||!el.classList.contains('is-read'))?'':'none';}); }
  window.renderTodayChangesPage = async function(){
    if(!isToday()||!$('today-summary-cards'))return;
    try{ const data=await api('/api/today-changes?ts='+Date.now(),{method:'GET'}); const s=data.summary||{}, feed=data.feed||{}, readAt=data.read_at||''; if($('today-unread-badge')) $('today-unread-badge').textContent=String(s.unread_count||0); const cards=[['inbound','進貨',s.inbound_count||0],['outbound','出貨',s.outbound_count||0],['orders','新增訂單',s.new_order_count||0],['unplaced','未錄入倉庫圖',s.unplaced_count||0]]; $('today-summary-cards').innerHTML=cards.map(([k,l,v])=>`<button class="card" type="button" data-today-filter-card="${k}"><div class="title">${l}</div><div class="sub">${v}</div></button>`).join(''); const set=(id,html,empty)=>{const el=$(id); if(el)el.innerHTML=html||`<div class="empty-state-card compact-empty">${empty}</div>`;}; set('today-inbound-list',(feed.inbound||[]).map(x=>todayCard(x,'inbound',readAt)).join(''),'今天沒有進貨異動'); set('today-outbound-list',(feed.outbound||[]).map(x=>todayCard(x,'outbound',readAt)).join(''),'今天沒有出貨異動'); set('today-order-list',(feed.new_orders||[]).map(x=>todayCard(x,'orders',readAt)).join(''),'今天沒有新增訂單'); set('today-unplaced-list',(data.unplaced_items||[]).map(x=>unplacedCard(x,readAt)).join(''),'今天沒有未錄入倉庫圖商品'); bindToday(); window.setTodayCategoryFilter(window.__todayFilter||'all'); hardCleanBadText(); }catch(e){ if($('today-summary-cards')) $('today-summary-cards').innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; }
  };
  window.markTodayChangesRead = async function(){ try{ await api('/api/today-changes/read',{method:'POST',body:'{}'}); if($('today-unread-badge')) $('today-unread-badge').textContent='0'; say('已清除已讀','ok'); await window.renderTodayChangesPage(); }catch(e){ say(e.message||'清除失敗','error'); } };
  window.deleteTodayChange = async function(id){ if(!id)return; if(!confirm('確定刪除這筆異動？'))return; try{ await api(`/api/today-changes/${id}`,{method:'DELETE'}); say('已刪除','ok'); await window.renderTodayChangesPage(); }catch(e){ say(e.message||'刪除失敗','error'); } };

  // ---------- 倉庫 ----------
  function wState(){ state.warehouse=state.warehouse||{cells:[],zones:{A:{},B:{}},availableItems:[],activeZone:localStorage.getItem('warehouseActiveZone')||'A'}; state.searchHighlightKeys=state.searchHighlightKeys||new Set(); return state.warehouse; }
  function cellItems(cell){ try{return normalizeItems(typeof cell?.items_json==='string'?JSON.parse(cell.items_json||'[]'):(cell?.items_json||[]));}catch(_){return [];} }
  function cells(){ return Array.isArray(wState().cells)?wState().cells:[]; }
  function getCell(zone,col,num){ return cells().find(c=>String(c.zone)===String(zone)&&Number(c.column_index)===Number(col)&&Number(c.slot_number)===Number(num)); }
  function getItems(zone,col,num){ return cellItems(getCell(zone,col,num)); }
  function getNote(zone,col,num){ return getCell(zone,col,num)?.note || ''; }
  function maxSlot(zone,col){ return Math.max(20, ...cells().filter(c=>String(c.zone)===String(zone)&&Number(c.column_index)===Number(col)).map(c=>Number(c.slot_number||0)).filter(Boolean)); }
  function parseSlotText(input){ const raw=String(input||'').trim().toUpperCase(); let m=raw.match(/^([AB])\s*[-_\s]?\s*(\d)\s*[-_\s]?\s*(\d{1,3})$/); if(!m)m=raw.match(/^([AB])[^0-9]*(\d{1,2})[^0-9]+(\d{1,3})$/); return m?{zone:m[1], column:Number(m[2]), slot:Number(m[3])}:null; }
  function currentCell(){ const c=state.currentCell||{}; return {zone:String(c.zone||'A').toUpperCase(), column_index:Number(c.column_index||c.column||0), slot_type:'direct', slot_number:Number(c.slot_number||0)}; }
  function findUnplacedPanel(){ let p=$('warehouse-unplaced-bottom-panel'); if(!p){ p=document.createElement('div'); p.id='warehouse-unplaced-bottom-panel'; p.className='glass panel warehouse-unplaced-bottom-panel'; (document.querySelector('.warehouse-zone-wrap')||$('warehouse-section'))?.insertAdjacentElement('afterend',p); } return p; }
  function readCardQty(card,max){ const v=parseInt(card.querySelector('[data-unplaced-qty-input]')?.value||'1',10)||1; return Math.max(1,Math.min(max||1,v)); }
  function renderUnplacedPanel(){
    if(!isWarehouse())return; const w=wState(), panel=findUnplacedPanel(); let items=Array.isArray(w.availableItems)?w.availableItems:[]; const q=($('warehouse-unplaced-search')?.value||'').trim().toLowerCase(); if(q) items=items.filter(it=>`${it.product_text||''} ${it.customer_name||''} ${sourceText(it)}`.toLowerCase().includes(q)); const rawTotal=(w.availableItems||[]).reduce((sum,it)=>sum+qtyOf(it),0); if($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent=`尚未入倉庫：${(w.availableItems||[]).length} 種 / ${rawTotal} 件`;
    panel.innerHTML=`<div class="section-head warehouse-unplaced-head"><div><h3>尚未入倉庫的商品</h3><span class="muted">來源包含庫存 / 訂單 / 總單；相同尺寸與同客戶已合併。先選數量，再拖拉到上方格子。</span></div><span class="pill warn">${(w.availableItems||[]).length} 種 / ${rawTotal} 件</span></div><input id="warehouse-unplaced-search" class="text-input" placeholder="搜尋尚未入倉商品 / 客戶" value="${esc(q)}"><div id="warehouse-unplaced-bottom-list" class="warehouse-unplaced-bottom-list"></div>`;
    const search=$('warehouse-unplaced-search'); if(search){ search.oninput=renderUnplacedPanel; if(q)setTimeout(()=>{const el=$('warehouse-unplaced-search'); if(el){el.focus();el.setSelectionRange?.(el.value.length,el.value.length);}},0); }
    const list=$('warehouse-unplaced-bottom-list'); if(!items.length){list.innerHTML='<div class="empty-state-card compact-empty">目前沒有尚未入倉庫的商品</div>';return;}
    items.forEach((it,idx)=>{ const max=qtyOf(it), customer=String(it.customer_name||'').trim(); const card=document.createElement('div'); card.className='warehouse-unplaced-card'; card.draggable=true; card.dataset.unplacedIndex=String(idx); card.innerHTML=`<div class="unplaced-main-row"><div class="unplaced-title">${esc(it.product_text||it.product_size||'')}</div><div class="unplaced-qty">未入倉 ${max}</div></div><div class="small-note">客戶：${esc(customer||'未指定客戶')}｜來源：${esc(sourceText(it))}</div><div class="unplaced-control-row"><label class="field-label compact-label">加入數量</label><input class="text-input unplaced-qty-input" data-unplaced-qty-input type="number" min="1" max="${max}" value="1"><button class="ghost-btn tiny-btn" type="button" data-manual-place="${idx}">手動輸入格位</button></div>`; const payload=()=>({kind:'unplaced-item',product_text:it.product_text||it.product_size||'',customer_name:customer,qty:readCardQty(card,max),source_summary:sourceText(it),max_qty:max,unplaced_qty:max,source:'unplaced'}); card.addEventListener('dragstart',ev=>{ev.dataTransfer.effectAllowed='copy';ev.dataTransfer.setData('text/plain',JSON.stringify(payload())); card.classList.add('is-dragging');}); card.addEventListener('dragend',()=>card.classList.remove('is-dragging')); card.querySelector('[data-manual-place]').onclick=async()=>{ const ans=prompt('輸入要加入的格位，例如 A-1-05、A105、B-3-12'); if(!ans)return; const p=parseSlotText(ans); if(!p)return say('格位格式不正確','warn'); await addUnplacedToCell(payload(),p.zone,p.column,p.slot); }; list.appendChild(card); });
  }
  function slotItemHtml(it,idx){ return `<div class="slot-mini-item" draggable="true" data-witem-index="${idx}"><div class="slot-line customer">客戶：${esc(it.customer_name||'未指定客戶')}</div><div class="slot-line product">商品：${esc(it.product_text||'')}</div><div class="slot-line qty">數量：${Number(it.qty||0)}</div></div>`; }
  function renderWarehouseGrid(){
    if(!isWarehouse())return; ['A','B'].forEach(zone=>{ const wrap=$(`zone-${zone}-grid`); if(!wrap)return; wrap.className='zone-grid six-grid vertical-card-grid'; wrap.innerHTML=''; [1,2,3,4,5,6].forEach(colNo=>{ const total=maxSlot(zone,colNo); const col=document.createElement('div'); col.className='vertical-column-card intuitive-column'; col.innerHTML=`<div class="column-head-row"><div class="column-head">${zone} 區第 ${colNo} 欄</div><div class="small-note">${total} 格</div></div><div class="btn-row compact warehouse-col-tools"><button class="ghost-btn small-btn warehouse-mini-btn" type="button" data-add-slot="${zone}|${colNo}">＋</button><button class="ghost-btn small-btn warehouse-mini-btn" type="button" data-remove-slot="${zone}|${colNo}">－</button></div>`; const list=document.createElement('div'); list.className='vertical-slot-list'; for(let n=1;n<=total;n++){ const items=getItems(zone,colNo,n), key=`${zone}|${colNo}|direct|${n}`, highlighted=!!(state.searchHighlightKeys&&state.searchHighlightKeys.has(key)); const slot=document.createElement('div'); slot.className=`vertical-slot ${items.length?'filled':''} ${highlighted?'highlight':''}`; slot.dataset.zone=zone; slot.dataset.column=String(colNo); slot.dataset.num=String(n); slot.innerHTML=`<div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div><div class="slot-count">${items.length?items.map(slotItemHtml).join(''):'<div class="slot-line empty">空格</div>'}</div>`; slot.onclick=(ev)=>{ if(ev.target.closest('[data-witem-index]'))return; window.showWarehouseDetail(zone,colNo,n,items); window.openWarehouseModal(zone,colNo,n); }; slot.querySelectorAll('[data-witem-index]').forEach(el=>el.addEventListener('dragstart',ev=>{ ev.stopPropagation(); const item=items[Number(el.dataset.witemIndex||0)]||{}; ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',JSON.stringify({kind:'warehouse-item',fromKey:[zone,colNo,'direct',n],product_text:item.product_text||'',customer_name:item.customer_name||'',qty:Number(item.qty||1)})); })); slot.addEventListener('dragover',ev=>{ev.preventDefault();slot.classList.add('drag-over');}); slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over')); slot.addEventListener('drop',async ev=>{ ev.preventDefault(); ev.stopPropagation(); slot.classList.remove('drag-over'); let p=null; try{p=JSON.parse(ev.dataTransfer.getData('text/plain')||'{}');}catch(_){} if(!p)return; if(p.kind==='unplaced-item') await addUnplacedToCell(p,zone,colNo,n); else if(p.kind==='warehouse-item') await window.moveWarehouseItem(p.fromKey,[zone,colNo,'direct',n],p.product_text,Number(p.qty||1),p.customer_name||''); }); list.appendChild(slot); } col.appendChild(list); wrap.appendChild(col); }); }); document.querySelectorAll('[data-add-slot]').forEach(b=>b.onclick=()=>{const [z,c]=b.dataset.addSlot.split('|'); window.addWarehouseVisualSlot(z,Number(c));}); document.querySelectorAll('[data-remove-slot]').forEach(b=>b.onclick=()=>{const [z,c]=b.dataset.removeSlot.split('|'); window.removeWarehouseVisualSlot(z,Number(c));}); }
  window.renderWarehouse = async function(){
    if(!isWarehouse())return; try{ const [wh,av]=await Promise.allSettled([api('/api/warehouse?ts='+Date.now(),{method:'GET'}),api('/api/warehouse/available-items?ts='+Date.now(),{method:'GET'})]); const w=wState(); if(wh.status==='fulfilled'){w.cells=Array.isArray(wh.value.cells)?wh.value.cells:[]; w.zones=wh.value.zones||{A:{},B:{}};} if(av.status==='fulfilled')w.availableItems=Array.isArray(av.value.items)?av.value.items:[]; renderWarehouseGrid(); renderUnplacedPanel(); window.setWarehouseZone(w.activeZone||localStorage.getItem('warehouseActiveZone')||'A',false); } catch(e){ say(e.message||'倉庫圖載入失敗','error'); renderWarehouseGrid(); renderUnplacedPanel(); }
  };
  window.setWarehouseZone = function(zone='A',save=true){ const z=['A','B','ALL'].includes(zone)?zone:'A'; wState().activeZone=z; if(save!==false)try{localStorage.setItem('warehouseActiveZone',z);}catch(_){} ['A','B'].forEach(x=>{const el=$(`zone-${x}`); if(el)el.style.display=(z==='ALL'||z===x)?'':'none';}); document.querySelectorAll('.zone-switch').forEach(b=>b.classList.toggle('active',b.id===`zone-switch-${z}`)); if($('warehouse-selection-pill'))$('warehouse-selection-pill').textContent=`目前區域：${z==='ALL'?'全部':z+' 區'}`; };
  window.addWarehouseVisualSlot = async function(zone,column){ const cur=maxSlot(zone,column); const ans=prompt(`要在 ${zone} 區第 ${column} 欄的第幾格後面新增？\n輸入 5 會新增在第 6 格；輸入 0 會新增在最前面。`,String(cur)); if(ans===null)return; let n=parseInt(ans,10); if(Number.isNaN(n))n=cur; n=Math.max(0,Math.min(cur,n)); try{const data=await api('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone,column_index:column,insert_after:n})}); wState().cells=Array.isArray(data.cells)?data.cells:wState().cells; await window.renderWarehouse(); window.highlightWarehouseCell?.(zone,column,Number(data.slot_number||n+1)); say('已新增指定位置格子','ok');}catch(e){say(e.message||'新增失敗','error');} };
  window.removeWarehouseVisualSlot = async function(zone,column){ const cur=maxSlot(zone,column); if(cur<=20)return say('每欄至少保留 20 格','warn'); const ans=prompt(`要刪除 ${zone} 區第 ${column} 欄的第幾格？`,String(cur)); if(ans===null)return; const n=parseInt(ans,10); if(!n||n<1||n>cur)return say('格號不正確','warn'); if(getItems(zone,column,n).length)return say('這一格有商品，請先移走','warn'); if(!confirm(`確定刪除第 ${n} 格？`))return; try{const data=await api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone,column_index:column,slot_number:n})}); wState().cells=Array.isArray(data.cells)?data.cells:wState().cells; await window.renderWarehouse(); say('已刪除空白格','ok');}catch(e){say(e.message||'刪除失敗','error');} };
  async function addUnplacedToCell(payload,zone,column,slotNumber){ const max=maxSlot(zone,column); if(column<1||column>6||slotNumber<1||slotNumber>max)return say('這個格位不存在，請先用＋新增格子','warn'); const qty=Math.min(Math.max(1,parseInt(payload.qty||'1',10)||1),Math.max(1,Number(payload.max_qty||payload.unplaced_qty||payload.qty||1)||1)); const product=String(payload.product_text||'').trim(); if(!product)return say('商品資料不可空白','warn'); const current=getItems(zone,column,slotNumber); const incoming={product_text:product,product_code:product,customer_name:String(payload.customer_name||'').trim(),qty,source_summary:payload.source_summary||'',source:'unplaced'}; const items=normalizeItems([...current,incoming]); try{ await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:column,slot_type:'direct',slot_number:slotNumber,items,note:getNote(zone,column,slotNumber)})}); say(`已加入 ${zone}-${column}-${String(slotNumber).padStart(2,'0')}`,'ok'); await window.renderWarehouse(); if(isInventory()) window.loadInventory?.(); }catch(e){ say(e.message||'加入格位失敗','error'); } }
  window.moveWarehouseItem = async function(fromKey,toKey,productText,qty,customerName=''){ if(!Array.isArray(fromKey)||!Array.isArray(toKey))return say('格位資料錯誤','warn'); const fs=Number(fromKey.length>=4?fromKey[3]:fromKey[2]), ts=Number(toKey.length>=4?toKey[3]:toKey[2]); if(String(fromKey[0])===String(toKey[0])&&Number(fromKey[1])===Number(toKey[1])&&fs===ts)return say('已在同一格，不需要搬移','warn'); try{ const data=await api('/api/warehouse/move',{method:'POST',body:JSON.stringify({from_key:fromKey,to_key:toKey,product_text:productText,qty:Number(qty||1),customer_name:customerName||''})}); if(data.noop)return say('已在同一格，不需要搬移','warn'); say('搬移完成','ok'); await window.renderWarehouse(); window.highlightWarehouseCell?.(toKey[0],toKey[1],ts); }catch(e){ say(e.message||'搬移失敗','error'); } };
  window.openWarehouseModal = async function(zone,column,num){ wState(); state.currentCell={zone,column,column_index:column,slot_type:'direct',slot_number:num}; state.currentCellItems=getItems(zone,column,num).map(x=>({...x})); $('warehouse-modal')?.classList.remove('hidden'); if($('warehouse-modal-meta'))$('warehouse-modal-meta').textContent=`${zone} 區 / 第 ${column} 欄 / 第 ${String(num).padStart(2,'0')} 格`; if($('warehouse-note'))$('warehouse-note').value=getNote(zone,column,num); window.renderWarehouseCellItems(); refreshWarehouseSelect(); if($('warehouse-item-search'))$('warehouse-item-search').oninput=refreshWarehouseSelect; };
  window.closeWarehouseModal = function(){ $('warehouse-modal')?.classList.add('hidden'); };
  function refreshWarehouseSelect(){ const sel=$('warehouse-item-select'); if(!sel)return; const q=($('warehouse-item-search')?.value||'').trim().toLowerCase(); const items=(wState().availableItems||[]).filter(it=>!q||`${it.product_text||''} ${it.customer_name||''} ${sourceText(it)}`.toLowerCase().includes(q)); sel.innerHTML=items.length?items.map(it=>`<option value="${esc(JSON.stringify(it))}">${esc(it.product_text||'')}｜${esc(it.customer_name||'未指定客戶')}｜剩餘 ${qtyOf(it)}｜${esc(sourceText(it))}</option>`).join(''):'<option value="">沒有可加入的商品</option>'; }
  window.renderWarehouseCellItems = function(){ const box=$('warehouse-cell-items'); if(!box)return; const items=normalizeItems(state.currentCellItems||[]); state.currentCellItems=items; if(!items.length){box.innerHTML='<div class="empty-state-card compact-empty">此格目前沒有商品</div>';return;} box.innerHTML=''; items.forEach((it,idx)=>{ const chip=document.createElement('div'); chip.className='chip-item'; chip.draggable=true; chip.innerHTML=`<span>${esc(it.product_text||'')} × ${Number(it.qty||0)} ｜ ${esc(it.customer_name||'未指定客戶')}</span><div class="btn-row compact-row"><button class="ghost-btn tiny-btn" type="button" data-edit-cell-item="${idx}">編輯</button><button class="remove" type="button" data-remove-cell-item="${idx}">刪除</button></div>`; chip.addEventListener('dragstart',ev=>{const c=currentCell();ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',JSON.stringify({kind:'warehouse-item',fromKey:[c.zone,c.column_index,'direct',c.slot_number],product_text:it.product_text||'',customer_name:it.customer_name||'',qty:Number(it.qty||1)}));}); box.appendChild(chip); }); box.querySelectorAll('[data-edit-cell-item]').forEach(b=>b.onclick=()=>{ const idx=Number(b.dataset.editCellItem), it=items[idx]; const txt=prompt('修改商品資料',it.product_text||''); if(txt===null)return; const q=prompt('修改數量',String(it.qty||0)); if(q===null)return; items[idx]={...it,product_text:txt.trim(),product_code:txt.trim(),qty:Math.max(0,parseInt(q,10)||0)}; state.currentCellItems=normalizeItems(items); window.renderWarehouseCellItems(); }); box.querySelectorAll('[data-remove-cell-item]').forEach(b=>b.onclick=()=>{items.splice(Number(b.dataset.removeCellItem),1); state.currentCellItems=normalizeItems(items); window.renderWarehouseCellItems();}); };
  window.addSelectedItemToCell = function(){ const sel=$('warehouse-item-select'); if(!sel||!sel.value)return say('沒有可加入的商品','warn'); let item=null; try{item=JSON.parse(sel.value);}catch(_){} if(!item)return say('沒有可加入的商品','warn'); const max=Math.max(1,qtyOf(item)||1); let qty=Math.max(1,parseInt($('warehouse-add-qty')?.value||'1',10)||1); qty=Math.min(qty,max); state.currentCellItems=normalizeItems([...(state.currentCellItems||[]),{product_text:item.product_text||item.product_size||'',product_code:item.product_code||item.product_text||item.product_size||'',customer_name:item.customer_name||'',qty,source_summary:item.source_summary||sourceText(item),source:'unplaced'}]); window.renderWarehouseCellItems(); say('已加入暫存，請按儲存格位','ok'); };
  window.saveWarehouseCell = async function(){ const c=currentCell(); if(!c.zone||!c.column_index||!c.slot_number)return say('格位參數錯誤','error'); try{ await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({...c,items:normalizeItems(state.currentCellItems||[]),note:$('warehouse-note')?.value||''})}); say('格位已儲存','ok'); window.closeWarehouseModal(); await window.renderWarehouse(); }catch(e){ say(e.message||'格位儲存失敗','error'); } };
  window.showWarehouseDetail = function(zone,column,num,items){ const panel=$('warehouse-detail-panel'); if(!panel)return; panel.classList.remove('hidden'); panel.innerHTML=`<div class="section-title">${zone} 區第 ${column} 欄第 ${String(num).padStart(2,'0')} 格</div>${(items||[]).length?items.map(it=>`<div class="recent-activity-item inline-activity-card"><strong>${esc(it.customer_name||'未指定客戶')}</strong><div>${esc(it.product_text||'')} × ${Number(it.qty||0)}</div></div>`).join(''):'<div class="empty-state-card compact-empty">空格</div>'}`; };
  window.highlightWarehouseCell = function(zone,column,num){ state.searchHighlightKeys=new Set([`${zone}|${Number(column)}|direct|${Number(num)}`]); renderWarehouseGrid(); window.setWarehouseZone(zone,false); };
  window.clearWarehouseHighlights = function(){ state.searchHighlightKeys=new Set(); renderWarehouseGrid(); };
  window.searchWarehouse = function(){ const q=($('warehouse-search')?.value||'').trim().toLowerCase(); if(!q){window.clearWarehouseHighlights();return;} const keys=new Set(); cells().forEach(c=>{ const hay=`${c.zone}-${c.column_index}-${c.slot_number} ${getItems(c.zone,c.column_index,c.slot_number).map(it=>`${it.product_text} ${it.customer_name}`).join(' ')}`.toLowerCase(); if(hay.includes(q))keys.add(`${c.zone}|${c.column_index}|direct|${c.slot_number}`); }); state.searchHighlightKeys=keys; renderWarehouseGrid(); if($('warehouse-search-results')){ $('warehouse-search-results').classList.remove('hidden'); $('warehouse-search-results').innerHTML=`<div class="small-note">找到 ${keys.size} 個格位</div>`;} };
  window.highlightWarehouseSameCustomer = function(){ const q=($('warehouse-search')?.value||'').trim(); if(!q)return say('請先輸入客戶名稱','warn'); const keys=new Set(); cells().forEach(c=>{ if(getItems(c.zone,c.column_index,c.slot_number).some(it=>String(it.customer_name||'').includes(q)))keys.add(`${c.zone}|${c.column_index}|direct|${c.slot_number}`); }); state.searchHighlightKeys=keys; renderWarehouseGrid(); };
  window.toggleWarehouseUnplacedHighlight = function(){ const targets=new Set((wState().availableItems||[]).map(it=>`${sizeKey(it.product_text||it.product_size||'')}||${String(it.customer_name||'').trim()}`)); const keys=new Set(); cells().forEach(c=>{ if(getItems(c.zone,c.column_index,c.slot_number).some(it=>targets.has(`${sizeKey(it.product_text||'')}||${String(it.customer_name||'').trim()}`))) keys.add(`${c.zone}|${c.column_index}|direct|${c.slot_number}`); }); state.searchHighlightKeys=keys; renderWarehouseGrid(); };

  document.addEventListener('DOMContentLoaded',()=>{
    noOldCache(); hardCleanBadText();
    ['login-username','login-password'].forEach(id=>$(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')window.submitLogin();}));
    if($('remember-label')) $('remember-label').textContent = localStorage.getItem('yx_remember_login')==='0' ? '關' : '開';
    loadCorrections(); loadAliases(); if($('audit-trails-list')) window.loadAuditTrails(); if($('admin-users')) window.loadAdminUsers(); if($('backup-panel')||$('system-status-panel')) window.loadBackups();
    if(isInventory()){ ensureInventoryPanel(); setTimeout(window.loadInventory,80); }
    if(isToday()){ bindToday(); setTimeout(window.renderTodayChangesPage,80); }
    if(isWarehouse()){ setTimeout(window.renderWarehouse,100); }
    if($('shipping-results') && typeof window.loadShippingRecords==='function') window.loadShippingRecords();
    setTimeout(hardCleanBadText,600);
  });
})();


/* ==== FIX28 正式收斂升級：互通操作中心 / 倉庫穩定拖拉 / App化 UI ==== */
(function(){
  'use strict';
  const VERSION = 'fix28';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const say = (msg, type='ok') => (typeof window.toast === 'function' ? window.toast(msg, type) : alert(msg));
  const state = window.state = window.state || {};
  state.fix28 = state.fix28 || { sourceFilter:'all', todayEntity:'all', todayAction:'all', todayKeyword:'' };
  window.__YUANXING_FIX_VERSION__ = VERSION;

  async function api(url, options={}){
    const opts = { credentials:'same-origin', ...options };
    opts.headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const err = new Error(data.error || data.message || `請求失敗：${res.status}`);
      err.payload = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }
  function mod(){ return document.querySelector('.module-screen')?.dataset?.module || (location.pathname.includes('/master-order')?'master_order':location.pathname.includes('/orders')?'orders':location.pathname.includes('/inventory')?'inventory':location.pathname.includes('/ship')?'ship':location.pathname.includes('/warehouse')?'warehouse':location.pathname.includes('/customers')?'customers':''); }
  function isWarehouse(){ return mod()==='warehouse' || location.pathname.includes('/warehouse'); }
  function isToday(){ return location.pathname.includes('/today-changes') || !!$('today-summary-cards'); }
  function normalizeSize(text){
    const raw = String(text||'').replace(/[×X＊*]/g,'x').replace('＝','=').trim().toLowerCase();
    const left = (raw.split('=',1)[0] || raw).trim();
    const nums = left.match(/\d+/g) || [];
    if(nums.length>=3) return nums.slice(0,3).map(n=>String(parseInt(n,10))).join('x');
    return left;
  }
  function qtyOf(item){ return Math.max(0, parseInt(item?.unplaced_qty ?? item?.qty ?? item?.total_qty ?? '0', 10) || 0); }
  function sourceSummary(item){
    if (item?.source_summary) return String(item.source_summary);
    if (Array.isArray(item?.sources)) return item.sources.map(x => `${x.source}${x.qty}`).join('、');
    if (Array.isArray(item?.source_details)) return [...new Set(item.source_details.map(x => x.source).filter(Boolean))].join('、');
    return item?.source || '';
  }
  function containsSource(item, src){
    if(!src || src==='all') return true;
    const hay = `${sourceSummary(item)} ${JSON.stringify(item?.source_qty||{})} ${JSON.stringify(item?.source_details||[])}`;
    return hay.includes(src);
  }
  function confirmHtml(title, message, okText='確認'){
    if (typeof window.confirmDialog === 'function') return window.confirmDialog({title, message, confirmText:okText});
    const tmp = document.createElement('div'); tmp.innerHTML = message;
    return Promise.resolve(window.confirm(`${title}\n\n${tmp.textContent || message}`));
  }
  function normalizeWarehouseItems(items){
    const map = new Map();
    (Array.isArray(items)?items:[]).forEach(raw=>{
      const product = String(raw?.product_text || raw?.product || '').trim();
      const qty = Math.max(0, parseInt(raw?.qty||'0',10)||0);
      if(!product || qty<=0) return;
      const customer = String(raw?.customer_name || '').trim();
      const key = `${normalizeSize(product)}||${customer}`;
      if(!map.has(key)) map.set(key, {...raw, product_text:product, product_code:String(raw?.product_code||product), customer_name:customer, qty});
      else {
        const old = map.get(key); old.qty = Number(old.qty||0) + qty;
        if(!old.source_summary && raw?.source_summary) old.source_summary = raw.source_summary;
      }
    });
    return [...map.values()];
  }

  // ---------- 通用漂亮 Modal ----------
  function ensureModal(id='fix28-modal'){
    let m = $(id);
    if(!m){
      m = document.createElement('div');
      m.id = id;
      m.className = 'modal hidden fix28-bottom-modal';
      m.innerHTML = `<div class="modal-card glass fix28-sheet"><div class="modal-head"><div class="section-title" data-fix28-title></div><button class="icon-btn" type="button" data-fix28-close>✕</button></div><div data-fix28-body></div></div>`;
      document.body.appendChild(m);
      m.querySelector('[data-fix28-close]').onclick = () => m.classList.add('hidden');
      m.addEventListener('click', e => { if(e.target === m) m.classList.add('hidden'); });
    }
    return m;
  }
  function openModal(title, html){
    const m = ensureModal();
    m.querySelector('[data-fix28-title]').textContent = title;
    m.querySelector('[data-fix28-body]').innerHTML = html;
    m.classList.remove('hidden');
    return m;
  }
  function closeModal(){ $('fix28-modal')?.classList.add('hidden'); }

  async function chooseCustomer(defaultName=''){
    let customers = [];
    try { customers = (await api('/api/customers?ts='+Date.now(), {method:'GET'})).items || []; } catch(_) {}
    return new Promise(resolve=>{
      const m = openModal('選擇客戶', `<input id="fix28-customer-key" class="text-input" placeholder="輸入或搜尋客戶" value="${esc(defaultName)}"><div id="fix28-customer-options" class="fix28-customer-options"></div><div class="btn-row"><button class="ghost-btn" type="button" id="fix28-customer-cancel">取消</button><button class="primary-btn" type="button" id="fix28-customer-ok">使用輸入名稱</button></div>`);
      const input = $('fix28-customer-key'), list = $('fix28-customer-options');
      const draw = () => {
        const k = (input.value||'').trim().toLowerCase();
        const rows = customers.filter(c => !k || String(c.name||'').toLowerCase().includes(k)).slice(0, 40);
        list.innerHTML = rows.length ? rows.map(c=>`<button class="fix28-option-card" type="button" data-name="${esc(c.name||'')}"><b>${esc(c.name||'')}</b><span>${esc(c.region||'未分區')}</span></button>`).join('') : '<div class="empty-state-card compact-empty">沒有符合的客戶，可直接使用輸入名稱</div>';
        list.querySelectorAll('[data-name]').forEach(b=>b.onclick=()=>{ const name=b.dataset.name||''; closeModal(); resolve(name); });
      };
      $('fix28-customer-cancel').onclick = () => { closeModal(); resolve(''); };
      $('fix28-customer-ok').onclick = () => { const name=(input.value||'').trim(); closeModal(); resolve(name); };
      input.oninput = draw; draw(); setTimeout(()=>input.focus(),50);
    });
  }

  // ---------- 庫存 / 訂單 / 總單 / 出貨互通 ----------
  function cardHeader(row){
    return `<div class="fix28-item-main"><div class="title">${esc(row.product_text||'')}</div><div class="sub">客戶：${esc(row.customer_name||'未指定')}｜數量：${Number(row.qty||0)}${row.location?`｜格位：${esc(row.location)}`:''}</div></div>`;
  }
  async function editGenericItem(source, row){
    const apiPath = source === 'inventory' ? `/api/inventory/${row.id}` : (source === 'orders' ? `/api/orders/${row.id}` : `/api/master_orders/${row.id}`);
    const title = source === 'inventory' ? '編輯庫存' : source === 'orders' ? '編輯訂單' : '編輯總單';
    const m = openModal(title, `<label class="field-label">商品資料</label><textarea id="fix28-edit-product" class="text-area small">${esc(row.product_text||'')}</textarea><label class="field-label">數量</label><input id="fix28-edit-qty" class="text-input" type="number" min="0" value="${Number(row.qty||0)}"><label class="field-label">客戶名稱</label><input id="fix28-edit-customer" class="text-input" value="${esc(row.customer_name||'')}"><label class="field-label">格位 / 位置</label><input id="fix28-edit-location" class="text-input" value="${esc(row.location||'')}"><div class="btn-row"><button class="ghost-btn" id="fix28-edit-cancel">取消</button><button class="primary-btn" id="fix28-edit-save">儲存</button></div>`);
    $('fix28-edit-cancel').onclick = closeModal;
    $('fix28-edit-save').onclick = async()=>{
      try{
        await api(apiPath, {method:'PUT', body:JSON.stringify({product_text:($('fix28-edit-product').value||'').trim(), product_code:($('fix28-edit-product').value||'').trim(), qty:Number($('fix28-edit-qty').value||0), customer_name:($('fix28-edit-customer').value||'').trim(), location:($('fix28-edit-location').value||'').trim()})});
        say('已儲存','ok'); closeModal(); await refreshCurrentList();
      }catch(e){ say(e.message||'儲存失敗','error'); }
    };
  }
  async function deleteGenericItem(source, id){
    if(!id || !confirm('確定刪除這筆資料？')) return;
    const path = source === 'inventory' ? `/api/inventory/${id}` : (source === 'orders' ? `/api/orders/${id}` : `/api/master_orders/${id}`);
    try{ await api(path, {method:'DELETE'}); say('已刪除','ok'); await refreshCurrentList(); }catch(e){ say(e.message||'刪除失敗','error'); }
  }
  async function transferItem(source, row, target){
    const needsCustomer = ['orders','master_order','master_orders','ship'].includes(target);
    let customer = row.customer_name || '';
    if(needsCustomer) customer = await chooseCustomer(customer);
    if(needsCustomer && !customer) return say('請選擇客戶','warn');
    let qty = Number(row.qty||0) || 0;
    const qtyText = prompt(`要處理的數量（最多 ${qty}）`, String(qty));
    if(qtyText === null) return;
    qty = Math.max(1, Math.min(qty, parseInt(qtyText,10)||qty));
    const label = target === 'inventory' ? '庫存' : target === 'orders' ? '訂單' : target === 'ship' ? '出貨' : '總單';
    const ok = await confirmHtml('確認互通操作', `<div class="fix28-confirm-line"><b>${esc(row.product_text||'')}</b></div><div>數量：${qty}</div><div>目標：${label}</div>${customer?`<div>客戶：${esc(customer)}</div>`:''}`, `移到${label}`);
    if(!ok) return;
    try{
      const payload = {source, id:row.id, target, qty, customer_name:customer, allow_inventory_fallback:true};
      const data = await api('/api/items/transfer', {method:'POST', body:JSON.stringify(payload)});
      say(data.message || `已移到${label}`,'ok');
      await refreshCurrentList();
    }catch(e){ say(e.message||'互通操作失敗','error'); }
  }
  async function refreshCurrentList(){
    const m = mod();
    if(m==='inventory' && typeof window.loadInventory === 'function') return window.loadInventory();
    if(m==='orders') return window.loadOrdersList?.();
    if(m==='master_order') return window.loadMasterList?.();
    if(isWarehouse()) return window.renderWarehouse?.();
  }

  const oldRenderInventoryRows = window.renderInventoryRows;
  function renderInventoryCards(rows){
    const box = $('inventory-inline-list'); if(!box) return;
    const kw = ($('fix28-inventory-search')?.value || '').trim().toLowerCase();
    const filtered = (rows||[]).filter(r => !kw || `${r.product_text||''} ${r.customer_name||''} ${r.location||''}`.toLowerCase().includes(kw));
    if(!filtered.length){ box.innerHTML='<div class="empty-state-card compact-empty">目前沒有庫存資料</div>'; return; }
    box.innerHTML = filtered.map(r=>`<div class="card inventory-action-card fix28-action-card ${Number(r.unplaced_qty||0)>0?'inventory-unplaced-card':''}" data-id="${Number(r.id||0)}">${cardHeader(r)}${Number(r.unplaced_qty||0)>0?`<div class="small-note danger-text">未錄入倉庫圖：${Number(r.unplaced_qty||0)}</div>`:''}<div class="fix28-card-actions"><button class="ghost-btn tiny-btn" data-act="edit">編輯</button><button class="ghost-btn tiny-btn" data-act="orders">移到訂單</button><button class="ghost-btn tiny-btn" data-act="master_order">移到總單</button><button class="ghost-btn tiny-btn" data-act="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-act="delete">刪除</button></div></div>`).join('');
    box.querySelectorAll('.fix28-action-card').forEach(card=>{
      const row = filtered.find(r => Number(r.id)===Number(card.dataset.id));
      card.onclick = (ev)=>{ if(ev.target.closest('button')) return; editGenericItem('inventory', row); };
      card.querySelector('[data-act="edit"]').onclick = ()=>editGenericItem('inventory', row);
      card.querySelector('[data-act="orders"]').onclick = ()=>transferItem('inventory', row, 'orders');
      card.querySelector('[data-act="master_order"]').onclick = ()=>transferItem('inventory', row, 'master_order');
      card.querySelector('[data-act="ship"]').onclick = ()=>transferItem('inventory', row, 'ship');
      card.querySelector('[data-act="delete"]').onclick = ()=>deleteGenericItem('inventory', row.id);
    });
  }
  const previousLoadInventory = window.loadInventory;
  window.loadInventory = async function(){
    if(mod() !== 'inventory' && !location.pathname.includes('/inventory')) return previousLoadInventory?.();
    let panel = $('inventory-inline-panel');
    if(panel && !$('fix28-inventory-search')){
      panel.querySelector('.section-head')?.insertAdjacentHTML('afterend', `<div class="fix28-list-toolbar"><input id="fix28-inventory-search" class="text-input" placeholder="搜尋庫存 / 客戶 / 格位"><button class="ghost-btn small-btn" id="fix28-inventory-refresh" type="button">重新整理</button></div>`);
      $('fix28-inventory-search').oninput = () => window.loadInventory();
      $('fix28-inventory-refresh').onclick = () => window.loadInventory();
    }
    const box=$('inventory-inline-list'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';
    try{ const data=await api('/api/inventory?ts='+Date.now(),{method:'GET'}); window.__fix28InventoryRows = data.items||[]; renderInventoryCards(data.items||[]); }
    catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'庫存載入失敗')}</div>`; }
  };

  function ensureModuleListPanel(kind){
    const id = kind==='orders' ? 'orders-list' : 'master-list';
    const section = kind==='orders' ? $('orders-list-section') : $('master-list-section');
    if(section) section.style.display='';
    let box = $(id);
    if(box && !$(id+'-toolbar')){
      box.insertAdjacentHTML('beforebegin', `<div class="fix28-list-toolbar" id="${id}-toolbar"><input id="${id}-search" class="text-input" placeholder="搜尋客戶 / 商品"><button class="ghost-btn small-btn" type="button" id="${id}-refresh">重新整理</button></div>`);
      $(id+'-search').oninput = () => kind==='orders' ? window.loadOrdersList() : window.loadMasterList();
      $(id+'-refresh').onclick = () => kind==='orders' ? window.loadOrdersList() : window.loadMasterList();
    }
    return box;
  }
  function renderOrderLike(kind, rows){
    const box = ensureModuleListPanel(kind); if(!box) return;
    const source = kind;
    const kw = ($(kind==='orders'?'orders-list-search':'master-list-search')?.value || '').trim().toLowerCase();
    const filtered = (rows||[]).filter(r => !kw || `${r.customer_name||''} ${r.product_text||''}`.toLowerCase().includes(kw));
    if(!filtered.length){ box.innerHTML='<div class="empty-state-card compact-empty">目前沒有資料</div>'; return; }
    box.innerHTML = filtered.map(r=>`<div class="card fix28-action-card" data-id="${Number(r.id||0)}">${cardHeader(r)}<div class="fix28-card-actions"><button class="ghost-btn tiny-btn" data-act="edit">編輯</button>${kind==='orders'?'<button class="ghost-btn tiny-btn" data-act="master_order">移到總單</button>':'<button class="ghost-btn tiny-btn" data-act="orders">移到訂單</button>'}<button class="ghost-btn tiny-btn" data-act="inventory">轉回庫存</button><button class="ghost-btn tiny-btn" data-act="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-act="delete">刪除</button></div></div>`).join('');
    box.querySelectorAll('.fix28-action-card').forEach(card=>{
      const row = filtered.find(r=>Number(r.id)===Number(card.dataset.id));
      card.onclick = (ev)=>{ if(ev.target.closest('button')) return; editGenericItem(source, row); };
      card.querySelector('[data-act="edit"]').onclick = ()=>editGenericItem(source, row);
      card.querySelector('[data-act="delete"]').onclick = ()=>deleteGenericItem(source, row.id);
      card.querySelector('[data-act="inventory"]').onclick = ()=>transferItem(source, row, 'inventory');
      card.querySelector('[data-act="ship"]').onclick = ()=>transferItem(source, row, 'ship');
      const other = kind==='orders' ? 'master_order' : 'orders';
      card.querySelector(`[data-act="${other}"]`).onclick = ()=>transferItem(source, row, other);
    });
  }
  window.loadOrdersList = async function(){ const box=ensureModuleListPanel('orders'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{ const data=await api('/api/orders?ts='+Date.now(),{method:'GET'}); renderOrderLike('orders', data.items||[]); }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'訂單載入失敗')}</div>`; } };
  window.loadMasterList = async function(){ const box=ensureModuleListPanel('master_order'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{ const data=await api('/api/master_orders?ts='+Date.now(),{method:'GET'}); renderOrderLike('master_order', data.items||[]); }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'總單載入失敗')}</div>`; } };

  // ---------- 倉庫：拖拉正式穩定化 + 尚未入倉篩選 ----------
  function warehouseState(){ state.warehouse = state.warehouse || {cells:[], zones:{A:{},B:{}}, availableItems:[], activeZone:'A'}; return state.warehouse; }
  function cells(){ return Array.isArray(warehouseState().cells) ? warehouseState().cells : []; }
  function cellItems(zone,col,slot){
    const c = cells().find(x => String(x.zone)===String(zone) && Number(x.column_index)===Number(col) && Number(x.slot_number)===Number(slot));
    if(!c) return [];
    try{ return JSON.parse(c.items_json||'[]'); }catch(_){ return []; }
  }
  function slotMax(zone,col){ return Math.max(20, ...cells().filter(c=>String(c.zone)===String(zone)&&Number(c.column_index)===Number(col)).map(c=>Number(c.slot_number)||0)); }
  async function placeUnplaced(payload, zone, column, slot){
    const max = slotMax(zone,column);
    if(column<1 || column>6 || slot<1 || slot>max) return say('這個格位不存在，請先用＋新增格子','warn');
    const product = String(payload.product_text||payload.product_size||'').trim();
    const qty = Math.min(Math.max(1, parseInt(payload.qty||'1',10)||1), Math.max(1, Number(payload.max_qty||payload.unplaced_qty||payload.qty||1)||1));
    const customer = String(payload.customer_name||'').trim();
    const ok = await confirmHtml('確認放入倉庫格位', `<div><b>${esc(product)}</b></div><div>數量：${qty}</div><div>客戶：${esc(customer || '未指定客戶')}</div><div>放入：${zone}-${column}-${String(slot).padStart(2,'0')}</div>`, '確認放入');
    if(!ok) return;
    const current = cellItems(zone,column,slot);
    const items = normalizeWarehouseItems([...current, {product_text:product, product_code:product, customer_name:customer, qty, source:'unplaced', source_summary:payload.source_summary||sourceSummary(payload)}]);
    try{
      await api('/api/warehouse/cell', {method:'POST', body:JSON.stringify({zone, column_index:column, slot_type:'direct', slot_number:slot, items})});
      say(`已加入 ${zone}-${column}-${String(slot).padStart(2,'0')}`,'ok');
      await window.renderWarehouse?.();
    }catch(e){ say(e.message||'加入格位失敗','error'); }
  }
  const oldRenderWarehouse = window.renderWarehouse;
  window.renderWarehouse = async function(){
    if(typeof oldRenderWarehouse === 'function') await oldRenderWarehouse.apply(this, arguments);
    decorateWarehousePanel();
  };
  function decorateWarehousePanel(){
    if(!isWarehouse()) return;
    const panel = $('warehouse-unplaced-bottom-panel');
    if(panel && !$('fix28-source-filter')){
      const head = panel.querySelector('.warehouse-unplaced-head') || panel.querySelector('.section-head');
      head?.insertAdjacentHTML('afterend', `<div class="fix28-unplaced-toolbar"><button class="chip active" data-fix28-source="all">全部</button><button class="chip" data-fix28-source="庫存">庫存</button><button class="chip" data-fix28-source="訂單">訂單</button><button class="chip" data-fix28-source="總單">總單</button></div>`);
      panel.querySelectorAll('[data-fix28-source]').forEach(btn=>btn.onclick=()=>{ state.fix28.sourceFilter=btn.dataset.fix28Source; panel.querySelectorAll('[data-fix28-source]').forEach(b=>b.classList.toggle('active', b===btn)); repaintUnplacedCards(); });
    }
    repaintUnplacedCards();
  }
  function repaintUnplacedCards(){
    const panel = $('warehouse-unplaced-bottom-panel'); if(!panel) return;
    const list = $('warehouse-unplaced-bottom-list'); if(!list) return;
    let items = warehouseState().availableItems || [];
    const filter = state.fix28.sourceFilter || 'all';
    const q = ($('warehouse-unplaced-search')?.value||'').trim().toLowerCase();
    items = items.filter(it => containsSource(it, filter)).filter(it => !q || `${it.product_text||''} ${it.customer_name||''} ${sourceSummary(it)}`.toLowerCase().includes(q));
    if(!items.length){ list.innerHTML='<div class="empty-state-card compact-empty">目前沒有符合條件的尚未入倉商品</div>'; return; }
    list.innerHTML = '';
    items.forEach((it, idx)=>{
      const max = qtyOf(it), customer=String(it.customer_name||'').trim();
      const card = document.createElement('div');
      card.className = 'warehouse-unplaced-card fix28-unplaced-card';
      card.draggable = true;
      card.innerHTML = `<div class="unplaced-main-row"><div class="unplaced-title">${esc(it.product_text||it.product_size||'')}</div><div class="unplaced-qty">未入倉 ${max}</div></div><div class="small-note">客戶：${esc(customer||'未指定客戶')}｜來源：${esc(sourceSummary(it))}</div><div class="unplaced-control-row"><label class="field-label compact-label">加入數量</label><input class="text-input unplaced-qty-input" type="number" min="1" max="${max}" value="1" data-fix28-qty><button class="ghost-btn tiny-btn" type="button" data-fix28-manual>手動輸入格位</button></div>`;
      const payload = () => ({kind:'unplaced-item', product_text:it.product_text||it.product_size||'', customer_name:customer, qty:Math.max(1, Math.min(max, parseInt(card.querySelector('[data-fix28-qty]').value||'1',10)||1)), max_qty:max, unplaced_qty:max, source_summary:sourceSummary(it), source:'unplaced'});
      card.addEventListener('dragstart', ev=>{ ev.dataTransfer.effectAllowed='copy'; ev.dataTransfer.setData('text/plain', JSON.stringify(payload())); card.classList.add('is-dragging'); });
      card.addEventListener('dragend', ()=>card.classList.remove('is-dragging'));
      card.querySelector('[data-fix28-manual]').onclick = async()=>{ const ans=prompt('輸入要加入的格位，例如 A-1-05、A105、B-3-12'); if(!ans)return; const m=String(ans).trim().toUpperCase().match(/^([AB])\D*(\d)\D*(\d{1,3})$/) || String(ans).trim().toUpperCase().match(/^([AB])(\d)(\d{1,3})$/); if(!m)return say('格位格式不正確','warn'); await placeUnplaced(payload(), m[1], Number(m[2]), Number(m[3])); };
      list.appendChild(card);
    });
  }
  document.addEventListener('drop', async ev=>{
    if(!isWarehouse()) return;
    const slot = ev.target.closest?.('.vertical-slot');
    if(!slot) return;
    let p=null; try{ p=JSON.parse(ev.dataTransfer?.getData('text/plain')||'{}'); }catch(_){ }
    if(!p || p.kind!=='unplaced-item') return;
    ev.preventDefault(); ev.stopPropagation();
    await placeUnplaced(p, slot.dataset.zone, Number(slot.dataset.column), Number(slot.dataset.num));
  }, true);
  const oldMoveWarehouseItem = window.moveWarehouseItem;
  window.moveWarehouseItem = async function(fromKey, toKey, productText, qty, customerName=''){
    const tz = Array.isArray(toKey) ? toKey[0] : '', tc = Array.isArray(toKey) ? toKey[1] : '', ts = Array.isArray(toKey) ? (toKey[3] ?? toKey[2]) : '';
    const ok = await confirmHtml('確認搬移倉庫商品', `<div><b>${esc(productText||'')}</b></div><div>數量：${Number(qty||1)}</div><div>客戶：${esc(customerName||'未指定客戶')}</div><div>目標：${esc(tz)}-${esc(tc)}-${String(ts).padStart(2,'0')}</div>`, '確認搬移');
    if(!ok) return;
    return oldMoveWarehouseItem ? oldMoveWarehouseItem.apply(this, arguments) : undefined;
  };
  const oldRenderCellItems = window.renderWarehouseCellItems;
  window.renderWarehouseCellItems = function(){
    if(oldRenderCellItems) oldRenderCellItems.apply(this, arguments);
    const box = $('warehouse-cell-items'); if(!box) return;
    box.querySelectorAll('.chip-item').forEach((chip, idx)=>{
      if(chip.querySelector('[data-fix28-return]')) return;
      const btn = document.createElement('button');
      btn.type='button'; btn.className='ghost-btn tiny-btn'; btn.textContent='移回未入倉'; btn.dataset.fix28Return=String(idx);
      btn.onclick = () => { const items = normalizeWarehouseItems(state.currentCellItems||[]); items.splice(idx,1); state.currentCellItems = items; window.renderWarehouseCellItems(); };
      (chip.querySelector('.btn-row') || chip).appendChild(btn);
    });
  };

  // ---------- 今日異動正式操作紀錄中心 ----------
  function ensureOperationCenter(){
    if(!isToday()) return null;
    let panel = $('fix28-operation-center');
    if(!panel){
      const host = document.querySelector('.feature-card') || document.querySelector('.home-shell') || document.body;
      panel = document.createElement('div');
      panel.id='fix28-operation-center';
      panel.className='glass feature-card fix28-operation-center';
      panel.innerHTML = `<div class="section-head"><div><h3>操作紀錄中心</h3><span class="muted">可搜尋誰在什麼時間改了什麼，點開看變更前 / 變更後。</span></div></div><div class="fix28-audit-toolbar"><input id="fix28-audit-keyword" class="text-input" placeholder="搜尋客戶 / 商品 / 操作者 / 格位"><select id="fix28-audit-entity" class="text-input small"><option value="all">全部類型</option><option value="inventory">庫存</option><option value="orders">訂單</option><option value="master_orders">總單</option><option value="shipping_records">出貨</option><option value="warehouse_cells">倉庫</option><option value="customer_profiles">客戶</option></select><select id="fix28-audit-action" class="text-input small"><option value="all">全部操作</option><option value="create">新增</option><option value="update">修改</option><option value="move">移動</option><option value="delete">刪除</option><option value="ship">出貨</option><option value="upsert">儲存</option></select><button id="fix28-audit-refresh" class="primary-btn small-btn" type="button">查詢</button></div><div id="fix28-audit-list" class="card-list"></div>`;
      host.insertAdjacentElement('afterend', panel);
      $('fix28-audit-refresh').onclick = loadAuditCenter;
      $('fix28-audit-keyword').oninput = () => { clearTimeout(window.__fix28AuditTimer); window.__fix28AuditTimer=setTimeout(loadAuditCenter,250); };
      $('fix28-audit-entity').onchange = loadAuditCenter;
      $('fix28-audit-action').onchange = loadAuditCenter;
    }
    return panel;
  }
  function compactJson(v){
    try{ return esc(JSON.stringify(v||{}, null, 2)); }catch(_){ return esc(String(v||'')); }
  }
  async function loadAuditCenter(){
    const panel = ensureOperationCenter(); if(!panel) return;
    const box = $('fix28-audit-list'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';
    const q = $('fix28-audit-keyword')?.value || '';
    const entity = $('fix28-audit-entity')?.value || 'all';
    const params = new URLSearchParams({limit:'120'});
    if(q) params.set('q', q);
    if(entity !== 'all') params.set('entity_type', entity);
    try{
      let items = (await api('/api/audit-trails?'+params.toString(), {method:'GET'})).items || [];
      const act = $('fix28-audit-action')?.value || 'all';
      if(act !== 'all') items = items.filter(x => String(x.action_type||'').includes(act));
      if(!items.length){ box.innerHTML='<div class="empty-state-card compact-empty">沒有符合的操作紀錄</div>'; return; }
      box.innerHTML = items.map(x=>`<div class="recent-activity-item inline-activity-card fix28-audit-card" data-audit-id="${Number(x.id||0)}"><strong>${esc((x.created_at||'').slice(0,16))}｜${esc(x.username||'')}</strong><div>${esc(x.action_type||'')}｜${esc(x.entity_type||'')}｜${esc(x.entity_key||'')}</div><div class="btn-row compact-row" style="justify-content:flex-end"><button class="ghost-btn tiny-btn" type="button" data-detail="${Number(x.id||0)}">查看明細</button></div></div>`).join('');
      box.querySelectorAll('[data-detail]').forEach(btn=>btn.onclick=()=>{
        const row = items.find(x=>Number(x.id)===Number(btn.dataset.detail));
        openModal('操作明細', `<div class="fix28-detail-grid"><div><b>時間</b><div>${esc(row.created_at||'')}</div></div><div><b>操作者</b><div>${esc(row.username||'')}</div></div><div><b>操作</b><div>${esc(row.action_type||'')}</div></div><div><b>資料</b><div>${esc(row.entity_type||'')}｜${esc(row.entity_key||'')}</div></div></div><label class="field-label">變更前</label><pre class="fix28-json-box">${compactJson(row.before_json)}</pre><label class="field-label">變更後</label><pre class="fix28-json-box">${compactJson(row.after_json)}</pre>`);
      });
    }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'操作紀錄載入失敗')}</div>`; }
  }
  const oldRenderToday = window.renderTodayChangesPage;
  window.renderTodayChangesPage = async function(){ if(oldRenderToday) await oldRenderToday.apply(this, arguments); ensureOperationCenter(); await loadAuditCenter(); };

  // ---------- 啟動 ----------
  document.addEventListener('DOMContentLoaded', ()=>{
    try{ localStorage.setItem('yuanxing_fix_version', VERSION); }catch(_){ }
    document.body.classList.add('fix28-app-polish');
    if(mod()==='inventory') setTimeout(()=>window.loadInventory?.(),120);
    if(mod()==='orders') setTimeout(()=>window.loadOrdersList?.(),140);
    if(mod()==='master_order') setTimeout(()=>window.loadMasterList?.(),140);
    if(isWarehouse()) setTimeout(()=>window.renderWarehouse?.(),180);
    if(isToday()) setTimeout(()=>{ ensureOperationCenter(); loadAuditCenter(); },180);
  });
})();

/* ==== FIX28 submit refresh wrapper：送出後同步刷新正式清單 ==== */
(function(){
  'use strict';
  const $ = (id) => document.getElementById(id);
  function mod(){ return document.querySelector('.module-screen')?.dataset?.module || (location.pathname.includes('/master-order')?'master_order':location.pathname.includes('/orders')?'orders':location.pathname.includes('/inventory')?'inventory':location.pathname.includes('/ship')?'ship':''); }
  const oldConfirmSubmit = window.confirmSubmit;
  window.confirmSubmit = async function(){
    const beforeModule = mod();
    const result = oldConfirmSubmit ? await oldConfirmSubmit.apply(this, arguments) : undefined;
    try {
      if (beforeModule === 'inventory') await window.loadInventory?.();
      if (beforeModule === 'orders') await window.loadOrdersList?.();
      if (beforeModule === 'master_order') await window.loadMasterList?.();
      if (['inventory','orders','master_order'].includes(beforeModule) && $('ocr-text') && (($('module-result')?.textContent || '').includes('送出完成'))) $('ocr-text').value = '';
    } catch(_e) {}
    return result;
  };
})();
