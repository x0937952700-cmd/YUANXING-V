/* ==== FIX34：括號備註保留 + 總單批量材質 ==== */
(function(){
  'use strict';
  const VERSION = 'fix34-notes-material';
  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const moduleKey = () => document.querySelector('.module-screen')?.dataset?.module ||
    (location.pathname.includes('/master-order') ? 'master_order' : '');

  window.__YUANXING_FIX_VERSION__ = VERSION;
  document.documentElement.dataset.yxVersion = VERSION;

  function say(msg, type='ok'){
    if(typeof window.toast === 'function') window.toast(msg, type);
    else alert(msg);
  }

  async function api(url, options={}){
    const opts = {credentials:'same-origin', ...options};
    opts.headers = {'Content-Type':'application/json', ...(options.headers || {})};
    const res = await fetch(url, opts);
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.success === false){
      throw new Error(data.error || data.message || `請求失敗：${res.status}`);
    }
    return data;
  }

  function normalizeX(v){
    return String(v || '')
      .replace(/[Ｘ×✕＊*X]/g,'x')
      .replace(/[＝]/g,'=')
      .replace(/（/g,'(').replace(/）/g,')')
      .replace(/[。．]/g,'')
      .trim();
  }

  function calcQty(right){
    let total = 0;
    String(right || '').split(/[+＋,，;；]/).forEach(seg => {
      const main = seg.replace(/[\(（][^\)）]*[\)）]/g, '');
      const nums = main.match(/\d+/g) || [];
      if(nums.length >= 2) total += Number(nums[1] || 0) || 0;
      else if(nums.length === 1) total += 1;
    });
    return Math.max(1, total || 1);
  }

  function parseAnnotatedItems(){
    const box = $('ocr-text');
    const text = normalizeX(box?.value || '');
    if(!text) return [];
    const out = [];
    let last = ['', '', ''];
    const lines = text.split(/\n+/).map(x => normalizeX(x).replace(/\s+/g,'')).filter(Boolean);
    const parseToken = token => {
      const parts = String(token || '').split(/=|:/);
      const left = parts.shift();
      let right = parts.join('=').replace(/^[=:]+/,'').trim();
      right = right.replace(/[^\dA-Za-z一-鿿xX+＋\-()]/g, '');
      if(!left || !right) return;
      const dimsRaw = String(left).split(/x/i).map(x => x.trim());
      const dims = [0,1,2].map(i => {
        const v = dimsRaw[i] || '';
        if(!v || /^[_-]+$/.test(v)) return last[i] || '';
        return v;
      });
      if(dims[0] && dims[1] && dims[2]) last = dims.slice();
      if(!dims[0] || !dims[1] || !dims[2]) return;
      const product_text = `${dims.join('x')}=${right}`;
      out.push({product_text, product_code: product_text, qty: calcQty(right)});
    };
    lines.forEach(line => {
      const tokens = line.match(/(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})\s*(?:=|:)\s*[^\n]+/ig) || [];
      if(tokens.length) tokens.forEach(parseToken);
      else if(line.includes('=') && line.match(/x/i)) parseToken(line);
    });
    return out;
  }

  // 覆蓋舊解析：保留 (-1客戶) 備註，件數只看主體的 x件數，不把 -1 備註當成件數。
  window.parseTextareaItems = parseAnnotatedItems;

  function ensureSubmitMaterialSelect(){
    if(moduleKey() !== 'master_order') return;
    const select = $('batch-material');
    if(!select) return;
    select.innerHTML = `<option value="">不指定材質</option>` + MATERIALS.map(m => `<option value="${m}">${m}</option>`).join('');
    select.closest('.hidden-batch-material')?.removeAttribute('style');
  }

  function selectedMasterRows(){
    const cards = Array.from(document.querySelectorAll('#master-list .fix28-action-card'));
    return cards.filter(card => card.querySelector('.fix31-row-check,.fix32-row-check')?.checked).map(card => {
      const id = Number(card.dataset.id || card.querySelector('.fix31-row-check,.fix32-row-check')?.value || 0);
      return id ? {source:'總單', id} : null;
    }).filter(Boolean);
  }

  function ensureMasterMaterialToolbar(){
    const old = document.getElementById('fix34-master-material-toolbar');
    if(old) old.remove();
    return;
    if(moduleKey() !== 'master_order') return;
    const section = $('master-list-section');
    if(!section || $('fix34-master-material-toolbar')) return;
    const html = `<div id="fix34-master-material-toolbar" class="fix34-material-toolbar glass panel">
      <div class="section-title">總單批量材質</div>
      <div class="btn-row compact-row">
        <select id="fix34-master-material" class="text-input small">
          <option value="">選擇材質</option>
          ${MATERIALS.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
        <button id="fix34-apply-master-material" class="primary-btn small-btn" type="button">套用到勾選商品</button>
      </div>
      <div class="small-note">先勾選下方總單商品，再選 SPF/HF/DF/RDT/SPY/SP/RP/TD/MKJ/LVL。只會更新材質，不會改數量。</div>
    </div>`;
    section.querySelector('.section-head')?.insertAdjacentHTML('afterend', html);
    $('fix34-apply-master-material')?.addEventListener('click', applyMasterMaterial);
  }

  async function applyMasterMaterial(){
    const material = ($('fix34-master-material')?.value || '').trim().toUpperCase();
    if(!material) return say('請先選擇材質','warn');
    const items = selectedMasterRows();
    if(!items.length) return say('請先勾選總單商品','warn');
    const ok = confirm(`確定將 ${items.length} 筆總單商品材質改成 ${material}？`);
    if(!ok) return;
    try{
      const data = await api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      say(`已套用材質 ${material}，共 ${data.count || items.length} 筆`, 'ok');
      await window.loadMasterList?.();
      setTimeout(()=>{ ensureMasterMaterialToolbar(); window.dispatchEvent(new Event('resize')); }, 200);
    }catch(e){ say(e.message || '批量材質失敗','error'); }
  }

  // 客戶資料彈窗原本有「套用材質」入口，這裡補成正式可用。
  window.batchApplyCustomerMaterial = async function(customerName){
    const checked = Array.from(document.querySelectorAll('#customer-modal-items input[type="checkbox"]:checked'));
    if(!checked.length) return say('請先勾選商品','warn');
    const material = prompt('輸入或選擇材質：SPF/HF/DF/RDT/SPY/SP/RP/TD/MKJ/LVL', 'SPF');
    if(material === null) return;
    const m = String(material || '').trim().toUpperCase();
    if(!MATERIALS.includes(m)) return say('材質必須是：' + MATERIALS.join(' / '), 'warn');
    const items = checked.map(input => ({source: input.dataset.source || '', id: Number(input.dataset.id || 0)})).filter(x => x.source && x.id);
    try{
      await api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material:m, items})});
      say(`已套用材質 ${m}`,'ok');
      if(typeof window.fillCustomerForm === 'function' && customerName) await window.fillCustomerForm(customerName);
    }catch(e){ say(e.message || '套用材質失敗','error'); }
  };

  function annotateCardsWithMaterial(){
    document.querySelectorAll('#master-list .fix28-action-card').forEach(card => {
      if(card.querySelector('.fix34-material-hint')) return;
      const text = card.textContent || '';
      if(/材質：/.test(text)) return;
      // 若後端舊資料沒有 material，至少不讓欄位空白。
      const main = card.querySelector('.fix28-item-main');
      main?.insertAdjacentHTML('beforeend', `<div class="sub fix34-material-hint">材質：未指定</div>`);
    });
  }

  function boot(){
    ensureSubmitMaterialSelect();
    ensureMasterMaterialToolbar();
    annotateCardsWithMaterial();
    const oldLoad = window.loadMasterList;
    if(oldLoad && !oldLoad.__fix34MaterialWrapped){
      window.loadMasterList = async function(){
        const res = await oldLoad.apply(this, arguments);
        setTimeout(()=>{ ensureMasterMaterialToolbar(); annotateCardsWithMaterial(); }, 80);
        return res;
      };
      window.loadMasterList.__fix34MaterialWrapped = true;
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
