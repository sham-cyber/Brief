import './_group.css';
import { ArrowRight, BookOpen, FileText, Headphones, Printer, Search, ShieldCheck } from 'lucide-react';

const flowSteps = [
  {
    number: '01',
    title: 'Sign in',
    description: 'Use your Google account to open your briefing workspace.',
    icon: ShieldCheck,
  },
  {
    number: '02',
    title: 'Choose who to brief',
    description: 'Select a Company or a Person.',
    icon: Search,
  },
  {
    number: '03',
    title: 'Set the meeting',
    description: 'Choose the meeting time and select the topics that matter.',
    icon: FileText,
  },
  {
    number: '04',
    title: 'Start the public-source search',
    description: 'Press Start to gather public reports from the rolling 30 days.',
    icon: Search,
  },
  {
    number: '05',
    title: 'Review and use your brief',
    description: 'Check five cited sections, then read, listen, or print.',
    icon: BookOpen,
  },
];

const briefBlocks = [
  'News',
  'Hires',
  'Launches',
  'Financial Facts',
  'Risks & Open Questions',
];

export function AccessibleSignIn() {
  return (
    <main className="accessibility-page">
      <style>{`
        .accessibility-page {
          --ink: #193b3b;
          --ink-soft: #476261;
          --paper: #f4f3eb;
          --panel: #fffef9;
          --line: #cbd7ce;
          --teal: #145c58;
          --teal-dark: #0b4643;
          --mint: #e1eee7;
          --gold: #d3a64c;
          min-height: 100dvh;
          padding: 26px clamp(18px, 4vw, 64px) 56px;
          background:
            radial-gradient(ellipse at 12% 2%, rgba(214, 229, 216, .7), transparent 32rem),
            var(--paper);
          color: var(--ink);
          font-family: 'DM Sans', sans-serif;
        }
        .accessibility-page * { box-sizing: border-box; }
        .accessibility-shell { width: min(1180px, 100%); margin: 0 auto; }
        .accessibility-preview-label {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 24px;
          padding: 9px 13px;
          border: 1px solid #b4c9bd;
          border-radius: 999px;
          background: #e8f0e9;
          color: #214e49;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: .035em;
        }
        .preview-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #397653;
        }
        .accessibility-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-bottom: 28px;
        }
        .brand-lockup { display: flex; align-items: center; gap: 13px; }
        .brand-icon {
          display: grid;
          width: 48px;
          height: 48px;
          flex: 0 0 auto;
          place-items: center;
          border-radius: 15px;
          background: var(--teal);
          color: #fffef8;
        }
        .brand-name { margin: 0; font-size: 20px; line-height: 1.2; font-weight: 700; }
        .brand-tagline { margin: 4px 0 0; color: var(--ink-soft); font-size: 16px; }
        .header-note {
          max-width: 280px;
          margin: 4px 0 0;
          color: var(--ink-soft);
          font-size: 17px;
          line-height: 1.55;
          text-align: right;
        }
        .hero-grid {
          display: grid;
          grid-template-columns: minmax(340px, .82fr) minmax(0, 1.18fr);
          gap: clamp(28px, 5vw, 72px);
          align-items: center;
          padding: clamp(28px, 5vw, 62px);
          border: 1px solid #d6ded4;
          border-radius: 27px;
          background: rgba(255, 254, 249, .87);
          box-shadow: 0 18px 48px rgba(32, 66, 58, .07);
        }
        .hero-copy { max-width: 490px; }
        .eyebrow {
          margin: 0 0 14px;
          color: #426d5f;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: .09em;
          text-transform: uppercase;
        }
        .hero-copy h1 {
          margin: 0;
          color: #173d3b;
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(42px, 5vw, 58px);
          font-weight: 700;
          line-height: 1.04;
          letter-spacing: -.035em;
        }
        .hero-description {
          max-width: 440px;
          margin: 19px 0 0;
          color: #435c59;
          font-size: 20px;
          line-height: 1.55;
        }
        .trust-note {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          max-width: 440px;
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid var(--line);
          color: #526764;
          font-size: 17px;
          line-height: 1.55;
        }
        .trust-note svg { flex: 0 0 auto; margin-top: 2px; color: var(--teal); }
        .signin-card {
          width: 100%;
          max-width: 435px;
          justify-self: end;
          padding: clamp(25px, 4vw, 39px);
          border: 1px solid #d0dacf;
          border-radius: 22px;
          background: #fffefb;
          box-shadow: 0 10px 30px rgba(29, 61, 53, .08);
        }
        .signin-card h2 {
          margin: 0;
          color: #193d3a;
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -.025em;
          line-height: 1.2;
        }
        .signin-card-intro {
          margin: 9px 0 24px;
          color: #4b625e;
          font-size: 19px;
          line-height: 1.5;
        }
        .static-control {
          display: flex;
          width: 100%;
          min-height: 64px;
          align-items: center;
          justify-content: center;
          gap: 13px;
          border-radius: 12px;
          font: inherit;
          font-size: 19px;
          font-weight: 700;
          line-height: 1.35;
          cursor: default;
        }
        .static-control:focus-visible, .email-field:focus-visible {
          outline: 3px solid #bd7f25;
          outline-offset: 3px;
        }
        .google-control {
          border: 2px solid #285e59;
          background: #fffefa;
          color: #183b39;
          box-shadow: 0 2px 0 rgba(20, 92, 88, .09);
        }
        .google-mark {
          display: grid;
          width: 24px;
          height: 24px;
          place-items: center;
          border: 1px solid #d6ddd7;
          border-radius: 50%;
          color: #2863bf;
          font-family: Arial, sans-serif;
          font-size: 16px;
          font-weight: 700;
        }
        .or-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 21px 0 17px;
          color: #536b66;
          font-size: 16px;
          font-weight: 600;
        }
        .or-divider::before, .or-divider::after {
          height: 1px;
          flex: 1;
          background: #d7dfd7;
          content: '';
        }
        .email-label {
          display: block;
          margin-bottom: 8px;
          color: #233f3d;
          font-size: 18px;
          font-weight: 700;
        }
        .email-field {
          width: 100%;
          min-height: 60px;
          padding: 12px 15px;
          border: 2px solid #9aafa5;
          border-radius: 11px;
          outline: none;
          background: #fff;
          color: #52635f;
          font: inherit;
          font-size: 18px;
        }
        .email-field::placeholder { color: #647671; opacity: 1; }
        .continue-control {
          margin-top: 16px;
          border: 2px solid var(--teal);
          background: var(--teal);
          color: white;
        }
        .signup-copy {
          margin: 22px 0 0;
          color: #536763;
          font-size: 17px;
          line-height: 1.5;
          text-align: center;
        }
        .signup-copy strong { color: #145c58; text-decoration: underline; text-underline-offset: 3px; }
        .development-note {
          margin: 14px 0 0;
          color: #705329;
          font-size: 16px;
          font-weight: 600;
          text-align: center;
        }
        .static-explanation {
          margin: 16px 0 0;
          color: #65746f;
          font-size: 16px;
          line-height: 1.45;
          text-align: center;
        }
        .flow-section { margin-top: clamp(46px, 7vw, 82px); }
        .flow-heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 24px;
        }
        .flow-kicker {
          margin: 0 0 9px;
          color: #477466;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: .09em;
          text-transform: uppercase;
        }
        .flow-heading h2 {
          max-width: 660px;
          margin: 0;
          color: #1b3f3b;
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(34px, 4vw, 46px);
          font-weight: 700;
          line-height: 1.05;
        }
        .flow-heading p {
          max-width: 300px;
          margin: 0 0 3px;
          color: #516963;
          font-size: 17px;
          line-height: 1.5;
        }
        .flow-map {
          position: relative;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 13px;
          align-items: stretch;
        }
        .flow-step {
          position: relative;
          min-width: 0;
          min-height: 235px;
          padding: 22px 19px 20px;
          border: 1px solid #cbd9ce;
          border-radius: 17px;
          background: #fffef9;
          box-shadow: 0 5px 18px rgba(31, 70, 58, .04);
        }
        .flow-step:not(:last-child)::after {
          position: absolute;
          z-index: 2;
          top: 32px;
          right: -15px;
          display: grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border: 1px solid #bdcec2;
          border-radius: 50%;
          background: #f4f3eb;
          color: #356c5c;
          content: '›';
          font-size: 22px;
          line-height: 1;
        }
        .step-topline { display: flex; align-items: center; justify-content: space-between; }
        .step-number {
          color: #5e7a70;
          font-family: 'DM Mono', monospace;
          font-size: 16px;
          font-weight: 500;
        }
        .step-icon {
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border-radius: 12px;
          background: var(--mint);
          color: #205e51;
        }
        .flow-step h3 {
          margin: 18px 0 8px;
          color: #1a3c39;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.25;
        }
        .flow-step p {
          margin: 0;
          color: #526763;
          font-size: 17px;
          line-height: 1.5;
        }
        .flow-detail {
          margin-top: 25px;
          padding: clamp(20px, 3vw, 31px);
          border: 1px solid #c6d6cb;
          border-radius: 19px;
          background: #e8f0e8;
        }
        .flow-detail-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }
        .flow-detail-top .detail-badge {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border-radius: 11px;
          background: #1d5b51;
          color: #fff;
        }
        .flow-detail-top h3 { margin: 0; color: #1d4540; font-size: 21px; line-height: 1.3; }
        .flow-detail-top p { margin: 3px 0 0; color: #4b6760; font-size: 17px; line-height: 1.45; }
        .detail-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(220px, .65fr);
          align-items: center;
          gap: 20px;
        }
        .brief-blocks { display: flex; flex-wrap: wrap; gap: 10px; }
        .brief-block {
          min-height: 43px;
          display: inline-flex;
          align-items: center;
          padding: 9px 14px;
          border: 1px solid #abc4b6;
          border-radius: 10px;
          background: #fffef9;
          color: #234c43;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.3;
        }
        .detail-arrow { color: #518071; }
        .use-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .use-option {
          display: flex;
          min-height: 72px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #abc4b6;
          border-radius: 12px;
          background: #fffef9;
          color: #254a43;
          font-size: 16px;
          font-weight: 700;
        }
        .use-option svg { color: #286458; }
        .accessibility-footer {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid #cbd7ce;
          color: #596e68;
          font-size: 16px;
          line-height: 1.5;
        }
        @media (max-width: 950px) {
          .hero-grid { grid-template-columns: 1fr; gap: 34px; }
          .hero-copy { max-width: 700px; }
          .signin-card { justify-self: start; max-width: 520px; }
          .flow-map { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .flow-step { min-height: 205px; }
          .flow-step:not(:last-child)::after { display: none; }
          .detail-body { grid-template-columns: 1fr; }
          .detail-arrow { display: none; }
          .use-options { max-width: 420px; }
        }
        @media (max-width: 600px) {
          .accessibility-page { padding: 18px 16px 34px; }
          .accessibility-header { flex-direction: column; gap: 14px; margin-bottom: 22px; }
          .header-note { max-width: 360px; text-align: left; }
          .accessibility-preview-label { margin-bottom: 20px; }
          .hero-grid { padding: 25px 19px; border-radius: 21px; }
          .hero-copy h1 { font-size: 43px; }
          .hero-description { font-size: 19px; }
          .signin-card { padding: 23px 19px; }
          .signin-card h2 { font-size: 28px; }
          .flow-heading { align-items: flex-start; flex-direction: column; gap: 10px; }
          .flow-heading p { max-width: 500px; }
          .flow-map { grid-template-columns: 1fr; gap: 10px; }
          .flow-step { min-height: 0; padding: 18px; }
          .flow-step h3 { margin-top: 12px; }
          .flow-detail { padding: 19px 15px; }
          .brief-blocks { gap: 8px; }
          .brief-block { font-size: 16px; padding: 8px 10px; }
          .use-options { gap: 6px; }
          .use-option { min-height: 72px; font-size: 16px; }
          .accessibility-footer { flex-direction: column; gap: 6px; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .accessibility-shell { animation: arrive .45s ease-out both; }
          @keyframes arrive { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        }
      `}</style>
      <div className="accessibility-shell">
        <p className="accessibility-preview-label">
          <span className="preview-dot" aria-hidden="true" />
          DESIGN PREVIEW · STATIC CONTROLS
        </p>

        <header className="accessibility-header">
          <div className="brand-lockup" aria-label="Briefing Agent">
            <div className="brand-icon"><FileText size={25} aria-hidden="true" /></div>
            <div>
              <p className="brand-name">Briefing Agent</p>
              <p className="brand-tagline">A clearer start to every meeting</p>
            </div>
          </div>
          <p className="header-note">Public-source context, organized so you can prepare with confidence.</p>
        </header>

        <section className="hero-grid" aria-labelledby="welcome-title">
          <div className="hero-copy">
            <p className="eyebrow">Meeting preparation, made clear</p>
            <h1 id="welcome-title">Walk into the room well briefed.</h1>
            <p className="hero-description">
              A cited briefing on the people and organizations on your agenda, built from recent public reports.
            </p>
            <div className="trust-note">
              <ShieldCheck size={21} aria-hidden="true" />
              <span>Every briefing section points back to its public source, so you can check the original report.</span>
            </div>
          </div>

          <section className="signin-card" aria-label="Static sign-in preview">
            <h2>Welcome back</h2>
            <p className="signin-card-intro">Sign in to your briefing account</p>
            <button className="static-control google-control" type="button" aria-disabled="true">
              <span className="google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>
            <div className="or-divider" aria-hidden="true">or</div>
            <label className="email-label" htmlFor="preview-email">Email address</label>
            <input
              className="email-field"
              id="preview-email"
              type="email"
              placeholder="Enter your email address"
              readOnly
              aria-readonly="true"
            />
            <button className="static-control continue-control" type="button" aria-disabled="true">
              Continue
            </button>
            <p className="signup-copy">Don’t have an account? <strong>Sign up</strong></p>
            <p className="development-note">Development mode</p>
            <p className="static-explanation">Static design preview — sign-in controls are shown for appearance only.</p>
          </section>
        </section>

        <section className="flow-section" aria-labelledby="flow-title">
          <div className="flow-heading">
            <div>
              <p className="flow-kicker">How the briefing comes together</p>
              <h2 id="flow-title">A straightforward path from sign-in to a useful brief.</h2>
            </div>
            <p>Each step is clear. The finished brief keeps its sources close at hand.</p>
          </div>

          <div className="flow-map" aria-label="Five-step briefing process">
            {flowSteps.map(({ number, title, description, icon: Icon }) => (
              <article className="flow-step" key={number}>
                <div className="step-topline">
                  <span className="step-number">STEP {number}</span>
                  <span className="step-icon"><Icon size={20} aria-hidden="true" /></span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>

          <div className="flow-detail">
            <div className="flow-detail-top">
              <span className="detail-badge"><FileText size={19} aria-hidden="true" /></span>
              <div>
                <h3>Five blocks, with source links</h3>
                <p>Review the reported facts and open questions before your meeting.</p>
              </div>
            </div>
            <div className="detail-body">
              <div className="brief-blocks" aria-label="Brief sections">
                {briefBlocks.map((block) => <span className="brief-block" key={block}>{block}</span>)}
              </div>
              <ArrowRight className="detail-arrow" size={27} aria-hidden="true" />
              <div className="use-options" aria-label="Ways to use the brief">
                <div className="use-option"><BookOpen size={19} aria-hidden="true" /><span>Read</span></div>
                <div className="use-option"><Headphones size={19} aria-hidden="true" /><span>Read aloud</span></div>
                <div className="use-option"><Printer size={19} aria-hidden="true" /><span>Print</span></div>
              </div>
            </div>
          </div>
        </section>

        <footer className="accessibility-footer">
          <span>Briefing Agent · Public sources, clearly cited</span>
          <span>This page is a visual design preview; no sign-in or search is performed.</span>
        </footer>
      </div>
    </main>
  );
}
