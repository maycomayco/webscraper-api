#!/usr/bin/env node
/**
 * youtube-auth.js
 *
 * One-time script to obtain YouTube Music OAuth2 tokens.
 *
 * Usage:
 *   1. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in your .env
 *   2. node scripts/youtube-auth.js
 *   3. Follow the printed instructions (visit URL, enter user_code)
 *   4. Tokens are saved to data/youtube-oauth-tokens.json
 *   5. Upload that file to Render (or paste its contents into
 *      YOUTUBE_OAUTH_TOKENS_JSON env var as fallback)
 */

import "dotenv/config";
import { Innertube } from "youtubei.js";
import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TOKEN_PATH = new URL("../data/youtube-oauth-tokens.json", import.meta.url);

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET env vars.");
  console.error("Set them in .env and try again.");
  process.exit(1);
}

console.log("Initializing YouTube TV client for OAuth2...\n");

const yt = await Innertube.create({
  client_type: "TV",
});

yt.session.on("auth-pending", (data) => {
  console.log("========================================");
  console.log("Go to:", data.verification_url);
  console.log("Enter code:", data.user_code);
  console.log("========================================\n");
  console.log("Waiting for authorization...");
});

yt.session.on("auth", ({ credentials }) => {
  console.log("\nAuthentication successful!");

  mkdirSync(dirname(TOKEN_PATH.pathname), { recursive: true });
  writeFileSync(TOKEN_PATH.pathname, JSON.stringify(credentials, null, 2));

  console.log("Tokens saved to:", TOKEN_PATH.pathname);
  console.log("\nNext steps:");
  console.log("  1. Copy the file contents to Render env var YOUTUBE_OAUTH_TOKENS_JSON");
  console.log("     (or upload the file to your server)");
  console.log("  2. Remove YOUTUBE_MUSIC_COOKIES from env vars (legacy, no longer needed)");
  console.log("  3. Deploy / restart your server");
});

yt.session.on("update-credentials", ({ credentials }) => {
  console.log("\nTokens refreshed — saving updated credentials...");
  writeFileSync(TOKEN_PATH.pathname, JSON.stringify(credentials, null, 2));
});

// Start the device-code flow. If no saved tokens exist, this fires
// 'auth-pending' and polls until the user authorizes.
await yt.session.signIn();
