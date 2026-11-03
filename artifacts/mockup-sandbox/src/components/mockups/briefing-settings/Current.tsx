import { useState } from 'react';
import { ArrowDown, FileText } from 'lucide-react';
import './_group.css';

const topics = ['News', 'Hires', 'Launches', 'Financial Facts', 'Risks & Open Questions'];
const roles = ['Chairman / CEO', 'MP', 'Corporate'];

export function Current() {
  const [subjectType, setSubjectType] = useState<'company' | 'person'>('company');
  const [role, setRole] = useState('');
  const [selectedTopics, setSelectedTopics] = useState(topics);
  const [meetingTime, setMeetingTime] = useState('');
  const [context, setContext] = useState('');

  const toggleTopic = (topic: string) => {
    setSelectedTopics((current) => current.includes(topic)
      ? current.filter((item) => item !== topic)
      : [...current, topic]);
  };

  return (
    <main className="paper-grid min-h-screen overflow-hidden px-5 pb-12 pt-5 text-[#282d43] sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-[.15em] text-[#777280]">Current signed-in Settings · static UI preview</p>
        <nav className="flex items-center justify-between border-b border-[#d9d4df] pb-4" aria-label="Main">
          <a href="#" className="inline-flex items-center gap-2.5 text-[#292e46] no-underline">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#292e46] text-[#d9cef3]"><FileText size={17} aria-hidden="true" /></span>
            <span className="text-[13px] font-bold tracking-[-.02em]">briefing<span className="font-normal text-[#786d93]"> agent</span></span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[10px] uppercase tracking-[.14em] text-[#736d7d] sm:inline">Research, with receipts</span>
            <span className="rounded-lg bg-[#292e46] px-3 py-2 font-mono text-[10px] uppercase tracking-[.12em] text-white">Signed in</span>
          </div>
        </nav>

        <section className="mt-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[.14em] text-[#655487]">30-day meeting brief</p>
              <h1 className="mt-1 font-serif text-3xl leading-tight tracking-[-.02em] text-[#282d43]">Settings</h1>
            </div>
            <p className="text-base font-medium text-[#625d69]">Start a crawl only when you press Brief.</p>
          </div>

          <form className="rounded-2xl border border-[#d8d2df] bg-[#fbfaf6] p-5 shadow-[0_12px_35px_rgba(38,37,55,.06)] sm:p-6" onSubmit={(event) => event.preventDefault()}>
            <div className="mb-4 flex items-center justify-between border-b border-[#e5e0e7] pb-3">
              <span className="text-base font-semibold text-[#292e46]">Briefing details</span>
              <span className="rounded-full bg-[#eeeaf4] px-3 py-1 font-mono text-xs font-semibold text-[#594b87]">30 DAYS</span>
            </div>

            <details className="mb-4 rounded-xl border border-[#ded9e2] bg-white/65 px-4 py-3">
              <summary className="cursor-pointer text-base font-semibold text-[#35364a]">Source search key settings</summary>
              <div className="mt-3 rounded-xl border border-[#ded9e2] bg-[#f8f6fb] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-[#292e46]">Tavily key and billing</h2>
                    <p className="mt-1 text-sm text-[#625d69]">The key is saved securely for this account. Your Tavily account pays for its searches.</p>
                  </div>
                  <span className="rounded-full bg-[#f3eee3] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase text-[#7b6338]">Not connected</span>
                </div>
                <label className="mt-3 block text-sm font-medium text-[#35364a]">API key
                  <input type="password" placeholder="Paste your Tavily API key" className="mt-1 h-12 w-full rounded-lg border border-[#d9d4df] bg-white px-4" />
                </label>
                <button type="button" className="mt-3 h-11 rounded-lg bg-[#292e46] px-5 text-sm font-semibold text-white">Save key</button>
              </div>
            </details>

            <fieldset>
              <legend className="mb-2 text-base font-semibold text-[#35364a]">Briefing subject</legend>
              <div className="grid max-w-md grid-cols-2 gap-2">
                {(['company', 'person'] as const).map((kind) => (
                  <label key={kind} className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${subjectType === kind ? 'border-[#9183ad] bg-[#f0edf6] text-[#493d65]' : 'border-[#d9d4df] bg-[#fffefa] text-[#777280]'}`}>
                    <input type="radio" name="subject-type" checked={subjectType === kind} onChange={() => setSubjectType(kind)} className="accent-[#655487]" />
                    {kind === 'company' ? 'Company' : 'Person'}
                  </label>
                ))}
              </div>
            </fieldset>

            {subjectType === 'person' && (
              <fieldset className="mt-5">
                <legend className="mb-2 text-base font-semibold text-[#35364a]">Relevant role</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {roles.map((item) => (
                    <label key={item} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${role === item ? 'border-[#9183ad] bg-[#f0edf6] text-[#493d65]' : 'border-[#d9d4df] bg-[#fffefa] text-[#777280]'}`}>
                      <input type="radio" name="role" checked={role === item} onChange={() => setRole(item)} className="accent-[#655487]" />
                      {item}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <label className="mb-1.5 mt-4 block text-base font-semibold text-[#35364a]">{subjectType === 'company' ? 'Company name' : 'Person name'}
              <input className="mt-1 h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base placeholder:text-[#777280]" placeholder={subjectType === 'company' ? 'Enter a company name' : 'Enter a person’s name'} />
            </label>

            <fieldset className="mt-5">
              <legend className="mb-3 flex w-full items-center justify-between gap-2 text-base font-semibold text-[#35364a]">
                <span>Choose what to include</span>
                <span className="font-mono text-xs font-normal text-[#6d6576]">{selectedTopics.length} of 5 selected</span>
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {topics.map((topic, index) => (
                  <label key={topic} className={`flex min-h-[58px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-base ${selectedTopics.includes(topic) ? 'border-[#9284ae] bg-[#f0edf6] text-[#493d65]' : 'border-[#ded9e2] bg-[#fffefa] text-[#777280]'}`}>
                    <input type="checkbox" checked={selectedTopics.includes(topic)} onChange={() => toggleTopic(topic)} className="h-4 w-4 shrink-0 rounded accent-[#655487]" />
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-[#71658e]">0{index + 1}</span>
                      <span className="mt-0.5 block font-semibold leading-tight">{topic}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mb-1.5 mt-5 block text-base font-semibold text-[#35364a]">Meeting time
              <input type="datetime-local" value={meetingTime} onChange={(event) => setMeetingTime(event.target.value)} className="mt-1 h-12 w-full rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 text-base" />
            </label>
            <div className="mb-1.5 mt-5 flex items-center justify-between">
              <label htmlFor="current-context" className="text-base font-semibold text-[#35364a]">Optional context</label>
              <span className="text-sm text-[#625d69]">Optional</span>
            </div>
            <textarea id="current-context" rows={3} maxLength={1500} value={context} onChange={(event) => setContext(event.target.value)} placeholder="For example: market condition, new cable plant" className="w-full resize-y rounded-lg border border-[#d9d4df] bg-[#fffefa] px-3 py-3 text-base leading-relaxed placeholder:text-[#777280]" />
            <div className="mt-1 text-right text-sm text-[#625d69]">{context.length} / 1500</div>

            <div className="mt-5 flex flex-col gap-3 border-t border-[#e5e0e7] pt-4 sm:flex-row sm:items-center">
              <div className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-[#e5c5c0] bg-[#fbefed] px-4 py-3 text-base font-semibold text-[#8f4039]" role="status">
                <span className="h-3 w-3 shrink-0 rounded-full bg-[#c45b50]" aria-hidden="true" />
                Not ready — set the meeting time and connect source search.
              </div>
              <button type="button" disabled className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#292e46] px-8 text-lg font-bold text-white opacity-45">
                <FileText size={20} aria-hidden="true" />Brief<ArrowDown size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#625d69]">AI remains off. Briefing starts only when you press Brief and verify the PIN.</p>
            <details className="mt-4 rounded-xl border border-[#ded9e2] bg-[#f8f6fb] px-4 py-3">
              <summary className="cursor-pointer text-base font-semibold text-[#35364a]">AI settings <span className="ml-2 rounded-full border border-[#e4b7b2] bg-[#fbefed] px-2 py-1 text-sm font-bold text-[#98453e]">OFF · stopped</span></summary>
              <p className="pt-3 text-base leading-relaxed text-[#625d69]">No AI model or provider is connected. AI stays off until explicitly configured.</p>
            </details>
          </form>
        </section>
      </div>
    </main>
  );
}
