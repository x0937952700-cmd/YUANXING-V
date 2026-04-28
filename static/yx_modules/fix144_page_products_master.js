(function(){'use strict';
  const M=()=>window.YX144; if(!M())return;
  const source=()=>{const m=M().moduleKey(); return m==='inventory'?'inventory':m==='orders'?'orders':m==='master_order'?'master_order':'';};
  function normalizeButtons(){
    document.querySelectorAll('[data-yx113-action="edit"],button[data-action="edit"]').forEach(b=>{b.textContent='編輯';});
    document.querySelectorAll('[data-yx113-action="ship"],button[data-action="ship"]').forEach(b=>{b.textContent='直接出貨';});
    document.querySelectorAll('[data-yx113-action="delete"],button[data-action="delete"],.delete-btn').forEach(b=>{b.textContent=b.textContent.trim()||'刪除'; b.classList.add('danger-btn');});
    document.querySelectorAll('[data-yx113-batch-to-order]').forEach(b=>{b.textContent='加到訂單';});
    document.querySelectorAll('[data-yx113-batch-to-master]').forEach(b=>{b.textContent='加到總單';});
  }
  function enforceTableMode(){
    const s=source(); if(!s)return;
    document.body.dataset.yx144ProductSource=s;
    document.querySelectorAll('.yx113-product-card,.yx112-product-card').forEach(el=>{el.style.display='none';});
    document.querySelectorAll('.yx113-summary-wrap,.table-card').forEach(el=>{el.classList.add('yx144-table-master'); el.style.maxHeight='none'; el.style.overflow='visible';});
    normalizeButtons();
  }
  function loadNow(){
    const s=source(); if(!s)return;
    try{window.YX113ProductActions?.loadSource?.(s,{force:true});}
    catch(_e){try{window.loadSource?.(s);}catch(_e2){}}
    enforceTableMode();
  }
  M().register('page_products_master',{install(){if(!source())return; enforceTableMode(); loadNow(); setTimeout(enforceTableMode,80); setTimeout(enforceTableMode,360);}});
  M().install('page_products_master',true);
  document.addEventListener('yx144:installed',()=>{enforceTableMode();});
})();
