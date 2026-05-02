/* v15：批量套用材質 / 批量刪除 / 移到A/B / 批量編輯，統一保底走單次 API，並立即刷新清單 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if(!YX) return;
  const uiSource=s=>s==='master_orders'?'master_order':(s||YX.moduleKey()||'');
  const apiSource=s=>s==='master_order'?'master_orders':s;
  const toast=(m,t)=>YX.toast?YX.toast(m,t||'ok'):alert(m);
  const clean=v=>YX.clean?YX.clean(v):String(v||'').trim();
  function addApplyButtons(){
    ['inventory','orders','master_order'].forEach(source=>{
      const sel=document.getElementById(`yx113-${source}-material`);
      if(sel && !document.querySelector(`[data-yx113-batch-material="${source}"]`)){
        const b=document.createElement('button');
        b.className='ghost-btn small-btn'; b.type='button'; b.textContent='套用材質';
        b.setAttribute('data-yx113-batch-material', source);
        sel.insertAdjacentElement('afterend', b);
      }
    });
  }
  function selectedItems(source){
    source=uiSource(source);
    let rows=[...document.querySelectorAll(`.yx113-summary-row[data-source="${source}"].yx113-row-selected[data-id]`)];
    const checked=[...document.querySelectorAll(`.yx113-row-check[data-source="${source}"]:checked`)];
    if(checked.length){
      const ids=new Set(checked.map(x=>String(x.dataset.id||x.closest('[data-id]')?.dataset.id||'')));
      rows=[...document.querySelectorAll(`.yx113-summary-row[data-source="${source}"][data-id]`)].filter(r=>ids.has(String(r.dataset.id||'')));
    }
    if(!rows.length) rows=[...document.querySelectorAll(`.yx113-summary-row[data-source="${source}"][data-id]`)];
    return rows.map(r=>({source:apiSource(source), id:Number(r.dataset.id||0)})).filter(x=>x.id>0);
  }
  async function refresh(source){
    source=uiSource(source);
    if(window.YX113ProductActions?.loadSource) return window.YX113ProductActions.loadSource(source);
    if(window.__YX_V11_HARD_REFRESH__) return window.__YX_V11_HARD_REFRESH__(source);
    location.reload();
  }
  async function api(url, body){ return YX.api(url,{method:'POST',body:JSON.stringify(body||{})}); }
  async function applyMaterial(source){
    source=uiSource(source); const sel=document.getElementById(`yx113-${source}-material`); const material=clean(sel?.value||'').toUpperCase();
    if(!material) return toast('請先選擇材質','warn');
    const items=selectedItems(source); if(!items.length) return toast('沒有可套用材質的商品','warn');
    document.querySelectorAll(`.yx113-summary-row[data-source="${source}"].yx113-row-selected .mat, .yx113-summary-row[data-source="${source}"] .yx113-row-check:checked`).forEach(el=>{});
    const d=await api('/api/customer-items/batch-material',{items, material});
    if(sel) sel.value='';
    toast(`已套用材質 ${material}：${d.count||items.length} 筆`,'ok');
    await refresh(source);
  }
  async function deleteBatch(source){
    source=uiSource(source); const items=selectedItems(source); if(!items.length) return toast('沒有可刪除商品','warn');
    if(!confirm(`確定刪除 ${items.length} 筆商品？`)) return;
    const d=await api('/api/customer-items/batch-delete',{items});
    toast(`已刪除 ${d.count||items.length} 筆商品`,'ok');
    await refresh(source);
  }
  async function moveZone(source, zone){
    source=uiSource(source); zone=clean(zone).toUpperCase(); const items=selectedItems(source); if(!items.length) return toast('沒有可移動商品','warn');
    const d=await api('/api/customer-items/batch-zone',{items, zone});
    toast(`已移到 ${zone} 區：${d.count||items.length} 筆`,'ok');
    await refresh(source);
  }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); }
  function productText(size,support){ size=norm(size); support=norm(support); return size?(support?`${size}=${support}`:size):''; }
  function qtyFromProduct(text,fallback){
    const raw=norm(text); const right=raw.includes('=')?raw.split('=').slice(1).join('='):''; if(!right) return Number(fallback||1)||1;
    let total=0, hit=false; right.split('+').filter(Boolean).forEach(seg=>{ const m=seg.match(/x\s*(\d+)$/i); if(m){ total+=Number(m[1]||0); hit=true; } else if(/\d/.test(seg)){ total+=1; hit=true; } });
    return hit?total:(Number(fallback||1)||1);
  }
  async function saveBatchEdit(source){
    source=uiSource(source);
    const editRows=[...document.querySelectorAll(`#yx113-${source}-summary .yx128-edit-row[data-source="${source}"]`)];
    if(!editRows.length) return false;
    const items=[];
    for(const tr of editRows){
      const id=Number(tr.dataset.id||0); if(!id) continue;
      const val=f=>tr.querySelector(`[data-yx128-field="${f}"]`)?.value||'';
      const pt=productText(val('size'), val('support'));
      if(!pt) continue;
      items.push({source:apiSource(source), id, product_text:pt, material:clean(val('material')).toUpperCase(), product_code:clean(val('material')).toUpperCase(), qty:qtyFromProduct(pt,val('qty')), customer_name:clean(val('customer_name')), location:clean(val('zone'))});
    }
    if(!items.length) return toast('沒有可儲存的商品','warn'), true;
    const d=await api('/api/customer-items/batch-update',{items});
    toast(`已批量更新 ${d.count||items.length} 筆商品`,'ok');
    await refresh(source);
    return true;
  }
  document.addEventListener('click', async ev=>{
    addApplyButtons();
    const mat=ev.target.closest?.('[data-yx113-batch-material]');
    if(mat){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await applyMaterial(mat.dataset.yx113BatchMaterial); }catch(e){ toast(e.message||'材質套用失敗','error'); } return; }
    const del=ev.target.closest?.('[data-yx113-batch-delete]');
    if(del){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await deleteBatch(del.dataset.yx113BatchDelete); }catch(e){ toast(e.message||'批量刪除失敗','error'); } return; }
    const bz=ev.target.closest?.('[data-yx132-batch-zone]');
    if(bz){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await moveZone(bz.dataset.source||YX.moduleKey(), bz.dataset.yx132BatchZone); }catch(e){ toast(e.message||'A/B區移動失敗','error'); } return; }
    const edit=ev.target.closest?.('[data-yx128-edit-all]');
    if(edit && /儲存/.test(edit.textContent||'')){
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      try{ if(await saveBatchEdit(edit.dataset.yx128EditAll)) return; }catch(e){ toast(e.message||'批量編輯儲存失敗','error'); return; }
    }
  }, true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(addApplyButtons,100),{once:true}); else setTimeout(addApplyButtons,100);
  setTimeout(addApplyButtons,500); setTimeout(addApplyButtons,1500);
})();
