/**
 * URL scraper — pulls og:title, og:description, h1, meta description from a
 * given URL so the customer doesn't have to type their own product brief.
 *
 * Stdlib fetch. 5s timeout. Never throws to the caller — returns whatever
 * it could find; missing fields stay null.
 */

export interface ScrapeResult {
  url: string;
  hostname: string;
  derivedKey: string;
  name: string | null;
  tagline: string | null;
  essay: string | null;
  ogImage: string | null;
  favicon: string | null;
  fetchedAt: string;
  error: string | null;
}

const MAX_BYTES = 1024 * 256; // 256 KB cap — headers + first markup only

function pickAttr(html: string, tagPattern: RegExp): string | null {
  const m = html.match(tagPattern);
  if (!m) return null;
  return decodeEntities(m[1].trim()).slice(0, 600) || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    return new URL(s).toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function deriveKey(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    const stem = parts.length >= 3 ? parts[0] : parts[0];
    return stem.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 40) || 'product';
  } catch {
    return 'product';
  }
}

export async function scrapeUrl(input: string): Promise<ScrapeResult> {
  const url = normalizeUrl(input);
  const hostname = url ? new URL(url).hostname : input;
  const base: ScrapeResult = {
    url,
    hostname,
    derivedKey: deriveKey(url || input),
    name: null,
    tagline: null,
    essay: null,
    ogImage: null,
    favicon: null,
    fetchedAt: new Date().toISOString(),
    error: null,
  };
  if (!url) {
    base.error = 'invalid url';
    return base;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'NomoiSurface/1.0 (+https://surface.nomoi.ai)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    }).finally(() => clearTimeout(timer));

    if (!r.ok) {
      base.error = `fetch ${r.status}`;
      return base;
    }
    const reader = r.body?.getReader();
    if (!reader) {
      base.error = 'no body';
      return base;
    }

    let received = 0;
    const chunks: Uint8Array[] = [];
    while (received < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    try { await reader.cancel(); } catch { /* ignore */ }

    const html = new TextDecoder('utf-8').decode(
      chunks.reduce((acc, c) => {
        const next = new Uint8Array(acc.length + c.length);
        next.set(acc);
        next.set(c, acc.length);
        return next;
      }, new Uint8Array(0)),
    );

    const ogTitle = pickAttr(html, /<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)
      ?? pickAttr(html, /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i);
    const ogDesc = pickAttr(html, /<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i)
      ?? pickAttr(html, /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i);
    const metaDesc = pickAttr(html, /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)
      ?? pickAttr(html, /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
    const ogImage = pickAttr(html, /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i)
      ?? pickAttr(html, /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
    const titleTag = pickAttr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1 = pickAttr(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

    base.name = (ogTitle || titleTag || (h1 ? stripTags(h1) : null) || null)?.slice(0, 120) ?? null;
    base.tagline = (ogDesc || metaDesc || null)?.slice(0, 200) ?? null;
    base.essay = ((ogDesc || metaDesc) && ogDesc !== metaDesc ? `${ogDesc ?? ''}\n\n${metaDesc ?? ''}`.trim() : (metaDesc || ogDesc) ?? null)?.slice(0, 1200) ?? null;
    base.ogImage = ogImage;
    try {
      const u = new URL(url);
      base.favicon = `${u.protocol}//${u.hostname}/favicon.ico`;
    } catch { /* ignore */ }
  } catch (err) {
    base.error = (err as Error).message?.slice(0, 200) ?? 'fetch failed';
  }
  return base;
}
