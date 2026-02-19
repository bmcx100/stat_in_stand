"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, X } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { useOpponents } from "@/hooks/use-opponents"
import { useStandings } from "@/hooks/use-standings"
import { usePlaydowns } from "@/hooks/use-playdowns"
import { computePlaydownStandings } from "@/lib/playdowns"
import type { Game } from "@/lib/types"

type StandingsMode = "regular" | "playdowns"

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
  const { getPlaydown } = usePlaydowns()
  const [mode, setMode] = useState<StandingsMode>("regular")
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

  const playdown = getPlaydown(teamId)
  const hasPlaydown = !!playdown

  // --- Regular Season data ---
  const allPlayed = getTeamGames(teamId)
    .filter((g) => g.played && g.gameType === "regular")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

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

  // --- Playdowns data ---
  const playdownStandings = playdown
    ? computePlaydownStandings(playdown.config, playdown.games)
    : []
  const playdownSelf = playdownStandings.find((r) => r.teamId === "self")

  // Convert playdown games to Game-like objects for the unified game list
  const playdownGames: Game[] = playdown
    ? playdown.games
        .filter((g) => g.played && g.homeScore !== null && g.awayScore !== null)
        .map((g) => {
          const isSelfHome = g.homeTeam === "self"
          const opponentTeamId = isSelfHome ? g.awayTeam : g.homeTeam
          const oppTeam = playdown.config.teams.find((t) => t.id === opponentTeamId)
          const teamScore = isSelfHome ? g.homeScore! : g.awayScore!
          const opponentScore = isSelfHome ? g.awayScore! : g.homeScore!
          const result = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "T"
          return {
            id: g.id,
            teamId,
            date: g.date,
            time: g.time,
            opponent: oppTeam?.name ?? opponentTeamId,
            opponentId: oppTeam?.opponentId,
            location: g.location,
            gameType: "playdowns" as Game["gameType"],
            played: true,
            teamScore,
            opponentScore,
            result: result as Game["result"],
            source: "manual" as Game["source"],
            sourceGameId: "",
          }
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : []

  // --- Unified filtered list based on mode ---
  const activeGames = mode === "regular" ? allPlayed : playdownGames

  const filtered = activeGames
    .filter((g) => {
      if (!search) return true
      const name = opponentDisplay(g).toLowerCase()
      return name.includes(search.toLowerCase())
    })
    .filter((g) => {
      if (!selectedOpponent) return true
      return opponentKey(g) === selectedOpponent
    })

  const filteredOpponentKeys = new Set(filtered.map((g) => opponentKey(g)))
  const singleOpponent = filteredOpponentKeys.size === 1 && filtered.length > 0
    ? { name: opponentDisplay(filtered[0]), ...computeRecord(filtered), gp: filtered.length }
    : null

  function handleModeChange(newMode: StandingsMode) {
    setMode(newMode)
    setSearch("")
    setSelectedOpponent(null)
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

  return (
    <div ref={pageRef} className="results-page-wrap">
      <div className="results-header">
        <div className="sub-page-header">
          {hasPlaydown ? (
            <select
              className="standings-mode-select"
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as StandingsMode)}
            >
              <option value="regular">Regular Season</option>
              <option value="playdowns">Playdowns</option>
            </select>
          ) : (
            <h1 className="page-title">Regular Season</h1>
          )}
          <Link href={`/dashboard/${teamId}`} className="back-link">
            Back
            <ArrowLeft className="size-4" />
          </Link>
        </div>

        {singleOpponent ? (
          <div className="results-record-bar">
            <span className="text-xs text-muted-foreground">vs {singleOpponent.name}</span>
            <span className="text-sm font-bold">{singleOpponent.w}-{singleOpponent.l}-{singleOpponent.t}</span>
            <span className="text-xs text-muted-foreground">{singleOpponent.gp} GP</span>
          </div>
        ) : mode === "regular" ? (
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
        ) : playdownSelf ? (
          <div className="results-record-bar">
            <span className="text-xs text-muted-foreground">Record</span>
            <span className="text-sm font-bold">{playdownSelf.w}-{playdownSelf.l}-{playdownSelf.t}</span>
            <span className="text-xs text-muted-foreground">{playdownSelf.gp} GP</span>
          </div>
        ) : (
          <div className="results-record-bar">
            <span className="text-xs text-muted-foreground">Record</span>
            <span className="text-sm font-bold">0-0-0</span>
            <span className="text-xs text-muted-foreground">0 GP</span>
          </div>
        )}

        {mode === "regular" && standings && standings.rows.length > 0 && (
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
                  <tr
                    key={i}
                    className={`${isMyTeam ? "standings-mini-highlight" : "standings-mini-clickable"}`}
                    onClick={() => {
                      if (!isMyTeam) {
                        setSearch(row.teamName)
                        setSelectedOpponent(null)
                      }
                    }}
                  >
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
        )}

        {mode === "playdowns" && playdownStandings.length > 0 && (
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
                {playdownStandings.map((row, i) => {
                  const isSelf = row.teamId === "self"
                  return (
                  <tr
                    key={i}
                    className={`${isSelf ? "standings-mini-highlight" : "standings-mini-clickable"}`}
                    onClick={() => {
                      if (!isSelf) {
                        setSearch(row.teamName)
                        setSelectedOpponent(null)
                      }
                    }}
                  >
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
        )}

        <div className="filter-bar">
          <input
            type="text"
            className="game-form-input"
            placeholder="Search opponent..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedOpponent(null) }}
          />
          {search && (
            <button className="opponent-clear-btn" onClick={() => setSearch("")}>
              <X className="size-4" />
            </button>
          )}
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
