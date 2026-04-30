/* FIX136 標籤文字顯示修復母版：最後包住文字，避免舊版/內圈背景蓋住文字；不改 onclick/href/API。 */
(function(){
  'use strict';
  const V='fix138-final-master-warehouse-ship-hardlock';
  const SELECTOR=[
    '.yx124-ornate-label','.menu-btn','a.menu-btn','.home-mini-btn','a.home-mini-btn','.user-cell',
    '.primary-btn','button.primary-btn','.ghost-btn','button.ghost-btn','.back-btn','a.back-btn',
    '.danger-btn','button.danger-btn','.btn-danger','.chip','button.chip','.pill','.tiny-btn','.small-btn','.icon-btn',
    '.interactive-pill','.customer-mini-tag','.customer-chip','.customer-region-card','.zone-switch','.pwa-install-btn',
    '.yx113-toolbar button','.yx113-product-actions button','.yx113-action-stack button','.yx114-batch-actions button'
  ].join(',');
  function skip(el){
    if(!el || el.nodeType!==1) return true;
    const tag=(el.tagName||'').toLowerCase();
    return tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable;
  }
  function wrapTextNode(el,node){
    const text=node.nodeValue||'';
    if(!text || !text.trim()) return;
    const span=document.createElement('span');
    span.className='yx136-label-text';
    span.textContent=text;
    el.replaceChild(span,node);
  }
  function repairOne(el){
    if(skip(el)) return;
    el.classList.add('yx124-ornate-label');
    el.dataset.yx136LabelText='locked';
    Array.from(el.childNodes).forEach(node=>{
      if(node.nodeType===3) wrapTextNode(el,node);
      else if(node.nodeType===1 && node.classList) node.classList.add('yx136-label-text');
    });
    const visible=(el.textContent||'').trim();
    if(!visible){
      const fallback=(el.getAttribute('aria-label')||el.getAttribute('title')||el.dataset.label||'').trim();
      if(fallback){
        const span=document.createElement('span');
        span.className='yx136-label-text';
        span.textContent=fallback;
        el.appendChild(span);
      }
    }
  }
  function apply(root){
    document.documentElement.dataset.yx136LabelText='locked';
    document.documentElement.dataset.yx135MasterFinal='locked';
    const scope=root&&root.querySelectorAll?root:document;
    try{scope.querySelectorAll(SELECTOR).forEach(repairOne);}catch(_e){}
  }
  let timer=0;
  function schedule(){
    if(timer) return;
    timer=setTimeout(()=>{timer=0;apply(document);},40);
  }
  function install(){
    apply(document);
    [0,80,220,500,1000,2200,4200].forEach(ms=>setTimeout(()=>apply(document),ms));
    return true;
  }
  try{ window.YX136LabelTextRepair=Object.freeze({version:V,install,apply}); }catch(_e){}
  if(window.YXHardLock&&typeof window.YXHardLock.register==='function'){
    try{window.YXHardLock.register('label_text_repair',{install});}catch(_e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  window.addEventListener('pageshow',install);
  document.addEventListener('yx:master-installed',install);
  try{
    const MO=window.__YX96_NATIVE_MUTATION_OBSERVER__||window.MutationObserver;
    if(MO){
      const obs=new MO(muts=>{
        for(const m of muts){ if(m.addedNodes&&m.addedNodes.length){ schedule(); break; } }
      });
      if(document.body) obs.observe(document.body,{childList:true,subtree:true});
      else document.addEventListener('DOMContentLoaded',()=>obs.observe(document.body,{childList:true,subtree:true}),{once:true});
    }
  }catch(_e){}
})();
