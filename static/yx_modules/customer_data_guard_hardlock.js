/* FIX121 客戶資料安全母版：客戶清單/客戶商品快取保護，避免舊版重畫或瞬間空資料讓客戶看起來消失 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const PREFIX = 'yx121_customer_guard_';
  const mem = {customers:null, items:Object.create(null), apiWrapped:false};
  const clean = v => YX.clean(v || '');
  const keyOf = name => clean(name).replace(/FOB代付|FOB代|FOB|CNF/gi, ' ').replace(/\s+/g, ' ').trim() || clean(name);
  function safeSet(key, value){ try { localStorage.setItem(PREFIX + key, JSON.stringify({ts:Date.now(), value})); } catch(_e) {} }
  function safeGet(key){ try { const raw = localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw).value : null; } catch(_e) { return null; } }
  function cacheCustomers(items){
    if (!Array.isArray(items) || !items.length) return;
    mem.customers = items;
    safeSet('customers', items);
    window.__YX121_SAFE_CUSTOMERS__ = items;
  }
  function getCachedCustomers(){ return mem.customers || window.__YX121_SAFE_CUSTOMERS__ || safeGet('customers') || []; }
  function cacheCustomerItems(name, items){
    name = keyOf(name); if (!name || !Array.isArray(items) || !items.length) return;
    mem.items[name] = items;
    safeSet('items_' + name, items);
    window.__YX121_SAFE_CUSTOMER_ITEMS__ = window.__YX121_SAFE_CUSTOMER_ITEMS__ || {};
    window.__YX121_SAFE_CUSTOMER_ITEMS__[name] = items;
  }
  function getCachedCustomerItems(name){
    name = keyOf(name); if (!name) return [];
    return mem.items[name] || (window.__YX121_SAFE_CUSTOMER_ITEMS__ || {})[name] || safeGet('items_' + name) || [];
  }
  function parseQueryName(url){
    try {
      const u = new URL(url, location.origin);
      return u.searchParams.get('name') || u.searchParams.get('customer_name') || '';
    } catch(_e) { return ''; }
  }
  function snapshotBeforeDanger(url, opt){
    try {
      const method = String(opt?.method || 'GET').toUpperCase();
      if (method !== 'DELETE' && !/batch-delete/.test(String(url))) return;
      safeSet('last_danger_request', {url:String(url), opt:opt || {}, selected:window.__YX_SELECTED_CUSTOMER__ || '', at:new Date().toISOString(), customers:getCachedCustomers()});
    } catch(_e) {}
  }
  function wrapApi(){
    if (mem.apiWrapped || !YX.api) return;
    const oldApi = YX.api.bind(YX);
    const guarded = async function(url, opt={}){
      snapshotBeforeDanger(url, opt);
      const data = await oldApi(url, opt);
      const u = String(url || '');
      const method = String(opt?.method || 'GET').toUpperCase();
      if (method === 'GET' && /\/api\/customers(?:\?|$)/.test(u) && !/\/api\/customers\//.test(u)) {
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length) cacheCustomers(items);
        else {
          const cached = getCachedCustomers();
          if (cached.length) return {...data, success:true, items:cached, guarded_from_cache:true};
        }
      }
      if (method === 'GET' && /\/api\/customer-items(?:\?|$)/.test(u)) {
        const name = parseQueryName(u) || window.__YX_SELECTED_CUSTOMER__ || document.getElementById('customer-name')?.value || '';
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length) cacheCustomerItems(name, items);
        else {
          const cached = getCachedCustomerItems(name);
          if (cached.length) return {...data, success:true, items:cached, guarded_from_cache:true};
        }
      }
      return data;
    };
    guarded.__yx121CustomerGuard = true;
    YX.api = guarded;
    mem.apiWrapped = true;
  }
  function protectCustomerDom(){
    const input = document.getElementById('customer-name');
    if (input && !input.__yx121GuardBound) {
      input.__yx121GuardBound = true;
      input.addEventListener('change', () => { window.__YX_SELECTED_CUSTOMER__ = clean(input.value || window.__YX_SELECTED_CUSTOMER__ || ''); }, true);
      input.addEventListener('input', () => { if (clean(input.value)) window.__YX_SELECTED_CUSTOMER__ = clean(input.value); }, true);
    }
  }
  function install(){
    document.documentElement.dataset.yx121CustomerGuard = 'locked';
    wrapApi();
    protectCustomerDom();
    [80, 300, 900, 1800, 3600].forEach(ms => setTimeout(() => { wrapApi(); protectCustomerDom(); }, ms));
  }
  YX.register('customer_data_guard', {install, cacheCustomers, getCachedCustomers, cacheCustomerItems, getCachedCustomerItems});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
