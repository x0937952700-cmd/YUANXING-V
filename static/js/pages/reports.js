import { get } from '../core/api.js';
import { esc, pageShell, toast } from '../utils/dom.js';

const kindName = { inventory:'庫存', orders:'訂單', master_orders:'總單', shipping:'出貨' };

function topList(title, items=[]){
  if(!items.length) return `<div class="mini-report"><b>${title}</b><div class="muted">目前沒有資料</div></div>`;
  return `<div class="mini-report"><b>${title}</b>${items.map(x=>`<div class="report-row"><span>${esc(x.name)}</span><strong>${x.qty}件</strong></div>`).join('')}</div>`;
}

function queryString(){
  const kind = document.getElementById('reportKind')?.value || 'shipping';
  const days = document.getElementById('reportDays')?.value || '';
  const start = document.getElementById('reportStart')?.value || '';
  const end = document.getElementById('reportEnd')?.value || '';
  const qs = new URLSearchParams({kind});
  if(days) qs.set('days', days);
  if(start && end){ qs.set('start', start); qs.set('end', end); }
  return qs.toString();
}

async function loadReport(){
  const box = document.getElementById('reportResult');
  box.innerHTML = '<div class="loading-card">產生報表中…</div>';
  try{
    const res = await get(`/api/reports/summary?${queryString()}`);
    const s = res.summary || {};
    box.innerHTML = `<div class="report-kpis"><div><b>${s.total_rows||0}</b><span>總筆數</span></div><div><b>${s.total_qty||0}</b><span>總件數</span></div></div>
      <div class="report-grid">${topList('客戶統計', s.by_customer)}${topList('材質統計', s.by_material)}${topList('操作人統計', s.by_operator)}</div>
      <div class="card"><div class="section-title">明細預覽（前200筆）</div><div class="table-scroll"><table><thead><tr><th>客戶</th><th>材質</th><th>尺寸</th><th>件數</th><th>來源/區域</th><th>操作人</th><th>時間</th></tr></thead><tbody>
      ${(res.items||[]).map(r=>`<tr><td>${esc(r.customer_name||'庫存')}</td><td>${esc(r.material||'')}</td><td>${esc(r.product_text||'')}</td><td>${r.qty||0}</td><td>${esc(r.source||r.zone||'')}</td><td>${esc(r.operator||'')}</td><td>${esc(r.time||'')}</td></tr>`).join('') || '<tr><td colspan="7">沒有資料</td></tr>'}
      </tbody></table></div></div>`;
  }catch(err){ box.innerHTML = `<div class="error-card">${esc(err.message||err)}</div>`; }
}

export async function renderReports(app){
  app.innerHTML = pageShell('報表 / 匯出 Excel', `<div class="card"><div class="form-grid">
    <label class="field"><span>報表類型</span><select id="reportKind"><option value="shipping">出貨</option><option value="inventory">庫存</option><option value="orders">訂單</option><option value="master_orders">總單</option></select></label>
    <label class="field"><span>快速日期</span><select id="reportDays"><option value="7">7天</option><option value="15">15天</option><option value="30">30天</option><option value="">全部/自訂</option></select></label>
    <label class="field"><span>開始日期</span><input id="reportStart" type="date"></label>
    <label class="field"><span>結束日期</span><input id="reportEnd" type="date"></label>
    <button class="primary" id="loadReportBtn">產生統計</button><button class="secondary" id="exportReportBtn">匯出 Excel</button>
  </div><div class="muted">可用來看客戶月報、材質統計、出貨分析，並下載 Excel 給會計或對帳。</div></div><div id="reportResult"></div>`, '<button class="secondary" data-route="home">返回首頁</button>');
  document.getElementById('loadReportBtn').onclick = loadReport;
  document.getElementById('exportReportBtn').onclick = () => {
    const kind = document.getElementById('reportKind').value;
    const qs = new URLSearchParams(queryString()); qs.delete('kind');
    window.location.href = `/api/reports/export/${kind}?${qs.toString()}`;
    toast('開始下載 Excel');
  };
  await loadReport();
}
