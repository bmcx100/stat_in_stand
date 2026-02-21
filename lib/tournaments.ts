import type {
  TournamentConfig,
  TournamentGame,
  TournamentStandingsRow,
  TournamentPool,
  TiebreakerKey,
  TiebreakerResolution,
  QualificationRow,
  QualificationStatus,
} from "./types"

/**
 * Compute pool standings from config and games.
 * Points: 2 for W, 1 for T, 0 for L.
 * Tiebreakers driven by config.tiebreakerOrder.
 */
export function computePoolStandings(
  config: TournamentConfig,
  games: TournamentGame[],
  poolId: string
): TournamentStandingsRow[] {
  const pool = config.pools.find((p) => p.id === poolId)
  if (!pool) return []

  const poolTeams = config.teams.filter((t) => t.poolId === poolId)

  const stats = new Map<string, {
    teamId: string
    teamName: string
    gp: number
    w: number
    l: number
    t: number
    otl: number
    sol: number
    gf: number
    ga: number
    pim: number
  }>()

  for (const team of poolTeams) {
    stats.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      gp: 0, w: 0, l: 0, t: 0, otl: 0, sol: 0, gf: 0, ga: 0, pim: 0,
    })
  }

  const playedGames = games.filter(
    (g) => g.played && g.homeScore !== null && g.awayScore !== null
      && g.round === "pool" && g.poolId === poolId
  )

  for (const game of playedGames) {
    const home = stats.get(game.homeTeam)
    const away = stats.get(game.awayTeam)
    // Skip only when neither side is a tracked team (e.g. both synthetic)
    if (!home && !away) continue

    const hs = game.homeScore!
    const as_ = game.awayScore!

    if (home) { home.gp++; home.gf += hs; home.ga += as_ }
    if (away) { away.gp++; away.gf += as_; away.ga += hs }

    if (hs > as_) {
      if (home) home.w++
      if (away) away.l++
    } else if (hs < as_) {
      if (home) home.l++
      if (away) away.w++
    } else {
      if (home) home.t++
      if (away) away.t++
    }
  }

  const rows: TournamentStandingsRow[] = Array.from(stats.values()).map((s) => ({
    ...s,
    poolId,
    pts: s.w * 2 + s.t + s.otl + s.sol,
    diff: s.gf - s.ga,
    winPct: s.gp > 0 ? Math.round((s.w / s.gp) * 1000) / 1000 : 0,
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

  // Build comparator from config.tiebreakerOrder
  function compareTiebreaker(a: TournamentStandingsRow, b: TournamentStandingsRow, key: TiebreakerKey): number {
    switch (key) {
      case "wins":
        return b.w - a.w
      case "head-to-head": {
        const tiedGroup = new Set(
          rows.filter((r) => r.pts === a.pts).map((r) => r.teamId)
        )
        if (tiedGroup.size > 1) {
          const h2h = headToHeadPoints(tiedGroup)
          return (h2h.get(b.teamId) ?? 0) - (h2h.get(a.teamId) ?? 0)
        }
        return 0
      }
      case "goal-differential":
        return b.diff - a.diff
      case "goals-allowed":
        return a.ga - b.ga
      case "goals-for":
        return b.gf - a.gf
      default:
        return 0
    }
  }

  // Sort with configurable tiebreakers
  rows.sort((a, b) => {
    if (a.pts !== b.pts) return b.pts - a.pts
    for (const key of config.tiebreakerOrder) {
      const result = compareTiebreaker(a, b, key)
      if (result !== 0) return result
    }
    return 0
  })

  // Detect unresolved ties
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]
    const b = rows[i + 1]
    if (a.pts !== b.pts) continue
    if (a.gp === 0 && b.gp === 0) continue
    let resolved = false
    for (const key of config.tiebreakerOrder) {
      if (compareTiebreaker(a, b, key) !== 0) {
        resolved = true
        break
      }
    }
    if (!resolved) {
      a.tiedUnresolved = true
      b.tiedUnresolved = true
    }
  }

  // Mark qualifying teams
  for (let i = 0; i < rows.length && i < pool.qualifyingSpots; i++) {
    rows[i].qualifies = true
  }

  return rows
}

/**
 * Compute standings for all pools at once.
 */
export function computeAllPoolStandings(
  config: TournamentConfig,
  games: TournamentGame[]
): Map<string, TournamentStandingsRow[]> {
  const result = new Map<string, TournamentStandingsRow[]>()
  for (const pool of config.pools) {
    result.set(pool.id, computePoolStandings(config, games, pool.id))
  }
  return result
}

/**
 * Detect tiebreaker resolutions for a pool, driven by configurable tiebreaker order.
 */
