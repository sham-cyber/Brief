import './_group.css';
import { BriefcaseBusiness, CalendarDays, ChevronDown, Clock3, FileText, UserRound } from 'lucide-react';

const topics = ['News', 'Hires', 'Launches', 'Financial Facts', 'Risks & Open Questions'];

export function AccessibleSignIn() {
  return (
    <main className="briefing-workspace">
      <style>{`
        .briefing-workspace {
          --ink: #213d3a;
          --ink-muted: #5b716c;
          --paper: #f4f5ee;
          --surface: #fffefa;
          --line: #d5ded4;
          --teal: #28675d;
          --teal-deep: #1d514b;
          --sage: #e8f0e8;
          --red: #a63e37;
          --red-bg: #f8e9e5;
          --green: #32744f;
          --green-bg: #e7f1e8;
          min-height: 100dvh;
          padding: 26px clamp(16px, 4vw, 54px) 24px;
          background: var(--paper);
          color: var(--ink);
          font-family: 'DM Sans', sans-serif;
        }
        .briefing-workspace * { box-sizing: border-box; }
        .briefing-shell { width: min(1080px, 100%); margin: 0 auto; }
        .briefing-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid var(--line);
        }
        .briefing-brand { display: flex; align-items: center; gap: 12px; }
        .brand-mark {
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border-radius: 12px;
          background: var(--teal);
          color: #fffef8;
        }
        .brand-title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
        .brand-caption { margin: 2px 0 0; color: var(--ink-muted); font-size: 14px; }
        .source-window {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border: 1px solid #c8d7ca;
          border-radius: 999px;
          background: #edf3eb;
          color: #365d4e;
          font-size: 14px;
          font-weight: 700;
          white-space: nowrap;
        }
        .source-window span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #43845b;
        }
        .workspace-title {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          margin: 24px 0 17px;
        }
        .workspace-title h1 { margin: 0; font-size: clamp(25px, 3vw, 32px); letter-spacing: -.035em; line-height: 1.1; }
        .workspace-title p { margin: 6px 0 0; color: var(--ink-muted); font-size: 16px; }
        .settings-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px;
          gap: 16px;
          align-items: stretch;
        }
        .settings-card, .action-card {
          border: 1px solid var(--line);
          border-radius: 16px;
          background: var(--surface);
          box-shadow: 0 5px 16px rgba(40, 67, 56, .045);
        }
        .settings-card { padding: 22px 24px; }
        .field-label {
          display: block;
          margin-bottom: 7px;
          color: #314c47;
          font-size: 15px;
          font-weight: 700;
        }
        .required { color: var(--red); }
        .subject-kind {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border: 1px solid #d6dfd5;
          border-radius: 11px;
          background: #f3f6ef;
        }
        .kind-option {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 39px;
          padding: 0 13px;
          border: 1px solid transparent;
          border-radius: 8px;
          color: #536963;
          font-size: 15px;
          font-weight: 700;
        }
        .kind-option.selected {
          border-color: #bed0c2;
          background: #fffefa;
          color: var(--teal-deep);
          box-shadow: 0 1px 3px rgba(35, 64, 54, .07);
        }
        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 17px; }
        .field-wrap { min-width: 0; }
        .field-control {
          display: flex;
          width: 100%;
          min-height: 46px;
          align-items: center;
          gap: 9px;
          padding: 0 12px;
          border: 1px solid #bdcbc2;
          border-radius: 9px;
          background: #fff;
          color: #647671;
          font: inherit;
          font-size: 15px;
        }
        .field-control input, .field-control select {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--ink);
          font: inherit;
          font-size: 15px;
        }
        .field-control input::placeholder, .context-field::placeholder { color: #778781; opacity: 1; }
        .field-control svg { flex: 0 0 auto; color: #688078; }
        .select-wrap { position: relative; }
        .select-wrap select { appearance: none; padding-right: 20px; }
        .select-wrap > svg { position: absolute; right: 11px; top: 15px; pointer-events: none; }
        .date-time-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 15px; }
        .section-divider { height: 1px; margin: 18px 0 16px; background: #e2e8df; }
        .topic-heading { margin: 0 0 10px; font-size: 16px; font-weight: 700; }
        .topic-options { display: flex; flex-wrap: wrap; gap: 8px; }
        .topic-option {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          padding: 6px 11px;
          border: 1px solid #c9d7cc;
          border-radius: 9px;
          background: #f4f7f1;
          color: #34564b;
          font-size: 14px;
          font-weight: 600;
        }
        .topic-check {
          display: grid;
          width: 16px;
          height: 16px;
          place-items: center;
          border: 1.5px solid #6e9580;
          border-radius: 4px;
          background: #fffefa;
          color: #fff;
          font-size: 12px;
          line-height: 1;
        }
        .topic-option.checked .topic-check { border-color: var(--teal); background: var(--teal); }
        .context-wrap { margin-top: 15px; }
        .context-field {
          display: block;
          width: 100%;
          min-height: 66px;
          resize: none;
          padding: 11px 12px;
          border: 1px solid #bdcbc2;
          border-radius: 9px;
          background: #fff;
          color: var(--ink);
          font: inherit;
          font-size: 15px;
        }
        .action-card { display: flex; flex-direction: column; padding: 18px; }
        .readiness {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 10px 11px;
          border: 1px solid #e4c4be;
          border-radius: 9px;
          background: var(--red-bg);
          color: #8b342e;
          font-size: 14px;
          font-weight: 700;
        }
        .readiness-dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--red); }
        .action-card h2 { margin: 17px 0 5px; font-size: 18px; letter-spacing: -.02em; }
        .action-hint { margin: 0; color: var(--ink-muted); font-size: 14px; line-height: 1.45; }
        .primary-action, .print-action {
          display: flex;
          width: 100%;
          min-height: 46px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 16px;
          border: 1px solid #9daf9f;
          border-radius: 9px;
          background: #e8ede6;
          color: #78847d;
          font: inherit;
          font-size: 15px;
          font-weight: 700;
          cursor: default;
        }
        .print-action { min-height: 42px; margin-top: 9px; background: #f5f6f1; }
        .state-trail {
          display: grid;
          gap: 8px;
          margin-top: auto;
          padding-top: 17px;
        }
        .state-sample {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #536963;
          font-size: 12px;
          font-weight: 600;
        }
        .state-sample.ready { color: #36714c; }
        .state-sample-dot { width: 7px; height: 7px; border-radius: 50%; background: #b7c1b9; }
        .state-sample.ready .state-sample-dot { background: #47865c; }
        .ai-control {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 14px;
          padding: 11px 14px;
          border: 1px solid #d5ded4;
          border-radius: 11px;
          background: #eef1e9;
        }
        .ai-caption { color: #51655f; font-size: 13px; font-weight: 600; }
        .ai-state {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 9px;
          border: 1px solid #e4c4be;
          border-radius: 999px;
          background: #f8e9e5;
          color: #9d3a33;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .04em;
        }
        .ai-state span { width: 7px; height: 7px; border-radius: 50%; background: #b84b41; }
        @media (max-width: 760px) {
          .briefing-workspace { padding: 18px 14px 20px; }
          .briefing-header { align-items: flex-start; }
          .source-window { gap: 6px; padding: 8px 9px; font-size: 12px; }
          .brand-mark { width: 38px; height: 38px; }
          .brand-title { font-size: 18px; }
          .brand-caption { font-size: 12px; }
          .workspace-title { margin-top: 20px; }
          .settings-layout { grid-template-columns: 1fr; gap: 12px; }
          .settings-card { padding: 18px 16px; }
          .action-card { padding: 15px; }
          .state-trail { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; padding-top: 14px; }
          .state-sample { align-items: flex-start; font-size: 11px; line-height: 1.3; }
        }
        @media (max-width: 460px) {
          .briefing-header { gap: 8px; }
          .source-window { max-width: 128px; white-space: normal; line-height: 1.15; }
          .workspace-title p { font-size: 14px; }
          .field-grid, .date-time-grid { grid-template-columns: 1fr; gap: 12px; margin-top: 13px; }
          .date-time-grid { margin-top: 12px; }
          .subject-kind { width: 100%; }
          .kind-option { flex: 1; }
          .topic-options { gap: 7px; }
          .topic-option { min-height: 36px; padding: 5px 9px; font-size: 13px; }
          .state-trail { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .briefing-shell { animation: arrive .35s ease-out both; }
          @keyframes arrive { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        }
      `}</style>

      <div className="briefing-shell">
        <header className="briefing-header">
          <div className="briefing-brand">
            <div className="brand-mark"><FileText size={22} aria-hidden="true" /></div>
            <div>
              <p className="brand-title">Briefing Agent</p>
              <p className="brand-caption">Meeting briefing · 30-day sources</p>
            </div>
          </div>
          <div className="source-window"><span aria-hidden="true" />Public sources · Past 30 days</div>
        </header>

        <div className="workspace-title">
          <div>
            <h1>Briefing settings</h1>
            <p>Choose who and what to prepare for.</p>
          </div>
        </div>

        <div className="settings-layout">
          <section className="settings-card" aria-label="Briefing settings preview">
            <span className="field-label">Briefing subject <span className="required">*</span></span>
            <div className="subject-kind" aria-label="Subject type">
              <span className="kind-option selected"><BriefcaseBusiness size={17} aria-hidden="true" />Company</span>
              <span className="kind-option"><UserRound size={17} aria-hidden="true" />Person</span>
            </div>

            <div className="field-grid">
              <div className="field-wrap">
                <label className="field-label" htmlFor="subject-name">Company name <span className="required">*</span></label>
                <div className="field-control"><input id="subject-name" readOnly placeholder="Enter company name" /></div>
              </div>
              <div className="field-wrap">
                <label className="field-label" htmlFor="subject-role">Role or title</label>
                <div className="field-control"><input id="subject-role" readOnly placeholder="Optional" /></div>
              </div>
            </div>

            <div className="date-time-grid">
              <div className="field-wrap">
                <label className="field-label" htmlFor="meeting-date">Meeting date</label>
                <div className="field-control"><CalendarDays size={17} aria-hidden="true" /><input id="meeting-date" readOnly placeholder="Select date" /></div>
              </div>
              <div className="field-wrap">
                <label className="field-label" htmlFor="meeting-time">Meeting time <span className="required">*</span></label>
                <div className="field-control"><Clock3 size={17} aria-hidden="true" /><input id="meeting-time" readOnly placeholder="Select time" /></div>
              </div>
            </div>

            <div className="section-divider" />
            <p className="topic-heading">Topics <span className="required">*</span></p>
            <div className="topic-options" aria-label="Briefing topics">
              {topics.map((topic) => (
                <span className="topic-option checked" key={topic}>
                  <span className="topic-check" aria-hidden="true">✓</span>{topic}
                </span>
              ))}
            </div>

            <div className="context-wrap">
              <label className="field-label" htmlFor="meeting-context">Context <span style={{ fontWeight: 400, color: '#718079' }}>· Optional</span></label>
              <textarea className="context-field" id="meeting-context" readOnly placeholder="What would be useful to know for this meeting?" />
            </div>
          </section>

          <aside className="action-card" aria-label="Briefing status preview">
            <div className="readiness"><span className="readiness-dot" aria-hidden="true" />Not ready</div>
            <h2>Briefing status</h2>
            <p className="action-hint">Add the subject and meeting time to continue.</p>
            <button className="primary-action" type="button" disabled><FileText size={17} aria-hidden="true" />Brief</button>
            <button className="print-action" type="button" disabled>Print</button>
            <div className="state-trail" aria-label="Status states">
              <div className="state-sample"><span className="state-sample-dot" />Not ready</div>
              <div className="state-sample ready"><span className="state-sample-dot" />Ready to brief</div>
              <div className="state-sample ready"><span className="state-sample-dot" />Ready to print</div>
            </div>
          </aside>
        </div>

        <div className="ai-control" aria-label="AI status">
          <span className="ai-caption">AI</span>
          <span className="ai-state"><span aria-hidden="true" />OFF</span>
        </div>
      </div>
    </main>
  );
}
