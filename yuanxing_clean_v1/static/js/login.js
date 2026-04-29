async function submit(form,url){try{const d=await YX.api(url,{method:'POST',body:YX.formData(form)});location.href=d.redirect||'/home'}catch(e){YX.toast(e.message,'error')}}
document.getElementById('loginForm')?.addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,'/api/login')});
document.getElementById('registerForm')?.addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,'/api/register')});
