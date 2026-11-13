import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_OFFLINE_BRIEFINGS,
  clearOfflineBriefings,
  loadOfflineBriefings,
  offlineBriefingsStorageKey,
  removeOfflineBriefing,
  saveOfflineBriefing,
} from "./offline-briefings.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function brief(id, overrides = {}) {
  return {
    briefingId: id,
    subject: `Company ${id}`,
    subjectType: "company",
    personRole: null,
    publicRoleTitle: null,
    companyName: null,
    sourceMode: "public",
    sapAreas: [],
    topics: ["news"],
    meetingAt: null,
    generatedAt: "2026-11-13T12:00:00.000Z",
    windowStart: "2026-10-14T12:00:00.000Z",
    windowEnd: "2026-11-13T12:00:00.000Z",
    searchCreditsUsed: 1,
    sourceSearchesCompleted: 1,
    searchResultsReturned: 1,
    overview: {
      text: "A public report.",
      sourceIds: ["S1"],
      topPositive: { text: "Positive signal.", sourceIds: ["S1"] },
      topNegative: { text: "No negative report.", sourceIds: [] },
    },
    highlights: [],
    questions: [],
    topicBriefs: [],
    aiSummaries: [],
    aiSummaryNotice: null,
    sources: [{
      id: "S1",
      title: "Public report",
      url: "https://example.com/report",
      publisher: "Example",
      publishedAt: "2026-11-12T00:00:00.000Z",
      snippet: "Public source text.",
      affiliatedCompanyReport: false,
      images: [{ url: "https://example.com/photo.jpg", description: "Photo" }],
    }],
    sapData: [],
    ...overrides,
  };
}

test("offline storage keys are isolated by account and app path", () => {
  assert.notEqual(offlineBriefingsStorageKey("user-a", "/briefing-agent"), offlineBriefingsStorageKey("user-b", "/briefing-agent"));
  assert.notEqual(offlineBriefingsStorageKey("user-a", "/briefing-agent"), offlineBriefingsStorageKey("user-a", "/another-app"));
});

test("saving a public brief retains citations but omits external images", () => {
  const storage = createStorage();
  const key = offlineBriefingsStorageKey("user-a", "/briefing-agent");
  const saved = saveOfflineBriefing(storage, key, brief("brief-1"), "2026-11-13T12:01:00.000Z");
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.items[0].result.sources[0].url, "https://example.com/report");
  assert.equal("images" in saved.items[0].result.sources[0], false);
  assert.equal(loadOfflineBriefings(storage, key).items.length, 1);
});

test("SAP and private briefs cannot be saved to local offline storage", () => {
  const storage = createStorage();
  const key = offlineBriefingsStorageKey("user-a", "/briefing-agent");
  assert.equal(saveOfflineBriefing(storage, key, brief("sap", { sourceMode: "sap" })).ok, false);
  assert.equal(saveOfflineBriefing(storage, key, brief("private", { sourceMode: "private" })).ok, false);
  assert.equal(loadOfflineBriefings(storage, key).items.length, 0);
});

test("the local library is limited to the newest five briefs and supports removal", () => {
  const storage = createStorage();
  const key = offlineBriefingsStorageKey("user-a", "/briefing-agent");
  for (let index = 1; index <= MAX_OFFLINE_BRIEFINGS + 2; index += 1) {
    const saved = saveOfflineBriefing(storage, key, brief(`brief-${index}`), `2026-11-${String(index).padStart(2, "0")}T12:00:00.000Z`);
    assert.equal(saved.ok, true);
  }
  const loaded = loadOfflineBriefings(storage, key);
  assert.deepEqual(loaded.items.map((item) => item.result.briefingId), ["brief-7", "brief-6", "brief-5", "brief-4", "brief-3"]);
  const removed = removeOfflineBriefing(storage, key, "brief-5");
  assert.equal(removed.ok, true);
  assert.equal(loadOfflineBriefings(storage, key).items.some((item) => item.result.briefingId === "brief-5"), false);
  assert.equal(clearOfflineBriefings(storage, key), null);
  assert.equal(loadOfflineBriefings(storage, key).items.length, 0);
});

test("corrupt local data is reported and cannot be overwritten implicitly", () => {
  const storage = createStorage();
  const key = offlineBriefingsStorageKey("user-a", "/briefing-agent");
  storage.setItem(key, "{broken");
  assert.match(loadOfflineBriefings(storage, key).error, /could not be read safely/i);
  assert.equal(saveOfflineBriefing(storage, key, brief("brief-1")).ok, false);
  assert.equal(clearOfflineBriefings(storage, key), null);
});
