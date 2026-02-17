/**
 * Infer the full year for a month/day string based on hockey season logic.
 * Hockey season runs Aug–Jul. Given a month abbreviation or number,
 * determines the correct year relative to the current date.
 *
 * If current date is Jan–Jul (second half of season):
 *   - Aug–Dec → previous year
 *   - Jan–Jul → current year
 *
 * If current date is Aug–Dec (first half of season):
 *   - Aug–Dec → current year
 *   - Jan–Jul → next year
 */

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

export function parseMonth(monthStr: string): number {
  const lower = monthStr.toLowerCase().slice(0, 3)
  return MONTH_MAP[lower] ?? parseInt(monthStr, 10)
}

export function inferYear(month: number, referenceDate?: Date): number {
  const now = referenceDate ?? new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const isGameInFirstHalf = month >= 8 // Aug-Dec
  const isCurrentInFirstHalf = currentMonth >= 8

  if (isCurrentInFirstHalf) {
    // We're in Aug-Dec
    return isGameInFirstHalf ? currentYear : currentYear + 1
  } else {
    // We're in Jan-Jul
    return isGameInFirstHalf ? currentYear - 1 : currentYear
  }
}
