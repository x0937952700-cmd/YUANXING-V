// Home uses only core navigation. No old FIX motherboards are loaded.
document.addEventListener('DOMContentLoaded',()=>{
  const input=YX.$('#globalSearchInput');
  const clear=YX.$('#globalSearchClear');
  const box=YX.$('#globalSearchResults');
  const recentBox=YX.$('#recentSearches');
  let timer=null;
  function recent(){
    const rows=JSON.parse(localStorage.getItem('yx_recent_searches')||'[]').slice(0,6);
    if(!recentBox) return;
    recentBox.innerHTML=rows.map(q=>`<button class="mini-item" data-q="${YX.esc(q)}">${YX.esc(q)}</button>`).join('');
    YX.$$('button',recentBox).forEach(b=>b.onclick=()=>{input.value=b.dataset.q; searchNow();});
  }
  function saveRecent(q){
    if(!q) return;
    let rows=JSON.parse(localStorage.getItem('yx_recent_searches')||'[]').filter(x=>x!==q);
    rows.unshift(q);
    localStorage.setItem('yx_recent_searches', JSON.stringify(rows.slice(0,8)));
    recent();
  }
  async function searchNow(){
    const q=input?.value.trim();
    if(!q){ if(box) box.innerHTML=''; recent(); return; }
    saveRecent(q);
    const d=await YX.api('/api/search?q='+encodeURIComponent(q));
    const rows=d.results||[];
    if(!box) return;
    box.innerHTML=rows.length?rows.map(r=>`<article class="item-card search-result" data-source="${YX.esc(r.source||'')}" data-customer="${YX.esc(r.customer_name||'')}" data-warehouse="${YX.esc(r.warehouse_key||'')}" data-q="${YX.esc(q)}"><div class="item-main"><div><div><b>${YX.esc(r.source_label||r.source)}</b> <span class="source">${YX.esc(r.record_type||'')}</span></div><div class="prod">${YX.esc(r.product_text||'')}</div><div class="hint">${YX.esc(r.customer_name||'庫存')}｜${YX.esc(r.material||'未填材質')}｜${YX.esc(r.warehouse_key||'未錄入倉庫圖')}</div></div><div class="pieces">${Number(r.pieces||0)}件</div></div></article>`).join(''):'<div class="empty">沒有找到資料</div>';
    YX.$$('.search-result',box).forEach(card=>card.onclick=()=>{
      const src=card.dataset.source;
      if(src==='warehouse'){ location.href='/warehouse?q='+encodeURIComponent(card.dataset.q||''); return; }
      if(src==='records'){ location.href='/records'; return; }
      if(src==='master'){ location.href='/master'; return; }
      if(src==='orders'){ location.href='/orders'; return; }
      location.href='/inventory';
    });
  }
  if(input){ input.addEventListener('input',()=>{clearTimeout(timer); timer=setTimeout(searchNow,250);}); }
  if(clear){ clear.onclick=()=>{ input.value=''; if(box) box.innerHTML=''; recent(); }; }
  recent();
});
