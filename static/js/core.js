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
    if(method !== 'GET' && 'onLine' in navigator && !navigator.onLine){ throw new Error('目前離線，資料沒有送出，請恢復網路後再試'); }
    const headers = Object.assign({'Accept':'application/json'}, opts.headers||{});
    let body = opts.body;
    if(body && !(body instanceof FormData)){ headers['Content-Type']='application/json'; body=JSON.stringify(body); }
    const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort(), opts.timeout || 15000);
    try{
      const res = await fetch(url, {method, headers, body, signal:ctrl.signal});
      if(res.status===401 || res.status===403){ const msg=res.status===403?'此帳號已被封鎖，請重新登入或聯絡管理員':'登入已過期，請重新登入'; toast(msg, true); setTimeout(()=>{ location.href='/login'; }, 600); throw new Error(msg); }
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
    try{ const d=await api('/api/sync-state',{timeout:8000}); const n=d.unread||0; b.querySelector('b').textContent=n; b.onclick=()=>location.href='/activity'; }catch(e){}
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
  let lastSyncId=0;
  async function syncPoll(){
    try{
      const d=await api('/api/sync-state',{timeout:8000});
      const b=$('#activityBadge'); if(b) b.querySelector('b').textContent=d.unread||0;
      const id=Number(d.latest?.id||0);
      if(id && id!==lastSyncId){
        const old=lastSyncId; lastSyncId=id;
        document.dispatchEvent(new CustomEvent('yx:sync',{detail:{latest:d.latest, first:!old}}));
        if(old && d.latest && d.latest.operator && d.latest.operator !== (document.body.dataset.user || '')){
          toast(`${d.latest.operator}：${d.latest.action || '有新異動'}`);
        }
      }
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded',()=>{ today(); setTimeout(loadBadge, 600); setTimeout(syncPoll, 1600); setInterval(syncPoll, 12000); $$('.customer-input').forEach(attachCustomerSuggest); const out=$('#logoutBtn'); if(out) out.onclick=logout; if('serviceWorker' in navigator) navigator.serviceWorker.register('/static/service-worker.js').catch(()=>{}); });
  return { $, $$, esc, key, api, safe, toast, nextToken, isFresh, attachCustomerSuggest, loadBadge, syncPoll };
})();
window.ItemPage = {
  module: 'inventory', selectedCustomer: '', selectedIds: new Set(), itemFilter: '',
  init(module){
    this.module = module;
    YX.attachCustomerSuggest(YX.$('#customerInput'));
    const add=YX.$('#addItemBtn'); if(add) add.onclick=()=>YX.safe(add,()=>this.addItem());
    const search=YX.$('#searchInput'); if(search) search.addEventListener('input',()=>{ this.itemFilter=''; this.loadItems(); });
    const clear=YX.$('#clearSearch'); if(clear) clear.onclick=()=>{search.value=''; this.itemFilter=''; this.loadItems();};
    const bulk=YX.$('#bulkMaterialBtn'); if(bulk) bulk.onclick=()=>YX.safe(bulk,()=>this.bulkMaterial());
    const del=YX.$('#bulkDeleteBtn'); if(del) del.onclick=()=>YX.safe(del,()=>this.bulkDelete());
    const mt=YX.$('#loadMasterText'); if(mt) mt.onclick=()=>YX.safe(mt,()=>this.loadMasterText());
    document.addEventListener('yx:sync',()=>{ if(document.visibilityState==='visible') this.loadItems(); });
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
    if(this.module==='inventory'){ box.innerHTML=''; box.style.display='none'; return; }
    box.style.display='';
    const d=await YX.api('/api/item-customers/'+this.module);
    const names={north:'北區',center:'中區',south:'南區'};
    box.innerHTML=['north','center','south'].map(r=>`<div class="region" data-region="${r}"><h3>${names[r]}</h3><div class="chip-list customer-card-list">${d.customers.filter(c=>c.region===r).map(c=>{const tag=(c.note||c.common_size||'').match(/FOB代|FOB|CNF/i)?.[0]||''; const count=`${Number(c.total_pieces||0)}件/${Number(c.total_records||0)}筆`; return `<button class="customer-chip customer-card-3" data-name="${YX.esc(c.name)}" data-region="${r}"><span class="cust-left">${YX.esc(c.name)}</span><span class="cust-mid">${YX.esc(tag)}</span><span class="cust-right">${YX.esc(count)}</span></button>`;}).join('') || '<span class="hint">尚無客戶</span>'}</div></div>`).join('');
    YX.$$('.customer-chip',box).forEach(btn=>{
      let timer=null, moved=false, sx=0, sy=0, dragging=false;
      const open=()=>{ this.selectedCustomer=btn.dataset.name; YX.$$('.customer-chip',box).forEach(b=>b.classList.remove('active')); btn.classList.add('active'); this.loadItems(); };
      btn.onclick=()=>{ if(!moved && !dragging) open(); moved=false; dragging=false; };
      btn.oncontextmenu=e=>{ e.preventDefault(); this.customerMenu(btn.dataset.name); };
      btn.onpointerdown=e=>{ moved=false; dragging=false; sx=e.clientX; sy=e.clientY; timer=setTimeout(()=>{ if(!dragging) this.customerMenu(btn.dataset.name); },700); try{btn.setPointerCapture(e.pointerId);}catch(_){} };
      btn.onpointermove=e=>{ if(Math.abs(e.clientX-sx)>12 || Math.abs(e.clientY-sy)>12){ moved=true; dragging=true; clearTimeout(timer); btn.classList.add('dragging'); } };
      btn.onpointerup=async e=>{ clearTimeout(timer); btn.classList.remove('dragging'); if(dragging){ const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.region'); if(target && target.dataset.region){ await YX.api('/api/customers/'+encodeURIComponent(btn.dataset.name),{method:'PATCH',body:{region:target.dataset.region,request_key:YX.key()}}); await this.saveRegionOrder(target.dataset.region, btn.dataset.name); this.loadCustomers(); } } };
      btn.onpointercancel=()=>{ clearTimeout(timer); btn.classList.remove('dragging'); };
    });
  },
  async customerMenu(name){
    const act=prompt(`${name}\n1 打開客戶商品\n2 編輯客戶\n3 移到北區\n4 移到中區\n5 移到南區\n6 封存客戶\n7 刪除客戶資料（商品保留）`);
    if(act==='1'){ this.selectedCustomer=name; this.loadItems(); return; }
    if(act==='2'){ const nn=prompt('新客戶名稱',name); if(nn) await YX.api('/api/customers/'+encodeURIComponent(name),{method:'PATCH',body:{name:nn,request_key:YX.key()}}); }
    if(['3','4','5'].includes(act)){ const region={3:'north',4:'center',5:'south'}[act]; await YX.api('/api/customers/'+encodeURIComponent(name),{method:'PATCH',body:{region,request_key:YX.key()}}); }
    if(act==='6'){ await YX.api('/api/customers/'+encodeURIComponent(name),{method:'DELETE',body:{request_key:YX.key()}}); }
    if(act==='7' && confirm('只刪除客戶名片資料，商品與出貨紀錄保留，確定？')){ await YX.api('/api/customers-hard-delete/'+encodeURIComponent(name),{method:'DELETE',body:{request_key:YX.key()}}); }
    this.loadCustomers();
  },
  async saveRegionOrder(region, movedName=''){
    const names=YX.$$(`.region[data-region="${region}"] .customer-chip`).map(x=>x.dataset.name).filter(Boolean).filter(n=>n!==movedName);
    if(movedName) names.push(movedName);
    if(!names.length) return;
    try{ await YX.api('/api/customers/reorder',{method:'POST',body:{region,names,request_key:YX.key()}}); }catch(e){}
  },
  async loadItems(){
    const token=YX.nextToken('items-'+this.module);
    const q=YX.$('#searchInput')?.value.trim() || '';
    const params=new URLSearchParams(); if(q) params.set('q',q); if(this.selectedCustomer && this.module!=='inventory') params.set('customer',this.selectedCustomer);
    const d=await YX.api('/api/items/'+this.module+'?'+params.toString()).catch(e=>{YX.toast(e.message,true); return {items:[]};});
    if(!YX.isFresh('items-'+this.module, token)) return;
    const list=YX.$('#itemList'); if(!list) return;
    this.selectedIds.clear();
    const allItems=d.items||[];
    this.renderProductFilter(allItems);
    const items=this.itemFilter ? allItems.filter(i=>i.product_text===this.itemFilter) : allItems;
    if(!items.length){ list.innerHTML='<div class="empty">目前沒有資料</div>'; return; }
    list.innerHTML=items.map(item=>this.card(item)).join('');
    YX.$$('.select-item',list).forEach(cb=>cb.onchange=()=>{ cb.checked ? this.selectedIds.add(cb.dataset.id) : this.selectedIds.delete(cb.dataset.id); });
    YX.$$('.edit-item',list).forEach(b=>b.onclick=()=>this.editItem(b.dataset.id));
    YX.$$('.del-item',list).forEach(b=>b.onclick=()=>this.deleteItem(b.dataset.id));
    YX.$$('.to-order',list).forEach(b=>b.onclick=()=>this.toOrder(b.dataset.id,b.dataset.pieces));
    YX.$$('.to-master',list).forEach(b=>b.onclick=()=>this.toMaster(b.dataset.id,b.dataset.pieces));
    YX.$$('.ship-item',list).forEach(b=>b.onclick=()=>{ sessionStorage.setItem('shipSeed', JSON.stringify({source:this.module,id:b.dataset.id})); location.href='/shipping'; });
    YX.$$('.cancel-order',list).forEach(b=>b.onclick=()=>this.cancelOrder(b.dataset.id));
    YX.$$('.item-card',list).forEach(card=>{
      let sx=0; const id=card.querySelector('.edit-item')?.dataset.id;
      card.ontouchstart=e=>sx=e.touches[0].clientX;
      card.ontouchend=e=>{ const dx=e.changedTouches[0].clientX-sx; if(dx>70 && id) this.editItem(id); if(dx<-70 && id) this.deleteItem(id); };
    });
  },
  renderProductFilter(items){
    const list=YX.$('#itemList'); if(!list) return;
    let bar=YX.$('#productFilterBar');
    if(!bar){ bar=document.createElement('div'); bar.id='productFilterBar'; bar.className='mini-list product-filter-bar'; list.parentNode.insertBefore(bar, list); }
    const map=new Map();
    (items||[]).forEach(it=>{ const key=it.product_text||''; if(!key) return; const cur=map.get(key)||{pieces:0, records:0}; cur.pieces+=Number(it.pieces||0); cur.records+=1; map.set(key,cur); });
    const buttons=[`<button class="mini-item ${this.itemFilter?'':'active'}" data-product="">全部商品</button>`].concat(Array.from(map.entries()).slice(0,80).map(([prod,meta])=>`<button class="mini-item ${this.itemFilter===prod?'active':''}" data-product="${YX.esc(prod)}">${YX.esc(prod)}｜${meta.pieces}件/${meta.records}筆</button>`));
    bar.innerHTML=buttons.join('');
    YX.$$('button',bar).forEach(b=>b.onclick=()=>{ this.itemFilter=b.dataset.product||''; this.loadItems(); });
  },
  card(item){
    const unlisted = !item.warehouse_key ? '<span class="source">未錄入倉庫圖</span>' : `<span class="source">${YX.esc(item.warehouse_key)}</span>`;
    const source = {inventory:'庫存',orders:'訂單',master:'總單'}[this.module] || this.module;
    const invBtns = this.module==='inventory' ? `<button class="to-order secondary" data-id="${item.id}" data-pieces="${item.pieces}">加到訂單</button><button class="to-master secondary" data-id="${item.id}" data-pieces="${item.pieces}">加到總單</button>` : '';
    const masterBtn = this.module==='orders' ? `<button class="to-master secondary" data-id="${item.id}" data-pieces="${item.pieces}">加入總單</button><button class="cancel-order secondary" data-id="${item.id}">取消訂單</button>` : '';
    const customerHint = (this.module !== 'inventory' && item.customer_name) ? `<div class="hint">${YX.esc(item.customer_name)}</div>` : '';
    return `<article class="item-card"><div class="item-main"><input class="select-item" data-id="${item.id}" type="checkbox"><div><div><span class="mat">${YX.esc(item.material||'未填材質')}</span> ${unlisted} <span class="source">${source}</span></div><div class="prod">${YX.esc(item.product_text)}</div>${customerHint}</div><div class="pieces">${item.pieces}件</div></div><div class="actions"><button class="edit-item secondary" data-id="${item.id}">編輯</button><button class="ship-item primary" data-id="${item.id}">直接出貨</button>${invBtns}${masterBtn}<button class="del-item danger" data-id="${item.id}">刪除</button></div></article>`;
  },
  async editItem(id){
    const d=await YX.api(`/api/items/${this.module}/${id}`);
    const item=d.item||{};
    const text=prompt('修改商品格式', item.product_text||''); if(!text) return;
    const material=prompt('修改材質', item.material||'');
    const piecesRaw=prompt('修改件數', item.pieces||'');
    const body={product_text:text, material:material??item.material, request_key:YX.key()};
    const pieces=Number(piecesRaw);
    if(Number.isFinite(pieces) && pieces>=0) body.pieces=pieces;
    if(this.module!=='inventory'){
      const customer=prompt('修改客戶名稱', item.customer_name||'');
      if(customer!==null) body.customer_name=customer.trim();
    }
    await YX.api(`/api/items/${this.module}/${id}`,{method:'PATCH',body});
    YX.toast('已修改'); this.loadCustomers(); this.loadItems();
  },
  async deleteItem(id){ if(!confirm('確定刪除？')) return; await YX.api(`/api/items/${this.module}/${id}`,{method:'DELETE',body:{request_key:YX.key()}}); YX.toast('已刪除'); this.loadItems(); YX.loadBadge(); },
  async toOrder(id,piecesMax){ const customer=prompt('加入哪個客戶訂單？'); if(!customer) return; const pieces=Number(prompt('加入幾件？', piecesMax||''))||0; if(pieces<=0) return YX.toast('件數錯誤',true); await YX.api('/api/items/add-to-order',{method:'POST',body:{inventory_id:id,customer_name:customer,pieces,request_key:YX.key()}}); YX.toast('已加入訂單'); this.loadCustomers(); this.loadItems(); YX.loadBadge(); },
  async toMaster(id,piecesMax){
    const customer=prompt('加入哪個客戶總單？'); if(!customer) return;
    const pieces=Number(prompt('加入幾件？', piecesMax||''))||0; if(pieces<=0) return YX.toast('件數錯誤',true);
    let merge=false;
    try{
      const pv=await YX.api(`/api/items/master-merge-preview?source=${encodeURIComponent(this.module)}&id=${encodeURIComponent(id)}&customer_name=${encodeURIComponent(customer)}&pieces=${encodeURIComponent(pieces)}`);
      if(pv.merge_possible){
        merge=confirm(`發現相同客戶 + 尺寸 + 材質的總單\n原本：${pv.before} 件\n本次加入：${pv.take} 件\n合併後：${pv.after} 件\n\n確定合併？`);
      }
    }catch(e){ merge=confirm('如果相同客戶+尺寸+材質已存在，是否合併？'); }
    await YX.api('/api/items/add-to-master',{method:'POST',body:{source:this.module,id,customer_name:customer,pieces,merge,request_key:YX.key()}}); YX.toast('已加入總單'); this.loadCustomers(); this.loadItems(); YX.loadBadge();
  },
  async cancelOrder(id){ if(!confirm('確定取消這筆訂單並退回庫存？')) return; await YX.api('/api/items/cancel-order',{method:'POST',body:{order_id:id,request_key:YX.key()}}); YX.toast('訂單已取消並退回庫存'); this.loadCustomers(); this.loadItems(); YX.loadBadge(); },
  async loadMasterText(){ const q=this.selectedCustomer?('?customer='+encodeURIComponent(this.selectedCustomer)):''; const d=await YX.api('/api/master/text'+q); const box=YX.$('#masterTextBox'); if(box) box.textContent=d.text||'目前沒有總單資料'; },
  async bulkMaterial(){
    const mat=YX.$('#bulkMaterial').value.trim(); if(!mat) return YX.toast('請輸入材質',true);
    const ids=Array.from(this.selectedIds); if(!ids.length) return YX.toast('請先選取商品',true);
    const d=await YX.api('/api/items/bulk-material',{method:'POST',body:{module:this.module,ids,material:mat,request_key:YX.key()}});
    YX.toast(`批量材質完成：${d.updated||0} 筆`); this.selectedIds.clear(); this.loadItems(); YX.loadBadge();
  },
  async bulkDelete(){
    const ids=Array.from(this.selectedIds); if(!ids.length) return YX.toast('請先選取商品',true); if(!confirm('確定批量刪除？')) return;
    const d=await YX.api('/api/items/bulk-delete',{method:'POST',body:{module:this.module,ids,request_key:YX.key()}});
    YX.toast(`批量刪除完成：${d.deleted||0} 筆`); this.selectedIds.clear(); this.loadItems(); YX.loadBadge();
  }
};
