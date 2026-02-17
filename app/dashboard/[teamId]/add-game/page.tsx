"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TEAMS } from "@/lib/teams"
import { useGames } from "@/hooks/use-games"
import { generateGameId } from "@/lib/parsers"
import type { GameType } from "@/lib/types"

const GAME_TYPE_OPTIONS: Array<{ value: GameType; label: string }> = [
  { value: "unlabeled", label: "Unlabeled" },
  { value: "regular", label: "Regular Season" },
  { value: "tournament", label: "Tournament" },
  { value: "exhibition", label: "Exhibition" },
  { value: "playoffs", label: "Playoffs" },
  { value: "playdowns", label: "Playdowns" },
  { value: "provincials", label: "Provincials" },
]

export default function AddGamePage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const { addGame } = useGames()
  const router = useRouter()

  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [opponent, setOpponent] = useState("")
  const [location, setLocation] = useState("")
  const [teamScore, setTeamScore] = useState("")
  const [opponentScore, setOpponentScore] = useState("")
  const [gameType, setGameType] = useState<GameType>("regular")
  const [tournamentName, setTournamentName] = useState("")

  if (!team) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !opponent) return

    const hasScores = teamScore !== "" && opponentScore !== ""
    const tScore = hasScores ? parseInt(teamScore, 10) : null
    const oScore = hasScores ? parseInt(opponentScore, 10) : null
    const played = hasScores

    let result: "W" | "L" | "T" | null = null
    if (played && tScore !== null && oScore !== null) {
      if (tScore > oScore) result = "W"
      else if (tScore < oScore) result = "L"
      else result = "T"
    }

    addGame(teamId, {
      id: generateGameId(teamId, date, opponent),
      teamId,
      date,
      time,
      opponent,
      location,
      teamScore: tScore,
      opponentScore: oScore,
      result,
      gameType,
      source: "manual",
      sourceGameId: "",
      played,
      tournamentName: tournamentName.trim() || undefined,
    })

    router.push(`/dashboard/${teamId}`)
  }

  return (
    <div className="dashboard-page">
      <div className="sub-page-header">
        <Link href={`/dashboard/${teamId}`} className="back-link">
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <h1 className="page-title">Add Game</h1>
      </div>

      <form onSubmit={handleSubmit} className="game-form">
        <div className="game-form-field">
          <label className="game-form-label">Date *</label>
          <input
            type="date"
            className="game-form-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="game-form-field">
          <label className="game-form-label">Time</label>
          <input
            type="time"
            className="game-form-input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>

        <div className="game-form-field">
          <label className="game-form-label">Opponent *</label>
          <input
            type="text"
            className="game-form-input"
            placeholder="Team name"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            required
          />
        </div>

        <div className="game-form-field">
          <label className="game-form-label">Location</label>
          <input
            type="text"
            className="game-form-input"
            placeholder="Arena name"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="game-form-field">
          <label className="game-form-label">Game Type</label>
          <select
            className="game-form-select"
            value={gameType}
            onChange={(e) => setGameType(e.target.value as GameType)}
          >
            {GAME_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="game-form-field">
          <label className="game-form-label">Tournament Name (optional)</label>
          <input
            type="text"
            className="game-form-input"
            placeholder="e.g. Silver Stick"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Leave scores empty for scheduled (upcoming) games
        </p>

        <div className="game-form-field">
          <label className="game-form-label">Team Score</label>
          <input
            type="number"
            className="game-form-input"
            min="0"
            placeholder="—"
            value={teamScore}
            onChange={(e) => setTeamScore(e.target.value)}
          />
        </div>

        <div className="game-form-field">
          <label className="game-form-label">Opponent Score</label>
          <input
            type="number"
            className="game-form-input"
            min="0"
            placeholder="—"
            value={opponentScore}
            onChange={(e) => setOpponentScore(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={!date || !opponent}>
          Save Game
        </Button>
      </form>
    </div>
  )
}
