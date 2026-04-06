/**
 * Labels for Nominatim search suggestions. Includes landmark / POI names
 * (from `name` or address.*) plus street-level context — not address-only.
 */

/** Characters often used as apostrophes / single quotes → ASCII `'` */
const APOSTROPHE_LIKE = /[\u2018\u2019\u201A\u201B\u02BC\u2032\u0060\u00B4]/g;

/**
 * Normalizes free-text before sending to Nominatim so users need not match
 * accents, smart punctuation, or comma placement in the data.
 */
export function normalizeNominatimSearchQuery(q: string): string {
  let s = q.trim();
  if (!s) return s;

  s = s
    .replace(/ß/g, 'ss')
    .replace(/ẞ/g, 'SS')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/ø/g, 'o')
    .replace(/Ø/g, 'O')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L');

  s = s.normalize('NFD').replace(/\p{M}/gu, '');

  s = s.replace(APOSTROPHE_LIKE, "'");

  s = s.replace(/[,;]/g, ' ');

  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * French often writes l' + vowel (l'Orangerie). If the user omits the apostrophe,
 * they may type "lorangerie" as one word; Nominatim then finds nothing. Split into
 * "l orangerie" after common articles. Requires a long tail after l + vowel so we
 * do not turn "London" into "l ondon".
 */
function applyFrenchElisionSpacing(q: string): string | null {
  const re = /\b(de|du|des|à|au|aux)\s+((l)([aeiouy][a-z]{5,}))\b/gi;
  const next = q.replace(re, (_, prep, _full, _l, afterL) => `${prep} l ${afterL}`);
  return next === q ? null : next;
}

/**
 * Ordered query variants. When elision spacing applies, try that first (one request
 * hits Musée de l'Orangerie for "musee de lorangerie"); fall back to the literal string.
 */
export function buildNominatimSearchQueryVariants(normalized: string): string[] {
  const elided = applyFrenchElisionSpacing(normalized);
  if (elided) return [elided, normalized];
  return [normalized];
}

const NOMINATIM_USER_AGENT = 'SlowMeterApp/1.0';

export async function fetchNominatimSearch(opts: {
  q: string;
  limit?: number;
  /** Default true (needed for formatNominatimSuggestionLabel). */
  addressdetails?: boolean;
}): Promise<any[]> {
  const normalized = normalizeNominatimSearchQuery(opts.q);
  if (!normalized) return [];
  const limit = opts.limit ?? 10;
  const addr = opts.addressdetails !== false ? 1 : 0;
  const variants = buildNominatimSearchQueryVariants(normalized);

  for (const query of variants) {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=${addr}&q=${encodeURIComponent(query)}&limit=${limit}`,
      { headers: { 'User-Agent': NOMINATIM_USER_AGENT } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  }
  return [];
}

const POI_ADDRESS_KEYS = [
  'man_made',
  'tourism',
  'historic',
  'amenity',
  'leisure',
  'shop',
  'natural',
  'waterway',
  'railway',
  'aerialway',
  'mountain_pass',
  'peak',
  'attraction',
  'bridge',
  'memorial',
  'artwork',
] as const;

function extractPoiName(r: {
  name?: string;
  address?: Record<string, string | undefined>;
}): string | undefined {
  const fromTop = r.name?.trim();
  if (fromTop) return fromTop;
  const addr = r.address ?? {};
  for (const k of POI_ADDRESS_KEYS) {
    const v = addr[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const building = addr.building;
  if (typeof building === 'string' && building.trim()) return building.trim();
  return undefined;
}

/** Street + locality line for suggestions (excludes duplicate POI wording when prepended). */
function formatAddressTail(r: {
  address?: Record<string, string | undefined>;
  display_name?: string;
}): string {
  const addr = r.address ?? {};
  const parts: string[] = [];
  const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
  if (street) parts.push(street);
  const city =
    addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.hamlet;
  if (city) parts.push(city);
  if (addr.postcode) parts.push(addr.postcode);
  if (addr.country) parts.push(addr.country);
  const line = parts.join(', ');
  return line || (r.display_name ?? '');
}

export function formatNominatimSuggestionLabel(r: {
  name?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
}): string {
  const placeName = extractPoiName(r);
  const tail = formatAddressTail(r);

  if (!placeName) {
    return tail;
  }

  const lower = tail.toLowerCase();
  const pn = placeName.toLowerCase();
  if (tail && (lower.startsWith(pn + ',') || lower.startsWith(pn + ' —') || lower === pn)) {
    return tail;
  }
  if (tail && lower.includes(pn)) {
    return tail;
  }
  if (tail) {
    return `${placeName}, ${tail}`;
  }
  return placeName;
}
