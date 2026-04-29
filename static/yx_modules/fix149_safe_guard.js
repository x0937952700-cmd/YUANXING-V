/* FIX149：安全保護層
   原則：舊檔保留、功能不刪、頁面不重做、按鈕不改。
   只做：CSS/初始化收斂、舊 API 回來不得覆蓋新畫面、危險操作 request_key、防登入過期/API 失敗卡死。 */
(function(){
  'use strict';
  var V = 'fix149-safe-guard';
  if(window.__YX149_SAFE_GUARD__) return;
  window.__YX149_SAFE_GUARD__ = true;

  var d = document;
  var originalFetch = window.fetch.bind(window);
  var staleGroups = Object.create(null);
  var wrappedNames = Object.create(null);
  var lastErrorAt = 0;

  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];}); }
  function moduleName(){
    try{
      var el = d.querySelector('.module-screen[data-module]');
      if(el) return el.getAttribute('data-module') || '';
      var p = location.pathname || '/';
      if(p === '/' || p === '') return 'home';
      if(p.indexOf('/settings') === 0) return 'settings';
      if(p.indexOf('/today-changes') === 0) return 'today_changes';
      if(p.indexOf('/inventory') === 0) return 'inventory';
      if(p.indexOf('/orders') === 0) return 'orders';
      if(p.indexOf('/master-order') === 0) return 'master_order';
      if(p.indexOf('/ship') === 0) return 'ship';
      if(p.indexOf('/shipping-query') === 0) return 'shipping_query';
      if(p.indexOf('/warehouse') === 0) return 'warehouse';
      if(p.indexOf('/customers') === 0) return 'customers';
      if(p.indexOf('/todos') === 0) return 'todos';
      if(p.indexOf('/login') === 0) return 'login';
      return p.split('/').filter(Boolean)[0] || '';
    }catch(_e){ return ''; }
  }
  var PAGE = moduleName();
  try{
    d.documentElement.dataset.yxFix149 = V;
    d.documentElement.dataset.yxPageKind = PAGE;
    window.__YX149_PAGE_KIND__ = PAGE;
    window.__YX_STATIC_VERSION__ = V;
  }catch(_e){}

  function toast(msg, type){
    try{
      var fn = (window.YXHardLock && window.YXHardLock.toast) || window.toast || window.showToast || window.notify;
      if(typeof fn === 'function') fn(msg, type || 'error');
      else console.warn(msg);
    }catch(_e){}
  }

  function errorCard(message, kind){
    message = clean(message || '操作失敗，請再試一次');
    var now = Date.now();
    if(now - lastErrorAt < 650 && d.querySelector('.yx149-error-card')) return;
    lastErrorAt = now;
    try{
      var card = d.getElementById('yx149-error-card');
      if(!card){
        card = d.createElement('div');
        card.id = 'yx149-error-card';
        card.className = 'yx149-error-card';
        card.setAttribute('role','alert');
        card.innerHTML = '<div class="yx149-error-title">系統提醒</div><div class="yx149-error-msg"></div><button type="button" class="yx149-error-close">知道了</button>';
        (d.body || d.documentElement).appendChild(card);
        card.querySelector('.yx149-error-close').addEventListener('click', function(){ card.classList.remove('show'); }, false);
      }
      card.querySelector('.yx149-error-msg').textContent = message;
      card.dataset.kind = kind || 'error';
      card.classList.add('show');
      clearTimeout(card.__yx149Timer);
      card.__yx149Timer = setTimeout(function(){ card.classList.remove('show'); }, 5200);
    }catch(_e){}
  }

  function unlockBusy(){
    try{
      Array.prototype.forEach.call(d.querySelectorAll('button[disabled].yx148-busy,button[aria-busy="true"],button[data-yx148-busy="1"],button[data-yx149-busy="1"]'), function(btn){
        btn.disabled = false;
        btn.classList.remove('yx148-busy','yx149-busy');
        btn.removeAttribute('aria-busy');
        btn.dataset.yx148Busy = '0';
        btn.dataset.yx149Busy = '0';
        if(btn.dataset.yx148Text){ btn.textContent = btn.dataset.yx148Text; delete btn.dataset.yx148Text; }
        if(btn.dataset.yx149Text){ btn.textContent = btn.dataset.yx149Text; delete btn.dataset.yx149Text; }
      });
    }catch(_e){}
  }

  function requestKey(url, method, body){
    var seed = [
      V,
      method || 'POST',
      url || '',
      clean(body || '').slice(0,240),
      Date.now(),
      Math.random().toString(36).slice(2)
    ].join('|');
    var hash = 0, i, chr;
    for(i=0;i<seed.length;i++){ chr = seed.charCodeAt(i); hash = ((hash << 5) - hash) + chr; hash |= 0; }
    return 'yx149_' + Math.abs(hash) + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }

  function isRiskApi(path, method){
    method = String(method || 'GET').toUpperCase();
    if(!/^(POST|PUT|DELETE)$/.test(method)) return false;
    return (
      path === '/api/warehouse/cell' ||
      path === '/api/warehouse/move' ||
      path === '/api/warehouse/add-column' ||
      path === '/api/warehouse/add-slot' ||
      path === '/api/warehouse/remove-slot' ||
      path === '/api/warehouse/return-unplaced' ||
      path === '/api/customer-item' ||
      path === '/api/customer-items/batch-material' ||
      path === '/api/customer-items/batch-zone' ||
      path === '/api/customer-items/batch-delete' ||
      path === '/api/customers' ||
      path === '/api/customers/move' ||
      /^\/api\/customers\/[^/]+(?:\/restore)?$/.test(path)
    );
  }

  function staleGroup(path, search){
    if(path === '/api/customer-items') return 'customer-items';
    if(path === '/api/warehouse') return 'warehouse';
    if(path === '/api/warehouse/available-items') return 'warehouse-available';
    if(path === '/api/warehouse/search') return 'warehouse-search';
    if(path === '/api/customers') return 'customers';
    return '';
  }

  function addRequestKeyIfNeeded(input, init){
    init = init || {};
    var url = new URL((typeof input === 'string' ? input : (input && input.url) || ''), location.href);
    var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    if(!isRiskApi(url.pathname, method)) return init;

    var next = Object.assign({}, init);
    var headers = new Headers(next.headers || (input && input.headers) || {});
    var body = next.body;

    if(body == null || body === ''){
      var obj = {request_key: requestKey(url.pathname, method, '')};
      next.body = JSON.stringify(obj);
      headers.set('Content-Type','application/json');
      next.headers = headers;
      return next;
    }

    if(typeof body === 'string'){
      try{
        var data = JSON.parse(body || '{}');
        if(data && typeof data === 'object' && !Array.isArray(data) && !data.request_key){
          data.request_key = requestKey(url.pathname, method, body);
          next.body = JSON.stringify(data);
          headers.set('Content-Type','application/json');
          next.headers = headers;
        }
      }catch(_e){}
    }
    return next;
  }

  function installFetchGuard(){
    if(window.fetch && window.fetch.__yx149Guard) return;
    var guarded = function(input, init){
      var urlObj;
      try{ urlObj = new URL((typeof input === 'string' ? input : (input && input.url) || ''), location.href); }
      catch(_e){ return originalFetch(input, init); }
      init = addRequestKeyIfNeeded(input, init || {});
      var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      var group = method === 'GET' ? staleGroup(urlObj.pathname, urlObj.search) : '';
      var token = 0;
      if(group){
        token = (staleGroups[group] || 0) + 1;
        staleGroups[group] = token;
      }
      return originalFetch(input, init).then(function(res){
        if(res && res.status === 401 && urlObj.pathname.indexOf('/api/') === 0){
          unlockBusy();
          errorCard('登入已過期，請重新登入。', 'session');
          toast('登入已過期，請重新登入', 'error');
          setTimeout(function(){ try{ location.href = '/login'; }catch(_e){} }, 900);
        }
        if(group && staleGroups[group] !== token){
          var err = new Error('舊資料已忽略');
          err.name = 'YX149StaleResponse';
          err.yx149Stale = true;
          throw err;
        }
        return res;
      }).catch(function(err){
        if(err && err.yx149Stale) throw err;
        unlockBusy();
        var msg = (err && err.message) || '連線失敗，請再試一次';
        if(/timeout|逾時|abort/i.test(msg)) msg = '連線逾時，按鈕已解除鎖定，請再試一次。';
        if(urlObj.pathname.indexOf('/api/') === 0) errorCard(msg, 'api');
        throw err;
      });
    };
    guarded.__yx149Guard = true;
    window.fetch = guarded;
  }

  function allowedFor(fnName){
    var p = moduleName();
    var map = {
      renderWarehouse:['warehouse'],
      searchWarehouse:['warehouse'],
      saveWarehouseCell:['warehouse'],
      setWarehouseZone:['warehouse'],
      loadWarehouseAvailableItems:['warehouse'],
      toggleWarehouseUnplacedHighlight:['warehouse'],
      highlightWarehouseSameCustomer:['warehouse'],
      clearWarehouseHighlights:['warehouse'],
      loadShippingRecords:['shipping_query'],
      loadTodayChanges:['today_changes'],
      loadAuditTrails:['settings'],
      loadAdminUsers:['settings'],
      loadBackups:['settings'],
      createBackup:['settings'],
      downloadReport:['settings'],
      undoLastAction:['settings'],
      renderCustomers:['customers','orders','master_order','ship'],
      loadCustomerBlocks:['orders','master_order','ship'],
      selectCustomerForModule:['orders','master_order','ship'],
      loadShipCustomerItems:['ship'],
      loadShipCustomerItems66:['ship'],
      loadShipCustomerItems82:['ship'],
      loadShipCustomerItems83:['ship']
    };
    var allowed = map[fnName];
    return !allowed || allowed.indexOf(p) >= 0;
  }

  function wrapPageOnly(name){
    if(wrappedNames[name]) return;
    var fn = window[name];
    if(typeof fn !== 'function' || fn.__yx149PageOnly) return;
    var wrapped = function(){
      if(!allowedFor(name)){
        try{ console.debug('[FIX149] skip cross-page init:', name, moduleName()); }catch(_e){}
        return Promise.resolve({success:true, skipped:true, fix149:true});
      }
      return fn.apply(this, arguments);
    };
    wrapped.__yx149PageOnly = true;
    wrapped.__yx149Original = fn;
    try{ Object.defineProperty(window, name, {value:wrapped, configurable:true, writable:true}); }
    catch(_e){ window[name] = wrapped; }
    wrappedNames[name] = true;
  }

  function installPageInitGate(){
    [
      'renderWarehouse','searchWarehouse','saveWarehouseCell','setWarehouseZone','loadWarehouseAvailableItems',
      'toggleWarehouseUnplacedHighlight','highlightWarehouseSameCustomer','clearWarehouseHighlights',
      'loadShippingRecords','loadTodayChanges','loadAuditTrails','loadAdminUsers','loadBackups','createBackup',
      'downloadReport','undoLastAction','renderCustomers','loadCustomerBlocks','selectCustomerForModule',
      'loadShipCustomerItems','loadShipCustomerItems66','loadShipCustomerItems82','loadShipCustomerItems83'
    ].forEach(wrapPageOnly);
  }

  function installUnhandledGuard(){
    if(window.__YX149_UNHANDLED_GUARD__) return;
    window.__YX149_UNHANDLED_GUARD__ = true;
    window.addEventListener('unhandledrejection', function(ev){
      var err = ev && ev.reason;
      if(err && err.yx149Stale){
        ev.preventDefault && ev.preventDefault();
        return;
      }
      var msg = (err && err.message) || '';
      if(msg && /請先登入|401|登入已過期/.test(msg)){
        unlockBusy();
        errorCard('登入已過期，請重新登入。', 'session');
        setTimeout(function(){ try{ location.href='/login'; }catch(_e){} }, 900);
      }else if(msg && /逾時|timeout|failed|NetworkError|Load failed|連線/.test(msg)){
        unlockBusy();
        errorCard(msg, 'api');
      }
    });
  }

  function installHealth(){
    window.YX149HealthCheck = function(){
      var scripts = Array.prototype.map.call(d.scripts || [], function(s){ return (s.src || '').split('/').pop(); }).filter(Boolean);
      var links = Array.prototype.map.call(d.querySelectorAll('link[rel="stylesheet"]') || [], function(l){ return (l.href || '').split('/').pop(); }).filter(Boolean);
      return {
        version: V,
        page: moduleName(),
        endpoint: window.__YX_PAGE_ENDPOINT__ || '',
        cssCount: links.length,
        jsCount: scripts.length,
        appJsLoaded: scripts.some(function(s){ return s.indexOf('app.js') === 0; }),
        fetchGuard: !!(window.fetch && window.fetch.__yx149Guard),
        routeGateWrapped: Object.keys(wrappedNames),
        cssFiles: links,
        scriptFiles: scripts
      };
    };
  }

  function install(){
    installFetchGuard();
    installPageInitGate();
    installUnhandledGuard();
    installHealth();
    try{ d.documentElement.dataset.yxFix149Installed = '1'; if(d.body) d.body.dataset.yxFix149 = '1'; }catch(_e){}
  }

  install();
  var attempts = 0;
  var timer = setInterval(function(){
    installPageInitGate();
    attempts++;
    if(attempts > 80) clearInterval(timer);
  }, 50);
  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  window.addEventListener('pageshow', install);
  window.YX149SafeGuard = {version:V, install:install, health:function(){ return window.YX149HealthCheck && window.YX149HealthCheck(); }};
})();