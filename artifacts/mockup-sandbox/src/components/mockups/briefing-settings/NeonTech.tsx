import { useState } from 'react';
import { ArrowDown, FileText } from 'lucide-react';
import './NeonTech.css';

const topics = ['News', 'Hires', 'Launches', 'Financial Facts', 'Risks & Open Questions'];
const roles = ['Chairman / CEO', 'MP', 'Corporate'];

export function NeonTech() {
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
    <main className="nt-page">
      <div className="nt-shell">
        <p className="nt-preview-label">Current signed-in Settings · static UI preview</p>
        <nav className="nt-nav" aria-label="Main">
          <a href="#" className="nt-brand">
            <span className="nt-brand-mark"><FileText size={19} aria-hidden="true" /></span>
            <span>briefing<span className="nt-brand-muted"> agent</span></span>
          </a>
          <div className="nt-nav-meta">
            <span className="nt-nav-tag">Research, with receipts</span>
            <span className="nt-signed">Signed in</span>
          </div>
        </nav>

        <section className="nt-settings">
          <div className="nt-heading">
            <div>
              <p className="nt-eyebrow">30-day meeting brief</p>
              <h1>Settings</h1>
            </div>
            <p className="nt-heading-note">Start a crawl only when you press Brief.</p>
          </div>

          <form className="nt-form" onSubmit={(event) => event.preventDefault()}>
            <div className="nt-form-top">
              <span className="nt-form-title">Briefing details</span>
              <span className="nt-period">30 DAYS</span>
            </div>

            <details className="nt-details">
              <summary>Source search key settings</summary>
              <div className="nt-key-box">
                <div className="nt-key-head">
                  <div>
                    <h2>Tavily key and billing</h2>
                    <p>The key is saved securely for this account. Your Tavily account pays for its searches.</p>
                  </div>
                  <span className="nt-status-badge">Not connected</span>
                </div>
                <label className="nt-label">API key
                  <input type="password" placeholder="Paste your Tavily API key" className="nt-input" />
                </label>
                <button type="button" className="nt-button">Save key</button>
              </div>
            </details>

            <fieldset className="nt-fieldset">
              <legend className="nt-legend">Briefing subject</legend>
              <div className="nt-options">
                {(['company', 'person'] as const).map((kind) => (
                  <label key={kind} className={`nt-choice ${subjectType === kind ? 'is-selected' : ''}`}>
                    <input type="radio" name="subject-type" checked={subjectType === kind} onChange={() => setSubjectType(kind)} />
                    {kind === 'company' ? 'Company' : 'Person'}
                  </label>
                ))}
              </div>
            </fieldset>

            {subjectType === 'person' && (
              <fieldset className="nt-fieldset nt-person-role">
                <legend className="nt-legend">Relevant role</legend>
                <div className="nt-role-options">
                  {roles.map((item) => (
                    <label key={item} className={`nt-choice ${role === item ? 'is-selected' : ''}`}>
                      <input type="radio" name="role" checked={role === item} onChange={() => setRole(item)} />
                      {item}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <label className="nt-label nt-subject-name">{subjectType === 'company' ? 'Company name' : 'Person name'}
              <input className="nt-input" placeholder={subjectType === 'company' ? 'Enter a company name' : 'Enter a person’s name'} />
            </label>

            <fieldset className="nt-fieldset nt-topics">
              <legend className="nt-legend nt-legend-row">
                <span>Choose what to include</span>
                <span className="nt-count">{selectedTopics.length} of 5 selected</span>
              </legend>
              <div className="nt-topic-grid">
                {topics.map((topic, index) => (
                  <label key={topic} className={`nt-topic ${selectedTopics.includes(topic) ? 'is-selected' : ''}`}>
                    <input type="checkbox" checked={selectedTopics.includes(topic)} onChange={() => toggleTopic(topic)} />
                    <span>
                      <span className="nt-topic-code">0{index + 1}</span>
                      <span className="nt-topic-label">{topic}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="nt-label nt-meeting">Meeting time
              <input type="datetime-local" value={meetingTime} onChange={(event) => setMeetingTime(event.target.value)} className="nt-input" />
            </label>
            <div className="nt-context-head">
              <label htmlFor="neon-context" className="nt-label">Optional context</label>
              <span className="nt-optional">Optional</span>
            </div>
            <textarea id="neon-context" rows={3} maxLength={1500} value={context} onChange={(event) => setContext(event.target.value)} placeholder="For example: market condition, new cable plant" className="nt-textarea" />
            <div className="nt-count-under">{context.length} / 1500</div>

            <div className="nt-actions">
              <div className="nt-ready" role="status">
                <span className="nt-ready-dot" aria-hidden="true" />
                Not ready — set the meeting time and connect source search.
              </div>
              <button type="button" disabled className="nt-button nt-brief">
                <FileText size={20} aria-hidden="true" />Brief<ArrowDown size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="nt-footnote">AI remains off. Briefing starts only when you press Brief and verify the PIN.</p>
            <details className="nt-details nt-ai-details">
              <summary className="nt-ai-summary">AI settings <span className="nt-ai-badge">OFF · stopped</span></summary>
              <p className="nt-ai-copy">No AI model or provider is connected. AI stays off until explicitly configured.</p>
            </details>
          </form>
        </section>
      </div>
    </main>
  );
}

export default NeonTech;
