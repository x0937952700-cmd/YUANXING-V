import {API} from './api.js';
import {$, $$, toast} from './ui.js';
import {renderItemsPage, renderInbound} from './items.js';
import {renderShipping, renderShippingRecords} from './shipping.js';
import {renderWarehouse} from './warehouse.js';
import {renderCustomers} from './customers.js';
import {renderActivity} from './activity.js';
import {renderSettings} from './settings.js';

const routes = {
  home: renderHome,
  inventory: root => renderItemsPage('inventory', root),
  orders: root => renderItemsPage('orders', root),
  master: root => renderItemsPage('master', root),
  inbound: renderInbound,
  shipping: renderShipping,
  warehouse: renderWarehouse,
  customers: renderCustomers,
  activity: renderActivity,
  shippingRecords: renderShippingRecords,
  settings: renderSettings
};

const loaded = new Set();

async function boot(){
  $('#todayText').textContent = new Date().toLocaleDateString('zh-TW', {year:'numeric', month:'2-digit', day:'2-digit', weekday:'short'});
  const me = await API.get('/api/me');
  if(!me.logged_in){ location.href='/login'; return; }
  $('#userName').textContent = me.username || '使用者';
  $('#logoutBtn').onclick = async()=>{ await API.post('/api/logout',{}); location.href='/login'; };
  document.body.addEventListener('click', e=>{ const nav=e.target.closest('[data-nav]'); if(nav) navigate(nav.dataset.nav); });
  window.addEventListener('yx:navigate', e=>navigate(e.detail));
  window.addEventListener('yx:badge', updateBadge);
  await navigate('home');
  updateBadge();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('/static/service-worker.js').catch(()=>{}); }
  setInterval(updateBadge, 30000);
}

async function navigate(name){
  const page = document.getElementById(name) || document.getElementById('home');
  $$('.page').forEach(p=>p.classList.remove('active'));
  page.classList.add('active');
  window.scrollTo({top:0, behavior:'instant'});
  if(name==='home' || !loaded.has(name)){
    try{ await routes[name](page); loaded.add(name); }
    catch(e){ page.innerHTML = `<div class="error-card">載入失敗：${e.message}</div>`; toast(e.message); }
  }
  if(name==='activity') updateBadge();
}

function renderHome(root){
  loaded.delete('inventory'); loaded.delete('orders'); loaded.delete('master'); loaded.delete('shipping'); loaded.delete('warehouse'); loaded.delete('customers'); loaded.delete('settings'); loaded.delete('shippingRecords'); loaded.delete('inbound'); loaded.delete('activity');
  root.innerHTML = `<section class="home-hero"><div class="label-chip">CLEAN V1 新母版</div><h1 class="home-title">沅興木業</h1><p class="subtle">乾淨架構：不載入 FIX135～FIX151 舊版覆蓋檔，頁面秒切換、按鈕只綁一次。</p></section><section class="home-grid">
    ${homeBtn('inventory','庫存','商品列表、批量材質、加入訂單/總單')}
    ${homeBtn('orders','訂單','北中南客戶、修改、直接出貨')}
    ${homeBtn('master','總單','客戶持有貨品、合併、扣除')}
    ${homeBtn('inbound','入庫 / OCR','拍照上傳、貼文字整理、送出')}
    ${homeBtn('shipping','出貨','選客戶商品、預覽材積、扣除')}
    ${homeBtn('warehouse','倉庫圖','A/B倉、前後排、長按格子')}
    ${homeBtn('customers','客戶資料','北中南、封存、常用資料')}
    ${homeBtn('activity','今日異動','通知中心、滑動刪除、未入倉')}
    ${homeBtn('shippingRecords','出貨紀錄','搜尋、材積、重量、扣除摘要')}
    ${homeBtn('settings','設定 / 備份','健康檢查、使用者、黑名單')}
  </section>`;
}
function homeBtn(nav,title,sub){return `<button class="home-btn" data-nav="${nav}">${title}<small>${sub}</small></button>`;}

async function updateBadge(){
  try{const d=await API.get('/api/activity'); const b=$('#activityBadge'); if(d.unread>0){b.textContent=d.unread;b.classList.remove('hidden');}else b.classList.add('hidden');}
  catch{}
}

boot().catch(e=>{ document.body.innerHTML = `<main class="login-shell"><div class="error-card">系統啟動失敗：${e.message}</div></main>`; });
