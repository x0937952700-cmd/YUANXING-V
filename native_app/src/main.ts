import './styles.css';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Ocr } from '@jcesarmobile/capacitor-ocr';

type OcrSource = 'camera' | 'photos';
type OcrMode = 'blue' | 'general' | 'handwriting';
type NormalizedBox = { id: string; text: string; confidence: number; bbox: { x: number; y: number; w: number; h: number } };
type RequestPayload = { type: 'native-ocr-request'; source?: OcrSource; requestId?: string; ocrMode?: OcrMode; appId?: string };

const DEFAULT_BACKEND_URL = 'https://yuanxing-v.onrender.com';
const BACKEND_URL_STORAGE_KEY = 'yuanxing_backend_url';
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

app.innerHTML = `
  <div class="shell">
    <div class="topbar compact-fixed">
      <div>
        <div class="brand">沅興木業</div>
        <div class="fixed-url" id="backend-label"></div>
      </div>
      <div class="btn-row compact">
        <button id="config-btn" class="btn secondary">設定網址</button>
        <button id="reload-btn" class="btn secondary">重新載入</button>
      </div>
    </div>
    <div class="frame-wrap">
      <div id="status" class="status">系統載入中…</div>
      <iframe id="erp-frame" class="frame" allow="camera *; microphone *; clipboard-read *; clipboard-write *"></iframe>
    </div>
  </div>
  <div id="config-modal" class="overlay hidden">
    <div class="dialog-card">
      <h3>原生 App 後端網址</h3>
      <p>可保留正式網址，也可臨時切到其他正式環境。</p>
      <label class="field-label">後端網址</label>
      <input id="backend-input" class="dialog-input" placeholder="https://...">
      <div class="dialog-actions">
        <button id="config-reset-btn" class="btn secondary">恢復預設</button>
        <button id="config-cancel-btn" class="btn secondary">取消</button>
        <button id="config-save-btn" class="btn">儲存</button>
      </div>
    </div>
  </div>
  <div id="ocr-modal" class="overlay hidden">
    <div class="dialog-card large">
      <h3>上傳檔案 / 拍照</h3>
      <p>拖拉框出你要辨識的範圍，辨識完成後會直接回填到系統，並沿用新的商用介面樣式。</p>
      <div class="dialog-toolbar">
        <select id="ocr-mode-input" class="dialog-input compact-input">
          <option value="blue">優先選項：藍字優先</option>
          <option value="general">優先選項：一般模式</option>
          <option value="handwriting">優先選項：手寫優先</option>
        </select>
      </div>
      <div id="ocr-stage" class="ocr-stage">
        <img id="ocr-stage-img" class="ocr-stage-img" alt="ocr preview">
        <div id="ocr-stage-roi" class="ocr-stage-roi hidden"></div>
      </div>
      <div class="dialog-actions">
        <button id="ocr-clear-btn" class="btn secondary">清除框選</button>
        <button id="ocr-cancel-btn" class="btn secondary">取消</button>
        <button id="ocr-run-btn" class="btn">開始辨識</button>
      </div>
    </div>
  </div>
`;

const status = document.querySelector<HTMLDivElement>('#status')!;
const frame = document.querySelector<HTMLIFrameElement>('#erp-frame')!;
const reloadBtn = document.querySelector<HTMLButtonElement>('#reload-btn')!;
const configBtn = document.querySelector<HTMLButtonElement>('#config-btn')!;
const backendLabel = document.querySelector<HTMLDivElement>('#backend-label')!;
const configModal = document.querySelector<HTMLDivElement>('#config-modal')!;
const backendInput = document.querySelector<HTMLInputElement>('#backend-input')!;
const configResetBtn = document.querySelector<HTMLButtonElement>('#config-reset-btn')!;
const configCancelBtn = document.querySelector<HTMLButtonElement>('#config-cancel-btn')!;
const configSaveBtn = document.querySelector<HTMLButtonElement>('#config-save-btn')!;

let loadTimer: number | undefined;

function normalizeBackendUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return DEFAULT_BACKEND_URL;
  return trimmed.replace(/\/$/, '');
}
function getBackendUrl(): string {
  return normalizeBackendUrl(localStorage.getItem(BACKEND_URL_STORAGE_KEY) || DEFAULT_BACKEND_URL);
}
function setBackendUrl(url: string) {
  localStorage.setItem(BACKEND_URL_STORAGE_KEY, normalizeBackendUrl(url));
  updateBackendLabel();
}
function updateBackendLabel() {
  backendLabel.textContent = `固定後端：${getBackendUrl()}`;
}
function getBackendOrigin(): string {
  try {
    return new URL(getBackendUrl()).origin;
  } catch {
    return getBackendUrl();
  }
}
function setStatus(message: string) {
  status.textContent = message;
}
function openFrame() {
  window.clearTimeout(loadTimer);
  frame.src = getBackendUrl();
  setStatus('系統載入中…');
  loadTimer = window.setTimeout(() => {
    setStatus('後端可能喚醒中，已持續嘗試連線…');
  }, 8000);
}
function toggleConfigModal(show: boolean) {
  configModal.classList.toggle('hidden', !show);
  if (show) backendInput.value = getBackendUrl();
}

reloadBtn.addEventListener('click', openFrame);
configBtn.addEventListener('click', () => toggleConfigModal(true));
configCancelBtn.addEventListener('click', () => toggleConfigModal(false));
configResetBtn.addEventListener('click', () => { backendInput.value = DEFAULT_BACKEND_URL; });
configSaveBtn.addEventListener('click', () => {
  setBackendUrl(backendInput.value || DEFAULT_BACKEND_URL);
  toggleConfigModal(false);
  openFrame();
});

frame.addEventListener('load', () => {
  window.clearTimeout(loadTimer);
  setStatus('已連線到系統');
});
window.addEventListener('offline', () => setStatus('目前離線，仍可先辨識並暫存於頁面'));
window.addEventListener('online', () => setStatus('網路已恢復，正在與系統同步'));

function extractBoundingBox(raw: any) {
  const bounds = raw?.bbox || raw?.bounds || raw?.frame || raw?.boundingBox || {};
  const x = Number(bounds?.x ?? bounds?.left ?? 0) || 0;
  const y = Number(bounds?.y ?? bounds?.top ?? 0) || 0;
  let w = Number(bounds?.w ?? bounds?.width ?? 0) || 0;
  let h = Number(bounds?.h ?? bounds?.height ?? 0) || 0;
  const right = Number(bounds?.right ?? 0) || 0;
  const bottom = Number(bounds?.bottom ?? 0) || 0;
  if (right && bottom) {
    w = Math.max(0, right - x);
    h = Math.max(0, bottom - y);
  }
  return { x, y, w, h };
}

function normalizeBoxes(results: any[], imageWidth: number, imageHeight: number): NormalizedBox[] {
  const boxes = (results || []).map((item, index) => {
    const raw = extractBoundingBox(item);
    const usePixels = raw.x > 1 || raw.y > 1 || raw.w > 1 || raw.h > 1;
    const bbox = usePixels ? {
      x: raw.x / Math.max(1, imageWidth),
      y: raw.y / Math.max(1, imageHeight),
      w: raw.w / Math.max(1, imageWidth),
      h: raw.h / Math.max(1, imageHeight),
    } : raw;
    return {
      id: String(item?.id || `box-${index + 1}`),
      text: String(item?.text || '').trim(),
      confidence: Math.round(Number(item?.confidence || 0) || 0),
      bbox,
    };
  }).filter(item => item.text);
  boxes.sort((a, b) => (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x));
  return boxes;
}

