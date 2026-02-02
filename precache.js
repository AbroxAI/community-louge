// precache.js
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => { console.log('[Abrox] Service Worker registered:', reg.scope); }).catch(err => { console.error('[Abrox] Service Worker registration failed:', err); });
  });
})();
