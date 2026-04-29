import {API} from './api.js';
import {$, $$, toast, empty, bindSwipeDelete, escapeHtml} from './ui.js';
export async function renderActivity(root){
  root.innerHTML=`<div class="section-head"><h2>今日異動</h2><button class="btn ghost" data-nav="home">返回首頁</button></div><section class="card"><div class="toolbar"><button id="refreshUnplaced" class="btn secondary">刷新未錄入倉庫圖</button><button id="markRead" class="btn ghost">清除未讀紅點</button></div><div id="unplacedInfo" class="preview-box" style="margin-top:10px">未錄入倉庫圖：按刷新取得</div></section><section class="card"><div id="activityList" class="list"></div></section>`;
  $('#refreshUnplaced',root).onclick=async()=>{const d=await API.get('/api/warehouse/unplaced'); $('#unplacedInfo',root).textContent=`未錄入倉庫圖：${d.pieces}件 / ${d.count}筆\n`+d.items.map(x=>`${x.source_table}｜${x.customer||'庫存'}｜${x.product_text}｜${x.pieces}件`).join('\n');};
  $('#markRead',root).onclick=async()=>{await API.post('/api/activity/read_all',{});toast('已清除未讀');window.dispatchEvent(new Event('yx:badge'));load(root);};
  await API.post('/api/activity/read_all',{}).catch(()=>{}); window.dispatchEvent(new Event('yx:badge'));
  await load(root);
}
async function load(root){
  const d=await API.get('/api/activity');
  $('#activityList',root).innerHTML=d.logs.length?d.logs.map(l=>`<article class="item-card activity-card swipe-delete ${l.unread?'unread':''}" data-log="${l.id}"><div><span class="tag">${escapeHtml(l.category)}</span><b> ${escapeHtml(l.action)}</b><p>${escapeHtml(l.customer||'')} ${escapeHtml(l.product_text||'')}</p><p class="subtle">${escapeHtml(l.detail||'')}</p><div class="time">${escapeHtml(l.created_at)}｜${escapeHtml(l.operator||'')}</div></div><button class="btn danger small" data-del="${l.id}">刪除</button></article>`).join(''):empty('今日尚無異動');
  $$('[data-del]',root).forEach(b=>b.onclick=async()=>{await API.del(`/api/activity/${b.dataset.del}`); toast('已刪除'); load(root);});
  bindSwipeDelete(root,'.swipe-delete',async(el)=>{await API.del(`/api/activity/${el.dataset.log}`);el.remove();toast('已滑動刪除');});
}
