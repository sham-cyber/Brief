import './_group.css';
import { FileText } from 'lucide-react';

/**
 * Extracted sign-in route shell from:
 * artifacts/briefing-agent/src/App.tsx — SignInPage
 *
 * Clerk's hosted SignIn control is represented with static preview content
 * because this canvas mockup must not authenticate or modify the app.
 */
export function Current() {
  return (
    <main className="current-signin-preview flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <div className="current-signin-preview">
        <p className="current-preview-note">CURRENT LOOK · STATIC PREVIEW</p>
        <section className="current-signin-card" aria-label="Static sign-in preview">
          <div className="current-signin-logo">
            <FileText size={28} aria-hidden="true" />
            <span className="current-logo-status" />
          </div>
          <h1>Welcome back</h1>
          <p className="current-subtitle">Sign in to your briefing account</p>
          <button className="current-google-button" type="button" disabled>
            <span className="current-google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>
          <div className="current-divider"><span>or</span></div>
          <label htmlFor="current-email">Email address</label>
          <input id="current-email" placeholder="Enter your email address" disabled />
          <button className="current-continue-button" type="button" disabled>
            Continue
          </button>
          <p className="current-signup">Don’t have an account? <strong>Sign up</strong></p>
          <p className="current-development">Development mode</p>
        </section>
      </div>
    </main>
  );
}
