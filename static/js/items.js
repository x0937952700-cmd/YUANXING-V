import {API} from './api.js';
import {$, $$, toast, lock, empty, itemCard, modal, escapeHtml} from './ui.js';

const KIND_TITLE = {inventory:'庫存', orders:'訂單', master:'總單'};
const KIND_URL = {inventory:'inventory', orders:'orders', master:'master'};

export async function renderItemsPage(kind, root){
  const title = KIND_TITLE[kind];
  root.innerHTML = `<div class="section-head"><h2>${title}</h2><button class="btn ghost" data-nav="home">返回首頁</button></div>
  <section class="card">
    <div class="form-grid three">
      ${kind==='inventory'?'':`<label>客戶<input id="${kind}Customer" list="customerList" placeholder="打一個字即顯示客戶"></label>`}
      <label>材質<input id="${kind}Material" placeholder="例：花旗松"></label>
      <label>商品資料<input id="${kind}Text" placeholder="例：100x30x063=504x5+588"></label>
    </div>
    <div class="toolbar" style="margin-top:10px">
      <button id="${kind}Add" class="btn primary">新增${title}</button>
      <button id="${kind}Clear" class="btn secondary">清空欄位</button>
    </div>
    <datalist id="customerList"></datalist>
  </section>
  <section class="card">
    <div class="section-head"><h2>${title}清單</h2><div class="toolbar"><button id="${kind}BatchMaterial" class="btn secondary">批量加材質</button><button id="${kind}BatchDelete" class="btn danger">批量刪除</button></div></div>
    <div class="search-row"><input id="${kind}Search" placeholder="搜尋商品 / 材質 / 客戶"><button class="btn ghost" id="${kind}SearchClear">清除</button></div>
    <div id="${kind}Region" class="region-grid ${kind==='inventory'?'hidden':''}"></div>
    <div id="${kind}List" class="list"></div>
  </section>`;
  await loadCustomers(root, kind);
  await load(kind, root);
  $(`#${kind}Add`, root).onclick = e => lock(e.currentTarget, async()=>{
    const body = {
      customer: kind==='inventory' ? '' : $(`#${kind}Customer`,root).value.trim(),
      material: $(`#${kind}Material`,root).value.trim(),
      product_text: $(`#${kind}Text`,root).value.trim(),
      request_key: API.key()
    };
    await API.post(`/api/${KIND_URL[kind]}`, body);
    toast(`已新增${title}`); await loadCustomers(root, kind); await load(kind, root);
  });
  $(`#${kind}Clear`, root).onclick = ()=>{ if($(`#${kind}Customer`,root)) $(`#${kind}Customer`,root).value=''; $(`#${kind}Material`,root).value=''; $(`#${kind}Text`,root).value=''; };
  $(`#${kind}Search`, root).oninput = ()=>load(kind, root);
  $(`#${kind}SearchClear`, root).onclick = ()=>{ $(`#${kind}Search`, root).value=''; load(kind, root); };
  $(`#${kind}BatchMaterial`, root).onclick = ()=>batchMaterial(kind, root);
  $(`#${kind}BatchDelete`, root).onclick = ()=>batchDelete(kind, root);
}

async function loadCustomers(root, kind){
  const data = await API.get('/api/customers');
  const list = $('#customerList', root);
  if(list) list.innerHTML = data.customers.map(c=>`<option value="${escapeHtml(c.name)}"></option>`).join('');
  if(kind !== 'inventory') renderRegions(kind, root, data.customers);
}

