import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateBriefing } from '@workspace/api-client-react';
import type { BriefingResult, BriefSource } from '@workspace/api-client-react';
import { ArrowDown, ArrowUpRight, Check, Clipboard, Clock3, FileText, Link2, LoaderCircle, Play, Printer, Radio, RefreshCw, Search, Square, Volume2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const TOPICS = [
  { value: 'news', label: 'News' },
  { value: 'hire', label: 'Hires' },
  { value: 'launch', label: 'Launches' },
  { value: 'financial', label: 'Financial Facts' },
  { value: 'risk', label: 'Risks & Open Questions' },
] as const;
type Topic = typeof TOPICS[number]['value'];
const SPEECH_WORD_LIMIT = 280;

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
        </div>
        <p id="ai-voice-status" className="mt-2 max-w-52 text-[10px] leading-relaxed text-muted-foreground">
          AI voice is not connected.
        </p>
        <p className="mt-1 max-w-60 text-[10px] leading-relaxed text-muted-foreground" data-testid="status-speech-estimate">
          {hasText
            ? `Speech budget preview: ${estimate.words}/${SPEECH_WORD_LIMIT} words spoken; ${estimate.totalWords} words total${estimate.clipped ? ' — capped at 2 minutes' : ''}. Device voice estimate: about ${seconds}s.`
            : `0/${SPEECH_WORD_LIMIT} speech words. AI voice is off; device read-aloud starts after the crawl.`}
        </p>
      </div>
    </div>
  );
}

function TopicBlock({
  topic,
  title,
  highlights,
  questions,
  sources,
}: {
  topic: Topic;
  title: string;
  highlights: BriefingResult['highlights'];
  questions?: BriefingResult['questions'];
  sources: BriefSource[];
}) {
  const [filter, setFilter] = useState('');
  const filteredHighlights = highlights.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(filter.toLowerCase()));
  const filteredQuestions = (questions ?? []).filter((item) => item.text.toLowerCase().includes(filter.toLowerCase()));
  const readable = [
    ...filteredHighlights.flatMap((item) => [item.title, item.summary]),
    ...filteredQuestions.map((item) => item.text),
  ].join('. ') || `${title}. No matching items.`;
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
          {filter ? 'No items match this filter.' : 'No items were returned in this category.'}
        </p>
      )}
    </section>
  );
}

