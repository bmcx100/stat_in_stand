"use client"

import { useState, useCallback } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"
import type { Game, GameType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, X } from "lucide-react"

const GAME_TYPE_OPTIONS = [
  { value: "unlabeled", label: "Unlabeled" },
  { value: "regular", label: "Regular Season" },
  { value: "tournament", label: "Tournament" },
  { value: "exhibition", label: "Exhibition" },
  { value: "playoffs", label: "Playoffs" },
  { value: "playdowns", label: "Playdowns" },
  { value: "provincials", label: "Provincials" },
]

export default function AdminGamesPage() {
  const team = useTeamContext()
  const { games, addGames, updateGame, removeGame, clearGames, loading: gamesLoading } = useSupabaseGames(team.id)
  const { getById } = useSupabaseOpponents(team.id)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [newDate, setNewDate] = useState("")
  const [newTime, setNewTime] = useState("")
  const [newOpponent, setNewOpponent] = useState("")
  const [newLocation, setNewLocation] = useState("")
  const [newGameType, setNewGameType] = useState<GameType>("regular")

  const addGameReady = Boolean(newOpponent)

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

  const handleGameUpdate = useCallback(async (gameId: string, updates: Partial<Game>) => {
    await updateGame(gameId, updates)
  }, [updateGame])

  const handleDelete = useCallback(async (gameId: string) => {
    await removeGame(gameId)
    setDeletingId(null)
  }, [removeGame])

  async function handleAddGame() {
    if (!newOpponent) return
    await addGames([{
      date: newDate,
      time: newTime,
      opponent: newOpponent,
      location: newLocation,
      gameType: newGameType,
      source: "manual",
      played: false,
    }])
    setNewDate(""); setNewTime(""); setNewOpponent(""); setNewLocation(""); setNewGameType("regular")
    setAddOpen(false)
  }

  const sortedGames = [...games].sort((a, b) => b.date.localeCompare(a.date))

  if (gamesLoading) {
    return <p className="text-muted-foreground">Loading...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="admin-section-title">Games</h1>
      </div>

      <div className="flex items-start justify-between">
        <Button
          variant={addGameReady ? "default" : "outline"}
          className={addGameReady ? "btn-save-ready" : undefined}
          size="sm"
          onClick={() => setAddOpen((o) => !o)}
        >
          <Plus className="h-4 w-4" /> Add Game
        </Button>
        {/* Clear all games */}
        {games.length > 0 && (
          confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-destructive text-sm">Delete all {games.length} games?</span>
              <Button variant="destructive" size="sm" onClick={async () => { await clearGames(); setConfirmClear(false) }}>
                Confirm
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-4 w-4" /> Clear All Games
            </Button>
          )
        )}
      </div>

      {/* Add Game card */}
      {addOpen && (
        <div className="collapsible-card">
          <div className="collapsible-body">
            <Button
              variant={addGameReady ? "default" : "outline"}
              className={addGameReady ? "btn-save-ready" : undefined}
              onClick={handleAddGame}
              disabled={!addGameReady}
            >
              <Plus className="h-4 w-4" /> Add Game
            </Button>
            <div className="playdown-config-row">
              <div className="game-form-field">
                <label className="game-form-label">Date</label>
                <input type="date" className="game-form-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <div className="game-form-field">
                <label className="game-form-label">Time</label>
                <input type="time" className="game-form-input" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              </div>
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Opponent</label>
              <input className="game-form-input" value={newOpponent} onChange={(e) => setNewOpponent(e.target.value)} placeholder="Opponent name" />
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Location</label>
              <input className="game-form-input" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Arena name" />
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Type</label>
              <select className="game-form-select" value={newGameType} onChange={(e) => setNewGameType(e.target.value as GameType)}>
                {GAME_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Game List */}
      <div className="games-table-wrap">
        <table className="games-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opponent</th>
              <th>Location</th>
              <th>Score</th>
              <th>Result</th>
              <th>Type</th>
              <th>Source</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {sortedGames.map((game) => (
              <tr key={game.id}>
                <td>
                  <input
                    className="games-table-input"
                    type="date"
                    defaultValue={game.date}
                    onBlur={(e) => {
                      if (e.target.value !== game.date) {
                        handleGameUpdate(game.id, { date: e.target.value })
                      }
                    }}
                  />
                </td>
                <td>{opponentDisplay(game)}</td>
                <td>
                  <input
                    className="games-table-input"
                    type="text"
                    defaultValue={game.location}
                    onBlur={(e) => {
                      if (e.target.value !== game.location) {
                        handleGameUpdate(game.id, { location: e.target.value })
                      }
                    }}
                  />
                </td>
                <td>
                  <span className="flex items-center gap-0.5">
                    <input
                      className="games-table-score-input"
                      type="number"
                      min={0}
                      defaultValue={game.teamScore ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value === "" ? null : Number(e.target.value)
                        if (val !== game.teamScore) {
                          const opp = game.opponentScore
                          const bothSet = val !== null && opp !== null
                          handleGameUpdate(game.id, {
                            teamScore: val,
                            played: bothSet,
                            result: bothSet ? (val > opp! ? "W" : val < opp! ? "L" : "T") : game.result,
                          })
                        }
                      }}
                    />
                    <span>-</span>
                    <input
                      className="games-table-score-input"
                      type="number"
                      min={0}
                      defaultValue={game.opponentScore ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value === "" ? null : Number(e.target.value)
                        if (val !== game.opponentScore) {
                          const t = game.teamScore
                          const bothSet = t !== null && val !== null
                          handleGameUpdate(game.id, {
                            opponentScore: val,
                            played: bothSet,
                            result: bothSet ? (t! > val ? "W" : t! < val ? "L" : "T") : game.result,
                          })
                        }
                      }}
                    />
                  </span>
                </td>
                <td>
                  <select
                    className="games-table-select"
                    value={game.result ?? ""}
                    onChange={(e) =>
                      handleGameUpdate(game.id, {
                        result: (e.target.value || null) as "W" | "L" | "T" | null,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="W">W</option>
                    <option value="L">L</option>
                    <option value="T">T</option>
                  </select>
                </td>
                <td>
                  <select
                    className="games-table-select"
                    value={game.gameType}
                    onChange={(e) =>
                      handleGameUpdate(game.id, { gameType: e.target.value as GameType })
                    }
                  >
                    {GAME_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className="game-type-badge">{game.source}</span>
                </td>
                <td>
                  {deletingId === game.id ? (
                    <span className="flex gap-1">
                      <button className="games-table-delete" onClick={() => handleDelete(game.id)} title="Confirm delete">
                        <Trash2 size={14} />
                      </button>
                      <button className="games-table-delete" onClick={() => setDeletingId(null)} title="Cancel">
                        <X size={14} />
                      </button>
                    </span>
                  ) : (
                    <button className="games-table-delete" onClick={() => setDeletingId(game.id)} title="Delete game">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