function renderRegions(kind, root, customers){
  const box = $(`#${kind}Region`, root);
  const labels = {north:'北區',middle:'中區',south:'南區'};
  box.innerHTML = ['north','middle','south'].map(r=>`<div class="region" data-region="${r}"><h3>${labels[r]}</h3>${customers.filter(c=>c.region===r).map(c=>`<span class="customer-chip" data-customer="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>`).join('')}</div>`).join('');
  $$('.customer-chip', box).forEach(ch=>{
    let timer=null, moved=false, start={x:0,y:0};
    ch.onclick=()=>{ if(moved) return; $$('.customer-chip',box).forEach(x=>x.classList.remove('active')); ch.classList.add('active'); load(kind, root, ch.dataset.customer); };
    ch.oncontextmenu=(e)=>{e.preventDefault(); customerActionSheet(ch.dataset.customer, kind, root);};
    ch.addEventListener('pointerdown', e=>{moved=false;start={x:e.clientX,y:e.clientY}; timer=setTimeout(()=>{ if(!moved) customerActionSheet(ch.dataset.customer, kind, root); },650);});
    ch.addEventListener('pointermove', e=>{ if(Math.abs(e.clientX-start.x)+Math.abs(e.clientY-start.y)>10){moved=true;clearTimeout(timer);} });
    ch.addEventListener('pointerup',()=>clearTimeout(timer));
  });
}

async function customerActionSheet(name, kind, root){
  const dlg = modal(`<h3>${escapeHtml(name)}</h3><div class="toolbar">
    <button class="btn primary" data-open>打開客戶商品</button>
    <button class="btn secondary" data-region="north">移到北區</button>
    <button class="btn secondary" data-region="middle">移到中區</button>
    <button class="btn secondary" data-region="south">移到南區</button>
    <button class="btn danger" data-archive>封存客戶</button>
    <button class="btn ghost" data-close>關閉</button>
  </div>`);
  $('[data-open]',dlg).onclick=()=>{dlg.close(); load(kind, root, name);};
  $$('[data-region]',dlg).forEach(b=>b.onclick=async()=>{ const all=await API.get('/api/customers'); const c=all.customers.find(x=>x.name===name); if(c){await API.put(`/api/customers/${c.id}`,{...c,region:b.dataset.region}); toast('已移區'); dlg.close(); renderItemsPage(kind,root);} });
  $('[data-archive]',dlg).onclick=async()=>{ const all=await API.get('/api/customers'); const c=all.customers.find(x=>x.name===name); if(c){await API.post(`/api/customers/${c.id}/archive`,{archived:true}); toast('已封存'); dlg.close(); renderItemsPage(kind,root);} };
}

async function load(kind, root, forcedCustomer=''){
  const q = $(`#${kind}Search`, root)?.value || '';
  const url = `/api/${KIND_URL[kind]}?q=${encodeURIComponent(q)}${forcedCustomer?`&customer=${encodeURIComponent(forcedCustomer)}`:''}`;
  const [data, unplaced] = await Promise.all([API.get(url), API.get('/api/warehouse/unplaced').catch(()=>({items:[]}))]);
  const unplacedSet = new Set((unplaced.items||[]).filter(x=>x.source_table===KIND_URL[kind] || (kind==='master'&&x.source_table==='master_orders')).map(x=>x.id));
  const actions = [
    {act:'select', label:'選取', cls:'ghost'},
    {act:'edit', label:'編輯'},
    ...(kind==='inventory'?[{act:'toOrders',label:'加到訂單'},{act:'toMaster',label:'加到總單'}]:[]),
    ...(kind==='orders'?[{act:'toMaster',label:'加入總單'}]:[]),
    {act:'ship', label:'直接出貨', cls:'primary'},
    {act:'delete', label:'刪除', cls:'danger'}
  ];
  const list = $(`#${kind}List`, root);
  list.innerHTML = data.items.length ? data.items.map(it=>`<label class="item-select"><input type="checkbox" data-check="${it.id}"> ${itemCard(it, actions, {source: KIND_URL[kind], unplaced: unplacedSet.has(it.id)})}</label>`).join('') : empty('目前沒有商品');
  list.onclick = async e=>{
    const btn=e.target.closest('[data-act]'); if(!btn) return;
    const id=btn.dataset.id, act=btn.dataset.act;
    const item=data.items.find(x=>String(x.id)===String(id));
    if(act==='edit') return editItem(kind, item, root);
    if(act==='delete') { if(confirm('確定刪除這筆商品？')){ await API.del(`/api/${KIND_URL[kind]}/${id}`); toast('已刪除'); load(kind, root, forcedCustomer); } }
    if(act==='toOrders') return copyTo(kind,id,'orders',root);
    if(act==='toMaster') return copyTo(kind,id,'master',root);
    if(act==='ship') return openShip(item, KIND_URL[kind]);
    if(act==='select') { $(`#${kind}Search`, root).value=item.product_text; load(kind, root, forcedCustomer); }
  };
}

async function copyTo(kind,id,target,root){
  const customer = prompt('請輸入 / 選擇客戶名稱（可留原客戶）') || '';
  await API.post(`/api/${KIND_URL[kind]}/${id}/copy_to/${target}`, {customer, deduct_source: kind==='inventory'});
  toast(`已加入${KIND_TITLE[target]}`); await renderItemsPage(kind, root);
}

function openShip(item, source){
  localStorage.setItem('yx_ship_prefill', JSON.stringify({customer:item.customer||'', items:[{...item, source_table:source, item_id:item.id, ship_qty:item.pieces||item.qty||1}]}));
  window.dispatchEvent(new CustomEvent('yx:navigate',{detail:'shipping'}));
}

async function editItem(kind, item, root){
  const dlg=modal(`<h3>編輯商品</h3><div class="form-grid"><label>客戶<input id="editCustomer" value="${escapeHtml(item.customer||'')}"></label><label>材質<input id="editMaterial" value="${escapeHtml(item.material||'')}"></label></div><label>商品資料<textarea id="editText">${escapeHtml(item.product_text||'')}</textarea></label><div class="modal-actions"><button class="btn ghost" data-close>取消</button><button class="btn primary" id="editSave">儲存</button></div>`);
  $('#editSave',dlg).onclick=async()=>{await API.put(`/api/${KIND_URL[kind]}/${item.id}`,{customer:$('#editCustomer',dlg).value,material:$('#editMaterial',dlg).value,product_text:$('#editText',dlg).value}); toast('已儲存'); dlg.close(); renderItemsPage(kind,root);};
}

async function selectedIds(kind, root){ return $$(`[data-check]:checked`, root).map(x=>Number(x.dataset.check)); }
async function batchMaterial(kind, root){ const ids=await selectedIds(kind,root); const material=prompt('要批量加入的材質？'); if(!material) return; await API.post(`/api/${KIND_URL[kind]}/batch_material`,{ids,material}); toast('已批量加材質'); renderItemsPage(kind,root); }
async function batchDelete(kind, root){ const ids=await selectedIds(kind,root); if(!ids.length) return toast('請先選取商品'); if(confirm(`確定刪除 ${ids.length} 筆？`)){ await API.post(`/api/${KIND_URL[kind]}/batch_delete`,{ids}); toast('已批量刪除'); renderItemsPage(kind,root); } }

export function renderInbound(root){
  root.innerHTML=`<div class="section-head"><h2>入庫 / OCR貼文字整理</h2><button class="btn ghost" data-nav="home">返回首頁</button></div>
  <section class="card"><div class="toolbar"><label class="btn secondary">原生相簿辨識 / 上傳檔案<input id="ocrFile" type="file" accept="image/*" hidden></label><label class="btn primary">原生相機辨識 / 拍照<input id="ocrCamera" type="file" accept="image/*" capture="environment" hidden></label><span class="tag">信心值：手動貼文字模式</span></div><p class="subtle">PWA版先提供拍照/上傳入口與文字整理；低信心也會留在文字框讓你手動修正。</p><textarea id="rawText" placeholder="貼上 OCR 或白板文字；紅字可手動刪除，___會承接上一筆寬高"></textarea><div class="toolbar" style="margin-top:10px"><button id="parseBtn" class="btn secondary">整理文字</button><button id="inboundInventory" class="btn ghost">送到庫存</button><button id="inboundMaster" class="btn primary">送到總單</button></div></section><section class="card"><label>客戶名稱（空白=庫存）<input id="inboundCustomer" list="customerList" placeholder="打一個字顯示客戶"></label><label>材質<input id="inboundMaterial"></label><div id="parsedPreview" class="preview-box"></div><datalist id="customerList"></datalist></section>`;
  loadCustomers(root,'master');
  $('#ocrFile',root).onchange=$('#ocrCamera',root).onchange=()=>toast('圖片已選取；請用手機內建辨識文字後貼到文字框，或直接手動輸入');
  $('#parseBtn',root).onclick=async()=>{ const d=await API.post('/api/parse_text',{text:$('#rawText',root).value}); $('#rawText',root).value=d.text; $('#parsedPreview',root).textContent=d.text; };
  $('#inboundInventory',root).onclick=()=>submitInbound(root,'inventory');
  $('#inboundMaster',root).onclick=()=>submitInbound(root,'master');
}
async function submitInbound(root,kind){
  const lines=$('#rawText',root).value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!lines.length) return toast('請先輸入文字');
  for(const line of lines){ await API.post(`/api/${kind}`,{customer:kind==='inventory'?'':$('#inboundCustomer',root).value.trim(), material:$('#inboundMaterial',root).value.trim(), product_text:line, request_key:API.key()}); }
  toast(`已送出 ${lines.length} 筆`);
}
