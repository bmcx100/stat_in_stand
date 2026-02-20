"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTeams } from "@/hooks/use-supabase-teams"
import { useFavorites } from "@/hooks/use-favorites"

const BANNER_MAP: Record<string, string> = {
  "nepean-wildcats": "/images/wildcats_short_banner.png",
  "ottawa-ice": "/images/ice_short_banner.png",
}

export default function Home() {
  const { teams, loading } = useTeams()
  const { toggleFavorite, isFavorite } = useFavorites()
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

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

  const favoriteTeams = teams.filter((t) => isFavorite(t.slug))
  const otherTeams = teams.filter((t) => !isFavorite(t.slug))

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Teams</h1>
      </div>

      {favoriteTeams.length > 0 && (
        <div className="team-list">
          {favoriteTeams.map((team) => (
            <div
              key={team.id}
              className="team-card"
              style={getBanner(team.slug) ? { backgroundImage: `url(${getBanner(team.slug)})` } : undefined}
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
                  {`${team.age_group.toUpperCase()} - ${team.level.toUpperCase()}`}
                </span>
              </Link>
            </div>
          ))}
        </div>
      )}

      {otherTeams.length > 0 && (
        <>
          {favoriteTeams.length > 0 && (
            <h2 className="admin-section-title">All Teams</h2>
          )}
          <div className="team-list">
            {otherTeams.map((team) => (
              <div
                key={team.id}
                className="team-card"
                style={getBanner(team.slug) ? { backgroundImage: `url(${getBanner(team.slug)})` } : undefined}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="heart-button"
                  data-active={false}
                  onClick={() => toggleFavorite(team.slug)}
                >
                  <Heart fill="none" />
                </Button>
                <Link href={`/team/${team.slug}`} className="team-card-link">
                  <span className="team-card-name">
                    {team.banner_url
                      ? `${team.age_group} - ${team.level}`
                      : `${team.organization} - ${team.name} - ${team.age_group} - ${team.level}`}
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {teams.length === 0 && (
        <p className="text-muted-foreground">No teams available yet.</p>
      )}
    </div>
  )
}
