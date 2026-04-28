/* FIX129 商品來源母版橋接：所有庫存/訂單/總單刷新都導到 product_actions 母版，避免舊版呼叫 loadSource 失敗 */
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
    if (pa && typeof pa.loadSource === 'function') return pa.loadSource(source);
    const endpoint = source === 'inventory' ? '/api/inventory' : source === 'orders' ? '/api/orders' : source === 'master_order' ? '/api/master_orders' : '';
    if (!endpoint) return [];
    const d = await YX.api(endpoint + '?yx129_bridge=1&ts=' + Date.now(), {method:'GET'});
    return Array.isArray(d.items) ? d.items : [];
  }
  function expose(){
    const fn = YX.mark(bridgeLoadSource, 'product_source_bridge_129');
    const bridges = {
      loadSource: fn,
      refreshSource: fn,
      loadInventory: () => fn('inventory'),
      loadOrdersList: () => fn('orders'),
      loadMasterList: () => fn('master_order')
    };
    Object.entries(bridges).forEach(([name, raw]) => {
      const wrapped = YX.mark(raw, name + '_129');
      try { YX.hardAssign(name, wrapped, {configurable:false}); }
      catch(_e) { try { window[name] = wrapped; } catch(_e2){} }
    });
  }
  function install(){
    document.documentElement.dataset.yx129ProductSourceBridge='locked';
    expose();
    [80, 240, 700, 1500].forEach(ms => setTimeout(expose, ms));
  }
  YX.register('product_source_bridge', {install, loadSource:bridgeLoadSource});
})();
