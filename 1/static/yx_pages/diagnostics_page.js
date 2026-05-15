/* V518_RESTORE_SATISFIED_SHIP_PREVIEW_DIAG: homepage logout removed; diagnostics uses lightweight endpoints and current-version issue filtering. */
/* 主要異常清單 classifyClientErrors classifyServer: diagnostics must list real current failures, not soft optional performance probes. */
/* V504 diagnostics page: current-version-only button/event mainline audit + export. No polling/timer/observer. */
(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SEV = {critical:4, error:3, warn:2, info:1};
  function card(title, body, cls){ return `<div class="diag-card ${cls||''}"><h3>${esc(title)}</h3>${body}</div>`; }
  function kv(obj){ return `<div class="diag-kv">${Object.entries(obj||{}).map(([k,v])=>`<div><b>${esc(k)}</b><span>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span></div>`).join('')}</div>`; }
  function setStatus(msg, cls){ const el=$('#diag-status'); if(el){ el.textContent=msg; el.className='diag-status '+(cls||''); } }
  function downloadJson(name, data){
    const blob = new Blob([JSON.stringify(data || {}, null, 2)], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ try{URL.revokeObjectURL(a.href);}catch(_e){} try{a.remove();}catch(_e){} }, 1200);
  }
  function normalizeEndpoint(ep){ return String(ep||'').replace(/\?.*$/,''); }
  function addIssue(list, severity, title, detail, source){
    list.push({severity, title:String(title||''), detail:detail||{}, source:source||'', at:new Date().toISOString()});
  }
  function currentAppVersion(){ return String(window.__YX_APP_VERSION__ || ''); }
  function currentStaticVersion(){ return String(window.__YX_STATIC_VERSION__ || ''); }
  function isCurrentClientError(e){
    const av=String(e?.app_version||''); const sv=String(e?.static_version||'');
    if(!av && !sv) return true;
    return (!!av && av===currentAppVersion()) || (!!sv && sv===currentStaticVersion());
  }
  function issueClass(sev){ return sev==='critical' || sev==='error' ? 'bad' : (sev==='warn' ? 'warn' : ''); }
  function issueSort(a,b){ return (SEV[b.severity]||0)-(SEV[a.severity]||0); }
  function classifyClientErrors(errors, guards){
    const issues=[];
    (errors||[]).forEach(e=>{
      if(!isCurrentClientError(e)) return;
      const type=String(e.type||''); const d=e.detail||{}; const url=normalizeEndpoint(d.url||''); const msg=String(d.message||d.error||''); const ms=Number(d.ms||0);
      if(url==='/api/performance/route-prewarm' || url==='/api/performance/cache-summary') return;
      if(/^\/api\/health\/(postdeploy-evidence-report|final-evidence-bundle|final-gap-report|operation-closed-loop)$/.test(url) && type.includes('slow_or_error')) return;
      else if(type.includes('fetch_failed')) addIssue(issues,'error',`API 呼叫失敗：${url || '未知 API'}`, {url, message:msg, page:e.page, at:e.at}, 'local_errors');
      else if(type.includes('slow_or_error')) addIssue(issues, ms>10000?'critical':'warn', `API 太慢：${url || '未知 API'} ${ms||'?'}ms`, {url, ms, status:d.status, page:e.page, at:e.at}, 'local_errors');
      else if(type.includes('unhandled') || type.includes('window.error')) addIssue(issues,'critical',`前端 JS 錯誤：${msg || type}`, {type, detail:d, page:e.page, at:e.at}, 'local_errors');
      else if(type.includes('regression_guard')) addIssue(issues,'warn',`防回歸攔截：${type}`, {detail:d, page:e.page, at:e.at}, 'local_errors');
    });
    (guards||[]).forEach(g=>{
      const gv=String(g?.version||'');
      if(gv && gv!==String((window.YXRegressionGuard&&window.YXRegressionGuard.version)||'')) return;
      addIssue(issues,'warn',`防回歸事件：${g.type}`, {detail:g.detail, page:g.page, at:g.at}, 'regression_guard');
    });
    return issues;
  }
  function classifyServer(server){
    const issues=[];
    const counts = server?.db_counts || {};
    const routes = server?.routes || {};
    const errors = server?.recent_errors || [];
    Object.entries(routes).forEach(([route, ok])=>{ if(!ok) addIssue(issues,'critical',`必要 API 未掛上：${route}`, {}, 'server_routes'); });
    // V488: server_export has no browser local_counts; compare local/server in browser snapshot only, not here.
    errors.forEach(e=>{
      const src=String(e.source||''); const msg=String(e.message||'');
      if(src.indexOf('client_')===0 && msg.indexOf(currentAppVersion())<0 && msg.indexOf(currentStaticVersion())<0) return;
      if(msg.indexOf('/api/performance/route-prewarm')>=0) return;
      if(msg.indexOf('/api/performance/cache-summary')>=0) return;
      if(msg.indexOf('/api/health/postdeploy-evidence-report')>=0 || msg.indexOf('/api/health/final-evidence-bundle')>=0) return;
      if(/statement timeout|SSL connection|canceling statement/i.test(msg)) addIssue(issues,'critical',`資料庫/倉庫查詢異常：${src}`, {message:msg.slice(0,900), created_at:e.created_at}, 'server_errors');
      else if(/api_slow_or_error|fetch_failed|unhandledrejection|window.error|regression_guard/i.test(src+msg)) addIssue(issues,'warn',`近期錯誤紀錄：${src}`, {message:msg.slice(0,900), created_at:e.created_at}, 'server_errors');
    });
    return issues;
  }
  function classifyEndpointRows(rows){
    const issues=[];
    (rows||[]).forEach(r=>{
      const ep=String(r.ep||r.endpoint||'');
      const isEvidence=/\/api\/health\/(postdeploy-evidence-report|final-evidence-bundle|final-gap-report|operation-closed-loop)/.test(ep);
      if(!r.success) addIssue(issues,'critical',`端點失敗：${ep}`, r, 'endpoint_checks');
      else if(!isEvidence && Number(r.ms)>10000) addIssue(issues,'critical',`端點嚴重過慢：${ep} ${r.ms}ms`, r, 'endpoint_checks');
      else if(!isEvidence && Number(r.ms)>4500) addIssue(issues,'warn',`端點偏慢：${ep} ${r.ms}ms`, r, 'endpoint_checks');
    });
    return issues;
  }
  function summarizeIssues(issues){
    const sorted=(issues||[]).slice().sort(issueSort);
    const critical=sorted.filter(i=>i.severity==='critical').length;
    const error=sorted.filter(i=>i.severity==='error').length;
    const warn=sorted.filter(i=>i.severity==='warn').length;
    const reportable=sorted.filter(i=>['critical','error','warn'].includes(i.severity)); return {critical,error,warn,total:reportable.length, sorted:reportable};
  }
  function renderIssues(issues){
    const sum=summarizeIssues(issues);
    window.__YX_CURRENT_VERSION_ISSUE_SUMMARY__ = sum;
    const html=sum.sorted.length ? `<div class="diag-issue-summary"><b>重大 ${sum.critical}</b><b>錯誤 ${sum.error}</b><b>警告 ${sum.warn}</b></div>` +
      `<div class="diag-list">${sum.sorted.slice(0,40).map(i=>`<div class="diag-row ${issueClass(i.severity)}"><b>${esc(i.severity.toUpperCase())}｜${esc(i.title)}</b><span>${esc(i.source)}｜${esc(i.at||'')}</span><pre>${esc(JSON.stringify(i.detail||{}, null, 2))}</pre></div>`).join('')}</div>` : '<p class="muted">目前沒有偵測到明確異常。</p>';
    $('#diag-issues').innerHTML = card('主要異常清單（只列 current-version）', html, sum.total?'warn':'ok');
    setStatus(sum.total ? `檢查完成：偵測到 ${sum.total} 個問題（重大 ${sum.critical}、錯誤 ${sum.error}、警告 ${sum.warn}）。` : '檢查完成：目前沒有偵測到明確異常。', sum.total?'warn':'ok');
    return sum;
  }
  function collectButtonAudit(){
    const V504_BUTTON_EVENT_MAINLINE_AUDIT = true;
    const buttons = Array.from(document.querySelectorAll('button,a,input,select,textarea')).map(el=>({
      tag:el.tagName, text:(el.innerText||el.value||el.getAttribute('aria-label')||el.id||'').trim().slice(0,80),
      id:el.id||'', name:el.name||'', type:el.type||'', disabled:!!el.disabled, href:el.getAttribute('href')||'', onclick:el.getAttribute('onclick')||'', data:Object.keys(el.dataset||{}).slice(0,12)
    }));
    const requiredFlows = [
      {flow:'首頁入口', front:'庫存/訂單/總單/出貨/倉庫圖/今日異動/設定', api:'/ + 設定頁 /api/logout', persistence:'首頁不顯示登出；登出只保留在設定頁'},
      {flow:'庫存確認送出', front:'前端立即顯示 rows', api:'/api/inventory POST', persistence:'YXBackgroundSave + YXDataStore'},
      {flow:'庫存批量操作', front:'批量刪除/批量編輯/套用材質/加到訂單/加到總單/移到A/B/商品位置', api:'/api/customer-items/* + /api/items/transfer', persistence:'optimistic rows + DB readback'},
      {flow:'訂單確認送出', front:'北區客戶卡 immediate rows', api:'/api/orders POST', persistence:'YXBackgroundSave + YXDataStore'},
      {flow:'訂單客戶卡', front:'點擊/長按/右鍵/pointer拖拉', api:'/api/customers + /api/customer-items', persistence:'source_filter 隔離'},
      {flow:'總單確認送出', front:'北區客戶卡 immediate rows', api:'/api/master_orders POST', persistence:'YXBackgroundSave + YXDataStore'},
      {flow:'出貨預覽/確認', front:'預覽區必須有回饋與扣前扣後', api:'/api/ship/preview + /api/ship', persistence:'shipping_records + today_changes + source readback'},
      {flow:'倉庫格位儲存/新增格', front:'local warehouse cache first', api:'/api/warehouse/cell + /api/warehouse/batch-add-slots', persistence:'background queue + local structure lock'},
      {flow:'今日異動', front:'新版直列卡片 + 手動刷新 + badge 清零', api:'/api/today-changes + /api/today-changes/read', persistence:'today_changes unread readback'},
      {flow:'設定/診斷', front:'同步/備份/差異/管理員/診斷/登出', api:'/api/backup + /api/audit-trails + /api/diagnostics/*', persistence:'read-only diagnostics + explicit actions only'}
    ];
    const requiredPages = [
      {page:'home', required:['庫存','訂單','總單','出貨','倉庫圖','今日異動','設定']},
      {page:'settings', required:['返回','修改密碼','儲存','快速還原','還原上一筆','報表匯出','差異紀錄','管理員功能','資料備份','同步資料','自動同步','系統診斷','登出']},
      {page:'diagnostics', required:['返回設定','立即檢查','匯出診斷報告','送出本機診斷','清除本機錯誤紀錄']},
      {page:'today_changes', required:['返回','刷新','全部','新增庫存','新增訂單','新增總單','出貨','未錄入倉庫圖']},
      {page:'product_pages', required:['搜尋','全部區','A區','B區','批量增加材質','套用材質','批量刪除','批量編輯全部','取消編輯','商品位置','編輯','刪除']}
    ];
    return {page:location.pathname, buttons, requiredFlows, requiredPages, generated_at:new Date().toISOString(), note:'診斷只做讀取與靜態/路徑稽核；不會自動點破壞性按鈕新增/刪除真資料。'};
  }
  async function apiJson(url, opt){
    const request = window.YXDataStore?.requestResponse || null;
    const raw = window.__YX_DIAG_NATIVE_FETCH__ || window.fetch;
    const options = Object.assign({yxDbOnly:true, yxRawFetch:true, cache:'no-store', credentials:'same-origin'}, opt||{});
    const res = await (request ? request(url, options) : raw(url, options));
    const txt = await res.text(); let data={}; try{ data=txt?JSON.parse(txt):{}; }catch(_e){ data={success:false,error:txt}; }
    return {ok:res.ok, status:res.status, data};
  }
  function renderLocal(snap){
    const counts = snap.local_counts || {}; const errors = (snap.last_errors || []).filter(isCurrentClientError); const guards = snap.regression_guard_events || [];
    $('#diag-local').innerHTML = card('本機同步 / 快取狀態', kv({
      '版本': snap.app_version, '靜態版本': snap.static_version, '上次同步': snap.sync?.last_success_display || snap.sync?.last_success_at || '尚未記錄',
      '自動同步': snap.sync?.auto_enabled === '1' ? '開啟' : '關閉', '庫存 rows': counts.inventory || 0, '訂單 rows': counts.orders || 0,
      '總單 rows': counts.master_order || 0, '倉庫格資料': counts.warehouse_cells || 0, '未錄入倉庫圖': counts.today_unplaced || 0,
      '本機錯誤數': errors.length, '防回歸事件': guards.length, '背景儲存佇列': (window.YXBackgroundSave?.pending?.() || 0), '本頁按鍵數': collectButtonAudit().buttons.length
    }), '');
    $('#diag-actions-audit').innerHTML = card('按鍵 / 儲存流程檢查', `<p class="muted">這裡不會自動新增/刪除正式資料；會檢查路由、事件主線、近期實際錯誤。匯出報告會列出每個流程是否缺路徑。</p><div class="diag-list">${collectButtonAudit().requiredFlows.map(f=>`<div class="diag-row"><b>${esc(f.flow)}</b><span>${esc(f.api)}</span><p>前端：${esc(f.front)}｜儲存：${esc(f.persistence)}</p></div>`).join('')}</div>`, 'ok');
    $('#diag-errors').innerHTML = card('前端錯誤 / 防回歸紀錄', (errors.length || guards.length) ? `<div class="diag-list">${errors.slice(0,16).map(e=>`<div class="diag-row ${String(e.type||'').includes('slow_or_error')||String(e.type||'').includes('fetch_failed')?'bad':''}"><b>${esc(e.type)}</b><span>${esc(e.at)}｜${esc(e.page)}</span><pre>${esc(JSON.stringify(e.detail||{}, null, 2))}</pre></div>`).join('') + guards.slice(0,16).map(e=>`<div class="diag-row warn"><b>防回歸：${esc(e.type)}</b><span>${esc(e.at)}｜${esc(e.page)}</span><pre>${esc(JSON.stringify(e.detail||{}, null, 2))}</pre></div>`).join('')}</div>` : '<p class="muted">目前沒有前端錯誤紀錄。</p>', (errors.length || guards.length) ? 'warn' : 'ok');
  }
  async function runServerCheck(){
    setStatus('正在做詳盡診斷：讀取本機錯誤、伺服器錯誤、必要 API、流程稽核…');
    const box = $('#diag-server'); box.innerHTML = '<div class="diag-card"><h3>伺服器檢查</h3><p>檢查中…</p></div>';
    let local={}; try{ local = await window.YXDiagnostics?.snapshot?.() || {}; renderLocal(local); }catch(_e){}
    const endpoints = ['/api/diagnostics/summary','/api/diagnostics/export','/api/diagnostics/action-audit','/api/diagnostics/master-requirements','/api/diagnostics/master-requirements','/api/health','/api/health/operation-closed-loop','/api/health/final-gap-report','/api/health/final-evidence-bundle','/api/health/postdeploy-evidence-report','/api/health/local-write-loop-readiness','/api/health/write-test-safety','/api/inventory?diag_light=1','/api/orders?diag_light=1','/api/master_orders?diag_light=1','/api/today-changes/count','/api/today-changes/badge','/api/warehouse/available-items?diag_light=1','/api/warehouse?diag_light=1','/api/shipping?diag_light=1'];
    const rows=[]; let server={}; let actionAudit={};
    for(const ep of endpoints){
      const t=Date.now();
      try{ const r=await apiJson(ep); const row={ep,status:r.status,ms:Date.now()-t,success:r.data.success!==false && r.data.ok!==false, note:r.data.error||r.data.db_warning||'', data:r.data}; rows.push(row); if(ep==='/api/diagnostics/summary') server=r.data; if(ep==='/api/diagnostics/action-audit') actionAudit=r.data; }
      catch(e){ rows.push({ep,status:'ERR',ms:Date.now()-t,success:false,note:e.message||String(e)}); }
    }
    const endpointIssues = classifyEndpointRows(rows);
    const localIssues = classifyClientErrors(local.last_errors||[], local.regression_guard_events||[]);
    const serverIssues = classifyServer(server);
    const actionIssues = (actionAudit.issues||[]).map(x=>({severity:x.severity||'warn', title:x.title||x.name||'流程稽核問題', detail:x, source:'action_audit', at:new Date().toISOString()}));
    const masterData = rows.find(r => r.ep === '/api/diagnostics/master-requirements')?.data || {};
    const masterIssues = (masterData.issues||[]).map(x=>({severity:x.severity||'critical', title:x.title||x.name||'母版未對齊', detail:x, source:'master_requirement_audit', at:new Date().toISOString()}));
    const issues=[...endpointIssues, ...localIssues, ...serverIssues, ...actionIssues, ...masterIssues];
    const currentVersionIssueSummary = summarizeIssues(issues);
    box.innerHTML = card('伺服器 / API 檢查', `<div class="diag-list">${rows.map(r=>`<div class="diag-row ${(!r.success || Number(r.ms)>4500)?'bad':''}"><b>${esc(r.ep)}</b><span>${esc(r.status)}｜${esc(r.ms)}ms</span><p>${esc(r.note || (r.success?'正常':'異常'))}</p></div>`).join('')}</div>`, issues.length?'warn':'ok') +
      card('流程 / 按鍵主線稽核', actionAudit.checks ? `<div class="diag-list">${(actionAudit.checks||[]).map(c=>`<div class="diag-row ${c.ok?'':'bad'}"><b>${esc(c.name)}</b><span>${c.ok?'OK':'異常'}</span><p>${esc(c.detail||'')}</p></div>`).join('')}</div>` : '<p class="muted">此版本未回傳流程稽核。</p>', (actionAudit.issues||[]).length?'warn':'ok');
    renderIssues(issues);
    window.__YX_LAST_DIAG_ISSUES__ = issues; window.__YX_CURRENT_VERSION_ISSUE_SUMMARY__ = currentVersionIssueSummary;
    window.__YX_LAST_ACTION_AUDIT__ = actionAudit;
  }
  async function sendSnapshot(){
    const snap = await window.YXDiagnostics?.snapshot?.();
    await apiJson('/api/diagnostics/client-log', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'manual.snapshot', detail:snap})});
    setStatus('已送出本機診斷快照到後端。');
  }
  async function exportReport(){
    setStatus('正在整理詳盡診斷報告…');
    let local = {}, server = {}, actionAudit = {}, masterAudit = {}, endpointChecks = [];
    try { local = await window.YXDiagnostics?.snapshot?.() || {}; } catch(e){ local = {error:String(e && e.message || e)}; }
    try { server = (await apiJson('/api/diagnostics/export')).data || {}; } catch(e){ server = {success:false, error:String(e && e.message || e)}; }
    try { actionAudit = (await apiJson('/api/diagnostics/action-audit')).data || {}; } catch(e){ actionAudit = {success:false, error:String(e && e.message || e)}; }
    try { masterAudit = (await apiJson('/api/diagnostics/master-requirements')).data || {}; } catch(e){ masterAudit = {success:false, error:String(e && e.message || e)}; }
    const endpoints = ['/api/diagnostics/summary','/api/diagnostics/action-audit','/api/diagnostics/master-requirements','/api/health','/api/today-changes/count','/api/today-changes/badge','/api/inventory?diag_light=1','/api/orders?diag_light=1','/api/master_orders?diag_light=1','/api/warehouse/available-items?diag_light=1','/api/warehouse?diag_light=1','/api/shipping?diag_light=1'];
    for(const ep of endpoints){ const t=Date.now(); try{ const r=await apiJson(ep); endpointChecks.push({endpoint:ep,status:r.status,ms:Date.now()-t,success:r.data.success!==false && r.data.ok!==false, sample:r.data}); } catch(e){ endpointChecks.push({endpoint:ep,status:'ERR',ms:Date.now()-t,success:false,error:String(e && e.message || e)}); } }
    const issues=[...classifyEndpointRows(endpointChecks.map(x=>({ep:x.endpoint,...x}))), ...classifyClientErrors(local.last_errors||[], local.regression_guard_events||[]), ...classifyServer(server), ...((actionAudit.issues||[]).map(x=>({severity:x.severity||'warn', title:x.title||x.name||'流程稽核問題', detail:x, source:'action_audit'}))), ...((masterAudit.issues||[]).map(x=>({severity:x.severity||'critical', title:x.title||x.name||'母版未對齊', detail:x, source:'master_requirement_audit'})))];
    const report = {report_type:'yuanxing_full_frontend_backend_diagnostics_export', current_version_only:true, generated_at:new Date().toISOString(), page:location.pathname, app_version:window.__YX_APP_VERSION__ || server.version || '', static_version:window.__YX_STATIC_VERSION__ || server.static_version || '', issue_summary:summarizeIssues(issues), current_version_issue_summary:summarizeIssues(issues), issues:issues.slice().sort(issueSort), local_snapshot:local, server_export:server, action_audit:actionAudit, master_requirement_audit:masterAudit, master_requirement_issues:masterAudit.issues||[], endpoint_checks:endpointChecks, button_audit:collectButtonAudit(), notes:['這份報告是讀取式詳盡診斷，不會自動新增/刪除真實資料。','會列出最近實際錯誤、慢 API、必要流程缺漏、每個核心按鍵/事件對應路徑。','V490 起會把最終母版需求總表全部納入對照；沒對齊的按鈕、事件、內容都列為重大異常。']};
    const date = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    downloadJson(`yuanxing_diagnostics_report_${date}.json`, report);
    setStatus(`已匯出診斷報告：問題 ${report.issue_summary.total} 個。`, report.issue_summary.total?'warn':'ok');
  }
  async function init(){
    const root = $('#diagnostics-root'); if(!root) return;
    root.innerHTML = `<div class="diag-actions"><button class="primary-btn" id="diag-run">立即檢查</button><button class="primary-btn" id="diag-export">匯出診斷報告</button><button class="ghost-btn" id="diag-send">送出本機診斷</button><button class="ghost-btn" id="diag-clear">清除本機錯誤紀錄</button></div><div id="diag-status" class="diag-status muted">診斷頁已載入。</div><div id="diag-issues"></div><div id="diag-local"></div><div id="diag-server"></div><div id="diag-actions-audit"></div><div id="diag-errors"></div>`;
    if(!document.getElementById('diag-v487-style')){ const style=document.createElement('style'); style.id='diag-v487-style'; style.textContent='.diagnostics-shell{padding:14px;max-width:1040px;margin:0 auto}.diag-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.diag-status{font-weight:800;margin:10px 0}.diag-status.warn{color:#a24b00}.diag-status.ok{color:#146c2e}.diag-card{background:rgba(255,255,255,.88);border:1px solid rgba(120,90,50,.14);border-radius:16px;padding:14px;margin:12px 0;box-shadow:0 8px 28px rgba(50,32,16,.06)}.diag-card.ok{border-color:rgba(30,120,60,.28)}.diag-card.warn{border-color:rgba(180,80,30,.35);background:#fffaf2}.diag-kv>div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(0,0,0,.06);padding:7px 0}.diag-kv span{text-align:right;word-break:break-all}.diag-issue-summary{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.diag-issue-summary b{background:#fff;border:1px solid #f0b6a0;border-radius:999px;padding:6px 10px}.diag-row{padding:10px;border:1px solid rgba(0,0,0,.08);border-radius:12px;margin:8px 0;background:#fff}.diag-row.warn{border-color:rgba(200,130,0,.35);background:#fffdf5}.diag-row.bad{border-color:rgba(200,0,0,.42);background:#fff7f7}.diag-row b{display:block}.diag-row span{color:#8a765f;font-size:12px}.diag-row pre{white-space:pre-wrap;max-height:220px;overflow:auto;background:#f7f3ed;padding:8px;border-radius:8px}'; document.head.appendChild(style); }
    const snap = await window.YXDiagnostics?.snapshot?.(); if(snap){ renderLocal(snap); renderIssues(classifyClientErrors(snap.last_errors||[], snap.regression_guard_events||[])); }
    $('#diag-run').onclick=runServerCheck; $('#diag-export').onclick=exportReport; $('#diag-send').onclick=sendSnapshot; $('#diag-clear').onclick=async()=>{ window.YXDiagnostics?.clear?.(); const s=await window.YXDiagnostics?.snapshot?.(); renderLocal(s||{}); renderIssues([]); setStatus('已清除本機錯誤紀錄。'); };
    runServerCheck();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
