import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

if ('serviceWorker' in navigator) {
  const appBase = new URL(import.meta.env.BASE_URL, window.location.origin);
  const serviceWorkerUrl = new URL('sw.js', appBase);
  void navigator.serviceWorker.register(serviceWorkerUrl, {
    scope: appBase.pathname,
    updateViaCache: 'none',
  }).catch((error: unknown) => {
    console.warn('Briefing Agent offline shell could not be registered.', error);
  });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
