document.addEventListener('DOMContentLoaded',()=>{
  const save=YX.$('#saveCustomer'); save.onclick=()=>YX.safe(save,saveCustomer);
  loadCustomers();
});
async function saveCustomer(){
  const body={name:YX.$('#customerName').value.trim(),region:YX.$('#customerRegion').value,common_material:YX.$('#commonMaterial').value,common_size:YX.$('#commonSize').value,request_key:YX.key()};
  await YX.api('/api/customers',{method:'POST',body}); YX.toast('客戶已儲存'); loadCustomers();
}
async function loadCustomers(){
  const d=await YX.api('/api/customers'); const names={north:'北區',center:'中區',south:'南區'}; const box=YX.$('#customerRegions');
  box.innerHTML=['north','center','south'].map(r=>`<div class="region" data-region="${r}"><h3>${names[r]}</h3><div class="chip-list">${d.customers.filter(c=>c.region===r).map(c=>`<button class="customer-chip" draggable="true" data-name="${YX.esc(c.name)}" data-region="${r}">${YX.esc(c.name)}</button>`).join('') || '<span class="hint">尚無客戶</span>'}</div></div>`).join('');
  YX.$$('.customer-chip').forEach(ch=>{let timer=null,moved=false; ch.onclick=()=>{ if(!moved){YX.$('#customerName').value=ch.dataset.name;} moved=false;}; ch.oncontextmenu=e=>{e.preventDefault(); menu(ch.dataset.name);}; ch.onpointerdown=()=>{moved=false; timer=setTimeout(()=>menu(ch.dataset.name),700);}; ch.onpointermove=()=>{moved=true; clearTimeout(timer);}; ch.onpointerup=()=>clearTimeout(timer); ch.ondragstart=e=>e.dataTransfer.setData('name',ch.dataset.name);});
  YX.$$('.region').forEach(r=>{r.ondragover=e=>e.preventDefault(); r.ondrop=async e=>{e.preventDefault(); const name=e.dataTransfer.getData('name'); await YX.api('/api/customers/'+encodeURIComponent(name),{method:'PATCH',body:{region:r.dataset.region,request_key:YX.key()}}); loadCustomers();};});
}
async function menu(name){
  const act=prompt(`${name}\n1 編輯名稱\n2 移到北區\n3 移到中區\n4 移到南區\n5 封存客戶`);
  if(act==='1'){ const nn=prompt('新客戶名稱',name); if(nn) await YX.api('/api/customers/'+encodeURIComponent(name),{method:'PATCH',body:{name:nn,request_key:YX.key()}}); }
  if(['2','3','4'].includes(act)){ const region={2:'north',3:'center',4:'south'}[act]; await YX.api('/api/customers/'+encodeURIComponent(name),{method:'PATCH',body:{region,request_key:YX.key()}}); }
  if(act==='5'){ await YX.api('/api/customers/'+encodeURIComponent(name),{method:'DELETE',body:{request_key:YX.key()}}); }
  loadCustomers();
}
