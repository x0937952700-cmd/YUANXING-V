/* FIX147：安全收斂加速層
   原則：不刪功能、不改頁面結構、不動按鈕；只把舊版重複請求、重複渲染、出貨舊入口收斂到新版。 */
(function(){
  'use strict';
  var V = 'fix147-safe-converge-speed';
  if (window.__YX147_SAFE_CONVERGE_SPEED__) return;
  window.__YX147_SAFE_CONVERGE_SPEED__ = true;

  var d = document;
  var nativeFetch = window.__YX147_NATIVE_FETCH__ || window.fetch.bind(window);
  window.__YX147_NATIVE_FETCH__ = nativeFetch;
  var fetchCache = new Map();
  var fetchInflight = new Map();
  var globalLocks = Object.create(null);
  var lastRun = Object.create(null);

  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function moduleKey(){
    try{
      var b = d.body && d.body.dataset && d.body.dataset.module;
      if(b) return b;
      var m = d.querySelector('.module-screen[data-module]');
      if(m) return m.getAttribute('data-module') || '';
      var p = location.pathname || '/';
      if(p.indexOf('/today-changes') >= 0) return 'today_changes';
      if(p.indexOf('/master-order') >= 0) return 'master_order';
      if(p.indexOf('/shipping-query') >= 0) return 'shipping_query';
      if(p.indexOf('/warehouse') >= 0) return 'warehouse';
      if(p.indexOf('/settings') >= 0) return 'settings';
      if(p.indexOf('/inventory') >= 0) return 'inventory';
      if(p.indexOf('/orders') >= 0) return 'orders';
      if(p.indexOf('/ship') >= 0) return 'ship';
      if(p.indexOf('/customers') >= 0) return 'customers';
      if(p.indexOf('/todos') >= 0) return 'todos';
      return p === '/' ? 'home' : '';
    }catch(_e){ return ''; }
  }
  function toast(msg, type){
    try{ (window.YXHardLock && window.YXHardLock.toast ? window.YXHardLock.toast : (window.toast || window.showToast || console.log))(msg, type || 'ok'); }
    catch(_e){ try{ console.log(msg); }catch(_e2){} }
  }
  function customerName(){
    return clean((d.getElementById('customer-name') || {}).value || window.__YX_SELECTED_CUSTOMER__ || '');
  }
  function shouldCache(url){
    try{
      var u = new URL(url, location.href);
      if(u.origin !== location.origin) return false;
      return u.pathname === '/api/customer-items' || u.pathname === '/api/warehouse/available-items';
    }catch(_e){ return false; }
  }
  function cacheKey(input, init){
    try{
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if(method !== 'GET') return '';
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if(!shouldCache(url)) return '';
      var u = new URL(url, location.href);
      return method + ' ' + u.pathname + '?' + u.searchParams.toString();
    }catch(_e){ return ''; }
  }

  // 只對安全 GET 做短暫快取與同請求合併，避免點客戶 / 出貨下拉重複打 API。
  window.fetch = function(input, init){
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if(method !== 'GET'){
      try{
        var mu = new URL((typeof input === 'string' ? input : (input && input.url) || ''), location.href);
        if(mu.origin === location.origin && mu.pathname.indexOf('/api/') === 0){
          return nativeFetch(input, init).then(function(res){ fetchCache.clear(); fetchInflight.clear(); return res; });
        }
      }catch(_e){}
    }
    var key = cacheKey(input, init || {});
    if(!key) return nativeFetch(input, init);
    var now = Date.now();
    var hit = fetchCache.get(key);
    if(hit && hit.expire > now){
      try{ return Promise.resolve(hit.response.clone()); }catch(_e){}
    }
    var pending = fetchInflight.get(key);
    if(pending){
      return pending.then(function(res){ return res.clone(); });
    }
    var p = nativeFetch(input, init).then(function(res){
      try{
        if(res && res.ok){
          var ttl = key.indexOf('/api/customers?') >= 0 ? 5000 : 9000;
          fetchCache.set(key, {expire:Date.now()+ttl, response:res.clone()});
        }
      }catch(_e){}
      return res;
    }).finally(function(){ setTimeout(function(){ fetchInflight.delete(key); }, 160); });
    fetchInflight.set(key, p.then(function(res){ return res.clone(); }));
    return p;
  };

  function singleFlight(name, delay, opts){
    opts = opts || {};
    var fn = window[name];
    if(typeof fn !== 'function' || fn.__yx147SingleFlight) return;
    var wrapped = function(){
      var args = Array.prototype.slice.call(arguments);
      var now = Date.now();
      var force = args.some(function(a){ return a === true || (a && typeof a === 'object' && (a.force || a.forceRender)); });
      if(!force && globalLocks[name]) return globalLocks[name];
      if(!force && lastRun[name] && now - lastRun[name] < delay && opts.returnLast !== false){
        return globalLocks[name] || Promise.resolve(window.__YX147_LAST_RESULT__ && window.__YX147_LAST_RESULT__[name]);
      }
      lastRun[name] = now;
      var p;
      try{ p = Promise.resolve(fn.apply(this, args)); }
      catch(e){ p = Promise.reject(e); }
      var lock = p.then(function(r){
        window.__YX147_LAST_RESULT__ = window.__YX147_LAST_RESULT__ || {};
        window.__YX147_LAST_RESULT__[name] = r;
        return r;
      }).finally(function(){ setTimeout(function(){ if(globalLocks[name] === lock) delete globalLocks[name]; }, delay); });
      globalLocks[name] = lock;
      return lock;
    };
    try{ Object.defineProperty(wrapped, '__yx147SingleFlight', {value:true}); }catch(_e){ wrapped.__yx147SingleFlight = true; }
    try{ Object.defineProperty(window, name, {value:wrapped, writable:true, configurable:true}); }
    catch(_e){ window[name] = wrapped; }
  }

  function installShipBridge(){
    var yx146 = window.YX146SpeedShipProductHome;
    if(!yx146 || typeof yx146.loadCustomerItems !== 'function') return;
    var load = function(arg){
      var name = clean(typeof arg === 'object' && arg ? (arg.name || arg.customer_name || arg.customerName) : arg);
      name = name || customerName();
      if(!name) return Promise.resolve([]);
      return yx146.loadCustomerItems(name, {forceRender:true});
    };
    ['loadShipCustomerItems','loadShipCustomerItems66','loadShipCustomerItems82','loadShipCustomerItems83'].forEach(function(n){
      try{ Object.defineProperty(window, n, {value:load, writable:true, configurable:true}); }
      catch(_e){ window[n] = load; }
    });
    if(typeof yx146.selectCustomer === 'function'){
      var select = function(name){ return yx146.selectCustomer(clean(name || customerName())); };
      try{ Object.defineProperty(window, 'selectCustomerForModule', {value:select, writable:true, configurable:true}); }
      catch(_e){ window.selectCustomerForModule = select; }
    }
    if(typeof yx146.shipSubmit === 'function'){
      var old = window.confirmSubmit;
      var confirm = function(){
        if(moduleKey() === 'ship') return yx146.shipSubmit();
        return typeof old === 'function' ? old.apply(this, arguments) : false;
      };
      confirm.__yx147ShipConfirm = true;
      try{ Object.defineProperty(window, 'confirmSubmit', {value:confirm, writable:true, configurable:true}); }
      catch(_e){ window.confirmSubmit = confirm; }
    }
  }

  function throttleMasterInstall(){
    try{
      if(window.YXHardLock && !window.YXHardLock.__yx147Throttled){
        var oldInstall = window.YXHardLock.install;
        var last = Object.create(null);
        window.YXHardLock.install = function(name, opts){
          var key = String(name || '');
          var now = Date.now();
          if(opts && opts.force && last[key] && now - last[key] < 650){
            return window.YXHardLock.installed && window.YXHardLock.installed[key] || null;
          }
          last[key] = now;
          return oldInstall.apply(this, arguments);
        };
        window.YXHardLock.__yx147Throttled = true;
      }
      if(typeof window.__YX_MASTER_REINSTALL__ === 'function' && !window.__YX_MASTER_REINSTALL__.__yx147SingleFlight){
        var oldRe = window.__YX_MASTER_REINSTALL__;
        var running = false;
        var lastAt = 0;
        var re = function(){
          var now = Date.now();
          if(running || now - lastAt < 700) return;
          running = true; lastAt = now;
          try{ return oldRe.apply(this, arguments); }
          finally{ setTimeout(function(){ running = false; }, 700); }
        };
        re.__yx147SingleFlight = true;
        window.__YX_MASTER_REINSTALL__ = re;
      }
    }catch(_e){}
  }

  function quietLegacyTimers(scope){
    var m = moduleKey();
    if(['home','settings','inventory','orders','master_order','ship','warehouse','today_changes','customers'].indexOf(m) < 0) return;
    try{ window.YXHardLock && window.YXHardLock.cancelLegacyTimers && window.YXHardLock.cancelLegacyTimers(scope || 'fix147-safe-converge'); }catch(_e){}
    try{ window.__YX96_CANCEL_LEGACY_TIMERS__ && window.__YX96_CANCEL_LEGACY_TIMERS__(); }catch(_e){}
  }

  function install(){
    try{
      d.documentElement.dataset.yxFix147 = V;
      if(d.body) d.body.dataset.yxFix147 = '1';
    }catch(_e){}
    installShipBridge();
    throttleMasterInstall();
    singleFlight('loadCustomerBlocks', 1200);
    singleFlight('renderCustomers', 1200);
    singleFlight('renderWarehouse', 700);
    singleFlight('loadTodayChanges', 1600);
    singleFlight('loadShippingRecords', 900);
    singleFlight('loadAuditTrails', 1400);
    singleFlight('loadAdminUsers', 1400);
    singleFlight('loadShipCustomerItems', 800);
    singleFlight('loadShipCustomerItems66', 800);
    singleFlight('loadShipCustomerItems82', 800);
    singleFlight('loadShipCustomerItems83', 800);
    try{ d.documentElement.classList.remove('yx146-leaving'); var mask = d.getElementById('yx146-fast-nav-mask'); if(mask) mask.remove(); }catch(_e){}
  }

  function afterReady(){
    install();
    setTimeout(function(){ install(); quietLegacyTimers('fix147-after-ready-1'); }, 950);
    setTimeout(function(){ install(); quietLegacyTimers('fix147-after-ready-2'); }, 2200);
  }

  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', afterReady, {once:true});
  else afterReady();
  window.addEventListener('pageshow', function(){ install(); setTimeout(function(){ quietLegacyTimers('fix147-pageshow'); }, 350); });
  window.addEventListener('beforeunload', function(){ quietLegacyTimers('fix147-beforeunload'); }, {capture:true});
  window.YX147SafeConvergeSpeed = {version:V, install:install, quiet:quietLegacyTimers, toast:toast};
})();
