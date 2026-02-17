import type { PlaydownConfig, PlaydownGame, PlaydownStandingsRow, QualificationRow, QualificationStatus, TiebreakerResolution } from "./types"

/**
 * Compute playdown standings from config and games.
 * Points: 2 for W, 1 for T, 0 for L (fixed).
 * Tiebreakers in order:
 *   1. Number of wins
 *   2. Head-to-head record among tied teams
 *   3. Goal differential (GF - GA)
 *   4. Fewest goals allowed
 *   5. Most periods won in round-robin play (not tracked)
 *   6. Fewest penalty minutes in round-robin play (not tracked)
 *   7. First goal scored in the series (not tracked)
 *   8. Flip of a coin (manual)
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
    tiedUnresolved: false,
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

  // Detect unresolved ties (all calculable tiebreakers exhausted)
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]
    const b = rows[i + 1]
    if (a.pts !== b.pts || a.w !== b.w) continue
    if (a.gp === 0 && b.gp === 0) continue
    // Check head-to-head between this pair
    const pairH2h = headToHeadPoints(new Set([a.teamId, b.teamId]))
    const h2hA = pairH2h.get(a.teamId) ?? 0
    const h2hB = pairH2h.get(b.teamId) ?? 0
    if (h2hA !== h2hB) continue
    // Check goal diff and goals allowed
    if (a.diff !== b.diff) continue
    if (a.ga !== b.ga) continue
    // All calculable tiebreakers exhausted
    a.tiedUnresolved = true
    b.tiedUnresolved = true
  }

  // Mark qualifying teams
  for (let i = 0; i < rows.length && i < config.qualifyingSpots; i++) {
    rows[i].qualifies = true
  }

  return rows
}

/**
 * Detect which tiebreaker resolved each pair of teams that were tied on points.
 */
