/* 沅興木業 FULL MASTER V50 LOGIN WRITEBACK - 實際載入登入頁母版 */
/* 沅興木業 FULL MASTER V4 PER PAGE - page_login_master_v50
   來源：原 login.html inline script 已搬入登入頁唯一母版 JS。 */
(function(){
  'use strict';
  if (window.__YX_LOGIN_MASTER_V50__) return;
  window.__YX_LOGIN_MASTER_V50__ = true;

  function $(id){ return document.getElementById(id); }
  function clean(v){ return String(v || '').trim(); }

  async function directLogin(evt){
    if(evt){ evt.preventDefault(); evt.stopPropagation(); }
    const user = clean($('login-username') && $('login-username').value);
    const pass = clean($('login-password') && $('login-password').value);
    const err = $('login-error');
    const btn = $('login-submit-btn');
    if(err){ err.classList.add('hidden'); err.textContent = ''; }
    if(!user || !pass){
      if(err){ err.textContent = '請輸入帳號與密碼'; err.classList.remove('hidden'); }
      return false;
    }
    try{
      if(btn){ btn.disabled = true; btn.textContent = '登入中…'; }
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({username:user, password:pass})
      });
      let data = {};
      try{ data = await res.json(); }catch(_){ data = {}; }
      if(!res.ok || data.success === false) throw new Error(data.error || data.message || '登入失敗');
      if(localStorage.getItem('yxRememberLogin') !== '0') localStorage.setItem('yxLastUsername', user);
      location.href = '/';
    }catch(e){
      if(err){ err.textContent = e.message || '登入失敗'; err.classList.remove('hidden'); }
      else alert(e.message || '登入失敗');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '登入'; }
    }
    return false;
  }

  function toggleLoginSave(){
    const next = localStorage.getItem('yxRememberLogin') === '0' ? '1' : '0';
    localStorage.setItem('yxRememberLogin', next);
    const lab = $('remember-label');
    if(lab) lab.textContent = next === '1' ? '開' : '關';
  }

  window.yxDirectLogin = directLogin;
  window.submitLogin = directLogin;
  window.toggleLoginSave = toggleLoginSave;

  document.addEventListener('DOMContentLoaded', function(){
    const last = localStorage.getItem('yxLastUsername') || '';
    if($('login-username') && !$('login-username').value) $('login-username').value = last;
    if($('remember-label')) $('remember-label').textContent = localStorage.getItem('yxRememberLogin') === '0' ? '關' : '開';
    const form = $('login-form');
    if(form) form.addEventListener('submit', directLogin, true);
    const rememberBtn = document.querySelector('[data-action="toggle-login-save"]');
    if(rememberBtn) rememberBtn.addEventListener('click', toggleLoginSave, true);
  });
})();


