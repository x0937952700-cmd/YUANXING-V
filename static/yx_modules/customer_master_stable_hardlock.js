/* FIX119 總單 / 北中南客戶穩定母版：舊介面不接管、缺漏客戶補回、避免開頁跳版 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const $ = id => document.getElementById(id);
  const state = {observer:null, repairTimer:null, loading:false, lastLoadAt:0};
  const isCustomerPage = () => ['orders','master_order','ship','customers'].includes(YX.moduleKey()) || !!$('region-north') || !!$('customers-north');
  const boardIds = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'];
  const boards = () => boardIds.map($).filter(Boolean);

  function regionApi(){
    return window.YX119CustomerRegions || window.YX117CustomerRegions || window.YX116CustomerRegions || window.YX115CustomerRegions || window.YX114CustomerRegions || window.YX113CustomerRegions;
  }

  function markReady(){
    document.documentElement.dataset.yx119Customers = 'locked';
    document.documentElement.dataset.yx119CustomersReady = '1';
    document.documentElement.dataset.yx119CustomerStable = 'locked';
  }

  function hasLegacyDom(){
    return boards().some(el => {
      if (!el) return false;
      if (el.querySelector('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow')) return true;
      const cards = Array.from(el.querySelectorAll('.customer-region-card,[data-customer-name]')).filter(c => !c.classList.contains('empty-state-card'));
      return cards.some(c => !c.classList.contains('yx119-customer-card') && !c.classList.contains('yx117-customer-card') && !c.classList.contains('yx116-customer-card'));
    });
  }

  function cleanLegacyDom(){
    document.documentElement.dataset.yx115Customers = 'locked';
    document.documentElement.dataset.yx116Customers = 'locked';
    document.documentElement.dataset.yx117Customers = 'locked';
    document.documentElement.dataset.yx119Customers = 'locked';
    boards().forEach(el => {
      el.classList.add('yx119-customer-list','yx117-customer-list','yx114-customer-list');
      el.querySelectorAll('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow').forEach(x => { x.style.display = 'none'; x.setAttribute('aria-hidden','true'); });
    });
  }

  async function reloadCustomers(reason){
    const api = regionApi();
    if (!api || typeof api.loadCustomerBlocks !== 'function') return;
    const now = Date.now();
    if (state.loading || (reason !== 'force' && now - state.lastLoadAt < 550)) return;
    state.loading = true;
    state.lastLoadAt = now;
    try {
      await api.loadCustomerBlocks(true);
      cleanLegacyDom();
      markReady();
    } catch(e) {
      // 不讓母版錯誤影響原本功能，只顯示既有 DOM。
      try { console.warn('FIX119 customer stable reload failed', e); } catch(_e) {}
      markReady();
    } finally {
      state.loading = false;
    }
  }

  function forwardLegacyGlobals(){
    const api = regionApi();
    if (!api || typeof api.loadCustomerBlocks !== 'function') return;
    const loadFn = YX.mark(function(force){ return api.loadCustomerBlocks(force !== false); }, 'fix119_customer_load');
    const renderFn = YX.mark(function(){ return api.loadCustomerBlocks(true); }, 'fix119_customer_render');
    try { YX.hardAssign('loadCustomerBlocks', loadFn, {configurable:false}); } catch(_e) { window.loadCustomerBlocks = loadFn; }
    try { YX.hardAssign('renderCustomers', renderFn, {configurable:false}); } catch(_e) { window.renderCustomers = renderFn; }
    window.YX119CustomerRegions = api;
  }

  function scheduleRepair(reason){
    if (state.repairTimer) return;
    state.repairTimer = setTimeout(() => {
      state.repairTimer = null;
      forwardLegacyGlobals();
      cleanLegacyDom();
      if (hasLegacyDom() || reason === 'force') reloadCustomers(reason || 'repair');
      else markReady();
    }, 70);
  }

  function observeBoards(){
    if (state.observer || !isCustomerPage()) return;
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if (typeof NativeMO === 'undefined') return;
    const targets = boards();
    if (!targets.length) return;
    state.observer = new NativeMO(muts => {
      for (const m of muts){
        const added = Array.from(m.addedNodes || []).filter(n => n && n.nodeType === 1);
        if (!added.length) continue;
        if (added.some(n => n.matches?.('.customer-region-card:not(.yx116-customer-card),.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow') || n.querySelector?.('.customer-region-card:not(.yx116-customer-card),.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow'))) {
          scheduleRepair('legacy-dom');
          break;
        }
      }
    });
    targets.forEach(t => state.observer.observe(t, {childList:true, subtree:true}));
  }

  function install(){
    if (!isCustomerPage()) return;
    document.documentElement.dataset.yx119Customers = 'locked';
    forwardLegacyGlobals();
    cleanLegacyDom();
    observeBoards();
    reloadCustomers('force');
    [120, 260, 520, 1100, 2200, 4200].forEach(ms => setTimeout(() => {
      forwardLegacyGlobals();
      cleanLegacyDom();
      if (hasLegacyDom()) reloadCustomers('legacy-timer');
      else markReady();
    }, ms));
  }

  YX.register('customer_master_stable', {install, reloadCustomers, cleanLegacyDom});
})();
