// CLEAN V16 page JS for this page. Old FIX JS is not loaded.
(function(){
  'use strict';
  if (window.__YX_CLEAN_COMMON__) return; window.__YX_CLEAN_COMMON__ = true;
  window.$ = window.$ || ((s, r=document)=>r.querySelector(s));
  window.$$ = window.$$ || ((s, r=document)=>Array.from(r.querySelectorAll(s)));
  window.yxApi = async function(url, opt={}){
    const o = Object.assign({credentials:'same-origin'}, opt);
    o.headers = Object.assign({'Content-Type':'application/json'}, o.headers||{});
    const r = await fetch(url, o); let data={}; try{data=await r.json();}catch(e){}
    if(!r.ok || data.success===false){ throw new Error(data.message || data.error || ('HTTP '+r.status)); }
    return data;
  };
  window.yxToast = function(msg){
    let el = $('#yx-clean-toast'); if(!el){ el=document.createElement('div'); el.id='yx-clean-toast'; el.style.cssText='position:fixed;right:18px;top:18px;z-index:99999;background:#111827;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px #0002;font-weight:700;max-width:70vw'; document.body.appendChild(el); }
    el.textContent=msg; el.style.display='block'; clearTimeout(el._t); el._t=setTimeout(()=>el.style.display='none',2600);
  };
  window.yxErr = e => yxToast((e && e.message) ? e.message : String(e||'操作失敗'));
  window.yxQty = function(text){
    text=String(text||''); const rhs=(text.split('=')[1]||text).trim(); if(!rhs) return 0;
    return rhs.split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,p)=>{ const m=p.match(/(?:^|\D)(\d+)\s*[xX×*]\s*(\d+)$/); if(m) return sum+parseInt(m[2]||0,10); return sum+1; },0);
  };
  window.yxMaterial = function(row){ return (row.material || row.product_code || '未填材質').trim(); };
  window.yxSize = function(row){ return (row.product_text || row.product || '').trim(); };

  window.yxLoadRegionPicker = async function(){
    const mod = (document.querySelector('.module-screen')||{}).dataset?.module;
    if(!['orders','master_order','ship'].includes(mod)) return;
    try{
      const d = await yxApi('/api/customers');
      const items = d.items || [];
      const boxes = {'北區':'#region-north','中區':'#region-center','南區':'#region-south'};
      Object.entries(boxes).forEach(([region, sel])=>{
        const box = $(sel); if(!box) return;
        const list = items.filter(c=>(c.region||'北區')===region);
        box.innerHTML = list.map(c=>`<button class="customer-chip" type="button" data-yx-region-customer="${c.name}">${c.name}</button>`).join('') || '<div class="muted">無客戶</div>';
      });
    }catch(e){ yxErr(e); }
  };
  document.addEventListener('click', e=>{
    const b=e.target.closest('[data-yx-region-customer]'); if(!b) return;
    const inp=$('#customer-name'); if(inp) { inp.value=b.dataset.yxRegionCustomer; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  });
  document.addEventListener('DOMContentLoaded', ()=>{ yxLoadRegionPicker(); });

})();
(function(){
'use strict'; if(window.__YX_CLEAN_TODOS__) return; window.__YX_CLEAN_TODOS__=true;
let files=[];
window.openTodoAlbumPicker=function(){ $('#todo-image-input')?.click(); };
window.openTodoCameraPicker=function(){ $('#todo-camera-input')?.click(); };
window.clearTodoForm=function(){ const note=$('#todo-note'); if(note) note.value=''; files=[]; const a=$('#todo-image-input'), c=$('#todo-camera-input'); if(a) a.value=''; if(c) c.value=''; $('#todo-selected-preview')?.classList.add('hidden'); };
async function load(){ try{ const d=await yxApi('/api/todos'); const box=$('#todo-list'); if(box) box.innerHTML=(d.items||[]).map(t=>`<div class="glass panel"><strong>${t.todo_date||''}</strong><p>${t.note||''}</p><button class="ghost-btn small-btn" data-del-todo="${t.id}">刪除</button></div>`).join('')||'<div class="empty-state-card">尚無代辦</div>'; }catch(e){yxErr(e);} }
window.saveTodoItem=async function(){ try{ const note=$('#todo-note').value.trim(); const date=$('#todo-date').value; if(!note && !files.length) throw new Error('請輸入代辦內容或選擇圖片'); await yxApi('/api/todos',{method:'POST',body:JSON.stringify({note,todo_date:date})}); clearTodoForm(); await load(); yxToast('代辦已新增'); }catch(e){yxErr(e);} };
document.addEventListener('change',e=>{ if(e.target.id==='todo-image-input'||e.target.id==='todo-camera-input'){ files=Array.from(e.target.files||[]); const p=$('#todo-selected-preview'); if(p){p.classList.remove('hidden'); p.textContent=`已選 ${files.length} 張圖片`; } } });
document.addEventListener('click',async e=>{ const b=e.target.closest('[data-del-todo]'); if(b){ try{ await yxApi('/api/todos/'+b.dataset.delTodo,{method:'DELETE'}); await load(); }catch(err){yxErr(err);} } });
document.addEventListener('DOMContentLoaded',load); if(document.readyState!=='loading') load();
})();


// CLEAN_EVENTS_V16: todo buttons bind once here, no inline onclick.
(function(){'use strict'; if(window.__YX_V15_TODO_BIND__) return; window.__YX_V15_TODO_BIND__=true;
function call(fn){ try{ if(typeof window[fn]==='function') return window[fn](); yxToast(fn+' 尚未接上'); }catch(e){ yxErr(e); } }
document.addEventListener('click', function(e){ const a=e.target.closest('[data-yx-action]'); if(!a) return; const k=a.dataset.yxAction; if(k==='todo-album') call('openTodoAlbumPicker'); if(k==='todo-camera') call('openTodoCameraPicker'); if(k==='todo-save') call('saveTodoItem'); if(k==='todo-clear') call('clearTodoForm'); });
})();


// V28_EVENT_COMPLETE_TODOS_COMPAT: 補回目前滿意代辦按鈕舊入口。
(function(){'use strict'; if(window.__YX_V28_EVENT_COMPLETE_TODOS_COMPAT__) return; window.__YX_V28_EVENT_COMPLETE_TODOS_COMPAT__=true;
  function clickAction(name){ const el=document.querySelector('[data-yx-action="'+name+'"]'); if(el){ el.click(); return true; } return false; }
  window.openTodoAlbum = window.openTodoAlbum || function(){ return clickAction('todo-album'); };
  window.openTodoCamera = window.openTodoCamera || function(){ return clickAction('todo-camera'); };
  window.saveTodo = window.saveTodo || function(){ return clickAction('todo-save'); };
  window.clearTodo = window.clearTodo || function(){ return clickAction('todo-clear'); };
})();


// CLEAN_EVENTS_V28_EVENT_COMPLETE: 補齊代辦頁所有 HTML 按鈕/事件入口。
(function(){'use strict'; if(window.__YX_V28_TODOS_EVENT_COMPLETE__) return; window.__YX_V28_TODOS_EVENT_COMPLETE__=true;
  function action(name){ const el=document.querySelector('[data-yx-action="'+name+'"]'); if(el){ el.click(); return true; } return false; }
  window.openTodoAlbum = window.openTodoAlbum || function(){ return action('todo-album'); };
  window.openTodoCamera = window.openTodoCamera || function(){ return action('todo-camera'); };
  window.saveTodo = window.saveTodo || function(){ return action('todo-save'); };
  window.clearTodo = window.clearTodo || function(){ return action('todo-clear'); };
})();
