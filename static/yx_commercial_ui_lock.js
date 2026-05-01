(function(){
'use strict';
if(window.__YX_CUSTOMER_TABLE_FINAL_LOCK__) return;
window.__YX_CUSTOMER_TABLE_FINAL_LOCK__=true;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const jsq=s=>String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n');
const api=async(url,opt={})=>{const r=await fetch(url,Object.assign({headers:{'Content-Type':'application/json'},cache:'no-store'},opt)); const ct=r.headers.get('content-type')||''; const d=ct.includes('json')?await r.json():await r.text(); if(!r.ok||d.ok===false||d.success===false) throw new Error(d.error||d.message||d||'操作失敗'); return d;};
function page(){return document.querySelector('.module-screen')?.dataset.module||''}
function toast(msg){let t=$('clean-toast'); if(t){t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),1800)}else alert(msg)}
function qtyOf(it){return Number(it.qty||it.quantity||0)||0}
function parseProduct(p){p=String(p||''); let m=p.match(/([^=]+)=\s*(.+)$/); return {size:(m?m[1]:p).trim(), expr:(m?m[2]:'').trim()};}
function sourceByModule(m){return m==='inventory'?'inventory':m==='orders'?'orders':m==='master_order'?'master_orders':'master_orders'}
function endpointByModule(m){return m==='inventory'?'/api/inventory':m==='orders'?'/api/orders':'/api/master-orders'}
function titleByModule(m){return m==='inventory'?'庫存清單':m==='orders'?'訂單清單':m==='master_order'?'總單清單':'客戶商品清單'}
function termsHtml(terms){return (terms||[]).map(t=>`<span class="yx-term-label">${esc(t)}</span>`).join('')}
function customerButton(c){let terms=(c.terms||[]).length?c.terms:extractTerms(c.name); let dn=c.display_name||stripTerms(c.name); return `<button class="chip customer-chip yx-customer-chip-final" onclick="selectCustomer('${jsq(c.name)}')"><span class="yx-cust-main">${esc(dn)}</span>${termsHtml(terms)}<span class="yx-cust-count">${Number(c.qty||0)}件 / ${Number(c.count||0)}筆</span></button>`}
function extractTerms(name){let a=[]; ['FOB代付','FOB代','FOB','CNF'].forEach(t=>{if(String(name||'').includes(t))a.push(t)}); return a}
function stripTerms(name){let s=String(name||''); ['FOB代付','FOB代','FOB','CNF'].forEach(t=>s=s.replaceAll(t,'')); return s.replace(/[|｜/\-]/g,' ').replace(/\s+/g,' ').trim()||name}

