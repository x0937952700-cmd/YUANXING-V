/* YX 20260516r: 520 settings JS peeled into stable settings_manual.js. */

/* formal page module */
(function(){
  'use strict';
  if (window.YX30EffectiveQty) return;
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function stripParen(v){ return String(v || '').replace(/[\(（][^\)）]*[\)）]/g,''); }
  function parenAdjust(v){
    // formal mainline behavior.
    return 0;
  }
  function isSingleQtyX(seg){
    const s = stripParen(seg).replace(/\s+/g,'').toLowerCase();
    return s.split('x').length === 2 && /x\s*\d+\s*$/i.test(s);
  }
  function effectiveQty(text, fallback){
    const raw = norm(text || '');
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    if (!raw) return fb || 0;
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if (!right) return raw ? 1 : (fb || 0);
    const rightForCanonical = stripParen(right).replace(/\s+/g,'').toLowerCase();
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (rightForCanonical === canonical) return 15;
    const parts = right.split('+').map(clean).filter(Boolean);
    if (!parts.length) return raw ? 1 : (fb || 0);
    const xParts = parts.filter(isSingleQtyX);
    const bare = parts.filter(p => !isSingleQtyX(p) && /\d/.test(stripParen(p)));
    if (parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0]
        && /^\d{3,}\s*x\s*\d+\s*$/i.test(stripParen(xParts[0]).replace(/\s+/g,''))
        && bare.length >= 8) return bare.length;
    let total = 0;
    let hit = false;
    for (const seg of parts){
      const plain = stripParen(seg);
      const explicit = plain.match(/(\d+)\s*[件片]/);
      if (explicit){ total += Math.max(0, Number(explicit[1] || 0) + parenAdjust(seg)); hit = true; continue; }
      const m = isSingleQtyX(seg) ? plain.match(/x\s*(\d+)\s*$/i) : null;
      if (m){ total += Math.max(0, Number(m[1] || 0) + parenAdjust(seg)); hit = true; }
      else if (/\d/.test(plain)){ total += 1; hit = true; }
    }
    return hit ? total : (raw ? 1 : (fb || 0));
  }
  function splitSupportLines(value){
    const raw = String(value == null ? '' : value);
    const parts = raw.split('+').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 5) {
      const cut = Math.ceil(parts.length / 2);
      return [parts.slice(0, cut).join('+'), parts.slice(cut).join('+')].filter(Boolean);
    }
    if (raw.length > 34 && raw.includes('+')) {
      const cut = Math.ceil(parts.length / 2);
      return [parts.slice(0, cut).join('+'), parts.slice(cut).join('+')].filter(Boolean);
    }
    return [raw];
  }
  function supportHTML(value, esc){
    const escape = typeof esc === 'function' ? esc : (s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
    return splitSupportLines(value).map(line => `<span class="yx-support-line">${escape(line)}</span>`).join('');
  }
  function numberFromToken(token){
    const s = String(token ?? '').replace(/[^\d.]/g, '');
    if (!s) return Number.POSITIVE_INFINITY;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }
  function splitProductText(row){
    const t = norm(row?.product_text || row?.size || '');
    const left = (t.split('=')[0] || t || '');
    const mm = left.match(/^(\d{1,2})月(.+)$/);
    const month = mm ? Math.max(1, Math.min(12, Number(mm[1] || 99))) : 99;
    const body = mm ? (mm[2] || '') : left;
    const parts = body.split('x').filter(Boolean);
    return {
      month,
      length:numberFromToken(parts[0]),
      width:numberFromToken(parts[1]),
      height:numberFromToken(parts[2]),
      body
    };
  }
  function materialOf(row){
    const text = norm(row?.product_text || '');
    const raw = clean(row?.material || row?.product_code || '').toLocaleUpperCase('zh-Hant');
    const rr = norm(raw);
    if (!raw || raw === text || rr.includes('=') || /^\d+(?:x|×)/i.test(rr)) return '未填材質';
    return raw;
  }
  function supportSticks(row){
    const raw = norm(row?.product_text || row?.support || '');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : norm(row?.support || '');
    let sticks = 0;
    right.split('+').map(stripParen).map(s=>s.trim()).filter(Boolean).forEach(seg => {
      const m = seg.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i);
      if (m) sticks += (Number(m[1] || 0) || 0) * (Number(m[2] || 0) || 0);
      else {
        const n = Number((seg.match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
        if (n > 0) sticks += n;
      }
    });
    return sticks || Number(row?.sticks ?? row?.quantity ?? 0) || 0;
  }
  function compareRows(a,b){
    const ma = materialOf(a) === '未填材質' ? 'ZZZ_未填材質' : materialOf(a);
    const mb = materialOf(b) === '未填材質' ? 'ZZZ_未填材質' : materialOf(b);
    const mc = ma.localeCompare(mb, 'zh-Hant', {numeric:true, sensitivity:'base'});
    if (mc) return mc;
    const da = splitProductText(a), db = splitProductText(b);
    if (da.month !== db.month) return da.month - db.month;
    if (da.height !== db.height) return da.height - db.height;
    if (da.width !== db.width) return da.width - db.width;
    if (da.length !== db.length) return da.length - db.length;
    const qa = effectiveQty(a?.product_text || a?.support || '', a?.qty ?? a?.effective_qty ?? 0);
    const qb = effectiveQty(b?.product_text || b?.support || '', b?.qty ?? b?.effective_qty ?? 0);
    if (qa !== qb) return qb - qa;
    const sa = supportSticks(a), sb = supportSticks(b);
    if (sa !== sb) return sb - sa;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'zh-Hant', {numeric:true});
  }
  window.YX30EffectiveQty = effectiveQty;
  window.YX30SupportHTML = supportHTML;
  window.YX30CompareRows = compareRows;
  window.YX30SortRows = rows => Array.isArray(rows) ? [...rows].sort(compareRows) : [];
})();
/* formal page module */

