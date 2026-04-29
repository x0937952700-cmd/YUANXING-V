document.addEventListener('DOMContentLoaded',()=>{
  const b=YX.$('#loadRecords'); if(b) b.onclick=loadRecords;
  const q=YX.$('#recordSearch'); if(q) q.addEventListener('input',()=>{ clearTimeout(window.__recT); window.__recT=setTimeout(loadRecords,250); });
  loadRecords();
});
async function loadRecords(){
  const params=new URLSearchParams();
  const q=YX.$('#recordSearch')?.value.trim(); if(q) params.set('q',q);
  const f=YX.$('#dateFrom')?.value; if(f) params.set('from',f);
  const t=YX.$('#dateTo')?.value; if(t) params.set('to',t);
  const d=await YX.api('/api/shipping-records?'+params.toString());
  const box=YX.$('#recordsList');
  if(!d.records.length){ box.innerHTML='<div class="empty">目前沒有出貨紀錄</div>'; return; }
  box.innerHTML=d.records.map(r=>`<article class="item-card record-card" data-detail="${YX.esc(JSON.stringify(r))}"><div class="item-main"><div><div><b>${YX.esc(r.customer_name||'庫存')}</b> <span class="source">${YX.esc(r.source_table||'')}</span></div><div class="prod">${YX.esc(r.product_text||'')}</div><div class="hint">${YX.esc(r.material||'未填材質')}｜${r.pieces||0}件｜材積 ${r.volume||0}｜重量 ${r.total_weight||0}</div></div><div class="pieces">${YX.esc(r.created_at||'')}</div></div></article>`).join('');
  YX.$$('.record-card',box).forEach(card=>card.onclick=()=>{try{const r=JSON.parse(card.dataset.detail); alert(`出貨詳細\n客戶：${r.customer_name||'庫存'}\n商品：${r.product_text||''}\n件數：${r.pieces||0}\n扣除來源：${r.source_table||''}\n材積：${r.volume||0}\n重量係數：${r.weight_unit||0}\n總重：${r.total_weight||0}\n操作者：${r.operator||''}\n時間：${r.created_at||''}`);}catch(e){}});
}