function tableShellHtml(title, selectedName=''){
 return `<div class="yx-table-head"><div class="yx-table-title"><span>${esc(title)}</span><span class="yx-count" id="yx-table-count">0件 / 0筆</span>${selectedName?`<span class="yx-selected-customer-title">${esc(stripTerms(selectedName))}</span>${termsHtml(extractTerms(selectedName))}`:''}</div><div class="yx-table-tools"><button class="yx-chip-btn" id="yx-select-all">全選目前清單</button><input id="yx-table-search" placeholder="搜尋商品 / 客戶 / 材質 / A區 / B區"><button class="yx-chip-btn" data-zone="ALL">全部區</button><button class="yx-chip-btn" data-zone="A">A區</button><button class="yx-chip-btn" data-zone="B">B區</button><select id="yx-batch-material"><option value="">批量增加材質</option><option>紅木</option><option>花梨</option><option>黑檀</option><option>柚木</option><option>未填材質</option></select><button class="yx-chip-btn" id="yx-apply-material">套用材質</button><button class="yx-chip-btn yx-op-danger" id="yx-batch-delete">批量刪除</button></div></div><div class="yx-table-wrap"><table class="yx-product-table"><thead><tr><th></th><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody id="yx-table-body"><tr><td colspan="7" class="yx-empty-line">載入中…</td></tr></tbody></table></div>`;
}
function setTableTitle(title, selectedName=''){
 const titleEl=$('yx-table-title-text'); if(titleEl) titleEl.textContent=title;
 const selected=$('yx-selected-customer-title'); if(selected) selected.textContent=selectedName?stripTerms(selectedName):'';
}
function ensureMainTable(m){
 let sec=$('yx-main-table');
 if(!sec){
   // Fallback only for old templates. Normal path: templates/module.html owns this HTML.
   sec=document.createElement('section');sec.className='yx-main-table-section';sec.id='yx-main-table';sec.dataset.htmlDirectFallback='1';sec.innerHTML=tableShellHtml(titleByModule(m));
   let panel=document.querySelector('.upload-panel')||document.querySelector('.module-screen'); panel.insertAdjacentElement('afterend',sec);
 }
 sec.style.display='';
 setTableTitle(titleByModule(m));
 bindTableTools(m);
 return sec;
}
function ensureCustomerTable(m,name){
 let sec=$('yx-main-table') || ensureMainTable(m); if(!sec) return null;
 sec.style.display='';
 setTableTitle(`${stripTerms(name)} 商品清單`, name);
 bindTableTools(m);
 return sec;
}
function bindTableTools(m){
 setTimeout(()=>{
  $('yx-table-search')?.addEventListener('input',()=>renderProductTable(window.__yxRows||[],m));
  document.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{window.__yxZone=b.dataset.zone;renderProductTable(window.__yxRows||[],m)});
  if($('yx-select-all')) $('yx-select-all').onclick=()=>document.querySelectorAll('.yx-row-check').forEach(c=>c.checked=true);
  if($('yx-apply-material')) $('yx-apply-material').onclick=()=>batchMaterial(m);
  if($('yx-batch-delete')) $('yx-batch-delete').onclick=()=>batchDelete(m);
 },0);
}
async function loadProductTable(){let m=page(); if(!['inventory'].includes(m)) return; ensureMainTable(m); let d=await api(endpointByModule(m)); window.__yxRows=d.items||[]; renderProductTable(window.__yxRows,m);}
function rowActions(it,m){let src=it.source||sourceByModule(m), id=Number(it.id), q=qtyOf(it); let customer=String(it.customer||''), product=String(it.product||'');
 let h=`<button class="yx-mini-btn" onclick="YXFinalUI.edit('${src}',${id})">編輯</button><button class="yx-mini-btn danger" onclick="YXFinalUI.del('${src}',${id})">刪除</button>`;
 if(m==='inventory') h+=`<button class="yx-mini-btn primary" onclick="YXFinalUI.move('inventory','orders',${id})">加到訂單</button><button class="yx-mini-btn primary" onclick="YXFinalUI.move('inventory','master_orders',${id})">加到總單</button>`;
 if(m==='orders') h+=`<button class="yx-mini-btn primary" onclick="YXFinalUI.move('orders','master_orders',${id})">加到總單</button>`;
 if(m==='master_order'||m==='ship') h+=`<button class="yx-mini-btn primary" onclick="YXFinalUI.addToShipText('${jsq(customer)}','${jsq(product)}',${q})">加入出貨</button><button class="yx-mini-btn primary" onclick="YXFinalUI.ship('${jsq(customer)}','${jsq(product)}',${q})">直接出貨</button>`;
 return `<div class="yx-row-actions">${h}</div>`;
}
function renderProductTable(rows,m){let q=($('yx-table-search')?.value||'').toLowerCase().trim(), z=window.__yxZone||'ALL'; let filtered=(rows||[]).filter(it=>{let hay=`${it.customer||''} ${it.product||''} ${it.material||''} ${it.location||''} ${it.zone||''}`.toLowerCase(); let ok=!q||hay.includes(q); let zone=String(it.location||it.zone||it.ab_zone||''); if(z!=='ALL') ok=ok&&(zone.includes(z)||String(it.ab_zone||'').includes(z)); return ok;}); let total=filtered.reduce((a,b)=>a+qtyOf(b),0); if($('yx-table-count'))$('yx-table-count').textContent=`${total}件 / ${filtered.length}筆`; let body=$('yx-table-body'); if(!body)return; if(!filtered.length){body.innerHTML='<tr><td colspan="7" class="yx-empty-line">目前沒有資料</td></tr>';return} body.innerHTML=filtered.map(it=>{let pp=parseProduct(it.product); let q=qtyOf(it); return `<tr data-id="${it.id}" data-source="${esc(it.source||sourceByModule(m))}"><td><input type="checkbox" class="yx-row-check" value="${it.id}" data-source="${esc(it.source||sourceByModule(m))}"></td><td class="yx-material">${esc(it.material||'未填材質')}</td><td class="yx-size">${esc(pp.size)}</td><td class="yx-qty">${esc(pp.expr||q+'件')}</td><td>${q}</td><td>${esc(it.location||it.zone||'未入倉')}</td><td>${rowActions(it,m)}</td></tr>`}).join('');}
async function batchMaterial(m){let val=$('yx-batch-material')?.value||''; if(!val)return toast('請先選材質'); let ids=[...document.querySelectorAll('.yx-row-check:checked')].map(x=>({id:Number(x.value),src:x.dataset.source||sourceByModule(m)})); for(const x of ids){await api(`/api/item/${x.src}/${x.id}`,{method:'POST',body:JSON.stringify({material:val})});} toast('已套用材質'); await reloadCurrentCustomerOrTable();}
async function batchDelete(m){let ids=[...document.querySelectorAll('.yx-row-check:checked')].map(x=>({id:Number(x.value),src:x.dataset.source||sourceByModule(m)})); if(!ids.length)return toast('請先勾選'); if(!confirm('確定批量刪除？'))return; for(const x of ids){await api(`/api/item/${x.src}/${x.id}`,{method:'DELETE'});} toast('已刪除'); await reloadCurrentCustomerOrTable();}
async function reloadCurrentCustomerOrTable(){if(window.__yxSelectedCustomer && ['orders','master_order','ship'].includes(page())) return selectCustomer(window.__yxSelectedCustomer); return loadProductTable();}
window.YXFinalUI={
 edit:async(src,id)=>{let product=prompt('商品資料'); if(product===null)return; let qty=prompt('件數/數量','1'); if(qty===null)return; await api(`/api/item/${src}/${id}`,{method:'POST',body:JSON.stringify({product,qty})}); toast('已更新'); reloadCurrentCustomerOrTable();},
 del:async(src,id)=>{if(!confirm('確定刪除？'))return; await api(`/api/item/${src}/${id}`,{method:'DELETE'}); toast('已刪除'); reloadCurrentCustomerOrTable();},
 move:async(source,dest,id)=>{await api('/api/item/move',{method:'POST',body:JSON.stringify({source,dest,id})}); toast('已加入'); reloadCurrentCustomerOrTable();},
 addToShipText:(customer,product,qty)=>{let c=$('customer-name'); if(c)c.value=customer||c.value||''; let ta=$('ocr-text'); if(ta)ta.value=[ta.value.trim(), product].filter(Boolean).join('\n'); toast('已加入商品資料'); loadShipItems().catch(()=>{});},
 ship:async(customer,product,qty)=>{let d=await api('/api/submit/ship',{method:'POST',body:JSON.stringify({customer,items:[{customer,product,qty}]})}); showSubmitResult(d); toast('已出貨'); reloadCurrentCustomerOrTable();}
};

