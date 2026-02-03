// precache.js (patched)
(function () {
  // service workers require a secure context (https or localhost)
  if (!('serviceWorker' in navigator)) {
    console.info('[Abrox] Service Worker not supported in this browser.');
    return;
  }

  const SW_PATH = window.__abrox_sw_path || '/sw.js';

  function safeLog(...args){ try{ console.log('[Abrox]', ...args); }catch(e){} }
  function safeWarn(...args){ try{ console.warn('[Abrox]', ...args); }catch(e){} }
  function safeError(...args){ try{ console.error('[Abrox]', ...args); }catch(e){} }

  function registerServiceWorker() {
    try {
      navigator.serviceWorker
        .register(SW_PATH)
        .then(reg => {
          safeLog('Service Worker registered:', reg.scope);

          // report install/update state transitions
          if (reg.installing) {
            safeLog('Service Worker state: installing');
            watchInstalling(reg.installing);
          }
          if (reg.waiting) {
            safeLog('Service Worker state: waiting');
          }
          if (reg.active) {
            safeLog('Service Worker state: active');
          }

          reg.addEventListener('updatefound', () => {
            const inst = reg.installing;
            safeLog('Service Worker update found.');
            if (inst) watchInstalling(inst);
          });

          navigator.serviceWorker.ready
            .then(() => safeLog('Service Worker ready.'))
            .catch(err => safeWarn('serviceWorker.ready failed:', err));
        })
        .catch(err => {
          safeError('Service Worker registration failed:', err);
        });
    } catch (err) {
      safeError('Service Worker registration threw:', err);
    }
  }

  function watchInstalling(worker) {
    if (!worker) return;
    try {
      safeLog('watchInstalling: current state ->', worker.state);
      worker.addEventListener('statechange', () => {
        safeLog('Service Worker state change:', worker.state);
        // when new SW becomes 'installed' and there's an active controller, it means update is available
        if (worker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            safeLog('New Service Worker installed — update available.');
          } else {
            safeLog('Service Worker installed for the first time.');
          }
        }
      });
    } catch (e) {
      safeWarn('watchInstalling error', e);
    }
  }

  // also log controller changes (useful when SW calls clients.claim())
  try {
    navigator.serviceWorker.addEventListener && navigator.serviceWorker.addEventListener('controllerchange', () => {
      safeLog('Service Worker controller changed.');
    });
  } catch (e) {
    /* ignore */
  }

  // Register on load (or immediately if document already loaded)
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // defer a tick so other scripts can initialize if needed
    setTimeout(registerServiceWorker, 0);
  } else {
    window.addEventListener('load', registerServiceWorker, { passive: true });
  }
})();
