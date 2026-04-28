/* FIX134 商品來源安全橋接：不重複寫唯讀 __yx113HardLock，避免紅色錯誤卡 */
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
  async function bridgeLoadSource(source){
    source = source || moduleSource();
    const pa = window.YX113ProductActions || window.YX128ProductActions || window.YX129ProductActions;
    if (pa && typeof pa.loadSource === 'function' && pa.loadSource !== bridgeLoadSource) return pa.loadSource(source);
    const endpoint = source === 'inventory' ? '/api/inventory' : source === 'orders' ? '/api/orders' : source === 'master_order' ? '/api/master_orders' : '';
    if (!endpoint) return [];
    const d = await YX.api(endpoint + '?yx132_bridge=1&ts=' + Date.now(), {method:'GET'});
    return Array.isArray(d.items) ? d.items : (Array.isArray(d.rows) ? d.rows : []);
  }
  function safeExpose(name, fn){
    // FIX134：只在安全時安裝橋接。若該名稱已被母版 hardAssign 鎖住，直接尊重母版，
    // 不再做任何指派，避免 Cannot assign to read only property / __yx113HardLock 紅色錯誤卡。
    try {
      const current = Object.getOwnPropertyDescriptor(window, name);
      const currentValue = current && ('value' in current ? current.value : undefined);
      if (currentValue === fn) return;
      if (currentValue && currentValue.__yx113HardLock) return;
      if (current && current.configurable === false) return;
      Object.defineProperty(window, name, {value:fn, configurable:true, enumerable:false, writable:true});
    } catch(_e) {
      // 不再 fallback 到 window[name] = fn，因為舊版 getter/setter 可能是唯讀。
    }
  }
  function expose(){
    safeExpose('loadSource', bridgeLoadSource);
    safeExpose('refreshSource', bridgeLoadSource);
    safeExpose('loadInventory', () => bridgeLoadSource('inventory'));
    safeExpose('loadOrdersList', () => bridgeLoadSource('orders'));
    safeExpose('loadMasterList', () => bridgeLoadSource('master_order'));
  }
  function install(){
    document.documentElement.dataset.yx132ProductSourceBridge='locked';
    expose();
    [80, 240, 700, 1500].forEach(ms => setTimeout(expose, ms));
  }
  YX.register('product_source_bridge', {install, loadSource:bridgeLoadSource});
})();