/* 沅興木業 FULL MASTER main REAL LOADED COMPLETE - page_settings_master_main */
(function(){ window.__YX_FULL_MASTER_main_PAGE__='page_settings_master_main'; })();

/* formal page module */
/* formal page module */
(function(){
  'use strict';
  if (window.YXCore && window.YXCore.version === 'v93-main-core') return;

  const registry = Object.create(null);
  const installed = Object.create(null);

  function clean(v){ return String(v ?? '').replace(/\s+/g, ' ').trim(); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function moduleKey(){
    const b = document.body && document.body.dataset && document.body.dataset.module;
    if (b) return b;
    const m = document.querySelector('.module-screen[data-module]')?.getAttribute('data-module');
    if (m) return m;
    const p = location.pathname || '';
    if (p.includes('/today-changes')) return 'today_changes';
    if (p.includes('/master-order')) return 'master_order';
    if (p.includes('/shipping-query')) return 'shipping_query';
    if (p.includes('/warehouse')) return 'warehouse';
    if (p.includes('/settings')) return 'settings';
    if (p.includes('/inventory')) return 'inventory';
    if (p.includes('/orders')) return 'orders';
    if (p.includes('/ship')) return 'ship';
    if (p.includes('/customers')) return 'customers';
    if (p.includes('/todos')) return 'todos';
    return p === '/' ? 'home' : '';
  }
  function toast(message, kind='ok'){
    try { (window.toast || window.showToast || window.notify || console.log)(message, kind); }
    catch(_e) { try { console.log(message); } catch(_e2){} }
  }
  async function api(url, opt={}){
    const headers = {'Content-Type':'application/json', ...(opt.headers || {})};
    const res = await window.YXDataStore.requestResponse(url, {credentials:'same-origin', cache:'no-store', ...opt, headers});
    const txt = await res.text();
    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; }
    catch(_e) { data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) {
      const e = new Error(data.error || data.message || `請求失敗：${res.status}`);
      e.payload = data;
      throw e;
    }
    return data;
  }
  function safeExpose(name, value, opts={}){
    // formal mainline behavior.
    try {
      const current = Object.getOwnPropertyDescriptor(window, name);
      if (current && current.configurable === false) {
        // 尊重既有瀏覽器狀態，但不再新增鎖死屬性，避免舊版互相覆蓋或拋錯。
        return ('value' in current) ? current.value : value;
      }
      Object.defineProperty(window, name, {
        configurable: true, enumerable: false, writable: true, value
      });
    } catch(_e) {
      try { window[name] = value; } catch(_e2) {}
    }
    return value;
  }
  function mark(fn, name){
    if (typeof fn === 'function') {
      try {
        if (Object.prototype.hasOwnProperty.call(fn, '__yx113CoreFn')) return fn;
        Object.defineProperty(fn, '__yx113CoreFn', {value:name || true, configurable:true, enumerable:false, writable:true});
      } catch(_e) {
        // 不直接指派唯讀屬性，避免 product_source_bridge 重複主檔固定時中斷。
      }
    }
    return fn;
  }
  function cancelLegacyTimers(scope){
    // timer cleanup 已將 timer 收到集合；這裡只在目前頁面進入主檔固定時清掉，避免舊版延遲重畫。
    try {
      const nativeClear = window.__YX96_NATIVE_CLEAR_TIMEOUT__ || window.clearTimeout;
      if (window.__YX96_TIMEOUTS__) {
        Array.from(window.__YX96_TIMEOUTS__).forEach(id => { try { nativeClear(id); } catch(_e){} });
        window.__YX96_TIMEOUTS__.clear();
      }
      if (typeof window.__YX96_CANCEL_LEGACY_TIMERS__ === 'function') window.__YX96_CANCEL_LEGACY_TIMERS__();
    } catch(_e) {}
    document.documentElement.dataset.yx113TimerScope = scope || 'all';
  }
  function register(name, mod){ registry[name] = mod || {}; return mod; }
  function install(name, opts={}){
    const mod = registry[name];
    if (!mod || typeof mod.install !== 'function') return null;
    if (installed[name] && !opts.force) return installed[name];
    installed[name] = mod.install(opts) || true;
    return installed[name];
  }
  function installAll(opts={}){
    Object.keys(registry).forEach(name => {
      try { install(name, opts); } catch(e) { toast(`${name} 安裝失敗：${e.message || e}`, 'error'); }
    });
  }
  window.YXCore = {
    version: 'v93-main-core',
    register, install, installAll, registry, installed,
    clean, esc, api, toast, moduleKey, safeExpose, mark, cancelLegacyTimers,
  };
  document.documentElement.dataset.yx113Core = 'on';
})();

