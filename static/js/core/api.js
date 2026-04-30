export async function api(path, options = {}) {
  const config = { method: options.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (options.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, config);
  let data;
  try { data = await res.json(); } catch { data = { success: false, error: '伺服器回應格式錯誤' }; }
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data;
}
export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const del = (path) => api(path, { method: 'DELETE' });
export async function postForm(path, formData) {
  const res = await fetch(path, { method: 'POST', body: formData, credentials: 'same-origin' });
  let data;
  try { data = await res.json(); } catch { data = { success:false, error:'伺服器回應格式錯誤' }; }
  if (!res.ok || data.success === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}
