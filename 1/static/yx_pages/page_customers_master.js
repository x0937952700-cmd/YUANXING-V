/* 沅興木業 v17 customers master：補齊客戶資料頁 inline 按鈕，避免舊 app.js 缺失。 */
(function(){
  'use strict';
  if (window.__YX_V17_CUSTOMERS_MASTER__) return;
  window.__YX_V17_CUSTOMERS_MASTER__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g,' ').trim();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (m,k='ok') => { try { (window.YXHardLock?.toast || window.alert)(m,k); } catch(_){ alert(m); } };
  async function api(url,opt={}){
    const res = await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`, {credentials:'same-origin', cache:'no-store', ...opt, headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data={}; try{data=text?JSON.parse(text):{};}catch{data={success:false,error:text};}
    if(!res.ok || data.success===false) throw new Error(data.error || data.message || '請求失敗');
    return data;
  }
  function value(id){ return clean($(id)?.value ?? $(id)?.textContent ?? ''); }
  function setValue(id,v){ const el=$(id); if(!el) return; if('value' in el) el.value = v || ''; else el.textContent = v || '尚未建立'; }
  async function loadCustomers(){
    const d = await api('/api/customers', {method:'GET'});
    if(window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(d.items || []);
    return d.items || [];
  }
  async function fillCustomerForm(name){
    name = clean(name); if(!name) return;
    const items = await loadCustomers();
    const row = items.find(c => clean(c.name) === name) || items.find(c => clean(c.customer_name) === name) || {};
    setValue('cust-name', row.name || row.customer_name || name);
    setValue('cust-phone', row.phone || '');
    setValue('cust-address', row.address || '');
    setValue('cust-notes', row.notes || '');
    setValue('cust-common-materials', row.common_materials || '尚未建立');
    setValue('cust-common-sizes', row.common_sizes || '尚未建立');
    setValue('cust-region', row.region || '北區');
  }
  async function saveCustomer(){
    const name = value('cust-name');
    if(!name) return toast('請輸入客戶名稱','error');
    try{
      await api('/api/customers', {method:'POST', body:JSON.stringify({
        name,
        phone:value('cust-phone'),
        address:value('cust-address'),
        notes:value('cust-notes'),
        common_materials:value('cust-common-materials').replace(/^尚未建立$/,''),
        common_sizes:value('cust-common-sizes').replace(/^尚未建立$/,''),
        region:value('cust-region') || '北區',
        preserve_existing:false
      })});
      await loadCustomers();
      toast('客戶已儲存','ok');
    }catch(e){ toast(e.message || '客戶儲存失敗','error'); }
  }
  async function openArchivedCustomersModal(){
    try{
      const d = await api('/api/customers/archived', {method:'GET'});
      const items = d.items || [];
      let box = $('yx-v17-archived-customers');
      if(!box){
        box = document.createElement('div');
        box.id = 'yx-v17-archived-customers';
        box.className = 'modal';
        document.body.appendChild(box);
      }
      box.innerHTML = `<div class="modal-card glass"><div class="modal-head"><div class="section-title">封存客戶</div><button class="ghost-btn small-btn" type="button" data-close-archive>關閉</button></div><div class="card-list">${items.length ? items.map(c=>`<div class="deduct-card"><strong>${esc(c.name || c.customer_name || '')}</strong><div class="small-note">${esc(c.region || '')}</div><button class="ghost-btn small-btn" type="button" data-restore-customer="${esc(c.name || c.customer_name || '')}">還原</button></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有封存客戶</div>'}</div></div>`;
      box.classList.remove('hidden');
      box.style.display='';
    }catch(e){ toast(e.message || '封存客戶讀取失敗','error'); }
  }
  document.addEventListener('click', async ev=>{
    const close = ev.target.closest?.('[data-close-archive]');
    if(close){ ev.preventDefault(); $('yx-v17-archived-customers')?.classList.add('hidden'); return; }
    const restore = ev.target.closest?.('[data-restore-customer]');
    if(restore){
      ev.preventDefault();
      const name = restore.getAttribute('data-restore-customer');
      try{ await api(`/api/customers/${encodeURIComponent(name)}/restore`, {method:'POST', body:'{}'}); await loadCustomers(); await openArchivedCustomersModal(); toast('已還原客戶','ok'); }catch(e){ toast(e.message || '還原失敗','error'); }
    }
  }, true);
  window.fillCustomerForm = fillCustomerForm;
  window.saveCustomer = saveCustomer;
  window.renderCustomers = async function(){ try{ await loadCustomers(); }catch(e){ toast(e.message || '客戶載入失敗','error'); } };
  window.openArchivedCustomersModal = openArchivedCustomersModal;
})();
