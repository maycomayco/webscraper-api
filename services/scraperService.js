import NodeCache from "node-cache";
import * as cheerio from "cheerio";
import { FETCH_TIMEOUT_MS, CACHE_TTL_S } from "../constants/config.js";

export class ScraperValidationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "ScraperValidationError";
        this.code = "SCRAPER_VALIDATION_FAILED";
        this.status = 500;
        this.details = details;
        this.cause = details.cause;
    }
}

export class UpstreamTimeoutError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "UpstreamTimeoutError";
        this.code = "UPSTREAM_TIMEOUT";
        this.status = 504;
        this.details = details;
        this.cause = details.cause;
    }
}

export class UpstreamRequestError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "UpstreamRequestError";
        this.code = "UPSTREAM_REQUEST_FAILED";
        this.status = 502;
        this.upstreamStatus = details.upstreamStatus;
        this.details = details;
        this.cause = details.cause;
    }
}

// Cache raw HTML keyed by URL. We store HTML strings (not Cheerio objects)
// because Cheerio instances have internal state that can't be safely serialized.
// checkperiod: 120s — how often node-cache scans for expired keys.
const cache = new NodeCache({ stdTTL: CACHE_TTL_S, checkperiod: 120 });

// ---------------------------------------------------------------------------
// SSRF Protection Rules (issue #7)
// ---------------------------------------------------------------------------
// Current URLs are hardcoded in each controller, so SSRF is not exploitable
// today. If we ever expose a dynamic URL input (user-supplied URL, query param,
// request body field), the following rules MUST be enforced before calling
// fetch():
//
//   1. ALLOWLIST — Only permit domains we explicitly trust.
//      Example: const ALLOWED_HOSTS = ["www.newbalance.com.ar", "www.dexter.com.ar"];
//
//   2. SCHEME — Reject anything that is not "https:".
//
//   3. PRIVATE NETWORK — Block localhost, 127.0.0.0/8, 10.0.0.0/8,
//      172.16.0.0/12, 192.168.0.0/16, ::1, and fc00::/7.
//      Resolve DNS first (e.g. dns.lookup) and validate the resolved IP,
//      not just the hostname — attackers use DNS rebinding to bypass
//      hostname-only checks.
//
// The validateUrl() helper below implements rules 2 and 3. It is called
// inside scrape() as a safety net. Rule 1 (allowlist) is intentionally left
// as a caller responsibility because the allowed set depends on the route.
// ---------------------------------------------------------------------------

const BLOCKED_CIDRS = [
    "127.0.0.0/8",    // loopback
    "10.0.0.0/8",     // private class A
    "172.16.0.0/12",  // private class B
    "192.168.0.0/16", // private class C
    "169.254.0.0/16", // link-local
    "::1",            // IPv6 loopback
    "fc00::/7",       // IPv6 unique local
];

/**
 * Checks whether an IPv4 address falls inside a CIDR range.
 * Pure string comparison — no external dependencies.
 *
 * @param {string} ip   - IPv4 address (e.g. "192.168.1.5").
 * @param {string} cidr - CIDR block   (e.g. "192.168.0.0/16").
 * @returns {boolean}
 */
function ipv4InCidr(ip, cidr) {
    const [range, bits] = cidr.split("/");
    const mask = ~(2 ** (32 - Number(bits)) - 1);
    const toLong = (addr) =>
        addr.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
    return (toLong(ip) & mask) === (toLong(range) & mask);
}

/**
 * Validates a URL against SSRF rules 2 (scheme) and 3 (private network).
 * Does NOT enforce an allowlist — that is the caller's responsibility.
 *
 * @param {string} url - The URL to validate.
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return { valid: false, reason: "Invalid URL" };
    }

    // Rule 2: scheme must be https
    if (parsed.protocol !== "https:") {
        return { valid: false, reason: `Blocked scheme: ${parsed.protocol}` };
    }

    // Rule 3: block private / reserved IPs
    const hostname = parsed.hostname;

    // Obvious localhost names
    if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) {
        return { valid: false, reason: `Blocked host: ${hostname}` };
    }

    // IPv4 private ranges (only check if hostname looks like an IPv4 address)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
        for (const cidr of BLOCKED_CIDRS) {
            if (cidr.includes(".") && ipv4InCidr(hostname, cidr)) {
                return { valid: false, reason: `Blocked private IP: ${hostname} (${cidr})` };
            }
        }
    }

    return { valid: true };
}

/**
 * Fetches a URL and returns a Cheerio instance for DOM traversal.
 * Implements a cache-aside pattern: on cache miss, fetches upstream,
 * stores the raw HTML, and returns a loaded Cheerio object.
 *
 * SSRF guard: validateUrl() runs on every call as a safety net.
 * When dynamic URLs are introduced, callers MUST also enforce an allowlist
 * of permitted domains before calling scrape().
 *
 * @param {string} url - The URL to scrape.
 * @returns {Promise<CheerioStatic>} A Cheerio instance loaded with the page HTML.
 * @throws {Error} When the URL fails SSRF validation or upstream returns non-2xx.
 */
export const scrape = async (url) => {
    // SSRF safety net — blocks private IPs and non-https schemes
    const { valid, reason } = validateUrl(url);
    if (!valid) {
        throw new ScraperValidationError("Scraper URL validation failed", {
            reason,
            url,
        });
    }
    // Cache-aside: return immediately on hit, skip the network call
    const cached = cache.get(url);
    if (cached) {
        return cheerio.load(cached);
    }

    let res;
    try {
        res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            throw new UpstreamTimeoutError("Upstream request timed out", {
                timeoutMs: FETCH_TIMEOUT_MS,
                url,
                cause: error,
            });
        }

        throw new UpstreamRequestError("Upstream request failed", {
            reason: "network_error",
            url,
            cause: error,
        });
    }

    if (!res.ok) {
        throw new UpstreamRequestError("Upstream request failed", {
            upstreamStatus: res.status,
            url,
        });
    }

    const html = await res.text();

    // Only cache non-empty responses — empty HTML likely means bot detection
    // or an upstream issue. Caching it would serve broken pages for TTL duration.
    if (html.trim().length > 0) {
        cache.set(url, html);
    }

    return cheerio.load(html);
};
