"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Archive } from "lucide-react"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { useOpponents } from "@/hooks/use-opponents"
import { useStandings } from "@/hooks/use-standings"
import { usePlaydowns } from "@/hooks/use-playdowns"
import { isPlaydownActive, isPlaydownExpired, computePlaydownStandings } from "@/lib/playdowns"
import type { Game } from "@/lib/types"

export default function Dashboard({
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
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const scheduleRef = useRef<HTMLDivElement>(null)

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
    const el = scheduleRef.current
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
  }, [])

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

  if (!team) {
    return (
      <div className="dashboard-page">
        <h1 className="page-title">Team not found</h1>
        <Link href="/" className="back-link">Back to My Teams</Link>
      </div>
    )
  }

  const games = getTeamGames(teamId)
  const played = games.filter((g) => g.played)
  const wins = played.filter((g) => g.result === "W").length
  const losses = played.filter((g) => g.result === "L").length
  const ties = played.filter((g) => g.result === "T").length

  const standingsData = getStandings(teamId)
  const teamRow = standingsData?.rows.find((r) => {
    const needle = team.organization.toLowerCase().replace(/\s+/g, "")
    const hay = r.teamName.toLowerCase().replace(/\s+/g, "")
    return hay.includes(needle) || needle.includes(hay)
  })

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = games
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const playdown = getPlaydown(teamId)
  const showPlaydownCard = playdown && isPlaydownActive(playdown.config, playdown.games)
  const showPastEvents = playdown && isPlaydownExpired(playdown.config, playdown.games)

  const playdownSelf = playdown
    ? computePlaydownStandings(playdown.config, playdown.games).find((r) => r.teamId === "self")
    : null

  const allPlayoffGames = games.filter((g) => g.gameType === "playoffs")
  const playoffPlayed = allPlayoffGames.filter((g) => g.played)
  const playoffRecord = {
    w: playoffPlayed.filter((g) => g.result === "W").length,
    l: playoffPlayed.filter((g) => g.result === "L").length,
    t: playoffPlayed.filter((g) => g.result === "T").length,
  }

  return (
    <div ref={pageRef} className="dashboard-page dashboard-page-full">
      <Link href={`/dashboard/${teamId}/results`} className="dashboard-section-heading dashboard-section-link">History</Link>
      <div className="dashboard-records">
        <Link href={`/dashboard/${teamId}/results`} className="dashboard-record-card">
          <p className="dashboard-record">{wins}-{losses}-{ties}</p>
          <p className="dashboard-record-label">All Games</p>
        </Link>

        {teamRow && (
          <Link href={`/dashboard/${teamId}/regular-season`} className="dashboard-record-card">
            <p className="dashboard-record">{teamRow.w}-{teamRow.l}-{teamRow.t}</p>
            <p className="dashboard-record-label">Regular Season</p>
          </Link>
        )}
      </div>

      <Link href={`/dashboard/${teamId}/schedule`} className="dashboard-section-heading dashboard-section-link">Schedule</Link>
      <div className="dashboard-schedule-wrap">
        <div className={`scroll-fade-top ${canScrollUp ? "scroll-fade-visible" : ""}`} />
        <div className={`scroll-fade-bottom ${canScrollDown ? "scroll-fade-visible" : ""}`} />
        <div ref={scheduleRef} className="dashboard-schedule-list">
          {upcoming.length === 0 ? (
            <p className="dashboard-record-label">No upcoming games</p>
          ) : (
            <div className="dashboard-nav">
              {upcoming.map((game) => (
                <Link
                  key={game.id}
                  href={`/dashboard/${teamId}/results?search=${encodeURIComponent(opponentDisplay(game))}`}
                  className="game-list-item game-list-clickable"
                >
                  <div>
                    <p className="text-sm font-medium">{opponentDisplay(game)}</p>
                    <p className="text-xs text-muted-foreground">
                      {game.date}{game.time ? ` at ${game.time}` : ""}
                    </p>
                    {game.location && (
                      <p className="text-xs text-muted-foreground">{game.location}</p>
                    )}
                  </div>
                  <span className="game-type-badge">{game.gameType}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <Link href={`/dashboard/${teamId}/events`} className="dashboard-section-heading dashboard-section-link">Events</Link>

      {showPlaydownCard && playdownSelf && (
        <Link href={`/dashboard/${teamId}/playdowns`} className="dashboard-record-card">
          <p className="dashboard-record">{playdownSelf.w}-{playdownSelf.l}-{playdownSelf.t}</p>
          <p className="dashboard-record-label">Playdowns</p>
        </Link>
      )}

      {allPlayoffGames.length > 0 && (
        <Link href="/" className="dashboard-record-card">
          <p className="dashboard-record">{playoffRecord.w}-{playoffRecord.l}-{playoffRecord.t}</p>
          <p className="dashboard-record-label">Playoffs</p>
        </Link>
      )}

      {showPastEvents && (
        <div className="dashboard-nav">
          <Link href={`/dashboard/${teamId}/events`} className="dashboard-nav-link">
            <Archive className="size-4" />
            Past Events
          </Link>
        </div>
      )}

    </div>
  )
}
