/* FIX135 商品來源橋接保險版：只當相容入口，不再搶 window 唯讀硬鎖，避免舊版覆蓋與紅色錯誤卡 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  function moduleSource(){
    const m = YX.moduleKey();
    if (m === 'inventory') return 'inventory';
    if (m === 'orders') return 'orders';
    if (m === 'master_order') return 'master_order';
    return '';
  }
  function productMaster(){
    return window.YX135ProductActions || window.YX132ProductActions || window.YX129ProductActions || window.YX128ProductActions || window.YX113ProductActions;
  }
  async function bridgeLoadSource(source, opts){
    source = source || moduleSource();
    const pa = productMaster();
    if (pa && typeof pa.loadSource === 'function' && pa.loadSource !== bridgeLoadSource) return pa.loadSource(source, opts || {});
    const endpoint = source === 'inventory' ? '/api/inventory' : source === 'orders' ? '/api/orders' : source === 'master_order' ? '/api/master_orders' : '';
    if (!endpoint) return [];
    const d = await YX.api(endpoint + '?yx135_bridge=1&ts=' + Date.now(), {method:'GET'});
    return Array.isArray(d.items) ? d.items : (Array.isArray(d.rows) ? d.rows : []);
  }
  function defineSoft(name, fn){
    try {
      const desc = Object.getOwnPropertyDescriptor(window, name);
      if (desc && desc.configurable === false) return;
      const current = desc && ('value' in desc ? desc.value : (typeof desc.get === 'function' ? desc.get.call(window) : undefined));
      if (current && current.__yx113HardLock) return;
      if (typeof current === 'function' && /loadSource|refreshSource|loadInventory|loadOrders|loadMaster/i.test(name)) return;
      Object.defineProperty(window, name, {value:fn, writable:true, configurable:true, enumerable:false});
    } catch(_e) {}
  }
  function exposeOnlyWhenMissing(){
    const pa = productMaster();
    if (pa && typeof pa.loadSource === 'function') return;
    defineSoft('loadSource', bridgeLoadSource);
    defineSoft('refreshSource', bridgeLoadSource);
    defineSoft('loadInventory', () => bridgeLoadSource('inventory'));
    defineSoft('loadOrdersList', () => bridgeLoadSource('orders'));
    defineSoft('loadMasterList', () => bridgeLoadSource('master_order'));
  }
  function install(){
    document.documentElement.dataset.yx135ProductSourceBridge = 'locked';
    window.YX135ProductSourceBridge = Object.freeze({loadSource:bridgeLoadSource, moduleSource});
    exposeOnlyWhenMissing();
    [120, 420, 1200].forEach(ms => setTimeout(exposeOnlyWhenMissing, ms));
  }
  YX.register('product_source_bridge', {install, loadSource:bridgeLoadSource});
})();
