import { get } from './core/api.js';
import { state } from './core/state.js';
import { installGlobalRouter, navigate } from './core/router.js';

installGlobalRouter();
(async function boot(){
  try {
    const cfg = await get('/api/session/config');
    state.user = cfg.user;
    await navigate(state.user ? 'home' : 'login');
  } catch {
    await navigate('login');
  }
})();

// FINAL_BROWSER_SAFE: Service Worker and SocketIO client disabled on Render stable build.
// Core actions still refresh their own page sections; this avoids Chrome RESULT_CODE_KILLED_BAD_MESSAGE.
function setupRealtime(){
  if(!state.user) return;
  window.setInterval(() => {
    if(window.YX && YX.refreshPartial){ YX.refreshPartial('today_changes', {}); }
  }, 60000);
}
window.addEventListener('load', setupRealtime);