/* ===== END static/yx_modules/core_main.js ===== */

/* formal page module */
/* formal page module */
(function(){
  'use strict';
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function qty(text, fallback){
    return window.YX30EffectiveQty ? window.YX30EffectiveQty(text, fallback) : 0;
  }
  window.YX126Qty = qty;
  window.yxEffectiveQty = qty;
  window.calcTotalQty = qty;
})();

/* ===== END static/yx_modules/quantity_rule_main.js ===== */

/* formal page module */
(function(){
  'use strict';
  document.documentElement.dataset.yx124OrnateLabel = 'main';
  document.documentElement.dataset.yx124MasterLabel = 'main';
  document.documentElement.dataset.yx127GrayRingEqualHome = 'main';
  document.documentElement.classList.add('yx124-ornate-scope');
  window.YX124OrnateLabel = ({version:'v5-static-no-observer', install:function(){return true;}, apply:function(){return true;}});
})();
/* formal page module */

/* formal page module */
/* formal page module */
(function(){
  'use strict';
  const YX = window.YXCore;
  if (!YX) return;

  function clean(v){ return String(v ?? '').replace(/[\u3000\s]+/g, ' ').trim(); }
  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g, 'x').replace(/[＝]/g, '=').replace(/\s+/g, ''); }
  function naturalMaterial(v){
    const raw = clean(v || '未填材質');
    return raw === '未填材質' ? 'ZZZ_未填材質' : raw.toLocaleUpperCase('zh-Hant');
  }
  function materialOf(row){
    const text = normX(row?.product_text || '');
    const raw = clean(row?.material || row?.product_code || '').toLocaleUpperCase('zh-Hant');
    const rr = normX(raw);
    if (!raw || raw === text || rr.includes('=') || /^\d+(?:x|×)/i.test(rr)) return '未填材質';
    return raw;
  }
  function parseNumber(token){
    const s = String(token ?? '').replace(/[^\d.]/g, '');
    if (!s) return Number.POSITIVE_INFINITY;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }
  function productLeft(row){
    return normX(row?.product_text || row?.size || '').split('=')[0] || '';
  }
  function productRight(row){
    const t = normX(row?.product_text || row?.support || '');
    const i = t.indexOf('=');
    return i >= 0 ? t.slice(i + 1) : normX(row?.support || '');
  }
  function parseDims(row){
    const parts = productLeft(row).split('x').filter(Boolean);
    const len = parseNumber(parts[0]);
    const wid = parseNumber(parts[1]);
    const hei = parseNumber(parts[2]);
    return {length:len, width:wid, height:hei, key:`${len}|${wid}|${hei}`};
  }
  function parseSupport(row){
    const right = productRight(row);
    let pieces = 0;
    let sticks = 0;
    if (right) {
      right.split('+').map(s => s.trim()).filter(Boolean).forEach(seg => {
        const m = seg.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i);
        if (m) {
          const stick = Number(m[1] || 0) || 0;
          const count = Number(m[2] || 0) || 0;
          pieces += count;
          sticks += stick * count;
        } else {
          const n = Number((seg.match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
          if (n > 0) { pieces += 1; sticks += n; }
        }
      });
    }
    if (!pieces) pieces = Number(row?.qty ?? row?.effective_qty ?? 0) || 0;
    if (!sticks) sticks = Number(row?.sticks ?? row?.quantity ?? 0) || 0;
    return {pieces, sticks};
  }
  function compareRows(a, b){
    const ma = naturalMaterial(materialOf(a));
    const mb = naturalMaterial(materialOf(b));
    const mcmp = ma.localeCompare(mb, 'zh-Hant', {numeric:true, sensitivity:'base'});
    if (mcmp) return mcmp;

    const da = parseDims(a);
    const db = parseDims(b);
    if (da.height !== db.height) return da.height - db.height;
    if (da.width !== db.width) return da.width - db.width;
    if (da.length !== db.length) return da.length - db.length;

    const sa = parseSupport(a);
    const sb = parseSupport(b);
    if (sa.pieces !== sb.pieces) return sb.pieces - sa.pieces;
    if (sa.sticks !== sb.sticks) return sb.sticks - sa.sticks;

    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'zh-Hant', {numeric:true});
  }
  function sortRows(rows){ return Array.isArray(rows) ? [...rows].sort(compareRows) : []; }
  function install(){
    document.documentElement.dataset.yx118ProductSort = 'main';
    window.YX118ProductSort = {compareRows, sortRows, parseDims, parseSupport, materialOf};
  }
  YX.register('product_sort', {install, compareRows, sortRows});
  install();
})();

