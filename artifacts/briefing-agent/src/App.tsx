// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetBriefingSourceStatusQueryKey, useCreateBriefing, useCreateCustomerSearch, useGetBriefingSourceStatus } from '@workspace/api-client-react';
import type { BriefingResult, BriefSource, CustomerSearchResponse, SapDataArea } from '@workspace/api-client-react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ArrowDown, ArrowUpRight, Bell, BellOff, Check, Clipboard, Clock3, FileText, Link2, LoaderCircle, LockKeyhole, Printer, Radio, Search, Send, Square, Volume2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { SapConnectionSettings } from '@/components/sap-connection-settings';
import { INDIA_CITIES_BY_STATE, INDIA_STATES, type IndiaState } from '@/lib/india-locations';
import { clearPwaLaunchIntent, readPwaLaunchIntent } from '@/lib/pwa-launch';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const pendingQuestionStorageKey = `briefing-agent-pending-question:${basePath || '/'}`;
const settingsThemeStorageKey = `briefing-agent-settings-theme:${basePath || '/'}`;
const pwaInstalledStorageKey = `briefing-agent-installed:${basePath || '/'}`;
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#594b87',
    colorForeground: '#292e46',
    colorMutedForeground: '#777280',
    colorDanger: '#a54e47',
    colorBackground: '#fcfbf8',
    colorInput: '#ffffff',
    colorInputForeground: '#292e46',
    colorNeutral: '#d8d1e5',
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fcfbf8] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#292e46]',
    headerSubtitle: 'text-[#777280]',
    formFieldLabel: 'text-[#292e46]',
    formFieldInput: 'text-[#292e46]',
    formButtonPrimary: 'bg-[#594b87] text-white',
    footerActionText: 'text-[#777280]',
    footerActionLink: 'text-[#594b87]',
  },
};
const TOPICS = [
  { value: 'news', label: 'News' },
  { value: 'hire', label: 'Hires' },
  { value: 'launch', label: 'Launches' },
  { value: 'financial', label: 'Financial Facts' },
  { value: 'risk', label: 'Risks & Open Questions' },
] as const;
type Topic = typeof TOPICS[number]['value'];
const SAP_AREAS: { value: SapDataArea; label: string }[] = [
  { value: 'store', label: 'Store' },
  { value: 'production', label: 'Production' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'sales', label: 'Sales' },
  { value: 'hr', label: 'HR' },
  { value: 'power_electrical_solar', label: 'Power / Electrical / Solar' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'scrap', label: 'Scrap' },
  { value: 'order', label: 'Order' },
  { value: 'delivery', label: 'Delivery' },
];
const PERSON_ROLES = [
  { value: 'business_owner', label: 'Chairman / CEO' },
  { value: 'mp', label: 'MP' },
  { value: 'corporate', label: 'Corporate' },
] as const;
type PersonRole = typeof PERSON_ROLES[number]['value'];
type SourceMode = 'public' | 'private' | 'sap';
const SPEECH_WORD_LIMIT = 280;
const PRINT_WORD_LIMIT = 400;
const AI_REQUESTS_PER_TAB = 1;
const AI_SPEECH_LIMIT_SECONDS = 120;
const CUSTOMER_SEARCH_CUSTOM_CITY = '__custom_city__';
type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type AiGuardrailsStatus = {
  provider: 'ollama';
  aiProviderMessage: string | null;
  serverEnabled: boolean;
  passcodeConfigured: boolean;
  activated: boolean;
  requestsPerTab: number;
  speechLimitSeconds: number;
  qwenRequestTimeoutSeconds: number;
  qwenRequestLimit: number;
  qwenRequestWindowSeconds: number;
  qwenBriefWordLimit: number;
  qwenBatchBackupSeconds: number;
  qwenModelIdleUnloadSeconds: number;
  aiProviderConnected: boolean;
  model: string | null;
  providerEndpoint: string | null;
};

type SavedPersonProfile = {
  id: string;
  personName: string;
  personRole: PersonRole;
  publicRoleTitle: string | null;
  companyName: string | null;
  updatedAt: string;
};

function apiUrl(path: string) {
  return `${basePath}/api/${path}`;
}

async function sendAccountRequest(path: string, method: string, body?: unknown) {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'The account request failed.');
  return payload;
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded = atob(padded);
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new DataView(buffer);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes.setUint8(index, decoded.charCodeAt(index));
  }
  return buffer;
}

function PushNotificationSettings() {
  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [hasAccountSubscription, setHasAccountSubscription] = useState(false);
  const [thisDeviceSubscribed, setThisDeviceSubscribed] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const status = await sendAccountRequest('push-notifications/status', 'GET') as {
        configured?: boolean;
        publicKey?: string | null;
        subscribed?: boolean;
      };
      setConfigured(status.configured === true);
      setPublicKey(status.publicKey ?? null);
      setHasAccountSubscription(status.subscribed === true);
      const browserSupportsPush = 'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      setSupported(browserSupportsPush);
      if (browserSupportsPush) {
        const registration = await navigator.serviceWorker.ready;
        setThisDeviceSubscribed(Boolean(await registration.pushManager.getSubscription()));
      } else {
        setThisDeviceSubscribed(false);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Push notification settings could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (!supported || !publicKey || !configured) {
        throw new Error('Push alerts are not configured or supported on this device.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(permission === 'denied'
          ? 'Notifications are blocked in this browser’s site settings.'
          : 'Notification permission was not granted.');
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ??
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToArrayBuffer(publicKey),
        });
      await sendAccountRequest('push-notifications/subscriptions', 'POST', subscription.toJSON());
      setThisDeviceSubscribed(true);
      setHasAccountSubscription(true);
      setMessage('Brief-ready alerts are on for this device. They never start or repeat a search.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Push alerts could not be enabled.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await sendAccountRequest('push-notifications/subscriptions', 'DELETE', {
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }
      setThisDeviceSubscribed(false);
      setHasAccountSubscription(false);
      setMessage('Brief-ready alerts are off for this device.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Push alerts could not be disabled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#ded9e2] bg-white/80 p-4"
      aria-label="Brief-ready push notifications"
      data-testid="push-notification-settings"
    >
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm font-semibold text-[#35364a]">Brief-ready notifications</p>
        <p className="mt-1 text-xs leading-relaxed text-[#625d69]">
          Optional, per-device alert after a manually started briefing finishes. The notification does not include the company or person name and never starts a search.
        </p>
        {!configured && <p className="mt-2 text-sm font-semibold text-[#8e3f39]">Server push keys are not configured yet.</p>}
        {!supported && <p className="mt-2 text-sm font-semibold text-[#8e3f39]">This browser does not support web push.</p>}
        {hasAccountSubscription && !thisDeviceSubscribed && (
          <p className="mt-2 text-xs text-[#625d69]">A different device is subscribed to this account.</p>
        )}
      </div>
      {thisDeviceSubscribed ? (
        <button
          type="button"
          onClick={() => void disable()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#c98e87] bg-white px-4 py-2 text-sm font-semibold text-[#8e3f39] disabled:opacity-50"
          data-testid="button-disable-push-notifications"
        >
          <BellOff className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Updating…' : 'Turn off on this device'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy || !supported || !configured}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#292e46] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="button-enable-push-notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Updating…' : 'Enable on this device'}
        </button>
      )}
      {message && <p className="basis-full text-sm font-medium text-[#51476e]" role="status" aria-live="polite">{message}</p>}
    </section>
  );
}

function DailyBriefingEventLimitSettings({
  currentLimit,
  onSaved,
}: {
  currentLimit: number;
  onSaved: () => Promise<unknown> | unknown;
}) {
  const [dailyEventLimit, setDailyEventLimit] = useState(String(currentLimit));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDailyEventLimit(String(currentLimit));
  }, [currentLimit]);

  const saveLimit = async () => {
    setSaving(true);
    setMessage('');
    try {
      await sendAccountRequest('briefings/daily-event-limit', 'PUT', {
        dailyEventLimit: Number(dailyEventLimit),
      });
      await onSaved();
      setMessage(`Daily limit saved: ${dailyEventLimit} briefing event${dailyEventLimit === '1' ? '' : 's'} per day.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The daily limit could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#ded9e2] bg-white/80 p-4" aria-label="Daily briefing event limit" data-testid="daily-event-limit-settings">
      <div className="min-w-[12rem] flex-1">
        <label htmlFor="daily-event-limit" className="text-sm font-semibold text-[#35364a]">Daily briefing events</label>
        <p className="mt-1 text-xs leading-relaxed text-[#625d69]">Each signed-in account can choose 1–10 complete briefing events per calendar day (default 10). One event covers all selected topics and the resulting brief; the count resets at midnight IST.</p>
      </div>
      <select
        id="daily-event-limit"
        value={dailyEventLimit}
        onChange={(event) => setDailyEventLimit(event.target.value)}
        className="h-11 rounded-lg border border-[#bdb6c9] bg-white px-3 text-base font-semibold text-[#292e46]"
        data-testid="select-daily-event-limit"
      >
        {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((limit) => (
          <option key={limit} value={limit}>{limit} event{limit === '1' ? '' : 's'}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => { void saveLimit(); }}
        disabled={saving || dailyEventLimit === String(currentLimit)}
        className="min-h-11 rounded-lg bg-[#292e46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#414765] disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="button-save-daily-event-limit"
      >
        {saving ? 'Saving…' : 'Save daily limit'}
      </button>
      {message && <p className="basis-full text-sm font-medium text-[#51476e]" role="status" data-testid="daily-event-limit-message">{message}</p>}
    </section>
  );
}

async function sendGuardrailRequest(path: string, method: string, body?: unknown) {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    cancelledActiveSummaries?: number;
  };
  if (!response.ok) throw new Error(payload.error ?? 'The AI access request failed.');
  return payload;
}

type TavilyCredentialStatus = {
  connected: boolean;
  storageReady: boolean;
  updatedAt: string | null;
};

type TelegramCredentialStatus = {
  connected: boolean;
  storageReady: boolean;
  chatId: string | null;
  updatedAt: string | null;
  limit: number;
  usedThisHour: number;
  remaining: number;
  windowResetsAt: string | null;
};

function TavilyKeySettings({ onChanged, projectKeyActive }: { onChanged: () => void; projectKeyActive: boolean }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [status, setStatus] = useState<TavilyCredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const refreshStatus = useCallback(async () => {
    const payload = await sendAccountRequest('tavily-credentials', 'GET') as TavilyCredentialStatus;
    setStatus(payload);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setStatus(null);
      setApiKey('');
      setMessage('');
      setConfirmRemove(false);
      return;
    }
    let active = true;
    setStatus(null);
    setApiKey('');
    setMessage('');
    setConfirmRemove(false);
    void sendAccountRequest('tavily-credentials', 'GET')
      .then((payload) => {
        if (active) setStatus(payload as TavilyCredentialStatus);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : 'Tavily connection status could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, user?.id]);

  const saveKey = async () => {
    setMessage('');
    if (apiKey.trim().length < 20 || apiKey.trim().length > 4096) {
      setMessage('Enter a valid Tavily API key.');
      return;
    }
    setBusy(true);
    try {
      await sendAccountRequest('tavily-credentials', 'PUT', { apiKey: apiKey.trim() });
      setApiKey('');
      setMessage('Saved. The app cleared the field; your key is stored encrypted on the server for this account.');
      await refreshStatus();
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The Tavily key could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setMessage('');
    setBusy(true);
    try {
      await sendAccountRequest('tavily-credentials', 'DELETE');
      setApiKey('');
      setConfirmRemove(false);
      setMessage('The saved copy was deleted from this app. Revoke the key at Tavily too if you want it disabled.');
      await refreshStatus();
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The Tavily key could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  if (!isLoaded || !isSignedIn) return null;

  return (
    <section className="mb-5 rounded-xl border border-[#ded9e2] bg-[#f8f6fb] p-5 sm:p-6" aria-label="Tavily account key" data-testid="tavily-key-settings">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-[#292e46]">Tavily key and usage</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#625d69]">
            A personal key is sent to this app’s server and encrypted before it is saved to your account. The app does not persist it in browser storage or return it to the page, and the entry field clears after saving. Your Tavily account pays for searches using this key.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${projectKeyActive || status?.connected ? 'bg-[#e8f3eb] text-[#32634a]' : 'bg-[#f3eee3] text-[#7b6338]'}`} data-testid="tavily-key-status">
          {projectKeyActive ? 'Project key active' : status?.connected ? 'Personal key connected' : 'Not connected'}
        </span>
      </div>
      {projectKeyActive && (
        <p className="mt-4 rounded-lg border border-[#c7dfd2] bg-[#edf6f0] px-4 py-3 text-sm leading-relaxed text-[#32634a]" role="status" data-testid="project-tavily-key-notice">
          This account is using the project key, not a saved personal key. Only the configured owner account can use that project key; other accounts cannot.
          {status?.connected ? ' Your personal key is also saved, but it is not active while the project key takes priority.' : ''}
          {' '}Removing a personal key here will not disable the project key. To disable the project key, remove it from the server’s Replit Secrets and revoke it in Tavily.
        </p>
      )}
      {!status?.storageReady && (
        <p className="mt-4 rounded-lg border border-[#e5c5c0] bg-[#fbefed] px-4 py-3 text-sm leading-relaxed text-[#7f413b]" role="status">
          Secure key storage is not configured on the server yet. You cannot save a key until the app owner configures it.
        </p>
      )}
      <p className="mt-4 rounded-lg border border-[#e5c5c0] bg-[#fff8f7] px-4 py-3 text-sm leading-relaxed text-[#713c38]" role="note" data-testid="tavily-key-trust-boundary">
        <span className="font-semibold">Trust boundary:</span> this is server-side encryption, not end-to-end encryption. The server decrypts the key to search, so an app operator with access to both the database and server encryption secret could decrypt saved keys. Save a key only if you trust the operator.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        <a href="https://app.tavily.com/home" target="_blank" rel="noopener noreferrer" className="text-[#594b87] underline underline-offset-2" data-testid="link-tavily-key-dashboard">
          Manage or delete keys at Tavily
        </a>
        <a href="https://help.tavily.com/articles/4695639825-how-can-i-delete-my-api-key" target="_blank" rel="noopener noreferrer" className="text-[#594b87] underline underline-offset-2" data-testid="link-tavily-key-revocation-help">
          Tavily’s key deletion instructions
        </a>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="mb-1.5 block text-sm font-medium text-[#35364a]">API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            minLength={20}
            maxLength={4096}
            placeholder={status?.connected ? 'Enter a replacement key' : 'Paste your Tavily API key'}
            aria-label="Your Tavily API key"
            className="h-12 w-full min-w-0 rounded-lg border border-[#d9d4df] bg-white px-4 text-base text-foreground placeholder:text-[#898392] focus:border-[#594b87] focus:outline-none focus:ring-2 focus:ring-[#594b87]/20"
            data-testid="input-user-tavily-key"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void saveKey()}
            disabled={busy || !status?.storageReady || apiKey.trim().length < 20}
            className="h-12 rounded-lg bg-[#292e46] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="button-save-user-tavily-key"
          >
            {busy ? 'Saving…' : 'Save key'}
          </button>
          {status?.connected && !confirmRemove && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              className="h-12 rounded-lg border border-[#c98e87] bg-white px-4 text-sm font-semibold text-[#8e3f39] disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="button-remove-user-tavily-key"
            >
              Remove saved key
            </button>
          )}
        </div>
      </div>
      {confirmRemove && (
        <div className="mt-4 rounded-lg border border-[#e4b7b2] bg-[#fff8f7] p-4" role="alert" data-testid="confirm-remove-tavily-key">
          <p className="text-sm font-semibold text-[#713c38]">Remove the saved copy from this app?</p>
          <p className="mt-1 text-sm leading-relaxed text-[#713c38]">
            This deletes the encrypted copy from your app account. It does not disable the key at Tavily. Use the Tavily links above to delete the provider key first, then remove the saved copy here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy} className="h-10 rounded-lg border border-[#d9d4df] bg-white px-4 text-sm font-semibold text-[#35364a]" data-testid="button-cancel-remove-user-tavily-key">
              Keep key
            </button>
            <button type="button" onClick={() => void removeKey()} disabled={busy} className="h-10 rounded-lg bg-[#8e3f39] px-4 text-sm font-semibold text-white disabled:opacity-50" data-testid="button-confirm-remove-user-tavily-key">
              {busy ? 'Removing…' : 'Delete saved copy'}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-3 text-sm text-[#4e4957]" role="status" aria-live="polite" data-testid="status-tavily-key-message">{message}</p>}
    </section>
  );
}