async function loadRegionsFinal(m){if(window.__YX_HTML_DIRECT_LOCK_ACTIVE__) return; if(!['orders','master_order','ship'].includes(m)) return; let d=await api('/api/regions/'+m); const map={'北區':'region-north','中區':'region-center','南區':'region-south'}; Object.keys(map).forEach(r=>{let el=$(map[r]); if(el){let arr=(d.details&&d.details[r])||[]; el.innerHTML=arr.length?arr.map(customerButton).join(''):'<span class="muted">無</span>';}})}
window.selectCustomer=async function(name){try{window.__yxSelectedCustomer=name; let c=$('customer-name'); if(c)c.value=name; let m=page(); let d=await api('/api/customer-items?module='+encodeURIComponent(m)+'&customer='+encodeURIComponent(name)); window.__yxRows=d.items||[]; if(m==='ship'){let host=$('selected-customer-items'); if(host){host.classList.add('hidden'); host.innerHTML='';} fillShipSelect(d.items||[]); renderShipSelected(); let ta=$('ocr-text'); if(ta && !ta.value.trim()) ta.placeholder='點下拉選單商品後會直接加入這裡；每筆商品自動分段，可再修改本次要出的數量 / 支數'; return;} ensureCustomerTable(m,name); renderProductTable(window.__yxRows,m); fillShipSelect(d.items||[]); }catch(e){toast(e.message)}};

