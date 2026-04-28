(function(){'use strict';
  const M=()=>window.YX144; if(!M())return;
  function installWarehouse(){
    if(M().moduleKey()!=='warehouse')return;
    document.documentElement.dataset.yx144WarehouseMaster='locked';
    window.__YX_WAREHOUSE_MASTER_ONLY__=true;
    try{window.renderWarehouse?.(true);}catch(_e){}
    document.addEventListener('dragstart',e=>{const it=e.target.closest?.('[data-product-text],[data-warehouse-item]'); if(it)e.dataTransfer?.setData('text/plain',it.dataset.productText||it.textContent||'');},true);
    document.addEventListener('drop',e=>{const cell=e.target.closest?.('.warehouse-cell,[data-warehouse-cell]'); if(!cell)return; cell.classList.add('yx144-front-insert');},true);
  }
  M().register('page_warehouse_master',{install:installWarehouse});
  M().install('page_warehouse_master',true);
})();
