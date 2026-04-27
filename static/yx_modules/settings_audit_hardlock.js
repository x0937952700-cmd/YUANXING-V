/* FIX113 設定頁硬鎖：差異紀錄只顯示當天指定模組，管理員名單 500 相容 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const $ = id => document.getElementById(id);
  const isSettings = () => location.pathname.includes('/settings') || !!$('audit-trails-list') || !!$('admin-users');
  const todayKey = () => new Date().toLocaleDateString('sv-SE');
  function renderAudit(rows){
    const box = $('audit-trails-list'); if (!box) return;
    box.classList.add('yx113-audit-list');
    box.innerHTML = rows.length ? rows.map(r => `<div class="deduct-card yx113-audit-card"><div class="yx113-audit-head"><strong>${YX.esc(r.entity_label || r.entity_type || '資料')}</strong><span>${YX.esc(r.action_label || r.action_type || '操作')}</span></div><div class="yx113-audit-main">${YX.esc(r.summary_text || r.entity_key || '')}</div><div class="small-note">${YX.esc(r.created_at || '')}｜${YX.esc(r.username || '')}</div></div>`).join('') : '<div class="empty-state-card compact-empty">今天還沒有訂單、庫存/進貨、出貨或倉庫圖異動。</div>';
  }
  async function loadAuditTrails(){
    const box = $('audit-trails-list'); if (!box) return;
    const btn = document.activeElement?.tagName === 'BUTTON' ? document.activeElement : null;
    try {
      if (btn) { btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = '載入中…'; }
      box.innerHTML = '<div class="empty-state-card compact-empty">差異紀錄載入中…</div>';
      const qs = new URLSearchParams();
      const map = {'audit-q':'q','audit-user':'username','audit-entity':'entity_type'};
      Object.entries(map).forEach(([id,k]) => { const v = YX.clean($(id)?.value || ''); if (v) qs.set(k,v); });
      qs.set('start_date', YX.clean($('audit-start')?.value || '') || todayKey());
      qs.set('end_date', YX.clean($('audit-end')?.value || '') || todayKey());
      qs.set('limit', '200');
      const d = await YX.api('/api/audit-trails?' + qs.toString(), {method:'GET'});
      renderAudit(Array.isArray(d.items) ? d.items : []);
    } catch(e) {
      box.innerHTML = `<div class="error-card">${YX.esc(e.message || '差異紀錄載入失敗')}</div>`;
      YX.toast(e.message || '差異紀錄載入失敗', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.originalText || '重新整理'; }
    }
  }
  async function loadAdminUsers(){
    const box = $('admin-users'); if (!box) return;
    const btn = document.activeElement?.tagName === 'BUTTON' ? document.activeElement : null;
    try {
      if (btn) { btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = '載入中…'; }
      box.innerHTML = '<div class="empty-state-card compact-empty">管理名單載入中…</div>';
      const d = await YX.api('/api/admin/users?yx113=1&ts=' + Date.now(), {method:'GET'});
      const rows = Array.isArray(d.items) ? d.items : [];
      box.innerHTML = (d.warning ? `<div class="alert warn">${YX.esc(d.warning)}</div>` : '') + (rows.length ? `<div class="yx113-admin-table-wrap"><table class="yx113-admin-table"><thead><tr><th>帳號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows.map(u => { const name = u.username || u.name || ''; const blocked = Number(u.is_blocked || 0) === 1; return `<tr><td>${YX.esc(name)}</td><td>${YX.esc(u.role || (name === '陳韋廷' ? 'admin' : 'user'))}</td><td>${blocked ? '黑名單' : '正常'}</td><td>${name === '陳韋廷' ? '管理員' : `<button type="button" class="ghost-btn tiny-btn" data-yx113-block-user="${YX.esc(name)}" data-blocked="${blocked ? 0 : 1}">${blocked ? '解除' : '封鎖'}</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty-state-card compact-empty">目前沒有帳號</div>');
    } catch(e) {
      box.innerHTML = `<div class="error-card">${YX.esc(e.message || '管理名單載入失敗')}</div>`;
      YX.toast(e.message || '管理名單載入失敗', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.originalText || '重新整理名單'; }
    }
  }
  function bind(){
    if (window.__YX113_SETTINGS_EVENTS__) return; window.__YX113_SETTINGS_EVENTS__ = true;
    document.addEventListener('click', async ev => {
      const block = ev.target?.closest?.('[data-yx113-block-user]');
      if (!block) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      const username = block.dataset.yx113BlockUser; const blocked = block.dataset.blocked === '1';
      try { await YX.api('/api/admin/block', {method:'POST', body:JSON.stringify({username, blocked})}); YX.toast(blocked ? '已加入黑名單' : '已解除黑名單', 'ok'); await loadAdminUsers(); }
      catch(e) { YX.toast(e.message || '帳號狀態更新失敗', 'error'); }
    }, true);
  }
  function install(){
    if (!isSettings()) return;
    document.documentElement.dataset.yx113Settings = 'locked';
    window.loadAuditTrails = YX.mark(loadAuditTrails, 'audit_trails');
    window.loadAdminUsers = YX.mark(loadAdminUsers, 'admin_users');
    bind();
    if ($('audit-start') && !$('audit-start').value) $('audit-start').value = todayKey();
    if ($('audit-end') && !$('audit-end').value) $('audit-end').value = todayKey();
    setTimeout(loadAuditTrails, 50);
    if ($('admin-users')) setTimeout(loadAdminUsers, 80);
  }
  YX.register('settings_audit', {install, loadAuditTrails, loadAdminUsers});
})();
