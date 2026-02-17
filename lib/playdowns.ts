import type { PlaydownConfig, PlaydownGame, PlaydownStandingsRow, QualificationRow, QualificationStatus } from "./types"

/**
 * Compute playdown standings from config and games.
 * Points: 2 for W, 1 for T, 0 for L (fixed).
 * Tiebreakers in order:
 *   1. Number of wins
 *   2. Head-to-head record among tied teams
 *   3. Goal differential (GF - GA)
 *   4. Fewest goals allowed
 */
export function computePlaydownStandings(
  config: PlaydownConfig,
  games: PlaydownGame[]
): PlaydownStandingsRow[] {
  const stats = new Map<string, {
    teamId: string
    teamName: string
    gp: number
    w: number
    l: number
    t: number
    gf: number
    ga: number
  }>()

  // Initialize all teams
  for (const team of config.teams) {
    stats.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0,
    })
  }

  // Tally played games
  const playedGames = games.filter((g) => g.played && g.homeScore !== null && g.awayScore !== null)

  for (const game of playedGames) {
    const home = stats.get(game.homeTeam)
    const away = stats.get(game.awayTeam)
    if (!home || !away) continue

    const hs = game.homeScore!
    const as_ = game.awayScore!

    home.gp++
    away.gp++
    home.gf += hs
    home.ga += as_
    away.gf += as_
    away.ga += hs

    if (hs > as_) {
      home.w++
      away.l++
    } else if (hs < as_) {
      home.l++
      away.w++
    } else {
      home.t++
      away.t++
    }
  }

  const rows: PlaydownStandingsRow[] = Array.from(stats.values()).map((s) => ({
    ...s,
    pts: s.w * 2 + s.t,
    diff: s.gf - s.ga,
    qualifies: false,
  }))

  // Head-to-head points for a subset of team IDs
  function headToHeadPoints(teamIds: Set<string>): Map<string, number> {
    const h2h = new Map<string, number>()
    for (const id of teamIds) h2h.set(id, 0)

    for (const game of playedGames) {
      if (!teamIds.has(game.homeTeam) || !teamIds.has(game.awayTeam)) continue
      const hs = game.homeScore!
      const as_ = game.awayScore!
      if (hs > as_) {
        h2h.set(game.homeTeam, (h2h.get(game.homeTeam) ?? 0) + 2)
      } else if (hs < as_) {
        h2h.set(game.awayTeam, (h2h.get(game.awayTeam) ?? 0) + 2)
      } else {
        h2h.set(game.homeTeam, (h2h.get(game.homeTeam) ?? 0) + 1)
        h2h.set(game.awayTeam, (h2h.get(game.awayTeam) ?? 0) + 1)
      }
    }
    return h2h
  }

  // Sort with tiebreakers
  rows.sort((a, b) => {
    // Primary: points
    if (a.pts !== b.pts) return b.pts - a.pts
    // Tiebreaker 1: wins
    if (a.w !== b.w) return b.w - a.w
    // Tiebreaker 2: head-to-head (computed for the tied group)
    const tiedGroup = new Set(
      rows.filter((r) => r.pts === a.pts && r.w === a.w).map((r) => r.teamId)
    )
    if (tiedGroup.size > 1) {
      const h2h = headToHeadPoints(tiedGroup)
      const h2hA = h2h.get(a.teamId) ?? 0
      const h2hB = h2h.get(b.teamId) ?? 0
      if (h2hA !== h2hB) return h2hB - h2hA
    }
    // Tiebreaker 3: goal differential
    if (a.diff !== b.diff) return b.diff - a.diff
    // Tiebreaker 4: fewest goals allowed
    if (a.ga !== b.ga) return a.ga - b.ga
    return 0
  })

  // Mark qualifying teams
  for (let i = 0; i < rows.length && i < config.qualifyingSpots; i++) {
    rows[i].qualifies = true
  }

  return rows
}

/**
 * Derive the earliest and latest game dates from a list of playdown games.
 */
function getGameDateRange(games: PlaydownGame[]): { start: Date | null; end: Date | null } {
  if (games.length === 0) return { start: null, end: null }
  const sorted = games.map((g) => new Date(g.date)).sort((a, b) => a.getTime() - b.getTime())
  return { start: sorted[0], end: sorted[sorted.length - 1] }
}

/**
 * Check if a playdown should be visible on the dashboard.
 * Visible when: within 1 month before first game, during, or within 1 week after last game.
 */
export function isPlaydownActive(config: PlaydownConfig, games: PlaydownGame[] = []): boolean {
  if (config.teams.length === 0 && games.length === 0) return false
  const { start, end } = getGameDateRange(games)
  if (!start) return config.teams.length > 0
  const now = new Date()
  const oneMonthBefore = new Date(start)
  oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1)
  const lastDate = end ?? start
  const oneWeekAfter = new Date(lastDate)
  oneWeekAfter.setDate(oneWeekAfter.getDate() + 7)
  return now >= oneMonthBefore && now <= oneWeekAfter
}

/**
 * Check if a playdown is expired (past the 1-week-after-last-game window).
 * Goes to Past Events.
 */
export function isPlaydownExpired(config: PlaydownConfig, games: PlaydownGame[] = []): boolean {
  const { end } = getGameDateRange(games)
  if (!end) return false
  const oneWeekAfter = new Date(end)
  oneWeekAfter.setDate(oneWeekAfter.getDate() + 7)
  return new Date() > oneWeekAfter
}

/**
 * Compute qualification status for each team.
 * LOCKED = mathematically guaranteed to qualify
 * OUT = mathematically eliminated
 * ALIVE = still in contention
 */
export function computeQualificationStatus(
  standings: PlaydownStandingsRow[],
  config: PlaydownConfig
): QualificationRow[] {
  const K = config.qualifyingSpots
  const expectedGames = (config.totalTeams - 1) * config.gamesPerMatchup

  const rows: QualificationRow[] = standings.map((row) => {
    const gamesRemaining = Math.max(0, expectedGames - row.gp)
    const maxPts = row.pts + 2 * gamesRemaining
    return { ...row, maxPts, gamesRemaining, status: "alive" as QualificationStatus }
  })

  for (const row of rows) {
    const teamsWhoseCeilingIsBelow = rows.filter(
      (other) => other.teamId !== row.teamId && other.maxPts < row.pts
    ).length
    if (teamsWhoseCeilingIsBelow >= config.totalTeams - K) {
      row.status = "locked"
      continue
    }

    const teamsGuaranteedAbove = rows.filter(
      (other) => other.teamId !== row.teamId && other.pts > row.maxPts
    ).length
    if (teamsGuaranteedAbove >= K) {
      row.status = "out"
      continue
    }
  }

  return rows
}