function BriefingDocument({ result }: { result: BriefingResult }) {
  const [copied, setCopied] = useState(false);
  const [activeTopic, setActiveTopic] = useState<'all' | Topic>('all');
  const visibleTopics = result.topics.filter((topic) => activeTopic === 'all' || activeTopic === topic);

  useEffect(() => {
    setActiveTopic('all');
  }, [result.generatedAt]);

  const copyBrief = async () => {
    const lines = [
      `${result.subject} — meeting briefing`,
      `Meeting: ${formatDate(result.meetingAt)}`,
      `Research window: ${formatWindow(result.windowStart, result.windowEnd)}`,
      '',
      'OVERVIEW',
      `${result.overview.text}${result.overview.sourceIds.length ? ` [${result.overview.sourceIds.join(', ')}]` : ''}`,
      '',
      'HIGHLIGHTS',
      ...result.highlights.flatMap((item) => [`${item.category.toUpperCase()}: ${item.title}`, `${item.summary}${item.sourceIds.length ? ` [${item.sourceIds.join(', ')}]` : ''}`, '']),
      'QUESTIONS TO CONSIDER',
      ...result.questions.map((item, index) => `${index + 1}. ${item.text}${item.sourceIds.length ? ` [${item.sourceIds.join(', ')}]` : ''}`),
      '',
      'SOURCES',
      ...result.sources.map((source) => `[${source.id}] ${source.title} — ${source.url}`),
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
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c5b9e8]">{result.subjectType} briefing</p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-[.98] tracking-[-.02em] sm:text-5xl">{result.subject}</h2>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#d2d0da]">
            <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#c5b9e8]" />{formatDate(result.meetingAt)}</span>
            <span className="inline-flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-[#c5b9e8]" />Research window: {formatWindow(result.windowStart, result.windowEnd)}</span>
          </div>
        </div>
      </header>

      <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-[#d8d2df] bg-[#f4f1e9] p-5 sm:p-6" data-testid="voice-summary">
        <div className="max-w-md">
          <SectionEyebrow>Listen before you walk in</SectionEyebrow>
          <p className="mt-2 text-sm leading-relaxed text-[#65616d]">Read this brief aloud using your device’s built-in voice. No AI voice service is connected.</p>
        </div>
        <VoiceControls text={[
          result.overview.text,
          ...result.highlights.flatMap((item) => [item.title, item.summary]),
          ...result.questions.map((question) => question.text),
        ].join('. ')} />
      </div>

      <div className="mt-5" data-testid="briefing-columns">
      <section className="print-card rounded-2xl border border-border bg-card px-6 py-6 shadow-[0_8px_28px_rgba(38,37,55,.035)] sm:px-8" aria-labelledby="overview-heading">
        <SectionEyebrow>01 / The short read</SectionEyebrow>
        <h3 id="overview-heading" className="sr-only">Overview</h3>
        <p className="briefing-prose mt-4 max-w-4xl font-serif text-[22px] leading-[1.45] text-[#30334a] sm:text-[25px]">
          {result.overview.text}
          <References sourceIds={result.overview.sourceIds} sources={result.sources} />
        </p>
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
            highlights={result.highlights.filter((item) => item.category === topic)}
            questions={topic === 'risk' ? result.questions : undefined}
            sources={result.sources}
          />
        );
      })}

      </div>
      <p className="no-print mt-5 text-right font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Generated {formatDate(result.generatedAt)}</p>
      </div>
      <PrintOnePageBrief result={result} />
    </article>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#71658e]">{children}</p>;
}

