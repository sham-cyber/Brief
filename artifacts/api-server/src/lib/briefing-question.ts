export function appendQuestionToSearchQuery(
  query: string,
  question?: string,
): string {
  const cleanQuestion = question
    ?.replace(/["\\]/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return cleanQuestion ? `${query} ${cleanQuestion}` : query;
}
