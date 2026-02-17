"use client"

import { use } from "react"
import Link from "next/link"
import { Settings, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { useStandings } from "@/hooks/use-standings"

export default function Dashboard({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { getTeamGames } = useGames()
  const { getStandings } = useStandings()

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

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div />
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/${teamId}/import`}>
            <Settings />
          </Link>
        </Button>
      </div>

      <Link href="/">
        <div
          className="dashboard-banner"
          style={{ backgroundImage: `url(${team.banner})` }}
        >
          <span className="dashboard-banner-name">
            {team.name}
          </span>
        </div>
      </Link>

      <div className="dashboard-records">
        <Link href={`/dashboard/${teamId}/results`} className="dashboard-record-card">
          <p className="dashboard-record">{wins}-{losses}-{ties}</p>
          <p className="dashboard-record-label">All Games</p>
        </Link>

        {teamRow && (
          <Link href={`/dashboard/${teamId}/standings`} className="dashboard-record-card">
            <p className="dashboard-record">{teamRow.w}-{teamRow.l}-{teamRow.t}</p>
            <p className="dashboard-record-label">Regular Season</p>
          </Link>
        )}
      </div>

      <div className="dashboard-nav">
        <Link href={`/dashboard/${teamId}/schedule`} className="dashboard-nav-link">
          <Calendar className="size-4" />
          Schedule
          <span className="game-type-badge">
            {games.filter((g) => !g.played).length} upcoming
          </span>
        </Link>
      </div>

    </div>
  )
}
