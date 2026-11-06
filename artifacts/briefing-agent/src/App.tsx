// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetBriefingSourceStatusQueryKey, useCreateBriefing, useGetBriefingSourceStatus } from '@workspace/api-client-react';
import type { BriefingResult, BriefSource, SapDataArea } from '@workspace/api-client-react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ArrowDown, ArrowUpRight, Check, Clipboard, Clock3, FileText, Link2, LoaderCircle, Printer, Radio, Search, Square, Volume2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { SapConnectionSettings } from '@/components/sap-connection-settings';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
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

type AiGuardrailsStatus = {
  serverEnabled: boolean;
  passcodeConfigured: boolean;
  activated: boolean;
  requestsPerTab: number;
  speechLimitSeconds: number;
  aiProviderConnected: boolean;
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

async function sendGuardrailRequest(path: string, method: string, body?: unknown) {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'The AI access request failed.');
  return payload;
}

type TavilyCredentialStatus = {
  connected: boolean;
  storageReady: boolean;
  updatedAt: string | null;
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
          <h3 className="text-base font-semibold text-[#292e46]">Tavily key and billing</h3>
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

function AiGuardrailPanel() {
  const { isLoaded, isSignedIn } = useUser();
  const [status, setStatus] = useState<AiGuardrailsStatus | null>(null);
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(apiUrl('ai/guardrails'), { credentials: 'include' });
    const payload = await response.json().catch(() => ({})) as AiGuardrailsStatus & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Could not load AI guardrails.');
    setStatus(payload);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setStatus(null);
      return;
    }
    void refreshStatus().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load AI guardrails.');
    });
  }, [isLoaded, isSignedIn, refreshStatus]);

  const savePasscode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    if (passcode.length < 8 || passcode.length > 128) {
      setMessage('Use 8–128 characters for your activation passcode.');
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
      setMessage('Passcode saved. The server switch still controls whether AI can be activated.');
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The passcode could not be saved.');
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
      await sendGuardrailRequest('ai/guardrails/deactivate', 'POST');
      setPasscode('');
      setMessage('AI access stopped for this account.');
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
        AI control <span className="ml-2 rounded-full border border-[#e4b7b2] bg-[#bb5048] px-3 py-1 text-sm font-bold text-white">STOPPED · AI OFF</span>
      </summary>
      <div className="pt-3 text-base">
      <p className="leading-relaxed text-muted-foreground">
        No AI model or provider is connected. If configured later, limits are {status?.requestsPerTab ?? AI_REQUESTS_PER_TAB} request per selected tab and a {Math.floor((status?.speechLimitSeconds ?? AI_SPEECH_LIMIT_SECONDS) / 60)}-minute speech cap.
      </p>
      {status ? (
        <>
          <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={savePasscode}>
            <input
              aria-label="AI activation passcode"
              autoComplete="new-password"
              type="password"
              minLength={8}
              maxLength={128}
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="New activation passcode"
              className="h-11 min-w-0 rounded-lg border border-[#d8d1e5] bg-white px-3 text-base text-[#292e46] outline-none focus:ring-2 focus:ring-[#887ba7]"
            />
            <input
              aria-label="Confirm AI activation passcode"
              autoComplete="new-password"
              type="password"
              minLength={8}
              maxLength={128}
              value={confirmPasscode}
              onChange={(event) => setConfirmPasscode(event.target.value)}
              placeholder="Confirm passcode"
              className="h-11 min-w-0 rounded-lg border border-[#d8d1e5] bg-white px-3 text-base text-[#292e46] outline-none focus:ring-2 focus:ring-[#887ba7]"
            />
            <button type="submit" disabled={busy} className="h-11 rounded-lg bg-[#292e46] px-4 text-base font-semibold text-white disabled:opacity-50">Save passcode</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void activate()} disabled={busy || !status.serverEnabled || !status.passcodeConfigured || !status.aiProviderConnected || !passcode} className="h-11 rounded-lg border border-[#d7b3ae] bg-[#fbefed] px-4 text-base font-semibold text-[#98453e] disabled:cursor-not-allowed disabled:opacity-50">Activate AI</button>
            <button type="button" onClick={() => void deactivate()} disabled={busy || !status.activated} className="h-11 rounded-lg border border-[#d8d1e5] bg-white px-4 text-base font-semibold text-[#443a66] disabled:cursor-not-allowed disabled:opacity-50">Stop AI</button>
          </div>
          {!status.serverEnabled && <p className="mt-2 text-[#98453e]">The server switch is off. No AI request can run.</p>}
          {!status.aiProviderConnected && <p className="mt-1 text-muted-foreground">Per-user AI key setup is not available yet; AI remains stopped and no AI request can run.</p>}
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
        aria-label="AI is off and stopped"
        data-testid="status-ai-off"
      >
        <span className="h-2 w-2 rounded-full bg-[#c45b50]" aria-hidden="true" /> AI off · stopped
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
}: {
  topic: Topic;
  title: string;
  highlights: BriefingResult['highlights'];
  questions?: BriefingResult['questions'];
  sources: BriefSource[];
  openRoleSearchSubject?: string;
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
            Current job postings are not imported automatically; these links open LinkedIn searches.
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
      `Meeting: ${formatDate(result.meetingAt)}`,
      `Crawl started: ${formatDate(result.generatedAt)}`,
      `Research window: ${formatWindow(result.windowStart, result.windowEnd)}`,
      ...(result.sourceMode === 'sap' ? [`Source: SAP S/4HANA · ${result.sapAreas.map((area) => SAP_AREAS.find((item) => item.value === area)?.label ?? area).join(', ')}`] : []),
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
            'OPEN ROLES — LinkedIn searches; listings are not automatically crawled',
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
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyBrief} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-accent" data-testid="button-copy-brief">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy brief'}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#292e46] px-3 text-xs font-semibold text-white transition hover:bg-[#3c4160]" data-testid="button-print-brief-top">
            <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print one-page brief
          </button>
        </div>
      </div>

      <header className="print-card relative overflow-hidden rounded-2xl border border-[#d8d2df] bg-[#262b42] px-6 py-7 text-[#f6f1e8] shadow-[0_15px_45px_rgba(36,35,54,.12)] sm:px-9 sm:py-9">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-2 -top-12 h-44 w-44 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c5b9e8]">
            {result.sourceMode === 'sap' ? 'SAP S/4HANA · internal-data briefing' : `${result.subjectType} briefing`}
            {result.subjectType === 'person' && result.personRole ? ` · ${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)}` : ''}
          </p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-[.98] tracking-[-.02em] sm:text-5xl">{result.subject}</h2>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#d2d0da]">
            <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#c5b9e8]" />{formatDate(result.meetingAt)}</span>
            <span className="inline-flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-[#c5b9e8]" />Research window: {formatWindow(result.windowStart, result.windowEnd)}</span>
            {result.sourceMode === 'sap' ? (
              <span className="inline-flex items-center gap-2" data-testid="text-sap-usage">
                SAP areas: {result.sapAreas.length} · {result.sourceSearchesCompleted} read-only area request{result.sourceSearchesCompleted === 1 ? '' : 's'}
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

      {result.sourceMode !== 'sap' && (
      <>
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
          />
        );
      })}
      </>
      )}

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
              ? `No results were returned across ${result.sourceSearchesCompleted} selected-topic searches.`
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
      .slice(0, 1),
  );
  const printSapData = result.sapAreas.flatMap((area) =>
    result.sapData.filter((item) => item.area === area).slice(0, 1),
  );
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
    printTitle: printText(item.title, 72, 12),
    printDetail: printText(item.detail, 120, 20),
  }));
  const printTopicBlocks = printTopics.map((topic) => {
    const topicInfo = TOPICS.find((item) => item.value === topic)!;
    const highlights = printHighlights
      .filter((item) => item.category === topic)
      .map((highlight) => ({
        ...highlight,
        printTitle: printText(highlight.title, 100, 14),
        printSummary: printText(highlight.summary, 170, 34),
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
  const printedWordCount = [
    overviewText,
    ...(result.sourceMode === 'sap' ? [] : [topPositiveText, topNegativeText]),
    ...(result.sourceMode === 'sap'
      ? printSapRows.flatMap((item) => [item.printTitle, item.printDetail])
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
          {result.sourceMode === 'sap' ? 'SAP S/4HANA briefing' : `${result.subjectType} briefing`}
          {result.subjectType === 'person' && result.personRole ? ` · ${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)}` : ''}
          {result.sourceMode === 'sap'
            ? ` · ${result.sapAreas.map((area) => SAP_AREAS.find((item) => item.value === area)?.label ?? area).join(', ')} · 30-day window`
            : ` · ${activeTopic === 'all' ? 'all selected topics' : `${TOPICS.find((topic) => topic.value === activeTopic)?.label} tab`} · 30-day research window`}
        </p>
        <h1>{result.subject}</h1>
        <div className="print-date-details" data-testid="text-print-date-details">
          <span>Meeting: {formatDate(result.meetingAt)}</span>
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
        <section className="print-sap-data" aria-label="SAP data records" data-testid="print-sap-data">
          <h2>SAP Data</h2>
          {printSapRows.length ? printSapRows.map((item) => (
            <p key={`${item.area}-${item.recordId}`}>
              <strong>{SAP_AREAS.find((area) => area.value === item.area)?.label ?? item.area} · {item.printTitle}.</strong>{' '}
              {item.printDetail}{' '}
              <PrintReferences sourceIds={item.sourceIds} sources={result.sources} />
            </p>
          )) : <p>No matching SAP records were returned for the selected areas and 30-day window.</p>}
        </section>
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
                  {' on LinkedIn; listings are not crawled automatically.'}
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const mutation = useCreateBriefing({ request: { get signal() { return abortControllerRef.current?.signal; } } });
  const [subject, setSubject] = useState('');
  const [subjectType, setSubjectType] = useState<'company' | 'person'>('company');
  const [personRole, setPersonRole] = useState<PersonRole | null>(null);
  const [publicRoleTitle, setPublicRoleTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [savedPersonProfiles, setSavedPersonProfiles] = useState<SavedPersonProfile[]>([]);
  const [selectedSavedProfileId, setSelectedSavedProfileId] = useState('');
  const [profileRequestPending, setProfileRequestPending] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [sourceMode, setSourceMode] = useState<SourceMode>('public');
  const [sapAreas, setSapAreas] = useState<SapDataArea[]>([]);
  const [topics, setTopics] = useState<Topic[]>(TOPICS.map((topic) => topic.value));
  const [meetingAt, setMeetingAt] = useState('');
  const [context, setContext] = useState('');
  const [resultKey, setResultKey] = useState('');
  const [failedKey, setFailedKey] = useState('');
  const [timedOutKey, setTimedOutKey] = useState('');
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [startPin, setStartPin] = useState('');
  const [pinDialogError, setPinDialogError] = useState('');
  const activeRequestKey = useRef('');
  const timeoutRef = useRef<number | undefined>(undefined);
  const requestKey = JSON.stringify([subject.trim(), subjectType, personRole, publicRoleTitle.trim(), companyName.trim(), sourceMode, sourceMode === 'sap' ? sapAreas : [], meetingAt, topics, context.trim()]);
  const meetingTimeIsValid = Boolean(meetingAt && !Number.isNaN(new Date(meetingAt).getTime()));
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
  const hasTopics = topics.length > 0;
  const tavilyConfigured = sourceStatusQuery.data?.configured === true;
  const sapConfigured = sourceStatusQuery.data?.sapConfigured === true;
  const sapAvailableAreas = sourceStatusQuery.data?.sapAvailableAreas ?? [];
  const canStart = sourceStatusQuery.data?.canStart === true;
  const keySource = sourceStatusQuery.data?.keySource;
  const startPinConfigured = sourceStatusQuery.data?.startPinConfigured === true;
  const ownerAccountConfigured = sourceStatusQuery.data?.ownerAccountConfigured === true;
  const dailyCrawlStartsLimit = sourceStatusQuery.data?.dailyCrawlStartsLimit ?? null;
  const dailyCrawlStartsUsed = sourceStatusQuery.data?.dailyCrawlStartsUsed ?? null;
  const dailyCrawlStartsRemaining = sourceStatusQuery.data?.dailyCrawlStartsRemaining ?? null;
  const dailyCrawlActive = sourceStatusQuery.data?.dailyCrawlActive === true;
  const dailyCrawlStartLimitReached = canStart && dailyCrawlStartsRemaining === 0;
  const crawlAlreadyActive = dailyCrawlActive && !mutation.isPending;
  const sapAreasUnavailable = sapAreas.filter((area) => !sapAvailableAreas.includes(area));
  const sapSourceReady = sapConfigured && sapAreas.length > 0 && sapAreasUnavailable.length === 0;
  const hasSapOrganization = subjectType === 'company'
    ? subject.trim().length >= 2
    : personRole === 'business_owner' && companyName.trim().length >= 2;
  const sourceReady = sourceMode === 'public'
    ? tavilyConfigured && !dailyCrawlStartLimitReached && !crawlAlreadyActive
    : sourceMode === 'sap'
      ? sapSourceReady && hasSapOrganization
      : false;
  const hasRequiredSelections = hasTopics && (sourceMode !== 'sap' || sapAreas.length > 0);
  const hasCurrentResult = Boolean(mutation.data && resultKey === requestKey);
  const result = hasCurrentResult ? mutation.data : undefined;
  const currentRequestIsPending = mutation.isPending && activeRequestKey.current === requestKey;
  const currentRequestFailed = (mutation.isError && failedKey === requestKey) || timedOutKey === requestKey;
  const selectedSavedProfile = savedPersonProfiles.find((profile) => profile.id === selectedSavedProfileId);
  const selectedProfileMatchesForm = Boolean(
    selectedSavedProfile &&
    selectedSavedProfile.personName.trim().toLocaleLowerCase() === subject.trim().toLocaleLowerCase() &&
    selectedSavedProfile.personRole === personRole,
  );

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
    if (!meetingTimeIsValid) return '';
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    return `${formatDate(start.toISOString(), { dateStyle: 'medium' })} — ${formatDate(end.toISOString(), { dateStyle: 'medium' })}`;
  }, [meetingAt, meetingTimeIsValid]);

  const runBriefing = useCallback((key: string, pin: string) => {
    const selectedSourceReady =
      (sourceMode === 'public' &&
        tavilyConfigured &&
        !dailyCrawlStartLimitReached &&
        !crawlAlreadyActive) ||
      (sourceMode === 'sap' &&
        sapConfigured &&
        sapAreas.length > 0 &&
        hasSapOrganization &&
        sapAreas.every((area) => sapAvailableAreas.includes(area)));
    if (!/^\d{4}$/.test(pin) || !isSignedIn || !selectedSourceReady || !startPinConfigured || !ownerAccountConfigured || !hasValidSubject || !hasValidRole || !meetingTimeIsValid || !hasTopics || mutation.isPending) return;
    activeRequestKey.current = key;
    setFailedKey('');
    setTimedOutKey('');
    setPinDialogError('');
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    abortControllerRef.current = new AbortController();
    timeoutRef.current = window.setTimeout(() => {
      if (activeRequestKey.current === key) {
        setTimedOutKey(key);
        activeRequestKey.current = `timed-out:${key}`;
        abortControllerRef.current?.abort();
      }
    }, 180_000);
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
          meetingAt: new Date(meetingAt).toISOString(),
          topics,
          ...(context.trim() ? { context: context.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
          abortControllerRef.current = null;
          if (activeRequestKey.current === key) {
            setResultKey(key);
            setFailedKey('');
            setPinPromptOpen(false);
            setStartPin('');
          }
        },
        onError: (error) => {
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
          abortControllerRef.current = null;
          if (activeRequestKey.current === key) {
            setFailedKey(key);
            setStartPin('');
            setPinDialogError(
              error instanceof Error ? error.message : 'The PIN could not be verified.',
            );
          }
        },
        onSettled: () => {
          void sourceStatusQuery.refetch();
        },
      },
    );
  }, [companyName, context, crawlAlreadyActive, dailyCrawlStartLimitReached, hasSapOrganization, hasTopics, hasValidRole, hasValidSubject, isSignedIn, meetingAt, meetingTimeIsValid, mutation.isPending, mutation.mutate, ownerAccountConfigured, personRole, publicRoleTitle, sapAreas, sapAvailableAreas, sapConfigured, sourceMode, sourceStatusQuery.refetch, startPinConfigured, subject, subjectType, tavilyConfigured, topics]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    if (mutation.isPending) return;
    setPinPromptOpen(false);
    setStartPin('');
    setPinDialogError('');
  };

  const apiError = mutation.error as (Error & { data?: { error?: string } }) | null;
  const errorMessage = apiError?.data?.error ?? apiError?.message ?? 'The briefing could not be generated. Check your connection and try again.';
  const readinessState = !isSignedIn
    ? 'not-ready'
    : currentRequestFailed
      ? 'error'
      : currentRequestIsPending
        ? 'crawling'
        : hasCurrentResult
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
        : !ownerAccountConfigured
          ? 'Not ready — configure the approved account in API Server Secrets.'
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
                    : !meetingTimeIsValid
                      ? 'Not ready — set a meeting time.'
                      : !hasTopics
                        ? 'Not ready — select at least one topic.'
                        : sourceMode === 'sap' && !hasSapOrganization
                          ? 'Not ready — SAP briefings need a Company subject or a Chairman / CEO with a company.'
                          : sourceMode === 'sap' && !sapAreas.length
                            ? 'Not ready — select at least one SAP data area.'
                            : sourceMode === 'sap' && !sapConfigured
                              ? 'Not ready — SAP S/4HANA setup is required on the server. No SAP data is read before you press Brief.'
                              : sourceMode === 'sap' && sapAreasUnavailable.length
                                ? `Not ready — this SAP connection does not enable: ${sapAreasUnavailable.map((area) => SAP_AREAS.find((item) => item.value === area)?.label ?? area).join(', ')}.`
                                : sourceMode === 'public' && !tavilyConfigured
                                  ? 'Not ready — configure the owner Tavily key or save a personal key in account settings.'
                                  : sourceMode === 'public' && crawlAlreadyActive
                                    ? 'Not ready — another Tavily briefing event is running. Wait for it to finish.'
                                    : sourceMode === 'public' && dailyCrawlStartLimitReached
                                      ? 'Not ready — all 10 Tavily briefing events for today have been used. The counter resets at midnight IST.'
                                      : readinessState === 'error'
                                        ? timedOutKey === requestKey
                                          ? 'Not ready — the three-minute backup stop ended this crawl.'
                                          : 'Not ready — source collection failed. Try again.'
                                        : readinessState === 'crawling'
                                          ? sourceMode === 'sap'
                                            ? 'Collecting approved SAP data — this briefing has up to two minutes.'
                                            : 'Collecting public sources — this briefing has up to two minutes.'
                                          : readinessState === 'ready'
                                            ? 'Brief ready — sources collected for the selected subject, meeting and topics.'
                                            : !hasRequiredSelections
                                              ? 'Not ready — complete the selected source settings.'
                                              : 'Not ready — press Brief when the settings are complete.';
  return (
    <main className={`paper-grid min-h-[100dvh] overflow-hidden ${isSignedIn ? 'settings-neon' : ''}`}>
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
            <AuthActions />
          </div>
        </nav>

        <div className="mt-5 space-y-6 lg:mt-8">
          <section className="no-print fade-up" aria-labelledby="create-heading">
            {isSignedIn ? (
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[.14em] text-[#655487]">30-day meeting brief</p>
                  <h1 id="create-heading" className="mt-1 font-serif text-3xl leading-tight tracking-[-.02em] text-[#282d43]">Settings</h1>
                </div>
                <p className="text-base font-medium text-[#625d69]">Start a crawl only when you press Brief.</p>
              </div>
            ) : (
              <div className="mb-5 rounded-2xl border border-[#d8d2df] bg-[#f4f1f8] px-5 py-6 sm:px-8 sm:py-8">
                <p className="font-mono text-xs uppercase tracking-[.14em] text-[#655487]">Briefing Agent · source-first research</p>
                <h1 id="create-heading" className="mt-2 max-w-3xl font-serif text-4xl leading-tight tracking-[-.025em] text-[#282d43] sm:text-5xl">A short brief for the meeting ahead.</h1>
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#514e5c]">Review a company or person’s latest 30 days with factual links to the reporting. AI stays off; nothing runs until you request a brief.</p>
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
                <span className="text-base font-semibold text-[#292e46]">Briefing details</span>
                <span className="rounded-full bg-[#eeeaf4] px-3 py-1 font-mono text-xs font-semibold text-[#594b87]">30 DAYS</span>
              </div>
              {sourceMode === 'public' && (
              <details className="mb-4 rounded-xl border border-[#ded9e2] bg-white/65 px-4 py-3" data-testid="details-source-key-settings">
                <summary className="cursor-pointer text-base font-semibold text-[#35364a]">Source search key settings</summary>
                <div className="pt-3">
                  <TavilyKeySettings
                    onChanged={() => { void sourceStatusQuery.refetch(); }}
                    projectKeyActive={keySource === 'project-owner'}
                  />
                </div>
              </details>
              )}
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
                            value === 'sap' && canStart ? 'pr-14' : ''
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
                            onChange={() => setSourceMode(value)}
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
                        Choose the internal records to include. SAP is read only; it does not use Tavily. The selection is not read until you press Brief.
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${sapConfigured ? 'bg-[#e5f2e9] text-[#32634a]' : 'bg-[#fff2de] text-[#79531f]'}`} data-testid="sap-connection-status">
                      {sapConfigured ? 'SAP connection configured' : 'Setup required'}
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
                  <span className="font-mono text-xs font-normal text-[#6d6576]">{topics.length} of 5 selected</span>
                </legend>
                {sourceMode === 'sap' && (
                  <p className="mb-3 text-sm leading-relaxed text-[#486d6b]">
                    These topics organize any matching SAP records; the separate SAP Data section lists records from every selected SAP area.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
                </div>
              </fieldset>
              </div>

              <label htmlFor="meetingAt" className="mb-1.5 mt-5 block text-base font-semibold text-[#35364a]">Meeting time</label>
              <input
                id="meetingAt"
                type="datetime-local"
                value={meetingAt}
                onChange={(event) => setMeetingAt(event.target.value)}
                required
                className="h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base text-foreground focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-meeting-time"
              />
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
                  disabled={mutation.isPending || !canStart || !sourceReady || !startPinConfigured || !ownerAccountConfigured || !hasValidSubject || !hasValidRole || !meetingTimeIsValid || !hasRequiredSelections}
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#292e46] px-8 text-lg font-bold text-white transition hover:bg-[#3c4160] disabled:cursor-not-allowed disabled:opacity-45"
                  data-testid="button-generate-briefing"
                >
                  {mutation.isPending
                    ? <><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />Preparing brief…</>
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
                        ? sapConfigured
                          ? 'SAP S/4HANA connection settings are present. SAP access is checked only when you press Brief.'
                          : 'SAP S/4HANA connection is not configured. No SAP data is read.'
                        : 'Private sources are not connected. No private data is read.'}
                </p>
                {sourceMode === 'public' && canStart && dailyCrawlStartsUsed !== null && dailyCrawlStartsLimit !== null && (
                  <p className="rounded-lg border border-[#d7cde9] bg-[#f5f1fb] px-4 py-3 font-semibold text-[#40345f]" data-testid="text-daily-briefing-events">
                    Today’s Tavily briefing events: {dailyCrawlStartsUsed}/{dailyCrawlStartsLimit} used · {dailyCrawlStartsRemaining ?? 0} remaining (resets at midnight IST). All selected tabs and the resulting print/copy belong to one event.
                  </p>
                )}
                {sourceMode === 'public' && (
                  <p>
                    Each event can search up to five selected topic tabs, one Tavily request per tab. A crawl can run for up to two minutes; the three-minute backup stop remains. The app-wide rate limit stays at 10 Tavily requests per five minutes. Briefing starts only when you press Brief and verify the PIN.
                  </p>
                )}
                {sourceMode === 'sap' && (
                  <p>
                    SAP uses one read-only request per selected area whose configured topic is selected. It does not use Tavily credits or Tavily request limits. The company or associated company must match the server-approved SAP scope.
                  </p>
                )}
              </div>
              <AiGuardrailPanel />
              </>
              )}
            </form>

            {pinPromptOpen && (
              <div
                className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-[#171827]/60 p-4 backdrop-blur-[2px]"
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
                    The API Server checks this PIN for each crawl. It is not saved on this device.
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
                        disabled={mutation.isPending}
                        className="h-10 rounded-lg border border-[#d9d4df] px-4 text-sm font-semibold text-[#49405e] disabled:opacity-50"
                        data-testid="button-cancel-start-pin"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={mutation.isPending || startPin.length !== 4}
                        className="h-10 rounded-lg bg-[#292e46] px-4 text-sm font-semibold text-white disabled:opacity-50"
                        data-testid="button-confirm-start-pin"
                      >
                        {mutation.isPending ? 'Starting crawl…' : 'Verify PIN & start'}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            )}

            {mutation.isPending && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#ddd6e8] bg-[#f4f1f8] px-4 py-3" role="status" aria-live="polite" data-testid="status-generating">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center"><span className="h-2 w-2 animate-pulse rounded-full bg-[#796a9d]" /></span>
                <div><p className="text-xs font-semibold text-[#49405e]">Reading the latest coverage</p><p className="mt-1 text-[11px] leading-relaxed text-[#777082]">Finding useful signals and checking every reference.</p></div>
              </div>
            )}
            {currentRequestFailed && !pinPromptOpen && (
              <div className="mt-4 rounded-xl border border-[#e4c9c3] bg-[#fbf0ed] p-4" role="alert" data-testid="status-generation-error">
                <p className="text-xs font-semibold text-[#8b4039]">Couldn’t prepare this briefing</p>
                <p className="mt-1 text-xs leading-relaxed text-[#795750]">{errorMessage}</p>
                <p className="mt-3 text-xs font-semibold text-[#78443f]">Press Start again when you want to retry.</p>
              </div>
            )}

          </section>

          <section className="min-w-0" aria-live="polite" aria-label="Briefing">
            {currentRequestIsPending && !result ? (
              <LoadingBrief />
            ) : result ? (
              <BriefingDocument result={result} />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function LoadingBrief() {
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
      <p className="text-center font-mono text-[10px] uppercase tracking-[.14em] text-[#71658e]">Gathering what’s worth your attention</p>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
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
