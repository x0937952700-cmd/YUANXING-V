import { get, post, del } from '../core/api.js';
import { pageShell, esc, toast } from '../utils/dom.js';

const CATS = ['進貨','出貨','新增訂單','未錄入倉庫圖'];
function normalizeCat(row){
  const raw = String(row.category || row.action || row.source || '');
  if (raw.includes('出貨') || raw.includes('ship')) return '出貨';
  if (raw.includes('訂單') || raw.includes('order')) return '新增訂單';
  if (raw.includes('倉庫') || raw.includes('未入') || raw.includes('未錄入')) return '未錄入倉庫圖';
  return '進貨';
}
function rowHtml(r){
  return `<div class="today-row swipe-card" data-id="${r.id}"><div><input type="checkbox" data-select-change="${r.id}"> <b>${esc(r.action || r.category || '')}</b></div><div class="product-text">${esc(r.customer_name || '')} ${esc(r.product_text || '')}</div><div class="muted">${esc(r.created_at || '')}｜${esc(r.operator || '')}｜${esc(r.source || '')}｜${Number(r.qty||0)}件</div><div class="toolbar"><button class="small danger" data-delete="${r.id}">刪除</button></div></div>`;
}
export async function renderTodayChanges(app) {
  app.innerHTML = pageShell('今日異動', `<div class="card"><div class="toolbar" style="justify-content:flex-end"><button id="refresh" class="secondary">刷新</button><button id="bulkDelete" class="danger">刪除畫面上已選</button></div><div class="section-title">今日異動</div><div id="changes" class="today-categories loading-card">載入中…</div></div>`);
  async function refresh(){
    const res=await get('/api/today-changes');
    await post('/api/today-changes/read',{});
    const rows=res.items||[];
    const grouped = Object.fromEntries(CATS.map(c=>[c, []]));
    for(const r of rows){ (grouped[normalizeCat(r)] ||= []).push(r); }
    document.getElementById('changes').classList.remove('loading-card');
    document.getElementById('changes').innerHTML = CATS.map(cat => `<div class="today-category"><div class="today-category-title">${cat}${grouped[cat].length?` <span class="badge">${grouped[cat].length}</span>`:''}</div>${grouped[cat].length ? grouped[cat].map(rowHtml).join('') : ''}</div>`).join('');
  }
  async function deleteCard(card){ const id=card?.dataset.id; if(!id)return; await del(`/api/today-changes/${id}`); toast('已刪除'); card.remove(); }
  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('bulkDelete').addEventListener('click', async()=>{ const selected=[...document.querySelectorAll('[data-select-change]:checked')]; for(const box of selected){ await deleteCard(box.closest('.swipe-card')); } });
  document.getElementById('changes').addEventListener('click', async e=>{ if(e.target.dataset.delete) await deleteCard(e.target.closest('.swipe-card')); else { const card=e.target.closest('.swipe-card'); if(card) card.classList.toggle('expanded'); } });
  let startX=0, active=null;
  document.getElementById('changes').addEventListener('pointerdown', e=>{ active=e.target.closest('.swipe-card'); startX=e.clientX; });
  document.getElementById('changes').addEventListener('pointermove', e=>{ if(!active)return; const dx=e.clientX-startX; if(dx<0) active.style.transform=`translateX(${Math.max(dx,-110)}px)`; });
  document.getElementById('changes').addEventListener('pointerup', async e=>{ if(!active)return; const dx=e.clientX-startX; const card=active; active.style.transform=''; active=null; if(dx<-70) await deleteCard(card); });
  await refresh();
}
