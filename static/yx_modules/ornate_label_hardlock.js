/* FIX127 淺灰外圈等寬標籤母版硬鎖
   只接外觀母版：不改功能、不覆蓋 onclick/href/API。 */
(function(){
  'use strict';
  const VERSION = 'fix131-table-only-master-hardlock';
  const SELECTOR = [
    '.menu-btn','a.menu-btn','.home-mini-btn','a.home-mini-btn','.user-cell',
    '.primary-btn','button.primary-btn','.ghost-btn','button.ghost-btn','.back-btn','a.back-btn',
    '.danger-btn','button.danger-btn','.btn-danger','.chip','button.chip','.pill','.tiny-btn','.small-btn','.icon-btn',
    '.interactive-pill','.category-title','.customer-mini-tag','.customer-chip','.customer-region-card','.zone-switch','.pwa-install-btn',
    '.yx113-toolbar button','.yx113-product-actions button','.yx113-action-stack button','.yx114-batch-actions button',
    '.customer-list button','.customer-list .customer-card','.customer-list .customer-row',
    '#customers-section button','#warehouse-section button','#today-changes-page button'
  ].join(',');
  const BLOCK_LEGACY_SELECTOR = [
    '.yx115-hidden-legacy','.yx115-hidden-legacy-product','.yx88-hidden-legacy',
    '#yx94-refresh-today','#yx95-refresh-today','#yx96-refresh-today','#yx98-refresh-today',
    '.yx94-today-refresh-row','.yx95-today-refresh-row','.yx96-today-refresh-row','.yx98-today-refresh-row',
    '.customer-card-arrow','.fix48-customer-arrow','.yx113-customer-arrow',
    '#yx71-warehouse-cell-menu','#yx91-warehouse-batch-panel','#yx97-warehouse-batch-panel','#yx99-warehouse-batch-panel','#yx102-warehouse-batch-panel','#yx103-warehouse-batch-panel','#yx105-warehouse-batch-panel'
  ].join(',');
  let observer = null;
  let scheduled = 0;

  function shouldSkip(el){
    if (!el || el.nodeType !== 1) return true;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.classList.contains('text-input') || el.classList.contains('text-area')) return true;
    if (el.closest && el.closest('input,textarea,select,.text-input,.text-area')) return true;
    return false;
  }
  function apply(root){
    const scope = root && root.querySelectorAll ? root : document;
    document.documentElement.dataset.yx124OrnateLabel = 'locked';
    document.documentElement.dataset.yx124MasterLabel = 'locked';
    document.documentElement.dataset.yx127GrayRingEqualHome = 'locked';
    document.documentElement.classList.add('yx124-ornate-scope');
    try{
      scope.querySelectorAll(SELECTOR).forEach(el => {
        if (shouldSkip(el)) return;
        el.classList.add('yx124-ornate-label');
        el.dataset.yx124Label = 'locked';
        if ((el.classList.contains('menu-btn') || el.classList.contains('home-mini-btn')) && !el.getAttribute('role') && !/^a$/i.test(el.tagName||'')) el.setAttribute('role','button');
      });
    }catch(_e){}
    try{
      scope.querySelectorAll(BLOCK_LEGACY_SELECTOR).forEach(el => {
        el.classList.add('yx124-old-visual-disabled');
        el.dataset.yxLegacyHidden = '1';
        el.setAttribute('aria-hidden','true');
      });
    }catch(_e){}
  }
  function schedule(){
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = 0; apply(document); }, 80);
  }
  function install(){
    window.__YX124_ORNATE_LABEL_ACTIVE__ = true;
    apply(document);
    if (!observer) {
      try{
        const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
        if (NativeMO && document.body) {
          observer = new NativeMO(mutations => {
            for (const m of mutations) {
              if ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length)) { schedule(); break; }
            }
          });
          observer.observe(document.body, {childList:true, subtree:true});
        }
      }catch(_e){}
    }
    [0,120,360,900,1800,3600].forEach(ms => setTimeout(() => apply(document), ms));
    return true;
  }
  function bindClickGuard(){
    if (window.__YX124_ORNATE_CLICK_GUARD__) return;
    window.__YX124_ORNATE_CLICK_GUARD__ = true;
    document.addEventListener('click', function(ev){
      const dead = ev.target && ev.target.closest && ev.target.closest('[data-yx-legacy-hidden="1"],.yx124-old-visual-disabled,.yx115-hidden-legacy,.yx115-hidden-legacy-product,.yx88-hidden-legacy');
      if (!dead) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }, true);
  }

  window.YX124OrnateLabel = Object.freeze({version:VERSION, install, apply});
  bindClickGuard();
  if (window.YXHardLock && typeof window.YXHardLock.register === 'function') {
    window.YXHardLock.register('ornate_label', {install});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  window.addEventListener('pageshow', install);
  document.addEventListener('yx:master-installed', install);
})();
