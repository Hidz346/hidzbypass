import dns from "node:dns/promises";
import net from "node:net";

const MAX_HOPS = 20;
const REQUEST_TIMEOUT = 12000;
const MAX_HTML_BYTES = 1_000_000;
const MAX_CANDIDATE_LENGTH = 4096;
const SFL_API_URL = "https://api.ikyyxd.my.id/tools/skiplink/sfl";
const SFL_API_REFERER = "https://pynz-bypasssfl.netlify.app/";

export type ResolveHop = {
  hop: number;
  url: string;
  status: number;
  location?: string;
  elapsedMs: number;
};

export type ResolveResult = {
  originalUrl: string;
  finalUrl: string;
  resolved: boolean;
  reason?:
    | "REDIRECT_RESOLVED"
    | "NO_DESTINATION_FOUND"
    | "SAME_URL"
    | "HTTP_403_FORBIDDEN"
    | "HTTP_4XX"
    | "TARGET_UNREACHABLE";
  hops: ResolveHop[];
  elapsedMs: number;
};

type CookieJar = Map<string, Map<string, string>>;

type SflApiResult = {
  destinationUrl?: unknown;
  originalUrl?: unknown;
};

const INTERMEDIATE_WORDS = [
  "continue", "skip", "proceed", "redirect", "destination", "direct link",
  "direct download", "download", "get link", "get download", "go to",
  "click here", "open link", "visit", "next", "wait", "original link",
  "link tujuan", "lanjut", "lewati", "unduh", "download file"
];

const BLOCKED_WORDS = [
  "login", "sign in", "captcha", "verify you are human", "cloudflare",
  "access denied", "forbidden", "password"
];

function normalizeInputUrl(raw: string) {
  let value = raw.trim();
  if (!value) return "";

  // Accept common Markdown links copied from chats/docs:
  // [label](https://example.com/path)
  const markdown = value.match(/^\[[^\]]+\]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdown?.[1]) value = markdown[1].trim();

  // Also unwrap angle brackets commonly used around pasted URLs.
  if (value.startsWith("<") && value.endsWith(">")) {
    value = value.slice(1, -1).trim();
  }

  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
}

function isPrivateIpv6(ip: string) {
  const value = ip.toLowerCase();
  return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
}

async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL tidak valid.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Hanya URL HTTP/HTTPS yang didukung.");
  }

  if (url.username || url.password) {
    throw new Error("URL dengan kredensial tertanam tidak didukung.");
  }

  const host = url.hostname.replace(/\.$/, "");
  if (net.isIP(host)) {
    if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
      throw new Error("Alamat jaringan privat ditolak.");
    }
    return url;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Host tidak ditemukan atau tidak valid.");
  }
  if (!records.length) throw new Error("Host tidak dapat diverifikasi.");

  for (const record of records) {
    if (net.isIP(record.address) === 4 ? isPrivateIpv4(record.address) : isPrivateIpv6(record.address)) {
      throw new Error("Host mengarah ke jaringan privat dan ditolak.");
    }
  }

  return url;
}

