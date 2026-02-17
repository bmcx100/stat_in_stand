"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TEAMS } from "@/lib/teams"
import { useFavorites } from "@/hooks/use-favorites"

export default function Home() {
  const router = useRouter()
  const { favorites, toggleFavorite, isFavorite } = useFavorites()
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const favoriteTeams = TEAMS.filter((t) => isFavorite(t.id))

  useEffect(() => {
    if (hydrated && favorites.length === 0) {
      router.push("/add-teams")
    }
  }, [hydrated, favorites.length, router])

  if (!hydrated || favorites.length === 0) {
    return null
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">My Teams</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/add-teams">Add Teams</Link>
        </Button>
      </div>
      <div className="team-list">
        {favoriteTeams.map((team) => (
          <div
            key={team.id}
            className="team-card"
            style={{ backgroundImage: `url(${team.banner})` }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="heart-button"
              data-active={isFavorite(team.id)}
              onClick={() => toggleFavorite(team.id)}
            >
              <Heart fill={isFavorite(team.id) ? "#e3e3e3" : "none"} />
            </Button>
            <Link href={`/dashboard/${team.id}`} className="team-card-link">
              <span className="team-card-name">{team.name}</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
