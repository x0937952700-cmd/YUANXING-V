(function(){
'use strict'; if(window.__YX_CLEAN_CUSTOMERS__) return; window.__YX_CLEAN_CUSTOMERS__=true;
let customers=[];
function card(c){return `<button class="customer-chip" data-customer="${c.name}">${c.name}</button>`}
function render(){ const q=($('#customer-search')||{}).value||''; const list=customers.filter(c=>JSON.stringify(c).includes(q)); [['北區','#customers-north'],['中區','#customers-center'],['南區','#customers-south']].forEach(([r,sel])=>{ const box=$(sel); if(box) box.innerHTML=list.filter(c=>(c.region||'北區')===r).map(card).join('')||'<div class="muted">無客戶</div>'; }); }
async function load(){ try{ const d=await yxApi('/api/customers'); customers=d.items||[]; render(); }catch(e){yxErr(e);} }
window.renderCustomers=render;
window.saveCustomer=async function(){ try{ const name=$('#cust-name').value.trim(); if(!name) throw new Error('請輸入客戶名稱'); await yxApi('/api/customers',{method:'POST',body:JSON.stringify({name,phone:$('#cust-phone').value,address:$('#cust-address').value,notes:$('#cust-notes').value,region:$('#cust-region').value,common_materials:$('#cust-common-materials').innerText,common_sizes:$('#cust-common-sizes').innerText})}); yxToast('客戶已儲存'); await load(); }catch(e){yxErr(e);} };
window.openArchivedCustomersModal=async function(){ try{ const d=await yxApi('/api/customers/archived'); alert((d.items||[]).map(x=>x.name).join('\n')||'沒有封存客戶'); }catch(e){yxErr(e);} };
document.addEventListener('click',e=>{ const b=e.target.closest('[data-customer]'); if(b){ const c=customers.find(x=>x.name===b.dataset.customer); if(c){ $('#cust-name').value=c.name||''; $('#cust-phone').value=c.phone||''; $('#cust-address').value=c.address||''; $('#cust-notes').value=c.notes||''; $('#cust-region').value=c.region||'北區'; $('#cust-common-materials').innerText=c.common_materials||'尚未建立'; $('#cust-common-sizes').innerText=c.common_sizes||'尚未建立'; } } });
document.addEventListener('input',e=>{ if(e.target.id==='customer-search') render(); });
document.addEventListener('DOMContentLoaded',load); if(document.readyState!=='loading') load();
})();
