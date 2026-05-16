/* YX v520 warm-cache restore: route preload + API read-through cache.
   No overlay, no hardlock, no setInterval, no MutationObserver. Shipping page is excluded. */
(function(){
  'use strict';
  if (window.__YX_ROUTE_WARM_CACHE__) return;
  window.__YX_ROUTE_WARM_CACHE__ = true;
  const root = window.YX || (window.YX = {});
  const endpoint = String(window.__YX_PAGE_ENDPOINT__ || '');
  const isShip = endpoint === 'ship_page' || window.__YX_SHIP_SINGLE_LOCK__ === true || window.__YX_SHIP_SINGLE_LOCK__ === 'true';
  const VERSION = String(window.__YX_STATIC_VERSION__ || 'v520');
  const PREFIX = 'yx_v520_warm_cache_' + VERSION + '_';
  const DEFAULT_TTL = 1000 * 60 * 4;
  const LONG_TTL = 1000 * 60 * 30;
  const pending = new Map();
  const warmed = new Set();
  const SAFE = [
    /^\/api\/inventory(?:\?|$)/,
    /^\/api\/orders(?:\?|$)/,
    /^\/api\/master_orders(?:\?|$)/,
    /^\/api\/customers(?:\?|$)/,
    /^\/api\/customer-items(?:\?|$)/,
    /^\/api\/warehouse(?:\?|$)/,
    /^\/api\/today-changes(?:\?|$)/,
    /^\/api\/performance\/route-prewarm(?:\?|$)/,
    /^\/api\/performance\/cache-summary(?:\?|$)/,
    /^\/api\/sync\/status(?:\?|$)/,
    /^\/api\/recent-slots(?:\?|$)/
  ];
  const BLOCK = [/^\/api\/ship/, /^\/api\/shipping/, /^\/api\/diagnostics/, /^\/api\/health/, /^\/api\/logout/, /^\/api\/login/];
  const ROUTES = {
    home: ['/api/customers','/api/today-changes/count','/api/performance/route-prewarm?module=home'],
    inventory: ['/api/inventory','/api/customers','/api/performance/route-prewarm?module=inventory'],
    orders: ['/api/orders','/api/customers','/api/performance/route-prewarm?module=orders'],
    master_order: ['/api/master_orders','/api/customers','/api/performance/route-prewarm?module=master_order'],
    warehouse: ['/api/warehouse','/api/warehouse/available-items','/api/warehouse/source-qty-map','/api/warehouse/consistency-check','/api/performance/route-prewarm?module=warehouse'],
    today_changes: ['/api/today-changes/count','/api/today-changes','/api/performance/route-prewarm?module=today_changes'],
    settings: ['/api/sync/status','/api/performance/cache-summary'],
    customers: ['/api/customers','/api/performance/route-prewarm?module=customers'],
    todos: ['/api/todos'],
    shipping_query: ['/api/shipping_records']
  };
  function now(){ return Date.now(); }
  function idle(fn, delay){
    const run = () => { try { fn(); } catch(_e){} };
    if (delay) return setTimeout(run, delay);
    try { if (typeof requestIdleCallback === 'function') return requestIdleCallback(run, {timeout:1600}); } catch(_e){}
    return setTimeout(run, 0);
  }
  function urlPath(url){ try { return new URL(url, location.origin).pathname + new URL(url, location.origin).search; } catch(_e){ return String(url || ''); } }
  function key(url){ return PREFIX + btoa(unescape(encodeURIComponent(urlPath(url)))).replace(/=+$/,''); }
  function allowed(url){
    const p = urlPath(url);
    if (!p || isShip) return false;
    if (BLOCK.some(re => re.test(p))) return false;
    return SAFE.some(re => re.test(p));
  }
  function ttlFor(url){
    const p = urlPath(url);
    if (/warehouse|customer-items/.test(p)) return 1000 * 60 * 2;
    if (/customers|recent-slots/.test(p)) return LONG_TTL;
    if (/today-changes/.test(p)) return 1000 * 45;
    return DEFAULT_TTL;
  }
  function read(url, maxAge){
    try {
      const raw = localStorage.getItem(key(url));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.saved_at) return null;
      if (maxAge && now() - Number(obj.saved_at || 0) > maxAge) return null;
      return obj.data;
    } catch(_e){ return null; }
  }
  function write(url, data){
    try { localStorage.setItem(key(url), JSON.stringify({saved_at:now(), url:urlPath(url), data:data})); } catch(_e){}
  }
  function fetchFresh(url, opt){
    if (pending.has(url)) return pending.get(url);
    const api = root.__rawApiBeforeWarm || root.api;
    const p = Promise.resolve().then(() => api(url, Object.assign({method:'GET', timeout:2600}, opt || {}, {yxWarmFresh:true})))
      .then(data => { write(url, data); try { window.dispatchEvent(new CustomEvent('yx:warm-cache-refreshed', {detail:{url:urlPath(url), data:data}})); } catch(_e){} return data; })
      .catch(err => { try { root.degrade?.remember?.(url, 9999); } catch(_e){} throw err; })
      .finally(() => pending.delete(url));
    pending.set(url, p);
    return p;
  }
  function warm(url, opts){
    if (!allowed(url)) return Promise.resolve(null);
    const u = urlPath(url);
    if (warmed.has(u) && !(opts && opts.force)) return Promise.resolve(read(url, ttlFor(url)));
    warmed.add(u);
    const cached = read(url, ttlFor(url));
    return idle(() => fetchFresh(url, {timeout:(opts && opts.timeout) || 2400}).catch(()=>{}), (opts && opts.delay) || 0), Promise.resolve(cached);
  }
  function warmRoute(name, opts){
    if (isShip) return;
    const urls = ROUTES[name] || [];
    urls.forEach((u, i) => warm(u, {delay:((opts && opts.delay) || 0) + i * 180, timeout:2200}));
  }
  function currentModule(){
    return ({inventory_page:'inventory', orders_page:'orders', master_order_page:'master_order', warehouse_page:'warehouse', today_changes_page:'today_changes', settings_page:'settings', customers_page:'customers', todos_page:'todos', shipping_query_page:'shipping_query', home:'home'}[endpoint] || 'home');
  }
  function likelyNext(name){
    const map = {home:['inventory','orders','warehouse'], inventory:['orders','master_order','warehouse'], orders:['master_order','warehouse'], master_order:['warehouse','today_changes'], warehouse:['inventory','orders','today_changes'], today_changes:['home','warehouse'], settings:['diagnostics','home']};
    return map[name] || [];
  }
  function routeFromHref(href){
    const p = urlPath(href).split('?')[0];
    return ({'/':'home','/inventory':'inventory','/orders':'orders','/master-order':'master_order','/warehouse':'warehouse','/today-changes':'today_changes','/settings':'settings','/customers':'customers','/todos':'todos','/shipping-query':'shipping_query'}[p] || '');
  }
  function bindPrewarmLinks(){
    try {
      document.querySelectorAll('a[href],button[data-href],button[data-route]').forEach(el => {
        if (el.dataset.yxWarmBound === '1') return;
        const href = el.getAttribute('href') || el.dataset.href || el.dataset.route || '';
        const mod = routeFromHref(href);
        if (!mod) return;
        el.dataset.yxWarmBound = '1';
        el.addEventListener('pointerenter', () => warmRoute(mod, {delay:420}), {passive:true, once:true});
        el.addEventListener('touchstart', () => warmRoute(mod, {delay:120}), {passive:true, once:true});
      });
    } catch(_e){}
  }
  function installApiWrapper(){
    if (!root.api || root.__warmApiWrapped) return;
    root.__rawApiBeforeWarm = root.api;
    root.api = async function(url, opt){
      const method = String((opt && opt.method) || 'GET').toUpperCase();
      if (method !== 'GET' || (opt && (opt.noWarmCache || opt.yxWarmFresh)) || !allowed(url)) return root.__rawApiBeforeWarm(url, opt);
      const cached = read(url, ttlFor(url));
      if (cached) { idle(() => fetchFresh(url, opt).catch(()=>{}), 500); return cached; }
      const data = await root.__rawApiBeforeWarm(url, opt);
      write(url, data);
      return data;
    };
    root.__warmApiWrapped = true;
  }
  function start(){
    if (isShip) return;
    installApiWrapper();
    const mod = currentModule();
    warmRoute(mod, {delay:650});
    likelyNext(mod).slice(0,2).forEach((m, i) => warmRoute(m, {delay:2200 + i * 650}));
    bindPrewarmLinks();
  }
  root.warmCache = Object.assign(root.warmCache || {}, {version:'v520-restored', read, write, warm, warmRoute, bind:bindPrewarmLinks, routes:ROUTES, allowed});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => idle(start, 250), {once:true}); else idle(start, 250);
})();
