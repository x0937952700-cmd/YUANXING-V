(function(){
  if(window.__YX_PACK19__) return; window.__YX_PACK19__=true;
  document.documentElement.dataset.yxPack19='today-performance';
  document.body && document.body.classList.add('yx19-fast');
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  async function api(url,opt={}){const res=await fetch(url,Object.assign({headers:{'Content-Type':'application/json'}},opt));let d={};try{d=await res.json()}catch(e){}if(!res.ok||d.ok===false||d.success===false)throw new Error(d.error||d.message||('HTTP '+res.status));return d;}
  function qtyOf(x){return Number(x?.qty ?? x?.quantity ?? 0)||0}
  function renderLogs(hostId, items, label){const host=$(hostId); if(!host) return; host.innerHTML=items.length?items.map(x=>`<div class="today-item-card"><span class="cat">${esc(label)}</span><div><div class="main">${esc(x.customer||x.customer_name||'')} ${esc(x.product||x.product_text||x.action||'')}</div><div class="meta">${esc(x.operator||x.username||'')} ${esc(x.created_at||x.time||'')}</div></div><div class="qty">${qtyOf(x)||''}${qtyOf(x)?'件':''}</div></div>`).join(''):'<span class="muted">無</span>';}
  function renderUnplaced(summary){const host=$('today-unplaced-list'); if(!host) return; const A=Number(summary?.A||0), B=Number(summary?.B||0), U=Number(summary?.['未指定']||summary?.unknown||0); host.innerHTML=`<div class="today-unplaced-summary"><div class="sum-card"><div class="sum-title">A 區</div><div class="sum-num">${A} 件</div></div><div class="sum-card"><div class="sum-title">B 區</div><div class="sum-num">${B} 件</div></div><div class="sum-card"><div class="sum-title">未指定區域</div><div class="sum-num">${U} 件</div></div></div>`;}
  window.loadToday = async function(){
    try{
      const d=await api('/api/today?summary=1&ts='+Date.now());
      const logs=Array.isArray(d.logs)?d.logs:[];
      const unread=Number(d.unread||0);
      const badge=$('today-unread-badge'); if(badge) badge.textContent=unread;
      const inbound=logs.filter(x=>/進|入|inventory|inbound/i.test((x.category||'')+' '+(x.action||'')));
      const outbound=logs.filter(x=>/出|ship|outbound/i.test((x.category||'')+' '+(x.action||'')));
      const orders=logs.filter(x=>/訂|order/i.test((x.category||'')+' '+(x.action||'')));
      renderLogs('today-inbound-list',inbound,'進貨');
      renderLogs('today-outbound-list',outbound,'出貨');
      renderLogs('today-order-list',orders,'訂單');
      renderUnplaced(d.unplaced_summary||{});
      const s=$('today-summary-cards');
      const total=Number(d.unplaced_total||0);
      if(s) s.innerHTML=`<div class="today-item-card"><span class="cat">總覽</span><div><div class="main">今日異動 ${logs.length} 筆，未錄入倉庫圖總件數 ${total} 件</div><div class="meta">只統計 A / B / 未指定總數，不載入明細避免卡頓</div></div><div class="qty">${unread}</div></div>`;
      try{await api('/api/today/read',{method:'POST'});}catch(e){}
    }catch(e){const host=$('today-summary-cards')||document.body; host.innerHTML=`<div class="error-card">錯誤：${esc(e.message||e)}</div>`;}
  };
  function bind(){
    const b=$('yx112-refresh-today'); if(b){b.onclick=(e)=>{e.preventDefault(); window.loadToday();};}
    if(location.pathname.includes('today')) setTimeout(window.loadToday,30);
    // remove duplicate bottom warehouse blocks outside current module, which caused all-page scroll/lag
    $$('body > .warehouse-zone-wrap, body > #yx15-warehouse-wrap, body > .yx15-warehouse-wrap, body > .warehouse-zone-nav').forEach(el=>el.classList.add('yx19-hidden-legacy-bottom'));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
})();
