const YX={
  page:document.body.dataset.page,
  reqKey(){return `${Date.now()}-${Math.random().toString(16).slice(2)}`},
  async api(url,{method='GET',body=null,timeout=9000}={}){
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeout);
    try{
      const opt={method,headers:{},signal:ctrl.signal};
      if(body){opt.headers['Content-Type']='application/json'; if(typeof body==='object'&&!body.request_key) body.request_key=YX.reqKey(); opt.body=JSON.stringify(body)}
      const res=await fetch(url,opt); const ct=res.headers.get('content-type')||'';
      const data=ct.includes('application/json')?await res.json():{ok:false,message:await res.text()};
      if(res.status===401||data.code==='AUTH_EXPIRED'){YX.toast('登入已過期，請重新登入','error'); setTimeout(()=>location.href='/login',700); throw new Error('auth');}
      if(!res.ok||data.ok===false) throw new Error(data.message||'操作失敗');
      return data;
    }catch(e){ if(e.name==='AbortError') throw new Error('連線逾時，請稍後再試'); throw e; }
    finally{clearTimeout(timer)}
  },
  toast(msg,type='ok'){
    const root=document.getElementById('toastRoot'); if(!root) return alert(msg);
    const el=document.createElement('div'); el.className=`toast ${type==='error'?'error':''}`; el.textContent=msg; root.appendChild(el);
    setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),250)},2600);
  },
  async loadBadge(){try{const d=await YX.api('/api/activity');const b=document.getElementById('activityBadge');if(b){b.textContent=d.unread||0;b.classList.toggle('hidden',!d.unread)}}catch{}},
  async loadCustomers(q='') {const d=await YX.api('/api/customers?q='+encodeURIComponent(q));return d.customers||[]},
  fillDatalist(list, rows){if(!list)return; list.innerHTML=(rows||[]).map(c=>`<option value="${YX.esc(c.name)}"></option>`).join('')},
  esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))},
  formData(form){return Object.fromEntries(new FormData(form).entries())},
  disable(btn,on=true){if(btn){btn.disabled=on;btn.style.opacity=on?.62:1}},
  bindAutocomplete(input,list){if(!input)return; let t; input.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(async()=>{try{YX.fillDatalist(list,await YX.loadCustomers(input.value))}catch{}},160)})}
};
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('logoutBtn')?.addEventListener('click',async()=>{try{const d=await YX.api('/api/logout',{method:'POST'});location.href=d.redirect||'/login'}catch(e){YX.toast(e.message,'error')}}); if(YX.page!=='login') YX.loadBadge();});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/static/service-worker.js').catch(()=>{}));}
