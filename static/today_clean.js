(function(){
'use strict';
const $=id=>document.getElementById(id); const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function api(u,o={}){const r=await fetch(u,{credentials:'same-origin',...o});let d={};try{d=await r.json()}catch(e){}if(!r.ok||d.success===false)throw new Error(d.error||d.message||'讀取失敗');return d}
function card(x){return `<div class="today-row"><b>${esc(x.action||x.category)}</b><span>${esc(x.created_at||'')}</span><div>${esc(x.customer_name||'')} ${esc(x.product_text||'')}</div><small>${esc(x.operator||'')} ${Number(x.qty||0)}件</small></div>`}
function put(id,items){const e=$(id); if(e)e.innerHTML=items.length?items.map(card).join(''):'<div class="empty-state-card">目前沒有資料</div>'}
async function load(){const d=await api('/api/today-changes'); const items=d.items||[]; $('today-unread-badge') && ($('today-unread-badge').textContent=d.unread_count||0); put('today-inbound-list',items.filter(x=>/進貨|庫存|新增商品/.test((x.category||'')+(x.action||'')))); put('today-outbound-list',items.filter(x=>/出貨/.test((x.category||'')+(x.action||'')))); put('today-order-list',items.filter(x=>/訂單|總單/.test((x.category||'')+(x.action||'')))); put('today-unplaced-list',items.filter(x=>/未錄入|未入倉|倉庫/.test((x.category||'')+(x.action||'')))); await api('/api/today-changes/read',{method:'POST'}).catch(()=>{});}
document.addEventListener('DOMContentLoaded',()=>{const b=$('yx112-refresh-today'); if(b)b.onclick=load; load().catch(e=>{document.body.insertAdjacentHTML('afterbegin',`<div class="alert">${esc(e.message)}</div>`)});});
})();
