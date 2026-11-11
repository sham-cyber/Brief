export type SubjectMatchScope = "subject" | "company";

type MatchableSource = {
  title: string;
  snippet: string;
};

const COMPANY_QUALIFIERS = new Set([
  "automotive", "automobile", "bank", "cable", "cement", "chemical",
  "electronics", "energy", "finance", "food", "industry", "infrastructure",
  "logistics", "motor", "pharma", "pharmaceutical", "power", "software",
  "steel", "system", "technology", "telecom",
]);
const LEGAL_SUFFIXES = new Set([
  "co", "company", "corp", "corporation", "inc", "incorporated",
  "limited", "llc", "llp", "ltd", "plc", "private", "pvt", "public",
]);

function normalizeToken(value: string): string {
  const token = value.toLocaleLowerCase();
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function words(value: string): string[] {
  return (value.match(/[\p{L}\p{N}]+/gu) ?? []).map(normalizeToken);
}

function companyWords(value: string): string[] {
  return [...new Set(words(value).filter(
    (word) => word !== "and" && !LEGAL_SUFFIXES.has(word),
  ))];
}

function matchesCompanyName(source: MatchableSource, requestedName: string): boolean {
  const targetWords = companyWords(requestedName);
  if (!targetWords.length) return false;

  const titleWords = words(source.title);
  const contentWords = new Set(words(`${source.title} ${source.snippet}`));
  const titleMentionsBrand = titleWords.includes(targetWords[0]!);
  const requestedQualifiers = targetWords.filter((word) => COMPANY_QUALIFIERS.has(word));
  const titleQualifiers = titleWords.filter((word) => COMPANY_QUALIFIERS.has(word));
  const hasConflictingQualifier = Boolean(
    titleMentionsBrand &&
    requestedQualifiers.length &&
    titleQualifiers.length &&
    !titleQualifiers.some((word) => requestedQualifiers.includes(word)),
  );
  if (hasConflictingQualifier) return false;

  const matchedWords = targetWords.filter((word) => contentWords.has(word));
  const containsBrand = contentWords.has(targetWords[0]!);
  if (!containsBrand) return false;

  // A short brand may appear without its full legal name. Longer names may omit
  // one descriptor, but must still retain the brand and multiple identifying words.
  const isDistinctiveShortBrand =
    targetWords.length <= 2 &&
    targetWords[0]!.length >= 4 &&
    !COMPANY_QUALIFIERS.has(targetWords[0]!);
  const requiredMatches = isDistinctiveShortBrand
    ? 1
    : Math.max(2, targetWords.length - 1);
  return matchedWords.length >= Math.min(requiredMatches, targetWords.length);
}

export function sourceMatchScope(
  source: MatchableSource,
  subject: string,
  subjectType: "company" | "person",
  associatedCompany: string | null,
): SubjectMatchScope | null {
  const includesPersonPhrase = (value: string) => {
    const target = words(value).join(" ");
    const content = words(`${source.title} ${source.snippet}`).join(" ");
    return Boolean(target && ` ${content} `.includes(` ${target} `));
  };

  if (subjectType === "company") {
    return matchesCompanyName(source, subject) ? "company" : null;
  }

  if (includesPersonPhrase(subject)) {
    return "subject";
  }

  if (
    associatedCompany &&
    matchesCompanyName(source, associatedCompany)
  ) {
    return "company";
  }
  return null;
}
