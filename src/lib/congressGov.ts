/**
 * Build Congress.gov bill page URL from canonical_bill_id (e.g. hr2766-119, s58-119).
 * Users can open this to read the full bill text, summary, and status.
 */
const TYPE_TO_SLUG: Record<string, string> = {
  hr: 'house-bill',
  s: 'senate-bill',
  hres: 'house-resolution',
  sres: 'senate-resolution',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
}

/** Normalize to canonical form: lowercase type + number + hyphen + congress (e.g. hr2766-119) */
function toCanonical(id: string): string {
  return String(id)
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .toLowerCase()
}

export function congressGovBillUrl(canonicalBillId: string | null): string | null {
  if (!canonicalBillId) return null
  const normalized = toCanonical(canonicalBillId)
  const match = normalized.match(/^([a-z]+)(\d+)(?:-(\d+))?$/)
  if (!match) return null
  const [, type, num, congress] = match
  const typeLower = (type || '').toLowerCase()
  const slug = TYPE_TO_SLUG[typeLower]
  if (!slug) return null
  const congressNum = (congress || '').replace(/^0+/, '') || '119'
  return `https://www.congress.gov/bill/${congressNum}th-congress/${slug}/${(num || '').replace(/^0+/, '') || '0'}`
}

/** Congress.gov legislation search URL when we have a bill label but no direct bill URL */
export function congressGovSearchUrl(query: string): string {
  const q = encodeURIComponent(String(query).trim() || 'legislation')
  return `https://www.congress.gov/search?q=${q}`
}
