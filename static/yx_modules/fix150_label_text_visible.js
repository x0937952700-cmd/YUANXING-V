/* FIX150：標籤文字顯示安全修復
   原則：不刪功能、不改頁面結構、不動按鈕，只把按鈕/標籤文字包一層可見文字層，避免內圈背景或舊 CSS 蓋住文字。 */
(function(){
  'use strict';
  var V = 'fix150-label-text-visible';
  if(window.__YX150_LABEL_TEXT_VISIBLE__) return;
  window.__YX150_LABEL_TEXT_VISIBLE__ = true;

  var SELECTOR = [
    '.menu-btn','a.menu-btn','.home-mini-btn','a.home-mini-btn','.user-cell',
    '.primary-btn','button.primary-btn','.ghost-btn','button.ghost-btn','.back-btn','a.back-btn',
    '.danger-btn','button.danger-btn','.btn-danger','.chip','button.chip','.pill','.tiny-btn','.small-btn','.icon-btn',
    '.interactive-pill','.category-title','.customer-mini-tag','.customer-chip','.customer-region-card','.zone-switch','.pwa-install-btn',
    '.yx113-toolbar button','.yx113-product-actions button','.yx113-action-stack button','.yx114-batch-actions button',
    '#today-changes-page button','#customers-section button','#warehouse-section button'
  ].join(',');

  function skip(el){
    if(!el || el.nodeType !== 1) return true;
    var tag = String(el.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') return true;
    if(el.isContentEditable) return true;
    return false;
  }

  function wrapTextNode(el, node){
    var text = node && node.nodeValue ? node.nodeValue : '';
    if(!text || !text.trim()) return;
    var span = document.createElement('span');
    span.className = 'yx150-label-text';
    span.textContent = text;
    el.replaceChild(span, node);
  }

  function markChild(node){
    if(!node || node.nodeType !== 1) return;
    var tag = String(node.tagName || '').toLowerCase();
    if(tag === 'svg' || tag === 'img' || tag === 'path' || tag === 'style' || tag === 'script') return;
    try{ node.classList.add('yx150-label-text'); }catch(_e){}
  }

  function repairOne(el){
    if(skip(el)) return;
    try{
      el.classList.add('yx150-text-fixed');
      el.dataset.yx150TextVisible = '1';
      Array.prototype.slice.call(el.childNodes).forEach(function(node){
        if(node.nodeType === 3) wrapTextNode(el, node);
        else markChild(node);
      });
      var visible = String(el.textContent || '').trim();
      if(!visible){
        var fallback = String(el.getAttribute('aria-label') || el.getAttribute('title') || el.dataset.label || '').trim();
        if(fallback){
          var span = document.createElement('span');
          span.className = 'yx150-label-text';
          span.textContent = fallback;
          el.appendChild(span);
        }
      }
    }catch(_e){}
  }

  function apply(root){
    try{
      document.documentElement.dataset.yx150LabelText = 'locked';
      document.documentElement.dataset.yxFix150 = V;
      window.__YX_STATIC_VERSION__ = V;
    }catch(_e){}
    var scope = root && root.querySelectorAll ? root : document;
    try{ Array.prototype.forEach.call(scope.querySelectorAll(SELECTOR), repairOne); }catch(_e){}
  }

  var timer = 0;
  function schedule(){
    if(timer) return;
    timer = setTimeout(function(){ timer = 0; apply(document); }, 40);
  }

  function install(){
    apply(document);
    [0,60,160,360,800,1600,3200].forEach(function(ms){ setTimeout(function(){ apply(document); }, ms); });
    return true;
  }

  try{ window.YX150LabelTextVisible = Object.freeze({version:V, install:install, apply:apply}); }catch(_e){}
  if(window.YXHardLock && typeof window.YXHardLock.register === 'function'){
    try{ window.YXHardLock.register('fix150_label_text_visible', {install:install}); }catch(_e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  window.addEventListener('pageshow', install);
  document.addEventListener('yx:master-installed', install);
  try{
    var MO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if(MO){
      var obs = new MO(function(muts){
        for(var i=0;i<muts.length;i++){
          if((muts[i].addedNodes && muts[i].addedNodes.length) || (muts[i].removedNodes && muts[i].removedNodes.length)){ schedule(); break; }
        }
      });
      if(document.body) obs.observe(document.body, {childList:true, subtree:true});
      else document.addEventListener('DOMContentLoaded', function(){ try{ obs.observe(document.body, {childList:true, subtree:true}); }catch(_e){} }, {once:true});
    }
  }catch(_e){}
})();
