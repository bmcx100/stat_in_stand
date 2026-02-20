"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, X } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"
import type { Game, GameType } from "@/lib/types"

const GAME_TYPES: Array<{ value: GameType | "all"; label: string }> = [
  { value: "all", label: "All Types" },
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
  const lastN = games.slice(0, count)
  if (lastN.length === 0) return null

  const { w, l, t } = computeRecord(lastN)

  return (
    <div className="last-n-card">
      <div className="last-n-picker">
        <span className="last-n-picker-label">Last</span>
        <input
          type="number"
          className="last-n-input"
          min={1}
          max={99}
          value={count}
          onChange={(e) => onCountChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
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

function OpponentSummary({ games, opponentName, onClose }: { games: Game[]; opponentName: string; onClose: () => void }) {
  if (games.length === 0) return null

  const { w, l, t } = computeRecord(games)

  return (
    <div className="last-n-card">
      <button className="opponent-clear-btn" onClick={onClose}>
        <X className="size-4" />
      </button>
      <div className="last-n-divider" />
      <div className="last-n-stats">
        <span className="last-ten-label">vs {opponentName}</span>
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
  const { getById } = useSupabaseOpponents(team.id)
  const [filter, setFilter] = useState<GameType | "all">("all")
  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [lastN, setLastN] = useState(10)
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  function opponentDisplay(game: Game): string {
    if (game.opponentId) {
      const opp = getById(game.opponentId)
      if (opp) {
        if (opp.location && opp.name) return `${opp.location} ${opp.name}`
        return opp.fullName
      }
    }
    return game.opponent
  }

  function opponentKey(game: Game): string {
    return game.opponentId || game.opponent
  }

  useEffect(() => {
    const initialSearch = searchParams.get("search")
    if (!initialSearch) return
    const allGames = games.filter((g) => g.played)
    const match = allGames.find((g) => {
      const name = opponentDisplay(g).toLowerCase()
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

  const filtered = allPlayed
    .filter((g) => filter === "all" || g.gameType === filter)
    .filter((g) => {
      if (!search) return true
      const name = opponentDisplay(g).toLowerCase()
      return name.includes(search.toLowerCase())
    })
    .filter((g) => {
      if (!selectedOpponent) return true
      return opponentKey(g) === selectedOpponent
    })

  const selectedOpponentName = selectedOpponent
    ? opponentDisplay(filtered[0] ?? allPlayed.find((g) => opponentKey(g) === selectedOpponent)!)
    : null

  const opponentGames = selectedOpponent
    ? allPlayed.filter((g) => opponentKey(g) === selectedOpponent)
    : []

  const overallRecord = computeRecord(allPlayed)

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
          <h1 className="page-title">All Games</h1>
          <Link href={`/team/${team.slug}`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>

        <div className="results-record-bar">
          <span className="text-xs text-muted-foreground">Overall</span>
          <span className="text-sm font-bold">{overallRecord.w}-{overallRecord.l}-{overallRecord.t}</span>
          <span className="text-xs text-muted-foreground">{allPlayed.length} GP</span>
        </div>

        {selectedOpponent && selectedOpponentName ? (
          <OpponentSummary games={opponentGames} opponentName={selectedOpponentName} onClose={clearOpponentFilter} />
        ) : (
          <LastNSummary games={allPlayed} count={lastN} onCountChange={setLastN} />
        )}

        <div className="filter-bar justify-between">
          <input
            type="text"
            className="game-form-input"
            placeholder="Search opponent..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedOpponent(null) }}
          />
          <select
            className="game-form-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as GameType | "all")}
          >
            {GAME_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="results-scroll-wrap">
        <div className={`scroll-fade-top ${canScrollUp ? "scroll-fade-visible" : ""}`} />
        <div className={`scroll-fade-bottom ${canScrollDown ? "scroll-fade-visible" : ""}`} />
        <div ref={listRef} className="results-game-list">
          {filtered.length === 0 ? (
            <p className="dashboard-record-label">No results yet</p>
          ) : (
            <div className="dashboard-nav">
              {filtered.map((game) => (
                <button
                  key={game.id}
                  className={`game-list-item game-list-clickable ${selectedOpponent === opponentKey(game) ? "game-list-selected" : ""}`}
                  onClick={() => handleGameClick(game)}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium">{opponentDisplay(game)}</p>
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
