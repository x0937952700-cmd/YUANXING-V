let shipItems=[]; let previewItems=[];
document.addEventListener('DOMContentLoaded',()=>{
  YX.attachCustomerSuggest(YX.$('#customerInput'));
  YX.$('#loadCustomerItems').onclick=()=>loadItems();
  YX.$('#previewShip').onclick=()=>preview();
  YX.$('#confirmShip').onclick=()=>confirmShip();
  const seed=sessionStorage.getItem('shipSeed');
  if(seed){ sessionStorage.removeItem('shipSeed'); YX.toast('已帶入直接出貨商品，請選客戶後載入確認'); }
});
async function loadItems(){
  const customer=YX.$('#customerInput').value.trim() || '庫存';
  const token=YX.nextToken('ship-items');
  const d=await YX.api('/api/customer-items?customer='+encodeURIComponent(customer));
  if(!YX.isFresh('ship-items', token)) return;
  shipItems=d.items||[]; renderShipItems();
}
function renderShipItems(){
  const box=YX.$('#shipItems');
  if(!shipItems.length){ box.innerHTML='<div class="empty">沒有可出貨商品</div>'; return; }
  box.innerHTML=shipItems.map(it=>`<article class="ship-card"><label class="row gap"><input type="checkbox" class="ship-check" data-source="${it.source}" data-id="${it.id}"><strong>${YX.esc(it.product_text)}</strong></label><div class="hint">${YX.esc(it.customer_name||'庫存')}｜${YX.esc(it.material||'未填材質')}｜${it.source}｜目前 ${it.pieces} 件</div><label>要出件數<input class="ship-pieces" data-source="${it.source}" data-id="${it.id}" type="number" min="1" max="${it.pieces}" value="${it.pieces}"></label></article>`).join('');
}
function selected(){
  return YX.$$('.ship-check:checked').map(cb=>{ const inp=YX.$(`.ship-pieces[data-source="${cb.dataset.source}"][data-id="${cb.dataset.id}"]`); return {source:cb.dataset.source,id:Number(cb.dataset.id),pieces:Number(inp?.value||0)}; });
}
async function preview(){
  const btn=YX.$('#previewShip');
  await YX.safe(btn,async()=>{
    const items=selected(); if(!items.length) throw new Error('請先選取要出貨商品');
    const d=await YX.api('/api/shipping/preview',{method:'POST',body:{customer_name:YX.$('#customerInput').value.trim(), weight_unit:YX.$('#weightUnit').value||0, items}});
    previewItems=items;
    YX.$('#shipPreview').innerHTML=`<h3>出貨預覽</h3>${d.items.map(x=>`<div class="item-card"><b>${YX.esc(x.deduct_label)}</b>｜${YX.esc(x.product_text)}｜${x.before} → ${x.after}｜${YX.esc(x.warehouse_key)}<br><span class="hint">${YX.esc(x.formula)} = ${x.volume}</span></div>`).join('')}<h3>材積：${d.total_volume}　總重：${d.total_weight}</h3>`;
  });
}
async function confirmShip(){
  const btn=YX.$('#confirmShip');
  await YX.safe(btn,async()=>{
    const items=previewItems.length?previewItems:selected(); if(!items.length) throw new Error('請先預覽出貨');
    if(!confirm('確認扣除出貨資料？')) return;
    const d=await YX.api('/api/shipping/confirm',{method:'POST',body:{weight_unit:YX.$('#weightUnit').value||0,items,request_key:YX.key()}});
    YX.toast('出貨完成'); YX.$('#shipPreview').innerHTML=d.results.map(r=>`${r.label}：${r.before} → ${r.after}`).join('\n'); loadItems(); YX.loadBadge();
  });
}
