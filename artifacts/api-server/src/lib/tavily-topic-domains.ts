export type TavilyBriefingTopic =
  | "news"
  | "hire"
  | "launch"
  | "financial"
  | "risk";

const INCLUDE_DOMAINS = {
  news: [
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "thehindu.com",
    "economictimes.indiatimes.com",
    "business-standard.com",
    "livemint.com",
    "moneycontrol.com",
    "financialexpress.com",
    "ndtv.com",
    "pib.gov.in",
  ],
  hire: [
    "linkedin.com",
    "naukri.com",
    "indeed.com",
    "foundit.in",
    "shine.com",
    "glassdoor.com",
    "reuters.com",
    "economictimes.indiatimes.com",
    "business-standard.com",
    "livemint.com",
  ],
  launch: [
    "businesswire.com",
    "prnewswire.com",
    "globenewswire.com",
    "newswire.com",
    "reuters.com",
    "techcrunch.com",
    "producthunt.com",
    "economictimes.indiatimes.com",
    "business-standard.com",
    "livemint.com",
    "moneycontrol.com",
  ],
  financial: [
    "sec.gov",
    "nseindia.com",
    "bseindia.com",
    "sebi.gov.in",
    "reuters.com",
    "bloomberg.com",
    "ft.com",
    "economictimes.indiatimes.com",
    "business-standard.com",
    "livemint.com",
    "moneycontrol.com",
  ],
  risk: [
    "sec.gov",
    "sebi.gov.in",
    "mca.gov.in",
    "nseindia.com",
    "bseindia.com",
    "sansad.in",
    "eci.gov.in",
    "pib.gov.in",
    "reuters.com",
    "apnews.com",
    "thehindu.com",
    "economictimes.indiatimes.com",
    "business-standard.com",
    "livemint.com",
    "moneycontrol.com",
  ],
} satisfies Record<TavilyBriefingTopic, readonly string[]>;

export function getTavilyIncludeDomains(
  topic: TavilyBriefingTopic,
): string[] {
  return [...INCLUDE_DOMAINS[topic]];
}