function groupBoxesToLines(boxes: NormalizedBox[]) {
  const lines: Array<{ text: string; confidence: number; bbox: { x: number; y: number; w: number; h: number } }> = [];
  for (const box of boxes) {
    const tolerance = Math.max(0.018, box.bbox.h * 0.75 || 0.03);
    let found = lines.find(line => Math.abs(line.bbox.y - box.bbox.y) <= tolerance);
    if (!found) {
      found = { text: '', confidence: 0, bbox: { ...box.bbox } };
      lines.push(found);
    } else {
      const right = Math.max(found.bbox.x + found.bbox.w, box.bbox.x + box.bbox.w);
      const bottom = Math.max(found.bbox.y + found.bbox.h, box.bbox.y + box.bbox.h);
      found.bbox.x = Math.min(found.bbox.x, box.bbox.x);
      found.bbox.y = Math.min(found.bbox.y, box.bbox.y);
      found.bbox.w = right - found.bbox.x;
      found.bbox.h = bottom - found.bbox.y;
    }
    found.text = found.text ? `${found.text} ${box.text}` : box.text;
    found.confidence = Math.round((found.confidence + box.confidence) / (found.confidence ? 2 : 1));
  }
  return lines.map((line, index) => ({ id: `line-${index + 1}`, ...line }));
}

function boxInRoi(box: NormalizedBox, roi?: { x: number; y: number; w: number; h: number } | null) {
  if (!roi) return true;
  const cx = box.bbox.x + box.bbox.w / 2;
  const cy = box.bbox.y + box.bbox.h / 2;
  return cx >= roi.x && cx <= roi.x + roi.w && cy >= roi.y && cy <= roi.y + roi.h;
}

async function imageToDataUrl(webPath: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const ready = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('預覽圖片載入失敗'));
  });
  img.src = webPath;
  await ready;
  const canvas = document.createElement('canvas');
  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立預覽畫布');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.86), width: img.width, height: img.height };
}

async function chooseRoi(previewDataUrl: string, defaultMode: OcrMode): Promise<{ roi: { x: number; y: number; w: number; h: number } | null; mode: OcrMode; cancelled: boolean }> {
  const modal = document.querySelector<HTMLDivElement>('#ocr-modal')!;
  const stage = document.querySelector<HTMLDivElement>('#ocr-stage')!;
  const img = document.querySelector<HTMLImageElement>('#ocr-stage-img')!;
  const roiBox = document.querySelector<HTMLDivElement>('#ocr-stage-roi')!;
  const modeInput = document.querySelector<HTMLSelectElement>('#ocr-mode-input')!;
  const clearBtn = document.querySelector<HTMLButtonElement>('#ocr-clear-btn')!;
  const cancelBtn = document.querySelector<HTMLButtonElement>('#ocr-cancel-btn')!;
  const runBtn = document.querySelector<HTMLButtonElement>('#ocr-run-btn')!;

  img.src = previewDataUrl;
  modeInput.value = defaultMode;
  modal.classList.remove('hidden');

  let roi: { x: number; y: number; w: number; h: number } | null = null;
  let startPoint: { x: number; y: number } | null = null;

  const point = (event: MouseEvent | TouchEvent) => {
    const rect = stage.getBoundingClientRect();
    const touch = 'touches' in event ? event.touches[0] : event;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top, rect };
  };
  const redraw = (left: number, top: number, width: number, height: number) => {
    roiBox.style.left = `${left}px`;
    roiBox.style.top = `${top}px`;
    roiBox.style.width = `${width}px`;
    roiBox.style.height = `${height}px`;
    roiBox.classList.remove('hidden');
  };
  const clearSelection = () => {
    roi = null;
    roiBox.classList.add('hidden');
  };
  const onStart = (event: MouseEvent | TouchEvent) => {
    const p = point(event);
    startPoint = { x: p.x, y: p.y };
    redraw(p.x, p.y, 0, 0);
    event.preventDefault();
  };
  const onMove = (event: MouseEvent | TouchEvent) => {
    if (!startPoint) return;
    const p = point(event);
    const left = Math.max(0, Math.min(startPoint.x, p.x));
    const top = Math.max(0, Math.min(startPoint.y, p.y));
    const width = Math.abs(startPoint.x - p.x);
    const height = Math.abs(startPoint.y - p.y);
    redraw(left, top, width, height);
    roi = {
      x: left / p.rect.width,
      y: top / p.rect.height,
      w: width / p.rect.width,
      h: height / p.rect.height,
    };
    event.preventDefault();
  };
  const onEnd = () => { startPoint = null; };

  stage.addEventListener('mousedown', onStart);
  stage.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
  stage.addEventListener('touchstart', onStart, { passive: false });
  stage.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);

  const result = await new Promise<{ roi: { x: number; y: number; w: number; h: number } | null; mode: OcrMode; cancelled: boolean }>((resolve) => {
    const cleanup = (output: { roi: { x: number; y: number; w: number; h: number } | null; mode: OcrMode; cancelled: boolean }) => {
      modal.classList.add('hidden');
      stage.removeEventListener('mousedown', onStart);
      stage.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      stage.removeEventListener('touchstart', onStart);
      stage.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      clearBtn.onclick = null;
      cancelBtn.onclick = null;
      runBtn.onclick = null;
      resolve(output);
    };
    clearBtn.onclick = () => clearSelection();
    cancelBtn.onclick = () => cleanup({ roi: null, mode: modeInput.value as OcrMode, cancelled: true });
    runBtn.onclick = () => cleanup({ roi, mode: modeInput.value as OcrMode, cancelled: false });
  });
  return result;
}