export function detectTournamentTiebreakerResolutions(
  standings: TournamentStandingsRow[],
  games: TournamentGame[],
  tiebreakerOrder: TiebreakerKey[]
): TiebreakerResolution[] {
  const playedGames = games.filter(
    (g) => g.played && g.homeScore !== null && g.awayScore !== null && g.round === "pool"
  )
  const resolutions: TiebreakerResolution[] = []

  const keyLabels: Record<TiebreakerKey, string> = {
    "wins": "Wins",
    "head-to-head": "Head-to-Head",
    "goal-differential": "Goal Differential",
    "goals-allowed": "Fewest Goals Allowed",
    "goals-for": "Most Goals For",
  }

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

  function getTiedValue(a: TournamentStandingsRow, b: TournamentStandingsRow, key: TiebreakerKey): string {
    switch (key) {
      case "wins": return String(a.w)
      case "head-to-head": return h2hRecord(a.teamId, b.teamId)
      case "goal-differential": return `${a.diff > 0 ? "+" : ""}${a.diff}`
      case "goals-allowed": return String(a.ga)
      case "goals-for": return String(a.gf)
      default: return ""
    }
  }

  function isResolved(a: TournamentStandingsRow, b: TournamentStandingsRow, key: TiebreakerKey): { resolved: boolean, detail: string } {
    switch (key) {
      case "wins":
        if (a.w !== b.w) return { resolved: true, detail: `${a.teamName} has ${a.w} wins vs ${b.teamName} with ${b.w} wins` }
        return { resolved: false, detail: "" }
      case "head-to-head": {
        const [hA, hB] = h2hPoints(a.teamId, b.teamId)
        if (hA !== hB) return { resolved: true, detail: `${a.teamName} has ${hA} h2h pts vs ${b.teamName} with ${hB} h2h pts` }
        return { resolved: false, detail: "" }
      }
      case "goal-differential":
        if (a.diff !== b.diff) return { resolved: true, detail: `${a.teamName} has ${a.diff > 0 ? "+" : ""}${a.diff} vs ${b.teamName} with ${b.diff > 0 ? "+" : ""}${b.diff}` }
        return { resolved: false, detail: "" }
      case "goals-allowed":
        if (a.ga !== b.ga) return { resolved: true, detail: `${a.teamName} has ${a.ga} GA vs ${b.teamName} with ${b.ga} GA` }
        return { resolved: false, detail: "" }
      case "goals-for":
        if (a.gf !== b.gf) return { resolved: true, detail: `${a.teamName} has ${a.gf} GF vs ${b.teamName} with ${b.gf} GF` }
        return { resolved: false, detail: "" }
      default:
        return { resolved: false, detail: "" }
    }
  }

  for (let i = 0; i < standings.length - 1; i++) {
    const a = standings[i]
    const b = standings[i + 1]
    if (a.pts !== b.pts) continue
    if (a.gp === 0 && b.gp === 0) continue

    const tiedValues: Record<string, string> = {}

    for (const key of tiebreakerOrder) {
      const { resolved, detail } = isResolved(a, b, key)
      if (resolved) {
        resolutions.push({
          teams: [a.teamId, b.teamId],
          teamNames: [a.teamName, b.teamName],
          resolvedBy: keyLabels[key],
          detail,
          tiedValues,
        })
        break
      }
      tiedValues[keyLabels[key]] = getTiedValue(a, b, key)
    }
  }

  return resolutions
}

/**
 * Visibility: 1 month before startDate to 1 week after endDate.
 */
export function isTournamentActive(config: TournamentConfig): boolean {
  if (!config.startDate || !config.endDate) return config.teams.length > 0
  const now = new Date()
  const start = new Date(config.startDate)
  const end = new Date(config.endDate)
  const oneMonthBefore = new Date(start)
  oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1)
  const oneWeekAfter = new Date(end)
  oneWeekAfter.setDate(oneWeekAfter.getDate() + 7)
  return now >= oneMonthBefore && now <= oneWeekAfter
}

/**
 * Expired: past 1 week after endDate.
 */
export function isTournamentExpired(config: TournamentConfig): boolean {
  if (!config.endDate) return false
  const end = new Date(config.endDate)
  const oneWeekAfter = new Date(end)
  oneWeekAfter.setDate(oneWeekAfter.getDate() + 7)
  return new Date() > oneWeekAfter
}

/**
 * Compute qualification status per pool.
 * Same cascading LOCKED/ALIVE/OUT algorithm as playdowns.
 */
export function computeTournamentQualificationStatus(
  standings: TournamentStandingsRow[],
  config: TournamentConfig,
  pool: TournamentPool
): QualificationRow[] {
  const K = pool.qualifyingSpots
  const totalTeams = pool.teamIds.length
  const expectedGames = (totalTeams - 1) * config.gamesPerMatchup

  const rows: QualificationRow[] = standings.map((row) => {
    const gamesRemaining = Math.max(0, expectedGames - row.gp)
    const maxPts = row.pts + 2 * gamesRemaining
    return { ...row, maxPts, gamesRemaining, status: "alive" as QualificationStatus }
  })

  const allDone = rows.every((r) => r.gamesRemaining === 0)

  let changed = true
  while (changed) {
    changed = false
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      if (row.status !== "alive") continue

      if (allDone && !row.tiedUnresolved) {
        row.status = idx < K ? "locked" : "out"
        changed = true
        continue
      }

      if (row.tiedUnresolved) continue

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
      if (teamsGuaranteedBelow >= totalTeams - K) {
        row.status = "locked"
        changed = true
        continue
      }

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
