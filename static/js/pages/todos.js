import { get, put, del } from '../core/api.js';
import { pageShell, esc, toast } from '../utils/dom.js';

async function postForm(url, formData){
  const res = await fetch(url, { method:'POST', body: formData });
  const json = await res.json().catch(()=>({success:false,error:'伺服器回應格式錯誤'}));
  if(!res.ok || json.success === false) throw new Error(json.error || json.message || '送出失敗');
  return json;
}
function imageHtml(path){ return path ? `<img class="todo-img" src="${esc(path)}" data-img="${esc(path)}" alt="代辦圖片">` : ''; }
export async function renderTodos(app) {
  app.innerHTML = pageShell('代辦事項', `<div class="card"><form id="todoForm" class="form-grid" enctype="multipart/form-data"><label class="field"><span>代辦</span><input name="title" required></label><label class="field"><span>到期日</span><input type="date" name="due_date"></label><label class="field"><span>附圖片</span><input type="file" name="image" accept="image/*"></label><button class="primary">新增代辦</button></form></div><div class="card"><div id="todos">載入中…</div></div>`);
  async function refresh(){ const res=await get('/api/todos'); const rows=res.items||[]; document.getElementById('todos').innerHTML = rows.length ? rows.map(t=>`<div class="item-card"><div class="item-main"><b style="text-decoration:${t.is_done?'line-through':'none'}">${esc(t.title)}</b><div class="muted">${esc(t.due_date || '未設定日期')}</div>${imageHtml(t.image_path || '')}<div class="row-actions"><button class="small" data-done="${t.id}" data-val="${t.is_done?0:1}">${t.is_done?'還原':'完成'}</button><button class="small danger" data-delete="${t.id}">刪除</button></div></div></div>`).join('') : '<div class="empty">沒有代辦</div>'; }
  await refresh();
  document.getElementById('todoForm').addEventListener('submit', async e=>{ e.preventDefault(); await postForm('/api/todos', new FormData(e.currentTarget)); toast('已新增代辦'); e.currentTarget.reset(); refresh(); });
  document.getElementById('todos').addEventListener('click', async e=>{ if(e.target.dataset.img){ const div=document.createElement('div'); div.className='modal-backdrop image-modal'; div.innerHTML=`<div class="modal"><div class="modal-head"><b>代辦圖片</b><button class="small" data-close>關閉</button></div><img src="${esc(e.target.dataset.img)}" alt="代辦圖片"></div>`; document.body.appendChild(div); div.addEventListener('click',ev=>{ if(ev.target===div || ev.target.dataset.close) div.remove(); }); return; } if(e.target.dataset.done){ await put(`/api/todos/${e.target.dataset.done}`, {is_done:Number(e.target.dataset.val)}); refresh(); } if(e.target.dataset.delete){ await del(`/api/todos/${e.target.dataset.delete}`); toast('已刪除'); refresh(); }});
}
