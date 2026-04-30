import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { navigate } from '../core/router.js';
import { toast, esc } from '../utils/dom.js';

export async function renderHome(app) {
  const changes = await get('/api/today-changes').catch(() => ({ unread_count: 0 }));
  state.unreadCount = changes.unread_count || 0;
  const badge = state.unreadCount ? `<span class="badge">${state.unreadCount}</span>` : '';
  const username = state.user?.username || '使用者';
  app.innerHTML = `<section class="home-page">
    <h1 class="home-brand">沅興木業</h1>
    <div class="home-user">目前使用者：${esc(username)}</div>
    <div class="home-top-row">
      <button class="secondary" data-route="settings">設定</button>
      <button class="secondary" data-route="todayChanges">今日異動${badge}</button>
      <button id="logoutBtn" class="secondary" title="登出">登出</button>
    </div>
    <div class="home-grid">
      <button class="home-btn primary" data-route="inventory">庫存</button>
      <button class="home-btn primary" data-route="orders">訂單</button>
      <button class="home-btn primary" data-route="master">總單</button>
      <button class="home-btn primary" data-route="shipping">出貨</button>
      <button class="home-btn primary" data-route="shippingRecords">出貨查詢</button>
      <button class="home-btn primary" data-route="warehouse">倉庫圖</button>
      <button class="home-btn primary" data-route="customers">客戶資料</button>
      <button class="home-btn primary" data-route="todos">代辦事項</button>
    </div>
  </section>`;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (!confirm('要登出目前帳號嗎？')) return;
    await post('/api/logout', {});
    state.user = null;
    toast('已登出');
    navigate('login');
  });
}
