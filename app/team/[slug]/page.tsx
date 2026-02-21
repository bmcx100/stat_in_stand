"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Archive } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import { isPlaydownExpired, computePlaydownStandings } from "@/lib/playdowns"
import { isTournamentExpired } from "@/lib/tournaments"
import type { Game } from "@/lib/types"

export default function Dashboard() {
  const team = useTeamContext()
  const { games, loading: gamesLoading } = useSupabaseGames(team.id)
  const { getById } = useSupabaseOpponents(team.id)
  const { standings } = useSupabaseStandings(team.id)
  const { playdown } = useSupabasePlaydowns(team.id)
  const { tournaments } = useSupabaseTournaments(team.id)
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

  if (gamesLoading) {
    return (
      <div className="dashboard-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const played = games.filter((g) => g.played)
  const wins = played.filter((g) => g.result === "W").length
  const losses = played.filter((g) => g.result === "L").length
  const ties = played.filter((g) => g.result === "T").length

  const teamRow = standings?.rows.find((r) => {
    const needle = team.organization.toLowerCase().replace(/\s+/g, "")
    const hay = r.teamName.toLowerCase().replace(/\s+/g, "")
    return hay.includes(needle) || needle.includes(hay)
  })

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = games
    .filter((g) => !g.played && g.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const showPlaydownCard = playdown && playdown.config.teams.length > 0

  const playdownSelf = playdown
    ? computePlaydownStandings(playdown.config, playdown.games).find((r) => r.teamId === "self")
    : null

  const hasExpiredTournaments = tournaments.some((t) => isTournamentExpired(t.config))

  const showPastEvents = (playdown && isPlaydownExpired(playdown.config, playdown.games)) || hasExpiredTournaments

  return (
    <div ref={pageRef} className="dashboard-page dashboard-page-full">
      <Link href={`/team/${team.slug}/results`} className="dashboard-section-heading dashboard-section-link">History</Link>
      <div className="dashboard-records">
        <Link href={`/team/${team.slug}/results`} className="dashboard-record-card">
          <p className="dashboard-record">{wins}-{losses}-{ties}</p>
          <p className="dashboard-record-label">All Games</p>
        </Link>

        {teamRow && (
          <Link href={`/team/${team.slug}/standings`} className="dashboard-record-card">
            <p className="dashboard-record">{teamRow.w}-{teamRow.l}-{teamRow.t}</p>
            <p className="dashboard-record-label">Regular Season</p>
          </Link>
        )}
      </div>

      <Link href={`/team/${team.slug}/schedule`} className="dashboard-section-heading dashboard-section-link">Schedule</Link>
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
                  href={`/team/${team.slug}/results?search=${encodeURIComponent(opponentDisplay(game))}`}
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

      <Link href={`/team/${team.slug}/events`} className="dashboard-section-heading dashboard-section-link">Events</Link>

      {showPlaydownCard && (
        <Link href={`/team/${team.slug}/playdowns`} className="dashboard-record-card">
          <p className="dashboard-record">
            {playdownSelf ? `${playdownSelf.w}-${playdownSelf.l}-${playdownSelf.t}` : "—"}
          </p>
          <p className="dashboard-record-label">Playdowns</p>
        </Link>
      )}

      {showPastEvents && (
        <div className="dashboard-nav">
          <Link href={`/team/${team.slug}/events`} className="dashboard-nav-link">
            <Archive className="size-4" />
            Past Events
          </Link>
        </div>
      )}

    </div>
  )
}
