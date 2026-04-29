import {API} from './api.js';
import {$, $$, toast, empty, escapeHtml} from './ui.js';
export async function renderSettings(root){
  root.innerHTML=`<div class="section-head"><h2>設定</h2><button class="btn ghost" data-nav="home">返回首頁</button></div><section class="card"><h2>系統健康檢查</h2><div id="healthBox" class="preview-box">載入中...</div><div class="toolbar" style="margin-top:10px"><a class="btn primary" href="/api/backup">下載備份</a><label class="btn secondary">上傳還原<input id="restoreFile" type="file" accept="application/json" hidden></label><button id="reloadHealth" class="btn secondary">重新檢查</button></div></section><section class="card"><h2>使用者 / 黑名單管理</h2><div id="usersBox"></div></section>`;
  $('#reloadHealth',root).onclick=()=>loadHealth(root); $('#restoreFile',root).onchange=async(e)=>{ const f=e.target.files[0]; if(!f) return; if(!confirm('還原會覆蓋目前資料，請確認已先下載備份。確定還原？')) return; const fd=new FormData(); fd.append('file',f); const res=await fetch('/api/backup/restore',{method:'POST',body:fd}); const d=await res.json(); if(!res.ok||!d.ok) throw new Error(d.error||'還原失敗'); toast('還原完成'); }; 
  await loadHealth(root); await loadUsers(root);
}
async function loadHealth(root){const d=await API.get('/api/health'); $('#healthBox',root).textContent=`狀態：${d.status}\n資料庫：${d.db}\n時間：${d.time}\n母版：YUANXING_CLEAN_V1，沒有載入舊 FIX JS/CSS`;}
async function loadUsers(root){
  const box=$('#usersBox',root);
  try{const d=await API.get('/api/users'); box.innerHTML=d.users.length?`<table class="table"><thead><tr><th>姓名</th><th>管理員</th><th>狀態</th><th>操作</th></tr></thead><tbody>${d.users.map(u=>`<tr><td>${escapeHtml(u.username)}</td><td>${u.is_admin?'是':'否'}</td><td>${u.is_blocked?'封鎖':'正常'}</td><td><button class="btn small ${u.is_blocked?'secondary':'danger'}" data-user="${u.id}" data-blocked="${u.is_blocked?0:1}">${u.is_blocked?'解除封鎖':'封鎖'}</button></td></tr>`).join('')}</tbody></table>`:empty('沒有使用者'); $$('[data-user]',root).forEach(b=>b.onclick=async()=>{await API.post(`/api/users/${b.dataset.user}/block`,{blocked:b.dataset.blocked==='1'});toast('已更新使用者狀態');loadUsers(root);});}
  catch(e){box.innerHTML=`<div class="error-card">${escapeHtml(e.message)}（非管理員只能看健康檢查與備份）</div>`;}
}