function sourceName(src){return src==='master_orders'?'總單':src==='orders'?'訂單':src==='inventory'?'庫存':(src||'')}
function abOf(x){let z=String(x.location||x.zone||x.ab_zone||'').trim(); if(z.includes('A'))return 'A區'; if(z.includes('B'))return 'B區'; return z||'未入倉'}
function optionLabel(x){let pp=parseProduct(x.product); let full=`${pp.size}${pp.expr?'='+pp.expr:''}`; return `${full} ｜ ${pp.expr||qtyOf(x)+'件'} ｜ ${x.material||'未填材質'} ｜ ${abOf(x)} ｜ ${sourceName(x.source)}`}
function fillShipSelect(items){window.__shipItems=items||[]; let sel=$('ship-customer-item-select'); if(sel){ sel.innerHTML='<option value="">請選擇商品（尺寸｜支數件數｜材質｜A/B倉｜來源）</option>'+window.__shipItems.map((x,i)=>`<option value="${i}">${esc(optionLabel(x))}</option>`).join(''); sel.onchange=()=>{ if(sel.value!==''){ addShipItem(false); sel.value=''; } }; }}
async function loadShipItems(){let name=$('customer-name')?.value||window.__yxSelectedCustomer||''; let d=await api('/api/customer-items?module=ship&customer='+encodeURIComponent(name)); fillShipSelect(d.items||[]); return d.items||[];}
function lineForShipItem(x){return String(x.product||'').trim()}
window.__shipDraftItems=window.__shipDraftItems||[];
function mergeDraftItem(x){if(!x)return;let p=String(x.product||'').trim(),src=String(x.source||''),id=String(x.id||'');let found=window.__shipDraftItems.find(i=>String(i.product||'')===p&&String(i.source||'')===src&&String(i.id||'')===id);if(found){found.qty=(Number(found.qty||0)||0)+(Number(x.qty||0)||1)}else window.__shipDraftItems.push(Object.assign({},x,{qty:Number(x.qty||0)||1}))}
function renderShipSelected(){let host=$('ship-selected-items');if(!host)return;let arr=window.__shipDraftItems||[];host.innerHTML=arr.length?arr.map((x,i)=>`<div class="yx-selected-row"><b>${esc(x.product||'')}</b><span>${esc(x.material||'未填材質')}｜${esc(abOf(x))}｜${esc(sourceName(x.source))}</span><input class="text-input mini" type="number" min="1" value="${qtyOf(x)||1}" onchange="window.__shipDraftItems[${i}].qty=Number(this.value||1)"><button class="ghost-btn small-btn" onclick="window.__shipDraftItems.splice(${i},1);renderShipSelected();syncShipTextFromDraft();">刪除</button></div>`).join(''):'<div class="muted">尚未選取商品</div>'}
function syncShipTextFromDraft(){let ta=$('ocr-text');if(!ta)return;ta.value=(window.__shipDraftItems||[]).map(x=>String(x.product||'')).filter(Boolean).join('\n')}
window.clearShipSelectedItems=function(){window.__shipDraftItems=[];syncShipTextFromDraft();renderShipSelected();toast('已清空')}
function addShipItem(all){let items=window.__shipItems||[];let selected=all?items:[items[Number($('ship-customer-item-select')?.value)]].filter(Boolean);selected.forEach(mergeDraftItem);syncShipTextFromDraft();renderShipSelected();let ta=$('ocr-text');if(ta)ta.focus();toast(all?'已整批加入商品資料':'已加入商品資料')}
function calcHtml(calc){if(!calc) return ''; let rows=calc.rows||[]; return `<div class="yx-calc-box"><div class="yx-calc-title">出貨計算</div><div>總件數：<b>${calc.total_qty||0}件</b>　材積：<b>${calc.total_volume||0}</b></div>${calc.formula?`<div class="yx-calc-formula">算式：${esc(calc.formula)} = ${esc(calc.total_volume)}</div>`:''}${rows.map(r=>r.ok?`<div class="yx-calc-line">${esc(r.product)} → ${esc(r.formula)} = ${esc(r.volume)}</div>`:'').join('')}<label class="field-label">重量</label><input id="yx-weight-input" class="text-input small" type="number" step="0.01" placeholder="輸入重量，自動算總重"><div id="yx-total-weight" class="yx-calc-total"></div></div>`}
function showSubmitResult(d){let el=$('module-result'); if(el){el.style.display='block'; el.classList.remove('hidden'); el.innerHTML=`<b>${esc(d.message||'已送出')}</b><br>${(d.items||[]).map(x=>`${esc(x.customer||'庫存')}｜${esc(x.product)}｜${x.qty||x.deducted||0}件`).join('<br>')}${calcHtml(d.calc)}`; let inp=$('yx-weight-input'); if(inp) inp.oninput=()=>{let w=Number(inp.value||0), v=Number(d.calc?.total_volume||0); let out=$('yx-total-weight'); if(out) out.textContent=w?`總重：${(w*v).toFixed(2)}`:'';};}}
function showShipPreview(d, payload){let el=$('ship-preview-panel')||$('module-result'); if(!el)return; el.style.display='block'; el.classList.remove('hidden'); let items=d.items||[]; el.innerHTML=`<div class="yx-calc-title">出貨預覽</div><div class="yx-preview-list">${items.map(x=>`<div class="yx-preview-row"><b>${esc(x.customer||payload.customer||'')}</b>｜${esc(x.product)}｜${esc(x.qty||0)}件<br><span class="muted">來源：${(x.sources||[]).map(s=>sourceName(s.source)+' '+(s.qty||0)+'件').join('、')||'未找到可扣來源'}</span></div>`).join('')}</div>${calcHtml(d.calc)}<div class="btn-row"><button class="primary-btn" id="yx-confirm-deduct">確認扣除</button><button class="ghost-btn" id="yx-cancel-preview">取消</button></div>`; let inp=$('yx-weight-input'); if(inp) inp.oninput=()=>{let w=Number(inp.value||0), v=Number(d.calc?.total_volume||0); let out=$('yx-total-weight'); if(out) out.textContent=w?`總重：${(w*v).toFixed(2)}`:'';}; let ok=$('yx-confirm-deduct'); if(ok) ok.onclick=async()=>{ok.disabled=true; let res=await api('/api/submit/ship',{method:'POST',body:JSON.stringify(payload)}); showSubmitResult(res); toast('出貨完成'); loadRegionsFinal('ship'); if(payload.customer) selectCustomer(payload.customer);}; let cancel=$('yx-cancel-preview'); if(cancel) cancel.onclick=()=>el.classList.add('hidden');}

