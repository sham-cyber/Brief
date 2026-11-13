import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("./sw.js", import.meta.url), "utf8");

function createWorker({ fetchImpl }) {
  const listeners = new Map();
  const entries = new Map();
  const cacheUrl = (request) => typeof request === "string"
    ? request
    : request instanceof URL
      ? request.href
      : request.url;
  const caches = {
    async open(name) {
      return {
        async add(url) {
          const response = await fetchImpl(url);
          if (!response.ok) throw new Error("cache add failed");
          entries.set(`${name}:${url}`, response.clone());
        },
        async match(request) {
          const url = cacheUrl(request);
          const match = [...entries.entries()].find(([key]) => key.endsWith(`:${url}`));
          return match?.[1]?.clone();
        },
        async put(request, response) {
          const url = cacheUrl(request);
          entries.set(`${name}:${url}`, response.clone());
        },
      };
    },
    async keys() {
      return [...new Set([...entries.keys()].map((key) => key.split(":")[0]))];
    },
    async delete(name) {
      for (const key of [...entries.keys()]) if (key.startsWith(`${name}:`)) entries.delete(key);
      return true;
    },
  };
  const self = {
    registration: { scope: "https://example.test/app/" },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
  };
  vm.runInNewContext(workerSource, { self, caches, fetch: fetchImpl, URL, Response });
  return {
    entries,
    listeners,
    async install() {
      let pending;
      listeners.get("install")({ waitUntil(value) { pending = value; } });
      await pending;
    },
    async request(request) {
      let responsePromise;
      let intercepted = false;
      listeners.get("fetch")({
        request,
        respondWith(value) {
          intercepted = true;
          responsePromise = value;
        },
      });
      return intercepted ? responsePromise : null;
    },
  };
}

test("offline navigation falls back to the cached app shell, not route-specific pages", async () => {
  let offline = false;
  const worker = createWorker({
    fetchImpl: async (request) => {
      if (offline) throw new Error("offline");
      const url = typeof request === "string" ? request : request.url;
      return new Response(`shell for ${url}`, { status: 200 });
    },
  });
  await worker.install();
  offline = true;
  const response = await worker.request({
    method: "GET",
    mode: "navigate",
    url: "https://example.test/app/user-portal",
    headers: new Headers(),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /shell for https:\/\/example\.test\/app\//);
});

test("navigation caches only the public shell, not route or query-specific responses", async () => {
  const fetchCalls = [];
  const worker = createWorker({
    fetchImpl: async (request, options) => {
      fetchCalls.push({ request, options });
      const url = typeof request === "string" ? request : request.url;
      return new Response(`response for ${url}`, { status: 200 });
    },
  });
  await worker.install();
  await worker.request({
    method: "GET",
    mode: "navigate",
    url: "https://example.test/app/user-portal?session=private",
    headers: new Headers(),
  });
  assert.equal(fetchCalls[0].options.credentials, "omit");
  assert.equal(worker.entries.size, 1);
  assert.ok([...worker.entries.keys()].some((key) => key.endsWith(":https://example.test/app/")));
});

test("API and authenticated requests are never intercepted or cached", async () => {
  const worker = createWorker({ fetchImpl: async () => new Response("ok") });
  await worker.install();
  const apiResponse = await worker.request({
    method: "GET",
    mode: "cors",
    url: "https://example.test/app/api/briefings",
    headers: new Headers(),
  });
  const authResponse = await worker.request({
    method: "GET",
    mode: "cors",
    url: "https://example.test/app/private.js",
    headers: new Headers({ Authorization: "Bearer test" }),
  });
  assert.equal(apiResponse, null);
  assert.equal(authResponse, null);
});

test("POST requests are not handled by the service worker", async () => {
  const worker = createWorker({ fetchImpl: async () => new Response("ok") });
  await worker.install();
  const response = await worker.request({
    method: "POST",
    mode: "cors",
    url: "https://example.test/app/api/briefings",
    headers: new Headers(),
  });
  assert.equal(response, null);
});
