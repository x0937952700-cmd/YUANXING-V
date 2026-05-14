/* V480 diagnostics page: manual checks + one-click export, no polling/timer/observer. */
(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function card(title, body, cls){ return `<div class="diag-card ${cls||''}"><h3>${esc(title)}</h3>${body}</div>`; }
  function kv(obj){ return `<div class="diag-kv">${Object.entries(obj||{}).map(([k,v])=>`<div><b>${esc(k)}</b><span>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span></div>`).join('')}</div>`; }
  function setStatus(msg){ const el=$('#diag-status'); if(el) el.textContent=msg; }
  function downloadJson(name, data){
    const blob = new Blob([JSON.stringify(data || {}, null, 2)], {type:'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ try{URL.revokeObjectURL(a.href);}catch(_e){} try{a.remove();}catch(_e){} }, 1200);
  }
  function renderLocal(snap){
    const counts = snap.local_counts || {};
    const errors = snap.last_errors || [];
    const guards = snap.regression_guard_events || [];
    $('#diag-local').innerHTML = card('本機同步 / 快取狀態', kv({
      '版本': snap.app_version,
      '靜態版本': snap.static_version,
      '上次同步': snap.sync?.last_success_at || '尚未記錄',
      '自動同步': snap.sync?.auto_enabled === '1' ? '開啟' : '關閉',
      '庫存 rows': counts.inventory || 0,
      '訂單 rows': counts.orders || 0,
      '總單 rows': counts.master_order || 0,
      '倉庫格資料': counts.warehouse_cells || 0,
      '未錄入倉庫圖': counts.today_unplaced || 0,
      '本機錯誤數': errors.length,
      '防回歸事件': (snap.regression_guard_events || []).length
    }), '');
    $('#diag-errors').innerHTML = card('前端錯誤 / 防回歸紀錄', (errors.length || guards.length) ? `<div class="diag-list">${errors.slice(0,14).map(e=>`<div class="diag-row"><b>${esc(e.type)}</b><span>${esc(e.at)}｜${esc(e.page)}</span><pre>${esc(JSON.stringify(e.detail||{}, null, 2))}</pre></div>`).join('') + guards.slice(0,14).map(e=>`<div class="diag-row warn"><b>防回歸：${esc(e.type)}</b><span>${esc(e.at)}｜${esc(e.page)}</span><pre>${esc(JSON.stringify(e.detail||{}, null, 2))}</pre></div>`).join('')}</div>` : '<p class="muted">目前沒有前端錯誤紀錄。</p>', (errors.length || guards.length) ? 'warn' : 'ok');
  }
  async function apiJson(url, opt){
    const request = window.YXDataStore?.requestResponse || null;
    const raw = window.__YX_DIAG_NATIVE_FETCH__ || window.fetch;
    const options = Object.assign({yxDbOnly:true, yxRawFetch:true, cache:'no-store', credentials:'same-origin'}, opt||{});
    const res = await (request ? request(url, options) : raw(url, options));
    const txt = await res.text(); let data={}; try{ data=txt?JSON.parse(txt):{}; }catch(_e){ data={success:false,error:txt}; }
    return {ok:res.ok, status:res.status, data};
  }
  async function runServerCheck(){
    setStatus('正在檢查伺服器與資料一致性…');
    const box = $('#diag-server'); box.innerHTML = '<div class="diag-card"><h3>伺服器檢查</h3><p>檢查中…</p></div>';
    const endpoints = ['/api/diagnostics/summary','/api/diagnostics/export','/api/health','/api/today-changes/count','/api/warehouse/available-items','/api/warehouse'];
    const rows=[];
    for(const ep of endpoints){
      const t=Date.now();
      try{ const r=await apiJson(ep); rows.push({ep,status:r.status,ms:Date.now()-t,success:r.data.success!==false && r.data.ok!==false, note:r.data.error||r.data.db_warning||''}); }
      catch(e){ rows.push({ep,status:'ERR',ms:Date.now()-t,success:false,note:e.message||e}); }
    }
    const bad = rows.filter(r=>!r.success || Number(r.ms)>4500);
    box.innerHTML = card('伺服器 / API 檢查', `<div class="diag-list">${rows.map(r=>`<div class="diag-row ${r.success?'':'bad'}"><b>${esc(r.ep)}</b><span>${esc(r.status)}｜${esc(r.ms)}ms</span><p>${esc(r.note || (r.success?'正常':'異常'))}</p></div>`).join('')}</div>`, bad.length?'warn':'ok');
    setStatus(bad.length ? '檢查完成：有異常，請看紅色/黃色項目。' : '檢查完成：目前沒有偵測到主要異常。');
  }
  async function sendSnapshot(){
    const snap = await window.YXDiagnostics?.snapshot?.();
    await apiJson('/api/diagnostics/client-log', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'manual.snapshot', detail:snap})});
    setStatus('已送出本機診斷快照到後端。');
  }
  async function exportReport(){
    setStatus('正在整理診斷報告…');
    let local = {};
    let server = {};
    let endpointChecks = [];
    try { local = await window.YXDiagnostics?.snapshot?.() || {}; } catch(e){ local = {error:String(e && e.message || e)}; }
    try { server = (await apiJson('/api/diagnostics/export')).data || {}; } catch(e){ server = {success:false, error:String(e && e.message || e)}; }
    const endpoints = ['/api/diagnostics/summary','/api/health','/api/today-changes/count','/api/today-changes/badge','/api/warehouse/available-items','/api/warehouse','/api/shipping'];
    for(const ep of endpoints){
      const t=Date.now();
      try{ const r=await apiJson(ep); endpointChecks.push({endpoint:ep,status:r.status,ms:Date.now()-t,success:r.data.success!==false && r.data.ok!==false, sample:r.data}); }
      catch(e){ endpointChecks.push({endpoint:ep,status:'ERR',ms:Date.now()-t,success:false,error:String(e && e.message || e)}); }
    }
    const report = {
      report_type:'yuanxing_full_frontend_backend_diagnostics_export',
      generated_at:new Date().toISOString(),
      page:location.pathname,
      app_version:window.__YX_APP_VERSION__ || server.version || '',
      static_version:window.__YX_STATIC_VERSION__ || server.static_version || '',
      local_snapshot:local,
      server_export:server,
      endpoint_checks:endpointChecks,
      notes:['這份報告只讀取診斷資料，不會修改庫存、訂單、總單、出貨或倉庫資料。','請把此 JSON 檔傳回來，即可直接檢查同步、今日異動、倉庫圖、出貨與 API 是否同源。']
    };
    const date = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    downloadJson(`yuanxing_diagnostics_report_${date}.json`, report);
    setStatus('已匯出診斷報告。');
  }
  async function init(){
    const root = $('#diagnostics-root'); if(!root) return;
    root.innerHTML = `
      <div class="diag-actions">
        <button class="primary-btn" id="diag-run">立即檢查</button>
        <button class="primary-btn" id="diag-export">匯出診斷報告</button>
        <button class="ghost-btn" id="diag-send">送出本機診斷</button>
        <button class="ghost-btn" id="diag-clear">清除本機錯誤紀錄</button>
      </div>
      <div id="diag-status" class="muted">診斷頁已載入。</div>
      <div id="diag-local"></div>
      <div id="diag-server"></div>
      <div id="diag-errors"></div>`;
    if(!document.getElementById('diag-v480-style')){
      const style=document.createElement('style'); style.id='diag-v480-style'; style.textContent='.diagnostics-shell{padding:14px;max-width:980px;margin:0 auto}.diag-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.diag-card{background:rgba(255,255,255,.86);border:1px solid rgba(120,90,50,.14);border-radius:16px;padding:14px;margin:12px 0;box-shadow:0 8px 28px rgba(50,32,16,.06)}.diag-card.ok{border-color:rgba(30,120,60,.28)}.diag-card.warn{border-color:rgba(180,80,30,.35)}.diag-kv>div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(0,0,0,.06);padding:7px 0}.diag-kv span{text-align:right;word-break:break-all}.diag-row{padding:10px;border:1px solid rgba(0,0,0,.08);border-radius:12px;margin:8px 0;background:#fff}.diag-row.bad{border-color:rgba(200,0,0,.35);background:#fff7f7}.diag-row b{display:block}.diag-row span{color:#8a765f;font-size:12px}.diag-row pre{white-space:pre-wrap;max-height:180px;overflow:auto;background:#f7f3ed;padding:8px;border-radius:8px}'; document.head.appendChild(style);
    }
    const snap = await window.YXDiagnostics?.snapshot?.(); if(snap) renderLocal(snap);
    $('#diag-run').onclick=runServerCheck;
    $('#diag-export').onclick=exportReport;
    $('#diag-send').onclick=sendSnapshot;
    $('#diag-clear').onclick=async()=>{ window.YXDiagnostics?.clear?.(); const s=await window.YXDiagnostics?.snapshot?.(); renderLocal(s||{}); setStatus('已清除本機錯誤紀錄。'); };
    runServerCheck();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