export function detectTiebreakerResolutions(
  standings: PlaydownStandingsRow[],
  games: PlaydownGame[]
): TiebreakerResolution[] {
  const playedGames = games.filter((g) => g.played && g.homeScore !== null && g.awayScore !== null)
  const resolutions: TiebreakerResolution[] = []

  function h2hPoints(aId: string, bId: string): [number, number] {
    let aPoints = 0
    let bPoints = 0
    for (const game of playedGames) {
      const isMatch = (game.homeTeam === aId && game.awayTeam === bId) ||
        (game.homeTeam === bId && game.awayTeam === aId)
      if (!isMatch) continue
      const hs = game.homeScore!
      const as_ = game.awayScore!
      if (hs > as_) {
        if (game.homeTeam === aId) aPoints += 2
        else bPoints += 2
      } else if (hs < as_) {
        if (game.awayTeam === aId) aPoints += 2
        else bPoints += 2
      } else {
        aPoints += 1
        bPoints += 1
      }
    }
    return [aPoints, bPoints]
  }

  function h2hRecord(aId: string, bId: string): string {
    let w = 0, l = 0, t = 0
    for (const game of playedGames) {
      const isMatch = (game.homeTeam === aId && game.awayTeam === bId) ||
        (game.homeTeam === bId && game.awayTeam === aId)
      if (!isMatch) continue
      const aScore = game.homeTeam === aId ? game.homeScore! : game.awayScore!
      const bScore = game.homeTeam === aId ? game.awayScore! : game.homeScore!
      if (aScore > bScore) w++
      else if (aScore < bScore) l++
      else t++
    }
    return `${w}-${l}-${t}`
  }

  for (let i = 0; i < standings.length - 1; i++) {
    const a = standings[i]
    const b = standings[i + 1]
    if (a.pts !== b.pts) continue
    if (a.gp === 0 && b.gp === 0) continue

    // Both have same points — find which tiebreaker resolved it
    const tiedValues: Record<string, string> = {}

    if (a.w !== b.w) {
      resolutions.push({
        teams: [a.teamId, b.teamId],
        teamNames: [a.teamName, b.teamName],
        resolvedBy: "Wins",
        detail: `${a.teamName} has ${a.w} wins vs ${b.teamName} with ${b.w} wins`,
        tiedValues,
      })
      continue
    }
    tiedValues["Wins"] = String(a.w)

    const [h2hA, h2hB] = h2hPoints(a.teamId, b.teamId)
    if (h2hA !== h2hB) {
      resolutions.push({
        teams: [a.teamId, b.teamId],
        teamNames: [a.teamName, b.teamName],
        resolvedBy: "Head-to-Head",
        detail: `${a.teamName} has ${h2hA} h2h pts vs ${b.teamName} with ${h2hB} h2h pts`,
        tiedValues,
      })
      continue
    }
    tiedValues["Head-to-Head"] = h2hRecord(a.teamId, b.teamId)

    if (a.diff !== b.diff) {
      resolutions.push({
        teams: [a.teamId, b.teamId],
        teamNames: [a.teamName, b.teamName],
        resolvedBy: "Goal Differential",
        detail: `${a.teamName} has ${a.diff > 0 ? "+" : ""}${a.diff} vs ${b.teamName} with ${b.diff > 0 ? "+" : ""}${b.diff}`,
        tiedValues,
      })
      continue
    }
    tiedValues["Goal Differential"] = `${a.diff > 0 ? "+" : ""}${a.diff}`

    if (a.ga !== b.ga) {
      resolutions.push({
        teams: [a.teamId, b.teamId],
        teamNames: [a.teamName, b.teamName],
        resolvedBy: "Fewest Goals Allowed",
        detail: `${a.teamName} has ${a.ga} GA vs ${b.teamName} with ${b.ga} GA`,
        tiedValues,
      })
      continue
    }
  }

  return resolutions
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

  const allDone = rows.every((r) => r.gamesRemaining === 0)

  // Run in multiple passes — when a team is marked OUT or LOCKED, it can
  // cascade: an OUT team no longer competes for a spot, which may LOCK others.
  // A LOCKED team occupies a spot, which may push others OUT.
  let changed = true
  while (changed) {
    changed = false
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      if (row.status !== "alive") continue

      // When all games are done and tiebreakers resolved, use sorted order
      if (allDone && !row.tiedUnresolved) {
        row.status = idx < K ? "locked" : "out"
        changed = true
        continue
      }

      // If this team has an unresolved tie, it can't be confidently LOCKED or OUT
      if (row.tiedUnresolved) continue

      // Teams already OUT don't compete for spots
      const activeTeams = rows.filter((r) => r.status !== "out").length

      // Count teams guaranteed to finish below this team:
      // - teams already OUT
      // - teams whose max possible pts is strictly less than this team's current pts
      // - teams who are done, tied on pts, but sorted below by tiebreakers
      const teamsGuaranteedBelow = rows.filter((other) => {
        if (other.teamId === row.teamId) return false
        if (other.status === "out") return true
        if (other.maxPts < row.pts) return true
        if (row.gamesRemaining === 0 && other.gamesRemaining === 0
          && other.pts === row.pts && !other.tiedUnresolved) {
          const otherIdx = rows.findIndex((r) => r.teamId === other.teamId)
          return otherIdx > idx
        }
        return false
      }).length
      if (teamsGuaranteedBelow >= config.totalTeams - K) {
        row.status = "locked"
        changed = true
        continue
      }

      // Count teams guaranteed to finish above this team:
      // - teams already LOCKED
      // - teams whose current pts is strictly greater than this team's max
      // - When this team is DONE: any team with pts >= this team's pts is guaranteed
      //   to stay at or above, because points can never decrease
      const teamsGuaranteedAbove = rows.filter((other) => {
        if (other.teamId === row.teamId) return false
        if (other.status === "locked") return true
        if (other.pts > row.maxPts) return true
        if (row.gamesRemaining === 0 && other.pts >= row.pts && !other.tiedUnresolved) {
          const otherIdx = rows.findIndex((r) => r.teamId === other.teamId)
          return otherIdx < idx
        }
        return false
      }).length
      if (teamsGuaranteedAbove >= K) {
        row.status = "out"
        changed = true
        continue
      }
    }
  }

  return rows
}