function PrintOnePageBrief({ result }: { result: BriefingResult }) {
  const firstHighlights = result.topics.flatMap((topic) => result.highlights.filter((item) => item.category === topic).slice(0, 1));
  const firstQuestion = result.topics.includes('risk') ? result.questions.slice(0, 1) : [];
  const sourceIds = new Set([
    ...result.overview.sourceIds,
    ...firstHighlights.flatMap((item) => item.sourceIds),
    ...firstQuestion.flatMap((item) => item.sourceIds),
  ]);
  const sources = result.sources.filter((source) => sourceIds.has(source.id));
  const briefLine = (text: string, maxLength: number) => text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;

  return (
    <section className="print-only print-one-page" aria-label="One-page printable briefing" data-testid="print-one-page-brief">
      <header className="print-page-header">
        <p>{result.subjectType} briefing · 30-day research window</p>
        <h1>{result.subject}</h1>
        <div>{formatDate(result.meetingAt)} <span aria-hidden="true">·</span> {formatWindow(result.windowStart, result.windowEnd)}</div>
      </header>
      <section className="print-page-overview">
        <h2>Brief</h2>
        <p>{briefLine(result.overview.text, 420)} <PrintReferences sourceIds={result.overview.sourceIds} sources={result.sources} /></p>
      </section>
      <div className="print-topic-grid">
        {result.topics.map((topic) => {
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const mutation = useCreateBriefing({ request: { get signal() { return abortControllerRef.current?.signal; } } });
  const [subject, setSubject] = useState('');
  const [subjectType, setSubjectType] = useState<'company' | 'person'>('company');
  const [topics, setTopics] = useState<Topic[]>(TOPICS.map((topic) => topic.value));
  const [meetingAt, setMeetingAt] = useState('');
  const [context, setContext] = useState('');
  const [resultKey, setResultKey] = useState('');
  const [failedKey, setFailedKey] = useState('');
  const [timedOutKey, setTimedOutKey] = useState('');
  const lastAutoRequestKey = useRef('');
  const activeRequestKey = useRef('');
  const timeoutRef = useRef<number | undefined>(undefined);
  const requestKey = JSON.stringify([subject.trim(), subjectType, meetingAt, topics, context.trim()]);
  const meetingTimeIsValid = Boolean(meetingAt && !Number.isNaN(new Date(meetingAt).getTime()));
  const hasValidSubject = subject.trim().length >= 2;
  const hasTopics = topics.length > 0;
  const hasCurrentResult = Boolean(mutation.data && resultKey === requestKey);
  const result = hasCurrentResult ? mutation.data : undefined;
  const currentRequestIsPending = mutation.isPending;
  const currentRequestFailed = (mutation.isError && failedKey === requestKey) || timedOutKey === requestKey;
  const researchWindow = useMemo(() => {
    if (!meetingTimeIsValid) return '';
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    return `${formatDate(start.toISOString(), { dateStyle: 'medium' })} — ${formatDate(end.toISOString(), { dateStyle: 'medium' })}`;
  }, [meetingAt, meetingTimeIsValid]);

  const runBriefing = useCallback((key: string) => {
    if (!hasValidSubject || !meetingTimeIsValid || !hasTopics || mutation.isPending) return;
    lastAutoRequestKey.current = key;
    activeRequestKey.current = key;
    setFailedKey('');
    setTimedOutKey('');
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    abortControllerRef.current = new AbortController();
    timeoutRef.current = window.setTimeout(() => {
      if (activeRequestKey.current === key) {
        setTimedOutKey(key);
        activeRequestKey.current = `timed-out:${key}`;
        abortControllerRef.current?.abort();
      }
    }, 120_000);
    mutation.mutate(
      { data: { subject: subject.trim(), subjectType, meetingAt, topics, ...(context.trim() ? { context: context.trim() } : {}) } },
      {
        onSuccess: () => {
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
          abortControllerRef.current = null;
          if (activeRequestKey.current === key) {
            setResultKey(key);
            setFailedKey('');
          }
        },
        onError: () => {
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
          abortControllerRef.current = null;
          if (activeRequestKey.current === key) setFailedKey(key);
        },
      },
    );
  }, [context, hasTopics, hasValidSubject, meetingAt, meetingTimeIsValid, mutation.isPending, mutation.mutate, subject, subjectType, topics]);

  useEffect(() => {
    if (!hasValidSubject || !meetingTimeIsValid || !hasTopics || mutation.isPending) return;
    if (lastAutoRequestKey.current === requestKey) return;

    const timeout = window.setTimeout(() => {
      if (lastAutoRequestKey.current !== requestKey && !mutation.isPending) {
        runBriefing(requestKey);
      }
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [hasTopics, hasValidSubject, meetingTimeIsValid, mutation.isPending, requestKey, runBriefing]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runBriefing(requestKey);
  };

  const errorMessage = mutation.error instanceof Error
    ? mutation.error.message
    : 'The briefing could not be generated. Check your connection and try again.';
  const readinessState = !meetingTimeIsValid || !hasValidSubject || !hasTopics
    ? 'not-ready'
    : currentRequestFailed
      ? 'error'
      : currentRequestIsPending
        ? 'crawling'
        : hasCurrentResult
          ? 'ready'
          : 'starting';
  const readinessStyles = {
    'not-ready': 'border-[#e5c5c0] bg-[#fbefed] text-[#8f4039]',
    error: 'border-[#e5c5c0] bg-[#fbefed] text-[#8f4039]',
    crawling: 'border-[#ddd6e8] bg-[#f4f1f8] text-[#554a70]',
    starting: 'border-[#ddd6e8] bg-[#f4f1f8] text-[#554a70]',
    ready: 'border-[#c7dfd2] bg-[#edf6f0] text-[#2f6d4c]',
  }[readinessState];
  const readinessMessage = readinessState === 'not-ready'
    ? !hasValidSubject ? 'Not ready — enter a company or person.' : !meetingTimeIsValid ? 'Not ready — set a meeting time to start research.' : 'Not ready — select at least one topic.'
    : readinessState === 'error'
      ? timedOutKey === requestKey ? 'Not ready — collection exceeded the 2-minute limit.' : 'Not ready — source collection failed. Try again.'
      : readinessState === 'crawling'
        ? 'Collecting sources — this may take up to 2 minutes.'
      : readinessState === 'ready'
          ? 'Data ready — sources collected for this meeting.'
          : 'Starting a one-time source collection…';
  const briefStatusClass = readinessState === 'ready'
    ? 'brief-status-ready'
    : readinessState === 'crawling' || readinessState === 'starting'
      ? 'brief-status-pending'
      : 'brief-status-not-ready';
  const handleBriefStatusClick = () => {
    if (readinessState === 'ready') {
      document.querySelector('[data-testid="briefing-result"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (readinessState === 'error') {
      runBriefing(requestKey);
    } else if (!hasValidSubject) {
      document.querySelector<HTMLInputElement>('#subject')?.focus();
    } else if (!hasTopics) {
      document.querySelector<HTMLInputElement>('[data-testid^="checkbox-topic-"]')?.focus();
    } else {
      document.querySelector<HTMLInputElement>('#meetingAt')?.focus();
    }
  };

  return (
    <main className="paper-grid min-h-[100dvh] overflow-hidden">
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        <nav className="no-print flex items-center justify-between border-b border-[#d9d4df] pb-4" aria-label="Main">
          <a href="/" className="inline-flex items-center gap-2.5 text-foreground no-underline" aria-label="Briefing Agent home" data-testid="link-home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#292e46] text-[#d9cef3]"><FileText className="h-4 w-4" aria-hidden="true" /></span>
            <span className="text-[13px] font-bold tracking-[-.02em]">briefing<span className="font-normal text-[#786d93]"> agent</span></span>
          </a>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.14em] text-[#736d7d] sm:text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5b9b7e]" aria-hidden="true" /> Research, with receipts
          </div>
        </nav>

        <div className="mt-8 space-y-8 lg:mt-12">
          <section className="no-print fade-up" aria-labelledby="create-heading">
            <div className="mb-5">
              <p className="font-mono text-[10px] uppercase tracking-[.17em] text-[#766a93]">Your research desk</p>
              <h1 id="create-heading" className="mt-2 font-serif text-[38px] leading-[1.02] tracking-[-.02em] text-[#282d43]">Walk in<br /><em className="font-normal text-[#655487]">well briefed.</em></h1>
              <p className="mt-3 max-w-sm text-[13px] leading-[1.7] text-[#666675]">Get the context that matters before the conversation does.</p>
            </div>

            <form onSubmit={submit} className="rounded-2xl border border-[#d8d2df] bg-[#fbfaf6] p-5 shadow-[0_12px_35px_rgba(38,37,55,.06)] sm:p-6" aria-describedby="form-note">
              <div className="mb-5 flex items-center justify-between border-b border-[#e5e0e7] pb-3">
                <span className="font-mono text-[10px] uppercase tracking-[.15em] text-[#6b6278]">New conversation</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBriefStatusClick}
                    disabled={readinessState === 'crawling' || readinessState === 'starting'}
                    className={`brief-status-button ${briefStatusClass}`}
                    aria-label={`Brief status: ${readinessMessage}`}
                    title={readinessMessage}
                    data-testid="button-brief-status"
                  >
                    Brief
                  </button>
                  <span className="font-mono text-[10px] text-[#968da0]">01 — 03</span>
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
                        onChange={() => setSubjectType(kind)}
                        className="accent-[#655487]"
                        data-testid={`radio-subject-type-${kind}`}
                      />
                      {kind === 'company' ? 'Company' : 'Person'}
                    </label>
                  ))}
                </div>
              </fieldset>

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
                <label htmlFor="context" className="text-xs font-semibold text-[#35364a]">A little context</label>
                <span className="font-mono text-[10px] text-[#9992a0]">Optional</span>
              </div>
              <textarea
                id="context"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                maxLength={1500}
                rows={3}
                placeholder="What is the conversation about?"
                className="w-full resize-y rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-[#aaa4af] focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-context"
              />
              <div className="mt-1 text-right font-mono text-[9px] text-[#aaa4af]">{context.length} / 1500</div>

              <button type="submit" disabled={mutation.isPending || !hasValidSubject || !meetingTimeIsValid || !hasTopics} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2b304a] px-4 text-sm font-semibold text-[#faf7f0] transition hover:bg-[#3c4160] disabled:opacity-55" data-testid="button-generate-briefing">
                {mutation.isPending ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Crawling sources…</> : <><FileText className="h-4 w-4 text-[#c9b9ee]" aria-hidden="true" />{hasCurrentResult ? 'Refresh briefing' : 'Crawl & prepare briefing'}<ArrowDown className="ml-auto h-4 w-4 opacity-60" aria-hidden="true" /></>}
              </button>
              <p id="form-note" className="mt-3 text-center text-[10px] leading-relaxed text-[#898392]">One source crawl per input set. It runs once now, never on a schedule or at meeting time. Results are limited to two minutes.</p>
            </form>

            {mutation.isPending && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#ddd6e8] bg-[#f4f1f8] px-4 py-3" role="status" aria-live="polite" data-testid="status-generating">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center"><span className="h-2 w-2 animate-pulse rounded-full bg-[#796a9d]" /></span>
                <div><p className="text-xs font-semibold text-[#49405e]">Reading the latest coverage</p><p className="mt-1 text-[11px] leading-relaxed text-[#777082]">Finding useful signals and checking every reference.</p></div>
              </div>
            )}
            {currentRequestFailed && (
              <div className="mt-4 rounded-xl border border-[#e4c9c3] bg-[#fbf0ed] p-4" role="alert" data-testid="status-generation-error">
                <p className="text-xs font-semibold text-[#8b4039]">Couldn’t prepare this briefing</p>
                <p className="mt-1 text-xs leading-relaxed text-[#795750]">{errorMessage}</p>
                <button type="button" onClick={() => runBriefing(requestKey)} disabled={mutation.isPending} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#78443f] underline underline-offset-4 hover:text-[#4a2d2a]" data-testid="button-retry-briefing">
                  <RefreshCw className="h-3 w-3" /> Try again
                </button>
              </div>
            )}

            <div className="mt-5 flex items-start gap-2.5 px-1 text-[11px] leading-relaxed text-[#777280]">
              <span className="mt-0.5 font-mono text-[9px] text-[#897ca6]">NOTE</span>
              <p>Public sources only. No email, WhatsApp, or private health data is collected. Each factual point links to its original reporting.</p>
            </div>
          </section>

          <section className="min-w-0" aria-live="polite" aria-label="Briefing">
            {(currentRequestIsPending || readinessState === 'starting') && !result ? (
              <LoadingBrief />
            ) : result ? (
              <BriefingDocument result={result} />
            ) : (
              <EmptyBriefing />
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

function EmptyBriefing() {
  return (
    <div className="fade-up space-y-5" data-testid="empty-briefing">
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border bg-card px-5 py-5 sm:px-6" aria-labelledby="voice-empty-heading">
        <div className="max-w-md">
          <SectionEyebrow>Voice controls</SectionEyebrow>
          <h3 id="voice-empty-heading" className="mt-2 font-serif text-2xl text-foreground">AI and device speech</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">The AI voice button is shown but disabled. Device read-aloud becomes available after a briefing is collected.</p>
        </div>
        <VoiceControls text="" />
      </section>
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
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