function TelegramSettings() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [status, setStatus] = useState<TelegramCredentialStatus | null>(null);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const refreshStatus = useCallback(async () => {
    const payload = await sendAccountRequest('telegram-credentials', 'GET') as TelegramCredentialStatus;
    setStatus(payload);
    setAccessDenied(false);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setStatus(null);
      setBotToken('');
      setChatId('');
      setMessage('');
      setAccessDenied(false);
      return;
    }
    let active = true;
    setStatus(null);
    setBotToken('');
    setChatId('');
    setMessage('');
    setAccessDenied(false);
    void sendAccountRequest('telegram-credentials', 'GET')
      .then((payload) => {
        if (active) setStatus(payload as TelegramCredentialStatus);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const text = error instanceof Error ? error.message : 'Telegram settings could not be loaded.';
        setMessage(text);
        setAccessDenied(text.includes('configured briefing owner'));
      });
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, user?.id]);

  const saveConnection = async () => {
    setBusy(true);
    setMessage('');
    try {
      const payload = await sendAccountRequest('telegram-credentials', 'PUT', {
        botToken: botToken.trim(),
        chatId: chatId.trim(),
      }) as TelegramCredentialStatus;
      setStatus(payload);
      setBotToken('');
      setChatId('');
      setMessage('Saved encrypted on the server. The bot token is not sent back to this page.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Telegram setup could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await sendAccountRequest('telegram-credentials/test', 'POST', {}) as {
        connected: boolean;
        botName: string | null;
        chatId: string;
        message: string;
      };
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Telegram connection test failed.');
    } finally {
      setBusy(false);
    }
  };

  const removeConnection = async () => {
    setBusy(true);
    setMessage('');
    try {
      const payload = await sendAccountRequest('telegram-credentials', 'DELETE') as TelegramCredentialStatus;
      setStatus(payload);
      setConfirmRemove(false);
      setMessage('The saved token and chat ID were deleted from this app. Revoke the token with BotFather to disable the bot.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Telegram connection could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  if (!isLoaded || !isSignedIn) return null;

  return (
    <section className="mt-4 rounded-xl border border-[#d9d5e1] bg-[#f7f5fa] p-4 sm:p-5" aria-label="Telegram PDF delivery setup" data-testid="telegram-settings">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-[#292e46]">Telegram PDF delivery</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#625d69]">
            Enter a BotFather token and the destination chat ID. Start the bot chat with <strong>/start</strong> first. Telegram sends only when you press the PDF button; this setup does not run a crawl or use Tavily.
          </p>
        </div>
        {status && (
          <span className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${status.connected ? 'bg-[#e8f3eb] text-[#32634a]' : 'bg-[#f3eee3] text-[#7b6338]'}`}>
            {status.connected ? 'Bot connected' : 'Not connected'}
          </span>
        )}
      </div>

      {accessDenied ? (
        <p className="mt-3 rounded-lg border border-[#e5c5c0] bg-[#fbefed] px-4 py-3 text-sm leading-relaxed text-[#7f413b]" role="status">
          Telegram setup is restricted to the configured briefing owner.
        </p>
      ) : !status ? (
        <p className="mt-3 text-sm text-[#625d69]" role="status">Checking owner access and secure storage…</p>
      ) : (
        <>
          {!status.storageReady && (
            <p className="mt-3 rounded-lg border border-[#e5c5c0] bg-[#fbefed] px-4 py-3 text-sm leading-relaxed text-[#7f413b]" role="alert">
              Secure credential storage is not configured on the server. Telegram credentials cannot be saved until the server encryption secret is available.
            </p>
          )}
          <p className="mt-3 rounded-lg border border-[#e6d6b7] bg-[#fff9ed] px-4 py-3 text-sm leading-relaxed text-[#72582c]" role="note">
            The token is encrypted at rest and never returned to the browser. This is server-side encryption, not end-to-end encryption. Deleting it here removes this app’s copy; use <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">BotFather</a> to revoke or regenerate the actual bot token.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-[#35364a]">Bot token</span>
              <input
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder={status.connected ? 'Enter a replacement token' : 'Paste the BotFather token'}
                className="h-12 w-full min-w-0 rounded-lg border border-[#d9d4df] bg-white px-4 text-base text-foreground placeholder:text-[#898392] focus:border-[#594b87] focus:outline-none focus:ring-2 focus:ring-[#594b87]/20"
                data-testid="input-telegram-bot-token"
              />
            </label>
            <label className="min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-[#35364a]">Private chat ID</span>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={chatId}
                onChange={(event) => setChatId(event.target.value)}
                placeholder={status.chatId ?? 'Enter the destination chat ID'}
                className="h-12 w-full min-w-0 rounded-lg border border-[#d9d4df] bg-white px-4 text-base text-foreground placeholder:text-[#898392] focus:border-[#594b87] focus:outline-none focus:ring-2 focus:ring-[#594b87]/20"
                data-testid="input-telegram-chat-id"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveConnection()}
              disabled={busy || !status.storageReady || botToken.trim().length < 30 || !chatId.trim()}
              className="h-12 rounded-lg bg-[#292e46] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="button-save-telegram-credentials"
            >
              {busy ? 'Saving…' : 'Save Telegram'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status.connected && (
              <>
                <button
                  type="button"
                  onClick={() => void testConnection()}
                  disabled={busy}
                  className="h-10 rounded-lg border border-[#d9d4df] bg-white px-4 text-sm font-semibold text-[#35364a] disabled:opacity-50"
                  data-testid="button-test-telegram"
                >
                  Test bot and chat
                </button>
                {!confirmRemove ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    disabled={busy}
                    className="h-10 rounded-lg border border-[#c98e87] bg-white px-4 text-sm font-semibold text-[#8e3f39] disabled:opacity-50"
                    data-testid="button-remove-telegram"
                  >
                    Remove saved connection
                  </button>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[#e4b7b2] bg-[#fff8f7] p-2">
                    <span className="px-1 text-sm text-[#713c38]">Delete the saved copy?</span>
                    <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy} className="h-9 rounded-md border border-[#d9d4df] bg-white px-3 text-sm font-semibold text-[#35364a]">
                      Keep it
                    </button>
                    <button type="button" onClick={() => void removeConnection()} disabled={busy} className="h-9 rounded-md bg-[#8e3f39] px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="button-confirm-remove-telegram">
                      Delete
                    </button>
                  </span>
                )}
                <span className="text-sm text-[#625d69]" data-testid="text-telegram-hourly-quota">
                  {status.remaining} of {status.limit} PDF sends left this rolling hour
                </span>
              </>
            )}
          </div>
        </>
      )}
      {message && <p className="mt-3 text-sm text-[#4e4957]" role="status" aria-live="polite" data-testid="status-telegram-settings">{message}</p>}
    </section>
  );
}

function AuthActions() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded) return <span className="font-mono text-[9px] uppercase tracking-[.12em] text-[#898392]">Checking account</span>;
  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <a href={`${basePath}/sign-in`} className="font-mono text-[9px] uppercase tracking-[.12em] text-[#6b627d] underline underline-offset-4">Sign in</a>
        <a href={`${basePath}/sign-up`} className="rounded-lg bg-[#292e46] px-3 py-2 font-mono text-[9px] uppercase tracking-[.12em] text-white">Create account</a>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span className="max-w-32 truncate font-mono text-[9px] text-[#71658e]">{user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}</span>
      <button type="button" onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="font-mono text-[9px] uppercase tracking-[.12em] text-[#6b627d] underline underline-offset-4">Sign out</button>
    </div>
  );
}

function AiGuardrailPanel({ onStatusChange }: { onStatusChange?: (status: AiGuardrailsStatus | null) => void }) {
  const { isLoaded, isSignedIn } = useUser();
  const [status, setStatus] = useState<AiGuardrailsStatus | null>(null);
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen3:0.6b');
  const [ollamaToken, setOllamaToken] = useState('');
  const connectionInitialized = useRef(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(apiUrl('ai/guardrails'), { credentials: 'include' });
    const payload = await response.json().catch(() => ({})) as AiGuardrailsStatus & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Could not load AI guardrails.');
    setStatus(payload);
    if (!connectionInitialized.current) {
      setOllamaEndpoint(payload.providerEndpoint || 'http://127.0.0.1:11434');
      setOllamaModel(payload.model || 'qwen3:0.6b');
      connectionInitialized.current = true;
    }
    onStatusChange?.(payload);
    return payload;
  }, [onStatusChange]);

  const testOllamaConnection = async () => {
    setBusy(true);
    setMessage('');
    try {
      const freshStatus = await refreshStatus();
      setMessage(
        freshStatus.aiProviderConnected
          ? `Connected to ${freshStatus.model ?? 'the selected model'} at ${freshStatus.providerEndpoint ?? 'the configured endpoint'}.`
          : `${freshStatus.aiProviderMessage ?? 'Ollama is unavailable.'} Source-only briefs remain available.`,
      );
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : 'Ollama connection could not be tested.'} Source-only briefs remain available.`,
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setStatus(null);
      setOllamaEndpoint('http://127.0.0.1:11434');
      setOllamaModel('qwen3:0.6b');
      setOllamaToken('');
      connectionInitialized.current = false;
      onStatusChange?.(null);
      return;
    }
    void refreshStatus().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load AI settings.');
    });
  }, [isLoaded, isSignedIn, onStatusChange, refreshStatus]);

  const savePasscode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    if (!/^\d{4}$/.test(passcode)) {
      setMessage('Use a four-digit PIN for both crawl starts and AI activation.');
      return;
    }
    if (passcode !== confirmPasscode) {
      setMessage('The passcodes do not match.');
      return;
    }
    setBusy(true);
    try {
      await sendGuardrailRequest('ai/guardrails/passcode', 'PUT', { passcode });
      setConfirmPasscode('');
      setMessage('Your account PIN is saved for Tavily crawl starts and AI activation.');
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The passcode could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const saveOllamaConnection = async () => {
    setBusy(true);
    setMessage('');
    try {
      await sendGuardrailRequest('ai/guardrails/connection', 'PUT', {
        baseUrl: ollamaEndpoint,
        model: ollamaModel,
        ...(ollamaToken ? { authToken: ollamaToken } : {}),
      });
      setOllamaToken('');
      setMessage('Your Ollama connection was saved securely for this account. Test it before activating AI.');
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The Ollama connection could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const removeOllamaConnection = async () => {
    if (!window.confirm('Remove this account’s saved Ollama endpoint and encrypted connection token?')) return;
    setBusy(true);
    setMessage('');
    try {
      await sendGuardrailRequest('ai/guardrails/connection', 'DELETE');
      setOllamaToken('');
      setMessage('The saved Ollama connection was removed from this account.');
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The Ollama connection could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    setMessage('');
    try {
      await sendGuardrailRequest('ai/guardrails/activate', 'POST', { passcode });
      setPasscode('');
      setMessage('AI guardrail activated for this account.');
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI could not be activated.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await sendGuardrailRequest('ai/guardrails/deactivate', 'POST');
      setPasscode('');
      setMessage(
        result.cancelledActiveSummaries
          ? 'AI access stopped; active Qwen summaries were cancelled. Ollama itself remains running.'
          : 'AI access stopped; no Qwen summary was running.',
      );
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI access could not be stopped.');
    } finally {
      setBusy(false);
    }
  };

  if (!isLoaded || !isSignedIn) return null;
  return (
    <details open className="no-print mt-4 rounded-xl border border-[#ded9e2] bg-[#f8f6fb] px-4 py-3" aria-label="AI activation guardrails" data-testid="ai-guardrails">
      <summary className="cursor-pointer text-base font-semibold text-[#35364a]" data-testid="summary-ai-guardrails">
        AI control <span className={`ml-2 rounded-full border px-3 py-1 text-sm font-bold text-white ${status?.activated ? 'border-[#218752] bg-[#218752]' : 'border-[#e4b7b2] bg-[#bb5048]'}`}>{status?.activated ? 'ACTIVE · OPT-IN' : 'STOPPED · AI OFF'}</span>
      </summary>
      <div className="pt-3 text-base">
      <p className="leading-relaxed text-muted-foreground">
        AI is optional; public crawling and the source-based brief work with AI off. When enabled, the app makes at most {status?.requestsPerTab ?? AI_REQUESTS_PER_TAB} summary request per selected topic and keeps the combined speech text under a {Math.floor((status?.speechLimitSeconds ?? AI_SPEECH_LIMIT_SECONDS) / 60)}-minute limit.
      </p>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        Qwen starts only after Tavily finishes and source checks pass. It skips topics without a stable, linked source. Each signed-in account is limited to {status?.qwenRequestLimit ?? 5} topic requests per {Math.round((status?.qwenRequestWindowSeconds ?? 300) / 60)} minutes; all summaries for one brief share a {status?.qwenBriefWordLimit ?? 400}-word maximum. Each request stops after {status?.qwenRequestTimeoutSeconds ?? 26} seconds, with a {status?.qwenBatchBackupSeconds ?? 120}-second backup stop. Ollama unloads the local model after {status?.qwenModelIdleUnloadSeconds ?? 26} seconds idle.
      </p>
      {status ? (
        <>
          <div className={`mt-3 rounded-lg border px-4 py-3 text-sm leading-relaxed ${status.aiProviderConnected ? 'border-[#c7dfd2] bg-[#edf6f0] text-[#32634a]' : 'border-[#e5c5c0] bg-[#fbefed] text-[#7f413b]'}`} data-testid="ollama-provider-settings">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold" role="status" data-testid="ollama-provider-status">
                {status.aiProviderConnected
                  ? `Ollama connected · ${status.model ?? 'model ready'}`
                  : 'Ollama is offline or the model is missing'}
              </p>
              <span className="rounded-full border border-current/20 bg-white/70 px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
                Local model
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide">
                Ollama endpoint
                <input
                  aria-label="Ollama endpoint"
                  value={ollamaEndpoint}
                  onChange={(event) => setOllamaEndpoint(event.target.value)}
                  placeholder="http://127.0.0.1:11434"
                  className="h-10 w-full rounded-lg border border-[#c8d7d1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#292e46]"
                  data-testid="input-ollama-host"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide">
                Model name
                <input
                  aria-label="Ollama model"
                  value={ollamaModel}
                  onChange={(event) => setOllamaModel(event.target.value)}
                  placeholder="qwen3:0.6b"
                  className="h-10 w-full rounded-lg border border-[#c8d7d1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#292e46]"
                  data-testid="input-ollama-model"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide sm:col-span-2">
                Remote endpoint bearer token (required for remote endpoints)
                <input
                  aria-label="Ollama bearer token"
                  type="password"
                  autoComplete="new-password"
                  value={ollamaToken}
                  onChange={(event) => setOllamaToken(event.target.value)}
                  placeholder="Enter token; it is never shown again"
                  className="h-10 w-full rounded-lg border border-[#c8d7d1] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#292e46]"
                  data-testid="input-ollama-token"
                />
              </label>
            </div>
            <p className="mt-2 text-sm text-[#32634a]">
              Each account has its own encrypted connection. A local clone can use <code>http://127.0.0.1:11434</code>; remote endpoints must use HTTPS and a bearer token. Do not use an endpoint you do not control.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveOllamaConnection()} disabled={busy || !ollamaEndpoint.trim() || !ollamaModel.trim()} className="h-10 rounded-lg bg-[#292e46] px-4 text-sm font-semibold text-white disabled:opacity-50" data-testid="button-save-ollama">Save my connection</button>
              <button type="button" onClick={() => void testOllamaConnection()} disabled={busy || !status.providerEndpoint} className="h-10 rounded-lg bg-[#2d7555] px-4 text-sm font-semibold text-white disabled:opacity-50" data-testid="button-test-ollama">{busy ? 'Testing…' : 'Test saved connection'}</button>
              <button type="button" onClick={() => void removeOllamaConnection()} disabled={busy || !status.providerEndpoint} className="h-10 rounded-lg border border-[#d7b3ae] bg-[#fbefed] px-4 text-sm font-semibold text-[#98453e] disabled:opacity-50" data-testid="button-remove-ollama">Remove connection</button>
            </div>
            {!status.aiProviderConnected && status.aiProviderMessage && (
              <p className="mt-2 font-medium" role="status">{status.aiProviderMessage}</p>
            )}
            <p className="mt-1">Only the subject, selected topic, and accepted public-source titles and snippets are sent to Ollama. SAP and private records are not sent.</p>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">AI may misstate evidence; check each linked source before relying on a summary.</p>
          <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={savePasscode}>
            <input
              aria-label="Four-digit account PIN"
              autoComplete="off"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={passcode}
              onChange={(event) => setPasscode(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Four-digit PIN"
              className="h-11 min-w-0 rounded-lg border border-[#d8d1e5] bg-white px-3 text-base text-[#292e46] outline-none focus:ring-2 focus:ring-[#887ba7]"
            />
            <input
              aria-label="Confirm four-digit account PIN"
              autoComplete="off"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={confirmPasscode}
              onChange={(event) => setConfirmPasscode(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Confirm PIN"
              className="h-11 min-w-0 rounded-lg border border-[#d8d1e5] bg-white px-3 text-base text-[#292e46] outline-none focus:ring-2 focus:ring-[#887ba7]"
            />
            <button type="submit" disabled={busy || passcode.length !== 4 || confirmPasscode.length !== 4} className="h-11 rounded-lg bg-[#292e46] px-4 text-base font-semibold text-white disabled:opacity-50">Save PIN</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void activate()} disabled={busy || !status.serverEnabled || !status.passcodeConfigured || !status.aiProviderConnected || !passcode} className="h-11 rounded-lg border border-[#d7b3ae] bg-[#fbefed] px-4 text-base font-semibold text-[#98453e] disabled:cursor-not-allowed disabled:opacity-50">Activate AI</button>
            <button type="button" onClick={() => void deactivate()} disabled={busy || !status.activated} className="h-11 rounded-lg border border-[#d8d1e5] bg-white px-4 text-base font-semibold text-[#443a66] disabled:cursor-not-allowed disabled:opacity-50">Stop AI</button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Stop AI blocks future summaries and cancels any Qwen summaries already running for this account. The Ollama service remains running.</p>
          {!status.serverEnabled && <p className="mt-2 text-[#98453e]">The server switch is off. No AI request can run.</p>}
          {!status.aiProviderConnected && <p className="mt-1 text-muted-foreground">Start Ollama on this computer and install the selected model before activating AI. Your factual, source-linked brief still works without it.</p>}
        </>
      ) : (
        <p className="mt-2 text-[#98453e]" role="status">{message || 'AI access settings are unavailable.'}</p>
      )}
      {message && status && <p className="mt-2 text-muted-foreground" role="status">{message}</p>}
      </div>
    </details>
  );
}

function personRoleLabel(role: PersonRole | null | undefined) {
  return PERSON_ROLES.find((option) => option.value === role)?.label ?? '';
}

function personContextLabel(
  role: PersonRole | null | undefined,
  publicRoleTitle?: string | null,
  companyName?: string | null,
) {
  if (role === 'mp') return `Government · ${publicRoleTitle || 'MP'}`;
  if (role === 'business_owner') return `${personRoleLabel(role)} · ${companyName || 'Company not set'}`;
  if (role === 'corporate') return 'Corporate · Private entity';
  return '';
}

function speechText(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const capped = words.slice(0, SPEECH_WORD_LIMIT).join(' ');
  return {
    text: capped,
    words: Math.min(words.length, SPEECH_WORD_LIMIT),
    totalWords: words.length,
    clipped: words.length > SPEECH_WORD_LIMIT,
  };
}

function isVideoSource(source: BriefSource) {
  return /(?:youtube\.com|youtu\.be|vimeo\.com|\.mp4(?:$|\?)|\.webm(?:$|\?)|\.ogg(?:$|\?))/i.test(`${source.url} ${source.title}`);
}

function playableVideoUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return `https://www.youtube-nocookie.com/embed/${parsed.pathname.slice(1)}`;
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v') ?? parsed.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const id = parsed.pathname.match(/\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!value) return 'Date not provided';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatWindow(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${formatDate(start, { dateStyle: 'medium' })} — ${formatDate(end, { dateStyle: 'medium' })}`;
  }
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const startLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(startDate);
  const endLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(endDate);
  return `${startLabel} — ${endLabel}`;
}

function References({ sourceIds, sources }: { sourceIds: string[]; sources: BriefSource[] }) {
  if (!sourceIds.length) return null;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1.5 align-middle" aria-label="Source references">
      {sourceIds.map((id) => {
        const source = sourceById.get(id);
        return source ? (
          <a key={id} className="reference-pill" href={`#source-${encodeURIComponent(id)}`} aria-label={`Open source: ${source.title}`} title={source.title} data-testid={`link-reference-${encodeURIComponent(id)}`}>
            {id}
          </a>
        ) : (
          <span key={id} className="reference-pill" title="This source is not included in the returned source list">{id}</span>
        );
      })}
    </span>
  );
}

function SourceList({ sources }: { sources: BriefSource[] }) {
  if (!sources.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">No source links passed the checks for this briefing.</p>
        <div className="source-video video-placeholder" data-testid="video-source-empty" role="status">
          No related video was returned for the selected topics.
        </div>
      </div>
    );
  }
  const hasVideoSource = sources.some(isVideoSource);
  return (
    <div>
      {!hasVideoSource && (
        <div className="source-video video-placeholder mb-4" data-testid="video-source-empty" role="status">
          No related video was returned for the selected topics.
        </div>
      )}
      <ol className="divide-y divide-border/80">
        {sources.map((source, index) => (
          <li id={`source-${encodeURIComponent(source.id)}`} key={source.id} className="scroll-mt-8 py-5 first:pt-1 last:pb-1" data-testid={`source-entry-${index + 1}`}>
          <div className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d8d1e5] bg-[#f1eef7] font-mono text-[11px] text-[#594b87]">{source.id}</span>
            <div className="min-w-0 flex-1">
              <a href={source.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1.5 text-[15px] font-semibold leading-snug text-foreground decoration-[#8a7bb0] underline-offset-4 hover:underline" data-testid={`link-source-title-${index + 1}`}>
                <span>{source.title}</span><ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </a>
              {source.affiliatedCompanyReport && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[.12em] text-[#655b7a]" data-testid={`source-affiliated-company-${index + 1}`}>
                  Company-level report
                </p>
              )}
              {isVideoSource(source) && (
                <div className="source-video mt-4" data-testid={`source-video-${index + 1}`}>
                  {playableVideoUrl(source.url) ? (
                    <iframe
                      src={playableVideoUrl(source.url) ?? undefined}
                      title={`Video source: ${source.title}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  ) : /\.(?:mp4|webm|ogg)(?:$|\?)/i.test(source.url) ? (
                    <video controls preload="metadata" aria-label={`Play video: ${source.title}`}>
                      <source src={source.url} />
                    </video>
                  ) : (
                    <a className="video-link" href={source.url} target="_blank" rel="noreferrer" data-testid={`link-play-video-${index + 1}`}>Open video source</a>
                  )}
                </div>
              )}
              {source.images?.[0] && (
                <a
                  className="source-photo-link mt-3"
                  href={source.images[0].url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open photo related to ${source.title}`}
                  data-testid={`link-source-photo-${index + 1}`}
                >
                  <img
                    className="source-photo"
                    src={source.images[0].url}
                    alt={source.images[0].description || `Photo related to ${source.title}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(event) => { event.currentTarget.hidden = true; }}
                  />
                </a>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span className="font-medium text-[#655b7a]">{source.publisher}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={source.publishedAt ?? undefined}>{formatDate(source.publishedAt, { dateStyle: 'medium' })}</time>
              </div>
              {source.snippet && <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">{source.snippet}</p>}
              <a className="mt-3 inline-flex max-w-full items-start gap-2 break-all text-sm text-[#594b87] underline decoration-[#c7bfd7] underline-offset-2 hover:text-primary" href={source.url} target="_blank" rel="noreferrer" aria-label={`Open URL for ${source.title}`} data-testid={`link-source-url-${index + 1}`}>
                <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="break-all">{source.url}</span>
              </a>
            </div>
          </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function speakBlock(text: string) {
  if (!('speechSynthesis' in window)) return;
  const { text: capped } = speechText(text);
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(capped);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function VoiceControls({ text }: { text: string }) {
  const estimate = speechText(text);
  const seconds = Math.ceil(estimate.words / 2.5);
  const hasText = Boolean(text.trim());
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="voice-controls">
      <span
        id="ai-voice-status"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4b7b2] bg-[#fbefed] px-4 text-sm font-bold text-[#98453e]"
        aria-label="AI voice is off; device read-aloud is available"
        data-testid="status-ai-off"
      >
        <span className="h-2 w-2 rounded-full bg-[#c45b50]" aria-hidden="true" /> AI voice off · device read-aloud
      </span>
      <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.speechSynthesis?.cancel()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4b7b2] bg-[#fbefed] px-4 text-sm font-semibold text-[#98453e] transition hover:bg-[#f7e1de]"
            data-testid="button-stop-speech"
          >
            <Square className="h-4 w-4 fill-current" aria-hidden="true" /> Stop
          </button>
          <button
            type="button"
            disabled={!hasText}
            onClick={() => speakBlock(text)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cde0d4] bg-[#edf6f0] px-4 text-sm font-semibold text-[#32634a] transition hover:bg-[#e2f0e7] disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="button-read-briefing"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" /> Read aloud
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#292e46] px-4 text-sm font-semibold text-white transition hover:bg-[#3c4160]"
            data-testid="button-print-brief"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Print brief
          </button>
      </div>
      <p className="basis-full text-sm leading-relaxed text-[#625d69]" data-testid="status-speech-estimate">
        {hasText
          ? `Device read-aloud: about ${seconds} seconds${estimate.clipped ? ' (limited to 2 minutes)' : ''}.`
          : 'Device read-aloud is available after a brief is prepared.'}
        <span className="sr-only"> {estimate.words} of {SPEECH_WORD_LIMIT} words spoken out of {estimate.totalWords}; {text.length} characters.</span>
      </p>
    </div>
  );
}

function linkedinJobsSearchUrl(subject: string, role: 'sales' | 'maintenance') {
  const url = new URL('https://www.linkedin.com/jobs/search/');
  url.searchParams.set('keywords', `${subject} ${role}`);
  return url.toString();
}

function TopicBlock({
  topic,
  title,
  highlights,
  questions,
  sources,
  openRoleSearchSubject,
  aiSummary,
}: {
  topic: Topic;
  title: string;
  highlights: BriefingResult['highlights'];
  questions?: BriefingResult['questions'];
  sources: BriefSource[];
  openRoleSearchSubject?: string;
  aiSummary?: BriefingResult['aiSummaries'][number];
}) {
  const [filter, setFilter] = useState('');
  const filteredHighlights = highlights.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(filter.toLowerCase()));
  const filteredQuestions = (questions ?? []).filter((item) => item.text.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section className="topic-block print-card mt-7 rounded-2xl border border-border bg-card px-5 py-5 sm:px-7" aria-labelledby={`topic-${topic}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionEyebrow>{TOPICS.find((item) => item.value === topic)?.label}</SectionEyebrow>
          <h3 id={`topic-${topic}`} className="mt-2 font-serif text-3xl text-foreground">{title}</h3>
        </div>
      </div>
      <label className="no-print relative mt-4 block max-w-sm">
        <span className="sr-only">Filter {title}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#81788d]" aria-hidden="true" />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={`Filter ${title.toLowerCase()}…`}
          className="h-9 w-full rounded-lg border border-[#ded9e2] bg-[#fffefa] pl-9 pr-3 text-xs focus:border-[#8c7dae] focus:outline-none"
          data-testid={`input-filter-${topic}`}
        />
      </label>
      {aiSummary && (
        <aside className="mt-4 rounded-xl border border-[#b8a9e5] bg-[#f4f0ff] px-4 py-4" aria-label={`AI summary for ${title}`} data-testid={`ai-summary-${topic}`}>
          <p className="text-xs font-bold uppercase tracking-[.12em] text-[#54447e]">AI-assisted summary · public sources</p>
          <p className="briefing-prose mt-2 text-base leading-relaxed text-[#37334a]">
            {aiSummary.summary}<References sourceIds={aiSummary.sourceIds} sources={sources} />
          </p>
        </aside>
      )}
      {filteredHighlights.length || filteredQuestions.length ? (
        <div className="mt-4 space-y-3">
          {filteredHighlights.map((item, index) => (
            <article key={`${item.title}-${index}`} className="rounded-xl border border-border/80 bg-[#fbfaf7] px-4 py-4" data-testid={`highlight-${topic}-${index + 1}`}>
              <h4 className="font-semibold leading-snug text-[#292d43]">{item.title}</h4>
            <p className="briefing-prose mt-2 text-base leading-[1.75] text-[#5f6070]">
                {item.summary}<References sourceIds={item.sourceIds} sources={sources} />
              </p>
            </article>
          ))}
          {filteredQuestions.map((question, index) => (
            <p key={`${question.text}-${index}`} className="briefing-prose border-t border-[#ded9e5] pt-3 text-base leading-relaxed text-[#454151]" data-testid={`question-${topic}-${index + 1}`}>
              {question.text}<References sourceIds={question.sourceIds} sources={sources} />
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground" data-testid={`empty-topic-${topic}`}>
          {filter
            ? 'No items match this filter.'
            : topic === 'hire'
              ? 'No confirmed-hire reports were returned by the public-news crawl.'
              : 'No items were returned in this category.'}
        </p>
      )}
      {openRoleSearchSubject && (
        <section className="mt-4 rounded-xl border border-[#d8d2df] bg-[#f8f6fb] px-4 py-4" aria-label="Open job searches" data-testid="open-role-searches">
          <h4 className="font-semibold text-[#292d43]">Open roles on LinkedIn</h4>
          <p className="mt-1 text-xs leading-relaxed text-[#65616d]">
            These are search shortcuts, not job listings collected by this app. Open a link to see LinkedIn’s current results; this app has not fetched or verified those postings.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={linkedinJobsSearchUrl(openRoleSearchSubject, 'sales')} target="_blank" rel="noreferrer" className="rounded-lg border border-[#d8d2df] bg-white px-3 py-2 text-xs font-semibold text-[#463b69] underline underline-offset-2" data-testid="link-linkedin-sales-openings">
              Sales openings
            </a>
            <a href={linkedinJobsSearchUrl(openRoleSearchSubject, 'maintenance')} target="_blank" rel="noreferrer" className="rounded-lg border border-[#d8d2df] bg-white px-3 py-2 text-xs font-semibold text-[#463b69] underline underline-offset-2" data-testid="link-linkedin-maintenance-openings">
              Maintenance openings
            </a>
          </div>
        </section>
      )}
    </section>
  );
}

function SapDataSection({
  items,
  sources,
}: {
  items: BriefingResult['sapData'];
  sources: BriefSource[];
}) {
  return (
    <section className="print-card mt-6 rounded-2xl border border-[#c2ddda] bg-[#f5faf9] px-5 py-5 sm:px-7" aria-labelledby="sap-data-heading" data-testid="sap-data-section">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionEyebrow>SAP S/4HANA · internal records</SectionEyebrow>
          <h3 id="sap-data-heading" className="mt-2 font-serif text-2xl text-[#245d5b]">SAP Data</h3>
        </div>
        <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-semibold text-[#245d5b]">
          {items.length} cited records
        </span>
      </div>
      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <article key={`${item.area}-${item.recordId}-${index}`} className="rounded-xl border border-[#d5e4e2] bg-white px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h4 className="font-semibold text-[#292e46]">
                  {SAP_AREAS.find((area) => area.value === item.area)?.label ?? item.area}: {item.title}
                </h4>
                <time className="text-xs text-[#625d69]" dateTime={item.recordedAt}>{formatDate(item.recordedAt)}</time>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[#514e5c]">
                {item.detail}
                <References sourceIds={item.sourceIds} sources={sources} />
              </p>
              <p className="mt-1 text-xs text-[#777280]">SAP record {item.recordId}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-[#d5e4e2] bg-white px-4 py-3 text-base leading-relaxed text-[#625d69]" role="status">
          No matching SAP records were returned for the selected areas and 30-day window.
        </p>
      )}
    </section>
  );
}

function BriefingDocument({ result }: { result: BriefingResult }) {
  const [copied, setCopied] = useState(false);
  const [activeTopic, setActiveTopic] = useState<'all' | Topic>('all');
  const [telegramStatus, setTelegramStatus] = useState<TelegramCredentialStatus | null>(null);
  const [telegramSending, setTelegramSending] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');
  const visibleTopics = result.topics.filter((topic) => activeTopic === 'all' || activeTopic === topic);
  const activeTopicBrief = activeTopic === 'all'
    ? undefined
    : result.topicBriefs.find((brief) => brief.category === activeTopic);
  const visibleOverview = activeTopicBrief ?? result.overview;
  const visibleHighlights = activeTopic === 'all'
    ? result.highlights
    : result.highlights.filter((item) => item.category === activeTopic);
  const visibleQuestions = activeTopic === 'all' || activeTopic === 'risk'
    ? result.questions
    : [];
  const openRoleSearchSubject = result.subjectType === 'company'
    ? result.subject
    : result.personRole === 'business_owner' && result.companyName
      ? result.companyName
      : undefined;

  useEffect(() => {
    setActiveTopic('all');
  }, [result.generatedAt]);

  useEffect(() => {
    let active = true;
    setTelegramStatus(null);
    void sendAccountRequest('telegram-credentials', 'GET')
      .then((payload) => {
        if (active) setTelegramStatus(payload as TelegramCredentialStatus);
      })
      .catch((error: unknown) => {
        if (active) setTelegramMessage(error instanceof Error ? error.message : 'Telegram status could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [result.generatedAt]);

  const copyBrief = async () => {
    const visibleSourceIds = new Set([
      ...visibleOverview.sourceIds,
      ...visibleOverview.topPositive.sourceIds,
      ...visibleOverview.topNegative.sourceIds,
      ...visibleHighlights.flatMap((item) => item.sourceIds),
      ...visibleQuestions.flatMap((item) => item.sourceIds),
      ...result.sapData.flatMap((item) => item.sourceIds),
    ]);
    const visibleSources = activeTopic === 'all'
      ? result.sources
      : result.sources.filter((source) => visibleSourceIds.has(source.id));
    const lines = [
      `${result.subject} — ${activeTopic === 'all' ? 'meeting briefing' : `${TOPICS.find((topic) => topic.value === activeTopic)?.label ?? 'Topic'} briefing`}`,
      result.meetingAt
        ? `Meeting: ${formatDate(result.meetingAt)}`
        : `Prepared: ${formatDate(result.generatedAt)}`,
      `Crawl started: ${formatDate(result.generatedAt)}`,
      `Research window: ${formatWindow(result.windowStart, result.windowEnd)}`,
      ...(result.sourceMode === 'sap' ? [
        `Sources: Tavily public research + SAP S/4HANA · ${result.sapAreas.map((area) => SAP_AREAS.find((item) => item.value === area)?.label ?? area).join(', ')}`,
        `Tavily: ${result.searchCreditsUsed === null ? 'usage not reported' : `${result.searchCreditsUsed} credits`} · ${result.topics.length} topic searches`,
        `SAP: ${result.sourceSearchesCompleted} read-only area requests`,
      ] : []),
      ...(result.personRole ? [`Briefing context: ${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)}`] : []),
      '',
      'OVERVIEW',
      `${visibleOverview.text}${visibleOverview.sourceIds.length ? ` [${visibleOverview.sourceIds.join(', ')}]` : ''}`,
      ...(result.sourceMode === 'sap' ? [] : [
        `TOP POSITIVE: ${visibleOverview.topPositive.text}${visibleOverview.topPositive.sourceIds.length ? ` [${visibleOverview.topPositive.sourceIds.join(', ')}]` : ''}`,
        `TOP NEGATIVE: ${visibleOverview.topNegative.text}${visibleOverview.topNegative.sourceIds.length ? ` [${visibleOverview.topNegative.sourceIds.join(', ')}]` : ''}`,
      ]),
      '',
      ...(result.sourceMode === 'sap'
        ? [
            'SAP DATA',
            ...result.sapData.map((item) => `${SAP_AREAS.find((area) => area.value === item.area)?.label ?? item.area} · ${item.title}: ${item.detail} [${item.sourceIds.join(', ')}]`),
            '',
          ]
        : []),
      'HIGHLIGHTS',
      ...visibleHighlights.flatMap((item) => [`${item.category.toUpperCase()}: ${item.title}`, `${item.summary}${item.sourceIds.length ? ` [${item.sourceIds.join(', ')}]` : ''}`, '']),
      ...(openRoleSearchSubject && result.topics.includes('hire') && (activeTopic === 'all' || activeTopic === 'hire')
        ? [
            'OPEN ROLE SEARCHES — links only; this app has not fetched or verified job listings',
            `Sales: ${linkedinJobsSearchUrl(openRoleSearchSubject, 'sales')}`,
            `Maintenance: ${linkedinJobsSearchUrl(openRoleSearchSubject, 'maintenance')}`,
            '',
          ]
        : []),
      'QUESTIONS TO CONSIDER',
      ...visibleQuestions.map((item, index) => `${index + 1}. ${item.text}${item.sourceIds.length ? ` [${item.sourceIds.join(', ')}]` : ''}`),
      '',
      'SOURCES',
      ...visibleSources.map((source) => `[${source.id}] ${source.title} — ${source.url}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const sendPdfToTelegram = async () => {
    if (!telegramStatus?.connected || !telegramStatus.chatId) {
      setTelegramMessage('Connect Telegram in the source key settings before sending a PDF.');
      return;
    }
    const confirmed = window.confirm(
      `Send this one-page briefing PDF to Telegram chat ${telegramStatus.chatId}? It may include internal SAP records and source links.`,
    );
    if (!confirmed) return;
    const pin = window.prompt('Enter the four-digit briefing start PIN to send this PDF.');
    if (pin === null) return;
    if (!/^\d{4}$/.test(pin.trim())) {
      setTelegramMessage('Enter the four-digit briefing start PIN.');
      return;
    }

    setTelegramSending(true);
    setTelegramMessage('');
    try {
      const { createTelegramBriefPdf } = await import('@/lib/telegram-brief-pdf');
      const { bytes, filename } = await createTelegramBriefPdf(result, activeTopic);
      const pdfBody = Uint8Array.from(bytes);
      const response = await fetch(apiUrl('telegram-send'), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Briefing-Start-Pin': pin.trim(),
          'X-Briefing-Filename': filename,
        },
        body: new Blob([pdfBody.buffer as ArrayBuffer], { type: 'application/pdf' }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        remaining?: number;
        usedThisHour?: number;
        windowResetsAt?: string | null;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Telegram could not send the PDF.');
      const remaining = payload.remaining ?? Math.max(0, telegramStatus.remaining - 1);
      setTelegramStatus((current) => current ? {
        ...current,
        remaining,
        usedThisHour: payload.usedThisHour ?? current.usedThisHour + 1,
        windowResetsAt: payload.windowResetsAt ?? current.windowResetsAt,
      } : current);
      setTelegramMessage(`PDF sent. ${remaining} of ${telegramStatus.limit} sends remain this rolling hour.`);
    } catch (error) {
      setTelegramMessage(error instanceof Error ? error.message : 'Telegram could not send the PDF.');
      try {
        const latestStatus = await sendAccountRequest('telegram-credentials', 'GET') as TelegramCredentialStatus;
        setTelegramStatus(latestStatus);
      } catch {
        // Keep the delivery error visible if the status refresh is also unavailable.
      }
    } finally {
      setTelegramSending(false);
    }
  };

  return (
    <article className="fade-up min-w-0" aria-label={`Briefing for ${result.subject}`} data-testid="briefing-result">
      <div className="screen-brief">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2 text-xs font-medium text-[#5d5279]">
          <span className="h-2 w-2 rounded-full bg-[#4c9c7b]" aria-hidden="true" />
          Briefing ready
          <span className="text-muted-foreground">·</span>
          Crawl started {formatDate(result.generatedAt)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyBrief} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-accent" data-testid="button-copy-brief">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy brief'}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#292e46] px-3 text-xs font-semibold text-white transition hover:bg-[#3c4160]" data-testid="button-print-brief-top">
            <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print one-page brief
          </button>
          <button
            type="button"
            onClick={() => void sendPdfToTelegram()}
            disabled={telegramSending || !telegramStatus?.connected || telegramStatus.remaining <= 0}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#547a61] bg-[#eaf4ed] px-3 text-xs font-semibold text-[#285b39] transition hover:bg-[#dcefe2] disabled:cursor-not-allowed disabled:opacity-50"
            title={!telegramStatus?.connected ? 'Connect Telegram in source key settings first' : `Up to ${telegramStatus.limit} PDFs per rolling hour`}
            data-testid="button-send-telegram-pdf"
          >
            {telegramSending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
            {telegramSending ? 'Sending…' : 'Telegram PDF'}
          </button>
        </div>
      </div>
      <p className="no-print -mt-4 mb-5 text-right text-xs text-[#625d69]" role="status" aria-live="polite" data-testid="status-telegram-send">
        {telegramMessage || (telegramStatus?.connected
          ? `${telegramStatus.remaining} of ${telegramStatus.limit} Telegram PDF sends remain this rolling hour. Sending uses the current brief and does not start another Tavily search.`
          : 'Connect Telegram in source key settings to send this brief as a PDF.')}
      </p>

      <header className="print-card relative overflow-hidden rounded-2xl border border-[#d8d2df] bg-[#262b42] px-6 py-7 text-[#f6f1e8] shadow-[0_15px_45px_rgba(36,35,54,.12)] sm:px-9 sm:py-9">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-2 -top-12 h-44 w-44 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c5b9e8]">
            {result.sourceMode === 'sap' ? 'Tavily public research + SAP S/4HANA records' : `${result.subjectType} briefing`}
            {result.subjectType === 'person' && result.personRole ? ` · ${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)}` : ''}
          </p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-[.98] tracking-[-.02em] sm:text-5xl">{result.subject}</h2>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#d2d0da]">
            <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#c5b9e8]" />{result.meetingAt ? `Meeting: ${formatDate(result.meetingAt)}` : `Prepared: ${formatDate(result.generatedAt)}`}</span>
            <span className="inline-flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-[#c5b9e8]" />Research window: {formatWindow(result.windowStart, result.windowEnd)}</span>
            {result.sourceMode === 'sap' ? (
              <span className="inline-flex items-center gap-2" data-testid="text-sap-usage">
                Tavily: {result.searchCreditsUsed === null ? 'usage not reported' : `${result.searchCreditsUsed} credit${result.searchCreditsUsed === 1 ? '' : 's'}`} · {result.topics.length} topic searches · SAP: {result.sourceSearchesCompleted} read-only area request{result.sourceSearchesCompleted === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2" data-testid="text-tavily-usage">
                Tavily: {result.searchCreditsUsed === null ? 'usage not reported' : `${result.searchCreditsUsed} credit${result.searchCreditsUsed === 1 ? '' : 's'}`} · {result.sourceSearchesCompleted} basic topic search{result.sourceSearchesCompleted === 1 ? '' : 'es'}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)] lg:items-start" data-testid="briefing-columns">
      <div className="min-w-0" data-testid="briefing-content-column">
      <section className="print-card rounded-2xl border border-border bg-card px-6 py-6 shadow-[0_8px_28px_rgba(38,37,55,.035)] sm:px-8" aria-labelledby="overview-heading">
        <SectionEyebrow>
          {activeTopic === 'all'
            ? '01 / The short read'
            : `01 / ${TOPICS.find((topic) => topic.value === activeTopic)?.label ?? 'Topic'} · 30-day view`}
        </SectionEyebrow>
        <h3 id="overview-heading" className="sr-only">Overview</h3>
        <p className="briefing-prose mt-4 max-w-4xl font-serif text-[22px] leading-[1.45] text-[#30334a] sm:text-[25px]">
          {visibleOverview.text}
          <References sourceIds={visibleOverview.sourceIds} sources={result.sources} />
        </p>
        {result.sources.length === 0 && result.searchResultsReturned !== null && (
          <p
            className="mt-5 rounded-xl border border-[#d9d2e3] bg-[#f4f1f8] px-4 py-3 text-base leading-relaxed text-[#3e3852]"
            role="status"
            data-testid="briefing-empty-state"
          >
            {result.searchResultsReturned === 0
              ? `Tavily returned no results across ${result.sourceSearchesCompleted} selected-topic searches in this 30-day window.`
              : `Tavily returned ${result.searchResultsReturned} results, but none passed the date, source-link, company-name, and selected-topic checks. The source panel explains this check.`}
          </p>
        )}
        {result.sourceMode !== 'sap' && (
          <div className="mt-4 grid gap-2 md:grid-cols-2" aria-label="Top positive and negative signals">
            <p className="rounded-lg border border-[#cfe2d3] bg-[#f0f7f1] px-3 py-2 text-sm leading-relaxed text-[#315d43]">
              <strong>Top positive:</strong> {visibleOverview.topPositive.text}
              <References sourceIds={visibleOverview.topPositive.sourceIds} sources={result.sources} />
            </p>
            <p className="rounded-lg border border-[#e8cfcc] bg-[#fbf1ef] px-3 py-2 text-sm leading-relaxed text-[#864941]">
              <strong>Top negative:</strong> {visibleOverview.topNegative.text}
              <References sourceIds={visibleOverview.topNegative.sourceIds} sources={result.sources} />
            </p>
          </div>
        )}
      </section>

      {result.sourceMode === 'sap' && <SapDataSection items={result.sapData} sources={result.sources} />}

      {result.sourceMode === 'sap' && (
        <p className="mt-6" data-testid="text-sap-public-research-heading">
          <SectionEyebrow>Public research from Tavily</SectionEyebrow>
        </p>
      )}
      <nav className="no-print mt-6 flex flex-wrap gap-2" aria-label="Filter briefing by topic" data-testid="topic-filters">
        <button
          type="button"
          onClick={() => setActiveTopic('all')}
          aria-pressed={activeTopic === 'all'}
          className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${activeTopic === 'all' ? 'border-[#5b5078] bg-[#292e46] text-white' : 'border-border bg-card text-foreground hover:bg-accent'}`}
          data-testid="button-topic-filter-all"
        >
          All selected topics
        </button>
        {TOPICS.map((topic) => {
          const included = result.topics.includes(topic.value);
          return (
            <button
              key={topic.value}
              type="button"
              onClick={() => setActiveTopic(topic.value)}
              disabled={!included}
              aria-pressed={activeTopic === topic.value}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${activeTopic === topic.value ? 'border-[#5b5078] bg-[#292e46] text-white' : 'border-border bg-card text-foreground hover:bg-accent'}`}
              data-testid={`button-topic-filter-${topic.value}`}
            >
              {topic.label}
            </button>
          );
        })}
      </nav>

      {result.aiSummaryNotice && (
        <p className="mt-4 rounded-lg border border-[#e7c49c] bg-[#fff7e9] px-4 py-3 text-sm leading-relaxed text-[#714d21]" role="status" data-testid="ai-summary-notice">
          {result.aiSummaryNotice}
        </p>
      )}

      {result.aiSummaries.some((summary) => visibleTopics.includes(summary.category)) && (
        <p className="no-print mt-3 text-sm font-semibold text-[#51476e]" data-testid="ai-summary-word-count">
          Qwen summary text: {result.aiSummaries
            .filter((summary) => visibleTopics.includes(summary.category))
            .reduce((total, summary) => total + summary.summary.trim().split(/\s+/).filter(Boolean).length, 0)} / 400 words
          {activeTopic === 'all' ? ' across the selected topics' : ` in ${TOPICS.find((topic) => topic.value === activeTopic)?.label}`}
        </p>
      )}

      {visibleTopics.map((topic) => {
        const selected = TOPICS.find((item) => item.value === topic)!;
        return (
          <TopicBlock
            key={topic}
            topic={topic}
            title={selected.label}
            highlights={visibleHighlights.filter((item) => item.category === topic)}
            questions={topic === 'risk' ? visibleQuestions : undefined}
            sources={result.sources}
            openRoleSearchSubject={topic === 'hire' ? openRoleSearchSubject : undefined}
            aiSummary={result.aiSummaries.find((summary) => summary.category === topic)}
          />
        );
      })}

      </div>

      <aside className="min-w-0" aria-label="Brief sources and media" data-testid="source-column">
      <section className="print-card rounded-2xl border border-border bg-card px-5 py-5 sm:px-7" aria-labelledby="all-source-links-heading" data-testid="links-box">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionEyebrow>Trace every claim</SectionEyebrow>
            <h3 id="all-source-links-heading" className="mt-2 font-serif text-2xl text-foreground">Source links</h3>
          </div>
          <span className="rounded-full bg-[#f1eef7] px-3 py-1 text-sm font-semibold text-[#5d5279]" data-testid="text-source-count">{result.sources.length} sources</span>
        </div>
        {result.sources.length === 0 && result.searchResultsReturned !== null && (
          <p className="mb-4 rounded-lg border border-[#ded9e5] bg-[#f8f6fb] px-4 py-3 text-base leading-relaxed text-[#625d69]" role="status" data-testid="text-source-filter-diagnostic">
            {result.searchResultsReturned === 0
              ? `No results were returned across ${result.sourceMode === 'sap' ? `${result.topics.length} Tavily topic searches and ${result.sourceSearchesCompleted} SAP area requests` : `${result.sourceSearchesCompleted} selected-topic searches`}.`
              : `${result.searchResultsReturned} results were checked, but none passed the source date, link, subject, and topic checks.`}
          </p>
        )}
        <SourceList sources={result.sources} />
      </section>
      </aside>

      </div>
      <section className="no-print mt-7 rounded-xl border border-[#ded9e2] bg-[#f8f6f2] px-4 py-4" aria-label="Read aloud controls" data-testid="voice-summary">
        <p className="mb-3 text-base font-semibold text-[#292e46]">Read this brief aloud</p>
        <VoiceControls text={[
          visibleOverview.text,
          ...(result.sourceMode === 'sap' ? [] : [
            `Top positive: ${visibleOverview.topPositive.text}`,
            `Top negative: ${visibleOverview.topNegative.text}`,
          ]),
          ...result.sapData.map((item) => `${SAP_AREAS.find((area) => area.value === item.area)?.label ?? item.area}: ${item.title}. ${item.detail}`),
          ...visibleHighlights.flatMap((item) => [item.title, item.summary]),
          ...visibleQuestions.map((question) => question.text),
          ...(openRoleSearchSubject && result.topics.includes('hire') && (activeTopic === 'all' || activeTopic === 'hire')
            ? [`Open job listings for ${openRoleSearchSubject} are not imported automatically. Use the LinkedIn Sales and Maintenance search links in Hires.`]
            : []),
        ].join('. ')} />
      </section>
      <p className="no-print mt-5 text-right font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Crawl started {formatDate(result.generatedAt)}</p>
      </div>
      <PrintOnePageBrief result={result} activeTopic={activeTopic} />
    </article>
  );
}

function CustomerSearchDocument({ result }: { result: CustomerSearchResponse }) {
  const [copied, setCopied] = useState(false);
  const printSources = result.sources.slice(0, 5);
  const copyCustomerSearch = async () => {
    const lines = [
      `Customer Search — ${result.productOrCategory}`,
      `Person: ${result.personName} · ${personContextLabel(result.personRole, null, result.companyName)}`,
      `Location: ${result.city}, ${result.state}`,
      `Prepared: ${formatDate(result.generatedAt)}`,
      'Tavily requests: 1',
      result.dataSourceNotice,
      '',
      'PUBLIC BUSINESS SOURCES',
      ...result.sources.flatMap((source, index) => [
        `${index + 1}. ${source.businessName}`,
        `Phone: ${source.phone ?? 'Not listed in the source snippet'} · Business email: ${source.email ?? 'Not listed in the source snippet'}`,
        source.excerpt,
        `Source: ${source.sourceUrl}`,
        '',
      ]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article
      className="fade-up min-w-0"
      aria-label={`Customer Search for ${result.productOrCategory} in ${result.city}, ${result.state}`}
      data-testid="customer-search-result"
    >
      <div className="screen-brief">
        <div className="rounded-2xl bg-[#292e46] px-6 py-7 text-white sm:px-9 sm:py-9">
          <SectionEyebrow>Person · current public search · one Tavily request</SectionEyebrow>
          <h2 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">{result.productOrCategory}</h2>
          <p className="mt-3 text-base text-white/80">
            {result.city}, {result.state} · prepared for {result.personName}
          </p>
          <p className="mt-3 text-sm text-white/75" data-testid="customer-search-usage">
            Tavily credits reported: {result.searchCreditsUsed ?? 'not reported'} · {result.searchResultsReturned} source-backed results
          </p>
        </div>

        <p className="mt-4 rounded-xl border border-[#d7cde9] bg-[#f5f1fb] px-4 py-3 text-sm leading-relaxed text-[#40345f]" data-testid="customer-search-source-notice">
          {result.dataSourceNotice}
        </p>

        <section className="mt-6 space-y-3" aria-label="Public business search results">
          {result.sources.length === 0 ? (
            <p className="rounded-xl border border-[#ded9e5] bg-white px-4 py-4 text-base leading-relaxed text-[#625d69]" role="status" data-testid="customer-search-empty-state">
              Tavily returned no usable public business pages for this category and location. No contact details were guessed.
            </p>
          ) : result.sources.map((source, index) => (
            <article key={source.id} className="rounded-xl border border-[#d9d4df] bg-white p-4 sm:p-5" data-testid="customer-search-source">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-[#71658e]">
                    Business / page title · {source.publisher}
                  </p>
                  <h3 className="mt-1 font-serif text-xl leading-snug text-[#292e46]">{source.businessName}</h3>
                </div>
                <span className="rounded-full bg-[#f1eef7] px-3 py-1 text-xs font-semibold text-[#5d5279]">Source {index + 1}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-[#35364a]">Public business phone</dt>
                  <dd className="mt-0.5 break-words text-[#514e5c]">{source.phone ?? 'Not listed in the returned source snippet'}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#35364a]">Role-based business email</dt>
                  <dd className="mt-0.5 break-words text-[#514e5c]">{source.email ?? 'Not listed in the returned source snippet'}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm leading-relaxed text-[#514e5c]">{source.excerpt}</p>
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-10 items-center gap-2 break-all text-sm font-semibold text-[#594b87] underline underline-offset-4"
                data-testid={`link-customer-source-${index + 1}`}
              >
                <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Open cited source
              </a>
            </article>
          ))}
        </section>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyCustomerSearch()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#292e46] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#3c4160]"
            data-testid="button-copy-customer-search"
          >
            <Clipboard className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Copied' : 'Copy results'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d9d4df] bg-white px-4 py-2.5 text-base font-semibold text-[#292e46] hover:bg-[#f4f1f8]"
            data-testid="button-print-customer-search"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print one page
          </button>
        </div>
      </div>

      <section className="print-only print-one-page customer-search-print" aria-label="One-page printable Customer Search" data-testid="print-customer-search">
        <header className="print-page-header">
          <p>Customer Search · Public Tavily search</p>
          <h1>{result.productOrCategory}</h1>
          <div className="print-date-details">
            <span>Person: {result.personName} · {personContextLabel(result.personRole, null, result.companyName)}</span>
            <span>Location: {result.city}, {result.state} · Prepared: {formatDate(result.generatedAt)}</span>
          </div>
        </header>
        <section className="print-page-overview">
          <h2>Source and contact note</h2>
          <p>{result.dataSourceNotice}</p>
          {result.sources.length > printSources.length && (
            <p>Showing the first {printSources.length} of {result.sources.length} results on this one-page print.</p>
          )}
        </section>
        <div className="print-topic-grid customer-search-print-results">
          {printSources.length === 0 ? (
            <section className="print-topic">
              <h2>No results</h2>
              <p>Tavily returned no usable public business pages. No contact details were guessed.</p>
            </section>
          ) : printSources.map((source, index) => (
            <section className="print-topic" key={source.id}>
              <h2>{index + 1}. {source.businessName}</h2>
              <p>Phone: {source.phone ?? 'Not listed'} · Business email: {source.email ?? 'Not listed'}</p>
              <p>{source.excerpt}</p>
            </section>
          ))}
        </div>
        <footer className="print-page-sources">
          <h2>Source links</h2>
          <ol>
            {printSources.map((source, index) => (
              <li key={source.id}>
                <span>{index + 1}. {source.businessName}</span>
                <a className="print-source-url" href={source.sourceUrl}>{source.sourceUrl}</a>
              </li>
            ))}
          </ol>
        </footer>
      </section>
    </article>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#71658e]">{children}</p>;
}

function PrintOnePageBrief({ result, activeTopic }: { result: BriefingResult; activeTopic: 'all' | Topic }) {
  const printTopics = activeTopic === 'all' ? result.topics : [activeTopic];
  const printBrief = activeTopic === 'all'
    ? result.overview
    : result.topicBriefs.find((brief) => brief.category === activeTopic) ?? result.overview;
  const openRoleSearchSubject = result.subjectType === 'company'
    ? result.subject
    : result.personRole === 'business_owner' && result.companyName
      ? result.companyName
      : undefined;
  const printHighlights = printTopics.flatMap((topic) =>
    result.highlights
      .filter((item) => item.category === topic)
      .slice(0, 2),
  );
  const printSapData = result.sapAreas.flatMap((area) =>
    result.sapData.filter((item) => item.area === area).slice(0, 1),
  ).slice(0, 3);
  const firstQuestion = printTopics.includes('risk') ? result.questions.slice(0, 1) : [];
  const sourceIds = new Set([
    ...printBrief.sourceIds,
    ...(result.sourceMode === 'sap' ? [] : printBrief.topPositive.sourceIds),
    ...(result.sourceMode === 'sap' ? [] : printBrief.topNegative.sourceIds),
    ...printHighlights.flatMap((item) => item.sourceIds),
    ...firstQuestion.flatMap((item) => item.sourceIds),
    ...printSapData.flatMap((item) => item.sourceIds),
  ]);
  const sources = result.sources.filter((source) => sourceIds.has(source.id));
  const briefLine = (text: string, maxLength: number) => text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
  const printText = (text: string, maxLength: number, maxWords: number) => {
    const limited = briefLine(text, maxLength).trim();
    const words = limited.match(/\S+/g) ?? [];
    return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : limited;
  };
  const overviewText = printText(printBrief.text, 420, 70);
  const topPositiveText = printText(printBrief.topPositive.text, 130, 18);
  const topNegativeText = printText(printBrief.topNegative.text, 130, 18);
  const printSapRows = printSapData.map((item) => ({
    ...item,
    printTitle: printText(item.title, result.sourceMode === 'sap' ? 56 : 72, result.sourceMode === 'sap' ? 8 : 12),
    printDetail: printText(item.detail, result.sourceMode === 'sap' ? 80 : 120, result.sourceMode === 'sap' ? 12 : 20),
  }));
  const printTopicBlocks = printTopics.map((topic) => {
    const topicInfo = TOPICS.find((item) => item.value === topic)!;
    const highlights = printHighlights
      .filter((item) => item.category === topic)
      .map((highlight) => ({
        ...highlight,
        printTitle: printText(highlight.title, result.sourceMode === 'sap' ? 72 : 100, result.sourceMode === 'sap' ? 10 : 14),
        printSummary: printText(highlight.summary, result.sourceMode === 'sap' ? 120 : 170, result.sourceMode === 'sap' ? 22 : 34),
      }));
    const emptyMessage = topic === 'hire'
      ? 'No confirmed-hire reports were found in this 30-day public-news crawl; this does not confirm that no vacancies exist.'
      : topic === 'news'
        ? 'No separate general-news items were found in this crawl.'
        : `No sourced ${topicInfo.label.toLowerCase()} items were found in this 30-day crawl.`;
    const question = topic === 'risk' ? result.questions[0] : undefined;
    return {
      topic,
      topicInfo,
      highlights,
      emptyMessage: highlights.length ? undefined : printText(emptyMessage, 120, 18),
      question,
      questionText: question ? printText(question.text, 150, 20) : '',
    };
  });
  const hasSapPublicPrintContent = printTopicBlocks.some((block) =>
    block.highlights.length > 0 || Boolean(block.question),
  );
  const sapPublicPrintText = hasSapPublicPrintContent
    ? printTopicBlocks.flatMap((block) =>
      [
        ...block.highlights.flatMap((highlight) => [
          block.topicInfo.label,
          highlight.printTitle,
          highlight.printSummary,
        ]),
        block.questionText,
      ],
    )
    : ["No public Tavily results were found in the selected topics."];
  const additionalSapNote = result.sapData.length > printSapRows.length
    ? `${result.sapData.length - printSapRows.length} additional SAP records are available in the app.`
    : "";
  const printedWordCount = [
    overviewText,
    ...(result.sourceMode === 'sap' ? [] : [topPositiveText, topNegativeText]),
    ...(result.sourceMode === 'sap'
      ? [
        ...sapPublicPrintText,
        ...printSapRows.flatMap((item) => [item.printTitle, item.printDetail]),
        additionalSapNote,
      ]
      : printTopicBlocks.flatMap((block) => [
      ...block.highlights.flatMap((highlight) => [highlight.printTitle, highlight.printSummary]),
      block.emptyMessage ?? '',
      block.questionText,
      ])),
  ].reduce((count, text) => count + (text.match(/\S+/g)?.length ?? 0), 0);

  return (
    <section className="print-only print-one-page" aria-label="One-page printable briefing" data-testid="print-one-page-brief">
      <header className="print-page-header">
        <p>
          {result.sourceMode === 'sap' ? 'Public research + SAP S/4HANA briefing' : `${result.subjectType} briefing`}
          {result.subjectType === 'person' && result.personRole ? ` · ${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)}` : ''}
          {result.sourceMode === 'sap'
            ? ` · ${result.sapAreas.map((area) => SAP_AREAS.find((item) => item.value === area)?.label ?? area).join(', ')} · 30-day window`
            : ` · ${activeTopic === 'all' ? 'all selected topics' : `${TOPICS.find((topic) => topic.value === activeTopic)?.label} tab`} · 30-day research window`}
        </p>
        <h1>{result.subject}</h1>
        <div className="print-date-details" data-testid="text-print-date-details">
          <span>{result.meetingAt ? `Meeting: ${formatDate(result.meetingAt)}` : `Prepared: ${formatDate(result.generatedAt)}`}</span>
          <span>Crawl started: {formatDate(result.generatedAt)}</span>
          <span>30-day research window: {formatWindow(result.windowStart, result.windowEnd)}</span>
          <span data-testid="text-print-word-count">Brief text: {printedWordCount} / {PRINT_WORD_LIMIT} words; sources listed separately</span>
        </div>
      </header>
      <section className="print-page-overview">
        <h2>Brief</h2>
        <p>{overviewText} <PrintReferences sourceIds={printBrief.sourceIds} sources={result.sources} /></p>
        {result.sourceMode !== 'sap' && (
          <>
            <p><strong>Top positive:</strong> {topPositiveText} <PrintReferences sourceIds={printBrief.topPositive.sourceIds} sources={result.sources} /></p>
            <p><strong>Top negative:</strong> {topNegativeText} <PrintReferences sourceIds={printBrief.topNegative.sourceIds} sources={result.sources} /></p>
          </>
        )}
      </section>
      {result.sourceMode === 'sap' ? (
        <>
          <section className="print-topic-grid" aria-label="Public Tavily research" data-testid="print-public-research">
            {hasSapPublicPrintContent ? (
              printTopicBlocks.filter((block) => block.highlights.length > 0 || block.question || block.topic === 'hire').map(({ topic, topicInfo, highlights, question, questionText }) => (
                <section key={topic} className="print-topic">
                  <h2>{topicInfo.label} · Public</h2>
                  {highlights.map((highlight) => (
                    <p key={highlight.title}>
                      <strong>{highlight.printTitle}.</strong> {highlight.printSummary}{' '}
                      <PrintReferences sourceIds={highlight.sourceIds} sources={result.sources} />
                    </p>
                  ))}
                  {topic === 'hire' && openRoleSearchSubject && (
                    <p className="print-question">
                      <strong>Open-role searches:</strong>{' '}
                      <a href={linkedinJobsSearchUrl(openRoleSearchSubject, 'sales')}>Sales</a>
                      {' · '}
                      <a href={linkedinJobsSearchUrl(openRoleSearchSubject, 'maintenance')}>Maintenance</a>
                      {' on LinkedIn. These links open searches; this app has not fetched or verified the postings.'}
                    </p>
                  )}
                  {question && <p><strong>Open question:</strong> {questionText} <PrintReferences sourceIds={question.sourceIds} sources={result.sources} /></p>}
                </section>
              ))
            ) : (
              <section className="print-topic">
                <h2>Public research</h2>
                <p>No public Tavily results were found in the selected topics.</p>
              </section>
            )}
          </section>
          <section className="print-sap-data" aria-label="SAP data records" data-testid="print-sap-data">
            <h2>SAP Data · selected records</h2>
            {printSapRows.length ? printSapRows.map((item) => (
              <p key={`${item.area}-${item.recordId}`}>
                <strong>{SAP_AREAS.find((area) => area.value === item.area)?.label ?? item.area} · {item.printTitle}.</strong>{' '}
                {item.printDetail}{' '}
                <PrintReferences sourceIds={item.sourceIds} sources={result.sources} />
              </p>
            )) : <p>No matching SAP records were returned for the selected areas and 30-day window.</p>}
            {additionalSapNote && <p>{additionalSapNote}</p>}
          </section>
        </>
      ) : (
      <div className="print-topic-grid">
        {printTopicBlocks.map(({ topic, topicInfo, highlights, emptyMessage, question, questionText }) => {
          return (
            <section key={topic} className="print-topic">
              <h2>{topicInfo.label}</h2>
              {highlights.length ? (
                highlights.map((highlight, index) => (
                  <p key={`${highlight.title}-${index}`} className={index > 0 ? 'print-highlight-extra' : undefined}>
                    <strong>{highlight.printTitle}.</strong> {highlight.printSummary}{' '}
                    <PrintReferences sourceIds={highlight.sourceIds} sources={result.sources} />
                  </p>
                ))
              ) : (
                <p>{emptyMessage}</p>
              )}
              {topic === 'hire' && openRoleSearchSubject && (
                <p className="print-question">
                  <strong>Open-role searches:</strong>{' '}
                  <a href={linkedinJobsSearchUrl(openRoleSearchSubject, 'sales')} data-testid="link-print-sales-openings">Sales</a>
                  {' · '}
                  <a href={linkedinJobsSearchUrl(openRoleSearchSubject, 'maintenance')} data-testid="link-print-maintenance-openings">Maintenance</a>
                  {' on LinkedIn. These links open searches; this app has not fetched or verified the postings.'}
                </p>
              )}
              {question && <p className="print-question"><strong>Open question:</strong> {questionText} <PrintReferences sourceIds={question.sourceIds} sources={result.sources} /></p>}
            </section>
          );
        })}
      </div>
      )}
      <footer className="print-page-sources">
        <h2>Sources</h2>
        <ol>
          {sources.map((source) => (
            <li key={source.id} data-testid={`print-source-${source.id}`}>
              <span>[{source.id}]</span>{' '}
              <a href={source.url} title={source.url} data-testid={`print-source-title-${source.id}`}>
                {briefLine(source.title, 74)}
              </a>
              {source.affiliatedCompanyReport ? <span> — Company-level report</span> : null}
              <a className="print-source-url" href={source.url} title={source.url} data-testid={`print-source-url-${source.id}`}>
                {briefLine(source.url, 88)}
              </a>
            </li>
          ))}
        </ol>
      </footer>
    </section>
  );
}

function PrintReferences({ sourceIds, sources }: { sourceIds: string[]; sources: BriefSource[] }) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle" aria-label="Source links">
      {sourceIds.map((id) => {
        const source = sourceById.get(id);
        return source ? <a key={id} className="reference-pill" href={source.url} title={source.title}>{id}</a> : null;
      })}
    </span>
  );
}

function Home() {
  const { isLoaded: accountLoaded, isSignedIn } = useUser();
  const [pwaLaunchIntent] = useState(() => readPwaLaunchIntent());
  const [installPrompt, setInstallPrompt] = useState<PwaInstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [appInstalled, setAppInstalled] = useState(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    try {
      return window.localStorage.getItem(pwaInstalledStorageKey) === 'true' || isStandalone;
    } catch {
      return isStandalone;
    }
  });
  const [settingsTheme, setSettingsTheme] = useState<'light' | 'dark'>(() => {
    try {
      return window.localStorage.getItem(settingsThemeStorageKey) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const markAppInstalled = useCallback(() => {
    setAppInstalled(true);
    setInstallPrompt(null);
    setInstallHelpOpen(false);
    try {
      window.localStorage.setItem(pwaInstalledStorageKey, 'true');
    } catch {
      // The installed state is still reflected for this open page.
    }
  }, []);
  const sourceStatusQuery = useGetBriefingSourceStatus({
    query: {
      queryKey: getGetBriefingSourceStatusQueryKey(),
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
      retry: false,
    },
  });
  useEffect(() => {
    if (accountLoaded) void sourceStatusQuery.refetch();
  }, [accountLoaded, isSignedIn, sourceStatusQuery.refetch]);
  useEffect(() => {
    try {
      window.localStorage.setItem(settingsThemeStorageKey, settingsTheme);
    } catch {
      // Keep the current-page theme even if browser storage is unavailable.
    }
  }, [settingsTheme]);
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as PwaInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      markAppInstalled();
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [markAppInstalled]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const briefingOutputRef = useRef<HTMLElement | null>(null);
  const mutation = useCreateBriefing({ request: { get signal() { return abortControllerRef.current?.signal; } } });
  const customerSearchMutation = useCreateCustomerSearch({ request: { get signal() { return abortControllerRef.current?.signal; } } });
  const isAnySearchPending = mutation.isPending || customerSearchMutation.isPending;
  const [subject, setSubject] = useState('');
  const [subjectType, setSubjectType] = useState<'company' | 'person'>(() =>
    pwaLaunchIntent?.action === 'customer-search' ? 'person' : 'company');
  const [personRole, setPersonRole] = useState<PersonRole | null>(null);
  const [publicRoleTitle, setPublicRoleTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [savedPersonProfiles, setSavedPersonProfiles] = useState<SavedPersonProfile[]>([]);
  const [selectedSavedProfileId, setSelectedSavedProfileId] = useState('');
  const [profileRequestPending, setProfileRequestPending] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [sourceMode, setSourceMode] = useState<SourceMode>('public');
  const [sourceModeAlert, setSourceModeAlert] = useState('');
  const [sapAreas, setSapAreas] = useState<SapDataArea[]>([]);
  const [topics, setTopics] = useState<Topic[]>(TOPICS.map((topic) => topic.value));
  const [customerSearchSelected, setCustomerSearchSelected] = useState(
    pwaLaunchIntent?.action === 'customer-search',
  );
  const [customerProductOrCategory, setCustomerProductOrCategory] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerCityCustom, setCustomerCityCustom] = useState(false);
  const [customerState, setCustomerState] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
  const [context, setContext] = useState('');
  const [question, setQuestion] = useState(pwaLaunchIntent?.question ?? '');
  const [landingAskMessage, setLandingAskMessage] = useState('');
  const [aiStatus, setAiStatus] = useState<AiGuardrailsStatus | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [resultKey, setResultKey] = useState('');
  const [customerSearchResultKey, setCustomerSearchResultKey] = useState('');
  const [failedKey, setFailedKey] = useState('');
  const [timedOutKey, setTimedOutKey] = useState('');
  const [cancelledKey, setCancelledKey] = useState('');
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [startPin, setStartPin] = useState('');
  const [pinDialogError, setPinDialogError] = useState('');
  const activeRequestKey = useRef('');
  const timeoutRef = useRef<number | undefined>(undefined);
  const requestKey = JSON.stringify([subject.trim(), subjectType, personRole, publicRoleTitle.trim(), companyName.trim(), sourceMode, sourceMode === 'sap' ? sapAreas : [], meetingAt, topics, customerSearchSelected, customerProductOrCategory.trim(), customerCity.trim(), customerState.trim(), context.trim(), question.trim(), useAi]);
  const meetingTimeIsValid = !meetingAt || !Number.isNaN(new Date(meetingAt).getTime());
  const hasValidSubject = subject.trim().length >= 2;
  const hasValidRoleSelection = subjectType !== 'person' || Boolean(personRole);
  const hasValidPersonDetails = subjectType !== 'person' || (
    personRole === 'business_owner'
      ? companyName.trim().length >= 2
      : personRole === 'mp'
        ? publicRoleTitle.trim().length >= 2
        : personRole === 'corporate'
  );
  const hasValidRole = hasValidRoleSelection && hasValidPersonDetails;
  const hasTopics = customerSearchSelected || topics.length > 0;
  const hasCustomerSearchFields = customerProductOrCategory.trim().length >= 2 &&
    customerCity.trim().length >= 2 &&
    customerState.trim().length >= 2;
  const customerCityOptions = customerState in INDIA_CITIES_BY_STATE
    ? INDIA_CITIES_BY_STATE[customerState as IndiaState]
    : [];
  const customerSearchAvailable = subjectType === 'person' && sourceMode === 'public';
  const customerSearchReady = customerSearchSelected &&
    customerSearchAvailable &&
    hasValidSubject &&
    hasValidRole &&
    hasCustomerSearchFields;
  const tavilyConfigured = sourceStatusQuery.data?.configured === true;
  const sapConfigured = sourceStatusQuery.data?.sapConfigured === true;
  const sapAvailableAreas = sourceStatusQuery.data?.sapAvailableAreas ?? [];
  const canStart = sourceStatusQuery.data?.canStart === true;
  const keySource = sourceStatusQuery.data?.keySource;
  const startPinConfigured = sourceStatusQuery.data?.startPinConfigured === true;
  const dailyCrawlStartsLimit = sourceStatusQuery.data?.dailyCrawlStartsLimit ?? null;
  const dailyCrawlStartsUsed = sourceStatusQuery.data?.dailyCrawlStartsUsed ?? null;
  const dailyCrawlStartsRemaining = sourceStatusQuery.data?.dailyCrawlStartsRemaining ?? null;
  const dailySearchRequestsLimit = sourceStatusQuery.data?.dailySearchRequestsLimit ?? null;
  const dailySearchRequestsRemaining = sourceStatusQuery.data?.dailySearchRequestsRemaining ?? null;
  const dailyCrawlActive = sourceStatusQuery.data?.dailyCrawlActive === true;
  const dailyCrawlStartLimitReached = canStart && dailyCrawlStartsRemaining === 0;
  const dailySearchRequestsNeeded = customerSearchSelected ? 1 : topics.length;
  const dailySearchQuotaInsufficient = canStart &&
    dailySearchRequestsRemaining !== null &&
    dailySearchRequestsRemaining < dailySearchRequestsNeeded;
  const crawlAlreadyActive = dailyCrawlActive && !isAnySearchPending;
  const sapAreasUnavailable = sapAreas.filter((area) => !sapAvailableAreas.includes(area));
  const sapSetupComplete = canStart && sapConfigured && sapAvailableAreas.length > 0;
  const sapSourceReady = sapSetupComplete &&
    tavilyConfigured &&
    !dailyCrawlStartLimitReached &&
    !dailySearchQuotaInsufficient &&
    !crawlAlreadyActive &&
    sapAreas.length > 0 &&
    sapAreasUnavailable.length === 0;
  const hasSapOrganization = subjectType === 'company'
    ? subject.trim().length >= 2
    : personRole === 'business_owner' && companyName.trim().length >= 2;
  const sourceReady = sourceMode === 'public'
    ? tavilyConfigured && !dailyCrawlStartLimitReached && !dailySearchQuotaInsufficient && !crawlAlreadyActive
    : sourceMode === 'sap'
      ? sapSourceReady && hasSapOrganization
      : false;
  const hasRequiredSelections = customerSearchSelected
    ? customerSearchReady
    : hasTopics && (sourceMode !== 'sap' || sapAreas.length > 0);
  const hasCurrentResult = !customerSearchSelected && Boolean(mutation.data && resultKey === requestKey);
  const result = hasCurrentResult ? mutation.data : undefined;
  const hasCurrentCustomerSearchResult = customerSearchSelected &&
    Boolean(customerSearchMutation.data && customerSearchResultKey === requestKey);
  const customerSearchResult = hasCurrentCustomerSearchResult
    ? customerSearchMutation.data
    : undefined;
  useEffect(() => {
    if (!result && !customerSearchResult) return;
    const frame = window.requestAnimationFrame(() => {
      briefingOutputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [customerSearchResult?.generatedAt, result?.briefingId]);
  const currentRequestIsPending = isAnySearchPending && activeRequestKey.current === requestKey;
  const currentRequestCancelled = cancelledKey === requestKey;
  const currentRequestFailed = !currentRequestCancelled && (((mutation.isError || customerSearchMutation.isError) && failedKey === requestKey) || timedOutKey === requestKey);
  useEffect(() => {
    const stopRequestOnPageExit = () => {
      abortControllerRef.current?.abort();
    };
    window.addEventListener('pagehide', stopRequestOnPageExit);
    return () => window.removeEventListener('pagehide', stopRequestOnPageExit);
  }, []);
  const selectedSavedProfile = savedPersonProfiles.find((profile) => profile.id === selectedSavedProfileId);
  const selectedProfileMatchesForm = Boolean(
    selectedSavedProfile &&
    selectedSavedProfile.personName.trim().toLocaleLowerCase() === subject.trim().toLocaleLowerCase() &&
    selectedSavedProfile.personRole === personRole,
  );
  useEffect(() => {
    if (!accountLoaded || !isSignedIn) return;
    const launchIntent = readPwaLaunchIntent();
    if (launchIntent?.action === 'customer-search') {
      setSubjectType('person');
      setSourceMode('public');
      setCustomerSearchSelected(true);
    }
    if (launchIntent?.question) setQuestion(launchIntent.question.slice(0, 500));
    if (launchIntent) clearPwaLaunchIntent();
    try {
      const pendingQuestion = window.sessionStorage.getItem(pendingQuestionStorageKey);
      if (pendingQuestion) {
        setQuestion(pendingQuestion.slice(0, 500));
        window.sessionStorage.removeItem(pendingQuestionStorageKey);
      }
    } catch {
      // The user can still enter the question again after signing in.
    }
  }, [accountLoaded, isSignedIn]);
  const handleAiStatusChange = useCallback((nextStatus: AiGuardrailsStatus | null) => {
    setAiStatus(nextStatus);
    if (!nextStatus?.activated) setUseAi(false);
    void sourceStatusQuery.refetch();
  }, [sourceStatusQuery.refetch]);

  const handleSourceModeChange = (nextSource: SourceMode) => {
    setSourceModeAlert('');
    if (nextSource !== 'public') setCustomerSearchSelected(false);
    if (nextSource !== 'sap') {
      setSourceMode(nextSource);
      return;
    }
    let issue = '';
    if (sourceStatusQuery.isLoading || !sourceStatusQuery.data) {
      issue = 'The app could not confirm source setup yet.';
    } else if (sourceStatusQuery.isError) {
      issue = 'The server could not verify SAP and Tavily setup.';
    } else if (!canStart) {
      issue = 'The approved account is required to start SAP briefings.';
    } else if (!sapConfigured || sapAvailableAreas.length === 0) {
      issue = 'Complete the SAP connection and map at least one SAP area first.';
    } else if (sapAreasUnavailable.length > 0) {
      issue = 'One or more selected SAP areas are not mapped by this connection.';
    } else if (!tavilyConfigured) {
      issue = 'Add an active Tavily key for the public research included in SAP briefs.';
    }

    if (issue) {
      setSourceMode('public');
      setSourceModeAlert(`SAP is not ready; returned to Public. ${issue}`);
      return;
    }
    setSourceMode('sap');
  };

  useEffect(() => {
    if (subjectType !== 'person' || sourceMode !== 'public') {
      setCustomerSearchSelected(false);
    }
  }, [sourceMode, subjectType]);

  useEffect(() => {
    if (sourceMode !== 'sap' || sourceStatusQuery.isLoading) return;
    const issue = sourceStatusQuery.isError
      ? 'The server could not verify SAP and Tavily setup.'
      : !canStart
        ? 'The approved account is required to start SAP briefings.'
        : !sapConfigured || sapAvailableAreas.length === 0
          ? 'Complete the SAP connection and map at least one SAP area first.'
          : sapAreasUnavailable.length > 0
            ? 'One or more selected SAP areas are not mapped by this connection.'
          : !tavilyConfigured
            ? 'Add an active Tavily key for public research.'
            : '';
    if (!issue) return;
    setSourceMode('public');
    setSourceModeAlert(`SAP setup is incomplete; returned to Public. ${issue}`);
  }, [canStart, sapAreasUnavailable.length, sapAvailableAreas.length, sapConfigured, sourceMode, sourceStatusQuery.isError, sourceStatusQuery.isLoading, tavilyConfigured]);

  useEffect(() => {
    if (!accountLoaded) return;
    if (!isSignedIn) {
      setSavedPersonProfiles([]);
      setSelectedSavedProfileId('');
      setProfileRequestPending(false);
      setProfileMessage('');
      return;
    }

    let cancelled = false;
    setProfileRequestPending(true);
    void sendAccountRequest('person-profiles', 'GET')
      .then((payload) => {
        if (!cancelled) {
          const profiles = (payload as { profiles?: SavedPersonProfile[] }).profiles;
          setSavedPersonProfiles(Array.isArray(profiles) ? profiles : []);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProfileMessage(error instanceof Error ? error.message : 'Saved details could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setProfileRequestPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountLoaded, isSignedIn]);

  const loadSavedPersonProfile = (profileId: string) => {
    setSelectedSavedProfileId(profileId);
    const profile = savedPersonProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    setSubjectType('person');
    setSourceMode('public');
    setPersonRole(profile.personRole);
    setPublicRoleTitle(profile.publicRoleTitle ?? (profile.personRole === 'mp' ? 'MP' : ''));
    setCompanyName(profile.companyName ?? '');
    setSubject(profile.personName);
    setProfileMessage(`Loaded ${profile.personName}.`);
  };

  const savePersonProfile = async () => {
    if (!isSignedIn || !personRole || !hasValidSubject || !hasValidPersonDetails) return;
    setProfileRequestPending(true);
    setProfileMessage('');
    try {
      const saved = await sendAccountRequest('person-profiles', 'PUT', {
        personName: subject.trim(),
        personRole,
        publicRoleTitle: personRole === 'mp' ? publicRoleTitle.trim() : null,
        companyName: personRole === 'business_owner' ? companyName.trim() : null,
      }) as SavedPersonProfile;
      setSavedPersonProfiles((profiles) => [
        saved,
        ...profiles.filter((profile) =>
          profile.id !== saved.id &&
          !(profile.personName.trim().toLocaleLowerCase() === saved.personName.trim().toLocaleLowerCase() && profile.personRole === saved.personRole),
        ),
      ].slice(0, 50));
      setSelectedSavedProfileId(saved.id);
      setProfileMessage(`Saved ${saved.personName} to your account.`);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Person details could not be saved.');
    } finally {
      setProfileRequestPending(false);
    }
  };

  const forgetSavedPersonProfile = async () => {
    if (!isSignedIn || !selectedProfileMatchesForm || !selectedSavedProfile) return;
    const confirmed = window.confirm(
      `Remove ${selectedSavedProfile.personName} from your saved person details? This will not remove a briefing already generated.`,
    );
    if (!confirmed) return;

    setProfileRequestPending(true);
    setProfileMessage('');
    try {
      await sendAccountRequest(`person-profiles/${selectedSavedProfile.id}`, 'DELETE');
      setSavedPersonProfiles((profiles) => profiles.filter((profile) => profile.id !== selectedSavedProfile.id));
      setSelectedSavedProfileId('');
      setProfileMessage(`Removed ${selectedSavedProfile.personName} from your saved details.`);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Saved details could not be removed.');
    } finally {
      setProfileRequestPending(false);
    }
  };
  const researchWindow = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    return `${formatDate(start.toISOString(), { dateStyle: 'medium' })} — ${formatDate(end.toISOString(), { dateStyle: 'medium' })}`;
  }, []);

  const runBriefing = useCallback((key: string, pin: string) => {
    const selectedSourceReady = sourceReady &&
      !dailyCrawlStartLimitReached &&
      !dailySearchQuotaInsufficient &&
      !crawlAlreadyActive;
    const inputsReady = hasValidSubject &&
      hasValidRole &&
      (customerSearchSelected
        ? customerSearchReady
        : meetingTimeIsValid && hasTopics);
    const requestIsPending = mutation.isPending || customerSearchMutation.isPending;
    if (
      !/^\d{4}$/.test(pin) ||
      !isSignedIn ||
      !selectedSourceReady ||
      !startPinConfigured ||
      !inputsReady ||
      (!customerSearchSelected && useAi && !aiStatus?.activated) ||
      requestIsPending
    ) return;

    activeRequestKey.current = key;
    setFailedKey('');
    setTimedOutKey('');
    setCancelledKey('');
    setPinDialogError('');
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    abortControllerRef.current = new AbortController();
    timeoutRef.current = window.setTimeout(() => {
      if (activeRequestKey.current === key) {
        setTimedOutKey(key);
        activeRequestKey.current = `timed-out:${key}`;
        abortControllerRef.current?.abort();
      }
    }, 120_000);
    const callbacks = {
      onSuccess: () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        abortControllerRef.current = null;
        if (activeRequestKey.current === key) {
          if (customerSearchSelected) {
            setCustomerSearchResultKey(key);
          } else {
            setResultKey(key);
          }
          setFailedKey('');
          setPinPromptOpen(false);
          setStartPin('');
        }
      },
      onError: (error: unknown) => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        abortControllerRef.current = null;
        if (activeRequestKey.current === key) {
          setFailedKey(key);
          setStartPin('');
          const errorMessage = error instanceof Error ? error.message : 'The PIN could not be verified.';
          if (!customerSearchSelected && sourceMode === 'sap' && /(SAP setup is incomplete|SAP briefs require an active Tavily key)/i.test(errorMessage)) {
            setSourceMode('public');
            setSourceModeAlert(`SAP is not ready; returned to Public. ${errorMessage}`);
          }
          setPinDialogError(errorMessage);
        }
      },
      onSettled: () => {
        void sourceStatusQuery.refetch();
      },
    };

    if (customerSearchSelected) {
      if (!personRole) return;
      customerSearchMutation.mutate(
        {
          data: {
            startPin: pin,
            personName: subject.trim(),
            personRole,
            ...(personRole === 'business_owner' ? { companyName: companyName.trim() } : {}),
            ...(personRole === 'mp' ? { publicRoleTitle: publicRoleTitle.trim() } : {}),
            productOrCategory: customerProductOrCategory.trim(),
            city: customerCity.trim(),
            state: customerState.trim(),
          },
        },
        callbacks,
      );
      return;
    }

    mutation.mutate(
      {
        data: {
          startPin: pin,
          subject: subject.trim(),
          subjectType,
          personRole: subjectType === 'person' ? personRole : null,
          ...(subjectType === 'person' && personRole === 'mp' ? { publicRoleTitle: publicRoleTitle.trim() } : {}),
          ...(subjectType === 'person' && personRole === 'business_owner' ? { companyName: companyName.trim() } : {}),
          sourceMode,
          sapAreas: sourceMode === 'sap' ? sapAreas : [],
          meetingAt: meetingAt ? new Date(meetingAt).toISOString() : undefined,
          topics,
          useAi,
          ...(question.trim() ? { question: question.trim() } : {}),
          ...(context.trim() ? { context: context.trim() } : {}),
        },
      },
      callbacks,
    );
  }, [aiStatus?.activated, companyName, context, crawlAlreadyActive, customerCity, customerProductOrCategory, customerSearchMutation.isPending, customerSearchMutation.mutate, customerSearchReady, customerSearchSelected, customerState, dailyCrawlStartLimitReached, dailySearchQuotaInsufficient, hasTopics, hasValidRole, hasValidSubject, isSignedIn, meetingAt, meetingTimeIsValid, mutation.isPending, mutation.mutate, personRole, publicRoleTitle, question, sapAreas, sourceReady, sourceMode, sourceStatusQuery.refetch, startPinConfigured, subject, subjectType, useAi]);

  const handleGenerateBriefing = () => {
    const pendingQuestion = question.trim();
    if (!pendingQuestion) {
      setLandingAskMessage('Enter a question to continue.');
      return;
    }
    try {
      window.sessionStorage.setItem(pendingQuestionStorageKey, pendingQuestion.slice(0, 500));
      window.location.assign(`${basePath}/sign-in`);
    } catch {
      setLandingAskMessage('Your browser could not save the question. Sign in, then enter it again.');
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };
  const handleAppDownload = async () => {
    if (appInstalled) return;
    if (!installPrompt) {
      if (window.self !== window.top) {
        const installTab = window.open(window.location.href, '_blank');
        if (installTab) installTab.opener = null;
      }
      setInstallHelpOpen(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') markAppInstalled();
    } catch {
      setInstallHelpOpen(true);
    }
  };
  const submitStartPin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(startPin)) {
      setPinDialogError('Enter the four-digit start PIN.');
      return;
    }
    runBriefing(requestKey, startPin);
  };
  const closePinPrompt = () => {
    if (isAnySearchPending) return;
    setPinPromptOpen(false);
    setStartPin('');
    setPinDialogError('');
  };

  const apiError = (customerSearchSelected ? customerSearchMutation.error : mutation.error) as (Error & { data?: { error?: string } }) | null;
  const errorMessage = apiError?.data?.error ?? apiError?.message ?? (customerSearchSelected ? 'Customer Search could not be completed. Check your connection and try again.' : 'The briefing could not be generated. Check your connection and try again.');
  const readinessState = !isSignedIn
    ? 'not-ready'
    : currentRequestCancelled
      ? 'error'
    : currentRequestFailed
      ? 'error'
      : currentRequestIsPending
        ? 'crawling'
        : hasCurrentResult || hasCurrentCustomerSearchResult
          ? 'ready'
          : 'not-ready';
  const readinessStyles = {
    'not-ready': 'border-[#e5c5c0] bg-[#fbefed] text-[#8f4039]',
    error: 'border-[#e5c5c0] bg-[#fbefed] text-[#8f4039]',
    crawling: 'border-[#ddd6e8] bg-[#f4f1f8] text-[#554a70]',
    ready: 'border-[#c7dfd2] bg-[#edf6f0] text-[#2f6d4c]',
  }[readinessState];
  const readinessMessage = !isSignedIn
    ? 'Sign in before using the briefing.'
    : sourceStatusQuery.isError
      ? 'Not ready — the server could not confirm source status. Check the API Server workflow.'
      : sourceStatusQuery.isLoading
        ? 'Checking source setup…'
        : !canStart
            ? 'Not ready — only the configured owner account can start crawls.'
            : !startPinConfigured
              ? 'Not ready — configure the briefing start PIN in API Server Secrets.'
              : sourceMode === 'private'
                ? 'Not ready — private sources need user authorization and protected sign-in.'
                : !hasValidSubject
                  ? 'Not ready — enter a company or person.'
                  : !hasValidRole
                    ? !hasValidRoleSelection
                      ? 'Not ready — choose Chairman / CEO, MP, or Corporate.'
                      : personRole === 'business_owner'
                        ? 'Not ready — enter the Chairman / CEO’s company.'
                        : personRole === 'mp'
                          ? 'Not ready — enter the public office or title.'
                          : 'Not ready — complete the person context.'
                  : customerSearchSelected && !hasCustomerSearchFields
                    ? 'Not ready — enter the product or category, city, and state.'
                    : !customerSearchSelected && !meetingTimeIsValid
                      ? 'Not ready — enter a valid meeting time or leave it blank.'
                      : !customerSearchSelected && !hasTopics
                        ? 'Not ready — select at least one topic.'
                        : sourceMode === 'sap' && !hasSapOrganization
                          ? 'Not ready — SAP briefings need a Company subject or a Chairman / CEO with a company.'
                          : sourceMode === 'sap' && !sapAreas.length
                            ? 'Not ready — select at least one SAP data area.'
                            : sourceMode === 'sap' && !sapSetupComplete
                              ? 'Not ready — complete the SAP connection and map at least one SAP area.'
                              : sourceMode === 'sap' && sapAreasUnavailable.length
                                ? `Not ready — this SAP connection does not enable: ${sapAreasUnavailable.map((area) => SAP_AREAS.find((item) => item.value === area)?.label ?? area).join(', ')}.`
                                : (sourceMode === 'public' || sourceMode === 'sap') && !tavilyConfigured
                                  ? 'Not ready — an active Tavily key is required for public research.'
                                  : (sourceMode === 'public' || sourceMode === 'sap') && crawlAlreadyActive
                                    ? 'Not ready — another briefing event is using the shared Tavily allowance. Wait for it to finish.'
                                    : (sourceMode === 'public' || sourceMode === 'sap') && dailyCrawlStartLimitReached
                                      ? 'Not ready — all 10 Tavily briefing events for today have been used. The counter resets at midnight IST.'
                                      : (sourceMode === 'public' || sourceMode === 'sap') && dailySearchQuotaInsufficient
                                         ? customerSearchSelected
                                           ? 'Not ready — no daily Tavily request remains for Customer Search. Try after the IST reset.'
                                           : `Not ready — only ${dailySearchRequestsRemaining ?? 0} daily Tavily search requests remain; reduce selected topics or try after the IST reset.`
                                        : readinessState === 'error'
                                          ? timedOutKey === requestKey
                                           ? `Not ready — the two-minute stop ended this ${customerSearchSelected ? 'search' : 'briefing'}.`
                                            : 'Not ready — source collection failed. Try again.'
                                          : readinessState === 'crawling'
                                             ? customerSearchSelected
                                               ? 'Searching current public business pages with Tavily only — one request, no Ollama.'
                                               : sourceMode === 'sap'
                                              ? 'Collecting Tavily public sources and approved SAP data — this briefing has up to two minutes.'
                                              : 'Collecting public sources — this briefing has up to two minutes.'
                                            : readinessState === 'ready'
                                               ? customerSearchSelected
                                                 ? 'Customer Search ready — public source links and any listed business contacts are available.'
                                                 : 'Brief ready — sources collected for the selected subject, meeting and topics.'
                                              : !hasRequiredSelections
                                                ? 'Not ready — complete the selected source settings.'
                                                : 'Not ready — press Brief when the settings are complete.';
  return (
    <main className={`paper-grid min-h-[100dvh] overflow-hidden ${isSignedIn ? (settingsTheme === 'dark' ? 'settings-neon' : 'settings-light') : ''}`}>
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        <nav className="no-print flex items-center justify-between border-b border-[#d9d4df] pb-4" aria-label="Main">
          <a href={`${basePath}/`} className="inline-flex items-center gap-2.5 text-foreground no-underline" aria-label="Briefing Agent home" data-testid="link-home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#292e46] text-[#d9cef3]"><FileText className="h-4 w-4" aria-hidden="true" /></span>
            <span className="text-[13px] font-bold tracking-[-.02em]">briefing<span className="font-normal text-[#786d93]"> agent</span></span>
          </a>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.14em] text-[#736d7d] sm:text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5b9b7e]" aria-hidden="true" /> Research, with receipts
            </span>
            {isSignedIn && aiStatus && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide sm:text-[10px] ${aiStatus.aiProviderConnected ? 'border-[#c7dfd2] bg-[#edf6f0] text-[#32634a]' : 'border-[#e5c5c0] bg-[#fbefed] text-[#7f413b]'}`}
                role="status"
                aria-label={`AI provider status: ${aiStatus.provider}, ${aiStatus.aiProviderConnected ? 'connected' : 'not connected'}`}
                title="Local Ollama model configured for this app"
                data-testid="ai-provider-badge"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                {`${aiStatus.aiProviderConnected ? 'Ollama' : 'Ollama offline'}${aiStatus.model ? ` · ${aiStatus.model}` : ''}`}
              </span>
            )}
            {isSignedIn && (
              <button
                type="button"
                onClick={() => setSettingsTheme((current) => current === 'dark' ? 'light' : 'dark')}
                aria-label={`Switch to ${settingsTheme === 'dark' ? 'light' : 'dark'} mode`}
                aria-pressed={settingsTheme === 'dark'}
                className="settings-theme-toggle rounded-lg border px-3 py-2 text-sm font-semibold transition"
                data-testid="button-settings-theme-toggle"
              >
                {settingsTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            )}
            <AuthActions />
            {!appInstalled && (
              <button
                type="button"
                onClick={() => void handleAppDownload()}
                className="pwa-download-button"
                aria-label="Download or install Briefing Agent"
                title="Install Briefing Agent on this device"
                data-testid="button-pwa-download"
              >
                Download
              </button>
            )}
          </div>
        </nav>

        <div className="mt-5 space-y-6 lg:mt-8">
          <section className="no-print fade-up" aria-labelledby="create-heading">
            {isSignedIn ? (
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[.14em] text-[#655487]">
                    {customerSearchSelected ? 'Person customer search · current public listings' : '30-day meeting brief'}
                  </p>
                  <h1 id="create-heading" className="mt-1 font-serif text-3xl leading-tight tracking-[-.02em] text-[#282d43]">Settings</h1>
                </div>
                <p className="text-base font-medium text-[#625d69]">Start a crawl only when you press Brief.</p>
              </div>
            ) : (
              <div className="mb-5 rounded-2xl border border-[#d8d2df] bg-[#f4f1f8] px-5 py-6 sm:px-8 sm:py-8">
                <p className="font-mono text-xs uppercase tracking-[.14em] text-[#655487]">Briefing Agent · source-first research</p>
                <h1 id="create-heading" className="mt-2 max-w-3xl font-serif text-4xl leading-tight tracking-[-.025em] text-[#282d43] sm:text-5xl">Your AI Briefing Assistant</h1>
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#514e5c]">Tavily Search finds cited public reports from the last 30 days. Optional Qwen summaries use each account’s saved Ollama connection when enabled.</p>
                <form
                  className="mt-6 max-w-4xl rounded-xl border border-[#d8d2df] bg-[#fffefa] p-4 sm:p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleGenerateBriefing();
                  }}
                  aria-label="Ask a public briefing question"
                  data-testid="landing-ask-form"
                >
                  <label htmlFor="landing-question" className="mb-2 block text-base font-semibold text-[#35364a]">Ask an open question</label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      id="landing-question"
                      type="text"
                      value={question}
                      onChange={(event) => {
                        setQuestion(event.target.value);
                        setLandingAskMessage('');
                      }}
                      maxLength={500}
                      required
                      placeholder="Ask about a company or person (for example, latest Finolex Cables launches)"
                      className="h-12 min-w-0 flex-1 rounded-lg border border-[#d9d4df] bg-white px-3 text-base text-foreground placeholder:text-[#777280] focus:border-[#8c7dae] focus:outline-none"
                      data-testid="input-landing-question"
                    />
                    <button
                      type="submit"
                      disabled={!question.trim()}
                      className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#292e46] px-5 text-base font-semibold text-white transition hover:bg-[#3c4160] disabled:cursor-not-allowed disabled:opacity-45"
                      data-testid="button-landing-generate-briefing"
                    >
                      Generate Briefing <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[#625d69]">
                    The question is sent to Tavily with the selected company or person and topics after you sign in, complete the brief, and enter your account PIN. No search starts before that. Don’t include private information.
                  </p>
                  {landingAskMessage && <p role="alert" className="mt-2 text-sm font-semibold text-[#8f4039]">{landingAskMessage}</p>}
                </form>
              </div>
            )}
            <form onSubmit={submit} className="rounded-2xl border border-[#d8d2df] bg-[#fbfaf6] p-5 shadow-[0_12px_35px_rgba(38,37,55,.06)] sm:p-6" aria-describedby={isSignedIn ? 'form-note' : undefined}>
              {!isSignedIn ? (
                <section className="rounded-xl border border-[#d8d2df] bg-[#f4f1f8] px-5 py-6 sm:px-7" aria-label="Sign in before starting a briefing" data-testid="signin-before-briefing">
                  <p className="text-sm font-semibold uppercase tracking-[.12em] text-[#655487]">Account required</p>
                  <h2 className="mt-2 font-serif text-2xl text-[#292e46]">Sign in before you brief.</h2>
                  <p className="mt-2 max-w-xl text-base leading-relaxed text-[#514e5c]">Sign in to create a short, cited brief. Source connections stay separate for each account.</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <a href={`${basePath}/sign-in`} className="inline-flex h-11 items-center justify-center rounded-lg bg-[#292e46] px-5 text-base font-semibold text-white transition hover:bg-[#3c4160]" data-testid="button-sign-in-before-briefing">Sign in</a>
                    <a href={`${basePath}/sign-up`} className="text-base font-semibold text-[#594b87] underline underline-offset-4" data-testid="button-create-account-before-briefing">Create an account</a>
                  </div>
                </section>
              ) : (
              <>
              <div className="mb-4 flex items-center justify-between border-b border-[#e5e0e7] pb-3">
                 <span className="text-base font-semibold text-[#292e46]">{customerSearchSelected ? 'Customer Search details' : 'Briefing details'}</span>
                 <span className="rounded-full bg-[#eeeaf4] px-3 py-1 font-mono text-xs font-semibold text-[#594b87]">{customerSearchSelected ? 'CURRENT' : '30 DAYS'}</span>
              </div>
              <fieldset className="mt-4">
                    <legend className="mb-2 text-base font-semibold text-[#35364a]">Briefing subject</legend>
                <div className="grid max-w-md grid-cols-2 gap-2">
                  {(['company', 'person'] as const).map((kind) => (
                    <label key={kind} className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${subjectType === kind ? 'border-[#9183ad] bg-[#f0edf6] text-[#493d65]' : 'border-[#d9d4df] bg-[#fffefa] text-[#777280]'}`}>
                      <input
                        type="radio"
                        name="subjectType"
                        value={kind}
                        checked={subjectType === kind}
                        onChange={() => {
                          setSubjectType(kind);
                          setPersonRole(null);
                          if (kind === 'company' && sourceMode === 'private') setSourceMode('public');
                        }}
                        className="accent-[#655487]"
                        data-testid={`radio-subject-type-${kind}`}
                      />
                      {kind === 'company' ? 'Company' : 'Person'}
                    </label>
                  ))}
                </div>
              </fieldset>

              {subjectType === 'person' && (
                <>
                  <fieldset className="mt-5" aria-describedby="person-role-note">
                    <legend className="mb-2 text-base font-semibold text-[#35364a]">Relevant role</legend>
                    <p id="person-role-note" className="mb-2 text-sm leading-relaxed text-[#625d69]">
                      MP is the government/public-office path; Corporate means a private-entity person. SAP briefs require a company scope.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {PERSON_ROLES.map((role) => (
                        <label
                          key={role.value}
                          className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-base font-semibold transition ${
                            personRole === role.value
                              ? 'border-[#9183ad] bg-[#f0edf6] text-[#493d65]'
                              : 'border-[#d9d4df] bg-[#fffefa] text-[#777280] hover:border-[#bbb1cc]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="personRole"
                            value={role.value}
                            checked={personRole === role.value}
                            onChange={() => {
                              setPersonRole(role.value);
                              setPublicRoleTitle(role.value === 'mp' ? 'MP' : '');
                              if (role.value !== 'business_owner') setCompanyName('');
                            }}
                            className="accent-[#655487]"
                            data-testid={`radio-person-role-${role.value}`}
                          />
                          {role.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {personRole === 'business_owner' && (
                    <label htmlFor="person-company" className="mt-4 block">
                      <span className="mb-1.5 block text-base font-semibold text-[#35364a]">Relevant company</span>
                      <input
                        id="person-company"
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        required
                        minLength={2}
                        maxLength={200}
                        placeholder="For example, Finolex Cables"
                        className="h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base text-foreground placeholder:text-[#777280] focus:border-[#8c7dae] focus:outline-none"
                        data-testid="input-person-company"
                      />
                    </label>
                  )}
                  {personRole === 'mp' && (
                    <label htmlFor="person-public-role" className="mt-4 block">
                      <span className="mb-1.5 block text-base font-semibold text-[#35364a]">Relevant office or title</span>
                      <input
                        id="person-public-role"
                        value={publicRoleTitle}
                        onChange={(event) => setPublicRoleTitle(event.target.value)}
                        required
                        minLength={2}
                        maxLength={80}
                        placeholder="MP or Corporator"
                        className="h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base text-foreground placeholder:text-[#777280] focus:border-[#8c7dae] focus:outline-none"
                        data-testid="input-person-public-role"
                      />
                    </label>
                  )}
                  <section className="mt-4 rounded-xl border border-[#e2dde8] bg-white/70 p-3" aria-label="Saved person details">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-[#35364a]">Saved person details</h3>
                        <p className="mt-1 text-sm leading-relaxed text-[#625d69]">Optional. Saved only to your account when you choose Save.</p>
                      </div>
                      {accountLoaded && !isSignedIn && (
                        <a href={`${basePath}/sign-in`} className="text-base font-semibold text-[#655487] underline underline-offset-4" data-testid="link-sign-in-save-person">
                          Sign in to save
                        </a>
                      )}
                    </div>
                    {accountLoaded && isSignedIn && (
                      <>
                        {savedPersonProfiles.length > 0 ? (
                          <label className="mt-3 block">
                            <span className="mb-1 block text-base font-semibold text-[#35364a]">Load a saved person</span>
                            <select
                              value={selectedSavedProfileId}
                              onChange={(event) => loadSavedPersonProfile(event.target.value)}
                              className="h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base text-foreground focus:border-[#8c7dae] focus:outline-none"
                              data-testid="select-saved-person-profile"
                            >
                              <option value="">Choose saved person details</option>
                              {savedPersonProfiles.map((profile) => {
                                const extra = profile.personRole === 'business_owner'
                                  ? profile.companyName
                                  : profile.personRole === 'mp'
                                    ? profile.publicRoleTitle
                                    : 'Private entity';
                                return (
                                  <option key={profile.id} value={profile.id}>
                                    {profile.personName} · {personRoleLabel(profile.personRole)}{extra ? ` · ${extra}` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        ) : (
                          <p className="mt-2 text-base text-[#625d69]">
                            {profileRequestPending ? 'Loading saved details…' : 'No saved person details yet.'}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void savePersonProfile()}
                            disabled={profileRequestPending || !personRole || !hasValidSubject || !hasValidPersonDetails}
                            className="h-11 rounded-lg bg-[#292e46] px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid="button-save-person-profile"
                          >
                            {profileRequestPending ? 'Saving…' : selectedProfileMatchesForm ? 'Update saved details' : 'Save person details'}
                          </button>
                          {selectedProfileMatchesForm && (
                            <button
                              type="button"
                              onClick={() => void forgetSavedPersonProfile()}
                              disabled={profileRequestPending}
                              className="h-11 rounded-lg border border-[#e5c5c0] px-4 text-base font-semibold text-[#8f4039] disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="button-remove-person-profile"
                            >
                              Remove saved details
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    {profileMessage && <p className="mt-2 text-base text-[#625d69]" role="status" aria-live="polite">{profileMessage}</p>}
                  </section>
                </>
              )}

              <fieldset className="mt-5">
                <legend className="mb-2 text-base font-semibold text-[#35364a]">Source</legend>
                <div className="grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3">
                  {([
                    { value: 'public', label: 'Public' },
                    { value: 'private', label: 'Private' },
                    { value: 'sap', label: 'SAP S/4HANA' },
                  ] as const).map(({ value, label }) => {
                    const unavailableForSubject = value === 'private' && subjectType === 'company';
                    const selected = sourceMode === value;
                    return (
                      <div key={value} className="relative">
                        <label
                          className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-base font-semibold transition ${
                            value === 'sap' && canStart ? 'pr-24' : ''
                          } ${
                            unavailableForSubject
                              ? 'cursor-not-allowed border-[#e3dfe5] bg-[#f4f2f4] text-[#a19ba5]'
                              : selected
                                ? value === 'sap'
                                  ? 'cursor-pointer border-[#54a7a3] bg-[#e8f5f3] text-[#245d5b]'
                                  : value === 'public'
                                    ? 'cursor-pointer border-[#9183ad] bg-[#f0edf6] text-[#493d65]'
                                    : 'cursor-pointer border-[#bd8b4a] bg-[#fff5e6] text-[#754a1f]'
                                : 'cursor-pointer border-[#d9d4df] bg-[#fffefa] text-[#777280] hover:border-[#bbb1cc]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="sourceMode"
                            value={value}
                            checked={selected}
                            disabled={unavailableForSubject}
                            onChange={() => handleSourceModeChange(value)}
                            className="accent-[#655487]"
                            data-testid={`radio-source-mode-${value}`}
                          />
                          {label}
                          {value === 'private' && <span className="text-sm font-normal">(Person only)</span>}
                        </label>
                        {value === 'sap' && canStart && (
                          <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                            <SapConnectionSettings
                              basePath={basePath}
                              onChanged={() => { void sourceStatusQuery.refetch(); }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              {sourceModeAlert && (
                <div className="mt-3 rounded-lg border border-[#e7c49c] bg-[#fff7e9] px-4 py-3 text-base leading-relaxed text-[#714d21]" role="alert" data-testid="alert-sap-source-fallback">
                  {sourceModeAlert}
                </div>
              )}
              <details className="mt-3 rounded-xl border border-[#ded9e2] bg-white/70 px-4 py-3" data-testid="details-source-key-settings">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-base font-semibold text-[#35364a]">
                  <span className="inline-flex items-center gap-2">
                    <LockKeyhole aria-hidden="true" className="h-4 w-4 text-[#594b87]" />
                    Tavily and Telegram settings · separate from SAP credentials
                  </span>
                  <span className="rounded-full bg-[#eeeaf4] px-2.5 py-1 text-xs font-semibold text-[#594b87]">Public + SAP briefs</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#625d69]">
                  Public searches use the active Tavily key shown below. SAP briefs also use Tavily for public reports and the separate SAP connection for internal records; each credential is stored and billed independently.
                </p>
                <div className="pt-3">
                  <TavilyKeySettings
                    onChanged={() => { void sourceStatusQuery.refetch(); }}
                    projectKeyActive={keySource === 'project-owner'}
                  />
                </div>
                <details className="mt-3 rounded-lg border border-[#d9d5e1] bg-white px-4 py-3" data-testid="details-telegram-settings">
                  <summary className="cursor-pointer text-base font-semibold text-[#35364a]">
                    Telegram PDF delivery · encrypted bot setup
                  </summary>
                  <TelegramSettings />
                </details>
              </details>
              {sourceMode === 'private' && (
                <div className="mt-3 rounded-lg border border-[#e5c5c0] bg-[#fbefed] px-4 py-3 text-base leading-relaxed text-[#7f413b]" role="status" data-testid="private-source-unavailable">
                  Private sources are not connected. No email, mailbox, or WhatsApp data will be collected.
                </div>
              )}
              {sourceMode === 'sap' && (
                <section className="mt-3 rounded-xl border border-[#c2ddda] bg-[#f2f9f8] p-4 sm:p-5" aria-labelledby="sap-area-heading" data-testid="sap-source-settings">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 id="sap-area-heading" className="text-base font-semibold text-[#245d5b]">SAP business-data areas</h2>
                      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#486d6b]">
                        SAP briefs combine cited public research from Tavily with read-only internal SAP records. Both connections must be ready; nothing is requested until you press Brief.
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${sapSetupComplete && tavilyConfigured ? 'bg-[#e5f2e9] text-[#32634a]' : 'bg-[#fff2de] text-[#79531f]'}`} data-testid="sap-connection-status">
                      {sapSetupComplete && tavilyConfigured ? 'SAP + Tavily ready' : 'Setup required'}
                    </span>
                  </div>
                  <fieldset className="mt-4">
                    <legend className="mb-2 text-sm font-semibold text-[#315f5d]">Select one or more areas</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {SAP_AREAS.map((area) => {
                        const enabled = !sapConfigured || sapAvailableAreas.includes(area.value);
                        const selected = sapAreas.includes(area.value);
                        return (
                          <label
                            key={area.value}
                            className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                              !enabled
                                ? 'cursor-not-allowed border-[#e3dfe5] bg-[#f4f2f4] text-[#a19ba5]'
                                : selected
                                  ? 'cursor-pointer border-[#54a7a3] bg-white text-[#245d5b]'
                                  : 'cursor-pointer border-[#d5e4e2] bg-white/70 text-[#526b69] hover:border-[#8ab9b5]'
                            }`}
                            data-testid={`sap-area-card-${area.value}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!enabled}
                              onChange={(event) => setSapAreas((selectedAreas) =>
                                event.target.checked
                                  ? [...selectedAreas, area.value]
                                  : selectedAreas.filter((item) => item !== area.value),
                              )}
                              className="h-4 w-4 shrink-0 accent-[#277b77]"
                              data-testid={`checkbox-sap-area-${area.value}`}
                            />
                            {area.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <p className="mt-3 text-sm leading-relaxed text-[#486d6b]" role="status" data-testid="sap-setup-guidance">
                    {sapConfigured
                      ? `The server connection exposes ${sapAvailableAreas.length} approved data area${sapAvailableAreas.length === 1 ? '' : 's'}. HR appears only when the SAP administrator enables it for this read-only connection.`
                      : 'The app owner must configure an approved SAP OData connection in the SAP connection settings above. Until then, SAP data is not accessed.'}
                  </p>
                </section>
              )}

              <label htmlFor="subject" className="mb-1.5 mt-4 block text-base font-semibold text-[#35364a]">
                {subjectType === 'company' ? 'Company name' : 'Person name'}
              </label>
              <input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
                minLength={2}
                maxLength={200}
                placeholder={subjectType === 'company' ? 'Enter a company name' : 'Enter a person’s name'}
                className="h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base text-foreground placeholder:text-[#777280] focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-subject"
              />

              <div className="mt-5" data-testid="topics-and-links-row">
              <fieldset className="min-w-0">
                <legend className="mb-3 flex w-full items-center justify-between gap-2 text-base font-semibold text-[#35364a]">
                  <span>Choose what to include</span>
                  <span className="font-mono text-xs font-normal text-[#6d6576]">
                    {customerSearchSelected ? 'Customer Search · 1 request' : `${topics.length} of 5 selected`}
                  </span>
                </legend>
                {sourceMode === 'sap' && (
                  <p className="mb-3 text-sm leading-relaxed text-[#486d6b]">
                    These topics organize any matching SAP records; the separate SAP Data section lists records from every selected SAP area.
                  </p>
                )}
                {!customerSearchSelected && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {TOPICS.map((topic, index) => (
                    <label
                      key={topic.value}
                      className={`flex min-h-[58px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-base transition ${
                        topics.includes(topic.value)
                          ? 'border-[#9284ae] bg-[#f0edf6] text-[#493d65]'
                          : 'border-[#ded9e2] bg-[#fffefa] text-[#777280] hover:border-[#bbb1cc]'
                      }`}
                      data-testid={`topic-card-${topic.value}`}
                    >
                      <input
                        type="checkbox"
                        checked={topics.includes(topic.value)}
                      onChange={(event) => setTopics((selected) => event.target.checked ? [...selected, topic.value] : selected.filter((value) => value !== topic.value))}
                        className="h-4 w-4 shrink-0 rounded accent-[#655487]"
                        data-testid={`checkbox-topic-${topic.value}`}
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-xs text-[#71658e]">0{index + 1}</span>
                        <span className="mt-0.5 block font-semibold leading-tight">{topic.label}</span>
                      </span>
                    </label>
                  ))}
                </div>}
                {customerSearchAvailable && (
                  <div className="mt-3">
                    <label
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-base transition ${
                        customerSearchSelected
                          ? 'border-[#54a7a3] bg-[#edf7f5] text-[#245d5b]'
                          : 'border-[#d9d4df] bg-[#fffefa] text-[#49405e] hover:border-[#8ab9b5]'
                      }`}
                      data-testid="customer-search-choice"
                    >
                      <input
                        type="checkbox"
                        checked={customerSearchSelected}
                        onChange={(event) => {
                          setCustomerSearchSelected(event.target.checked);
                          if (event.target.checked) setUseAi(false);
                          setPinDialogError('');
                        }}
                        className="h-5 w-5 shrink-0 accent-[#277b77]"
                        data-testid="checkbox-customer-search"
                      />
                      <span>
                        <span className="block font-semibold">Customer Search</span>
                        <span className="mt-0.5 block text-sm font-normal leading-relaxed">
                          Select this, fill the required fields, then press Search customers to open the PIN prompt.
                        </span>
                      </span>
                    </label>
                    {customerSearchSelected && (
                      <div className="mt-3 rounded-xl border border-[#d5e4e2] bg-[#f7fbfa] p-4" data-testid="customer-search-fields">
                        <p className="mb-4 text-sm leading-relaxed text-[#355c59]">
                          Enter every required field before the PIN prompt opens. This uses one Tavily request only; the regular topic choices are unchanged, and Ollama is not used.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block text-sm font-semibold text-[#35364a]">
                            Product or business category
                            <input
                              value={customerProductOrCategory}
                              onChange={(event) => setCustomerProductOrCategory(event.target.value)}
                              required
                              minLength={2}
                              maxLength={120}
                              placeholder="BOPP tape or software company"
                              className="mt-1.5 h-11 w-full rounded-lg border border-[#d9d4df] bg-white px-3 text-base font-normal text-[#292e46] placeholder:text-[#777280]"
                              data-testid="input-customer-product-category"
                            />
                          </label>
                          <label className="block text-sm font-semibold text-[#35364a]">
                            State
                            <select
                              value={customerState}
                              onChange={(event) => {
                                setCustomerState(event.target.value);
                                setCustomerCity('');
                                setCustomerCityCustom(false);
                              }}
                              required
                              className="mt-1.5 h-11 w-full rounded-lg border border-[#d9d4df] bg-white px-3 text-base font-normal text-[#292e46]"
                              data-testid="select-customer-state"
                            >
                              <option value="" disabled>Select a state or UT</option>
                              {INDIA_STATES.map((state) => (
                                <option key={state} value={state}>{state}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm font-semibold text-[#35364a]">
                            City
                            <select
                              value={customerCityCustom ? CUSTOMER_SEARCH_CUSTOM_CITY : customerCity}
                              onChange={(event) => {
                                if (event.target.value === CUSTOMER_SEARCH_CUSTOM_CITY) {
                                  setCustomerCity('');
                                  setCustomerCityCustom(true);
                                  return;
                                }
                                setCustomerCity(event.target.value);
                                setCustomerCityCustom(false);
                              }}
                              required={!customerCityCustom}
                              disabled={!customerState}
                              className="mt-1.5 h-11 w-full rounded-lg border border-[#d9d4df] bg-white px-3 text-base font-normal text-[#292e46] disabled:cursor-not-allowed disabled:bg-[#f0eef3] disabled:text-[#777280]"
                              data-testid="select-customer-city"
                            >
                              <option value="" disabled>
                                {customerState ? 'Select a city' : 'Choose a state first'}
                              </option>
                              {customerCityOptions.map((city) => (
                                <option key={city} value={city}>{city}</option>
                              ))}
                              {customerState && <option value={CUSTOMER_SEARCH_CUSTOM_CITY}>City not listed — enter manually</option>}
                            </select>
                            {customerCityCustom && (
                              <input
                                value={customerCity}
                                onChange={(event) => setCustomerCity(event.target.value)}
                                required
                                minLength={2}
                                maxLength={100}
                                autoComplete="address-level2"
                                placeholder="Type city or town"
                                className="mt-2 h-11 w-full rounded-lg border border-[#d9d4df] bg-white px-3 text-base font-normal text-[#292e46] placeholder:text-[#777280]"
                                data-testid="input-customer-city-custom"
                              />
                            )}
                          </label>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-[#486d6b]">
                          Only public results returned by Tavily are shown. Phone and role-based email appear only when present in the source snippet; every result includes its source link.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </fieldset>
              </div>

              {!customerSearchSelected && (
                <>
              <div className="mb-1.5 mt-5 flex items-center justify-between">
                <label htmlFor="briefing-question" className="text-base font-semibold text-[#35364a]">Open question (optional)</label>
                <span className="text-sm text-[#625d69]">{question.length} / 500</span>
              </div>
              <input
                id="briefing-question"
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={500}
                placeholder="Ask about the selected company or person"
                className="h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base text-foreground placeholder:text-[#777280] focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-briefing-question"
              />
              <p className="mt-1.5 text-sm leading-relaxed text-[#625d69]">
                This question guides the selected 30-day Tavily searches without adding requests. If you opt into AI, it is also sent with public evidence to your configured Ollama server.
              </p>

              <label htmlFor="meetingAt" className="mb-1.5 mt-5 block text-base font-semibold text-[#35364a]">Meeting time (optional)</label>
              <input
                id="meetingAt"
                type="datetime-local"
                value={meetingAt}
                onChange={(event) => setMeetingAt(event.target.value)}
                className="h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base text-foreground focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-meeting-time"
              />
              <p className="mt-1.5 text-sm text-[#625d69]">Leave blank to prepare a brief now. The 30-day research window still ends at the current time.</p>
              {researchWindow && (
                <p className="mt-2 text-sm text-[#625d69]" data-testid="text-research-window">
                  30-day research window ending today: <strong>{researchWindow}</strong>
                </p>
              )}

              <div className="mb-1.5 mt-5 flex items-center justify-between">
                <label htmlFor="context" className="text-base font-semibold text-[#35364a]">Optional context</label>
                <span className="text-sm text-[#625d69]">Optional</span>
              </div>
              <textarea
                id="context"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                maxLength={1500}
                rows={3}
                placeholder="For example: market condition, new cable plant"
                className="w-full resize-y rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 py-3 text-base leading-relaxed text-foreground placeholder:text-[#777280] focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-context"
              />
              <div className="mt-1 text-right text-sm text-[#625d69]">{context.length} / 1500</div>

              <label className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${aiStatus?.activated && canStart ? 'cursor-pointer border-[#b8a9e5] bg-[#f7f4ff]' : 'cursor-not-allowed border-[#ded9e2] bg-[#f6f4f0]'}`} data-testid="label-use-ai-briefing">
                <input
                  type="checkbox"
                  checked={useAi}
                  disabled={!aiStatus?.activated || !canStart}
                  onChange={(event) => setUseAi(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[#655487]"
                  data-testid="checkbox-use-ai-briefing"
                />
                <span>
                  <span className="block text-base font-semibold text-[#35364a]">Add AI summaries for selected topics</span>
            <span className="mt-1 block text-sm leading-relaxed text-[#625d69]">
                    Off by default. When enabled, one request is allowed per selected topic. The subject, open question, and accepted public-source titles and snippets are sent only to the configured Ollama server; SAP and private records remain separate.
                    {!canStart
                      ? ' Add an active Tavily key first; AI can only summarize results Tavily returns.'
                      : !aiStatus?.activated
                        ? ' Set up and activate AI below before selecting this.'
                        : ''}
                  </span>
                </span>
              </label>
                </>
              )}

              <div className="mt-5 flex flex-col gap-3 border-t border-[#e5e0e7] pt-4 sm:flex-row sm:items-center" data-testid="brief-action-row">
                <div
                  className={`flex min-h-12 flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-base font-semibold ${readinessStyles}`}
                  id="meeting-readiness"
                  role="status"
                  aria-live="polite"
                  data-testid="status-meeting-readiness"
                  data-state={readinessState}
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${readinessState === 'ready' ? 'bg-[#4c966f]' : readinessState === 'not-ready' || readinessState === 'error' ? 'bg-[#c45b50]' : 'animate-pulse bg-[#796a9d]'}`}
                    aria-hidden="true"
                  />
                  <span>{readinessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setPinDialogError(''); setStartPin(''); setPinPromptOpen(true); }}
                  disabled={!isSignedIn || isAnySearchPending || !canStart || !sourceReady || !startPinConfigured || !hasValidSubject || !hasValidRole || (!customerSearchSelected && !meetingTimeIsValid) || !hasRequiredSelections}
                  aria-describedby="meeting-readiness"
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#292e46] px-8 text-lg font-bold text-white transition hover:bg-[#3c4160] disabled:cursor-not-allowed disabled:opacity-45"
                  data-testid="button-generate-briefing"
                >
                  {isAnySearchPending
                    ? <><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />{customerSearchSelected ? 'Searching customers…' : 'Preparing brief…'}</>
                    : customerSearchSelected
                      ? <><Search className="h-5 w-5" aria-hidden="true" />Search customers<ArrowDown className="h-4 w-4" aria-hidden="true" /></>
                      : <><FileText className="h-5 w-5" aria-hidden="true" />Brief<ArrowDown className="h-4 w-4" aria-hidden="true" /></>}
                </button>
              </div>
              <div id="form-note" className="mt-3 space-y-2 text-sm leading-relaxed text-[#625d69]" data-testid="text-source-setup">
                <p>
                  {sourceStatusQuery.isLoading
                    ? 'Checking source setup…'
                    : sourceMode === 'public'
                      ? tavilyConfigured
                        ? 'Public search is connected through Tavily.'
                        : 'Public search key not available. Check source search key settings above.'
                      : sourceMode === 'sap'
                        ? sapSetupComplete && tavilyConfigured
                          ? 'SAP and Tavily are ready. Public research and approved SAP records are collected only when you press Brief.'
                          : 'SAP briefs need a ready SAP connection, at least one mapped area, and an active Tavily key. No data is read until Brief.'
                        : 'Private sources are not connected. No private data is read.'}
                </p>
                {(sourceMode === 'public' || sourceMode === 'sap') && canStart && dailyCrawlStartsUsed !== null && dailyCrawlStartsLimit !== null && (
                  <>
                    <p className="rounded-lg border border-[#d7cde9] bg-[#f5f1fb] px-4 py-3 font-semibold text-[#40345f]" data-testid="text-daily-briefing-events">
                      Today’s briefing events: {dailyCrawlStartsUsed}/{dailyCrawlStartsLimit} used · {dailyCrawlStartsRemaining ?? 0} remaining (resets at midnight IST).{dailySearchRequestsLimit !== null && dailySearchRequestsRemaining !== null ? ` Search requests remaining: ${dailySearchRequestsRemaining}/${dailySearchRequestsLimit}.` : ''} {customerSearchSelected ? 'Customer Search uses one request and one event.' : 'All selected tabs and the resulting brief belong to one event.'}
                    </p>
                    <DailyBriefingEventLimitSettings
                      currentLimit={dailyCrawlStartsLimit}
                      onSaved={() => sourceStatusQuery.refetch()}
                    />
                  </>
                )}
                {sourceMode === 'public' && (
                  <p>
                    {customerSearchSelected
                      ? 'Customer Search makes one current public-web Tavily request, without a 30-day date filter and without Ollama. It runs only after every required field is filled, you press Search customers, and verify the PIN. The two-minute limit and three-minute backup stop still apply.'
                      : 'Each event can search up to five selected topic tabs, one Tavily request per tab. A crawl can run for up to two minutes; the three-minute backup stop remains. The app-wide rate limit is five Tavily requests per rolling five minutes. Briefing starts only when you press Brief and verify the PIN.'}
                  </p>
                )}
                {sourceMode === 'sap' && (
                  <p>
                    Tavily uses one request per selected topic; SAP uses read-only requests for selected mapped areas. Both run under the same two-minute limit, with the existing three-minute backup stop and app-wide Tavily rate limit. The company or associated company must match the server-approved SAP scope.
                  </p>
                )}
              </div>
              </>
              )}
            </form>
            {isSignedIn && <AiGuardrailPanel onStatusChange={handleAiStatusChange} />}
            {isSignedIn && <PushNotificationSettings />}

            {pinPromptOpen && (
              <div
                className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-[#171827]/35 p-4 backdrop-blur-[1px]"
                role="presentation"
                onClick={(event) => {
                  if (event.target === event.currentTarget) closePinPrompt();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closePinPrompt();
                }}
              >
                <section
                  className="w-full max-w-md rounded-2xl border border-[#d8d2df] bg-[#fffefa] p-6 shadow-[0_24px_80px_rgba(22,22,36,.3)]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="start-pin-title"
                  aria-describedby="start-pin-description"
                  data-testid="dialog-start-pin"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#766a93]">Protected crawl</p>
                  <h2 id="start-pin-title" className="mt-2 font-serif text-2xl text-[#292e46]">Enter the start PIN</h2>
                  <p id="start-pin-description" className="mt-2 text-sm leading-relaxed text-[#625d69]">
                    {customerSearchSelected
                      ? 'The API Server checks this PIN before one public Tavily Customer Search. Ollama and private sources are not used.'
                      : 'The API Server checks this PIN for each crawl. It is not saved on this device.'}
                  </p>
                  <form onSubmit={submitStartPin} className="mt-5">
                    <label htmlFor="briefing-start-pin" className="mb-1.5 block text-xs font-semibold text-[#35364a]">Four-digit PIN</label>
                    <input
                      id="briefing-start-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      autoFocus
                      required
                      value={startPin}
                      onChange={(event) => {
                        setStartPin(event.target.value.replace(/\D/g, '').slice(0, 4));
                        setPinDialogError('');
                      }}
                      className="w-full rounded-lg border border-[#d9d4df] bg-white px-3 py-3 font-mono text-lg tracking-[.35em] text-[#292e46] focus:border-[#8c7dae] focus:outline-none"
                      aria-label="Four-digit briefing start PIN"
                      data-testid="input-start-pin"
                    />
                    {pinDialogError && (
                      <p className="mt-2 text-xs leading-relaxed text-[#8b4039]" role="alert" data-testid="text-start-pin-error">{pinDialogError}</p>
                    )}
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={closePinPrompt}
                        disabled={isAnySearchPending}
                        className="h-10 rounded-lg border border-[#d9d4df] px-4 text-sm font-semibold text-[#49405e] disabled:opacity-50"
                        data-testid="button-cancel-start-pin"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isAnySearchPending || startPin.length !== 4}
                        className="h-10 rounded-lg bg-[#292e46] px-4 text-sm font-semibold text-white disabled:opacity-50"
                        data-testid="button-confirm-start-pin"
                      >
                        {isAnySearchPending
                          ? customerSearchSelected ? 'Searching public businesses…' : 'Starting crawl…'
                          : customerSearchSelected ? 'Verify PIN & search' : 'Verify PIN & start'}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            )}

            {installHelpOpen && (
              <div
                className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-[#171827]/35 p-4 backdrop-blur-[1px]"
                role="presentation"
                onClick={(event) => {
                  if (event.target === event.currentTarget) setInstallHelpOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setInstallHelpOpen(false);
                }}
              >
                <section
                  className="w-full max-w-md rounded-2xl border border-[#cbd5e1] bg-white p-6 text-[#172033] shadow-[0_24px_80px_rgba(22,22,36,.3)]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="pwa-install-title"
                  data-testid="dialog-pwa-install"
                >
                  <p className="font-mono text-xs font-semibold uppercase tracking-[.12em] text-[#16813f]">Install Briefing Agent</p>
                  <h2 id="pwa-install-title" className="mt-2 text-2xl font-bold text-[#172033]">Add it to your device</h2>
                  <ol className="mt-4 list-decimal space-y-2 pl-5 text-base leading-relaxed text-[#34445e]">
                    <li>On Android or desktop Chrome, open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                    <li>On iPhone or iPad Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
                  </ol>
                  <p className="mt-4 text-sm leading-relaxed text-[#4b5870]">
                    The app shell can reopen offline after it has loaded once. Sign-in, searches, and source data still require an internet connection.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[#4b5870]">
                    Preview may be embedded and block installation. The Download button opens this same app in a full browser when possible; there, use the browser's Install app option or follow the steps above.
                  </p>
                  {window.self !== window.top && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex rounded-lg border border-[#16813f] px-4 py-2.5 text-base font-bold text-[#16813f] underline underline-offset-2"
                      data-testid="link-open-app-full-page"
                    >
                      Open app in full browser
                    </a>
                  )}
                  <div className="mt-5 flex justify-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setInstallHelpOpen(false)}
                        className="rounded-lg border border-[#cbd5e1] px-4 py-2.5 text-base font-semibold text-[#34445e]"
                        data-testid="button-close-pwa-install"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={markAppInstalled}
                        className="rounded-lg bg-[#16813f] px-4 py-2.5 text-base font-bold text-white"
                        data-testid="button-confirm-pwa-installed"
                      >
                        I installed it
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {isAnySearchPending && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ddd6e8] bg-[#f4f1f8] px-4 py-3" role="status" aria-live="polite" data-testid="status-generating">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center"><span className="h-2 w-2 animate-pulse rounded-full bg-[#796a9d]" /></span>
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#49405e]">{customerSearchSelected ? 'Searching public businesses' : 'Reading the latest coverage'}</p><p className="mt-1 text-[11px] leading-relaxed text-[#777082]">{customerSearchSelected ? 'One Tavily request only. Ollama is not used. The search stops after two minutes.' : 'Tavily searches first; optional Qwen follows. The whole request stops after two minutes.'}</p></div>
                <button
                  type="button"
                  onClick={() => {
                    setCancelledKey(requestKey);
                    activeRequestKey.current = `cancelled:${requestKey}`;
                    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
                    timeoutRef.current = undefined;
                    abortControllerRef.current?.abort(new DOMException('Briefing stopped by user.', 'AbortError'));
                    abortControllerRef.current = null;
                    setStartPin('');
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4b7b2] bg-[#fbefed] px-4 text-sm font-semibold text-[#98453e]"
                  data-testid="button-stop-briefing"
                >
                  <Square className="h-4 w-4 fill-current" aria-hidden="true" /> {customerSearchSelected ? 'Stop Tavily Search' : 'Stop Tavily + Qwen'}
                </button>
              </div>
            )}
            {currentRequestCancelled && !isAnySearchPending && (
              <div className="mt-4 rounded-xl border border-[#e4c9c3] bg-[#fbf0ed] p-4" role="status" data-testid="status-briefing-cancelled">
                {customerSearchSelected
                  ? 'The Tavily Customer Search was stopped. Ollama was not used.'
                  : 'Tavily search and any follow-up Qwen request were stopped.'}
              </div>
            )}
            {currentRequestFailed && !pinPromptOpen && (
              <div className="mt-4 rounded-xl border border-[#e4c9c3] bg-[#fbf0ed] p-4" role="alert" data-testid="status-generation-error">
                <p className="text-xs font-semibold text-[#8b4039]">{customerSearchSelected ? 'Couldn’t complete Customer Search' : 'Couldn’t prepare this briefing'}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#795750]">{errorMessage}</p>
                <p className="mt-3 text-xs font-semibold text-[#78443f]">Enter the PIN again when you want to retry.</p>
              </div>
            )}

          </section>

          <section ref={briefingOutputRef} className="min-w-0 scroll-mt-6" aria-live="polite" aria-label="Briefing" tabIndex={-1}>
            {currentRequestIsPending && !result && !customerSearchResult ? (
              <LoadingBrief customerSearch={customerSearchSelected} />
            ) : customerSearchResult ? (
              <CustomerSearchDocument result={customerSearchResult} />
            ) : result ? (
              <BriefingDocument result={result} />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function LoadingBrief({ customerSearch = false }: { customerSearch?: boolean }) {
  return (
    <div className="fade-up space-y-4" role="status" aria-live="polite" data-testid="loading-briefing">
      <div className="h-5 w-36 animate-pulse rounded bg-[#e4e0e8]" />
      <div className="rounded-2xl bg-[#292e46] p-8 sm:p-10">
        <div className="h-2.5 w-28 animate-pulse rounded bg-white/20" />
        <div className="mt-7 h-10 max-w-md animate-pulse rounded bg-white/15" />
        <div className="mt-4 h-3 w-52 animate-pulse rounded bg-white/10" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-7">
        <div className="h-2 w-32 animate-pulse rounded bg-[#e5e1eb]" />
        <div className="mt-5 h-5 w-full animate-pulse rounded bg-[#efecf1]" />
        <div className="mt-3 h-5 w-4/5 animate-pulse rounded bg-[#efecf1]" />
        <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-[#efecf1]" />
      </div>
      <p className="text-center font-mono text-[10px] uppercase tracking-[.14em] text-[#71658e]">
        {customerSearch ? 'Searching current public business sources' : 'Gathering what’s worth your attention'}
      </p>
    </div>
  );
}

type LocalNoteFileHandle = { getFile: () => Promise<File> };
type PwaFileLaunchQueue = {
  setConsumer: (consumer: (launch: { files?: LocalNoteFileHandle[] }) => void) => void;
};

function QuickNotePage() {
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const loadTextFile = useCallback(async (file: File) => {
    setMessage('');
    if (!/\.(txt|md)$/i.test(file.name)) {
      setMessage('Only .txt and .md files can be opened here.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setMessage('This local note is limited to 1 MB.');
      return;
    }
    try {
      setNote(await file.text());
      setMessage(`${file.name} opened locally. It was not uploaded or saved.`);
    } catch {
      setMessage('This file could not be read as text.');
    }
  }, []);

  useEffect(() => {
    const launchQueue = (window as Window & { launchQueue?: PwaFileLaunchQueue }).launchQueue;
    launchQueue?.setConsumer((launch) => {
      const firstFile = launch.files?.[0];
      if (!firstFile) return;
      void firstFile.getFile().then(loadTextFile).catch(() => {
        setMessage('The selected local file could not be opened.');
      });
    });
  }, [loadTextFile]);

  const copyNote = async () => {
    if (!note.trim()) {
      setMessage('Write or open a note before copying it.');
      return;
    }
    setBusy(true);
    try {
      await navigator.clipboard.writeText(note);
      setMessage('Copied. The note remains only in this page.');
    } catch {
      setMessage('Copy was blocked by the browser. Select the text and copy it manually.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#f3f6fb] px-4 py-8 text-[#292e46] sm:px-8">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#d6deeb] bg-white p-5 shadow-sm sm:p-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[.14em] text-[#655487]">Local note</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Quick note</h1>
        <p className="mt-3 rounded-xl border border-[#cdddcf] bg-[#f3fbf4] p-4 text-base leading-relaxed text-[#294532]">
          This note stays in this page. It is not uploaded, sent to Tavily, or saved to the server. Copy it before leaving if you want to keep it.
        </p>
        <label htmlFor="pwa-local-note" className="mt-5 block text-sm font-semibold">Note text</label>
        <textarea
          id="pwa-local-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={12}
          maxLength={20_000}
          className="mt-2 w-full resize-y rounded-xl border border-[#b8c3d4] bg-white p-4 text-base leading-relaxed text-[#20263a] outline-none focus:border-[#594b87] focus:ring-2 focus:ring-[#594b87]/20"
          placeholder="Write a note, or open a plain text or Markdown file."
          data-testid="textarea-local-note"
        />
        <label className="mt-4 block text-sm font-semibold" htmlFor="pwa-local-note-file">Open a local text file</label>
        <input
          id="pwa-local-note-file"
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadTextFile(file);
            event.currentTarget.value = '';
          }}
          className="mt-2 block w-full rounded-lg border border-[#d6deeb] bg-[#f8f9fc] p-3 text-base text-[#292e46]"
          data-testid="input-local-note-file"
        />
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void copyNote()}
            disabled={busy || !note}
            className="min-h-11 rounded-lg bg-[#292e46] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            data-testid="button-copy-local-note"
          >
            {busy ? 'Copying…' : 'Copy note'}
          </button>
          <button
            type="button"
            onClick={() => { setNote(''); setMessage('Note cleared from this page.'); }}
            disabled={!note}
            className="min-h-11 rounded-lg border border-[#b8c3d4] bg-white px-5 py-2 text-sm font-semibold text-[#292e46] disabled:opacity-50"
            data-testid="button-clear-local-note"
          >
            Clear note
          </button>
          <a
            href={`${basePath}/`}
            className="inline-flex min-h-11 items-center rounded-lg border border-[#b8c3d4] bg-white px-5 py-2 text-sm font-semibold text-[#292e46]"
            data-testid="link-return-to-briefing"
          >
            Return to Briefing Agent
          </a>
        </div>
        {message && <p className="mt-4 text-sm font-semibold text-[#51476e]" role="status" aria-live="polite">{message}</p>}
      </section>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/new-note" component={QuickNotePage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/" component={HomeRedirect} />
        <Route path="/user-portal" component={UserPortal} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/user-portal" /></Show>
      <Show when="signed-out"><Home /></Show>
    </>
  );
}

function UserPortal() {
  return (
    <>
      <Show when="signed-in"><Home /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[440px]">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
        <section className="mt-4 rounded-xl border border-[#ded9e2] bg-white px-5 py-4" aria-label="Account help">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base font-semibold text-[#292e46]">New to Briefing Agent?</p>
            <a
              href={`${basePath}/sign-up`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#292e46] px-5 text-base font-semibold text-white transition hover:bg-[#3c4160]"
              data-testid="button-create-account-sign-in"
            >
              Create account
            </a>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#625d69]" data-testid="text-password-reset-help">
            Forgot your password? For email-and-password sign-in, enter your email above and choose Continue; use the reset option on the password step. For Google sign-in, reset it with Google.
          </p>
        </section>
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your briefing account' } },
        signUp: { start: { title: 'Create your account', subtitle: 'Keep your provider connections separate' } },
      }}
      routerPush={(to) => setLocation(to.startsWith(basePath) ? to.slice(basePath.length) || '/' : to)}
      routerReplace={(to) => setLocation(to.startsWith(basePath) ? to.slice(basePath.length) || '/' : to, { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  if (!clerkPubKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY for account sign-in.');
  }
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
