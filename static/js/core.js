window.YX = (()=>{
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const esc = (v)=>String(v ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const key = ()=>`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tokens = {};
  function nextToken(name){ tokens[name]=(tokens[name]||0)+1; return tokens[name]; }
  function isFresh(name,t){ return tokens[name]===t; }
  function toast(msg, err=false){
    const root = $('#toastRoot'); if(!root) return alert(msg);
    const el = document.createElement('div'); el.className='toast'+(err?' err':''); el.textContent=msg;
    root.appendChild(el); setTimeout(()=>el.remove(), 3200);
  }
  async function api(url, opts={}){
    const method = opts.method || 'GET';
    const headers = Object.assign({'Accept':'application/json'}, opts.headers||{});
    let body = opts.body;
    if(body && !(body instanceof FormData)){ headers['Content-Type']='application/json'; body=JSON.stringify(body); }
    const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort(), opts.timeout || 12000);
    try{
      const res = await fetch(url, {method, headers, body, signal:ctrl.signal});
      if(res.status===401){ toast('登入已過期，請重新登入', true); setTimeout(()=>location.href='/login',800); throw new Error('登入已過期'); }
      const data = await res.json().catch(()=>({ok:false,error:'伺服器回應格式錯誤'}));
      if(!res.ok || data.ok===false) throw new Error(data.error || '操作失敗');
      return data;
    }catch(e){
      if(e.name==='AbortError') throw new Error('連線逾時，請稍後再試');
      throw e;
    }finally{ clearTimeout(to); }
  }
  async function safe(btn, fn){
    if(btn && btn.dataset.busy==='1') return;
    const old = btn ? btn.textContent : '';
    try{ if(btn){btn.dataset.busy='1'; btn.disabled=true;} return await fn(); }
    catch(e){ toast(e.message||'操作失敗', true); }
    finally{ if(btn){btn.dataset.busy='0'; btn.disabled=false; btn.textContent=old;} }
  }
  function today(){ const d=new Date(); const t=$('#todayText'); if(t) t.textContent=d.toLocaleDateString('zh-TW'); }
  async function loadBadge(){
    const b=$('#activityBadge'); if(!b) return;
    try{ const d=await api('/api/activity'); const n=d.unread||0; b.querySelector('b').textContent=n; b.onclick=()=>location.href='/activity'; }catch(e){}
  }
  function attachCustomerSuggest(input){
    if(!input) return;
    let box=null, timer=null;
    input.addEventListener('input',()=>{
      clearTimeout(timer); const q=input.value.trim(); if(box) box.remove(); if(!q) return;
      timer=setTimeout(async()=>{
        try{
          const d=await api('/api/customer-suggest?q='+encodeURIComponent(q));
          if(!d.customers.length) return;
          box=document.createElement('div'); box.className='suggest-box';
          const r=input.getBoundingClientRect(); box.style.left=r.left+'px'; box.style.top=(r.bottom+window.scrollY+4)+'px'; box.style.width=r.width+'px';
          d.customers.forEach(c=>{ const bt=document.createElement('button'); bt.type='button'; bt.textContent=c.name; bt.onclick=()=>{input.value=c.name; box.remove(); input.dispatchEvent(new Event('change'));}; box.appendChild(bt); });
          document.body.appendChild(box);
        }catch(e){}
      },180);
    });
    document.addEventListener('click',e=>{ if(box && e.target!==input && !box.contains(e.target)) box.remove(); });
  }
  async function logout(){ try{ await api('/api/logout',{method:'POST'}); location.href='/login'; }catch(e){ location.href='/login'; } }
  document.addEventListener('DOMContentLoaded',()=>{ today(); loadBadge(); $$('.customer-input').forEach(attachCustomerSuggest); const out=$('#logoutBtn'); if(out) out.onclick=logout; if('serviceWorker' in navigator) navigator.serviceWorker.register('/static/service-worker.js').catch(()=>{}); });
  return { $, $$, esc, key, api, safe, toast, nextToken, isFresh, attachCustomerSuggest, loadBadge };
})();
window.ItemPage = {
  module: 'inventory', selectedCustomer: '', selectedIds: new Set(),
  init(module){
    this.module = module;
    YX.attachCustomerSuggest(YX.$('#customerInput'));
    const add=YX.$('#addItemBtn'); if(add) add.onclick=()=>YX.safe(add,()=>this.addItem());
    const search=YX.$('#searchInput'); if(search) search.addEventListener('input',()=>this.loadItems());
    const clear=YX.$('#clearSearch'); if(clear) clear.onclick=()=>{search.value=''; this.loadItems();};
    const bulk=YX.$('#bulkMaterialBtn'); if(bulk) bulk.onclick=()=>YX.safe(bulk,()=>this.bulkMaterial());
    const del=YX.$('#bulkDeleteBtn'); if(del) del.onclick=()=>YX.safe(del,()=>this.bulkDelete());
    this.loadCustomers(); this.loadItems();
  },
  async addItem(){
    const body={text:YX.$('#productText').value, material:YX.$('#materialInput').value, request_key:YX.key()};
    const ci=YX.$('#customerInput'); if(ci) body.customer_name=ci.value.trim();
    await YX.api('/api/items/'+this.module,{method:'POST',body});
    YX.toast('已新增'); YX.$('#productText').value=''; this.loadCustomers(); this.loadItems(); YX.loadBadge();
  },
  async loadCustomers(){
    const box=YX.$('#customerRegions'); if(!box) return;
    const d=await YX.api('/api/customers');
    const names={north:'北區',center:'中區',south:'南區'};
    box.innerHTML=['north','center','south'].map(r=>`<div class="region" data-region="${r}"><h3>${names[r]}</h3><div class="chip-list">${d.customers.filter(c=>c.region===r).map(c=>`<button class="customer-chip" data-name="${YX.esc(c.name)}">${YX.esc(c.name)}</button>`).join('') || '<span class="hint">尚無客戶</span>'}</div></div>`).join('');
    YX.$$('.customer-chip',box).forEach(btn=>{ btn.onclick=()=>{ this.selectedCustomer=btn.dataset.name; YX.$$('.customer-chip',box).forEach(b=>b.classList.remove('active')); btn.classList.add('active'); this.loadItems(); }; });
  },
  async loadItems(){
    const token=YX.nextToken('items-'+this.module);
    const q=YX.$('#searchInput')?.value.trim() || '';
    const params=new URLSearchParams(); if(q) params.set('q',q); if(this.selectedCustomer && this.module!=='inventory') params.set('customer',this.selectedCustomer);
    const d=await YX.api('/api/items/'+this.module+'?'+params.toString()).catch(e=>{YX.toast(e.message,true); return {items:[]};});
    if(!YX.isFresh('items-'+this.module, token)) return;
    const list=YX.$('#itemList'); if(!list) return;
    this.selectedIds.clear();
    if(!d.items.length){ list.innerHTML='<div class="empty">目前沒有資料</div>'; return; }
    list.innerHTML=d.items.map(item=>this.card(item)).join('');
    YX.$$('.select-item',list).forEach(cb=>cb.onchange=()=>{ cb.checked ? this.selectedIds.add(cb.dataset.id) : this.selectedIds.delete(cb.dataset.id); });
    YX.$$('.edit-item',list).forEach(b=>b.onclick=()=>this.editItem(b.dataset.id));
    YX.$$('.del-item',list).forEach(b=>b.onclick=()=>this.deleteItem(b.dataset.id));
    YX.$$('.to-order',list).forEach(b=>b.onclick=()=>this.toOrder(b.dataset.id));
    YX.$$('.to-master',list).forEach(b=>b.onclick=()=>this.toMaster(b.dataset.id));
    YX.$$('.ship-item',list).forEach(b=>b.onclick=()=>{ sessionStorage.setItem('shipSeed', JSON.stringify({source:this.module,id:b.dataset.id})); location.href='/shipping'; });
  },
  card(item){
    const unlisted = !item.warehouse_key ? '<span class="source">未錄入倉庫圖</span>' : `<span class="source">${YX.esc(item.warehouse_key)}</span>`;
    const source = {inventory:'庫存',orders:'訂單',master:'總單'}[this.module] || this.module;
    const invBtns = this.module==='inventory' ? `<button class="to-order secondary" data-id="${item.id}">加到訂單</button><button class="to-master secondary" data-id="${item.id}">加到總單</button>` : '';
    const masterBtn = this.module==='orders' ? `<button class="to-master secondary" data-id="${item.id}">加入總單</button>` : '';
    return `<article class="item-card"><div class="item-main"><input class="select-item" data-id="${item.id}" type="checkbox"><div><div><span class="mat">${YX.esc(item.material||'未填材質')}</span> ${unlisted} <span class="source">${source}</span></div><div class="prod">${YX.esc(item.product_text)}</div>${item.customer_name?`<div class="hint">${YX.esc(item.customer_name)}</div>`:''}</div><div class="pieces">${item.pieces}件</div></div><div class="actions"><button class="edit-item secondary" data-id="${item.id}">編輯</button><button class="ship-item primary" data-id="${item.id}">直接出貨</button>${invBtns}${masterBtn}<button class="del-item danger" data-id="${item.id}">刪除</button></div></article>`;
  },
  async editItem(id){
    const text=prompt('修改商品格式'); if(!text) return;
    await YX.api(`/api/items/${this.module}/${id}`,{method:'PATCH',body:{product_text:text,request_key:YX.key()}});
    YX.toast('已修改'); this.loadItems();
  },
  async deleteItem(id){ if(!confirm('確定刪除？')) return; await YX.api(`/api/items/${this.module}/${id}`,{method:'DELETE',body:{request_key:YX.key()}}); YX.toast('已刪除'); this.loadItems(); YX.loadBadge(); },
  async toOrder(id){ const customer=prompt('加入哪個客戶訂單？'); if(!customer) return; await YX.api('/api/items/add-to-order',{method:'POST',body:{inventory_id:id,customer_name:customer,request_key:YX.key()}}); YX.toast('已加入訂單'); this.loadItems(); },
  async toMaster(id){ const customer=prompt('加入哪個客戶總單？'); if(!customer) return; const merge=confirm('如果相同客戶+尺寸+材質已存在，是否合併？'); await YX.api('/api/items/add-to-master',{method:'POST',body:{source:this.module,id,customer_name:customer,merge,request_key:YX.key()}}); YX.toast('已加入總單'); this.loadItems(); },
  async bulkMaterial(){ const mat=YX.$('#bulkMaterial').value.trim(); if(!mat) return YX.toast('請輸入材質',true); for(const id of this.selectedIds){ await YX.api(`/api/items/${this.module}/${id}`,{method:'PATCH',body:{material:mat,request_key:YX.key()}}); } YX.toast('批量材質完成'); this.loadItems(); },
  async bulkDelete(){ if(!this.selectedIds.size) return YX.toast('請先選取商品',true); if(!confirm('確定批量刪除？')) return; for(const id of this.selectedIds){ await YX.api(`/api/items/${this.module}/${id}`,{method:'DELETE',body:{request_key:YX.key()}}); } YX.toast('批量刪除完成'); this.loadItems(); }
};
