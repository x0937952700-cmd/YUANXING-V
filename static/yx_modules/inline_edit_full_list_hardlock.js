/* FIX128 母版接管器：商品完整直列顯示 + 批量/小卡直接編輯，阻止舊版下拉與 prompt 編輯搶畫面 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  function cleanup(){
    document.documentElement.dataset.yx128InlineEdit = 'locked';
    document.documentElement.dataset.yx128FullList = 'locked';
    document.querySelectorAll('#ship-customer-item-select').forEach(sel => {
      sel.classList.add('yx128-hidden-select');
      sel.setAttribute('aria-hidden','true');
      sel.tabIndex = -1;
    });
    document.querySelectorAll('.yx63-toolbar,.yx63-summary,.yx63-card-list,.fix57-toolbar,.fix57-summary-panel').forEach(el => {
      if (!el.closest('.yx113-summary') && !el.classList.contains('yx113-product-list')) {
        el.classList.add('yx128-hidden-legacy-product');
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });
  }
  function install(){
    cleanup();
    try { window.YX_MASTER = Object.freeze({...(window.YX_MASTER || {}), version:'fix144-modular-master-hardlock', inlineEdit:true, fullList:true}); } catch(_e) {}
    [80, 220, 650, 1400, 2600].forEach(ms => setTimeout(cleanup, ms));
  }
  YX.register('inline_edit_full_list', {install, cleanup});
})();
