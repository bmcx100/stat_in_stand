"use client"

import { useSyncExternalStore, useEffect, useState } from "react"
import Link from "next/link"
import { Heart, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RankingBadge } from "@/components/ranking-badge"
import { useTeams } from "@/hooks/use-supabase-teams"
import { useFavorites } from "@/hooks/use-favorites"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { lookupRanking } from "@/lib/home-cards"

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

type RankingInfo = {
  ranking: number | null
  rankingUrl: string | null
  rankingLabel: string | null
}

export default function TeamsPage() {
  const { teams, loading } = useTeams()
  const { toggleFavorite, isFavorite } = useFavorites()
  const router = useRouter()
  const supabase = createClient()
  const [rankings, setRankings] = useState<Map<string, RankingInfo>>(new Map())
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    if (teams.length === 0) return
    const teamIds = teams.map((t) => t.id)

    async function loadRankings() {
      const [{ data: mhrConfigs }, { data: mhrRankings }] = await Promise.all([
        supabase.from("mhr_config").select("team_id, team_nbr, div_nbr, div_age").in("team_id", teamIds),
        supabase.from("mhr_rankings").select("team_id, rows, synced_at").in("team_id", teamIds).order("synced_at", { ascending: false }),
      ])

      // Latest ranking row per team
      const latestByTeam = new Map<string, Array<{ team_nbr: number; ranking: number }>>()
      for (const row of mhrRankings ?? []) {
        if (!latestByTeam.has(row.team_id)) {
          latestByTeam.set(row.team_id, row.rows as Array<{ team_nbr: number; ranking: number }>)
        }
      }

      const map = new Map<string, RankingInfo>()
      const year = new Date().getFullYear()
      for (const team of teams) {
        const mhr = mhrConfigs?.find((m) => m.team_id === team.id)
        const rows = latestByTeam.get(team.id) ?? []
        const ranking = lookupRanking(mhr?.team_nbr ?? null, rows)
        const rankingUrl = mhr?.div_nbr && mhr?.div_age
          ? `https://myhockeyrankings.com/rank?y=${year}&a=${mhr.div_age}&v=${mhr.div_nbr}`
          : null
        const rankingLabel = ranking && mhr?.div_age
          ? `#${ranking} in Ontario — ${team.age_group.toUpperCase()} ${team.level.toUpperCase()}`
          : null
        map.set(team.id, { ranking, rankingUrl, rankingLabel })
      }
      setRankings(map)
    }

    loadRankings()
  }, [teams.map((t) => t.id).join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <h1 className="page-title">All Teams</h1>
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
            const rankInfo = rankings.get(team.id)
            return (
              <div
                key={team.id}
                className="team-card"
                style={banner ? { backgroundImage: `url(${banner})` } : undefined}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="heart-button"
                  data-active={fav}
                  onClick={() => toggleFavorite(team.slug)}
                >
                  <Heart fill={fav ? "#e3e3e3" : "none"} />
                </Button>
                <Link href={`/team/${team.slug}`} className="team-card-link">
                  <span className="team-card-name">
                    {banner
                      ? `${team.age_group.toUpperCase()} · ${team.level.toUpperCase()}`
                      : `${team.organization} ${team.name} · ${team.age_group.toUpperCase()} · ${team.level.toUpperCase()}`}
                  </span>
                </Link>
                {rankInfo?.ranking != null && (
                  <RankingBadge
                    ranking={rankInfo.ranking}
                    rankingLabel={rankInfo.rankingLabel}
                    rankingUrl={rankInfo.rankingUrl}
                  />
                )}
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
