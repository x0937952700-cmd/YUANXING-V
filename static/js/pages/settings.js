import { get, post, del, postForm } from '../core/api.js';
import { state } from '../core/state.js';
import { pageShell, esc, toast } from '../utils/dom.js';

function auditList(items) {
  return (items||[]).slice(0,50).map(a=>`<label class="item-card"><input type="checkbox" class="audit-check" value="${a.id}"><div class="item-main"><b>${esc(a.action_type)}｜${esc(a.entity_type)}</b><div class="muted">${esc(a.created_at)}｜${esc(a.username)}</div></div></label>`).join('') || '<div class="empty">尚無紀錄</div>';
}
function correctionList(items) {
  return (items||[]).map(c=>`<div class="item-card"><div class="item-main"><b>${esc(c.wrong_text)} → ${esc(c.correct_text)}</b><button class="small danger" data-del-correction="${c.id}">刪除</button></div></div>`).join('') || '<div class="empty">尚無修正詞</div>';
}
function aliasList(items) {
  return (items||[]).map(a=>`<div class="item-card"><div class="item-main"><b>${esc(a.alias)} → ${esc(a.customer_name || a.customer_uid || '')}</b><button class="small danger" data-del-alias="${a.id}">刪除</button></div></div>`).join('') || '<div class="empty">尚無客戶別名</div>';
}

