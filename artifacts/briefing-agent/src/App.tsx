import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetBriefingSourceStatusQueryKey, useCreateBriefing, useGetBriefingSourceStatus } from '@workspace/api-client-react';
import type { BriefingResult, BriefSource } from '@workspace/api-client-react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ArrowDown, ArrowUpRight, Check, Clipboard, Clock3, FileText, Link2, LoaderCircle, Play, Printer, Radio, RefreshCw, Search, Square, Volume2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
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
const PERSON_ROLES = [
  { value: 'business_owner', label: 'Chairman / CEO' },
  { value: 'mp', label: 'MP' },
  { value: 'corporate', label: 'Corporate' },
] as const;
type PersonRole = typeof PERSON_ROLES[number]['value'];
type SourceMode = 'public' | 'private';
const SPEECH_WORD_LIMIT = 280;
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
    <section className="no-print mt-4 rounded-xl border border-[#ded9e5] bg-[#f8f6fb] p-3 text-[11px]" aria-label="AI activation guardrails" data-testid="ai-guardrails">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="font-mono uppercase tracking-[.1em] text-[#443a66]">AI guardrails</strong>
        <span className={`rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[.12em] ${status?.activated ? 'bg-[#e7f2eb] text-[#2f6d4c]' : 'bg-[#fbefed] text-[#98453e]'}`}>
          {status?.activated ? 'Account active' : 'Stopped'}
        </span>
      </div>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        Server switch: {status?.serverEnabled ? 'ON' : 'OFF'} · {status?.requestsPerTab ?? AI_REQUESTS_PER_TAB} AI request per selected tab · {Math.floor((status?.speechLimitSeconds ?? AI_SPEECH_LIMIT_SECONDS) / 60)}-minute total speech cap across the briefing. Your phone number is not used as a password.
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
              className="h-9 min-w-0 rounded-lg border border-[#d8d1e5] bg-white px-3 text-xs text-[#292e46] outline-none focus:ring-2 focus:ring-[#887ba7]"
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
              className="h-9 min-w-0 rounded-lg border border-[#d8d1e5] bg-white px-3 text-xs text-[#292e46] outline-none focus:ring-2 focus:ring-[#887ba7]"
            />
            <button type="submit" disabled={busy} className="h-9 rounded-lg bg-[#292e46] px-3 text-xs font-semibold text-white disabled:opacity-50">Save passcode</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void activate()} disabled={busy || !status.serverEnabled || !status.passcodeConfigured || !status.aiProviderConnected || !passcode} className="h-9 rounded-lg border border-[#d7b3ae] bg-[#fbefed] px-3 text-xs font-semibold text-[#98453e] disabled:cursor-not-allowed disabled:opacity-50">Activate AI</button>
            <button type="button" onClick={() => void deactivate()} disabled={busy || !status.activated} className="h-9 rounded-lg border border-[#d8d1e5] bg-white px-3 text-xs font-semibold text-[#443a66] disabled:cursor-not-allowed disabled:opacity-50">Stop AI</button>
          </div>
          {!status.serverEnabled && <p className="mt-2 text-[#98453e]">The server switch is off. No AI request can run.</p>}
          {!status.aiProviderConnected && <p className="mt-1 text-muted-foreground">Per-user AI key setup is not available yet; AI remains stopped and no AI request can run.</p>}
        </>
      ) : (
        <p className="mt-2 text-[#98453e]" role="status">{message || 'AI access settings are unavailable.'}</p>
      )}
      {message && status && <p className="mt-2 text-muted-foreground" role="status">{message}</p>}
    </section>
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
  if (!sources.length) return <p className="text-sm text-muted-foreground">Links will appear here after the source crawl.</p>;
  return (
    <ol className="divide-y divide-border/80">
      {sources.map((source, index) => (
        <li id={`source-${encodeURIComponent(source.id)}`} key={source.id} className="scroll-mt-8 py-5 first:pt-1 last:pb-1" data-testid={`source-entry-${index + 1}`}>
          <div className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d8d1e5] bg-[#f1eef7] font-mono text-[11px] text-[#594b87]">{source.id}</span>
            <div className="min-w-0 flex-1">
              <a href={source.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1.5 text-[15px] font-semibold leading-snug text-foreground decoration-[#8a7bb0] underline-offset-4 hover:underline" data-testid={`link-source-title-${index + 1}`}>
                <span>{source.title}</span><ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </a>
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
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-[#655b7a]">{source.publisher}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={source.publishedAt ?? undefined}>{formatDate(source.publishedAt, { dateStyle: 'medium' })}</time>
              </div>
              {source.snippet && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{source.snippet}</p>}
              <a className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[10px] text-[#71658e] underline decoration-[#c7bfd7] underline-offset-2 hover:text-primary" href={source.url} target="_blank" rel="noreferrer" aria-label={`Open URL for ${source.title}`} data-testid={`link-source-url-${index + 1}`}>
                <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{source.url}</span>
              </a>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SourceColumn({ sources }: { sources: BriefSource[] }) {
  const hasVideo = sources.some(isVideoSource);
  return (
    <aside className="source-column space-y-4" aria-label="Source links and video" data-testid="source-column">
      <section className="rounded-2xl border border-border bg-card px-5 py-5 sm:px-6" aria-labelledby="source-column-heading" data-testid="links-box">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <SectionEyebrow>Trace every claim</SectionEyebrow>
            <h3 id="source-column-heading" className="mt-2 font-serif text-2xl text-foreground">Links</h3>
          </div>
          <span className="rounded-full bg-[#f1eef7] px-3 py-1 font-mono text-[10px] text-[#5d5279]">{sources.length} links</span>
        </div>
        <div className="max-h-[280px] overflow-y-auto pr-1">
          <SourceList sources={sources} />
        </div>
      </section>
      {!hasVideo && (
        <section className="rounded-2xl border border-border bg-card px-5 py-5 sm:px-6" aria-labelledby="video-column-heading">
          <SectionEyebrow>Source media</SectionEyebrow>
          <h3 id="video-column-heading" className="mt-2 font-serif text-2xl text-foreground">Video box</h3>
          <div className="source-video video-placeholder mt-4" data-testid="video-placeholder">
            <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{sources.length ? 'No video source found in this crawl.' : 'A playable video appears here when found.'}</span>
          </div>
        </section>
      )}
    </aside>
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
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3" data-testid="voice-controls">
      <button
        type="button"
        disabled
        title="AI voice is stopped and not connected. It stays off until you ask for AI integration."
        aria-describedby="ai-voice-status"
        className="voice-button voice-button-stopped flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-full text-[11px] font-bold text-white"
        aria-label="AI voice stopped and not connected"
        data-testid="button-ai-voice"
      >
        <Volume2 className="h-5 w-5" aria-hidden="true" />
        AI voice
      </button>
      <div className="min-w-0">
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => window.speechSynthesis?.cancel()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e4b7b2] bg-[#fbefed] px-3 text-xs font-semibold text-[#98453e] transition hover:bg-[#f7e1de]"
            data-testid="button-stop-speech"
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> Stop
          </button>
          <button
            type="button"
            disabled={!hasText}
            onClick={() => speakBlock(text)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cde0d4] bg-[#edf6f0] px-3 text-xs font-semibold text-[#32634a] transition hover:bg-[#e2f0e7] disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="button-read-briefing"
          >
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Read aloud
          </button>
          <button
            type="button"
            disabled
            title="AI Q&A is stopped until you authorize the app user's AI connection."
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e4b7b2] bg-[#fbefed] px-3 text-xs font-semibold text-[#98453e] disabled:cursor-not-allowed"
            data-testid="button-ask-ai-question"
          >
            Ask a spoken question
          </button>
        </div>
        <p id="ai-voice-status" className="mt-2 max-w-52 text-[10px] leading-relaxed text-muted-foreground">
          AI voice and Q&A are stopped. If enabled later, they will use your own AI credentials; none are connected.
        </p>
        <p className="mt-1 max-w-60 text-[10px] leading-relaxed text-muted-foreground" data-testid="status-speech-estimate">
          {hasText
            ? `Speech preview: ${estimate.words}/${SPEECH_WORD_LIMIT} words spoken, ${text.length} characters; ${estimate.totalWords} words total${estimate.clipped ? ' — capped at 2 minutes' : ''}. Device estimate: about ${seconds}s. AI provider calls are off, so no AI speech cost is incurred.`
            : `0/${SPEECH_WORD_LIMIT} speech words, 0 characters. AI voice is off; device read-aloud starts after the crawl.`}
        </p>
        <AiGuardrailPanel />
      </div>
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
  const readable = [
    ...(!filteredHighlights.length && !filteredQuestions.length
      ? [topic === 'hire' ? 'No confirmed-hire reports were returned by the public-news crawl.' : `${title}. No matching items.`]
      : []),
    ...filteredHighlights.flatMap((item) => [item.title, item.summary]),
    ...filteredQuestions.map((item) => item.text),
    ...(openRoleSearchSubject
      ? ['Open job listings are not imported automatically. Use the LinkedIn Sales and Maintenance search links for current postings.']
      : []),
  ].join('. ');
  return (
    <section className="topic-block print-card mt-7 rounded-2xl border border-border bg-card px-5 py-5 sm:px-7" aria-labelledby={`topic-${topic}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionEyebrow>{TOPICS.find((item) => item.value === topic)?.label}</SectionEyebrow>
          <h3 id={`topic-${topic}`} className="mt-2 font-serif text-3xl text-foreground">{title}</h3>
        </div>
        <button type="button" onClick={() => speakBlock(readable)} className="no-print inline-flex h-9 items-center gap-2 rounded-lg border border-[#cde0d4] bg-[#edf6f0] px-3 text-xs font-semibold text-[#32634a] hover:bg-[#e2f0e7]" data-testid={`button-repeat-${topic}`}>
          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Repeat
        </button>
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
              <p className="briefing-prose mt-2 text-sm leading-[1.75] text-[#5f6070]">
                {item.summary}<References sourceIds={item.sourceIds} sources={sources} />
              </p>
            </article>
          ))}
          {filteredQuestions.map((question, index) => (
            <p key={`${question.text}-${index}`} className="briefing-prose border-t border-[#ded9e5] pt-3 text-sm leading-relaxed text-[#454151]" data-testid={`question-${topic}-${index + 1}`}>
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
    ]);
    const visibleSources = activeTopic === 'all'
      ? result.sources
      : result.sources.filter((source) => visibleSourceIds.has(source.id));
    const lines = [
      `${result.subject} — ${activeTopic === 'all' ? 'meeting briefing' : `${TOPICS.find((topic) => topic.value === activeTopic)?.label ?? 'Topic'} briefing`}`,
      `Meeting: ${formatDate(result.meetingAt)}`,
      `Research window: ${formatWindow(result.windowStart, result.windowEnd)}`,
      ...(result.personRole ? [`Briefing context: ${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)}`] : []),
      '',
      'OVERVIEW',
      `${visibleOverview.text}${visibleOverview.sourceIds.length ? ` [${visibleOverview.sourceIds.join(', ')}]` : ''}`,
      `TOP POSITIVE: ${visibleOverview.topPositive.text}${visibleOverview.topPositive.sourceIds.length ? ` [${visibleOverview.topPositive.sourceIds.join(', ')}]` : ''}`,
      `TOP NEGATIVE: ${visibleOverview.topNegative.text}${visibleOverview.topNegative.sourceIds.length ? ` [${visibleOverview.topNegative.sourceIds.join(', ')}]` : ''}`,
      '',
      'HIGHLIGHTS',
      ...visibleHighlights.flatMap((item) => [`${item.category.toUpperCase()}: ${item.title}`, `${item.summary}${item.sourceIds.length ? ` [${item.sourceIds.join(', ')}]` : ''}`, '']),
      ...(result.subjectType === 'company' && result.topics.includes('hire') && (activeTopic === 'all' || activeTopic === 'hire')
        ? [
            'OPEN ROLES — LinkedIn searches; listings are not automatically crawled',
            `Sales: ${linkedinJobsSearchUrl(result.subject, 'sales')}`,
            `Maintenance: ${linkedinJobsSearchUrl(result.subject, 'maintenance')}`,
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
          Prepared {formatDate(result.generatedAt)}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyBrief} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-accent" data-testid="button-copy-brief">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy brief'}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-accent" data-testid="button-print-brief">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </div>

      <header className="print-card relative overflow-hidden rounded-2xl border border-[#d8d2df] bg-[#262b42] px-6 py-7 text-[#f6f1e8] shadow-[0_15px_45px_rgba(36,35,54,.12)] sm:px-9 sm:py-9">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-2 -top-12 h-44 w-44 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c5b9e8]">
            {result.subjectType === 'person' && result.personRole ? `${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)} · ` : ''}{result.subjectType} briefing
          </p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-[.98] tracking-[-.02em] sm:text-5xl">{result.subject}</h2>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#d2d0da]">
            <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#c5b9e8]" />{formatDate(result.meetingAt)}</span>
            <span className="inline-flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-[#c5b9e8]" />Research window: {formatWindow(result.windowStart, result.windowEnd)}</span>
            <span className="inline-flex items-center gap-2" data-testid="text-tavily-usage">
              Tavily: {result.searchCreditsUsed === null ? 'usage not reported' : `${result.searchCreditsUsed} credit${result.searchCreditsUsed === 1 ? '' : 's'}`} · {result.sourceSearchesCompleted} basic topic search{result.sourceSearchesCompleted === 1 ? '' : 'es'}
            </span>
          </div>
        </div>
      </header>

      <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-[#d8d2df] bg-[#f4f1e9] p-5 sm:p-6" data-testid="voice-summary">
        <div className="max-w-md">
          <SectionEyebrow>Listen before you walk in</SectionEyebrow>
          <p className="mt-2 text-sm leading-relaxed text-[#65616d]">Read this brief aloud using your device’s built-in voice. No AI voice service is connected.</p>
        </div>
        <VoiceControls text={[
          visibleOverview.text,
          `Top positive: ${visibleOverview.topPositive.text}`,
          `Top negative: ${visibleOverview.topNegative.text}`,
          ...visibleHighlights.flatMap((item) => [item.title, item.summary]),
          ...visibleQuestions.map((question) => question.text),
          ...(result.subjectType === 'company' && result.topics.includes('hire') && (activeTopic === 'all' || activeTopic === 'hire')
            ? ['Open job listings are not imported automatically. Use the LinkedIn Sales and Maintenance search links in Hires.']
            : []),
        ].join('. ')} />
      </div>

      <div className="mt-5" data-testid="briefing-columns">
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
      </section>

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
            openRoleSearchSubject={topic === 'hire' && result.subjectType === 'company' ? result.subject : undefined}
          />
        );
      })}

      </div>
      <p className="no-print mt-5 text-right font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Generated {formatDate(result.generatedAt)}</p>
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
  const firstHighlights = printTopics.flatMap((topic) => result.highlights.filter((item) => item.category === topic).slice(0, 1));
  const firstQuestion = printTopics.includes('risk') ? result.questions.slice(0, 1) : [];
  const sourceIds = new Set([
    ...printBrief.sourceIds,
    ...printBrief.topPositive.sourceIds,
    ...printBrief.topNegative.sourceIds,
    ...firstHighlights.flatMap((item) => item.sourceIds),
    ...firstQuestion.flatMap((item) => item.sourceIds),
  ]);
  const sources = result.sources.filter((source) => sourceIds.has(source.id));
  const briefLine = (text: string, maxLength: number) => text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;

  return (
    <section className="print-only print-one-page" aria-label="One-page printable briefing" data-testid="print-one-page-brief">
      <header className="print-page-header">
        <p>{result.subjectType === 'person' && result.personRole ? `${personContextLabel(result.personRole, result.publicRoleTitle, result.companyName)} · ` : ''}{result.subjectType} briefing · {activeTopic === 'all' ? 'all selected topics' : `${TOPICS.find((topic) => topic.value === activeTopic)?.label} tab`} · 30-day research window</p>
        <h1>{result.subject}</h1>
        <div>{formatDate(result.meetingAt)} <span aria-hidden="true">·</span> {formatWindow(result.windowStart, result.windowEnd)}</div>
      </header>
      <section className="print-page-overview">
        <h2>Brief</h2>
        <p>{briefLine(printBrief.text, 420)} <PrintReferences sourceIds={printBrief.sourceIds} sources={result.sources} /></p>
        <p><strong>Top positive:</strong> {briefLine(printBrief.topPositive.text, 130)} <PrintReferences sourceIds={printBrief.topPositive.sourceIds} sources={result.sources} /></p>
        <p><strong>Top negative:</strong> {briefLine(printBrief.topNegative.text, 130)} <PrintReferences sourceIds={printBrief.topNegative.sourceIds} sources={result.sources} /></p>
      </section>
      <div className="print-topic-grid">
        {printTopics.map((topic) => {
          const topicInfo = TOPICS.find((item) => item.value === topic)!;
          const highlight = result.highlights.find((item) => item.category === topic);
          const question = topic === 'risk' ? result.questions[0] : undefined;
          return (
            <section key={topic} className="print-topic">
              <h2>{topicInfo.label}</h2>
              {highlight ? (
                <p><strong>{briefLine(highlight.title, 90)}.</strong> {briefLine(highlight.summary, 190)} <PrintReferences sourceIds={highlight.sourceIds} sources={result.sources} /></p>
              ) : (
                <p>No sourced items returned for this category.</p>
              )}
              {topic === 'hire' && result.subjectType === 'company' && (
                <p className="print-question">
                  <strong>Open roles:</strong>{' '}
                  <a href={linkedinJobsSearchUrl(result.subject, 'sales')}>LinkedIn Sales search</a>
                  {' · '}
                  <a href={linkedinJobsSearchUrl(result.subject, 'maintenance')}>LinkedIn Maintenance search</a>
                  {' (live postings are not imported automatically)'}
                </p>
              )}
              {question && <p className="print-question"><strong>Open question:</strong> {briefLine(question.text, 150)} <PrintReferences sourceIds={question.sourceIds} sources={result.sources} /></p>}
            </section>
          );
        })}
      </div>
      <footer className="print-page-sources">
        <h2>Sources</h2>
        <ol>
          {sources.map((source) => (
            <li key={source.id}><span>[{source.id}]</span> <a href={source.url}>{briefLine(source.title, 100)}</a></li>
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
      retry: false,
    },
  });
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
  const requestKey = JSON.stringify([subject.trim(), subjectType, personRole, publicRoleTitle.trim(), companyName.trim(), sourceMode, meetingAt, topics, context.trim()]);
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
  const startPinConfigured = sourceStatusQuery.data?.startPinConfigured === true;
  const ownerAccountConfigured = sourceStatusQuery.data?.ownerAccountConfigured === true;
  const dailyCrawlRemainingMs = sourceStatusQuery.data?.dailyCrawlRemainingMs ?? null;
  const dailyCrawlActive = sourceStatusQuery.data?.dailyCrawlActive === true;
  const dailyCrawlResetsAt = sourceStatusQuery.data?.dailyCrawlResetsAt ?? null;
  const crawlBudgetExhausted = dailyCrawlRemainingMs === 0;
  const crawlAlreadyActive = dailyCrawlActive && !mutation.isPending;
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
    if (!/^\d{4}$/.test(pin) || !isSignedIn || crawlBudgetExhausted || crawlAlreadyActive || !tavilyConfigured || !startPinConfigured || !ownerAccountConfigured || !hasValidSubject || !hasValidRole || !meetingTimeIsValid || !hasTopics || sourceMode !== 'public' || mutation.isPending) return;
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
  }, [companyName, context, crawlAlreadyActive, crawlBudgetExhausted, hasTopics, hasValidRole, hasValidSubject, isSignedIn, meetingAt, meetingTimeIsValid, mutation.isPending, mutation.mutate, ownerAccountConfigured, personRole, publicRoleTitle, sourceMode, sourceStatusQuery.refetch, startPinConfigured, subject, subjectType, tavilyConfigured, topics]);

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
  const readinessMessage = readinessState === 'not-ready'
    ? !isSignedIn
      ? 'Sign in before using the briefing.'
      : sourceStatusQuery.isError
      ? 'Not ready — the server could not confirm Tavily status. Check the API Server workflow.'
      : !tavilyConfigured
        ? 'Not ready — add TAVILY_API_KEY in Replit Secrets, then restart API Server.'
        : !startPinConfigured
          ? 'Not ready — configure the briefing start PIN in API Server Secrets.'
        : !ownerAccountConfigured
          ? 'Not ready — configure the approved account in API Server Secrets.'
        : crawlAlreadyActive
          ? 'Not ready — a Tavily crawl is already running against the shared app allowance.'
        : crawlBudgetExhausted
          ? `Not ready — the app-wide rolling 24-hour Tavily allowance is used${dailyCrawlResetsAt ? `; it resets ${new Date(dailyCrawlResetsAt).toLocaleString()}` : ''}.`
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
            : sourceMode === 'private'
              ? 'Not ready — private sources need user authorization and protected sign-in.'
              : 'Not ready — press Crawl & prepare briefing.'
    : readinessState === 'error'
      ? timedOutKey === requestKey ? 'Not ready — the three-minute backup stop ended this crawl.' : 'Not ready — source collection failed. Try again.'
      : readinessState === 'crawling'
        ? 'Collecting sources — up to your remaining daily allowance.'
      : readinessState === 'ready'
          ? 'Brief ready — sources collected for the selected subject, meeting and topics.'
          : 'Not ready — press Crawl & prepare briefing.';
  const briefStatusClass = readinessState === 'ready'
    ? 'brief-status-ready'
    : readinessState === 'crawling'
      ? 'brief-status-pending'
      : 'brief-status-not-ready';
  return (
    <main className="paper-grid min-h-[100dvh] overflow-hidden">
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

        <div className="mt-8 space-y-8 lg:mt-12">
          <section className="no-print fade-up" aria-labelledby="create-heading">
            <div className="mb-5">
              <p className="font-mono text-[10px] uppercase tracking-[.17em] text-[#766a93]">Your source-first briefing assistant</p>
              <h1 id="create-heading" className="mt-2 font-serif text-[38px] leading-[1.02] tracking-[-.02em] text-[#282d43]">Know what changed<br /><em className="font-normal text-[#655487]">before you meet.</em></h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-[1.7] text-[#666675]">Choose a company or person for a user-triggered, rolling 30-day brief: news, hires, launches, financial facts, risks and open questions—with links to the reporting behind each item.</p>
            </div>

            <section className="mb-5" aria-label="How the briefing assistant supports each role" data-testid="trust-and-role-guide">
              <div className="grid gap-2 sm:grid-cols-3">
                <article className="rounded-xl border border-[#d8d2df] bg-[#fbfaf6] p-3">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#766a93]">Chairman / CEO</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#555463]">Add the company. Review reported share-price and profit/loss facts, hires, launches and risks before plant, board or partner discussions.</p>
                </article>
                <article className="rounded-xl border border-[#d8d2df] bg-[#fbfaf6] p-3">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#766a93]">MP / public office</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#555463]">Choose MP and enter the public-office title, such as Corporator. Review sourced reporting tied to the person and prepare questions.</p>
                </article>
                <article className="rounded-xl border border-[#d8d2df] bg-[#fbfaf6] p-3">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#766a93]">Corporate person</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#555463]">For a private-entity person: scan role-related reporting, hires, launches and risks before client or leadership conversations.</p>
                </article>
              </div>

              <div className="mt-3 rounded-xl border border-[#d8d2df] bg-[#f3f0f7] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#766a93]">The 30-day method</p>
                    <ol className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-[#555463]">
                      <li><strong>1.</strong> Choose a company or person and set the meeting time.</li>
                      <li><strong>2.</strong> Press Crawl to collect public reports from the 30 days ending now. It does not run automatically.</li>
                      <li><strong>3.</strong> Review five focused blocks, then print a one-page brief or use the capped read-aloud.</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#766a93]">What makes it checkable</p>
                    <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-[#555463]">
                      <li>Every reported item links to its source; you can check the original context.</li>
                      <li>Financial facts and positive/negative signals appear only when reporting supports them.</li>
                      <li>Missing evidence is shown as not found or an open question—not filled in by guesswork.</li>
                    </ul>
                  </div>
                </div>
                <p className="mt-3 border-t border-[#ddd6e8] pt-3 text-[10px] leading-relaxed text-[#625d69]">
                  AI is currently off. This assistant does not generate or invent claims; the crawl starts only when you request it.
                </p>
              </div>
            </section>

            <form onSubmit={submit} className="rounded-2xl border border-[#d8d2df] bg-[#fbfaf6] p-5 shadow-[0_12px_35px_rgba(38,37,55,.06)] sm:p-6" aria-describedby={isSignedIn ? 'form-note' : undefined}>
              {!isSignedIn ? (
                <section className="rounded-xl border border-[#d8d2df] bg-[#f4f1f8] px-5 py-6 sm:px-7" aria-label="Sign in before starting a briefing" data-testid="signin-before-briefing">
                  <p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#766a93]">Account required</p>
                  <h2 className="mt-2 font-serif text-2xl text-[#292e46]">Sign in before you brief.</h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#625d69]">Sign-in is required before a crawl. All accounts share one 120-second Tavily runtime allowance per rolling 24 hours; creating another account does not reset it. Searches still use the project owner’s Tavily credits.</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <a href={`${basePath}/sign-in`} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#292e46] px-4 text-sm font-semibold text-white transition hover:bg-[#3c4160]" data-testid="button-sign-in-before-briefing">Sign in to use the briefing</a>
                    <a href={`${basePath}/sign-up`} className="text-sm font-semibold text-[#594b87] underline underline-offset-4" data-testid="button-create-account-before-briefing">Create an account</a>
                  </div>
                </section>
              ) : (
              <>
              <div className="mb-5 flex items-center justify-between border-b border-[#e5e0e7] pb-3">
                <span className="font-mono text-[10px] uppercase tracking-[.15em] text-[#6b6278]">New conversation</span>
                <div className="flex items-center gap-3">
                  <span
                    className={`brief-status-button ${briefStatusClass}`}
                    aria-label={`Brief status: ${readinessMessage}`}
                    role="status"
                    aria-live="polite"
                    title={readinessMessage}
                    data-testid="status-brief-status"
                  >
                    Brief
                  </span>
                  <span className="font-mono text-[10px] text-[#968da0]">30 DAYS</span>
                </div>
              </div>
              <fieldset className="mt-4">
                <legend className="mb-2 text-xs font-semibold text-[#35364a]">Briefing subject</legend>
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
                          if (kind === 'company') setSourceMode('public');
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
                    <legend className="mb-2 text-xs font-semibold text-[#35364a]">Person’s briefing context</legend>
                    <p id="person-role-note" className="mb-2 text-[10px] leading-relaxed text-[#777280]">
                      MP is the government/public-office path; Corporate means a private-entity person. These choices only focus public-source research.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {PERSON_ROLES.map((role) => (
                        <label
                          key={role.value}
                          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
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
                      <span className="mb-1.5 block text-xs font-semibold text-[#35364a]">Chairman / CEO company</span>
                      <input
                        id="person-company"
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        required
                        minLength={2}
                        maxLength={200}
                        placeholder="For example, Finolex Cables"
                        className="h-11 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-sm text-foreground placeholder:text-[#aaa4af] focus:border-[#8c7dae] focus:outline-none"
                        data-testid="input-person-company"
                      />
                    </label>
                  )}
                  {personRole === 'mp' && (
                    <label htmlFor="person-public-role" className="mt-4 block">
                      <span className="mb-1.5 block text-xs font-semibold text-[#35364a]">Government office or title</span>
                      <input
                        id="person-public-role"
                        value={publicRoleTitle}
                        onChange={(event) => setPublicRoleTitle(event.target.value)}
                        required
                        minLength={2}
                        maxLength={80}
                        placeholder="MP or Corporator"
                        className="h-11 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-sm text-foreground placeholder:text-[#aaa4af] focus:border-[#8c7dae] focus:outline-none"
                        data-testid="input-person-public-role"
                      />
                    </label>
                  )}
                  <section className="mt-4 rounded-xl border border-[#e2dde8] bg-white/70 p-3" aria-label="Saved person details">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-[#35364a]">Saved person details</h3>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#777280]">Optional. Saved only to your signed-in account when you choose Save.</p>
                      </div>
                      {accountLoaded && !isSignedIn && (
                        <a href={`${basePath}/sign-in`} className="font-mono text-[9px] uppercase tracking-wide text-[#655487] underline underline-offset-4">
                          Sign in to save
                        </a>
                      )}
                    </div>
                    {accountLoaded && isSignedIn && (
                      <>
                        {savedPersonProfiles.length > 0 ? (
                          <label className="mt-3 block">
                            <span className="mb-1 block text-[10px] font-semibold text-[#625d69]">Load a saved person</span>
                            <select
                              value={selectedSavedProfileId}
                              onChange={(event) => loadSavedPersonProfile(event.target.value)}
                              className="h-10 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-xs text-foreground focus:border-[#8c7dae] focus:outline-none"
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
                          <p className="mt-2 text-[10px] text-[#777280]">
                            {profileRequestPending ? 'Loading saved details…' : 'No saved person details yet.'}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void savePersonProfile()}
                            disabled={profileRequestPending || !personRole || !hasValidSubject || !hasValidPersonDetails}
                            className="h-9 rounded-lg bg-[#292e46] px-3 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid="button-save-person-profile"
                          >
                            {profileRequestPending ? 'Saving…' : selectedProfileMatchesForm ? 'Update saved details' : 'Save person details'}
                          </button>
                          {selectedProfileMatchesForm && (
                            <button
                              type="button"
                              onClick={() => void forgetSavedPersonProfile()}
                              disabled={profileRequestPending}
                              className="h-9 rounded-lg border border-[#e5c5c0] px-3 text-[10px] font-semibold text-[#8f4039] disabled:cursor-not-allowed disabled:opacity-50"
                              data-testid="button-remove-person-profile"
                            >
                              Remove saved details
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    {profileMessage && <p className="mt-2 text-[10px] text-[#625d69]" role="status" aria-live="polite">{profileMessage}</p>}
                  </section>
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-xs font-semibold text-[#35364a]">Source mode</legend>
                    <div className="grid max-w-md grid-cols-2 gap-2">
                      {(['public', 'private'] as const).map((mode) => (
                        <label
                          key={mode}
                          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                            sourceMode === mode
                              ? mode === 'public'
                                ? 'border-[#9183ad] bg-[#f0edf6] text-[#493d65]'
                                : 'border-[#bd8b4a] bg-[#fff5e6] text-[#754a1f]'
                              : 'border-[#d9d4df] bg-[#fffefa] text-[#777280] hover:border-[#bbb1cc]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="sourceMode"
                            value={mode}
                            checked={sourceMode === mode}
                            onChange={() => setSourceMode(mode)}
                            className="accent-[#655487]"
                            data-testid={`radio-source-mode-${mode}`}
                          />
                          {mode === 'public' ? 'Public sources' : 'Private sources'}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {sourceMode === 'private' && (
                    <div
                      className="mt-3 rounded-xl border border-[#e5c5c0] bg-[#fbefed] p-4 text-[11px] leading-relaxed text-[#7f413b]"
                      role="status"
                      data-testid="private-source-unavailable"
                    >
                      <p className="font-semibold">Private source setup is not ready. No private data is being collected.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-[#e8d0cb] bg-white/70 p-3">
                          <p className="font-semibold">Gmail / shared mailbox</p>
                          <p className="mt-1">Use account-owner OAuth authorization. A generic API key cannot read a Gmail mailbox.</p>
                          <span className="mt-2 inline-block font-mono text-[9px] uppercase tracking-wide">Not connected</span>
                        </div>
                        <div className="rounded-lg border border-[#e8d0cb] bg-white/70 p-3">
                          <p className="font-semibold">WhatsApp Business</p>
                          <p className="mt-1">OAuth or user-owned provider credentials, where supported. Personal chat history is not included.</p>
                          <span className="mt-2 inline-block font-mono text-[9px] uppercase tracking-wide">Not connected</span>
                        </div>
                      </div>
                      <p className="mt-3">Each signed-in user will use their own provider connection or credentials, and provider charges stay on that user’s provider account. Both connection methods are planned where supported. Secure per-user sign-in and credential storage must be ready before any private crawl is enabled. The account owner or authorized PA must approve access.</p>
                    </div>
                  )}
                </>
              )}

              <label htmlFor="subject" className="mb-1.5 mt-4 block text-xs font-semibold text-[#35364a]">
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
                className="h-11 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-sm text-foreground placeholder:text-[#aaa4af] focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-subject"
              />

              <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" data-testid="topics-and-links-row">
              <fieldset className="min-w-0">
                <legend className="mb-2 flex w-full items-center justify-between gap-2 text-xs font-semibold text-[#35364a]">
                  <span>Choose what to include</span>
                  <span className="font-mono text-[9px] font-normal text-[#8d8694]">{topics.length} of 5 selected</span>
                </legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {TOPICS.map((topic, index) => (
                    <label
                      key={topic.value}
                      className={`flex min-h-[68px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition ${
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
                        <span className="block font-mono text-[9px] text-[#8b819a]">0{index + 1}</span>
                        <span className="mt-0.5 block font-semibold leading-tight">{topic.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <SourceColumn sources={result?.sources ?? []} />
              </div>

              <label htmlFor="meetingAt" className="mb-1.5 mt-5 block text-xs font-semibold text-[#35364a]">When is the meeting?</label>
              <input
                id="meetingAt"
                type="datetime-local"
                value={meetingAt}
                onChange={(event) => setMeetingAt(event.target.value)}
                required
                className="h-11 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-sm text-foreground focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-meeting-time"
              />
              {researchWindow && (
                <p className="mt-2 rounded-lg bg-[#f2efe8] px-3 py-2 text-[10px] leading-relaxed text-[#625d69]" data-testid="text-research-window">
                  Exact 30-day research range: <strong>{researchWindow}</strong>
                </p>
              )}
              <div
                className={`mt-3 flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium ${readinessStyles}`}
                id="meeting-readiness"
                role="status"
                aria-live="polite"
                data-testid="status-meeting-readiness"
                data-state={readinessState}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${readinessState === 'ready' ? 'bg-[#4c966f]' : readinessState === 'not-ready' || readinessState === 'error' ? 'bg-[#c45b50]' : 'animate-pulse bg-[#796a9d]'}`}
                  aria-hidden="true"
                />
                <span>{readinessMessage}</span>
              </div>

              <div className="mb-1.5 mt-4 flex items-center justify-between">
                <label htmlFor="context" className="text-xs font-semibold text-[#35364a]">Question or meeting context</label>
                <span className="font-mono text-[10px] text-[#9992a0]">Optional</span>
              </div>
              <p className="mb-1.5 text-[10px] leading-relaxed text-[#777280]">Ask a public question or add a priority, such as “market condition” or “new cable plant.” Matching source excerpts appear first with links; the 30-day window stays the same.</p>
              <textarea
                id="context"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                maxLength={1500}
                rows={3}
                placeholder="For example: market condition, new cable plant"
                className="w-full resize-y rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-[#aaa4af] focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-context"
              />
              <div className="mt-1 text-right font-mono text-[9px] text-[#aaa4af]">{context.length} / 1500</div>

              <button type="button" onClick={() => { setPinDialogError(''); setStartPin(''); setPinPromptOpen(true); }} disabled={mutation.isPending || !tavilyConfigured || !startPinConfigured || !ownerAccountConfigured || crawlBudgetExhausted || crawlAlreadyActive || !hasValidSubject || !hasValidRole || !meetingTimeIsValid || !hasTopics || sourceMode === 'private'} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2b304a] px-4 text-sm font-semibold text-[#faf7f0] transition hover:bg-[#3c4160] disabled:opacity-55" data-testid="button-generate-briefing">
                {mutation.isPending ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Crawling sources…</> : sourceMode === 'private' ? <><FileText className="h-4 w-4 text-[#c9b9ee]" aria-hidden="true" />Private mode unavailable</> : <><FileText className="h-4 w-4 text-[#c9b9ee]" aria-hidden="true" />{currentRequestFailed ? 'Start again' : hasCurrentResult ? 'Refresh briefing' : 'Start briefing'}<ArrowDown className="ml-auto h-4 w-4 opacity-60" aria-hidden="true" /></>}
              </button>
              <p id="form-note" className="mt-3 text-center text-[10px] leading-relaxed text-[#898392]" data-testid="text-tavily-setup">
                {sourceStatusQuery.isLoading
                  ? 'Checking Tavily source-search connection…'
                  : tavilyConfigured
                    ? 'Tavily basic search is connected. This pilot key uses the project owner’s credit balance; each crawl runs up to 5 topic searches. It returns dated titles, snippets and links—not full-page crawls. AI summaries stay off.'
                    : 'Tavily is not connected. Add the TAVILY_API_KEY secret to the API Server, then restart that workflow. This app does not expose the key.'}
                {' '}Shared across the whole app: 120 seconds of Tavily runtime in a rolling 24 hours. New accounts do not reset the allowance. A crawl has a three-minute backup hard stop. The pilot key still uses the project owner’s shared credit balance.
                {dailyCrawlRemainingMs !== null && ` ${Math.ceil(dailyCrawlRemainingMs / 1000)} seconds remain in the shared allowance.`}
              </p>
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

            <div className="mt-5 flex items-start gap-2.5 px-1 text-[11px] leading-relaxed text-[#777280]">
              <span className="mt-0.5 font-mono text-[9px] text-[#897ca6]">NOTE</span>
              <p>
                {sourceMode === 'public'
                  ? 'This crawl uses public sources only. Private mailboxes and WhatsApp messages are not read. Each factual point links to its original reporting.'
                  : 'Private source setup is unavailable. No mailbox or WhatsApp data will be read until the account owner or authorized delegate connects and approves access.'}
              </p>
            </div>
          </section>

          <section className="min-w-0" aria-live="polite" aria-label="Briefing">
            {currentRequestIsPending && !result ? (
              <LoadingBrief />
            ) : result ? (
              <BriefingDocument result={result} />
            ) : (
              <EmptyBriefing isSignedIn={isSignedIn === true} />
            )}
          </section>
        </div>
        <footer className="no-print mt-14 border-t border-[#d9d4df] pt-4 text-center font-mono text-[9px] uppercase tracking-[.14em] text-[#898392]">A clearer first five minutes</footer>
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

function EmptyBriefing({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className="fade-up space-y-5" data-testid="empty-briefing">
      {isSignedIn && (
        <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border bg-card px-5 py-5 sm:px-6" aria-labelledby="voice-empty-heading">
          <div className="max-w-md">
            <SectionEyebrow>Voice controls</SectionEyebrow>
            <h3 id="voice-empty-heading" className="mt-2 font-serif text-2xl text-foreground">AI and device speech</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">The AI voice button is shown but disabled. Device read-aloud becomes available after a briefing is collected.</p>
          </div>
          <VoiceControls text="" />
        </section>
      )}
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d1cad9] bg-[#f8f6f2]/80 px-6 py-12 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-1 rounded-full border border-[#ded8e5]" aria-hidden="true" />
          <span className="absolute inset-4 rounded-full border border-[#ded8e5]" aria-hidden="true" />
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#292e46] text-[#d9cef3]"><FileText className="h-5 w-5" aria-hidden="true" /></span>
        </div>
        <p className="mt-7 font-mono text-[10px] uppercase tracking-[.18em] text-[#7a6e95]">Ready when you are</p>
        <h2 className="mt-3 max-w-sm font-serif text-3xl leading-tight text-[#2e3147]">Start with the conversation ahead.</h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#777280]">Add a name and meeting time. Your sourced briefing will appear here, ready to scan or print.</p>
        <div className="mt-8 flex items-center gap-3 text-[10px] text-[#8f8996]">
          <span className="h-px w-8 bg-[#d8d1df]" /><span className="font-mono uppercase tracking-[.13em]">Context in, clarity out</span><span className="h-px w-8 bg-[#d8d1df]" />
        </div>
      </div>
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
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
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
