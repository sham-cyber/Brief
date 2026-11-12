import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { capturePwaLaunchIntent } from '@/lib/pwa-launch';

import './index.css';

capturePwaLaunchIntent();

if ('serviceWorker' in navigator) {
  const appBase = new URL(import.meta.env.BASE_URL, window.location.origin);
  const serviceWorkerUrl = new URL('sw.js', appBase);
  void navigator.serviceWorker.register(serviceWorkerUrl, {
    scope: appBase.pathname,
    updateViaCache: 'none',
  }).then(async (registration) => {
    const extendedRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
      periodicSync?: {
        register: (tag: string, options: { minInterval: number }) => Promise<void>;
      };
    };

    const refreshStaticShellWhenOnline = () => {
      if (!extendedRegistration.sync) return;
      void extendedRegistration.sync.register('briefing-agent-shell-refresh').catch(() => {
        // Background Sync is optional; normal network-first caching still works.
      });
    };
    window.addEventListener('online', refreshStaticShellWhenOnline);

    if (extendedRegistration.periodicSync && 'permissions' in navigator) {
      try {
        const permission = await navigator.permissions.query({
          name: 'periodic-background-sync' as PermissionName,
        });
        if (permission.state === 'granted') {
          await extendedRegistration.periodicSync.register('briefing-agent-shell-refresh', {
            minInterval: 24 * 60 * 60 * 1000,
          });
        }
      } catch {
        // Browser or installation policy may not allow Periodic Background Sync.
      }
    }
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
