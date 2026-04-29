import {API} from './api.js';
import {$, $$, toast, lock, empty, escapeHtml} from './ui.js';

let shipItems=[];

export async function renderShipping(root){
  root.innerHTML=`<div class="section-head"><h2>出貨</h2><button class="btn ghost" data-nav="home">返回首頁</button></div>
  <section class="card"><div class="form-grid three"><label>客戶<input id="shipCustomer" list="customerList" placeholder="打一個字顯示客戶"></label><label>客戶商品<select id="shipSelect"><option value="">請先選客戶</option></select></label><label>重量係數<input id="weightRate" type="number" step="0.01" placeholder="材積 x 重量"></label></div><datalist id="customerList"></datalist><div class="toolbar" style="margin-top:10px"><button id="loadShipItems" class="btn secondary">載入客戶商品</button><button id="addShipItem" class="btn primary">加入下方商品資料</button><button id="previewShip" class="btn secondary">確認送出 / 預覽</button><button id="confirmShip" class="btn primary">確認扣除</button></div></section>
  <section class="card"><h2>商品資料</h2><div id="shipList" class="list"></div></section>
  <section class="card"><h2>出貨預覽</h2><div id="shipPreview" class="preview-box">尚未預覽</div></section>`;
  const customers=await API.get('/api/customers');
  $('#customerList',root).innerHTML=customers.customers.map(c=>`<option value="${escapeHtml(c.name)}"></option>`).join('');
  const pre=localStorage.getItem('yx_ship_prefill');
  if(pre){ try{ const p=JSON.parse(pre); $('#shipCustomer',root).value=p.customer||''; shipItems=p.items||[]; localStorage.removeItem('yx_ship_prefill'); }catch{} }
  renderShipList(root);
  $('#loadShipItems',root).onclick=()=>loadCustomerItems(root);
  $('#shipCustomer',root).onchange=()=>loadCustomerItems(root);
  $('#addShipItem',root).onclick=()=>addSelected(root);
  $('#previewShip',root).onclick=e=>lock(e.currentTarget,()=>preview(root));
  $('#confirmShip',root).onclick=e=>lock(e.currentTarget,()=>confirmShip(root));
}

async function loadCustomerItems(root){
  const customer=$('#shipCustomer',root).value.trim();
  const data=await API.get(`/api/items/by_customer?customer=${encodeURIComponent(customer)}`);
  const sel=$('#shipSelect',root);
  sel.innerHTML=data.items.length?data.items.map((it,i)=>`<option value="${i}">${escapeHtml(sourceName(it.source_table))}｜${escapeHtml(it.product_text)}｜${it.pieces||0}件</option>`).join(''):'<option value="">沒有商品</option>';
  sel._items=data.items;
  toast('客戶商品已載入');
}
function sourceName(t){return {master_orders:'總單',orders:'訂單',inventory:'庫存'}[t]||t;}
function addSelected(root){
  const sel=$('#shipSelect',root); const item=(sel._items||[])[Number(sel.value)];
  if(!item) return toast('請先選商品');
  shipItems.unshift({...item,item_id:item.id,ship_qty:item.pieces||1});
  renderShipList(root);
}
function renderShipList(root){
  const box=$('#shipList',root); if(!box) return;
  box.innerHTML=shipItems.length?shipItems.map((it,i)=>`<article class="item-card"><div class="item-top"><div><span class="tag">${sourceName(it.source_table)}</span><div class="material">${escapeHtml(it.material||'未填材質')}</div><div class="size-line">${escapeHtml(it.product_text)}</div></div><button class="btn danger small" data-remove="${i}">刪除</button></div><label>出貨件數<input type="number" min="1" data-qty="${i}" value="${it.ship_qty||it.pieces||1}"></label></article>`).join(''):empty('尚未加入出貨商品');
  $$('[data-remove]',box).forEach(b=>b.onclick=()=>{shipItems.splice(Number(b.dataset.remove),1);renderShipList(root);});
  $$('[data-qty]',box).forEach(inp=>inp.oninput=()=>{shipItems[Number(inp.dataset.qty)].ship_qty=Number(inp.value||0);});
}
async function preview(root){
  if(!shipItems.length) return toast('請先加入商品');
  const d=await API.post('/api/shipping/preview',{items:shipItems, weight_per_cbm:Number($('#weightRate',root).value||0)});
  $('#shipPreview',root).textContent=`材積算式：\n${d.formula}\n\n材積：${d.volume}\n總長度：${d.length_total}\n總重：${d.total_weight}\n\n扣除預覽：\n`+d.items.map(x=>`${sourceName(x.source_table)}｜${x.product_text}｜出 ${x.ship_qty||x.pieces}件`).join('\n');
}
async function confirmShip(root){
  if(!shipItems.length) return toast('請先加入商品');
  const d=await API.post('/api/shipping/confirm',{customer:$('#shipCustomer',root).value.trim(), items:shipItems, weight_per_cbm:Number($('#weightRate',root).value||0), request_key:API.key()});
  $('#shipPreview',root).textContent=`已完成出貨\n材積：${d.volume}\n總重：${d.total_weight}\n\n${d.summary.join('\n')}`;
  shipItems=[]; renderShipList(root); toast('出貨完成');
}

export async function renderShippingRecords(root){
  root.innerHTML=`<div class="section-head"><h2>出貨查詢 / 出貨紀錄</h2><button class="btn ghost" data-nav="home">返回首頁</button></div><section class="card"><div class="search-row"><input id="shipRecSearch" placeholder="搜尋客戶 / 摘要"><button class="btn ghost" id="shipRecClear">清除</button></div><div id="shipRecords"></div></section>`;
  async function load(){ const q=$('#shipRecSearch',root).value||''; const d=await API.get(`/api/shipping_records?q=${encodeURIComponent(q)}`); $('#shipRecords',root).innerHTML=d.records.length?`<table class="table"><thead><tr><th>時間</th><th>客戶</th><th>材積</th><th>總重</th><th>摘要</th></tr></thead><tbody>${d.records.map(r=>`<tr><td>${escapeHtml(r.shipped_at)}</td><td>${escapeHtml(r.customer)}</td><td>${r.volume}</td><td>${r.total_weight}</td><td><pre>${escapeHtml(r.deduction_summary)}</pre></td></tr>`).join('')}</tbody></table>`:empty('尚無出貨紀錄'); }
  $('#shipRecSearch',root).oninput=load; $('#shipRecClear',root).onclick=()=>{$('#shipRecSearch',root).value='';load();}; await load();
}
