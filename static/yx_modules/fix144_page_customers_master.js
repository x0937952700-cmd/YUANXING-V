(function(){'use strict';
  const M=()=>window.YX144; if(!M())return;
  function repairCustomerCards(){
    document.querySelectorAll('.customer-region-card,.yx113-customer-card,.yx116-customer-card').forEach(card=>{
      const raw=card.textContent.trim();
      if(!card.querySelector('.yx144-customer-name') && !card.querySelector('.customer-name')){
        const m=raw.match(/^(.*?)(CNF|FOB代|FOB)?\s*(\d+件\s*\/\s*\d+筆)?$/);
        if(m){card.innerHTML=`<span class="yx144-customer-name">${M().esc((m[1]||'').trim())}</span><span class="yx144-trade-tag">${M().esc(m[2]||'')}</span><span class="yx144-customer-count">${M().esc(m[3]||'')}</span>`;}
      }
    });
  }
  function instantCustomerClick(){
    document.addEventListener('click',e=>{
      const card=e.target.closest?.('.customer-region-card[data-customer-name],.yx113-customer-card[data-customer-name],.yx116-customer-card[data-customer-name]'); if(!card)return;
      const name=M().clean(card.dataset.customerName||card.dataset.customer||card.querySelector('.yx144-customer-name,.customer-name')?.textContent||''); if(!name)return;
      window.__YX_SELECTED_CUSTOMER__=name; M().state.lastCustomer=name; const input=document.getElementById('customer-name'); if(input)input.value=name;
      const s=M().moduleKey()==='orders'?'orders':M().moduleKey()==='master_order'?'master_order':'';
      if(s&&window.YX113ProductActions){try{window.YX113ProductActions.renderSummary?.(s); window.YX113ProductActions.renderCards?.(s);}catch(_e){}}
    },true);
  }
  M().register('page_customers_master',{install(){repairCustomerCards(); instantCustomerClick(); setTimeout(repairCustomerCards,120); setTimeout(repairCustomerCards,700);}});
  M().install('page_customers_master',true);
  document.addEventListener('yx144:installed',repairCustomerCards);
})();
