// CLEAN_EVENTS_V26: login page JS only. No inline script / onclick / onsubmit.
(function(){
  'use strict';
  if (window.__YX_LOGIN_PAGE_BOUND__) return;
  window.__YX_LOGIN_PAGE_BOUND__ = true;

  function byId(id){ return document.getElementById(id); }
  function clean(v){ return String(v || '').trim(); }
  function showError(message){
    const err = byId('login-error');
    if (err){ err.textContent = message || '登入失敗'; err.classList.remove('hidden'); }
    else { alert(message || '登入失敗'); }
  }
  function setLoading(isLoading){
    const btn = byId('login-submit-btn');
    if (!btn) return;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? '登入中…' : '登入';
  }
  async function directLogin(evt){
    if (evt){ evt.preventDefault(); evt.stopPropagation(); }
    const user = clean(byId('login-username') && byId('login-username').value);
    const pass = clean(byId('login-password') && byId('login-password').value);
    const err = byId('login-error');
    if (err){ err.classList.add('hidden'); err.textContent = ''; }
    if (!user || !pass){ showError('請輸入帳號與密碼'); return false; }
    try{
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({username:user, password:pass})
      });
      let data = {};
      try{ data = await res.json(); }catch(_){ data = {}; }
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || '登入失敗');
      if (localStorage.getItem('yxRememberLogin') !== '0') localStorage.setItem('yxLastUsername', user);
      location.href = '/';
    }catch(e){
      showError(e && e.message ? e.message : '登入失敗');
    }finally{
      setLoading(false);
    }
    return false;
  }
  function toggleLoginSave(){
    const next = localStorage.getItem('yxRememberLogin') === '0' ? '1' : '0';
    localStorage.setItem('yxRememberLogin', next);
    const lab = byId('remember-label');
    if (lab) lab.textContent = next === '1' ? '開' : '關';
  }
  document.addEventListener('DOMContentLoaded', function(){
    const last = localStorage.getItem('yxLastUsername') || '';
    const username = byId('login-username');
    if (username && !username.value) username.value = last;
    const remember = byId('remember-label');
    if (remember) remember.textContent = localStorage.getItem('yxRememberLogin') === '0' ? '關' : '開';
    const form = byId('login-form');
    if (form) form.addEventListener('submit', directLogin, true);
    const rememberBtn = byId('login-remember-toggle');
    if (rememberBtn) rememberBtn.addEventListener('click', toggleLoginSave, true);
  });
})();


// CLEAN_EVENTS_V28_EVENT_COMPLETE: 登入頁仍只用本頁 JS，保留永久登入按鈕事件。
(function(){'use strict'; if(window.__YX_V28_LOGIN_EVENT_COMPLETE__) return; window.__YX_V28_LOGIN_EVENT_COMPLETE__=true;})();
