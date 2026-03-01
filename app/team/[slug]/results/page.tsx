"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { X } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseMhrRankings } from "@/hooks/use-supabase-mhr-rankings"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import type { Game, GameType, StandingsRow } from "@/lib/types"

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

const GAME_TYPES: Array<{ value: GameType | "all"; label: string }> = [
  { value: "all", label: "All Game Types" },
  { value: "unlabeled", label: "Unlabeled" },
  { value: "regular", label: "Regular Season" },
  { value: "tournament", label: "Tournament" },
  { value: "exhibition", label: "Exhibition" },
  { value: "playoffs", label: "Playoffs" },
  { value: "playdowns", label: "Playdowns" },
  { value: "provincials", label: "Provincials" },
]

function ResultBadge({ result }: { result: Game["result"] }) {
  if (!result) return null
  const cls = result === "W" ? "result-badge-w"
    : result === "L" ? "result-badge-l"
    : "result-badge-t"
  return <span className={`result-badge ${cls}`}>{result}</span>
}

function computeRecord(games: Game[]) {
  const w = games.filter((g) => g.result === "W").length
  const l = games.filter((g) => g.result === "L").length
  const t = games.filter((g) => g.result === "T").length
  return { w, l, t }
}

function LastNSummary({ games, count, onCountChange }: { games: Game[]; count: number; onCountChange: (n: number) => void }) {
  const touchStartX = useRef(0)
  const max = games.length

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (delta > 30) onCountChange(Math.min(count + 1, max))
    else if (delta < -30) onCountChange(Math.max(count - 1, 1))
  }, [count, max, onCountChange])

  const lastN = games.slice(0, count)
  if (lastN.length === 0) return null

  const { w, l, t } = computeRecord(lastN)

  return (
    <div className="last-n-card">
      <div className="last-n-picker" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <span className="last-n-picker-label">Last</span>
        <input
          type="number"
          className="last-n-input"
          min={1}
          max={max}
          value={count}
          onChange={(e) => onCountChange(Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), max))}
        />
        <span className="last-n-picker-label">Games</span>
      </div>
      <div className="last-n-divider" />
      <div className="last-n-stats">
        <span className="last-ten-record">{w}-{l}-{t}</span>
        <div className="last-ten-dots">
          {lastN.map((g, i) => {
            const color = g.result === "W" ? "result-badge-w"
              : g.result === "L" ? "result-badge-l"
              : "result-badge-t"
            return <button key={g.id} className={`last-ten-dot ${color}`} onClick={() => onCountChange(i + 1)} />
          })}
        </div>
      </div>
    </div>
  )
}

