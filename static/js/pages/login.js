import { post } from '../core/api.js';
import { state } from '../core/state.js';
import { navigate } from '../core/router.js';
import { toast, esc } from '../utils/dom.js';

export async function renderLogin(app) {
  app.innerHTML = `<section class="login"><div class="card login-card">
    <div class="page-title" style="text-align:center">沅興木業</div>
    <p class="muted" style="text-align:center">第一次輸入姓名與密碼會自動註冊。</p>
    <form id="loginForm" class="form-grid" style="grid-template-columns:1fr">
      <label class="field"><span>姓名</span><input name="username" autocomplete="username" required placeholder="例如：陳韋廷"></label>
      <label class="field"><span>密碼</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit">登入 / 第一次註冊</button>
      <div id="loginMsg"></div>
    </form>
  </div></section>`;
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const msg = document.getElementById('loginMsg');
    msg.innerHTML = '';
    try {
      const res = await post('/api/login', Object.fromEntries(fd.entries()));
      state.user = res.user;
      toast('登入成功');
      navigate('home');
    } catch (err) {
      msg.innerHTML = `<div class="error-card">${esc(err.message)}</div>`;
    }
  });
}
