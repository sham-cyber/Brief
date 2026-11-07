import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { createTelegramBriefPdf } from "./telegram-brief-pdf.ts";

const result = {
  briefingId: "7d0749ea-c796-4b45-a1d7-e5e3ef53d87c",
  subject: "Finolex Cables",
  subjectType: "company",
  personRole: null,
  publicRoleTitle: null,
  companyName: null,
  sourceMode: "public",
  sapAreas: [],
  topics: ["news", "hire", "launch", "financial", "risk"],
  meetingAt: null,
  generatedAt: "2026-11-07T10:00:00.000Z",
  windowStart: "2026-10-08T10:00:00.000Z",
  windowEnd: "2026-11-07T10:00:00.000Z",
  searchCreditsUsed: 5,
  sourceSearchesCompleted: 5,
  searchResultsReturned: 2,
  overview: {
    text: "Two current public reports were found for the company.",
    sourceIds: ["S1"],
    topPositive: { text: "A positive signal.", sourceIds: ["S1"] },
    topNegative: { text: "No negative signal found.", sourceIds: [] },
  },
  highlights: [
    {
      category: "news",
      title: "Company update",
      summary: "A sourced company update was published.",
      sourceIds: ["S1"],
    },
  ],
  questions: [],
  topicBriefs: [
    {
      category: "news",
      text: "A current company update was found.",
      sourceIds: ["S1"],
      topPositive: { text: "Signal.", sourceIds: ["S1"] },
      topNegative: { text: "No sourced negative result.", sourceIds: [] },
    },
  ],
  sources: [
    {
      id: "S1",
      title: "Finolex company update",
      url: "https://example.com/finolex-update",
      publisher: "Example",
      publishedAt: "2026-11-02T12:00:00.000Z",
      snippet: "A public update.",
      affiliatedCompanyReport: false,
    },
  ],
  sapData: [],
};

test("Telegram brief PDF is a single page with clickable cited sources", async () => {
  const { bytes, filename } = await createTelegramBriefPdf(result, "news");
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert.equal(filename, "finolex-cables-briefing.pdf");
  assert.equal(document.getPages()[0].node.Annots()?.size(), 1);
});

test("Telegram brief PDF works with no meeting time and uncited topics", async () => {
  const { bytes } = await createTelegramBriefPdf(result, "risk");
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
});