function StandingsTable({ rows, teamFullName }: { rows: StandingsRow[]; teamFullName: string }) {
  if (rows.length === 0) return null
  const needle = normName(teamFullName)

  return (
    <div className="results-standings-mini">
      <table className="standings-table-mini">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>GP</th>
            <th>W</th>
            <th>L</th>
            <th>T</th>
            <th>PTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const hay = normName(r.teamName)
            const isMe = hay === needle || hay.includes(needle) || needle.includes(hay)
            return (
              <tr key={i} className={isMe ? "standings-mini-highlight" : ""}>
                <td>{i + 1}</td>
                <td className="results-opponent-cell">{r.teamName}</td>
                <td>{r.gp}</td>
                <td>{r.w}</td>
                <td>{r.l}</td>
                <td>{r.t}</td>
                <td>{r.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OpponentSummary({ games, opponentName, rank, onClose }: { games: Game[]; opponentName: string; rank: number | null; onClose: () => void }) {
  if (games.length === 0) return null

  const { w, l, t } = computeRecord(games)

  return (
    <div className="last-n-card">
      <button className="opponent-clear-btn" onClick={onClose}>
        <X className="size-4" />
      </button>
      <div className="last-n-divider" />
      <div className="last-n-stats">
        <span className="last-ten-label">vs {opponentName}{rank ? ` #${rank}` : ""}</span>
        <span className="last-ten-record">{w}-{l}-{t}</span>
        <div className="last-ten-dots">
          {games.slice(0, 20).map((g) => {
            const color = g.result === "W" ? "result-badge-w"
              : g.result === "L" ? "result-badge-l"
              : "result-badge-t"
            return <span key={g.id} className={`last-ten-dot ${color}`} />
          })}
        </div>
      </div>
    </div>
  )
}

export default function ResultsPage() {
  const team = useTeamContext()
  const searchParams = useSearchParams()
  const { games, loading } = useSupabaseGames(team.id)
  const { rankings: mhrRankings } = useSupabaseMhrRankings(team.id)
  const { standingsMap } = useSupabaseStandings(team.id)
  const initialType = searchParams.get("type") as GameType | null
  const [filter, setFilter] = useState<GameType | "all">(initialType ?? "all")
  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [lastN, setLastN] = useState(10)
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  function opponentKey(game: Game): string {
    return game.opponent
  }

  useEffect(() => {
    const initialSearch = searchParams.get("search")
    if (!initialSearch) return
    const allGames = games.filter((g) => g.played)
    const match = allGames.find((g) => {
      const name = g.opponent.toLowerCase()
      return name.includes(initialSearch.toLowerCase())
    })
    if (match) {
      setSelectedOpponent(opponentKey(match))
      setSearch("")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const parent = page.parentElement
    if (!parent) return
    parent.style.overflow = "hidden"
    parent.style.display = "flex"
    parent.style.flexDirection = "column"
    return () => {
      parent.style.overflow = ""
      parent.style.display = ""
      parent.style.flexDirection = ""
    }
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    function check() {
      if (!el) return
      setCanScrollUp(el.scrollTop > 2)
      setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
    }

    check()
    el.addEventListener("scroll", check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", check)
      ro.disconnect()
    }
  }, [filter, search, selectedOpponent])

  if (loading) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const allPlayed = games
    .filter((g) => g.played)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const activeTypes = new Set(allPlayed.map((g) => g.gameType))
  const availableTypes = GAME_TYPES.filter((t) => t.value === "all" || activeTypes.has(t.value as GameType))

  const filtered = allPlayed
    .filter((g) => filter === "all" || g.gameType === filter)
    .filter((g) => {
      if (!search) return true
      const name = g.opponent.toLowerCase()
      return name.includes(search.toLowerCase())
    })
    .filter((g) => {
      if (!selectedOpponent) return true
      return opponentKey(g) === selectedOpponent
    })

  const selectedOpponentName = selectedOpponent
    ? (filtered[0] ?? allPlayed.find((g) => opponentKey(g) === selectedOpponent))?.opponent ?? null
    : null

  const opponentGames = selectedOpponent
    ? allPlayed.filter((g) => opponentKey(g) === selectedOpponent)
    : []

  const typeFiltered = filter === "all" ? allPlayed : allPlayed.filter((g) => g.gameType === filter)
  const overallRecord = computeRecord(typeFiltered)

  function getProvincialRank(name: string): number | null {
    if (!mhrRankings) return null
    const needle = normName(name)
    const entry = mhrRankings.find((r) => {
      const hay = normName(r.name)
      return hay === needle || hay.includes(needle) || needle.includes(hay)
    })
    return entry?.ranking ?? null
  }

  function handleGameClick(game: Game) {
    const key = opponentKey(game)
    if (selectedOpponent === key) {
      setSelectedOpponent(null)
    } else {
      setSelectedOpponent(key)
      setSearch("")
    }
  }

  function clearOpponentFilter() {
    setSelectedOpponent(null)
  }

  return (
    <div ref={pageRef} className="results-page-wrap">
      <div className="results-header">
        <div className="sub-page-header">
          <h1 className="page-title-lg">Results</h1>
        </div>

        <div className="filter-bar justify-between">
          <select
            className="game-form-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as GameType | "all")}
          >
            {availableTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="text"
            className="game-form-input"
            placeholder="Search opponent..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedOpponent(null) }}
          />
        </div>

        <div className="results-record-bar">
          <span className="text-xs text-muted-foreground">Overall</span>
          <span className="text-sm font-bold">{overallRecord.w}-{overallRecord.l}-{overallRecord.t}</span>
          <span className="text-xs text-muted-foreground">{typeFiltered.length} GP</span>
        </div>

        {selectedOpponent && selectedOpponentName ? (
          <OpponentSummary games={opponentGames} opponentName={selectedOpponentName} rank={getProvincialRank(selectedOpponentName)} onClose={clearOpponentFilter} />
        ) : filter !== "all" && standingsMap[filter] ? (
          <StandingsTable rows={standingsMap[filter].rows} teamFullName={`${team.organization} ${team.name}`} />
        ) : (
          <LastNSummary games={typeFiltered} count={lastN} onCountChange={setLastN} />
        )}
      </div>

      <div className="results-scroll-wrap">
        <div className={`scroll-fade-top ${canScrollUp ? "scroll-fade-visible" : ""}`} />
        <div className={`scroll-fade-bottom ${canScrollDown ? "scroll-fade-visible" : ""}`} />
        <div ref={listRef} className="results-game-list">
          {filtered.length === 0 ? (
            <p className="dashboard-record-label">No results yet</p>
          ) : (
            <div className="dashboard-nav">
              {filtered.map((game) => {
                const pRank = getProvincialRank(game.opponent)
                return (
                <button
                  key={game.id}
                  className={`game-list-item game-list-clickable ${selectedOpponent === opponentKey(game) ? "game-list-selected" : ""}`}
                  onClick={() => handleGameClick(game)}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium">{game.opponent}{pRank && <span className="opponent-rank"> #{pRank}</span>}</p>
                    <p className="text-xs text-muted-foreground">{game.date}</p>
                    {game.location && (
                      <p className="text-xs text-muted-foreground">{game.location}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {game.teamScore} - {game.opponentScore}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <ResultBadge result={game.result} />
                      <span className="game-type-badge">{game.gameType}</span>
                    </div>
                  </div>
                </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