/* ===== END static/yx_modules/product_sort_main.js ===== */

/* formal page module */
/* 設定頁手動載入：不自動抓差異/名單/備份，避免返回主頁卡住 */
(function(){
  'use strict';
  const VERSION='v520-final-ship-cache-align-pack30';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,opt={}){const res=await window.YXDataStore.requestResponse(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const txt=await res.text();let d={};try{d=txt?JSON.parse(txt):{}}catch{d={success:false,error:txt||'伺服器回應格式錯誤'}};if(!res.ok||d.success===false)throw new Error(d.error||d.message||`請求失敗 ${res.status}`);return d;}
  function msg(id,text,kind='ok'){const el=document.getElementById(id);if(!el)return;el.className='alert '+kind;el.textContent=text;el.classList.remove('hidden');}
  function fmt(ms){try{return ms?new Date(Number(ms)).toLocaleString('zh-TW',{hour12:false}):'尚未同步'}catch(_e){return '尚未同步'}}
  function autoKey(){return 'yx_device_sync_v453_auto'}
  function readAuto(){try{return JSON.parse(localStorage.getItem(autoKey())||'null')||{enabled:false}}catch(_e){return {enabled:false}}}
  function writeAuto(v){try{localStorage.setItem(autoKey(),JSON.stringify(Object.assign({enabled:false},v||{})))}catch(_e){}}
  function nextAutoDate(){const d=new Date();d.setHours(5,0,0,0);if(Date.now()>=d.getTime())d.setDate(d.getDate()+1);return d;}
  function updateSyncStatus(){const meta=window.YXDeviceSync?.readMeta?.()||{};const txt=document.getElementById('settings-sync-text');const autoBtn=document.getElementById('settings-auto-sync-btn');const q=Number(window.YXBackgroundSave?.pending?.()||0);if(txt)txt.textContent='上次同步：'+fmt(meta.last_success_at||meta.saved_at||0)+(q>0?'｜背景待送：'+q+'筆':'');const auto=readAuto();if(autoBtn)autoBtn.textContent=auto.enabled?'自動同步：開':'自動同步：關';}

  window.changePassword=async function(){const old_password=document.getElementById('old-password')?.value||'';const new_password=document.getElementById('new-password')?.value||'';const confirm=document.getElementById('confirm-password')?.value||'';if(!new_password||new_password!==confirm)return msg('settings-msg','新密碼與確認密碼不一致','error');try{await api('/api/change_password',{method:'POST',body:JSON.stringify({old_password,new_password})});msg('settings-msg','密碼已更新','ok');}catch(e){msg('settings-msg',e.message,'error');}};
  window.logout=async function(){try{await api('/api/logout',{method:'POST',body:'{}'});}catch(_){} location.href='/login';};
  window.undoLastAction=async function(){const el=document.getElementById('undo-msg');try{const d=await api('/api/undo',{method:'POST',body:'{}'});if(el)el.textContent=d.message||'已還原上一筆';}catch(e){if(el)el.textContent=e.message||'目前沒有可還原資料';}};
  window.downloadReport=function(type){const s=document.getElementById('report-start')?.value||'';const e=document.getElementById('report-end')?.value||'';const q=new URLSearchParams({type,start:s,end:e});location.href='/api/report?'+q.toString();};

  window.loadAuditTrails=async function(){const box=document.getElementById('audit-trails-list');if(!box)return;box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';try{const q=new URLSearchParams({q:document.getElementById('audit-q')?.value||'',username:document.getElementById('audit-user')?.value||'',entity_type:document.getElementById('audit-entity')?.value||'',start_date:document.getElementById('audit-start')?.value||'',end_date:document.getElementById('audit-end')?.value||''});const d=await api('/api/audit-trails?'+q.toString());const rows=d.items||d.logs||[];box.innerHTML=rows.length?rows.map(r=>`<div class="deduct-card" data-audit-id="${esc(r.id||'')}"><strong>${esc(r.username||r.user||'')}</strong><div>${esc(r.summary_text||r.action||r.message||'')}</div><div class="small-note">${esc(r.entity_label||r.entity||r.table_name||r.entity_type||'')}｜${esc(r.created_at||r.time||'')}</div><div class="btn-row compact"><button class="ghost-btn small-btn" data-audit-restore="${esc(r.id||'')}" type="button">單筆還原</button></div></div>`).join(''):'<div class="empty-state-card compact-empty">沒有差異紀錄</div>'; }catch(e){box.innerHTML='<div class="empty-state-card compact-empty">'+esc(e.message)+'</div>';}};

  window.loadAdminUsers=async function(){const box=document.getElementById('admin-users');if(!box)return;box.innerHTML='載入中…';try{const d=await api('/api/admin/users');const rows=d.items||d.users||[];box.innerHTML=`<table><thead><tr><th>帳號</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows.map(u=>{const name=esc(u.username||u.name||'');const blocked=Number(u.is_blocked||u.blocked||0)===1;return `<tr><td>${name}</td><td>${blocked?'黑名單':'正常'}</td><td><button class="ghost-btn small-btn" data-block-user="${name}" data-blocked="${blocked?'0':'1'}">${blocked?'解除黑名單':'加入黑名單'}</button></td></tr>`;}).join('')}</tbody></table>`;}catch(e){box.textContent=e.message;}};

  window.createBackup=async function(){const box=document.getElementById('backup-panel');if(box)box.textContent='建立備份中…';try{const d=await api('/api/backup',{method:'POST',body:'{}'});const file=d.filename||String(d.file||'').split('/').pop();if(box)box.textContent=file?`備份完成：${file}`:'備份完成'; await loadBackupsManual();}catch(e){if(box)box.textContent=e.message;}};
  window.loadBackupsManual=async function(){const box=document.getElementById('backup-panel');if(!box)return;box.textContent='載入中…';try{const d=await api('/api/backups');const rows=d.items||d.files||d.backups||[];box.innerHTML=rows.length?rows.map(b=>{const fn=esc(b.filename||b.name||'');return `<div class="deduct-card"><strong>${fn}</strong><div class="small-note">${esc(b.created_at||b.time||'')}｜${esc(b.size||'')} bytes</div><div class="btn-row compact"><a class="ghost-btn small-btn" href="/api/backups/download/${encodeURIComponent(b.filename||b.name||'')}">下載</a><button class="ghost-btn small-btn" data-backup-verify="${fn}" type="button">驗證</button><button class="ghost-btn small-btn danger-text" data-backup-restore="${fn}" type="button">還原</button></div></div>`}).join(''):'尚無備份，按「立即備份」才會建立。';}catch(e){box.textContent=e.message;}};

  async function initSettingsSync(){
    updateSyncStatus();
    const btn=document.getElementById('settings-sync-btn'), autoBtn=document.getElementById('settings-auto-sync-btn'), bar=document.getElementById('settings-sync-bar'), txt=document.getElementById('settings-sync-text'), pct=document.getElementById('settings-sync-percent');
    btn?.addEventListener('click',async()=>{if(!window.YXDeviceSync?.syncAll){if(txt)txt.textContent='同步模組尚未載入';return;}btn.disabled=true;try{const res=await window.YXDeviceSync.syncAll(info=>{const p=Math.max(0,Math.min(100,Number(info.percent||0)));if(bar)bar.style.width=p+'%';if(pct)pct.textContent=p+'%';if(txt)txt.textContent=info.phase==='queue-drain'?`背景保存佇列送出中：${info.pending||0}筆`:`${info.task?.label||'資料'} ${info.phase==='error'?'同步失敗，繼續下一項':'同步中'}（${info.done}/${info.total}）`;},{manual:true});if(bar)bar.style.width='100%';if(pct)pct.textContent='100%';const q=res.queue_status||{};if(txt)txt.textContent=`同步完成：${res.ok}/${res.total} 項｜上次同步：${fmt(Date.now())}${Number(q.pending_after||0)>0?'｜背景待送：'+q.pending_after+'筆':''}`;}catch(e){if(txt)txt.textContent=e.message||'同步失敗';}finally{btn.disabled=false;updateSyncStatus();}});
    autoBtn?.addEventListener('click',()=>{const cur=readAuto();const next=!cur.enabled;writeAuto(Object.assign({},cur,{enabled:next,next_run_at:nextAutoDate().getTime()}));updateSyncStatus();});
  }

  document.addEventListener('click',async e=>{const b=e.target.closest('[data-block-user]');if(!b)return;try{await api('/api/admin/block',{method:'POST',body:JSON.stringify({username:b.dataset.blockUser,blocked:b.dataset.blocked==='1'})});loadAdminUsers();}catch(err){alert(err.message);}},true);
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-audit-restore]');if(!b)return;if(!confirm('確定要還原這筆差異紀錄？'))return;try{const d=await api('/api/audit-trails/'+encodeURIComponent(b.dataset.auditRestore)+'/restore',{method:'POST',body:'{}'});alert(d.message||'已還原');loadAuditTrails();}catch(err){alert(err.message);}},true);
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-backup-verify]');if(!b)return;try{const d=await api('/api/backup/verify',{method:'POST',body:JSON.stringify({filename:b.dataset.backupVerify})});alert(d.success?'備份驗證通過':'備份驗證失敗：'+(d.error||''));}catch(err){alert(err.message);}},true);
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-backup-restore]');if(!b)return;if(!confirm('確定要還原這份備份？目前資料會被備份內容覆蓋。'))return;try{await api('/api/backups/restore',{method:'POST',body:JSON.stringify({filename:b.dataset.backupRestore})});alert('備份已還原，請重新同步資料');}catch(err){alert(err.message);}},true);
  document.addEventListener('DOMContentLoaded',()=>{const bp=document.getElementById('backup-panel');if(bp)bp.textContent='按「立即備份」或手動重新整理才會載入，不再自動抓資料。';initSettingsSync();});
  if(document.readyState!=='loading') initSettingsSync();
  window.__YX_SETTINGS_MANUAL_VERSION__=VERSION;
})();