window.confirmSubmit=async function(){try{let m=page(); let text=$('ocr-text')?.value||''; let customer=$('customer-name')?.value||window.__yxSelectedCustomer||''; let btn=$('submit-btn'); if(btn)btn.disabled=true; if(m==='ship'){let draft=(window.__shipDraftItems||[]); let payload=draft.length?{customer,items:draft}:{text,customer}; let prev=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); showShipPreview(prev, payload); toast('已產生出貨預覽'); return;} let d=await api('/api/submit/'+m,{method:'POST',body:JSON.stringify({text,customer})}); showSubmitResult(d); toast(d.message||'已送出'); if(m==='inventory') loadProductTable(); if(['orders','master_order'].includes(m)){loadRegionsFinal(m); if(customer) selectCustomer(customer);} }catch(e){toast(e.message)}finally{let btn=$('submit-btn'); if(btn)btn.disabled=false}}

function cellLabel(items){let names=[...new Set((items||[]).map(i=>i.customer||i.customer_name||'庫存').filter(Boolean))].slice(0,3).join('/'); let nums=(items||[]).map(i=>qtyOf(i)).filter(n=>n>0); return {names, expr:nums.slice(0,4).join('+'), total:nums.reduce((a,b)=>a+b,0)};}
async function renderWarehouseFinal(){if(page()!=='warehouse')return; let host=document.querySelector('.warehouse-zone-wrap')||$('warehouse-section'); if(!host)return; let d=await api('/api/warehouse'); let cells=d.cells||[]; let html='<div class="yx-warehouse-note">A/B 倉各 6 區；每區前排/後排 1–10 格。格內只顯示客戶、件數式、總件數。</div><div class="yx-warehouse-final">'; ['A','B'].forEach(z=>{html+=`<div class="yx-zone-final"><div class="yx-zone-final-title"><span>${z} 倉</span><span>未入倉：${d.unplaced_qty||0}件</span></div>`; for(let band=1;band<=6;band++){html+=`<div class="yx-band"><div class="yx-band-label">${band}</div><div class="yx-band-rows">`; ['front','back'].forEach(row=>{html+=`<div class="yx-row-line"><div class="yx-row-label">${row==='front'?'前排':'後排'}</div>`; for(let s=1;s<=10;s++){let c=cells.find(x=>String(x.zone)===z&&Number(x.band||x.column_index)===band&&String(x.row_name||'front')===row&&Number(x.slot||x.slot_number)===s)||{zone:z,band,row_name:row,slot:s,items:[]}; let lab=cellLabel(c.items||[]); html+=`<div class="yx-cell ${lab.total?'used':''}" data-cell="${c.id||''}" data-zone="${z}" data-band="${band}" data-row="${row}" data-slot="${s}"><div class="yx-cell-top"><span class="yx-cell-no">${s}</span><span class="yx-cell-name">${esc(lab.names)}</span></div><div class="yx-cell-bottom"><span class="yx-cell-expr">${esc(lab.expr)}</span><span class="yx-cell-total">${lab.total?lab.total+'件':''}</span></div></div>`} html+='</div>';}); html+='</div></div>';} html+='</div>';}); html+='</div>'; host.innerHTML=html; host.querySelectorAll('.yx-cell').forEach(el=>el.onclick=async()=>{let product=prompt('加入此格商品資料'); if(!product)return; let customer=prompt('客戶名稱（可空白=庫存）')||''; await api('/api/warehouse/add-item',{method:'POST',body:JSON.stringify({cell_id:el.dataset.cell,zone:el.dataset.zone,band:el.dataset.band,row_name:el.dataset.row,slot:el.dataset.slot,product,customer,qty:1})}); toast('已加入格位'); renderWarehouseFinal();});}
window.renderWarehouseFinal=renderWarehouseFinal;

function boot(){let m=page(); document.documentElement.dataset.yxCustomerTableFinal='locked'; if(['orders','master_order','ship'].includes(m)){loadRegionsFinal(m).catch(e=>toast(e.message)); let old=$('orders-list-section'); if(old)old.style.display='none'; old=$('master-list-section'); if(old)old.style.display='none'; if(m==='ship'){let host=$('selected-customer-items'); if(host){host.classList.add('hidden');host.innerHTML='';}}} if(m==='inventory') loadProductTable().catch(e=>toast(e.message)); if(m==='warehouse') renderWarehouseFinal().catch(e=>toast(e.message)); let r=$('ship-refresh-customer-items'); if(r)r.onclick=loadShipItems; let a=$('ship-add-selected-item'); if(a)a.onclick=()=>addShipItem(false); let aa=$('ship-add-all-items'); if(aa)aa.onclick=()=>addShipItem(true); let cn=$('customer-name'); if(cn){cn.addEventListener('change',()=>{window.__yxSelectedCustomer=cn.value; loadShipItems().catch(()=>{}); if(['orders','master_order','ship'].includes(page())&&cn.value) selectCustomer(cn.value);});}}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,350)); else setTimeout(boot,350);
})();
