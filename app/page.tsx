"use client"

import { useSyncExternalStore, useState } from "react"
import Link from "next/link"
import { Heart, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RankingBadge } from "@/components/ranking-badge"
import { TeamEventRow } from "@/components/team-event-row"
import { useTeams } from "@/hooks/use-supabase-teams"
import { useFavorites } from "@/hooks/use-favorites"
import { useHomeCardData } from "@/hooks/use-home-card-data"

const LEVEL_RANK: Record<string, number> = { AAA: 0, AA: 1, A: 2, BB: 3, B: 4, C: 5 }
const levelRank = (l: string) => LEVEL_RANK[l.toUpperCase()] ?? 99

function sortTeams<T extends { age_group: string; level: string; organization: string; name: string }>(teams: T[]): T[] {
  return [...teams].sort((a, b) =>
    a.age_group.localeCompare(b.age_group) ||
    levelRank(a.level) - levelRank(b.level) ||
    a.organization.localeCompare(b.organization) ||
    a.name.localeCompare(b.name)
  )
}

const BANNER_MAP: Record<string, string> = {
  "nepean-wildcats": "/images/wildcats_short_banner.png",
  "ottawa-ice": "/images/ice_short_banner.png",
}

export default function Home() {
  const { teams, loading } = useTeams()
  const { toggleFavorite, isFavorite } = useFavorites()
  const [expandedRow, setExpandedRow] = useState<{ teamId: string; eventType: string } | null>(null)
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const favoriteTeams = hydrated ? sortTeams(teams.filter((t) => isFavorite(t.slug))) : []
  const cardData = useHomeCardData(favoriteTeams)

  if (loading || !hydrated) {
    return (
      <div className="page-container">
        <p className="text-muted-foreground">Loading teams...</p>
      </div>
    )
  }

  function getBanner(slug: string): string | undefined {
    const key = Object.keys(BANNER_MAP).find((k) => slug.includes(k))
    return key ? BANNER_MAP[key] : undefined
  }

  function toggleExpand(teamId: string, eventType: string) {
    setExpandedRow((prev) =>
      prev?.teamId === teamId && prev.eventType === eventType
        ? null
        : { teamId, eventType }
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">My Teams</h1>
        <Link href="/teams" className="add-teams-btn">
          <Plus className="size-4" />
        </Link>
      </div>

      {favoriteTeams.length === 0 ? (
        <Link href="/teams" className="home-empty">
          <Plus className="home-empty-icon" />
          <span className="home-empty-label">Add Teams</span>
        </Link>
      ) : (
        <div className="team-list">
          {favoriteTeams.map((team) => {
            const banner = getBanner(team.slug)
            const teamCard = cardData?.get(team.id)

            return (
              <div key={team.id} className="team-card">
                <div
                  className="team-card-banner"
                  style={banner ? { backgroundImage: `url(${banner})` } : undefined}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="heart-button"
                    data-active={true}
                    onClick={() => toggleFavorite(team.slug)}
                  >
                    <Heart fill="#e3e3e3" />
                  </Button>
                  <Link href={`/team/${team.slug}`} className="team-card-link">
                    <span className="team-card-name">
                      {banner
                        ? `${team.age_group.toUpperCase()} · ${team.level.toUpperCase()}`
                        : `${team.organization} ${team.name} · ${team.age_group.toUpperCase()} · ${team.level.toUpperCase()}`}
                    </span>
                  </Link>
                  {teamCard?.ranking != null && (
                    <RankingBadge
                      ranking={teamCard.ranking}
                      rankingLabel={teamCard.rankingLabel}
                      rankingUrl={teamCard.rankingUrl}
                    />
                  )}
                </div>

                {teamCard !== undefined && (
                  <div className="team-card-events">
                    {teamCard.activeEvents.length > 0 ? (
                      teamCard.activeEvents.map((event) => (
                        <TeamEventRow
                          key={event.gameType}
                          event={event}
                          expanded={
                            expandedRow?.teamId === team.id &&
                            expandedRow.eventType === event.gameType
                          }
                          onToggle={() => toggleExpand(team.id, event.gameType)}
                        />
                      ))
                    ) : (
                      <div className="team-card-fallback">
                        <span className="team-event-label">
                          {teamCard.fallbackMode === "regular"
                            ? "Regular Season"
                            : teamCard.fallbackMode === "playdowns"
                            ? "Playdowns"
                            : "Tournaments"}
                        </span>
                        <span className="team-event-summary">No games this week</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
