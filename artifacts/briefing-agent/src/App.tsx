import { useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateBriefing } from '@workspace/api-client-react';
import type { BriefingResult, BriefSource } from '@workspace/api-client-react';
import { ArrowDown, ArrowUpRight, Check, Clipboard, Clock3, FileText, Link2, LoaderCircle, Printer, Radio, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

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
          <a key={id} className="reference-pill" href={`#source-${encodeURIComponent(id)}`} aria-label={`Open source: ${source.title}`} title={source.title}>
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
  if (!sources.length) return <p className="text-sm text-muted-foreground">No source links were returned for this briefing.</p>;
  return (
    <ol className="divide-y divide-border/80">
      {sources.map((source, index) => (
        <li id={`source-${encodeURIComponent(source.id)}`} key={source.id} className="scroll-mt-8 py-5 first:pt-1 last:pb-1" data-testid={`source-entry-${index + 1}`}>
          <div className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d8d1e5] bg-[#f1eef7] font-mono text-[11px] text-[#594b87]">{source.id}</span>
            <div className="min-w-0 flex-1">
              <a href={source.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1.5 text-[15px] font-semibold leading-snug text-foreground decoration-[#8a7bb0] underline-offset-4 hover:underline">
                <span>{source.title}</span><ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </a>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-[#655b7a]">{source.publisher}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={source.publishedAt ?? undefined}>{formatDate(source.publishedAt, { dateStyle: 'medium' })}</time>
              </div>
              {source.snippet && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{source.snippet}</p>}
              <a className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[10px] text-[#71658e] underline decoration-[#c7bfd7] underline-offset-2 hover:text-primary" href={source.url} target="_blank" rel="noreferrer" aria-label={`Open URL for ${source.title}`}>
                <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{source.url}</span>
              </a>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BriefingDocument({ result }: { result: BriefingResult }) {
  const [copied, setCopied] = useState(false);
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

  const categoryLabel = (category: string) => category === 'hire' ? 'People' : category === 'launch' ? 'Product' : 'News';
  const categoryStyle = (category: string) => category === 'hire'
    ? 'border-[#d7e5df] bg-[#edf5f1] text-[#426d5b]'
    : category === 'launch'
      ? 'border-[#e9ddc9] bg-[#f8f1e6] text-[#8a6632]'
      : 'border-[#d9d4e8] bg-[#f0eef7] text-[#5a4d83]';

  return (
    <article className="fade-up min-w-0" aria-label={`Briefing for ${result.subject}`} data-testid="briefing-result">
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
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c5b9e8]">Conversation file / 01</p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-[.98] tracking-[-.02em] sm:text-5xl">{result.subject}</h2>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#d2d0da]">
            <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#c5b9e8]" />{formatDate(result.meetingAt)}</span>
            <span className="inline-flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-[#c5b9e8]" />Research window: {formatWindow(result.windowStart, result.windowEnd)}</span>
          </div>
        </div>
      </header>

      <section className="print-card mt-5 rounded-2xl border border-border bg-card px-6 py-6 shadow-[0_8px_28px_rgba(38,37,55,.035)] sm:px-8" aria-labelledby="overview-heading">
        <SectionEyebrow>01 / The short read</SectionEyebrow>
        <h3 id="overview-heading" className="sr-only">Overview</h3>
        <p className="briefing-prose mt-4 max-w-4xl font-serif text-[22px] leading-[1.45] text-[#30334a] sm:text-[25px]">
          {result.overview.text}
          <References sourceIds={result.overview.sourceIds} sources={result.sources} />
        </p>
      </section>

      <section className="mt-9" aria-labelledby="highlights-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><SectionEyebrow>02 / What changed</SectionEyebrow><h3 id="highlights-heading" className="mt-2 font-serif text-3xl text-foreground">Recent signals</h3></div>
          <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{result.highlights.length} {result.highlights.length === 1 ? 'item' : 'items'}</span>
        </div>
        {result.highlights.length ? (
          <div className="space-y-3">
            {result.highlights.map((item, index) => (
              <article key={`${item.category}-${item.title}-${index}`} className="print-card grid grid-cols-[auto_1fr] gap-x-4 rounded-xl border border-border/90 bg-card px-5 py-5 sm:grid-cols-[104px_1fr] sm:gap-x-6 sm:px-6">
                <span className={`mt-0.5 h-fit rounded-full border px-2.5 py-1 text-center text-[10px] font-semibold uppercase tracking-[.08em] ${categoryStyle(item.category)}`}>{categoryLabel(item.category)}</span>
                <div className="min-w-0">
                  <h4 className="font-semibold leading-snug text-[#292d43]">{item.title}</h4>
                  <p className="briefing-prose mt-2 text-sm leading-[1.75] text-[#5f6070]">
                    {item.summary}<References sourceIds={item.sourceIds} sources={result.sources} />
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card/60 px-5 py-7 text-sm text-muted-foreground">No recent signals were returned for this briefing.</div>
        )}
      </section>

      <section className="print-card mt-9 rounded-2xl border border-[#ddd5e9] bg-[#f0edf6] px-6 py-6 sm:px-8" aria-labelledby="questions-heading">
        <SectionEyebrow>03 / Take into the room</SectionEyebrow>
        <h3 id="questions-heading" className="mt-2 font-serif text-3xl text-[#302b44]">Questions worth asking</h3>
        {result.questions.length ? (
          <ol className="mt-5 space-y-0">
            {result.questions.map((question, index) => (
              <li key={`${question.text}-${index}`} className="flex gap-4 border-t border-[#d9d2e5] py-4 first:border-0 first:pt-0 last:pb-0">
                <span className="pt-0.5 font-mono text-xs text-[#766a93]">0{index + 1}</span>
                <p className="briefing-prose text-[15px] leading-relaxed text-[#3e3a50]">
                  {question.text}<References sourceIds={question.sourceIds} sources={result.sources} />
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No discussion prompts were returned for this briefing.</p>
        )}
      </section>

      <section className="print-card mt-9 rounded-2xl border border-border bg-card px-6 py-6 sm:px-8" aria-labelledby="sources-heading">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><SectionEyebrow>04 / Trace every claim</SectionEyebrow><h3 id="sources-heading" className="mt-2 font-serif text-3xl">Sources</h3></div>
          <span className="rounded-full bg-[#f1eef7] px-3 py-1 font-mono text-[10px] text-[#5d5279]">{result.sources.length} references</span>
        </div>
        <SourceList sources={result.sources} />
      </section>
      <p className="mt-5 text-right font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Generated {formatDate(result.generatedAt)}</p>
    </article>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#71658e]">{children}</p>;
}

function Home() {
  const mutation = useCreateBriefing();
  const [subject, setSubject] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
  const [context, setContext] = useState('');
  const result = mutation.data;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subject.trim() || !meetingAt) return;
    mutation.mutate({ data: { subject: subject.trim(), meetingAt, ...(context.trim() ? { context: context.trim() } : {}) } });
  };

  const errorMessage = mutation.error instanceof Error
    ? mutation.error.message
    : 'The briefing could not be generated. Check your connection and try again.';

  return (
    <main className="paper-grid min-h-[100dvh] overflow-hidden">
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        <nav className="no-print flex items-center justify-between border-b border-[#d9d4df] pb-4" aria-label="Main">
          <a href="/" className="inline-flex items-center gap-2.5 text-foreground no-underline" aria-label="Briefing Desk home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#292e46] text-[#d9cef3]"><FileText className="h-4 w-4" aria-hidden="true" /></span>
            <span className="text-[13px] font-bold tracking-[-.02em]">briefing<span className="font-normal text-[#786d93]">desk</span></span>
          </a>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.14em] text-[#736d7d] sm:text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5b9b7e]" aria-hidden="true" /> Research, with receipts
          </div>
        </nav>

        <div className="mt-8 grid items-start gap-10 lg:mt-12 lg:grid-cols-[350px_minmax(0,1fr)] lg:gap-14">
          <aside className="no-print fade-up lg:sticky lg:top-8" aria-labelledby="create-heading">
            <div className="mb-5">
              <p className="font-mono text-[10px] uppercase tracking-[.17em] text-[#766a93]">Your research desk</p>
              <h1 id="create-heading" className="mt-2 font-serif text-[38px] leading-[1.02] tracking-[-.02em] text-[#282d43]">Walk in<br /><em className="font-normal text-[#655487]">well briefed.</em></h1>
              <p className="mt-3 max-w-sm text-[13px] leading-[1.7] text-[#666675]">Get the context that matters before the conversation does.</p>
            </div>

            <form onSubmit={submit} className="rounded-2xl border border-[#d8d2df] bg-[#fbfaf6] p-5 shadow-[0_12px_35px_rgba(38,37,55,.06)] sm:p-6" aria-describedby="form-note">
              <div className="mb-5 flex items-center justify-between border-b border-[#e5e0e7] pb-3">
                <span className="font-mono text-[10px] uppercase tracking-[.15em] text-[#6b6278]">New conversation</span>
                <span className="font-mono text-[10px] text-[#968da0]">01 — 03</span>
              </div>
              <label htmlFor="subject" className="mb-1.5 block text-xs font-semibold text-[#35364a]">Who are you meeting?</label>
              <input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
                minLength={2}
                maxLength={200}
                placeholder="Company, person, or organization"
                className="h-11 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-sm text-foreground placeholder:text-[#aaa4af] focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-subject"
              />

              <label htmlFor="meetingAt" className="mb-1.5 mt-4 block text-xs font-semibold text-[#35364a]">When is the meeting?</label>
              <input
                id="meetingAt"
                type="datetime-local"
                value={meetingAt}
                onChange={(event) => setMeetingAt(event.target.value)}
                required
                className="h-11 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-sm text-foreground focus:border-[#8c7dae] focus:outline-none"
                data-testid="input-meeting-time"
              />

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

              <button type="submit" disabled={mutation.isPending || subject.trim().length < 2 || !meetingAt} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2b304a] px-4 text-sm font-semibold text-[#faf7f0] transition hover:bg-[#3c4160] disabled:opacity-55" data-testid="button-generate-briefing">
                {mutation.isPending ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Researching sources…</> : <><FileText className="h-4 w-4 text-[#c9b9ee]" aria-hidden="true" />Build my briefing<ArrowDown className="ml-auto h-4 w-4 opacity-60" aria-hidden="true" /></>}
              </button>
              <p id="form-note" className="mt-3 text-center text-[10px] leading-relaxed text-[#898392]">Your brief is built from traceable articles, not guesswork.</p>
            </form>

            {mutation.isPending && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#ddd6e8] bg-[#f4f1f8] px-4 py-3" role="status" aria-live="polite" data-testid="status-generating">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center"><span className="h-2 w-2 animate-pulse rounded-full bg-[#796a9d]" /></span>
                <div><p className="text-xs font-semibold text-[#49405e]">Reading the latest coverage</p><p className="mt-1 text-[11px] leading-relaxed text-[#777082]">Finding useful signals and checking every reference.</p></div>
              </div>
            )}
            {mutation.isError && (
              <div className="mt-4 rounded-xl border border-[#e4c9c3] bg-[#fbf0ed] p-4" role="alert" data-testid="status-generation-error">
                <p className="text-xs font-semibold text-[#8b4039]">Couldn’t prepare this briefing</p>
                <p className="mt-1 text-xs leading-relaxed text-[#795750]">{errorMessage}</p>
                <button type="button" onClick={() => mutation.mutate({ data: { subject: subject.trim(), meetingAt, ...(context.trim() ? { context: context.trim() } : {}) } })} disabled={mutation.isPending} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#78443f] underline underline-offset-4 hover:text-[#4a2d2a]" data-testid="button-retry-briefing">
                  <RefreshCw className="h-3 w-3" /> Try again
                </button>
              </div>
            )}

            <div className="mt-5 flex items-start gap-2.5 px-1 text-[11px] leading-relaxed text-[#777280]">
              <span className="mt-0.5 font-mono text-[9px] text-[#897ca6]">NOTE</span>
              <p>Each point in your brief links back to its original reporting, so you can go deeper when it counts.</p>
            </div>
          </aside>

          <section className="min-w-0" aria-live="polite" aria-label="Briefing">
            {mutation.isPending && !result ? (
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
    <div className="fade-up flex min-h-[540px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d1cad9] bg-[#f8f6f2]/80 px-6 py-12 text-center" data-testid="empty-briefing">
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
