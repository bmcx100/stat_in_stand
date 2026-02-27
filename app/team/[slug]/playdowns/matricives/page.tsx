"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronUp, ChevronDown, Shuffle, Lock, Unlock } from "lucide-react"
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

function cloneGrid(g: GridVal[][][]): GridVal[][][] {
  return g.map((row) => row.map((opp) => [...opp]))
}

function cloneBool(g: boolean[][][]): boolean[][][] {
  return g.map((row) => row.map((opp) => [...opp]))
}

const STATUS_COLORS: Record<string, string> = {
  CLINCHED: "#16A34A",
  ELIMINATED: "#9CA3AF",
}

export default function MatricivesPage() {
  const team = useTeamContext()
  const { playdown, loading } = useSupabasePlaydowns(team.id)
  const { games: allGames, loading: gamesLoading } = useSupabaseGames(team.id)
  const { standingsMap, loading: standingsLoading } = useSupabaseStandings(team.id)

  const [grid, setGrid] = useState<GridVal[][][] | null>(null)
  const [locked, setLocked] = useState<boolean[][][] | null>(null)
  const [frozen, setFrozen] = useState<boolean[][][] | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = useState(48)
  const [headerSize, setHeaderSize] = useState(40)

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
  const M = useMemo(() => {
    if (!playdown) return 1
    const { config, games } = playdown
    const isOwhaMode = (config.teamNames?.length ?? 0) > 0
    if (isOwhaMode) {
      const totalTeams = config.teamNames?.length || config.totalTeams || 0
      const gameCountByTeam = new Map<string, number>()
      for (const g of games) {
        gameCountByTeam.set(g.homeTeam, (gameCountByTeam.get(g.homeTeam) ?? 0) + 1)
        gameCountByTeam.set(g.awayTeam, (gameCountByTeam.get(g.awayTeam) ?? 0) + 1)
      }
      const maxScheduledGames = gameCountByTeam.size > 0 ? Math.max(...gameCountByTeam.values()) : 0
      if (maxScheduledGames > 0 && totalTeams > 1) {
        return Math.max(1, Math.round(maxScheduledGames / (totalTeams - 1)))
      }
    }
    return Math.max(1, config.gamesPerMatchup || 1)
  }, [playdown])
  const totalCols = (teamNames?.length ?? 0) * M

  // Measure container and compute cell size to fit without scrolling
  useEffect(() => {
    const el = gridRef.current
    if (!el || totalCols === 0) return
    const MAX_CELL = 48
    const MAX_HEADER = 40
    const MIN_HEADER = 28
    function measure() {
      const w = el!.clientWidth
      // Try with full header first, shrink header if cells would be too small
      let hdr = MAX_HEADER
      let size = Math.min(MAX_CELL, Math.floor((w - hdr) / totalCols))
      if (size < 20) {
        hdr = MIN_HEADER
        size = Math.min(MAX_CELL, Math.floor((w - hdr) / totalCols))
      }
      setCellSize(Math.max(16, size))
      setHeaderSize(hdr)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [totalCols])

  // Initialize grid from actual game results
  useEffect(() => {
    if (dataLoading || !playdown || !teamNames || grid !== null) return
    const N = teamNames.length
    const newGrid: GridVal[][][] = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => Array(M).fill(null))
    )
    const newLocked: boolean[][][] = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => Array(M).fill(false))
    )
    const newFrozen: boolean[][][] = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => Array(M).fill(false))
    )

    const played = playdown.games
      .filter((g) => g.played && g.homeScore !== null && g.awayScore !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
    const slotCount = new Map<string, number>()
    for (const g of played) {
      const homeIdx = findTeamIndex(g.homeTeam, teamNames)
      const awayIdx = findTeamIndex(g.awayTeam, teamNames)
      if (homeIdx === -1 || awayIdx === -1 || homeIdx === awayIdx) continue

      const pairKey = `${Math.min(homeIdx, awayIdx)}-${Math.max(homeIdx, awayIdx)}`
      const slot = slotCount.get(pairKey) ?? 0
      if (slot >= M) continue
      slotCount.set(pairKey, slot + 1)

      const hs = g.homeScore!
      const as_ = g.awayScore!
      let result: GridVal
      if (hs > as_) result = "W"
      else if (hs < as_) result = "L"
      else result = "T"

      newGrid[homeIdx][awayIdx][slot] = result
      newGrid[awayIdx][homeIdx][slot] = mirrorResult(result)
      newLocked[homeIdx][awayIdx][slot] = true
      newLocked[awayIdx][homeIdx][slot] = true
    }

    setGrid(newGrid)
    setLocked(newLocked)
    setFrozen(newFrozen)
  }, [dataLoading, playdown, teamNames, grid, M])

  // Compute standings from grid
  const standings = useMemo(() => {
    if (!grid || !teamNames) return []
    const N = teamNames.length
    const G = (N - 1) * M
    const TOTAL_PTS = N * (N - 1) * M
    const CLINCH = Q > 0 ? Math.floor(TOTAL_PTS / (N - Q + 1)) + 1 : TOTAL_PTS

    const teams = teamNames.map((name, i) => {
      let w = 0, l = 0, t = 0, gp = 0, pts = 0
      for (let j = 0; j < N; j++) {
        if (i === j) continue
        for (let g = 0; g < M; g++) {
          if (grid[i][j][g] === "W") { w++; gp++; pts += 2 }
          else if (grid[i][j][g] === "L") { l++; gp++ }
          else if (grid[i][j][g] === "T") { t++; gp++; pts += 1 }
        }
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
  }, [grid, teamNames, Q, M])

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

  // Grid interaction — locked and frozen cells cannot be cycled
  function cycleResult(r: number, c: number, g: number) {
    if (!grid || !locked || !frozen || r === c || locked[r][c][g] || frozen[r][c][g]) return
    const next = cloneGrid(grid)
    const cur = next[r][c][g]
    const newVal: GridVal = cur === null ? "W" : cur === "W" ? "L" : cur === "L" ? "T" : null
    next[r][c][g] = newVal
    next[c][r][g] = mirrorResult(newVal)
    setGrid(next)
  }

  // Reset clears cells that are neither locked nor frozen
  function resetAll() {
    if (!grid || !locked || !frozen) return
    const next = grid.map((row, r) =>
      row.map((opp, c) =>
        opp.map((v, g) => (locked[r][c][g] || frozen[r][c][g]) ? v : null)
      )
    )
    setGrid(next)
  }

  // Freeze: mark all non-locked cells that have a value as frozen
  function freezeAll() {
    if (!grid || !locked || !frozen) return
    const next = cloneBool(frozen)
    const N = grid.length
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (r === c) continue
        for (let g = 0; g < M; g++) {
          if (!locked[r][c][g] && grid[r][c][g] !== null) {
            next[r][c][g] = true
          }
        }
      }
    }
    setFrozen(next)
  }

  // Unfreeze: clear all frozen flags (locked stays)
  function unfreezeAll() {
    if (!frozen) return
    const N = frozen.length
    setFrozen(Array.from({ length: N }, () =>
      Array.from({ length: N }, () => Array(M).fill(false))
    ))
  }

  // Scenario functions — skip locked AND frozen
  function fillBest(teamIdx: number) {
    if (!grid || !locked || !frozen || !teamNames) return
    const N = teamNames.length
    const next = cloneGrid(grid)
    for (let c = 0; c < N; c++) {
      if (c === teamIdx) continue
      for (let g = 0; g < M; g++) {
        if (locked[teamIdx][c][g] || frozen[teamIdx][c][g]) continue
        next[teamIdx][c][g] = "W"
        next[c][teamIdx][g] = "L"
      }
    }
    setGrid(next)
  }

  function fillWorst(teamIdx: number) {
    if (!grid || !locked || !frozen || !teamNames) return
    const N = teamNames.length
    const next = cloneGrid(grid)
    for (let c = 0; c < N; c++) {
      if (c === teamIdx) continue
      for (let g = 0; g < M; g++) {
        if (locked[teamIdx][c][g] || frozen[teamIdx][c][g]) continue
        next[teamIdx][c][g] = "L"
        next[c][teamIdx][g] = "W"
      }
    }
    setGrid(next)
  }

  function fillChaos() {
    if (!grid || !locked || !frozen || !teamNames) return
    const N = teamNames.length
    const base = cloneGrid(grid)

    function getPoints(g: GridVal[][][]): number[] {
      return teamNames!.map((_, i) => {
        let pts = 0
        for (let j = 0; j < N; j++) {
          if (i === j) continue
          for (let gIdx = 0; gIdx < M; gIdx++) {
            if (g[i][j][gIdx] === "W") pts += 2
            else if (g[i][j][gIdx] === "T") pts += 1
          }
        }
        return pts
      })
    }

    // Score: maximize teams clustered just below clinch line
    // Priority: fewest clinched → largest cluster below clinch → highest cluster pts
    function chaosScore(g: GridVal[][][]): number {
      const pts = getPoints(g)
      const clinched = pts.filter((p) => p >= CLINCH).length

      const freq = new Map<number, number>()
      for (const p of pts) {
        if (p < CLINCH) freq.set(p, (freq.get(p) ?? 0) + 1)
      }

      let maxCluster = 0
      let clusterPts = 0
      for (const [p, count] of freq) {
        if (count > maxCluster || (count === maxCluster && p > clusterPts)) {
          maxCluster = count
          clusterPts = p
        }
      }

      return -clinched * 10000 + maxCluster * 100 + clusterPts
    }

    type GameSlot = [number, number, number]
    const openSlots: GameSlot[] = []
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        for (let gIdx = 0; gIdx < M; gIdx++) {
          if (base[i][j][gIdx] === null && !locked![i][j][gIdx] && !frozen![i][j][gIdx]) {
            openSlots.push([i, j, gIdx])
          }
        }
      }
    }

    function shuffle(arr: GameSlot[]): GameSlot[] {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }

    // Greedy fill: for each slot, pick the result that maximizes chaos score
    function greedyFill(slots: GameSlot[]): GridVal[][][] {
      const trial = cloneGrid(base)
      for (const [i, j, gIdx] of slots) {
        const options: { val: GridVal, mirror: GridVal }[] = [
          { val: "W", mirror: "L" },
          { val: "L", mirror: "W" },
          { val: "T", mirror: "T" },
        ]
        let bestScore = -Infinity
        let bestChoice = options[2]
        for (const opt of options) {
          trial[i][j][gIdx] = opt.val
          trial[j][i][gIdx] = opt.mirror
          const score = chaosScore(trial)
          if (score > bestScore) {
            bestScore = score
            bestChoice = opt
          }
        }
        trial[i][j][gIdx] = bestChoice.val
        trial[j][i][gIdx] = bestChoice.mirror
      }
      return trial
    }

    // Run multiple trials with shuffled orderings, keep the best
    const TRIALS = 50
    let bestGrid = greedyFill(openSlots)
    let bestChaos = chaosScore(bestGrid)

    for (let t = 1; t < TRIALS; t++) {
      const trial = greedyFill(shuffle(openSlots))
      const score = chaosScore(trial)
      if (score > bestChaos) {
        bestGrid = trial
        bestChaos = score
      }
    }

    setGrid(bestGrid)
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
          <h1 className="page-title">Matricives</h1>
          <Link href={`/team/${team.slug}/playdowns`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        <p className="dashboard-record-label">No playdowns configured yet.</p>
      </div>
    )
  }

  if (!grid || !locked || !frozen) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Initializing...</p>
      </div>
    )
  }

  const N = teamNames.length
  const TOTAL_PTS = N * (N - 1) * M
  const CLINCH = Q > 0 ? Math.floor(TOTAL_PTS / (N - Q + 1)) + 1 : TOTAL_PTS
  const initials = teamNames.map(getInitials)

  let gamesPlayed = 0
  for (let r = 0; r < N; r++) {
    for (let c = r + 1; c < N; c++) {
      for (let g = 0; g < M; g++) {
        if (grid[r][c][g] !== null) gamesPlayed++
      }
    }
  }
  const totalGames = N * (N - 1) / 2 * M
  const remaining = totalGames - gamesPlayed

  const ourIdx = teamNames ? findTeamIndex(team.name, teamNames) : -1

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <h1 className="page-title">Matricives</h1>
        <Link href={`/team/${team.slug}/playdowns`} className="back-link">
          Back
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      <div className="ives-info">
        {gamesPlayed}/{totalGames} played · {remaining} remaining · clinch at {CLINCH} pts
      </div>

      <div className="ives-instructions">
        <strong>Click</strong> to cycle: – → <span className="ives-color-w">W</span> → <span className="ives-color-l">L</span> → <span className="ives-color-t">T</span> → –
        <br />
        Row team&apos;s perspective · <span className="ives-lock-indicator" /> actual · <span className="ives-freeze-indicator" /> frozen
      </div>

      {/* Round-Robin Grid */}
      <div className="ives-grid-wrap" ref={gridRef} style={{ "--ives-cell": `${cellSize}px`, "--ives-hdr": `${headerSize}px`, "--ives-font": `${Math.max(9, cellSize * 0.29)}px`, "--ives-hdr-font": `${Math.max(7, cellSize * 0.22)}px` } as React.CSSProperties}>
        <div className="ives-grid-row">
          <div className="ives-grid-corner" />
          {teamNames.map((_, c) =>
            Array.from({ length: M }, (__, g) => (
              <div key={`${c}-${g}`} className={`ives-col-header ${M > 1 && g === 0 ? "ives-col-group-start" : ""}`}>{initials[c]}</div>
            ))
          ).flat()}
        </div>
        {teamNames.map((_, r) => (
          <div key={r} className="ives-grid-row">
            <div className="ives-row-header">{initials[r]}</div>
            {teamNames.map((_, c) =>
              Array.from({ length: M }, (__, g) => {
                if (r === c) return <div key={`${c}-${g}`} className={`ives-cell ives-cell-diag ${M > 1 && g === 0 ? "ives-cell-group-start" : ""}`} />
                const val = grid[r][c][g]
                const isLocked = locked[r][c][g]
                const isFrozen = frozen[r][c][g]
                return (
                  <div
                    key={`${c}-${g}`}
                    className={`ives-cell ${val === "W" ? "ives-cell-win" : val === "L" ? "ives-cell-loss" : val === "T" ? "ives-cell-tie" : "ives-cell-empty"} ${isLocked ? "ives-cell-locked" : ""} ${isFrozen ? "ives-cell-frozen" : ""} ${M > 1 && g === 0 ? "ives-cell-group-start" : ""}`}
                    onClick={() => cycleResult(r, c, g)}
                  >
                    {val ?? "–"}
                  </div>
                )
              })
            ).flat()}
          </div>
        ))}
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
        <button className="ives-action-btn ives-action-freeze" onClick={freezeAll}><Lock className="size-3.5" /> Freeze</button>
        <button className="ives-action-btn ives-action-freeze" onClick={unfreezeAll}><Unlock className="size-3.5" /> Unfreeze</button>
      </div>
    </div>
  )
}
