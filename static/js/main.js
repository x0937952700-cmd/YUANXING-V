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

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/static/sw.js').catch(()=>{}); }


function setupRealtime(){
  if(!window.io) return;
  const socket = io();
  socket.on('update', (msg) => {
    if(window.YX && YX.refreshPartial){ YX.refreshPartial(msg.scope, msg.payload || {}); }
  });
}
window.addEventListener('load', setupRealtime);
