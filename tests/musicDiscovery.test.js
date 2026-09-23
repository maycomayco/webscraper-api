import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import express from "express";
import { Innertube } from "youtubei.js";
import routes from "../v1/routes/sitesRoutes.js";
import { _resetClient, searchSong } from "../services/youtubeMusicService.js";

let server;
let endpoint;
let createClient;
let search;
let feedItems;
let headings;
let fetchUpstream;
let articleNumber = 0;
const realFetch = globalThis.fetch;
const songResult = (title, id = "video-123", artist = "Example Artist") => ({
  id,
  flex_columns: [{ title: { text: title } }],
  artists: [{ name: artist }],
});

beforeEach(async () => {
  _resetClient();
  const articleUrl = `https://indiehoy.com/noticias/test-${++articleNumber}/`;
  feedItems = `<item><title>Lanzamientos para escuchar esta semana</title>
    <link>${articleUrl}</link><pubDate>Tue, 22 Sep 2026 12:00:00 GMT</pubDate></item>`;
  headings = ["Example Artist - &quot;Song One&quot;", "Other Artist - &quot;Missing Song&quot;"];
  fetchUpstream = mock.method(globalThis, "fetch", async (input, options) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:")) return realFetch(input, options);
    if (url.endsWith("/feed/")) {
      return new Response(`<rss><channel>${feedItems}</channel></rss>`);
    }
    assert.equal(url, articleUrl, "Only the selected article may be fetched");
    return new Response(`<div class="post-content-wrap"><div class="entry-content">
      ${headings.map((h) => `<h2 class="wp-block-heading">${h}</h2>`).join("")}
      </div></div>`);
  });
  search = mock.fn(async (query) => ({
    songs: { contents: query.includes("Song One") ? [songResult("Song One")] : [] },
  }));
  // No account or playlist APIs: any attempt to use them fails the HTTP scenario.
  createClient = mock.method(Innertube, "create", async () => ({ music: { search } }));
  const app = express();
  app.use("/api/v1", routes);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/v1/music/discovery`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
  _resetClient();
});

test("HTTP discovery returns anonymous listening links and legacy v1 fields", async (t) => {
  const keys = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_OAUTH_TOKENS_JSON", "YOUTUBE_MUSIC_COOKIES"];
  const previous = keys.map((key) => process.env[key]);
  t.after(() => keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  }));
  keys.forEach((key) => { process.env[key] = "stale-credential"; });

  const response = await fetch(endpoint);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.playlist, null);
  assert.deepEqual(report.tracksFound, [{
    title: "Song One", artist: "Example Artist", videoId: "video-123",
    url: "https://music.youtube.com/watch?v=video-123",
  }]);
  assert.deepEqual(report.tracksAdded, [{ title: "Song One", artist: "Example Artist" }]);
  assert.deepEqual(report.tracksNotFound, [{
    title: "Missing Song", artist: "Other Artist", reason: "No results found on YouTube Music",
  }]);
  assert.deepEqual(report.summary, { total: 2, found: 1, added: 1, notFound: 1 });
  assert.match(report.source.url, /^https:\/\/indiehoy.com\//);
  assert.deepEqual(createClient.mock.calls[0].arguments, []);
  assert.equal(createClient.mock.callCount(), 1);
});

test("unmatched articles succeed with an empty report of found tracks", async () => {
  search.mock.mockImplementation(async () => ({ songs: { contents: [songResult("Unrelated Title")] } }));
  const response = await fetch(endpoint);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.deepEqual(report.tracksFound, []);
  assert.deepEqual(report.tracksAdded, []);
  assert.equal(report.playlist, null);
  assert.deepEqual(report.summary, { total: 2, found: 0, added: 0, notFound: 2 });
});

test("invalid article types are rejected before upstream calls", async () => {
  for (const type of ["invalid", "toString", "__proto__", "tracks&type=albums"]) {
    assert.equal((await fetch(`${endpoint}?type=${type}`)).status, 400);
  }
  assert.equal(createClient.mock.callCount(), 0);
  assert.equal(fetchUpstream.mock.calls.filter(({ arguments: [url] }) => String(url).startsWith("https:")).length, 0);
});

test("missing articles return 404 after checking both years", async () => {
  feedItems = "";
  assert.equal((await fetch(endpoint)).status, 404);
  assert.equal(fetchUpstream.mock.calls.filter(({ arguments: [url] }) => String(url).endsWith("/feed/")).length, 2);
  assert.equal(createClient.mock.callCount(), 0);
});

test("unparseable articles return 502 without searching", async () => {
  headings = [];
  assert.equal((await fetch(endpoint)).status, 502);
  assert.equal(createClient.mock.callCount(), 0);
});

for (const [upstreamStatus, expectedStatus, message] of [
  [400, 502, "Upstream request failed"],
  [401, 502, "Upstream request failed"],
  [429, 429, "YouTube Music rate limit reached"],
]) {
  test(`YouTube ${upstreamStatus} becomes sanitized HTTP ${expectedStatus}`, async () => {
    search.mock.mockImplementation(async () => {
      throw new Error(`Request failed with status code ${upstreamStatus}: private upstream detail`);
    });
    const response = await fetch(endpoint);
    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), { status: "FAILED", error: message });
  });
}

test("concurrent searches share anonymous initialization and failed init can retry", async () => {
  createClient.mock.mockImplementationOnce(async () => { throw new Error("Network failure"); });
  await assert.rejects(searchSong("Artist", "Song One"), /YouTube Music search failed/);
  const results = await Promise.all([searchSong("Artist", "Song One"), searchSong("Artist", "Song One")]);
  assert.ok(results.every((result) => result.videoId === "video-123"));
  assert.equal(createClient.mock.callCount(), 2);
});
