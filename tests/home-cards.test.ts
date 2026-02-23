/**
 * Tests for lib/home-cards.ts utility functions.
 * No test framework is configured — these are written in Jest/Vitest style
 * and can be run once a framework is added.
 */

import {
  detectActiveEvents,
  lookupRanking,
  getH2H,
  type GameRow,
} from "../lib/home-cards"

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

function makeGame(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: "g1",
    team_id: "team-a",
    date: daysFromNow(0),
    time: "7:00 PM",
    opponent_name: "Kanata Blazers",
    result: "W",
    team_score: 4,
    opponent_score: 2,
    game_type: "regular",
    played: true,
    ...overrides,
  }
}

// ── detectActiveEvents ────────────────────────────────────────────────────────

describe("detectActiveEvents", () => {
  it("returns active game types within ±7 days", () => {
    const games: GameRow[] = [
      makeGame({ date: daysFromNow(0), game_type: "regular" }),
      makeGame({ date: daysFromNow(5), game_type: "tournament" }),
    ]
    const result = detectActiveEvents(games, "team-a")
    expect(result.has("regular")).toBe(true)
    expect(result.has("tournament")).toBe(true)
  })

  it("excludes games exactly 8 days out (outside window)", () => {
    const games: GameRow[] = [
      makeGame({ date: daysFromNow(8), game_type: "regular" }),
    ]
    const result = detectActiveEvents(games, "team-a")
    expect(result.has("regular")).toBe(false)
  })

  it("includes games exactly 7 days out (boundary)", () => {
    const games: GameRow[] = [
      makeGame({ date: daysFromNow(7), game_type: "playoffs" }),
    ]
    const result = detectActiveEvents(games, "team-a")
    expect(result.has("playoffs")).toBe(true)
  })

  it("excludes games for other team IDs", () => {
    const games: GameRow[] = [
      makeGame({ date: daysFromNow(0), game_type: "regular", team_id: "team-b" }),
    ]
    const result = detectActiveEvents(games, "team-a")
    expect(result.size).toBe(0)
  })

  it("excludes exhibition and provincials game types", () => {
    const games: GameRow[] = [
      makeGame({ date: daysFromNow(0), game_type: "exhibition" }),
      makeGame({ date: daysFromNow(0), game_type: "provincials" }),
    ]
    const result = detectActiveEvents(games, "team-a")
    expect(result.size).toBe(0)
  })

  it("returns empty set when no games provided", () => {
    const result = detectActiveEvents([], "team-a")
    expect(result.size).toBe(0)
  })
})

// ── lookupRanking ─────────────────────────────────────────────────────────────

describe("lookupRanking", () => {
  const rows = [
    { team_nbr: 101, ranking: 3 },
    { team_nbr: 202, ranking: 7 },
    { team_nbr: 303, ranking: 1 },
  ]

  it("returns correct ranking for a known team_nbr", () => {
    expect(lookupRanking(202, rows)).toBe(7)
  })

  it("returns 1 for the top-ranked team", () => {
    expect(lookupRanking(303, rows)).toBe(1)
  })

  it("returns null when team_nbr is not in rows", () => {
    expect(lookupRanking(999, rows)).toBe(null)
  })

  it("returns null when team_nbr is null", () => {
    expect(lookupRanking(null, rows)).toBe(null)
  })

  it("returns null when team_nbr is undefined", () => {
    expect(lookupRanking(undefined, rows)).toBe(null)
  })

  it("returns null when rows array is empty", () => {
    expect(lookupRanking(101, [])).toBe(null)
  })
})

// ── getH2H ────────────────────────────────────────────────────────────────────

describe("getH2H", () => {
  const games: GameRow[] = [
    makeGame({ result: "W", opponent_name: "Kanata Blazers", played: true }),
    makeGame({ result: "L", opponent_name: "Kanata Blazers", played: true }),
    makeGame({ result: "W", opponent_name: "Kanata Blazers", played: true }),
    makeGame({ result: "W", opponent_name: "Orleans Senators", played: true }),
    makeGame({ result: null, opponent_name: "Kanata Blazers", played: false }),
  ]

  it("counts W-L-T correctly against a named opponent", () => {
    const h2h = getH2H(games, "team-a", "regular", "Kanata Blazers")
    expect(h2h.w).toBe(2)
    expect(h2h.l).toBe(1)
    expect(h2h.t).toBe(0)
  })

  it("does not count unplayed games", () => {
    const h2h = getH2H(games, "team-a", "regular", "Kanata Blazers")
    expect(h2h.w + h2h.l + h2h.t).toBe(3)
  })

  it("does not count games against other opponents", () => {
    const h2h = getH2H(games, "team-a", "regular", "Kanata Blazers")
    expect(h2h.w).toBe(2) // not 3 (which would include Orleans win)
  })

  it("returns 0-0-0 when no matching games", () => {
    const h2h = getH2H(games, "team-a", "regular", "Nepean Raiders")
    expect(h2h.w).toBe(0)
    expect(h2h.l).toBe(0)
    expect(h2h.t).toBe(0)
  })

  it("fuzzy-matches opponent names (case insensitive)", () => {
    const h2h = getH2H(games, "team-a", "regular", "kanata blazers")
    expect(h2h.w).toBe(2)
  })

  it("returns 0-0-0 for wrong team_id", () => {
    const h2h = getH2H(games, "team-z", "regular", "Kanata Blazers")
    expect(h2h.w + h2h.l + h2h.t).toBe(0)
  })
})