function getCookies(jar: CookieJar, hostname: string) {
  const cookies = jar.get(hostname);
  if (!cookies?.size) return "";
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function storeCookies(jar: CookieJar, hostname: string, headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = typeof getSetCookie === "function"
    ? getSetCookie.call(headers)
    : (() => {
        const value = headers.get("set-cookie");
        return value ? [value] : [];
      })();

  if (!values.length) return;

  const cookies = jar.get(hostname) || new Map<string, string>();
  for (const raw of values) {
    const first = raw.split(";")[0];
    const index = first.indexOf("=");
    if (index <= 0) continue;
    const name = first.slice(0, index).trim();
    const value = first.slice(index + 1).trim();
    if (name) cookies.set(name, value);
  }
  jar.set(hostname, cookies);
}

async function resolveWithSflApi(url: URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const started = Date.now();

  try {
    const endpoint = `${SFL_API_URL}?url=${encodeURIComponent(url.toString())}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
        "accept": "application/json",
        "referer": SFL_API_REFERER
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false as const, elapsedMs: Date.now() - started };
    }

    const data = await response.json().catch(() => null) as { status?: unknown; result?: SflApiResult } | null;
    const destination = typeof data?.result?.destinationUrl === "string"
      ? normalizeInputUrl(data.result.destinationUrl)
      : "";

    if (!destination) {
      return { ok: false as const, elapsedMs: Date.now() - started };
    }

    const next = await assertPublicUrl(destination);
    if (isSameUrl(next.toString(), url.toString())) {
      return { ok: false as const, elapsedMs: Date.now() - started };
    }

    return {
      ok: true as const,
      destination: next,
      elapsedMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHop(url: URL, jar: CookieJar, referer?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const started = Date.now();

  try {
    const headers: Record<string, string> = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "cache-control": "no-cache",
      "pragma": "no-cache"
    };

    const cookie = getCookies(jar, url.hostname);
    if (cookie) headers.cookie = cookie;
    if (referer) headers.referer = referer;

    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers,
      cache: "no-store"
    });

    storeCookies(jar, url.hostname, response.headers);
    return { response, elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}


function htmlDecode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function decodeJsValue(value: string) {
  return htmlDecode(value)
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\//g, "/")
    .trim();
}

function normalizeCandidate(value: string) {
  const candidate = decodeJsValue(value).trim().replace(/[\u0000-\u001f]+/g, "");
  if (!candidate || candidate.startsWith("#") || /^javascript:|^data:|^mailto:|^tel:/i.test(candidate)) {
    return null;
  }
  if (candidate.length > MAX_CANDIDATE_LENGTH) return null;
  return candidate;
}

function extractMetaRefresh(body: string) {
  const metaPattern = /<meta\b([^>]+)>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(body))) {
    const attrs = match[1];
    const httpEquiv = attrs.match(/http-equiv\s*=\s*["\']?([^"\'\s>]+)/i)?.[1];
    if (!httpEquiv || httpEquiv.toLowerCase() !== "refresh") continue;

    const content = attrs.match(/content\s*=\s*["\']([^"\']*)["\']/i)?.[1] ||
      attrs.match(/content\s*=\s*([^\s>]+)/i)?.[1] || "";
    const url = content.match(/(?:^|;)\s*url\s*=\s*["\']?([^"\'\s;>]+)/i)?.[1];
    if (url) return normalizeCandidate(url);
  }

  return null;
}

function extractJsRedirect(body: string) {
  const patterns = [
    /(?:window\.|document\.)?location(?:\.href)?\s*=\s*["\']([^"\']+)["\']/gi,
    /(?:window\.|document\.)?location\.(?:replace|assign)\(\s*["\']([^"\']+)["\']\s*\)/gi,
    /(?:window\.)?location\.setAttribute\(\s*["\']href["\']\s*,\s*["\']([^"\']+)["\']\s*\)/gi,
    /(?:window\.|document\.)?location(?:\.href)?\s*=\s*decodeURIComponent\(\s*["\']([^"\']+)["\']\s*\)/gi,
    /(?:window\.|document\.)?location(?:\.href)?\s*=\s*atob\(\s*["\']([^"\']+)["\']\s*\)/gi,
    /(?:window\.)?open\(\s*["\']([^"\']+)["\']\s*(?:,|\))/gi,
    /(?:window\.|document\.)?location\s*=\s*new\s+URL\(\s*["\']([^"\']+)["\']/gi
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(body);
    if (match?.[1]) return normalizeCandidate(match[1]);
  }

  // Common obfuscation: a URL is URI-encoded inside a variable and later
  // assigned to location. Decode only strings that already look like URLs.
  const encoded = body.match(/(?:https?%3A%2F%2F|https?%253A%252F%252F)[^"'\s<>{}]+/i)?.[0];
  if (encoded) {
    try {
      const decoded = decodeURIComponent(encoded);
      if (/^https?:\/\//i.test(decoded)) return normalizeCandidate(decoded);
    } catch {}
  }

  return null;
}

function extractUrlFromQuery(url: URL) {
  const keys = [
    "url", "u", "target", "dest", "destination", "redirect", "redirect_url",
    "redirect_uri", "continue", "continue_url", "return", "return_url",
    "next", "link", "to"
  ];

  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    try {
      const candidate = new URL(value, url);
      if (["http:", "https:"].includes(candidate.protocol) && candidate.href !== url.href) {
        return candidate.toString();
      }
    } catch {}
  }

  return null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractIntermediateLink(body: string) {
  const lower = body.toLowerCase();
  const hasIntermediateSignal = INTERMEDIATE_WORDS.some((word) => lower.includes(word));
  if (!hasIntermediateSignal) return null;

  let best: { url: string; score: number } | null = null;
  const anchorPattern = /<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(body))) {
    const rawHref = normalizeCandidate(match[2]);
    if (!rawHref) continue;

    const text = stripTags(match[4]).toLowerCase();
    const attrs = `${match[1]} ${match[3]}`.toLowerCase();

    if (BLOCKED_WORDS.some((word) => `${text} ${attrs}`.includes(word))) continue;

    let score = 0;
    const haystack = `${text} ${attrs} ${rawHref}`.toLowerCase();

    for (const word of INTERMEDIATE_WORDS) {
      if (haystack.includes(word)) score += 2;
    }

    if (/direct|download|continue|skip|proceed|destination|redirect|next|original/i.test(text)) score += 5;
    if (/https?:\/\//i.test(rawHref)) score += 1;

    if (!best || score > best.score) {
      best = { url: rawHref, score };
    }
  }

  return best && best.score >= 4 ? best.url : null;
}

function extractRedirectCandidate(body: string) {
  const direct = extractMetaRefresh(body) || extractJsRedirect(body);
  if (direct) return direct;

  const jsonPatterns = [
    /"(?:redirectUrl|redirectURL|destinationUrl|targetUrl|continueUrl|nextUrl)"\s*:\s*"([^"]+)"/i,
    /(?:redirectUrl|redirectURL|destinationUrl|targetUrl|continueUrl|nextUrl)\s*[:=]\s*["']([^"']+)["']/i
  ];

  for (const pattern of jsonPatterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeCandidate(match[1]);
      if (candidate) return candidate;
    }
  }

  const link = extractIntermediateLink(body);
  if (link) return link;

  // Some shorteners return a JSON object from an HTML/bootstrap endpoint.
  // Parse small JSON blocks and look for conventional destination fields.
  const jsonBlock = body.match(/\{[\s\S]{0,20000}\}/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[0]) as unknown;
      const queue: unknown[] = [parsed];
      const keys = new Set([
        "url", "href", "link", "target", "destination", "destinationurl",
        "targeturl", "redirect", "redirecturl", "redirect_uri", "continue",
        "continueurl", "next", "nexturl", "download", "downloadurl"
      ]);
      while (queue.length) {
        const value = queue.shift();
        if (!value || typeof value !== "object") continue;
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          if (typeof child === "string" && keys.has(key.toLowerCase())) {
            const candidate = normalizeCandidate(child);
            if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
          } else if (child && typeof child === "object") {
            queue.push(child);
          }
        }
      }
    } catch {}
  }

  return null;
}

function isSameUrl(a: string, b: string) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = "";
    right.hash = "";
    return left.toString() === right.toString();
  } catch {
    return a === b;
  }
}

export async function resolvePublicUrl(rawUrl: string): Promise<ResolveResult> {
  const started = Date.now();
  const normalizedInput = normalizeInputUrl(rawUrl);
  let current = await assertPublicUrl(normalizedInput);
  const originalUrl = current.toString();
  const hops: ResolveHop[] = [];
  const visited = new Set<string>();
  const cookies: CookieJar = new Map();
  let referer: string | undefined;

  for (let hop = 1; hop <= MAX_HOPS; hop++) {
    const normalized = current.toString();
    if (visited.has(normalized)) {
      throw new Error("Redirect loop terdeteksi.");
    }
    visited.add(normalized);

    const queryTarget = extractUrlFromQuery(current);
    if (queryTarget && !isSameUrl(queryTarget, normalized)) {
      const next = await assertPublicUrl(queryTarget);
      hops.push({
        hop,
        url: normalized,
        status: 200,
        location: next.toString(),
        elapsedMs: 0
      });
      referer = normalized;
      current = next;
      continue;
    }

    let response: Response;
    let elapsedMs: number;
    try {
      const hopResult = await fetchHop(current, cookies, referer);
      response = hopResult.response;
      elapsedMs = hopResult.elapsedMs;
    } catch (error) {
      const item: ResolveHop = {
        hop,
        url: normalized,
        status: 0,
        elapsedMs: Date.now() - started
      };
      hops.push(item);
      return {
        originalUrl,
        finalUrl: current.toString(),
        resolved: false,
        reason: "TARGET_UNREACHABLE",
        hops,
        elapsedMs: Date.now() - started
      };
    }

    const location = response.headers.get("location") || undefined;
    const item: ResolveHop = {
      hop,
      url: normalized,
      status: response.status,
      elapsedMs
    };

    // A 403 means the target refused this server-side request. For SFL,
    // use the dedicated resolver before reporting the access denial.
    if (response.status === 403) {
      if (current.hostname.toLowerCase() === "sfl.gl") {
        try {
          const fallback = await resolveWithSflApi(current);
          if (fallback.ok) {
            item.location = fallback.destination.toString();
            hops.push(item);
            referer = normalized;
            current = fallback.destination;
            continue;
          }
        } catch {
          // Keep the original 403 result when the fallback is unavailable.
        }
      }

      hops.push(item);
      return {
        originalUrl,
        finalUrl: current.toString(),
        resolved: false,
        reason: "HTTP_403_FORBIDDEN",
        hops,
        elapsedMs: Date.now() - started
      };
    }

    if (response.status >= 400 && response.status < 500) {
      hops.push(item);
      return {
        originalUrl,
        finalUrl: current.toString(),
        resolved: false,
        reason: "HTTP_4XX",
        hops,
        elapsedMs: Date.now() - started
      };
    }

    // Prefer real HTTP redirects over page heuristics.
    if (location) {
      const next = await assertPublicUrl(new URL(location, current).toString());
      item.location = next.toString();
      hops.push(item);
      referer = normalized;
      current = next;
      continue;
    }

    const type = response.headers.get("content-type") || "";
    let embedded: string | null = null;

    if (type.includes("text/html") || type.includes("application/json") || type.includes("text/plain")) {
      const body = (await response.text()).slice(0, MAX_HTML_BYTES);
      embedded = extractRedirectCandidate(body);

      if (embedded) {
        const next = await assertPublicUrl(new URL(embedded, current).toString());
        if (!isSameUrl(next.toString(), normalized) && !visited.has(next.toString())) {
          item.location = next.toString();
          hops.push(item);
          referer = normalized;
          current = next;
          continue;
        }
      }
    }

    // Some SFL links return HTTP 200 with an intermediate page instead of
    // a usable Location header. Only call the dedicated resolver when the
    // normal redirect/page parsers did not produce a next URL.
    if (current.hostname.toLowerCase() === "sfl.gl") {
      try {
        const fallback = await resolveWithSflApi(current);
        if (fallback.ok) {
          item.location = fallback.destination.toString();
          hops.push(item);
          referer = normalized;
          current = fallback.destination;
          continue;
        }
      } catch {
        // Fall through to the normal unresolved result.
      }
    }

    hops.push(item);

    return {
      originalUrl,
      finalUrl: current.toString(),
      resolved: !isSameUrl(originalUrl, current.toString()),
      reason: isSameUrl(originalUrl, current.toString()) ? "NO_DESTINATION_FOUND" : "REDIRECT_RESOLVED",
      hops,
      elapsedMs: Date.now() - started
    };
  }

  throw new Error(`Batas ${MAX_HOPS} hop tercapai. Link kemungkinan memakai terlalu banyak redirect.`);
}
