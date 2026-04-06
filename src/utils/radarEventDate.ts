/**
 * Parses event date strings: ISO ("2026-04-10") or
 * locale-style ("Friday, April 10" from toLocaleDateString) with inferred year.
 */
export function parseRadarEventDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  const stripped = dateStr.replace(/^[A-Za-z]+,\s*/, '').trim();
  const year = new Date().getFullYear();
  const attempt = new Date(`${stripped}, ${year}`);
  if (!isNaN(attempt.getTime())) {
    if (attempt.getTime() < Date.now() - 60 * 24 * 60 * 60 * 1000) {
      const next = new Date(`${stripped}, ${year + 1}`);
      if (!isNaN(next.getTime())) return next;
    }
    return attempt;
  }

  return null;
}
