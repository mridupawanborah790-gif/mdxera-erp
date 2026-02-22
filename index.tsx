
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Define process if it's not present to avoid ReferenceErrors when accessing process.env.API_KEY
if (typeof (window as any).process === 'undefined') {
  (window as any).process = { env: {} };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Use relative path './sw.js' to support preview environments where root '/' might resolve incorrectly
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        // In preview environments (like AI Studio), SW registration often fails due to origin mismatches.
        // We log a warning instead of an error to keep the console clean.
        const msg = registrationError?.message || '';
        if (msg.includes('origin') || msg.includes('SecurityError')) {
            console.warn('Service Worker registration skipped: Environment restriction.');
        } else {
            console.warn('SW registration failed: ', registrationError);
        }
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