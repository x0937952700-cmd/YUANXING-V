import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { navigate } from '../core/router.js';
import { toast, esc } from '../utils/dom.js';

export async function renderHome(app) {
  const changes = await get('/api/today-changes').catch(() => ({ unread_count: 0 }));
  state.unreadCount = changes.unread_count || 0;
  const badge = state.unreadCount ? `<span class="badge">${state.unreadCount}</span>` : '';
  app.innerHTML = `<section class="page">
    <div class="topbar">
      <div class="left"><button class="secondary" data-route="settings">設定</button><button class="secondary" data-route="todayChanges">今日異動${badge}</button></div>
      <div class="brand">沅興木業</div>
      <div class="right"><button id="logoutBtn" class="ghost">登出</button></div>
    </div>
    <div class="user-line">目前使用者：${esc(state.user?.username || '')}</div>
    <div class="home-grid">
      <button class="home-btn primary" data-route="inventory">庫存</button>
      <button class="home-btn primary" data-route="orders">訂單</button>
      <button class="home-btn primary" data-route="master">總單</button>
      <button class="home-btn primary" data-route="shipping">出貨</button>
      <button class="home-btn secondary" data-route="shippingRecords">出貨查詢</button>
      <button class="home-btn secondary" data-route="warehouse">倉庫圖</button>
      <button class="home-btn secondary" data-route="customers">客戶資料</button>
      <button class="home-btn secondary" data-route="todos">代辦事項</button>
      <button class="home-btn secondary" data-route="reports">報表 / 匯出</button>
    </div>
    <div class="card"><div class="section-title">企業版狀態</div><p class="muted">乾淨母版、報表匯出、手機操作優化、局部刷新與核心流程已接上。</p></div>
  </section>`;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await post('/api/logout', {});
    state.user = null;
    toast('已登出');
    navigate('login');
  });
}
