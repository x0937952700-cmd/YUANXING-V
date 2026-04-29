function truthy(v){ return v===true || v===1 || v==='1' || String(v).toLowerCase()==='true'; }
document.addEventListener('DOMContentLoaded',()=>{
  YX.$('#changePassword').onclick=()=>changePw();
  YX.$('#healthBtn').onclick=()=>health();
  const restore=YX.$('#restoreBtn'); if(restore) restore.onclick=()=>restoreBackup();
  const req=YX.$('#requirementStatusBtn'); if(req) req.onclick=()=>loadRequirementStatus();
  const out=YX.$('#logoutBtn'); if(out) out.onclick=()=>YX.api('/api/logout',{method:'POST'}).then(()=>location.href='/login');
  const la=YX.$('#loadAudit'); if(la) la.onclick=()=>loadAudit(false);
  const laa=YX.$('#loadAuditAll'); if(laa) laa.onclick=()=>loadAudit(true);
  const rc=YX.$('#recoverCustomers'); if(rc) rc.onclick=()=>recoverCustomers();
  const lb=YX.$('#loadBackups'); if(lb) lb.onclick=()=>loadBackups();
  loadUsers(); loadAudit(false); loadBackups();
  document.addEventListener('yx:sync',()=>{loadUsers(); loadAudit(false);});
});
async function changePw(){ const p=YX.$('#newPassword').value; await YX.api('/api/settings/password',{method:'POST',body:{password:p,request_key:YX.key()}}); YX.toast('密碼已更新'); YX.$('#newPassword').value=''; }
async function health(){ const d=await YX.api('/api/health?schema=1'); YX.$('#healthBox').textContent=JSON.stringify(d,null,2); }
async function restoreBackup(){
  const f=YX.$('#restoreFile')?.files?.[0]; if(!f) return YX.toast('請先選擇 JSON 備份檔',true);
  if(!confirm('確認還原備份？系統會在後端交易中匯入，失敗會回復。')) return;
  const fd=new FormData(); fd.append('file',f); fd.append('request_key',YX.key());
  await YX.api('/api/restore',{method:'POST',body:fd,timeout:15000});
  YX.toast('備份已還原'); health();
}
async function loadUsers(){ const box=YX.$('#usersBox'); try{ const d=await YX.api('/api/settings/users'); box.innerHTML=d.users.map(u=>`<article class="item-card"><b>${YX.esc(u.username)}</b>｜${YX.esc(u.role)}｜${truthy(u.is_blocked)?'已封鎖':'正常'}<div class="actions"><button class="secondary" data-id="${u.id}" data-block="${truthy(u.is_blocked)?0:1}">${truthy(u.is_blocked)?'解除封鎖':'封鎖'}</button></div></article>`).join(''); YX.$$('button[data-id]',box).forEach(b=>b.onclick=async()=>{await YX.api(`/api/settings/users/${b.dataset.id}/block`,{method:'POST',body:{blocked:b.dataset.block==='1',request_key:YX.key()}}); loadUsers();}); }catch(e){ box.innerHTML='<div class="hint">非管理員或尚無權限查看使用者。</div>'; } }

async function loadAudit(all=false){
  const box=YX.$('#auditBox'); if(!box) return;
  try{
    const d=await YX.api('/api/audit-trails'+(all?'?all=1':''));
    const rows=d.records||[];
    box.innerHTML=rows.length?rows.map(r=>`<article class="activity-card"><b>${YX.esc(r.action||'紀錄')}</b><div class="hint">${YX.esc(r.module||'系統')}｜${YX.esc(r.customer_name||'')}｜${YX.esc(r.product_text||'')}</div><p>${YX.esc(r.detail||'')}</p><div class="time">${YX.esc(r.operator||'')}｜${YX.esc(r.created_at||'')}</div></article>`).join(''):'<div class="empty">今天尚無操作紀錄</div>';
  }catch(e){ box.innerHTML='<div class="empty">載入操作紀錄失敗</div>'; }
}
async function recoverCustomers(){
  if(!confirm('從庫存 / 訂單 / 總單 / 出貨紀錄救援缺少的客戶資料？')) return;
  const d=await YX.api('/api/recover/customers-from-relations',{method:'POST',body:{request_key:YX.key()}});
  YX.toast(`已救援 ${d.count||0} 個客戶`); loadUsers(); loadAudit(false);
}

async function loadBackups(){
  const box=YX.$('#backupRecords'); if(!box) return;
  try{
    const d=await YX.api('/api/backups');
    const rows=d.backups||[];
    box.innerHTML=rows.length?rows.map(r=>`<article class="activity-card"><b>${YX.esc(r.db_type||'backup')}</b><div class="hint">${YX.esc(r.filename||'')}｜${YX.esc(r.operator||'')}</div><p>${YX.esc(r.detail||'')}</p><div class="time">${YX.esc(r.created_at||'')}</div></article>`).join(''):'<div class="empty">尚無備份紀錄</div>';
  }catch(e){ box.innerHTML='<div class="empty">載入備份紀錄失敗</div>'; }
}

async function loadRequirementStatus(){
  const d=await YX.api('/api/requirements/status');
  const locked=`${d.sections_locked}/${d.sections_total}`;
  const rows=(d.items||[]).map(x=>`${x.id}. ${x.title}：${x.status}\n   ${x.evidence}`).join('\n\n');
  YX.$('#healthBox').textContent=`完整需求對照狀態：${locked}\n版本：${d.version}\n\n${rows}`;
}