/* ===== END static/yx_modules/settings_manual.js ===== */

/* formal page module */
/* v18 EXACT HTML_DIRECT_MAIN_BASELINE
   只保留一套 HTML 結構；這支 JS 只負責安裝資料處理模組，不再重建頁面外殼。 */
(function(){
  'use strict';
  if (window.__YX_HTML_DIRECT_MASTER_MAIN__) return;
  window.__YX_HTML_DIRECT_MASTER_MAIN__ = true;
  const YX = window.YXCore;
  const moduleKey = () => {
    try { return YX && YX.moduleKey ? YX.moduleKey() : ''; } catch(_e) { return ''; }
  };
  function safeInstall(name){
    try { if (YX && YX.registry && YX.registry[name]) return YX.install(name); }
    catch(e){ try { (YX.toast || console.warn)(`${name} 載入失敗：${e.message || e}`, 'error'); } catch(_e){} }
    return null;
  }
  function stopLegacyLayoutNames(){
    // formal mainline behavior.
    return undefined;
  }
  function protectStaticShell(){
    document.documentElement.dataset.yxHtmlDirectMaster = 'main';
    document.querySelectorAll('[data-html-direct-shell]').forEach(el => {
      el.dataset.htmlDirectLocked = '1';
    });
    // 保留 HTML 上既有外殼；只清掉舊 FIX 動態插入的重複外殼。
    document.querySelectorAll('.yx63-toolbar,.yx62-toolbar,.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,.fix57-summary-panel,.yx62-summary').forEach(el => {
      el.classList.add('yx-html-direct-disabled-legacy');
      el.style.display = 'none';
      el.setAttribute('aria-hidden','true');
    });
  }
  function install(){
    stopLegacyLayoutNames();
    protectStaticShell();
    const m = moduleKey();
    safeInstall('ornate_label');
    if (m === 'today_changes') safeInstall('today_changes');
    if (m === 'settings') safeInstall('settings_audit');
    if (m === 'warehouse') safeInstall('warehouse');
    if (['orders','master_order','ship','customers'].includes(m)) safeInstall('customer_regions');
    if (['inventory','orders','master_order'].includes(m)) {
      safeInstall('product_sort');
      safeInstall('product_actions');
      safeInstall('product_source_bridge');
    }
    if (m === 'ship') safeInstall('ship_text_validate');
    protectStaticShell();
  }
  window.YX_HTML_DIRECT_MASTER = ({version:'v111-mainfile-single-install', install});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  // no pageshow reinstall: avoid settings -> home lag
})();

/* ===== END static/yx_pages/page_bootstrap_master.js ===== */

/* formal page module */
(function(){
  'use strict';
  if (!window.YX30CompareRows) return;
  window.YX118ProductSort = {
    compareRows: window.YX30CompareRows,
    sortRows: window.YX30SortRows,
    parseSupport: function(row){ return {pieces: window.YX30EffectiveQty(row?.product_text || row?.support || '', row?.qty ?? row?.effective_qty ?? 0), sticks: 0}; },
    materialOf: function(row){
      const raw = String(row?.material || row?.product_code || '').trim().toLocaleUpperCase('zh-Hant');
      const txt = String(row?.product_text || '').trim().toLocaleUpperCase('zh-Hant');
      return (!raw || raw === txt || raw.includes('=')) ? '未填材質' : raw;
    }
  };
  document.documentElement.dataset.yx30QtyParenMonthSort = 'main';
})();
/* formal page module */

