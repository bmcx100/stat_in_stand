"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, X } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { useOpponents } from "@/hooks/use-opponents"
import { useStandings } from "@/hooks/use-standings"
import type { Game } from "@/lib/types"

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
          {lastN.map((g) => {
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

export default function RegularSeasonPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getTeamGames } = useGames()
  const { getById } = useOpponents()
  const { getStandings } = useStandings()
  const [search, setSearch] = useState("")
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

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
  }, [search, selectedOpponent])

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

  if (!team) return null

  const allPlayed = getTeamGames(teamId)
    .filter((g) => g.played && g.gameType === "regular")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filtered = allPlayed
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

  const standings = getStandings(teamId)
  const teamRow = standings?.rows.find((r) => {
    const needle = team.organization.toLowerCase().replace(/\s+/g, "")
    const hay = r.teamName.toLowerCase().replace(/\s+/g, "")
    return hay.includes(needle) || needle.includes(hay)
  })
  const standingsRecord = teamRow
    ? { w: teamRow.w, l: teamRow.l, t: teamRow.t, gp: teamRow.gp }
    : null
  const localRecord = computeRecord(allPlayed)

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
          <h1 className="page-title">Regular Season</h1>
          <Link href={`/dashboard/${teamId}`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>

        <div className="results-record-bar">
          <span className="text-xs text-muted-foreground">Record</span>
          <span className="text-sm font-bold">
            {standingsRecord
              ? `${standingsRecord.w}-${standingsRecord.l}-${standingsRecord.t}`
              : `${localRecord.w}-${localRecord.l}-${localRecord.t}`
            }
          </span>
          <span className="text-xs text-muted-foreground">
            {standingsRecord ? standingsRecord.gp : allPlayed.length} GP
          </span>
        </div>

        {selectedOpponent && selectedOpponentName ? (
          <OpponentSummary games={opponentGames} opponentName={selectedOpponentName} onClose={clearOpponentFilter} />
        ) : standings && standings.rows.length > 0 ? (
          <div className="results-standings-mini">
            <table className="standings-table-mini">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>GP</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>PTS</th>
                </tr>
              </thead>
              <tbody>
                {standings.rows.map((row, i) => {
                  const needle = team.organization.toLowerCase().replace(/\s+/g, "")
                  const hay = row.teamName.toLowerCase().replace(/\s+/g, "")
                  const isMyTeam = hay.includes(needle) || needle.includes(hay)
                  return (
                  <tr key={i} className={isMyTeam ? "standings-mini-highlight" : ""}>
                    <td className="font-medium">{row.teamName}</td>
                    <td>{row.gp}</td>
                    <td>{row.w}</td>
                    <td>{row.l}</td>
                    <td>{row.t}</td>
                    <td className="font-bold">{row.pts}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="filter-bar">
          <input
            type="text"
            className="game-form-input"
            placeholder="Search opponent..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedOpponent(null) }}
          />
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