export async function renderSettings(app) {
  app.innerHTML = pageShell('設定', `
  <div class="card"><div class="section-title">修改密碼</div><form id="pwdForm" class="form-grid"><label class="field"><span>舊密碼</span><input type="password" name="old_password"></label><label class="field"><span>新密碼</span><input type="password" name="new_password"></label><button class="primary">更新密碼</button></form></div>
  <div class="card"><div class="section-title">管理員使用者列表</div><div id="users">${state.user?.is_admin ? '載入中…' : '只有管理員可查看'}</div></div>
  <div class="card"><div class="section-title">備份</div><a class="pill" href="/api/backup">下載目前 SQLite 備份</a>${state.user?.is_admin ? `<form id="restoreBackupForm" class="form-grid" enctype="multipart/form-data"><label class="field"><span>還原 SQLite .db 備份</span><input type="file" name="backup" accept=".db"></label><button class="danger">還原備份</button></form><div class="muted">還原前會自動保留一份目前資料庫副本。</div>` : ''}</div>
  <div class="card"><div class="section-title">Excel 匯入</div><a class="pill" href="/api/import/template">下載匯入範本</a><form id="importItemsForm" class="form-grid" enctype="multipart/form-data"><label class="field"><span>預設匯入位置</span><select name="default_table"><option value="inventory">庫存</option><option value="orders">訂單</option><option value="master_orders">總單</option></select></label><label class="field"><span>Excel 檔案</span><input type="file" name="file" accept=".xlsx,.xlsm"></label><button class="secondary">匯入商品</button></form><div id="importResult" class="muted">支援欄位：來源、客戶名稱、材質、商品資料、A/B區、備註。</div></div>
  ${state.user?.is_admin ? `<div class="card"><div class="section-title">資料健康檢查</div><div class="action-row"><button id="integrityCheckBtn" class="secondary">檢查資料</button><button id="integrityRepairBtn" class="danger">一鍵修復可修項目</button></div><div id="integrityResult" class="muted">會檢查件數不一致、客戶關聯缺失、倉庫格失效來源。</div></div>` : ''}
  <div class="card"><div class="section-title">OCR 修正詞</div>${state.user?.is_admin ? `<form id="correctionForm" class="form-grid"><label class="field"><span>錯字</span><input name="wrong_text"></label><label class="field"><span>正確文字</span><input name="correct_text"></label><button class="secondary">儲存修正詞</button></form>` : '<div class="muted">只有管理員可編輯</div>'}<div id="corrections">載入中…</div></div>
  <div class="card"><div class="section-title">客戶別名</div>${state.user?.is_admin ? `<form id="aliasForm" class="form-grid"><label class="field"><span>別名</span><input name="alias"></label><label class="field"><span>對應客戶名稱</span><input name="customer_name" list="customerList"></label><datalist id="customerList"></datalist><button class="secondary">儲存別名</button></form>` : '<div class="muted">只有管理員可編輯</div>'}<div id="aliases">載入中…</div></div>
  <div class="card"><div class="section-title">操作紀錄</div>${state.user?.is_admin ? '<button id="bulkAuditDelete" class="danger">刪除勾選紀錄</button>' : ''}<div id="audit">載入中…</div></div>`);
  document.getElementById('pwdForm').addEventListener('submit', async e=>{ e.preventDefault(); try{ await post('/api/change_password', Object.fromEntries(new FormData(e.currentTarget).entries())); toast('密碼已更新'); e.currentTarget.reset(); }catch(err){toast(err.message,'error')} });
  if(state.user?.is_admin){
    try{ const res=await get('/api/admin/users'); document.getElementById('users').innerHTML = `<div class="table-wrap"><table><thead><tr><th>姓名</th><th>管理員</th><th>封鎖</th><th>操作</th></tr></thead><tbody>${(res.items||[]).map(u=>`<tr><td>${esc(u.username)}</td><td>${u.is_admin?'是':'否'}</td><td>${u.is_blocked?'是':'否'}</td><td><button class="small" data-user="${esc(u.username)}" data-block="${u.is_blocked?0:1}">${u.is_blocked?'解除封鎖':'封鎖'}</button></td></tr>`).join('')}</tbody></table></div>`; }catch(err){document.getElementById('users').innerHTML=`<div class="error-card">${esc(err.message)}</div>`}
    const sugg = await get('/api/customer-suggestions?q=');
    const dl = document.getElementById('customerList');
    if(dl) dl.innerHTML=(sugg.items||[]).map(c=>`<option value="${esc(c.name)}"></option>`).join('');
  }
  const rb=document.getElementById('restoreBackupForm');
  if(rb) rb.addEventListener('submit', async e=>{ e.preventDefault(); if(!confirm('確定還原備份？目前資料會先備份再覆蓋。')) return; try{ await postForm('/api/backups/restore', new FormData(e.currentTarget)); toast('備份已還原，請重新整理頁面'); }catch(err){ toast(err.message, 'error'); } });
  const importForm=document.getElementById('importItemsForm');
  if(importForm) importForm.addEventListener('submit', async e=>{ e.preventDefault(); try{ const res=await postForm('/api/import/items', new FormData(e.currentTarget)); const r=res.result||{}; document.getElementById('importResult').innerHTML=`已匯入 <b>${r.created_count||0}</b> 筆${(r.errors||[]).length?`，錯誤：${(r.errors||[]).map(esc).join('；')}`:''}`; toast('匯入完成'); }catch(err){ toast(err.message,'error'); } });
  const integrityBtn=document.getElementById('integrityCheckBtn');
  const integrityBox=document.getElementById('integrityResult');
  function renderIntegrity(report){ const s=report.summary||{}; const problems=report.problems||[]; return `<div class="report-kpis"><div><b>${report.problem_count||0}</b><span>問題數</span></div><div><b>${s.inventory||0}</b><span>庫存</span></div><div><b>${s.orders||0}</b><span>訂單</span></div><div><b>${s.master_orders||0}</b><span>總單</span></div></div>${problems.length?`<div class="table-scroll"><table><thead><tr><th>類型</th><th>位置</th><th>說明</th></tr></thead><tbody>${problems.slice(0,80).map(p=>`<tr><td>${esc(p.type)}</td><td>${esc(p.table||'')}${p.id?'#'+p.id:''}</td><td>${esc(p.message||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="ok-card">目前沒有發現需要修復的資料問題</div>'}`; }
  if(integrityBtn) integrityBtn.addEventListener('click', async()=>{ try{ const res=await get('/api/maintenance/integrity'); integrityBox.innerHTML=renderIntegrity(res.report||{}); }catch(err){ toast(err.message,'error'); } });
  const repairBtn=document.getElementById('integrityRepairBtn');
  if(repairBtn) repairBtn.addEventListener('click', async()=>{ if(!confirm('確定要自動修復件數、客戶關聯與失效倉庫項目？')) return; try{ const res=await post('/api/maintenance/repair',{}); integrityBox.innerHTML=renderIntegrity((res.result||{}).after||{}); toast('資料修復完成'); }catch(err){ toast(err.message,'error'); } });
  document.getElementById('users').addEventListener('click', async e=>{ if(!e.target.dataset.user)return; await post('/api/admin/block',{username:e.target.dataset.user,is_blocked:Number(e.target.dataset.block)}); toast('使用者狀態已更新'); renderSettings(app); });

  async function loadCorrections(){ try{ const res=await get('/api/corrections'); document.getElementById('corrections').innerHTML=correctionList(res.items); }catch(err){document.getElementById('corrections').innerHTML=`<div class="error-card">${esc(err.message)}</div>`} }
  async function loadAliases(){ try{ const res=await get('/api/customer-aliases'); document.getElementById('aliases').innerHTML=aliasList(res.items); }catch(err){document.getElementById('aliases').innerHTML=`<div class="error-card">${esc(err.message)}</div>`} }
  async function loadAudit(){ try{ const audit=await get('/api/audit-trails'); document.getElementById('audit').innerHTML = auditList(audit.items); }catch(err){document.getElementById('audit').innerHTML=`<div class="error-card">${esc(err.message)}</div>`;} }
  await loadCorrections(); await loadAliases(); await loadAudit();

  const cf=document.getElementById('correctionForm');
  if(cf) cf.addEventListener('submit', async e=>{ e.preventDefault(); await post('/api/corrections', Object.fromEntries(new FormData(e.currentTarget).entries())); toast('已儲存修正詞'); e.currentTarget.reset(); loadCorrections(); });
  const af=document.getElementById('aliasForm');
  if(af) af.addEventListener('submit', async e=>{ e.preventDefault(); await post('/api/customer-aliases', Object.fromEntries(new FormData(e.currentTarget).entries())); toast('已儲存客戶別名'); e.currentTarget.reset(); loadAliases(); });
  document.getElementById('corrections').addEventListener('click', async e=>{ if(!e.target.dataset.delCorrection)return; await del(`/api/corrections/${e.target.dataset.delCorrection}`); toast('已刪除修正詞'); loadCorrections(); });
  document.getElementById('aliases').addEventListener('click', async e=>{ if(!e.target.dataset.delAlias)return; await del(`/api/customer-aliases/${e.target.dataset.delAlias}`); toast('已刪除客戶別名'); loadAliases(); });
  const bulk=document.getElementById('bulkAuditDelete');
  if(bulk) bulk.addEventListener('click', async()=>{ const ids=Array.from(document.querySelectorAll('.audit-check:checked')).map(x=>Number(x.value)); if(!ids.length){toast('請先勾選操作紀錄','error');return;} await post('/api/audit-trails/bulk-delete',{ids}); toast('已刪除操作紀錄'); loadAudit(); });
}
