/* FIX148：安全頁面收斂加速
   原則：不刪功能、不改頁面結構、不動按鈕。只做輕量載入、API timeout、按鈕防重複、設定頁輕量函式、首頁 badge。 */
(function(){
  'use strict';
  var V = 'fix148-safe-page-converge';
  if(window.__YX148_FINAL_SAFE_SPEED__) return;
  window.__YX148_FINAL_SAFE_SPEED__ = true;

  var d = document;
  var YX = window.YXHardLock || null;
  var nativeFetch = window.__YX148_NATIVE_FETCH__ || window.fetch.bind(window);
  window.__YX148_NATIVE_FETCH__ = nativeFetch;
  var clickLocks = Object.create(null);

  function $(id){ return d.getElementById(id); }
  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];}); }
  function page(){
    try{
      if(d.querySelector('.module-screen[data-module]')) return d.querySelector('.module-screen[data-module]').getAttribute('data-module') || '';
      var p = location.pathname || '/';
      if(p.indexOf('/today-changes') >= 0) return 'today_changes';
      if(p.indexOf('/settings') >= 0) return 'settings';
      if(p === '/' || p === '') return 'home';
      return p.split('/').filter(Boolean)[0] || '';
    }catch(_e){ return ''; }
  }
  function toast(msg, type){
    try{ (YX && YX.toast ? YX.toast : (window.toast || window.showToast || window.notify || console.log))(msg, type || 'ok'); }
    catch(_e){ try{ console.log(msg); }catch(_e2){} }
  }
  function setBusy(btn, on, text){
    if(!btn || btn.dataset.yx148NoBusy === '1') return;
    if(on){
      btn.dataset.yx148Busy = '1';
      btn.dataset.yx148Text = btn.dataset.yx148Text || btn.textContent || '';
      btn.disabled = true;
      btn.classList.add('yx148-busy');
      btn.setAttribute('aria-busy','true');
      if(text) btn.textContent = text;
    }else{
      btn.dataset.yx148Busy = '0';
      btn.disabled = false;
      btn.classList.remove('yx148-busy');
      btn.removeAttribute('aria-busy');
      if(btn.dataset.yx148Text){ btn.textContent = btn.dataset.yx148Text; delete btn.dataset.yx148Text; }
    }
  }
  function activeButton(){
    var el = d.activeElement;
    return el && el.tagName === 'BUTTON' ? el : null;
  }
  async function api(url, opt){
    opt = opt || {};
    var headers = Object.assign({'Content-Type':'application/json'}, opt.headers || {});
    var res = await fetch(url, Object.assign({credentials:'same-origin', cache:'no-store'}, opt, {headers:headers}));
    var txt = await res.text();
    var data = {};
    try{ data = txt ? JSON.parse(txt) : {}; }
    catch(_e){ data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){
      var e = new Error(data.error || data.message || ('請求失敗：' + res.status));
      e.payload = data;
      throw e;
    }
    return data;
  }

  // API 卡住保護：避免按鈕永遠停在「送出中 / 載入中」。不處理報表下載與靜態檔。
  function installFetchTimeout(){
    if(window.fetch && window.fetch.__yx148Timeout) return;
    var wrapped = function(input, init){
      init = init || {};
      var url = '';
      try{ url = new URL((typeof input === 'string' ? input : (input && input.url) || ''), location.href).pathname; }catch(_e){}
      var isApi = url.indexOf('/api/') === 0;
      if(!isApi || init.signal || url.indexOf('/api/reports/export') === 0) return nativeFetch(input, init);
      var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      var timeout = method === 'GET' ? 16000 : 22000;
      var controller = new AbortController();
      var timer = setTimeout(function(){ try{ controller.abort(); }catch(_e){} }, timeout);
      var next = Object.assign({}, init, {signal:controller.signal});
      return nativeFetch(input, next).catch(function(err){
        if(err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))){
          throw new Error('連線逾時，請稍後再試；按鈕已解除鎖定。');
        }
        throw err;
      }).finally(function(){ clearTimeout(timer); });
    };
    wrapped.__yx148Timeout = true;
    window.fetch = wrapped;
  }

  // 同一顆危險按鈕短時間只跑一次，防止舊版與新版 click handler 同時送出。
  function installClickDedupe(){
    if(window.__YX148_CLICK_DEDUPE__) return;
    window.__YX148_CLICK_DEDUPE__ = true;
    var riskSelector = [
      '#submit-btn','#ship-refresh-customer-items','#ship-add-selected-item','#ship-add-all-items',
      '[onclick*="confirmSubmit"]','[onclick*="saveWarehouseCell"]','[onclick*="loadShippingRecords"]',
      '[onclick*="loadAuditTrails"]','[onclick*="loadAdminUsers"]','[onclick*="createBackup"]',
      '[onclick*="undoLastAction"]','[onclick*="saveCustomer"]','[onclick*="renderCustomers"]',
      '[data-yx146-action]','[data-yx112-delete-today]','[data-yx69-restore-backup]','[data-yx68-restore-backup]',
      '[data-yx113-block-user]','[data-yx113-undo-audit]'
    ].join(',');
    d.addEventListener('click', function(ev){
      var btn = ev.target && ev.target.closest && ev.target.closest(riskSelector);
      if(!btn) return;
      if(btn.closest && btn.closest('a[href]')) return;
      var key = btn.id || btn.getAttribute('onclick') || btn.getAttribute('data-yx146-action') || btn.textContent || 'btn';
      key = page() + ':' + clean(key).slice(0,80);
      var now = Date.now();
      if(clickLocks[key] && now - clickLocks[key] < 750){
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation && ev.stopImmediatePropagation();
        return false;
      }
      clickLocks[key] = now;
      setTimeout(function(){ if(clickLocks[key] && Date.now() - clickLocks[key] > 720) delete clickLocks[key]; }, 900);
    }, true);
  }

  function installSettingsLite(){
    if(page() !== 'settings' || window.__YX148_SETTINGS_LITE__) return;
    window.__YX148_SETTINGS_LITE__ = true;
    d.documentElement.dataset.yx148SettingsLite = '1';

    window.changePassword = async function(){
      var btn = activeButton(), msg = $('settings-msg');
      try{
        setBusy(btn, true, '儲存中…');
        var old_password = clean(($('old-password') || {}).value || '');
        var new_password = clean(($('new-password') || {}).value || '');
        var confirm_password = clean(($('confirm-password') || {}).value || '');
        await api('/api/change_password', {method:'POST', body:JSON.stringify({old_password:old_password,new_password:new_password,confirm_password:confirm_password})});
        ['old-password','new-password','confirm-password'].forEach(function(id){ if($(id)) $(id).value=''; });
        if(msg){ msg.textContent='密碼已更新'; msg.className='alert ok'; msg.classList.remove('hidden'); }
        toast('密碼已更新','ok');
      }catch(e){
        if(msg){ msg.textContent=e.message || '修改失敗'; msg.className='alert error'; msg.classList.remove('hidden'); }
        toast(e.message || '修改失敗','error');
      }finally{ setBusy(btn,false); }
    };

    window.undoLastAction = async function(){
      var btn = activeButton(), box = $('undo-msg');
      try{
        setBusy(btn,true,'還原中…');
        var data = await api('/api/undo-last', {method:'POST', body:'{}'});
        if(box) box.textContent = data.message || data.summary || '已還原上一筆';
        toast((box && box.textContent) || '已還原上一筆','ok');
      }catch(e){
        if(box) box.textContent = e.message || '還原失敗';
        toast(e.message || '還原失敗','error');
      }finally{ setBusy(btn,false); }
    };

    window.downloadReport = function(type){
      var qs = new URLSearchParams();
      qs.set('type', type || 'inventory');
      var s = clean(($('report-start') || {}).value || '');
      var e = clean(($('report-end') || {}).value || '');
      if(s) qs.set('start_date', s);
      if(e) qs.set('end_date', e);
      toast('正在下載報表…','ok');
      location.href = '/api/reports/export?' + qs.toString();
    };

    async function loadBackups(){
      var box = $('backup-panel');
      if(!box) return;
      try{
        var data = await api('/api/backups?yx148=1&ts=' + Date.now(), {method:'GET'});
        var files = Array.isArray(data.files) ? data.files : [];
        box.innerHTML = files.length ? files.map(function(f){
          var name = f.filename || '';
          return '<div class="deduct-card"><strong>'+esc(name)+'</strong><div class="small-note">'+esc(f.created_at||'')+'｜'+Number(f.size||0).toLocaleString()+' bytes</div><div class="btn-row compact-row"><a class="ghost-btn tiny-btn" href="/api/backups/download/'+encodeURIComponent(name)+'">下載</a><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx148-restore-backup="'+esc(name)+'">還原</button></div></div>';
        }).join('') : '<div class="empty-state-card compact-empty">尚無備份</div>';
      }catch(e){ box.innerHTML = '<div class="error-card">'+esc(e.message || '備份清單載入失敗')+'</div>'; }
    }
    window.loadBackups = loadBackups;

    window.createBackup = async function(){
      var btn = activeButton();
      try{
        setBusy(btn,true,'備份中…');
        await api('/api/backup', {method:'POST', body:'{}'});
        toast('備份已建立','ok');
        await loadBackups();
      }catch(e){ toast(e.message || '備份失敗','error'); }
      finally{ setBusy(btn,false); }
    };

    window.logout = async function(){
      var btn = activeButton();
      try{ setBusy(btn,true,'登出中…'); await api('/api/logout', {method:'POST', body:'{}'}); }catch(_e){}
      location.href = '/login';
    };

    d.addEventListener('click', async function(ev){
      var restore = ev.target && ev.target.closest && ev.target.closest('[data-yx148-restore-backup],[data-yx69-restore-backup],[data-yx68-restore-backup]');
      if(!restore) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation && ev.stopImmediatePropagation();
      var filename = restore.getAttribute('data-yx148-restore-backup') || restore.getAttribute('data-yx69-restore-backup') || restore.getAttribute('data-yx68-restore-backup') || '';
      if(window.confirm && !window.confirm('確定要還原這份備份？目前資料會被覆蓋。')) return;
      try{ setBusy(restore,true,'還原中…'); await api('/api/backups/restore', {method:'POST', body:JSON.stringify({filename:filename})}); toast('備份已還原','ok'); }
      catch(e){ toast(e.message || '備份還原失敗','error'); }
      finally{ setBusy(restore,false); }
    }, true);

    try{ if(YX && YX.install) YX.install('settings_audit', {force:true}); }catch(_e){}
    setTimeout(loadBackups, 80);
  }

  function installHomeBadge(){
    if(page() !== 'home' || window.__YX148_HOME_BADGE__) return;
    window.__YX148_HOME_BADGE__ = true;
    var btn = $('today-changes-btn');
    if(!btn) return;
    setTimeout(function(){
      api('/api/today-changes?home_badge=1&ts=' + Date.now(), {method:'GET'}).then(function(data){
        var n = Number((data.summary || {}).unread_count || 0);
        var old = btn.querySelector('.yx148-home-badge');
        if(old) old.remove();
        if(n > 0){
          var badge = d.createElement('span');
          badge.className = 'yx148-home-badge';
          badge.textContent = n > 99 ? '99+' : String(n);
          btn.appendChild(badge);
        }
      }).catch(function(){});
    }, 300);
  }

  function exposeHealth(){
    window.YX148HealthCheck = function(){
      var scripts = Array.prototype.map.call(d.scripts || [], function(s){ return (s.src || '').split('/').pop(); }).filter(Boolean);
      return {
        version: V,
        page: page(),
        endpoint: window.__YX_PAGE_ENDPOINT__ || '',
        appJsLoaded: scripts.some(function(s){ return s.indexOf('app.js') === 0; }),
        fix147Loaded: !!window.__YX147_SAFE_CONVERGE_SPEED__,
        fix146Loaded: !!window.__YX146_SPEED_SHIP_PRODUCT_HOME__,
        settingsLite: !!window.__YX148_SETTINGS_LITE__,
        todayLite: page() === 'today_changes',
        scripts: scripts
      };
    };
  }

  function install(){
    YX = window.YXHardLock || YX;
    try{ d.documentElement.dataset.yxFix148 = V; if(d.body) d.body.dataset.yxFix148 = '1'; }catch(_e){}
    installFetchTimeout();
    installClickDedupe();
    installSettingsLite();
    installHomeBadge();
    exposeHealth();
    try{ d.documentElement.classList.remove('yx146-leaving','yx148-leaving'); var m=$('yx146-fast-nav-mask')||$('yx148-fast-nav-mask'); if(m) m.remove(); }catch(_e){}
  }

  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  window.addEventListener('pageshow', install);
  window.YX148FinalSafeSpeed = {version:V, install:install, api:api, health:function(){return window.YX148HealthCheck && window.YX148HealthCheck();}};
})();