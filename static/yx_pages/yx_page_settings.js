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

(function(){'use strict'; if(window.__YX_PAGE_SETTINGS__) return; window.__YX_PAGE_SETTINGS__=true;
window.changePassword=async function(){try{const old_password=$('#old-password')?.value||'', new_password=$('#new-password')?.value||'', confirm_password=$('#confirm-password')?.value||''; if(!old_password||!new_password) throw new Error('請輸入舊密碼與新密碼'); if(new_password!==confirm_password) throw new Error('兩次新密碼不一致'); await yxApi('/api/change_password',{method:'POST',body:JSON.stringify({old_password,new_password})}); yxToast('密碼已更新'); ['#old-password','#new-password','#confirm-password'].forEach(s=>{const e=$(s); if(e)e.value='';});}catch(e){yxErr(e);}};
window.undoLastAction=async function(){try{const d=await yxApi('/api/undo-last',{method:'POST',body:JSON.stringify({})}); const m=$('#undo-msg'); if(m)m.textContent=d.message||'已還原'; yxToast(d.message||'已還原上一筆');}catch(e){yxErr(e);}};
window.downloadReport=function(kind){const start=$('#report-start')?.value||'', end=$('#report-end')?.value||''; const q=new URLSearchParams({type:kind,start,end}); location.href='/api/reports/export?'+q.toString();};
window.loadAuditTrails=async function(){try{const q=new URLSearchParams({q:$('#audit-q')?.value||'', user:$('#audit-user')?.value||'', entity:$('#audit-entity')?.value||'', start:$('#audit-start')?.value||'', end:$('#audit-end')?.value||''}); const d=await yxApi('/api/audit-trails?'+q.toString()); const box=$('#audit-trails-list'); if(box) box.innerHTML=(d.items||[]).map(x=>`<div class="pill">${x.created_at||''}｜${x.username||''}｜${x.action||''}｜${x.entity||''}</div>`).join('')||'<div class="muted">沒有紀錄</div>'; }catch(e){yxErr(e);}};
window.loadAdminUsers=async function(){try{const d=await yxApi('/api/admin/users'); const box=$('#admin-users'); if(box) box.innerHTML='<table class="yx113-table"><tbody>'+((d.items||d.users||[]).map(u=>`<tr><td>${u.username||u.name||''}</td><td>${u.is_blocked?'黑名單':'正常'}</td><td><button class="ghost-btn small-btn" data-block-user="${u.username||u.name||''}">加入黑名單</button></td></tr>`).join('')||'<tr><td>沒有資料</td></tr>')+'</tbody></table>'; }catch(e){yxErr(e);}};
window.createBackup=async function(){try{const d=await yxApi('/api/backup',{method:'POST',body:JSON.stringify({})}); const box=$('#backup-panel'); if(box) box.textContent=d.message||'備份已建立'; yxToast('備份已建立');}catch(e){yxErr(e);}};
window.logout=async function(){try{await yxApi('/api/logout',{method:'POST',body:JSON.stringify({})}); location.href='/login';}catch(e){location.href='/login';}};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-block-user]'); if(!b)return; try{await yxApi('/api/admin/block',{method:'POST',body:JSON.stringify({username:b.dataset.blockUser})}); await loadAdminUsers();}catch(err){yxErr(err);}});
})();


// CLEAN_EVENTS_V16: settings buttons bind once here, no inline onclick.
(function(){'use strict'; if(window.__YX_V15_SETTINGS_BIND__) return; window.__YX_V15_SETTINGS_BIND__=true;
function call(fn,arg){ try{ if(typeof window[fn]==='function') return window[fn](arg); yxToast(fn+' 尚未接上'); }catch(e){ yxErr(e); } }
document.addEventListener('click', function(e){ const r=e.target.closest('[data-yx-report]'); if(r){ call('downloadReport', r.dataset.yxReport); return; } const a=e.target.closest('[data-yx-action]'); if(!a) return; const k=a.dataset.yxAction; if(k==='settings-change-password') call('changePassword'); if(k==='settings-undo-last') call('undoLastAction'); if(k==='settings-load-audit') call('loadAuditTrails'); if(k==='settings-load-users') call('loadAdminUsers'); if(k==='settings-create-backup') call('createBackup'); if(k==='logout') call('logout'); });
})();


// CLEAN_EVENTS_V28_EVENT_COMPLETE: 補齊設定頁所有 HTML 按鈕/事件入口；報表/備份/黑名單/登出都由本頁 JS 綁定。
(function(){'use strict'; if(window.__YX_V28_SETTINGS_EVENT_COMPLETE__) return; window.__YX_V28_SETTINGS_EVENT_COMPLETE__=true;
  function call(fn,arg){ try{ if(typeof window[fn]==='function') return window[fn](arg); if(window.yxToast) yxToast(fn+' 尚未接上'); }catch(e){ if(window.yxErr) yxErr(e); else console.error(e); } }
  document.addEventListener('click', function(e){
    const r=e.target.closest('[data-yx-report]'); if(r){ e.preventDefault(); call('downloadReport', r.dataset.yxReport); return; }
    const a=e.target.closest('[data-yx-action]'); if(!a) return;
    const map={
      'settings-change-password':['changePassword'],
      'settings-undo-last':['undoLastAction'],
      'settings-load-audit':['loadAuditTrails'],
      'settings-load-users':['loadAdminUsers'],
      'settings-create-backup':['createBackup'],
      'logout':['logout']
    };
    const m=map[a.dataset.yxAction]; if(m){ e.preventDefault(); call(m[0]); }
  }, true);
})();