async function runNativeOcr(request: RequestPayload) {
  try {
    const source = request.source === 'camera' ? 'camera' : 'photos';
    const defaultMode = (request.ocrMode || 'blue') as OcrMode;
    setStatus(source === 'camera' ? '正在開啟相機…' : '正在開啟相簿…');
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      allowEditing: false,
      saveToGallery: false,
    });
    const image = photo.path || photo.webPath;
    const previewPath = photo.webPath || photo.path;
    if (!image || !previewPath) throw new Error('找不到圖片路徑');

    const preview = await imageToDataUrl(previewPath);
    const previewDataUrl = preview.dataUrl;
    const selection = await chooseRoi(previewDataUrl, defaultMode);
    if (selection.cancelled) {
      setStatus('已取消辨識');
      return;
    }

    setStatus('原生文字辨識中…');
    const result = await Ocr.process({ image });
    const normalized = normalizeBoxes(Array.isArray((result as any)?.results) ? (result as any).results : [], preview.width, preview.height);
    const filtered = normalized.filter((box) => boxInRoi(box, selection.roi));
    const activeBoxes = filtered.length ? filtered : normalized;
    const lineMap = groupBoxesToLines(activeBoxes);
    const text = lineMap.map((line) => line.text || '').filter(Boolean).join('\n').trim();
    const avgConfidence = activeBoxes.length
      ? Math.round(activeBoxes.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / activeBoxes.length)
      : 0;

    frame.contentWindow?.postMessage({
      type: 'native-ocr-result',
      payload: {
        text,
        confidence: avgConfidence,
        source,
        requestId: request.requestId || '',
        ocrMode: selection.mode,
        roi: selection.roi,
        blocks: activeBoxes,
        line_map: lineMap,
        previewDataUrl,
      },
    }, getBackendOrigin());

    setStatus(text ? '辨識完成，已回填到系統' : '未抓到可用文字，已開啟可手動編輯狀態');
  } catch (error) {
    const message = error instanceof Error ? error.message : '原生辨識失敗';
    frame.contentWindow?.postMessage({
      type: 'native-ocr-result',
      payload: {
        error: message,
        source: request.source === 'camera' ? 'camera' : 'photos',
        requestId: request.requestId || '',
      },
    }, getBackendOrigin());
    setStatus(message);
  }
}

window.addEventListener('message', (event) => {
  const data = event.data as RequestPayload | undefined;
  if (!data || typeof data !== 'object' || data.type !== 'native-ocr-request') return;
  if (event.source !== frame.contentWindow) return;
  if (String(event.origin || '') !== getBackendOrigin()) return;
  runNativeOcr(data);
});

updateBackendLabel();
openFrame();
