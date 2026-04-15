
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Define process if it's not present to avoid ReferenceErrors when accessing process.env.API_KEY
if (typeof (window as any).process === 'undefined') {
  (window as any).process = { env: {} };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadActiveController = Boolean(navigator.serviceWorker.controller);
    const reloadFlag = 'sw-cleanup-reload-done';

    // Disable Service Worker to prevent stale shell/cache loops on production deployments.
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .then(() => {
        if ('caches' in window) {
          return caches.keys().then(cacheNames => Promise.all(cacheNames.map(cacheName => caches.delete(cacheName))));
        }
      })
      .then(() => {
        if (hadActiveController && !sessionStorage.getItem(reloadFlag)) {
          sessionStorage.setItem(reloadFlag, 'true');
          window.location.reload();
        }
      })
      .catch((error) => {
        console.warn('Service Worker cleanup skipped:', error);
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
