(function(){
  'use strict';
  if(window.__YX_PACK16_FINAL__) return; window.__YX_PACK16_FINAL__=true;
  document.documentElement.dataset.yxPack16Final='locked';
  const $=id=>document.getElementById(id);
  const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const clean=s=>String(s??'').trim();
  const page=()=>document.querySelector('.module-screen')?.dataset?.module||'';
  const MATERIALS=['TD','MER','DF','SP','SPF','HF','尤加利','LVL'];
  async function api(url,opt={}){const r=await fetch(url,Object.assign({headers:{'Content-Type':'application/json'},cache:'no-store'},opt));const ct=r.headers.get('content-type')||'';const d=ct.includes('json')?await r.json():await r.text();if(!r.ok||d.ok===false||d.success===false)throw new Error(d.error||d.message||d||'操作失敗');return d;}
  function toast(msg,type){ if(window.toast) return window.toast(msg,type); const t=$('clean-toast'); if(t){t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2200);} else alert(msg); }
  function qtyOf(it){return Number(it?.qty ?? it?.quantity ?? it?.count ?? 0)||0}
  function productOf(it){return clean(it?.product_text||it?.product||it?.item||it?.text)}
  function materialOf(it){return clean(it?.material||'未填材質')}
  function customerOf(it){return clean(it?.customer_name||it?.customer||it?.name||'')}
  function sourceLabel(s){s=clean(s); if(/master/.test(s))return '總單'; if(/order/.test(s))return '訂單'; if(/inventory/.test(s))return '庫存'; return s||'自動';}

  function patchMaterialOptions(){
    $$('select').forEach(sel=>{
      const first=clean(sel.options?.[0]?.textContent||'');
      const txt=Array.from(sel.options||[]).map(o=>o.textContent).join('|');
      if(sel.id==='yx-batch-material'||sel.id==='batch-material'||/批量增加材質|紅木|花梨|黑檀|柚木|未填材質|TD|MER|SPF/.test(txt+first)){
        const current=sel.value;
        sel.innerHTML='<option value="">批量增加材質</option>'+MATERIALS.map(x=>`<option value="${x}">${x}</option>`).join('');
        if(MATERIALS.includes(current)) sel.value=current;
      }
    });
  }

  function hideDuplicateInventory(){
    ['inventory-inline-panel','inventory-summary-section'].forEach(id=>{const el=$(id); if(el) el.remove();});
    $$('.inventory-inline-panel').forEach(el=>el.remove());
  }

  function cleanTables(){
    // rows are selectable anywhere
    $$('.yx-product-table tbody tr').forEach(tr=>{
      if(tr.dataset.yx16RowBound) return; tr.dataset.yx16RowBound='1';
      tr.addEventListener('click',ev=>{
        if(ev.target.closest('button,a,select,input[type="text"],textarea')) return;
        const cb=tr.querySelector('input[type="checkbox"].yx-row-check, input[type="checkbox"]');
        if(cb){ cb.checked=!cb.checked; tr.classList.toggle('yx16-selected-row', cb.checked); }
      });
    });
    // remove operation title text visually, CSS hides column
    $$('.yx-product-table th:last-child').forEach(th=>{ if(/操作/.test(th.textContent||'')) th.dataset.yx16Hidden='1'; });
  }

  async function getCustomers(){
    if(window.__YX16_CUSTOMERS_CACHE__?.length) return window.__YX16_CUSTOMERS_CACHE__;
    let d=await api('/api/customers');
    const rows=d.items||d.customers||[];
    window.__YX16_CUSTOMERS_CACHE__=rows.map(x=>typeof x==='string'?x:(x.customer_name||x.name||x.customer||'')).filter(Boolean);
    return window.__YX16_CUSTOMERS_CACHE__;
  }
  async function installCustomerAutocomplete(){
    const inputs=$$('#customer-name,#cust-name,input[name="customer"],input[name="customer_name"],input[placeholder*="客戶"],input[aria-label*="客戶"]');
    if(!inputs.length) return;
    let list=$('yx16-customer-datalist'); if(!list){list=document.createElement('datalist');list.id='yx16-customer-datalist';document.body.appendChild(list);}
    try{const names=await getCustomers(); list.innerHTML=names.map(n=>`<option value="${esc(n)}"></option>`).join('');}catch(e){}
    inputs.forEach(inp=>{ if(inp.dataset.yx16Auto) return; inp.dataset.yx16Auto='1'; inp.setAttribute('list','yx16-customer-datalist'); inp.setAttribute('autocomplete','off'); inp.addEventListener('input',async()=>{ if(clean(inp.value).length>=1){ try{const names=await getCustomers(); list.innerHTML=names.filter(n=>n.includes(inp.value)||n[0]===inp.value[0]).slice(0,80).map(n=>`<option value="${esc(n)}"></option>`).join('');}catch(e){} } }); });
  }

  function customerCardText(el){return clean(el.textContent).replace(/\s+/g,' ')}
  function filterEmptyOrderCustomers(){
    const m=page();
    if(m!=='orders') return;
    $$('.customer-card,.customer-chip,.region-customer,.client-card,.yx15-customer-one-line').forEach(el=>{
      const tx=customerCardText(el);
      if(/0\s*件\s*\/\s*0\s*筆/.test(tx)||/0件\s*\/\s*0筆/.test(tx)) el.remove();
    });
  }
  function patchCustomerCards(){
    $$('.customer-card,.customer-chip,.region-customer,.client-card,.yx15-customer-one-line').forEach(el=>{
      el.classList.add('yx15-customer-one-line');
      if(el.dataset.yx16CustomerBound) return; el.dataset.yx16CustomerBound='1';
      el.addEventListener('click',()=>{
        setTimeout(()=>{
          const target=$('selected-customer-items')||$('yx-main-table')||document.querySelector('.yx-customer-table-panel');
          if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
        },160);
      },true);
    });
    filterEmptyOrderCustomers();
  }

  function patchShipDropdown(){
    const sel=$('ship-customer-item-select'); const txt=$('ocr-text');
    if(!sel||!txt) return;
    $('ship-add-selected-item')?.remove(); $('ship-add-all-items')?.remove(); $$('.ship-picker-actions').forEach(el=>el.remove());
    if(!sel.dataset.yx16Bound){
      sel.dataset.yx16Bound='1';
      sel.addEventListener('change',()=>{
        const opt=sel.selectedOptions&&sel.selectedOptions[0]; if(!opt||!sel.value) return;
        const data=opt.dataset||{};
        const label=clean(opt.textContent).replace(/^[｜|\s]+/,'');
        const product=clean(data.product || label.split('｜')[0] || label);
        const mat=clean(data.material||'');
        const line = mat && product && !product.includes(mat) ? `${mat} ${product}` : product;
        txt.value = clean(txt.value) ? `${txt.value.trim()}\n\n${line}` : line;
        txt.dispatchEvent(new Event('input',{bubbles:true}));
        sel.value='';
      });
    }
  }

  function calcHtml(calc){
    if(!calc) return {rows:'',totalVolume:0,totalQty:0};
    const lines=calc.lines||calc.items||[];
    const totalVolume=Number(calc.total_volume||calc.volume||calc.total||0)||0;
    const totalQty=Number(calc.total_qty||calc.qty||0)||lines.reduce((a,b)=>a+qtyOf(b),0);
    const rows=lines.map((x,i)=>{
      const product=productOf(x)||x.product||x.text||'';
      const formula=clean(x.formula||x.calc||x.expression||'');
      const volume=Number(x.volume||x.result||0)||0;
      return `<tr><td>${i+1}</td><td><b>${esc(product)}</b><div class="muted">${esc(materialOf(x))}</div></td><td>${qtyOf(x)||''}件</td><td class="formula">${esc(formula||'-')}</td><td><b>${volume?volume.toFixed(2):'-'}</b></td></tr>`;
    }).join('');
    return {rows,totalVolume,totalQty};
  }
  function renderShipPreview(d,payload){
    const el=$('ship-preview-panel')||$('module-result'); if(!el) return;
    el.style.display='block'; el.classList.remove('hidden'); el.classList.add('yx16-ship-preview');
    const items=d.items||d.preview_items||payload.items||[];
    const c=calcHtml(d.calc||d.calculation||{});
    const itemRows=items.map((x,i)=>{
      const src=(x.sources||[]).map(s=>`${sourceLabel(s.source||s.source_table)} ${s.qty||0}件`).join('、') || sourceLabel(x.source||x.source_table);
      const beforeAfter=(x.sources||[]).map(s=>`${s.before??''} → ${s.after??''}`).filter(Boolean).join('<br>') || (x.before!=null?`${x.before} → ${x.after}`:'待確認');
      return `<tr><td>${i+1}</td><td><b>${esc(customerOf(x)||payload.customer||'')}</b></td><td>${esc(materialOf(x))}</td><td><b>${esc(productOf(x))}</b></td><td>${qtyOf(x)}件</td><td>${esc(src)}</td><td>${beforeAfter}</td><td>${x.insufficient?'<span class="danger">不足</span>':'可出貨'}</td></tr>`;
    }).join('');
    const totalQty=items.reduce((a,b)=>a+qtyOf(b),0)||c.totalQty;
    el.innerHTML=`
      <div class="yx16-preview-title"><span>出貨預覽</span><button class="ghost-btn small-btn" id="yx16-cancel-preview" type="button">取消</button></div>
      <div class="yx16-preview-summary">
        <div class="yx16-stat"><span>本次出貨</span><b>${totalQty}</b><span>件</span></div>
        <div class="yx16-stat"><span>商品筆數</span><b>${items.length}</b><span>筆</span></div>
        <div class="yx16-stat"><span>材積合計</span><b>${c.totalVolume.toFixed(2)}</b><span>才</span></div>
        <div class="yx16-stat"><span>扣除流程</span><b>預覽</b><span>確認後才扣</span></div>
      </div>
      <table class="yx16-preview-table"><thead><tr><th>#</th><th>客戶</th><th>材質</th><th>尺寸 / 支數</th><th>件數</th><th>扣除來源</th><th>扣前 → 扣後</th><th>狀態</th></tr></thead><tbody>${itemRows||'<tr><td colspan="8">沒有預覽商品</td></tr>'}</tbody></table>
      <div class="yx16-preview-title" style="font-size:16px;margin-top:18px"><span>材積計算</span></div>
      <table class="yx16-preview-table"><thead><tr><th>#</th><th>商品</th><th>件數</th><th>算式</th><th>材積</th></tr></thead><tbody>${c.rows||'<tr><td colspan="5">尚無材積算式</td></tr>'}</tbody></table>
      <div class="yx16-weight-box"><label>重量<input id="yx-weight-input" class="text-input" type="number" inputmode="decimal" placeholder="輸入重量，自動算總重"></label><div id="yx-total-weight" class="yx16-weight-result">總重：--</div></div>
      <div class="btn-row" style="margin-top:14px"><button class="primary-btn" id="yx-confirm-deduct" type="button">確認扣除</button><button class="ghost-btn" id="yx-cancel-preview-2" type="button">取消</button></div>`;
    const weight=$('yx-weight-input'); if(weight) weight.oninput=()=>{const w=Number(weight.value||0);$('yx-total-weight').textContent=w?`總重：${(w*c.totalVolume).toFixed(2)}`:'總重：--';};
    const close=()=>el.classList.add('hidden'); $('yx16-cancel-preview').onclick=close; $('yx-cancel-preview-2').onclick=close;
    $('yx-confirm-deduct').onclick=async()=>{const b=$('yx-confirm-deduct'); b.disabled=true; try{const res=await api('/api/submit/ship',{method:'POST',body:JSON.stringify(payload)}); toast('出貨完成'); el.innerHTML='<div class="yx16-preview-title">出貨完成</div><div class="yx16-stat"><b>已扣除</b><span>已同步更新總單 / 訂單 / 庫存</span></div>'; }catch(e){toast(e.message,'error'); b.disabled=false;}};
    setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'start'}),60);
  }
  window.confirmSubmit=async function(){
    try{
      const m=page(), text=$('ocr-text')?.value||'', customer=$('customer-name')?.value||window.__yxSelectedCustomer13||window.__yxSelectedCustomer||'';
      const btn=$('submit-btn'); if(btn) btn.disabled=true;
      if(m==='ship'){
        const payload=(window.__shipDraftItems13?.length||window.__shipDraftItems?.length)?{customer,items:window.__shipDraftItems13||window.__shipDraftItems}:{text,customer};
        const prev=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)});
        renderShipPreview(prev,payload); toast('已跳到出貨預覽'); return;
      }
      const d=await api('/api/submit/'+m,{method:'POST',body:JSON.stringify({text,customer})}); toast(d.message||'已送出');
      if(m==='inventory'&&window.loadProductTable13) window.loadProductTable13();
    }catch(e){toast(e.message||String(e),'error');}
    finally{const btn=$('submit-btn'); if(btn) btn.disabled=false;}
  };

  window.loadToday = async function(){
    try{
      const d=await api('/api/today?ts='+Date.now());
      const logs=d.logs||d.items||[]; const unplaced=d.unplaced||[];
      const badge=$('today-unread-badge'); if(badge) badge.textContent=d.unread||0;
      const buckets={inbound:[],outbound:[],orders:[],unplaced:[]};
      logs.forEach(x=>{let cat=clean(x.category||''); let action=clean(x.action||''); if(!cat){ if(/出貨|扣除/.test(action))cat='outbound'; else if(/訂單/.test(action))cat='orders'; else cat='inbound'; } if(!buckets[cat]) buckets[cat]=[]; buckets[cat].push(x); });
      buckets.unplaced=unplaced;
      const ids={inbound:'today-inbound-list',outbound:'today-outbound-list',orders:'today-order-list',unplaced:'today-unplaced-list'};
      Object.entries(ids).forEach(([cat,id])=>{const host=$(id); if(!host) return; const arr=buckets[cat]||[]; host.innerHTML=arr.length?arr.map(x=>`<div class="today-item-card"><span class="cat">${cat==='unplaced'?'未入倉':cat==='outbound'?'出貨':cat==='orders'?'訂單':'進貨'}</span><div><div class="main">${esc(customerOf(x)||x.customer||'庫存')}｜${esc(productOf(x)||x.product||x.action||'')}</div><div class="meta">${esc(x.operator||x.username||'')} ${esc(x.created_at||x.time||'')}</div></div><div class="qty">${qtyOf(x)||''}${qtyOf(x)?'件':''}</div></div>`).join(''):'<span class="muted">無</span>';});
      const s=$('today-summary-cards'); if(s) s.innerHTML=`<div class="today-item-card"><span class="cat">總覽</span><div><div class="main">今日異動 ${logs.length} 筆，未錄入倉庫圖 ${unplaced.length} 筆</div><div class="meta">刷新時間 ${new Date().toLocaleTimeString('zh-TW',{hour12:false})}</div></div><div class="qty">${d.unread||0}</div></div>`;
      try{await api('/api/today/read',{method:'POST'});}catch(e){}
    }catch(e){toast(e.message||'今日異動載入失敗','error');}
  };

  function bindTodayRefresh(){ const b=$('yx112-refresh-today'); if(b&&!b.dataset.yx16Bound){b.dataset.yx16Bound='1'; b.onclick=window.loadToday;} if(location.pathname.includes('today')) window.loadToday(); }

  function install(){ patchMaterialOptions(); hideDuplicateInventory(); cleanTables(); installCustomerAutocomplete(); patchCustomerCards(); patchShipDropdown(); bindTodayRefresh(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  new MutationObserver(()=>{ patchMaterialOptions(); hideDuplicateInventory(); cleanTables(); installCustomerAutocomplete(); patchCustomerCards(); patchShipDropdown(); }).observe(document.documentElement,{childList:true,subtree:true});
})();
