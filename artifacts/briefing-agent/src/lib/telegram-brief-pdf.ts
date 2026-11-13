// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import type { BriefingResult } from "@workspace/api-client-react";
import {
  PDFDocument,
  PDFHexString,
  type Color,
  type PDFFont,
  StandardFonts,
  rgb,
} from "pdf-lib";

type Topic = "news" | "hire" | "launch" | "financial" | "risk";
type ActiveTopic = "all" | Topic;

const TOPIC_LABELS: Record<Topic, string> = {
  news: "News",
  hire: "Hires",
  launch: "Launches",
  financial: "Financial facts",
  risk: "Risks & open questions",
};
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 32;
const MAX_BRIEF_WORDS = 400;

function pdfSafeText(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function takeWords(text: string, remaining: number) {
  const words = pdfSafeText(text).match(/\S+/g) ?? [];
  if (words.length <= remaining) return { text: words.join(" "), remaining: remaining - words.length };
  return {
    text: remaining > 0 ? `${words.slice(0, remaining).join(" ")}...` : "",
    remaining: 0,
  };
}

function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  font: PDFFont,
): string[] {
  const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function shortFilePart(value: string): string {
  const part = pdfSafeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return part || "briefing";
}

export async function createTelegramBriefPdf(
  result: BriefingResult,
  activeTopic: ActiveTopic,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${result.subject} briefing`);
  pdf.setAuthor("Briefing Agent");
  pdf.setSubject("Source-linked meeting briefing");
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.16, 0.18, 0.27);
  const muted = rgb(0.39, 0.38, 0.43);
  const accent = rgb(0.34, 0.28, 0.53);
  const linkColor = rgb(0.12, 0.31, 0.62);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  let y = PAGE_HEIGHT - MARGIN;
  const sourceIds = new Set<string>();
  let wordBudget = MAX_BRIEF_WORDS;

  const drawLine = (text: string, options: {
    font?: PDFFont;
    size?: number;
    color?: Color;
    indent?: number;
  } = {}) => {
    const font = options.font ?? regular;
    const size = options.size ?? 8.2;
    const lines = wrapText(text, maxWidth - (options.indent ?? 0), size, font);
    const lineHeight = size * 1.27;
    for (const line of lines) {
      if (y < MARGIN + lineHeight) return false;
      page.drawText(line, {
        x: MARGIN + (options.indent ?? 0),
        y: y - size,
        size,
        font,
        color: options.color ?? ink,
      });
      y -= lineHeight;
    }
    return true;
  };

  const drawSection = (label: string) => {
    if (y < MARGIN + 20) return false;
    y -= 4;
    drawLine(label.toUpperCase(), { font: bold, size: 8.8, color: accent });
    y -= 1;
    return true;
  };

  const drawBody = (text: string, ids: string[] = [], indent = 0) => {
    const citations = ids.length ? ` [${ids.slice(0, 4).join(", ")}${ids.length > 4 ? ", ..." : ""}]` : "";
    const limited = takeWords(`${text}${citations}`, wordBudget);
    wordBudget = limited.remaining;
    if (limited.text) {
      drawLine(limited.text, { size: 8.1, color: ink, indent });
      ids.forEach((id) => sourceIds.add(id));
    }
  };

  const title = pdfSafeText(result.subject);
  drawLine(title, { font: bold, size: 19, color: ink });
  y -= 4;
  drawLine(
    `${result.subjectType.toUpperCase()} BRIEFING${activeTopic === "all" ? "" : ` - ${TOPIC_LABELS[activeTopic]}`}`,
    { font: bold, size: 8, color: accent },
  );
  const meeting = result.meetingAt
    ? `Meeting: ${new Date(result.meetingAt).toLocaleString()}`
    : `Prepared: ${new Date(result.generatedAt).toLocaleString()}`;
  drawLine(meeting, { size: 7.6, color: muted });
  drawLine(
    `Research window: ${new Date(result.windowStart).toLocaleDateString()} - ${new Date(result.windowEnd).toLocaleDateString()}`,
    { size: 7.6, color: muted },
  );
  drawLine(`Generated: ${new Date(result.generatedAt).toLocaleString()}`, {
    size: 7.6,
    color: muted,
  });
  if (result.personRole) {
    drawLine(`Briefing context: ${pdfSafeText(result.personRole)}`, {
      size: 7.6,
      color: muted,
    });
  }
  y -= 4;

  const topicOverview = activeTopic === "all"
    ? result.overview
    : result.topicBriefs.find((item) => item.category === activeTopic) ?? result.overview;
  drawSection("Brief");
  drawBody(topicOverview.text, topicOverview.sourceIds);

  const topics = activeTopic === "all" ? result.topics : [activeTopic];
  drawSection("Highlights");
  for (const topic of topics) {
    const highlight = result.highlights.find((item) => item.category === topic);
    if (highlight) {
      if (wordBudget <= 0) break;
      drawLine(`${TOPIC_LABELS[topic]}: ${pdfSafeText(highlight.title)}`, {
        font: bold,
        size: 8.1,
      });
      drawBody(highlight.summary, highlight.sourceIds, 8);
      y -= 2;
    } else if (wordBudget > 0) {
      drawBody(`No sourced ${TOPIC_LABELS[topic].toLowerCase()} items were found in the selected research window.`);
    }
  }

  if (result.sourceMode === "sap" && result.sapData.length) {
    drawSection("SAP data");
    const sapItems = result.sapData.slice(0, 3);
    for (const item of sapItems) {
      if (wordBudget <= 0) break;
      drawLine(`${item.area}: ${pdfSafeText(item.title)}`, { font: bold, size: 8.1 });
      drawBody(item.detail, item.sourceIds, 8);
      y -= 2;
    }
  }

  if (topics.includes("risk") && result.questions.length) {
    drawSection("Open questions");
    for (const question of result.questions.slice(0, 2)) {
      if (wordBudget <= 0) break;
      drawBody(question.text, question.sourceIds);
    }
  } else if (topics.includes("risk") && wordBudget > 0) {
    drawSection("Open questions");
    drawBody("No open questions were returned from the sourced results.");
  }

  const visibleSourceIds = [...sourceIds];
  const sources = result.sources.filter((source) => visibleSourceIds.includes(source.id));
  if (sources.length) {
    drawSection("Sources");
    const listedSources = sources.slice(0, 14);
    for (const source of listedSources) {
      if (y < MARGIN + 13) break;
      const label = `[${pdfSafeText(source.id)}] ${pdfSafeText(source.title) || "Source link"}`;
      const lines = wrapText(label, maxWidth, 7.1, regular);
      const first = lines[0] ?? label.slice(0, 120);
      const textWidth = Math.min(maxWidth, regular.widthOfTextAtSize(first, 7.1));
      const baseline = y - 7.1;
      page.drawText(first, {
        x: MARGIN,
        y: baseline,
        size: 7.1,
        font: regular,
        color: linkColor,
      });
      const annotation = pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [MARGIN, baseline - 2, MARGIN + textWidth, baseline + 9],
        Border: [0, 0, 0],
        A: {
          Type: "Action",
          S: "URI",
          URI: PDFHexString.fromText(source.url),
        },
      });
      page.node.addAnnot(pdf.context.register(annotation));
      y -= 9;
      if (lines.length > 1) {
        const remainder = lines.slice(1).join(" ");
        drawLine(remainder, { size: 7.1, color: muted });
      }
    }
    if (sources.length > listedSources.length && y > MARGIN + 10) {
      drawLine(`${sources.length - listedSources.length} more source links are available in the app.`, {
        size: 7,
        color: muted,
      });
    }
  } else {
    drawSection("Sources");
    drawLine("No source links were attached to the displayed brief.", {
      size: 7.4,
      color: muted,
    });
  }

  const bytes = await pdf.save();
  return {
    bytes,
    filename: `${shortFilePart(result.subject)}-briefing.pdf`,
  };
}
