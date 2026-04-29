/* FIX146：返回主頁立即導頁 + 出貨/客戶商品速度硬鎖
   只覆蓋卡頓的導頁、出貨送出、客戶商品載入入口；保留現有頁面與所有功能按鈕。 */
(function(){
  'use strict';
  var V = 'fix146-speed-ship-product-home-hardlock';
  if (window.__YX146_SPEED_SHIP_PRODUCT_HOME__) return;
  window.__YX146_SPEED_SHIP_PRODUCT_HOME__ = true;

  var d = document;
  var inFlight = Object.create(null);
  var cache = Object.create(null);
  var navStarted = false;
  var selectSeq = 0;

  function $(id){ return d.getElementById(id); }
  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function path(){ return location.pathname || '/'; }
  function mod(){
    var p = path();
    var m = d.querySelector('.module-screen[data-module]');
    if(m) return m.getAttribute('data-module') || '';
    if(p.indexOf('/master-order') >= 0) return 'master_order';
    if(p.indexOf('/orders') >= 0) return 'orders';
    if(p.indexOf('/inventory') >= 0) return 'inventory';
    if(p.indexOf('/ship') >= 0) return 'ship';
    if(p.indexOf('/settings') >= 0) return 'settings';
    if(p === '/' || p === '') return 'home';
    return p.split('/').filter(Boolean)[0] || '';
  }
  function toast(msg, type){
    try { (window.YXHardLock && window.YXHardLock.toast ? window.YXHardLock.toast : (window.toast || window.showToast || console.log))(msg, type || 'ok'); }
    catch(_e){ try{ console.log(msg); }catch(_e2){} }
  }
  async function api(url, opt){
    opt = opt || {};
    var method = String(opt.method || 'GET').toUpperCase();
    var key = method + ' ' + url + (method === 'GET' ? '' : ' ' + String(opt.body || ''));
    if(method === 'GET'){
      var c = cache[key];
      if(c && c.expire > Date.now()) return Promise.resolve(c.data);
      if(inFlight[key]) return inFlight[key];
    }
    var p = fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      method: method,
      body: opt.body,
      headers: Object.assign({'Content-Type':'application/json'}, opt.headers || {})
    }).then(function(res){
      return res.text().then(function(txt){
        var data = {};
        try{ data = txt ? JSON.parse(txt) : {}; }
        catch(_e){ data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
        if(!res.ok || data.success === false){
          var e = new Error(data.error || data.message || ('請求失敗：' + res.status));
          e.payload = data;
          throw e;
        }
        if(method === 'GET') cache[key] = {expire:Date.now()+8500, data:data};
        return data;
      });
    }).finally(function(){ if(method === 'GET') setTimeout(function(){ delete inFlight[key]; }, 250); });
    if(method === 'GET') inFlight[key] = p;
    return p;
  }

  function killLegacyDelays(){
    try{ window.__YX111_NAVIGATING__ = true; }catch(_e){}
    try{ window.__YX145_NAVIGATING__ = true; }catch(_e){}
    try{ window.__YX146_NAVIGATING__ = true; }catch(_e){}
    try{ window.YXHardLock && window.YXHardLock.cancelLegacyTimers && window.YXHardLock.cancelLegacyTimers('fix146-instant-nav'); }catch(_e){}
    try{ window.__YX96_CANCEL_LEGACY_TIMERS__ && window.__YX96_CANCEL_LEGACY_TIMERS__(); }catch(_e){}
    try{
      var nativeClear = window.__YX96_NATIVE_CLEAR_TIMEOUT__ || window.clearTimeout;
      if(window.__YX96_TIMEOUTS__){
        Array.from(window.__YX96_TIMEOUTS__).forEach(function(id){ try{ nativeClear(id); }catch(_e){} });
        window.__YX96_TIMEOUTS__.clear();
      }
    }catch(_e){}
  }
  function showLeaving(text){
    try{
      d.documentElement.classList.add('yx146-leaving');
      var old = $('yx146-fast-nav-mask');
      if(old){ old.textContent = text || old.textContent || '返回主頁…'; return; }
      var mask = d.createElement('div');
      mask.id = 'yx146-fast-nav-mask';
      mask.textContent = text || '返回主頁…';
      d.body && d.body.appendChild(mask);
    }catch(_e){}
  }
  function goFast(href){
    if(navStarted) return true;
    navStarted = true;
    showLeaving(href === '/' || href === '' ? '返回主頁…' : '開啟中…');
    killLegacyDelays();
    try{ location.assign(href); }
    catch(_e){ location.href = href; }
    return true;
  }
  function internalUrl(href){
    try{
      var u = new URL(href, location.href);
      if(u.origin !== location.origin) return null;
      return u.pathname + u.search + u.hash;
    }catch(_e){ return null; }
  }
  function isFastAnchor(a){
    if(!a || !a.getAttribute) return false;
    var href = a.getAttribute('href') || '';
    if(!href || href === '#') return false;
    var target = a.getAttribute('target') || '';
    if(target && target !== '_self') return false;
    var url = internalUrl(href);
    if(!url) return false;
    if(a.classList.contains('back-btn')) return true;
    if(a.classList.contains('menu-btn')) return true;
    if(a.classList.contains('home-mini-btn')) return true;
    if(a.hasAttribute('data-fast-nav')) return true;
    return false;
  }
  function bindInstantNavigation(){
    window.addEventListener('pointerdown', function(e){
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if(!isFastAnchor(a)) return;
      var href = internalUrl(a.getAttribute('href') || a.href);
      if(href) showLeaving(href === '/' || href === '' ? '返回主頁…' : '開啟中…');
    }, {capture:true, passive:true});

    window.addEventListener('click', function(e){
      if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if(!isFastAnchor(a)) return;
      var href = internalUrl(a.getAttribute('href') || a.href);
      if(!href) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
      goFast(href);
    }, true);

    window.addEventListener('pagehide', killLegacyDelays, {capture:true});
  }

  function normalizeLine(s){
    return clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');
  }
  function splitProduct(text){
    var raw = normalizeLine(text || '');
    var i = raw.indexOf('=');
    return {size:i >= 0 ? raw.slice(0,i) : raw, support:i >= 0 ? raw.slice(i+1) : ''};
  }
  function qtyFromText(text, fallback){
    var raw = normalizeLine(text || '');
    var right = raw.indexOf('=') >= 0 ? raw.split('=').slice(1).join('=') : '';
    if(right){
      var canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
      if(right.toLowerCase() === canonical) return 10;
      var total = 0, hit = false;
      right.split('+').map(clean).filter(Boolean).forEach(function(seg){
        var m = seg.match(/x\s*(\d+)$/i);
        if(m){ total += Number(m[1] || 0); hit = true; }
        else if(/\d/.test(seg)){ total += 1; hit = true; }
      });
      if(hit) return total;
    }
    var n = Number(fallback || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }
  function materialOf(it){
    var p = normalizeLine(it && it.product_text || '');
    var m = clean((it && (it.material || it.product_code)) || '').toUpperCase();
    if(!m || normalizeLine(m) === p || m.indexOf('=') >= 0 || /^\d+(?:x|×)/i.test(m)) return '未填材質';
    return m;
  }
  function sourceKey(src){
    src = clean(src || '').toLowerCase();
    if(src.indexOf('inventory') >= 0 || src.indexOf('庫存') >= 0) return 'inventory';
    if(src.indexOf('master') >= 0 || src.indexOf('總單') >= 0) return 'master_order';
    if(src.indexOf('order') >= 0 || src.indexOf('訂單') >= 0) return 'orders';
    return '';
  }
  function sourceApi(source){
    source = sourceKey(source) || source;
    return source === 'master_order' ? 'master_orders' : source;
  }
  function sourceTitle(source){
    source = sourceKey(source) || source;
    return source === 'inventory' ? '庫存' : source === 'orders' ? '訂單' : source === 'master_order' ? '總單' : clean(source || '商品');
  }
  function endpointFor(source, id){
    var s = sourceKey(source);
    if(s === 'inventory') return '/api/inventory/' + encodeURIComponent(id);
    if(s === 'orders') return '/api/orders/' + encodeURIComponent(id);
    return '/api/master_orders/' + encodeURIComponent(id);
  }
  function requestKey(prefix){
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }
  function setBusy(btn, on, text){
    if(!btn) return;
    if(on){
      btn.dataset.yx146Busy = '1';
      btn.dataset.yx146Text = btn.dataset.yx146Text || btn.textContent || '';
      btn.disabled = true;
      if(text) btn.textContent = text;
    }else{
      btn.dataset.yx146Busy = '0';
      btn.disabled = false;
      if(btn.dataset.yx146Text){ btn.textContent = btn.dataset.yx146Text; delete btn.dataset.yx146Text; }
    }
  }

  function selectedCustomer(){ return clean($('customer-name') && $('customer-name').value || window.__YX_SELECTED_CUSTOMER__ || ''); }
  function customerVariants(name){
    var out = [];
    try{
      if(Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__)) out = window.__YX_SELECTED_CUSTOMER_VARIANTS__.map(clean).filter(Boolean);
    }catch(_e){}
    if(name && out.indexOf(name) < 0) out.unshift(name);
    return out;
  }
  function customerItemsUrl(name, fast){
    var qs = new URLSearchParams();
    qs.set('name', name);
    qs.set('fast', fast ? '1' : '0');
    var variants = customerVariants(name);
    if(variants.length) qs.set('variants', JSON.stringify(variants));
    qs.set('yx146', '1');
    return '/api/customer-items?' + qs.toString();
  }

  function ensureSelectedPanel(){
    var panel = $('selected-customer-items');
    if(!panel) return null;
    panel.classList.remove('hidden');
    panel.style.display = '';
    return panel;
  }
  function rowHTML(it, idx, pageMod){
    var source = sourceKey(it.source || it.source_label || it.type);
    var id = it.id || it.row_id || it.item_id || '';
    var p = splitProduct(it.product_text || it.product_size || it.size || '');
    var q = qtyFromText(it.product_text || '', it.qty || it.effective_qty || 1);
    var canEditDelete = !!(source && id);
    var action = '';
    if(pageMod === 'ship'){
      action += '<button class="primary-btn tiny-btn" type="button" data-yx146-action="add-ship">加入出貨</button>';
    }
    if(source === 'inventory'){
      action += '<button class="ghost-btn tiny-btn" type="button" data-yx146-action="to-orders">加到訂單</button><button class="ghost-btn tiny-btn" type="button" data-yx146-action="to-master">加到總單</button>';
    }
    if(source === 'orders'){
      action += '<button class="ghost-btn tiny-btn" type="button" data-yx146-action="to-master">加到總單</button>';
    }
    if(source === 'orders' || source === 'master_order'){
      action += '<button class="ghost-btn tiny-btn" type="button" data-yx146-action="ship-row">直接出貨</button>';
    }
    if(canEditDelete){
      action += '<button class="ghost-btn tiny-btn" type="button" data-yx146-action="edit-row">編輯</button><button class="ghost-btn tiny-btn danger-btn" type="button" data-yx146-action="delete-row">刪除</button>';
    }
    if(!action) action = '<span class="small-note">可加入商品資料</span>';
    return '<div class="deduct-card yx146-customer-item" data-yx146-index="'+idx+'" data-source="'+esc(source)+'" data-api-source="'+esc(sourceApi(source))+'" data-id="'+esc(id)+'">' +
      '<div class="yx146-item-head"><span class="pill">'+esc(sourceTitle(source))+'</span><strong>'+esc(materialOf(it))+'</strong><span class="yx146-qty">'+q+'件</span></div>' +
      '<div class="yx146-item-line"><span>'+esc(p.size || it.product_text || '')+'</span><b>'+esc(p.support || String(q))+'</b></div>' +
      '<div class="yx146-actions">'+action+'</div>' +
    '</div>';
  }
  function renderCustomerItems(name, items, opts){
    opts = opts || {};
    var page = mod();
    var panel = ensureSelectedPanel();
    if(panel){
      var rows = Array.isArray(items) ? items : [];
      var total = rows.reduce(function(s,it){ return s + qtyFromText(it.product_text || '', it.qty || it.effective_qty || 1); }, 0);
      panel.innerHTML = '<div class="yx146-customer-head"><div><div class="section-title">'+esc(name)+'</div><div class="small-note">商品已載入：'+total+'件 / '+rows.length+'筆</div></div>' +
        (page === 'ship' ? '<button class="ghost-btn small-btn" type="button" id="yx146-add-all-customer-items">全部加入出貨</button>' : '') +
        '</div>' +
        (rows.length ? '<div class="yx146-customer-list">' + rows.map(function(it,i){ return rowHTML(it,i,page); }).join('') + '</div>' : '<div class="empty-state-card compact-empty">這個客戶目前沒有商品。</div>');
    }
    if(page === 'ship') renderShipFullList(name, items);
  }
  function renderShipFullList(name, items){
    var picker = $('ship-customer-picker');
    if(!picker) return;
    var sel = $('ship-customer-item-select');
    if(sel){
      sel.innerHTML = !name ? '<option value="">請先選擇 / 輸入客戶名稱</option>' :
        (!items.length ? '<option value="">目前沒有商品</option>' :
          '<option value="">已改用直列商品清單</option>' + items.map(function(it,i){
            var p = splitProduct(it.product_text || '');
            return '<option value="'+i+'">'+esc(sourceTitle(sourceKey(it.source)))+'｜'+esc(materialOf(it))+'｜'+esc(p.size)+'｜'+esc(p.support || String(qtyFromText(it.product_text, it.qty)))+'</option>';
          }).join(''));
    }
    var list = $('ship-customer-item-list');
    if(!list){
      list = d.createElement('div');
      list.id = 'ship-customer-item-list';
      list.className = 'ship-customer-item-list yx146-ship-full-list';
      var row = picker.querySelector('.ship-picker-row') || picker.firstElementChild || picker;
      row.insertAdjacentElement('afterend', list);
    }
    list.innerHTML = !name ? '<div class="empty-state-card compact-empty">請先點選或輸入客戶。</div>' :
      (!items.length ? '<div class="empty-state-card compact-empty">'+esc(name)+' 目前沒有商品。</div>' :
      '<div class="yx146-ship-list-head"><strong>'+esc(name)+' 全部商品</strong><span>'+items.length+'筆</span></div>' +
      items.map(function(it,i){
        var p = splitProduct(it.product_text || '');
        return '<button type="button" class="yx146-ship-item" data-yx146-ship-index="'+i+'"><span>'+esc(sourceTitle(sourceKey(it.source)))+'</span><strong>'+esc(materialOf(it))+'</strong><em>'+esc(p.size)+'</em><b>'+esc(p.support || String(qtyFromText(it.product_text,it.qty)))+'</b><small>'+qtyFromText(it.product_text,it.qty)+'件</small></button>';
      }).join(''));
  }
  async function loadCustomerItemsFast(name, opts){
    opts = opts || {};
    name = clean(name || selectedCustomer());
    if(!name){ renderCustomerItems('', [], opts); return []; }
    var seq = ++selectSeq;
    var panel = ensureSelectedPanel();
    if(panel && !opts.silent){
      panel.innerHTML = '<div class="yx146-customer-head"><div><div class="section-title">'+esc(name)+'</div><div class="small-note">商品載入中…</div></div></div><div class="empty-state-card compact-empty">正在整理商品，畫面不會卡住。</div>';
    }
    var data = await api(customerItemsUrl(name, true), {method:'GET'});
    if(seq !== selectSeq && !opts.forceRender) return window.__YX146_CUSTOMER_ITEMS__ || [];
    var items = Array.isArray(data.items) ? data.items : [];
    window.__YX146_CUSTOMER_ITEMS__ = items;
    window.__YX_SHIP_CUSTOMER_ITEMS__ = items;
    renderCustomerItems(name, items, opts);
    return items;
  }

  function setSelectedCustomer(name){
    name = clean(name);
    window.__YX_SELECTED_CUSTOMER__ = name;
    var input = $('customer-name');
    if(input && input.value !== name){
      input.value = name;
      try{ input.dispatchEvent(new Event('input',{bubbles:true})); }catch(_e){}
      try{ input.dispatchEvent(new Event('change',{bubbles:true})); }catch(_e){}
    }
  }
  async function selectCustomerFast(name){
    name = clean(name);
    if(!name) return [];
    setSelectedCustomer(name);
    try{
      var source = mod() === 'master_order' ? 'master_order' : (mod() === 'orders' ? 'orders' : (mod() === 'inventory' ? 'inventory' : ''));
      if(source && window.YX113ProductActions){
        window.YX113ProductActions.renderSummary && window.YX113ProductActions.renderSummary(source);
        window.YX113ProductActions.renderCards && window.YX113ProductActions.renderCards(source);
      }
    }catch(_e){}
    var p = loadCustomerItemsFast(name);
    // 背景刷新主清單，不阻塞商品小卡顯示。
    try{
      if(window.YX113ProductActions && (mod()==='orders' || mod()==='master_order' || mod()==='inventory')){
        window.YX113ProductActions.loadSource && window.YX113ProductActions.loadSource(mod()==='master_order' ? 'master_order' : mod(), {silent:true});
      }
    }catch(_e){}
    return p;
  }
  function installSelectOverride(){
    var fn = function(name){ return selectCustomerFast(name); };
    fn.__yx146Select = true;
    try{ Object.defineProperty(window, 'selectCustomerForModule', {value:fn, writable:true, configurable:true}); }
    catch(_e){ try{ window.selectCustomerForModule = fn; }catch(_e2){} }

    window.addEventListener('click', function(e){
      var card = e.target && e.target.closest && e.target.closest('.customer-region-card[data-customer-name],.yx81-customer-card[data-customer-name],.yx113-customer-card[data-customer-name],.yx114-customer-card[data-customer-name],.yx116-customer-card[data-customer-name]');
      if(!card || !['orders','master_order','ship'].includes(mod())) return;
      var name = clean(card.dataset.customerName || card.dataset.customer || card.textContent || '');
      if(!name) return;
      try{
        if(card.dataset.customerVariants) window.__YX_SELECTED_CUSTOMER_VARIANTS__ = JSON.parse(card.dataset.customerVariants);
      }catch(_e){}
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
      selectCustomerFast(name).catch(function(err){ toast(err.message || '客戶商品載入失敗','error'); });
    }, true);
  }

  function appendShipItems(items){
    var box = $('ocr-text');
    if(!box) return 0;
    var lines = (items || []).map(function(it){ return clean(it && (it.product_text || it.product_size || it.size) || ''); }).filter(Boolean);
    if(!lines.length) return 0;
    var current = String(box.value || '').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
    var seen = Object.create(null);
    current.forEach(function(line){ seen[normalizeLine(line).split('=')[0].toLowerCase()] = true; });
    var add = [];
    lines.forEach(function(line){
      var key = normalizeLine(line).split('=')[0].toLowerCase();
      if(!key || seen[key]) return;
      seen[key] = true;
      add.push(line);
    });
    if(add.length){
      box.value = current.concat(add).join('\n');
      try{ box.dispatchEvent(new Event('input',{bubbles:true})); }catch(_e){}
      try{ box.dispatchEvent(new Event('change',{bubbles:true})); }catch(_e){}
    }
    return add.length;
  }
  async function handleCustomerAction(card, action, btn){
    var idx = Number(card.dataset.yx146Index || -1);
    var rows = window.__YX146_CUSTOMER_ITEMS__ || [];
    var row = rows[idx] || {};
    var source = card.dataset.source || sourceKey(row.source || '');
    var id = card.dataset.id || row.id || '';
    var customer = selectedCustomer() || row.customer_name || '';
    if(action === 'add-ship'){
      var added = appendShipItems([row]);
      toast(added ? '已加入出貨商品資料' : '這筆商品已在商品資料內', added ? 'ok' : 'warn');
      return;
    }
    if(action === 'to-orders' || action === 'to-master'){
      if(!customer){ customer = prompt('請輸入客戶名稱') || ''; customer = clean(customer); }
      if(!customer) return toast('請先選擇客戶','warn');
      await api('/api/items/transfer', {method:'POST', body:JSON.stringify({source:sourceApi(source), id:id, target:action === 'to-orders' ? 'orders' : 'master_order', customer_name:customer, allow_inventory_fallback:true})});
      toast(action === 'to-orders' ? '已加到訂單' : '已加到總單','ok');
      await selectCustomerFast(customer);
      return;
    }
    if(action === 'ship-row'){
      if(!confirm('直接出貨：' + customer + ' ' + (row.product_text || '') + '？')) return;
      await api('/api/items/transfer', {method:'POST', body:JSON.stringify({source:sourceApi(source), id:id, target:'ship', customer_name:customer, qty:row.qty || qtyFromText(row.product_text || '', 1), allow_inventory_fallback:true})});
      toast('已直接出貨','ok');
      await selectCustomerFast(customer);
      return;
    }
    if(action === 'delete-row'){
      if(!confirm('確定刪除這筆' + sourceTitle(source) + '商品？')) return;
      await api(endpointFor(source, id), {method:'DELETE'});
      toast('已刪除','ok');
      await selectCustomerFast(customer);
      return;
    }
    if(action === 'edit-row'){
      var next = prompt('修改商品資料', row.product_text || '');
      if(next == null) return;
      next = normalizeLine(next);
      if(!next) return toast('商品資料不能空白','warn');
      var mat = prompt('修改材質（可留空）', materialOf(row) === '未填材質' ? '' : materialOf(row));
      await api(endpointFor(source, id), {method:'PUT', body:JSON.stringify({customer_name:customer, product_text:next, material:clean(mat || ''), product_code:clean(mat || ''), qty:qtyFromText(next, row.qty || 1), location:row.location || ''})});
      toast('已更新商品','ok');
      await selectCustomerFast(customer);
      return;
    }
  }
  function bindCustomerItemActions(){
    window.addEventListener('click', function(e){
      var addAll = e.target && e.target.closest && e.target.closest('#yx146-add-all-customer-items,#ship-add-all-items');
      if(addAll && mod()==='ship'){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
        var items = window.__YX146_CUSTOMER_ITEMS__ || window.__YX_SHIP_CUSTOMER_ITEMS__ || [];
        var n = appendShipItems(items);
        toast(n ? ('已加入 ' + n + ' 筆商品') : '沒有可加入的新商品', n ? 'ok' : 'warn');
        return;
      }
      var shipBtn = e.target && e.target.closest && e.target.closest('[data-yx146-ship-index]');
      if(shipBtn && mod()==='ship'){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
        var items = window.__YX146_CUSTOMER_ITEMS__ || window.__YX_SHIP_CUSTOMER_ITEMS__ || [];
        var row = items[Number(shipBtn.dataset.yx146ShipIndex || -1)];
        var n = appendShipItems(row ? [row] : []);
        toast(n ? '已加入出貨商品資料' : '這筆商品已在商品資料內', n ? 'ok' : 'warn');
        return;
      }
      var btn = e.target && e.target.closest && e.target.closest('[data-yx146-action]');
      if(!btn) return;
      var card = btn.closest('.yx146-customer-item');
      if(!card) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
      if(btn.dataset.yx146Busy === '1') return;
      (async function(){
        try{ setBusy(btn,true,'處理中…'); await handleCustomerAction(card, btn.dataset.yx146Action, btn); }
        catch(err){ toast(err.message || '操作失敗','error'); }
        finally{ setBusy(btn,false); }
      })();
    }, true);
  }

  function parseShipItems(){
    var raw = String($('ocr-text') && $('ocr-text').value || '').replace(/\r/g,'\n');
    return raw.split(/\n+/).map(normalizeLine).filter(function(line){ return line && /\d+(?:\.\d+)?x\d+/i.test(line); }).map(function(line){
      return {product_text:line, qty:qtyFromText(line,1), material:'', product_code:''};
    });
  }
  function renderShipPreview(data, payload){
    var sec = $('ship-preview-section'); if(sec) sec.style.display = '';
    var panel = $('ship-preview-panel') || $('module-result');
    if(!panel) return;
    panel.classList.remove('hidden');
    panel.style.display = '';
    var rows = data.items || data.breakdown || [];
    var total = payload.items.reduce(function(s,it){ return s + Number(it.qty || 0); }, 0);
    var htmlRows = rows.length ? rows.map(function(r){
      var src = r.source_label || r.source || r.recommendation || '';
      var before = r.deduct_before ? ('出貨前：總單 ' + (r.deduct_before.master||0) + '｜訂單 ' + (r.deduct_before.order||0) + '｜庫存 ' + (r.deduct_before.inventory||0)) : ('可扣：總單 ' + (r.master_available||0) + '｜訂單 ' + (r.order_available||0) + '｜庫存 ' + (r.inventory_available||0));
      var after = r.deduct_after ? ('出貨後：總單 ' + (r.deduct_after.master||0) + '｜訂單 ' + (r.deduct_after.order||0) + '｜庫存 ' + (r.deduct_after.inventory||0)) : '';
      var shortage = Number(r.shortage_qty || r.shortage || 0);
      return '<div class="deduct-card yx146-preview-row '+(shortage?'has-shortage':'')+'"><div><strong>'+esc(r.product_text||'')+'</strong><span class="yx146-qty">'+Number(r.qty||0)+'件</span></div><div class="small-note">'+esc(src)+'</div><div class="small-note">'+esc(before)+'</div>'+(after?'<div class="small-note">'+esc(after)+'</div>':'')+(shortage?'<div class="error-card compact">不足 '+shortage+'</div>':'')+'</div>';
    }).join('') : '<div class="empty-state-card compact-empty">沒有預覽資料</div>';
    panel.innerHTML = '<div class="success-card yx146-ship-preview"><div class="section-title">出貨預覽</div><div class="small-note">'+esc(data.message || '請確認後扣除。')+'</div><div class="ship-preview-summary"><div class="ship-summary-chip">本次件數<span>'+total+'</span></div></div></div>' + htmlRows + '<div class="btn-row"><button type="button" class="ghost-btn" id="yx146-ship-cancel">取消</button><button type="button" class="primary-btn" id="yx146-ship-confirm">確認扣除</button></div>';
    $('yx146-ship-cancel') && $('yx146-ship-cancel').addEventListener('click', function(){ panel.classList.add('hidden'); }, {once:true});
    $('yx146-ship-confirm') && $('yx146-ship-confirm').addEventListener('click', async function(){
      var btn = this;
      if(btn.dataset.yx146Busy === '1') return;
      try{
        setBusy(btn,true,'扣除中…');
        var result = await api('/api/ship', {method:'POST', body:JSON.stringify(Object.assign({}, payload, {allow_inventory_fallback:true, preview_confirmed:true, request_key:requestKey('ship146_confirm')}))});
        renderShipDone(result);
        toast('出貨完成','ok');
        try{ if(selectedCustomer()) await selectCustomerFast(selectedCustomer()); }catch(_e){}
      }catch(err){ toast(err.message || '出貨失敗','error'); setBusy(btn,false); }
    }, {once:true});
  }
  function renderShipDone(result){
    var panel = $('ship-preview-panel') || $('module-result');
    if(!panel) return;
    var rows = result.breakdown || [];
    panel.classList.remove('hidden');
    panel.style.display = '';
    panel.innerHTML = '<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已完成扣除，並保留所有功能按鈕。</div></div>' + (rows.length ? rows.map(function(r){
      return '<div class="deduct-card"><strong>'+esc(r.product_text||'')+'</strong><div class="small-note">本次出貨 '+Number(r.qty||0)+' 件｜扣總單 '+Number(r.master_deduct||0)+'｜扣訂單 '+Number(r.order_deduct||0)+'｜扣庫存 '+Number(r.inventory_deduct||0)+'</div></div>';
    }).join('') : '<div class="empty-state-card compact-empty">已送出。</div>');
  }
  async function shipSubmit(){
    var customer = selectedCustomer();
    var items = parseShipItems();
    if(!customer){ toast('請先選擇或輸入客戶名稱','warn'); return false; }
    if(!items.length){ toast('請輸入或加入要出貨的商品資料','warn'); return false; }
    var payload = {customer_name:customer, ocr_text:String($('ocr-text').value || ''), items:items, allow_inventory_fallback:true, request_key:requestKey('ship146_preview')};
    var btn = $('submit-btn');
    try{
      setBusy(btn,true,'整理預覽中…');
      var preview = await api('/api/ship-preview', {method:'POST', body:JSON.stringify(payload)});
      renderShipPreview(preview, payload);
      return true;
    }catch(err){
      var panel = $('ship-preview-panel') || $('module-result');
      if(panel){ panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML = '<div class="error-card">'+esc(err.message || '出貨預覽失敗')+'</div>'; }
      toast(err.message || '出貨預覽失敗','error');
      return false;
    }finally{ setBusy(btn,false); }
  }
  function installShipOverride(){
    window.addEventListener('click', function(e){
      if(mod() !== 'ship') return;
      var btn = e.target && e.target.closest && e.target.closest('#submit-btn');
      if(!btn) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
      shipSubmit();
    }, true);
    try{
      var old = window.confirmSubmit;
      var fn = function(){ if(mod()==='ship') return shipSubmit(); return typeof old === 'function' ? old.apply(this, arguments) : false; };
      Object.defineProperty(window, 'confirmSubmit', {value:fn, writable:true, configurable:true});
    }catch(_e){}
  }

  function install(){
    try{
      d.documentElement.dataset.yxFix146 = V;
      if(d.body) d.body.dataset.yxFix146 = '1';
    }catch(_e){}
    bindInstantNavigation();
    installSelectOverride();
    bindCustomerItemActions();
    installShipOverride();
    if(['orders','master_order','ship'].includes(mod()) && selectedCustomer()){
      loadCustomerItemsFast(selectedCustomer(), {silent:true}).catch(function(){});
    }
    if(mod()==='settings' || mod()==='home' || mod()==='inventory' || mod()==='orders' || mod()==='master_order'){
      // 不在當前頁跑無關輪詢；避免返回主頁與商品清單被舊版重畫拖慢。
      setTimeout(function(){ try{ window.YXHardLock && window.YXHardLock.cancelLegacyTimers && window.YXHardLock.cancelLegacyTimers('fix146-page-ready'); }catch(_e){} }, 380);
    }
  }
  window.YX146SpeedShipProductHome = {version:V, install:install, selectCustomer:selectCustomerFast, loadCustomerItems:loadCustomerItemsFast, shipSubmit:shipSubmit};

  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', function(){
    navStarted = false;
    try{ d.documentElement.classList.remove('yx146-leaving'); var m=$('yx146-fast-nav-mask'); m && m.remove(); }catch(_e){}
    setTimeout(install, 0);
  });
})();
