"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { Heart, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTeams } from "@/hooks/use-supabase-teams"
import { useFavorites } from "@/hooks/use-favorites"
import { useRouter } from "next/navigation"

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

function getBanner(slug: string): string | undefined {
  const key = Object.keys(BANNER_MAP).find((k) => slug.includes(k))
  return key ? BANNER_MAP[key] : undefined
}

export default function TeamsPage() {
  const { teams, loading } = useTeams()
  const { toggleFavorite, isFavorite } = useFavorites()
  const router = useRouter()
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

  const sorted = sortTeams(teams)

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Favourites</h1>
        <Link href="/" className="teams-back-link">
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground">No teams available yet.</p>
      ) : (
        <div className="team-list">
          {sorted.map((team) => {
            const banner = getBanner(team.slug)
            const fav = isFavorite(team.slug)
            return (
              <div key={team.id} className="team-card">
                <div
                  className="team-card-banner"
                  style={banner ? { backgroundImage: `url(${banner})` } : undefined}
                >
                  <Link href={`/team/${team.slug}`} className="team-card-link">
                    <span className="team-card-name">
                      {banner
                        ? `${team.age_group.toUpperCase()}${team.level.toUpperCase()}`
                        : `${team.organization} ${team.name} · ${team.age_group.toUpperCase()}${team.level.toUpperCase()}`}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="heart-button"
                    data-active={fav}
                    onClick={() => toggleFavorite(team.slug)}
                  >
                    <Heart fill={fav ? "#e3e3e3" : "none"} />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="teams-done-wrap">
        <Button className="w-full" onClick={() => router.push("/")}>
          Done
        </Button>
      </div>
    </div>
  )
}
