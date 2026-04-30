import { state } from './state.js';
import { renderLogin } from '../pages/login.js';
import { renderHome } from '../pages/home.js';
import { renderInventory } from '../pages/inventory.js';
import { renderOrders } from '../pages/orders.js';
import { renderMasterOrder } from '../pages/masterOrder.js';
import { renderShipping } from '../pages/shipping.js';
import { renderShippingRecords } from '../pages/shippingRecords.js';
import { renderWarehouse } from '../pages/warehouse.js';
import { renderCustomers } from '../pages/customers.js';
import { renderTodayChanges } from '../pages/todayChanges.js';
import { renderSettings } from '../pages/settings.js';
import { renderTodos } from '../pages/todos.js';
import { renderReports } from '../pages/reports.js';
import { toast } from '../utils/dom.js';

const routes = {
  login: renderLogin,
  home: renderHome,
  inventory: renderInventory,
  orders: renderOrders,
  master: renderMasterOrder,
  shipping: renderShipping,
  shippingRecords: renderShippingRecords,
  warehouse: renderWarehouse,
  customers: renderCustomers,
  todayChanges: renderTodayChanges,
  settings: renderSettings,
  todos: renderTodos,
  reports: renderReports,
};

export async function navigate(page, params = {}) {
  state.currentPage = page || 'home';
  const renderer = routes[state.currentPage] || routes.home;
  const app = document.getElementById('app');
  app.innerHTML = `<section class="loading-card">載入 ${state.currentPage}…</section>`;
  try {
    await renderer(app, params);
  } catch (err) {
    app.innerHTML = `<section class="page"><div class="error-card">${err.message || err}</div><button class="secondary" data-route="home">← 返回</button></section>`;
  }
}

export function installGlobalRouter() {
  document.addEventListener('click', (e) => {
    const undoBtn = e.target.closest('[data-global-undo]');
    if (undoBtn) {
      e.preventDefault();
      fetch('/api/undo-last', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
        .then(r => r.json())
        .then(data => {
          if (!data.success) throw new Error(data.error || '目前沒有可還原的動作');
          toast(data.message || '已還原上一步');
          navigate(state.currentPage || 'home');
        })
        .catch(err => toast(err.message || '還原失敗', 'error'));
      return;
    }
    const routeBtn = e.target.closest('[data-route]');
    if (routeBtn) {
      e.preventDefault();
      navigate(routeBtn.dataset.route);
    }
  });
}
