(function(){
'use strict'; if(window.__YX_CLEAN_TODOS__) return; window.__YX_CLEAN_TODOS__=true;
let files=[];
window.openTodoAlbumPicker=function(){ $('#todo-image-input')?.click(); };
window.openTodoCameraPicker=function(){ $('#todo-camera-input')?.click(); };
window.clearTodoForm=function(){ $('#todo-note').value=''; files=[]; $('#todo-selected-preview')?.classList.add('hidden'); };
async function load(){ try{ const d=await yxApi('/api/todos'); const box=$('#todo-list'); if(box) box.innerHTML=(d.items||[]).map(t=>`<div class="glass panel"><strong>${t.todo_date||''}</strong><p>${t.note||''}</p><button class="ghost-btn small-btn" data-del-todo="${t.id}">刪除</button></div>`).join('')||'<div class="empty-state-card">尚無代辦</div>'; }catch(e){yxErr(e);} }
window.saveTodoItem=async function(){ try{ const note=$('#todo-note').value.trim(); const date=$('#todo-date').value; if(!note && !files.length) throw new Error('請輸入代辦內容或選擇圖片'); await yxApi('/api/todos',{method:'POST',body:JSON.stringify({note,todo_date:date})}); clearTodoForm(); await load(); yxToast('代辦已新增'); }catch(e){yxErr(e);} };
document.addEventListener('change',e=>{ if(e.target.id==='todo-image-input'||e.target.id==='todo-camera-input'){ files=Array.from(e.target.files||[]); const p=$('#todo-selected-preview'); if(p){p.classList.remove('hidden'); p.textContent=`已選 ${files.length} 張圖片`; } } });
document.addEventListener('click',async e=>{ const b=e.target.closest('[data-del-todo]'); if(b){ try{ await yxApi('/api/todos/'+b.dataset.delTodo,{method:'DELETE'}); await load(); }catch(err){yxErr(err);} } });
document.addEventListener('DOMContentLoaded',load); if(document.readyState!=='loading') load();
})();
