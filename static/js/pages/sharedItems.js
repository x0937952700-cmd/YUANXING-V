import { esc } from '../utils/dom.js';

export function itemCard(row, source, actions = '') {
  return `<div class="item-card" data-id="${row.id}" data-source="${source}">
    <div><input type="checkbox" class="row-check" data-id="${row.id}"></div>
    <div class="item-main">
      <div><span class="material">${esc(row.material || '未填材質')}</span> <span class="pill">${esc(row.zone || '未分區')}</span> <span class="qty">${Number(row.qty || 0)}件</span></div>
      <div class="product-text">${esc(row.product_text)}</div>
      <div class="muted">${esc(row.customer_name || '庫存')} ${row.location ? '｜' + esc(row.location) : ''}</div>
      <div class="row-actions">${actions}</div>
    </div>
  </div>`;
}

export function itemTable(rows, source, actionsFn) {
  if (!rows.length) return `<div class="empty">目前沒有商品</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>選</th><th>材質</th><th>尺寸</th><th>支數x件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody>${rows.map(row => `<tr data-id="${row.id}" data-source="${source}">
    <td><input type="checkbox" class="row-check" data-id="${row.id}"></td>
    <td class="material">${esc(row.material || '未填材質')}</td>
    <td class="product-text">${esc(row.product_text)}</td>
    <td>${esc(row.product_text?.split('=')[1] || '')}</td>
    <td class="qty">${Number(row.qty || 0)}件</td>
    <td>${esc(row.zone || '')}</td>
    <td><div class="row-actions">${actionsFn(row)}</div></td>
  </tr>`).join('')}</tbody></table></div>`;
}

export function customerCard(c, activeUid = '') {
  return `<div class="customer-card ${c.uid === activeUid ? 'active':''}" data-customer-uid="${esc(c.uid)}" data-customer-name="${esc(c.name)}">
    <span class="customer-name">${esc(c.name)}</span>
    <span class="trade">${esc(c.trade_type || '')}</span>
    <span class="count">${Number(c.total_qty || 0)}件 / ${Number(c.total_rows || 0)}筆</span>
  </div>`;
}
