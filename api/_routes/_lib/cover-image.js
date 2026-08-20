const dns = require('node:dns').promises;
const net = require('node:net');
const { safeUrl } = require('./utils');

const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;
const MAX_HTML_BYTES = 1_500_000;

function privateIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && [0, 2].includes(c)) ||
    (a === 198 && [18, 19].includes(b)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function privateAddress(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  const version = net.isIP(value);
  if (version === 4) return privateIpv4(value);
  if (version !== 6) return true;
  if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff')) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith('2001:db8:')) return true;
  if (value.startsWith('::ffff:')) return privateIpv4(value.slice(7));
  return false;
}

async function assertPublicUrl(rawUrl) {
  const normalized = safeUrl(rawUrl);
  if (!normalized) {
    const error = new Error('Link nguồn không hợp lệ.');
    error.status = 400;
    throw error;
  }

  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) {
    const error = new Error('Không thể đọc địa chỉ nội bộ.');
    error.status = 400;
    throw error;
  }

  if (net.isIP(host)) {
    if (privateAddress(host)) {
      const error = new Error('Không thể đọc địa chỉ nội bộ.');
      error.status = 400;
      throw error;
    }
    return parsed.toString();
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    const error = new Error('Không phân giải được địa chỉ website nguồn.');
    error.status = 422;
    throw error;
  }
  if (!addresses.length || addresses.some((item) => privateAddress(item.address))) {
    const error = new Error('Không thể đọc địa chỉ nội bộ.');
    error.status = 400;
    throw error;
  }

  return parsed.toString();
}

async function responseText(response) {
  if (!response.body?.getReader) return (await response.text()).slice(0, MAX_HTML_BYTES);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let output = '';

  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  if (received >= MAX_HTML_BYTES) await reader.cancel().catch(() => {});
  return output.slice(0, MAX_HTML_BYTES);
}

async function fetchPublicHtml(rawUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  let current = rawUrl;

  try {
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      current = await assertPublicUrl(current);
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2',
          'Accept-Language': 'vi,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; HoiAmCoverBot/1.0; +https://hoiam.vercel.app)',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) break;
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) {
        const error = new Error(`Website nguồn trả về HTTP ${response.status}.`);
        error.status = 422;
        throw error;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        const error = new Error('Link nguồn không phải một trang HTML.');
        error.status = 422;
        throw error;
      }
      return { html: await responseText(response), pageUrl: response.url || current };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Website nguồn phản hồi quá chậm.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const error = new Error('Website nguồn chuyển hướng quá nhiều lần.');
  error.status = 422;
  throw error;
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function tagAttributes(tag) {
  const result = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4]);
  return result;
}

function absoluteImageUrl(value, pageUrl) {
  const cleaned = decodeEntities(value).trim();
  if (!cleaned || cleaned.startsWith('data:')) return '';
  try {
    const parsed = new URL(cleaned, pageUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || (net.isIP(host) && privateAddress(host))) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function jsonLdImages(value, output = []) {
  if (!value || output.length >= 10) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => jsonLdImages(item, output));
    return output;
  }
  if (typeof value !== 'object') return output;
  if (typeof value.image === 'string') output.push(value.image);
  else if (Array.isArray(value.image)) value.image.forEach((item) => typeof item === 'string' && output.push(item));
  else if (value.image && typeof value.image.url === 'string') output.push(value.image.url);
  Object.values(value).forEach((item) => jsonLdImages(item, output));
  return output;
}

function coverCandidates(html) {
  const priority = [];
  const favored = [];
  const secondary = [];

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    const value = attrs.content || '';
    if (['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src'].includes(key)) priority.push(value);
    else if (key === 'image') secondary.push(value);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    if (String(attrs.rel || '').toLowerCase().split(/\s+/).includes('image_src')) favored.push(attrs.href || '');
  }

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { favored.push(...jsonLdImages(JSON.parse(match[1]))); } catch { /* JSON-LD lỗi không chặn ảnh khác */ }
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const srcset = attrs['data-srcset'] || attrs.srcset || '';
    const srcsetValue = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).pop() || '';
    const value = attrs['data-original'] || attrs['data-orig-file'] || attrs['data-lazy-src'] || attrs['data-src'] || srcsetValue || attrs.src || '';
    const hint = `${value} ${attrs.alt || ''} ${attrs.class || ''}`.toLowerCase();
    if (!value || /logo|avatar|icon|sprite|tracking|pixel|emoji/.test(hint)) continue;
    const width = Number(attrs.width || 0); const height = Number(attrs.height || 0);
    if ((width && width < 80) || (height && height < 80)) continue;
    if (/cover|book|poster|novel|thumbnail|wp-post-image|entry-content|post-content/.test(hint)) favored.push(value);
    else secondary.push(value);
  }

  const scriptImagePattern = /["'](?:cover|coverUrl|cover_url|bookCover|book_cover|bookImg|book_img|imageUrl|image_url|picUrl|pic_url|thumbnailUrl|thumbnail_url|thumbUrl|thumb_url|thumbUri|thumb_uri)["']\s*:\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(scriptImagePattern)) {
    favored.push(match[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/'));
  }

  const coverStylePattern = /(?:cover|poster|book)[^{}]{0,160}url\(\s*["']?([^"')]+\.(?:avif|webp|png|jpe?g)(?:\?[^"')]*)?)/gi;
  for (const match of html.matchAll(coverStylePattern)) favored.push(match[1]);

  return [...priority, ...favored, ...secondary];
}

async function discoverCoverImage(rawUrl) {
  const key = safeUrl(rawUrl);
  if (!key) return '';
  const cached = cache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_MS) return cached.value;

  const { html, pageUrl } = await fetchPublicHtml(key);
  const value = coverCandidates(html)
    .map((candidate) => absoluteImageUrl(candidate, pageUrl))
    .find(Boolean) || '';
  cache.set(key, { value, savedAt: Date.now() });
  return value;
}

module.exports = {
  privateAddress,
  assertPublicUrl,
  coverCandidates,
  absoluteImageUrl,
  discoverCoverImage,
};
