export const DEFAULT_CURRENCY = '₱';

/**
 * Formats a numeric currency value with the Philippine Peso (₱) symbol by default.
 * Example: formatMoney(1250) -> "₱1,250.00"
 */
export function formatMoney(
  amount: number | undefined | null,
  symbol = DEFAULT_CURRENCY,
  decimals = 2
): string {
  const val = Number(amount) || 0;
  const sign = val < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Parses a Firebase Timestamp, Date object, or ISO string into a JS Date object.
 */
export function parseDateValue(timestampOrDate: unknown): Date | null {
  if (!timestampOrDate) return null;
  try {
    const item = timestampOrDate as { toDate?: () => Date; seconds?: number };
    if (typeof item.toDate === 'function') {
      const d = item.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (timestampOrDate instanceof Date) {
      return isNaN(timestampOrDate.getTime()) ? null : timestampOrDate;
    }
    if (typeof timestampOrDate === 'string' || typeof timestampOrDate === 'number') {
      const d = new Date(timestampOrDate);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof item.seconds === 'number') {
      const d = new Date(item.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extracts an effective Date from a record that may have an optional [SaleDate: YYYY-MM-DDTHH:mm] tag in notes,
 * falling back to record.createdAt.
 */
export function extractEffectiveDate(
  createdAt: unknown,
  notes?: string | null
): Date | null {
  if (notes) {
    const match = notes.match(/\[SaleDate:\s*([^\]]+)\]/i);
    if (match && match[1]) {
      const parsed = new Date(match[1].trim());
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return parseDateValue(createdAt);
}

/**
 * Strips internal [SaleDate: ...] metadata tag from display notes
 */
export function cleanDisplayNotes(notes?: string | null): string {
  if (!notes) return '';
  return notes.replace(/\[SaleDate:\s*[^\]]+\]\s*/gi, '').trim();
}

/**
 * Parses and formats Firebase Timestamps, Date objects, or ISO strings into human-readable dates.
 * Example: formatDate(ts) -> "Nov 5, 2026, 3:45 PM"
 */
export function formatDate(
  timestampOrDate: unknown,
  includeTime = true,
  notes?: string | null
): string {
  const dateObj = extractEffectiveDate(timestampOrDate, notes);
  if (!dateObj) return 'N/A';

  try {
    if (includeTime) {
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Formats a relative or short date for mobile cards
 * Example: formatShortDate(ts) -> "Nov 5, 2026"
 */
export function formatShortDate(timestampOrDate: unknown, notes?: string | null): string {
  return formatDate(timestampOrDate, false, notes);
}
