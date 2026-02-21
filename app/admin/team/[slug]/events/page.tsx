"use client"

import { useRouter } from "next/navigation"
import { CalendarDays, ChevronRight, Plus } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import type { TournamentConfig, TournamentPool } from "@/lib/types"

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function AdminEventsPage() {
  const team = useTeamContext()
  const router = useRouter()
  const { playdown, loading: pdLoading } = useSupabasePlaydowns(team.id)
  const { tournaments, addTournament, loading: tLoading } = useSupabaseTournaments(team.id)

  const loading = pdLoading || tLoading
  const playoffsTournament = tournaments.find((t) => t.config.id === "playoffs")
  const namedTournaments = tournaments.filter((t) => t.config.id !== "playoffs")

  async function handleNewTournament() {
    const id = generateId("trn")
    const initialPool: TournamentPool = {
      id: generateId("pool"),
      name: "Pool A",
      teamIds: [],
      qualifyingSpots: 2,
    }
    const config: TournamentConfig = {
      id,
      teamId: team.id,
      name: "",
      location: "",
      startDate: "",
      endDate: "",
      pools: [initialPool],
      teams: [],
      gamesPerMatchup: 1,
      tiebreakerOrder: ["wins", "head-to-head", "goal-differential", "goals-allowed", "goals-for"],
      eliminationEnabled: false,
      consolationEnabled: false,
    }
    await addTournament(config)
    router.push(`/admin/team/${team.slug}/events/tournament/${id}`)
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="ob-page-title">Events</h1>
      </div>

      {/* Fixed events: Playdowns + Playoffs */}
      <div className="flex flex-col gap-2">
        <h2 className="admin-section-title">Your Events</h2>

        {/* Playdowns */}
        <button
          className="event-card"
          onClick={() => router.push(`/admin/team/${team.slug}/events/playdown`)}
        >
          <div className="event-card-info">
            <CalendarDays className="event-card-icon" />
            <div>
              <p className="event-card-title">Playdowns</p>
              <p className="event-card-meta">
                {playdown
                  ? `${playdown.config.totalTeams} teams · ${playdown.config.qualifyingSpots} qualifying · ${playdown.games.length} games`
                  : "Not configured yet"}
              </p>
            </div>
          </div>
          <ChevronRight className="event-card-arrow" />
        </button>

        {/* Playoffs */}
        <button
          className="event-card"
          onClick={() => router.push(`/admin/team/${team.slug}/events/playoffs`)}
        >
          <div className="event-card-info">
            <CalendarDays className="event-card-icon" />
            <div>
              <p className="event-card-title">Playoffs</p>
              <p className="event-card-meta">
                {playoffsTournament
                  ? `${playoffsTournament.config.teams.length} teams · ${playoffsTournament.games.length} games`
                  : "Not configured yet"}
              </p>
            </div>
          </div>
          <ChevronRight className="event-card-arrow" />
        </button>

        {/* Named tournaments */}
        {namedTournaments.map((t) => (
          <button
            key={t.config.id}
            className="event-card"
            onClick={() => router.push(`/admin/team/${team.slug}/events/tournament/${t.config.id}`)}
          >
            <div className="event-card-info">
              <CalendarDays className="event-card-icon" />
              <div>
                <p className="event-card-title">{t.config.name || "Untitled Tournament"}</p>
                <p className="event-card-meta">
                  {t.config.teams.length} teams · {t.config.pools.length} pools · {t.games.length} games
                  {t.config.startDate ? ` · ${t.config.startDate}` : ""}
                </p>
              </div>
            </div>
            <ChevronRight className="event-card-arrow" />
          </button>
        ))}
      </div>

      {/* Create tournament */}
      <div className="import-section">
        <h2 className="admin-section-title">Create New Tournament</h2>
        <p className="text-sm text-muted-foreground">
          Named tournaments support multiple pools, tiebreaker ordering, and importing games directly from your schedule by date range.
        </p>
        <button className="event-create-card" onClick={handleNewTournament}>
          <Plus className="event-create-icon" />
          <span className="event-create-label">New Tournament</span>
          <span className="event-create-sub">Pool play · date range · game assignment from schedule</span>
        </button>
      </div>
    </div>
  )
}
