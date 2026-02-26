"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronUp, ChevronDown, Shuffle } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

function getInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3)
}

function getLocation(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 0)
  if (words.length <= 1) return name
  return words.slice(0, -1).join(" ")
}

type GridVal = "W" | "L" | "T" | null

function mirrorResult(val: GridVal): GridVal {
  if (val === "W") return "L"
  if (val === "L") return "W"
  if (val === "T") return "T"
  return null
}

function findTeamIndex(gameTeam: string, names: string[]): number {
  const directIdx = names.findIndex((n) => n === gameTeam)
  if (directIdx !== -1) return directIdx
  const gn = normName(gameTeam)
  return names.findIndex((n) => {
    const tn = normName(n)
    return tn === gn || tn.includes(gn) || gn.includes(tn)
  })
}

const STATUS_COLORS: Record<string, string> = {
  CLINCHED: "#16A34A",
  ELIMINATED: "#9CA3AF",
}

export default function IvesPage() {
  const team = useTeamContext()
  const { playdown, loading } = useSupabasePlaydowns(team.id)
  const { games: allGames, loading: gamesLoading } = useSupabaseGames(team.id)
  const { standingsMap, loading: standingsLoading } = useSupabaseStandings(team.id)

  const [grid, setGrid] = useState<GridVal[][] | null>(null)
  const [locked, setLocked] = useState<boolean[][] | null>(null)

  const dataLoading = loading || gamesLoading || standingsLoading

  const teamNames = useMemo(() => {
    if (!playdown) return null
    const { config } = playdown
    const isOwhaMode = (config.teamNames?.length ?? 0) > 0
    if (isOwhaMode) {
      const owhaRows = standingsMap["playdowns"]?.rows ?? []
      return owhaRows.map((r) => r.teamName)
    }
    return config.teams.map((t) => t.name)
  }, [playdown, standingsMap])

  const Q = playdown?.config.qualifyingSpots || 0

  // Initialize grid from actual game results
  useEffect(() => {
    if (dataLoading || !playdown || !teamNames || grid !== null) return
    const N = teamNames.length
    const newGrid: GridVal[][] = Array.from({ length: N }, () => Array(N).fill(null))
    const newLocked: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false))

    const played = playdown.games.filter((g) => g.played && g.homeScore !== null && g.awayScore !== null)
    for (const g of played) {
      const homeIdx = findTeamIndex(g.homeTeam, teamNames)
      const awayIdx = findTeamIndex(g.awayTeam, teamNames)
      if (homeIdx === -1 || awayIdx === -1 || homeIdx === awayIdx) continue

      const hs = g.homeScore!
      const as_ = g.awayScore!
      let result: GridVal
      if (hs > as_) result = "W"
      else if (hs < as_) result = "L"
      else result = "T"

      newGrid[homeIdx][awayIdx] = result
      newGrid[awayIdx][homeIdx] = mirrorResult(result)
      newLocked[homeIdx][awayIdx] = true
      newLocked[awayIdx][homeIdx] = true
    }

    setGrid(newGrid)
    setLocked(newLocked)
  }, [dataLoading, playdown, teamNames, grid])

  // Compute standings from grid
  const standings = useMemo(() => {
    if (!grid || !teamNames) return []
    const N = teamNames.length
    const G = N - 1
    const TOTAL_PTS = N * (N - 1)
    const CLINCH = Q > 0 ? Math.floor(TOTAL_PTS / (N - Q + 1)) + 1 : TOTAL_PTS

    const teams = teamNames.map((name, i) => {
      let w = 0, l = 0, t = 0, gp = 0, pts = 0
      for (let j = 0; j < N; j++) {
        if (i === j) continue
        if (grid[i][j] === "W") { w++; gp++; pts += 2 }
        else if (grid[i][j] === "L") { l++; gp++ }
        else if (grid[i][j] === "T") { t++; gp++; pts += 1 }
      }
      const gl = G - gp
      const maxPts = pts + gl * 2
      const magic = Math.max(0, CLINCH - pts)
      return { name, idx: i, w, l, t, gp, pts, gl, maxPts, magic, rank: 0, status: "" }
    })

    const sorted = [...teams].sort((a, b) => b.pts - a.pts || b.w - a.w)
    sorted.forEach((t, i) => { t.rank = i + 1 })

    sorted.forEach((t) => {
      if (t.pts >= CLINCH) t.status = "CLINCHED"
      else if (t.maxPts < CLINCH) t.status = "ELIMINATED"
    })

    return sorted
  }, [grid, teamNames, Q])

  // Compute total h2h record from ALL games (not just playdowns)
  const h2hRecord = useMemo(() => {
    if (!teamNames) return new Map<number, { w: number, l: number, t: number }>()
    const played = allGames.filter((g) => g.played && g.teamScore !== null && g.opponentScore !== null)
    const records = new Map<number, { w: number, l: number, t: number }>()
    for (const g of played) {
      const oppIdx = teamNames.findIndex((n) => {
        const tn = normName(n)
        const on = normName(g.opponent)
        return tn === on || tn.includes(on) || on.includes(tn)
      })
      if (oppIdx === -1) continue
      if (!records.has(oppIdx)) records.set(oppIdx, { w: 0, l: 0, t: 0 })
      const rec = records.get(oppIdx)!
      const ts = g.teamScore!, os = g.opponentScore!
      if (ts > os) rec.w++
      else if (ts < os) rec.l++
      else rec.t++
    }
    return records
  }, [allGames, teamNames])

  // Grid interaction
  function cycleResult(r: number, c: number) {
    if (!grid || !locked || r === c || locked[r][c]) return
    const next = grid.map((row) => [...row])
    const cur = next[r][c]
    const newVal: GridVal = cur === null ? "W" : cur === "W" ? "L" : cur === "L" ? "T" : null
    next[r][c] = newVal
    next[c][r] = mirrorResult(newVal)
    setGrid(next)
  }

  function resetAll() {
    if (!grid || !locked) return
    const next = grid.map((row, r) => row.map((v, c) => locked[r][c] ? v : null))
    setGrid(next)
  }

  // Scenario functions
  function fillBest(teamIdx: number) {
    if (!grid || !locked || !teamNames) return
    const N = teamNames.length
    const next = grid.map((row) => [...row])
    for (let c = 0; c < N; c++) {
      if (c === teamIdx || locked[teamIdx][c]) continue
      next[teamIdx][c] = "W"
      next[c][teamIdx] = "L"
    }
    setGrid(next)
  }

  function fillWorst(teamIdx: number) {
    if (!grid || !locked || !teamNames) return
    const N = teamNames.length
    const next = grid.map((row) => [...row])
    for (let c = 0; c < N; c++) {
      if (c === teamIdx || locked[teamIdx][c]) continue
      next[teamIdx][c] = "L"
      next[c][teamIdx] = "W"
    }
    setGrid(next)
  }

  function fillChaos() {
    if (!grid || !locked || !teamNames) return
    const N = teamNames.length
    const next = grid.map((row) => [...row])

    // Collect remaining unlocked game pairs
    const pairs: [number, number][] = []
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (next[i][j] === null && !locked[i][j]) pairs.push([i, j])
      }
    }

    // Helper: compute point totals from a grid
    function getPoints(g: GridVal[][]): number[] {
      return teamNames!.map((_, i) => {
        let pts = 0
        for (let j = 0; j < N; j++) {
          if (i === j) continue
          if (g[i][j] === "W") pts += 2
          else if (g[i][j] === "T") pts += 1
        }
        return pts
      })
    }

    // Greedy: for each pair, pick the result that minimizes spread
    for (const [i, j] of pairs) {
      const options: { val: GridVal, mirror: GridVal }[] = [
        { val: "W", mirror: "L" },
        { val: "L", mirror: "W" },
        { val: "T", mirror: "T" },
      ]

      let bestSpread = Infinity
      let bestChoice = options[2] // default to tie

      for (const opt of options) {
        next[i][j] = opt.val
        next[j][i] = opt.mirror
        const pts = getPoints(next)
        const spread = Math.max(...pts) - Math.min(...pts)
        if (spread < bestSpread) {
          bestSpread = spread
          bestChoice = opt
        }
      }

      next[i][j] = bestChoice.val
      next[j][i] = bestChoice.mirror
    }

    setGrid(next)
  }

  // Loading states
  if (dataLoading) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!playdown || !teamNames || teamNames.length === 0) {
    return (
      <div className="dashboard-page">
        <div className="sub-page-header">
          <h1 className="page-title">Ives Matrix</h1>
          <Link href={`/team/${team.slug}/playdowns`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        <p className="dashboard-record-label">No playdowns configured yet.</p>
      </div>
    )
  }

  if (!grid || !locked) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Initializing...</p>
      </div>
    )
  }

  const N = teamNames.length
  const TOTAL_PTS = N * (N - 1)
  const CLINCH = Q > 0 ? Math.floor(TOTAL_PTS / (N - Q + 1)) + 1 : TOTAL_PTS
  const initials = teamNames.map(getInitials)

  const wCount = grid.flat().filter((v) => v === "W").length
  const tCount = grid.flat().filter((v) => v === "T").length
  const totalGamesPlayed = wCount + tCount / 2
  const totalGames = N * (N - 1) / 2
  const remaining = totalGames - totalGamesPlayed

  const ourIdx = teamNames ? findTeamIndex(team.name, teamNames) : -1

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Ives Matrix</h1>
        <Link href={`/team/${team.slug}/playdowns`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      <div className="ives-info">
        {totalGamesPlayed}/{totalGames} played · {remaining} remaining · clinch at {CLINCH} pts
      </div>

      <div className="ives-instructions">
        <strong>Click</strong> to cycle: – → <span className="ives-color-w">W</span> → <span className="ives-color-l">L</span> → <span className="ives-color-t">T</span> → –
        <br />
        Row team&apos;s perspective
        <br />
        <span className="ives-lock-indicator" /> = actual result
      </div>

      {/* Round-Robin Grid */}
      <div className="ives-grid-scroll">
        <div className="ives-grid-inline">
          <div className="ives-grid-row">
            <div className="ives-grid-corner" />
            {initials.map((s, i) => (
              <div key={i} className="ives-col-header">{s}</div>
            ))}
          </div>
          {teamNames.map((_, r) => (
            <div key={r} className="ives-grid-row">
              <div className="ives-row-header">{initials[r]}</div>
              {teamNames.map((_, c) => {
                if (r === c) return <div key={c} className="ives-cell ives-cell-diag" />
                const val = grid[r][c]
                const isLocked = locked[r][c]
                return (
                  <div
                    key={c}
                    className={`ives-cell ${val === "W" ? "ives-cell-win" : val === "L" ? "ives-cell-loss" : val === "T" ? "ives-cell-tie" : "ives-cell-empty"} ${isLocked ? "ives-cell-locked" : ""}`}
                    onClick={() => cycleResult(r, c)}
                  >
                    {val ?? "–"}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Standings */}
      <div className="ives-standings-card">
        <div className="ives-standings-top">
          <span className="ives-standings-title">Standings</span>
          <span className="ives-standings-meta">Top {Q} qualify · Clinch = {CLINCH} pts</span>
        </div>
        <div className="ives-standings-scroll">
          <div className="ives-standings-head">
            <span className="ives-st-rank">#</span>
            <span className="ives-st-team">TEAM</span>
            <span className="ives-st-num">W</span>
            <span className="ives-st-num">L</span>
            <span className="ives-st-num">T</span>
            <span className="ives-st-num">GP</span>
            <span className="ives-st-pts">PTS</span>
            <span className="ives-st-actions">SIM</span>
            <span className="ives-st-h2h">US v THEM</span>
          </div>
          {standings.map((t, i) => {
            const sc = STATUS_COLORS[t.status] || "#888"
            return (
              <div key={t.idx}>
                {i === Q && <div className="ives-qual-line" />}
                <div className="ives-standings-row" style={{ borderLeftColor: sc }}>
                  <span className={`ives-st-rank ${i < Q ? "ives-qualifying" : ""}`}>{i + 1}</span>
                  <span className="ives-st-team">{getLocation(t.name)}</span>
                  <span className="ives-st-num">{t.w}</span>
                  <span className="ives-st-num">{t.l}</span>
                  <span className="ives-st-num">{t.t}</span>
                  <span className="ives-st-num">{t.gp}</span>
                  <span className="ives-st-pts ives-st-pts-main" style={{ color: sc }}>{t.pts}</span>
                  <span className="ives-st-actions">
                    <button className="ives-scenario-btn ives-scenario-best" onClick={() => fillBest(t.idx)} title="Best case"><ChevronUp className="size-3.5" /></button>
                    <button className="ives-scenario-btn ives-scenario-worst" onClick={() => fillWorst(t.idx)} title="Worst case"><ChevronDown className="size-3.5" /></button>
                  </span>
                  <span className="ives-st-h2h">
                    {t.idx === ourIdx || ourIdx === -1 ? "—" : (() => {
                      const rec = h2hRecord.get(t.idx)
                      if (!rec) return "–"
                      return `${rec.w}-${rec.l}-${rec.t}`
                    })()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="ives-actions">
        <button className="ives-action-btn" onClick={resetAll}>Reset</button>
        <button className="ives-action-btn ives-action-chaos" onClick={fillChaos}><Shuffle className="size-3.5" /> Chaos</button>
      </div>
    </div>
  )
}
