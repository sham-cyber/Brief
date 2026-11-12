type PwaLaunchIntent = {
  action?: 'customer-search' | 'new-brief';
  question?: string;
};

const intentStorageKey = 'briefing-agent-pwa-launch-intent';

function protocolQuestion(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const query = parsed.searchParams.get('q') ?? parsed.searchParams.get('question');
    if (query) return query.slice(0, 500);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).slice(0, 500);
  } catch {
    return trimmed.replace(/^web\+briefing:(?:\/\/)?/i, '').slice(0, 500);
  }
}

export function capturePwaLaunchIntent(): void {
  if (typeof window === 'undefined') return;
  const currentUrl = new URL(window.location.href);
  const shortcut = currentUrl.searchParams.get('shortcut');
  const protocol = currentUrl.searchParams.get('protocol');
  const intent: PwaLaunchIntent = {};

  if (shortcut === 'customer-search') intent.action = 'customer-search';
  if (shortcut === 'new-briefing') intent.action = 'new-brief';
  if (protocol) {
    const question = protocolQuestion(protocol);
    if (question) intent.question = question;
  }
  if (!intent.action && !intent.question) return;

  try {
    window.sessionStorage.setItem(intentStorageKey, JSON.stringify(intent));
    currentUrl.searchParams.delete('shortcut');
    currentUrl.searchParams.delete('protocol');
    const remainingQuery = currentUrl.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${currentUrl.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${currentUrl.hash}`,
    );
  } catch {
    // Launch intent remains non-critical; the user can still choose the form manually.
  }
}

export function readPwaLaunchIntent(): PwaLaunchIntent | null {
  try {
    const value = window.sessionStorage.getItem(intentStorageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as PwaLaunchIntent;
    return {
      ...(parsed.action === 'customer-search' || parsed.action === 'new-brief'
        ? { action: parsed.action }
        : {}),
      ...(typeof parsed.question === 'string' ? { question: parsed.question.slice(0, 500) } : {}),
    };
  } catch {
    return null;
  }
}

export function clearPwaLaunchIntent(): void {
  try {
    window.sessionStorage.removeItem(intentStorageKey);
  } catch {
    // The active form remains available even if session storage is unavailable.
  }
}
