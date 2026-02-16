"use client"

import Link from "next/link"
import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TEAMS } from "@/lib/teams"
import { useFavorites } from "@/hooks/use-favorites"

export default function AddTeams() {
  const { favorites, toggleFavorite, isFavorite } = useFavorites()

  return (
    <div className="page-container">
      <div className="add-teams-header">
        <h1 className="page-title">Add Teams</h1>
        <Button variant="ghost" size="sm" asChild disabled={favorites.length === 0}>
          <Link href="/">Done</Link>
        </Button>
      </div>
      <div className="team-list">
        {TEAMS.map((team) => (
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
