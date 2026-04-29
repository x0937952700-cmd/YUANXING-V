document.addEventListener('DOMContentLoaded',()=>{
  const save=YX.$('#saveCustomer'); save.onclick=()=>YX.safe(save,saveCustomer);
  YX.attachCustomerSuggest(YX.$('#customerName'));
  const cn=YX.$('#customerName'); if(cn) cn.addEventListener('change',()=>loadCustomerProfile(cn.value.trim()));
  loadCustomers();
});
let customerCache=[];
async function loadCustomerProfile(name){
  if(!name) return;
  try{
    const d=await YX.api('/api/customers/'+encodeURIComponent(name)+'/profile');
    const c=d.customer||{};
    if(YX.$('#customerName')) YX.$('#customerName').value=c.name||name;
    if(YX.$('#customerRegion')) YX.$('#customerRegion').value=c.region||'north';
    if(YX.$('#commonMaterial')) YX.$('#commonMaterial').value=c.common_material||c.profile_common_material||'';
    if(YX.$('#commonSize')) YX.$('#commonSize').value=c.common_size||c.profile_common_size||'';
  }catch(e){}
}
async function saveCustomer(){
  const body={name:YX.$('#customerName').value.trim(),region:YX.$('#customerRegion').value,common_material:YX.$('#commonMaterial').value,common_size:YX.$('#commonSize').value,request_key:YX.key()};
  await YX.api('/api/customers',{method:'POST',body}); YX.toast('客戶已儲存'); YX.$('#customerName').value=''; loadCustomers();
}
async function loadCustomers(){
  const d=await YX.api('/api/customers'); customerCache=d.customers||[]; const archived=await YX.api('/api/customers?archived=1').catch(()=>({customers:[]})); const names={north:'北區',center:'中區',south:'南區'}; const box=YX.$('#customerRegions');
  box.innerHTML=['north','center','south'].map(r=>`<div class="region" data-region="${r}"><h3>${names[r]}</h3><div class="chip-list customer-card-list">${d.customers.filter(c=>c.region===r).map(c=>{const tag=(c.note||c.common_size||'').match(/FOB代|FOB|CNF/i)?.[0]||''; const count=`${Number(c.total_pieces||0)}件/${Number(c.total_records||0)}筆`; return `<button class="customer-chip customer-card-3" data-name="${YX.esc(c.name)}" data-region="${r}"><span class="cust-left">${YX.esc(c.name)}</span><span class="cust-mid">${YX.esc(tag)}</span><span class="cust-right">${YX.esc(count)}</span></button>`;}).join('') || '<span class="hint">尚無客戶</span>'}</div></div>`).join('') + `<div class="region archived-region"><h3>封存客戶</h3><div class="chip-list customer-card-list">${(archived.customers||[]).map(c=>`<button class="customer-chip archived-chip customer-card-3" data-name="${YX.esc(c.name)}"><span class="cust-left">${YX.esc(c.name)}</span><span class="cust-mid">封存</span><span class="cust-right">還原</span></button>`).join('') || '<span class="hint">尚無封存</span>'}</div></div>`;
  YX.$$('.customer-chip:not(.archived-chip)').forEach(ch=>{let timer=null,moved=false,sx=0,sy=0,dragging=false; ch.onclick=()=>{ if(!moved && !dragging){YX.$('#customerName').value=ch.dataset.name; loadCustomerProfile(ch.dataset.name);} moved=false; dragging=false;}; ch.oncontextmenu=e=>{e.preventDefault(); menu(ch.dataset.name);}; ch.onpointerdown=e=>{moved=false; dragging=false; sx=e.clientX; sy=e.clientY; timer=setTimeout(()=>{ if(!dragging) menu(ch.dataset.name); },700); try{ch.setPointerCapture(e.pointerId);}catch(_){} }; ch.onpointermove=e=>{ if(Math.abs(e.clientX-sx)>12 || Math.abs(e.clientY-sy)>12){moved=true; dragging=true; clearTimeout(timer); ch.classList.add('dragging');} }; ch.onpointerup=async e=>{clearTimeout(timer); ch.classList.remove('dragging'); if(dragging){ const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.region:not(.archived-region)'); if(target && target.dataset.region){ await YX.api('/api/customers/'+encodeURIComponent(ch.dataset.name),{method:'PATCH',body:{region:target.dataset.region,request_key:YX.key()}}); await saveRegionOrder(target.dataset.region, ch.dataset.name); loadCustomers(); } } }; ch.onpointercancel=()=>{clearTimeout(timer); ch.classList.remove('dragging');};});
  YX.$$('.archived-chip').forEach(ch=>ch.onclick=async()=>{ if(confirm('還原封存客戶？')){ await YX.api('/api/customers/'+encodeURIComponent(ch.dataset.name)+'/restore',{method:'POST',body:{request_key:YX.key()}}); YX.toast('已還原'); loadCustomers(); } });
  // Pointer drag is used instead of legacy HTML5 drag/drop to avoid old drop handlers eating events.
}
async function saveRegionOrder(region, movedName=''){
  const names=YX.$$(`.region[data-region="${region}"] .customer-chip`).map(x=>x.dataset.name).filter(Boolean).filter(n=>n!==movedName);
  if(movedName) names.push(movedName);
  if(!names.length) return;
  try{ await YX.api('/api/customers/reorder',{method:'POST',body:{region,names,request_key:YX.key()}}); }catch(e){}
}
async function menu(name){
  const act=prompt(`${name}\n1 編輯名稱\n2 移到北區\n3 移到中區\n4 移到南區\n5 封存客戶\n6 刪除客戶資料（商品保留）`);
  if(act==='1'){ const nn=prompt('新客戶名稱',name); if(nn) await YX.api('/api/customers/'+encodeURIComponent(name),{method:'PATCH',body:{name:nn,request_key:YX.key()}}); }
  if(['2','3','4'].includes(act)){ const region={2:'north',3:'center',4:'south'}[act]; await YX.api('/api/customers/'+encodeURIComponent(name),{method:'PATCH',body:{region,request_key:YX.key()}}); }
  if(act==='5'){ await YX.api('/api/customers/'+encodeURIComponent(name),{method:'DELETE',body:{request_key:YX.key()}}); }
  if(act==='6' && confirm('只刪除客戶名片資料，商品與出貨紀錄保留，確定？')){ await YX.api('/api/customers-hard-delete/'+encodeURIComponent(name),{method:'DELETE',body:{request_key:YX.key()}}); }
  loadCustomers();
}
