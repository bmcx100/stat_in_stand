"use client"

import { useState, useCallback } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"
import {
  normalizeDate,
  parseOwhaGames,
  parseMhrGames,
  parseTeamsnapGames,
  matchOpponent,
  findDuplicates,
} from "@/lib/parsers"
import type { DuplicateInfo } from "@/lib/parsers"
import type { Game, GameType, Opponent } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Trash2, X } from "lucide-react"

const GAME_TYPE_OPTIONS = [
  { value: "unlabeled", label: "Unlabeled" },
  { value: "regular", label: "Regular Season" },
  { value: "tournament", label: "Tournament" },
  { value: "exhibition", label: "Exhibition" },
  { value: "playoffs", label: "Playoffs" },
  { value: "playdowns", label: "Playdowns" },
  { value: "provincials", label: "Provincials" },
]

type ImportTab = "teamsnap" | "owha-games" | "mhr-games"

type MhrMatchState = {
  gameIndex: number
  mhrName: string
  matches: Opponent[]
  resolved: boolean
  opponentId?: string
  newOpponent?: Partial<Opponent>
}

function MhrMatchResolver({
  state,
  onResolve,
}: {
  state: MhrMatchState
  onResolve: (opponentId: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {state.matches.map((opp) => (
        <Button
          key={opp.id}
          variant="outline"
          size="sm"
          onClick={() => onResolve(opp.id)}
        >
          {opp.fullName}
        </Button>
      ))}
    </div>
  )
}

function MhrUnmatchedResolver({
  allOpponents,
  onMapExisting,
  onAddNew,
}: {
  allOpponents: Opponent[]
  onMapExisting: (opponentId: string) => void
  onAddNew: () => void
}) {
  const [showPicker, setShowPicker] = useState(false)

  if (showPicker) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1">
          {allOpponents.map((opp) => (
            <Button
              key={opp.id}
              variant="outline"
              size="sm"
              onClick={() => {
                onMapExisting(opp.id)
                setShowPicker(false)
              }}
            >
              {opp.fullName}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowPicker(false)}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
        Map to existing
      </Button>
      <Button variant="outline" size="sm" onClick={onAddNew}>
        Add as new
      </Button>
    </div>
  )
}

export default function AdminGamesPage() {
  const team = useTeamContext()
  const { games, addGames, updateGame, removeGame, loading: gamesLoading } = useSupabaseGames(team.id)
  const { opponents, addOpponents, getById } = useSupabaseOpponents(team.id)

  // Import state
  const [activeTab, setActiveTab] = useState<ImportTab>("teamsnap")
  const [pasteData, setPasteData] = useState("")
  const [owhaGameType, setOwhaGameType] = useState<GameType>("regular")

  // Parse results
  const [parsedGames, setParsedGames] = useState<Game[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([])
  const [matchStates, setMatchStates] = useState<MhrMatchState[]>([])
  const [importStatus, setImportStatus] = useState("")

  // Game list state
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const resetImport = useCallback(() => {
    setParsedGames([])
    setDuplicates([])
    setMatchStates([])
    setImportStatus("")
  }, [])

  const handleTabChange = useCallback((tab: ImportTab) => {
    setActiveTab(tab)
    setPasteData("")
    resetImport()
  }, [resetImport])

  const buildMatchStates = useCallback((parsed: Game[]) => {
    const states: MhrMatchState[] = []
    const seen = new Set<string>()
    parsed.forEach((g, i) => {
      const key = g.opponent.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      const matches = matchOpponent(g.opponent, opponents)
      states.push({
        gameIndex: i,
        mhrName: g.opponent,
        matches,
        resolved: matches.length === 1,
        opponentId: matches.length === 1 ? matches[0].id : undefined,
      })
    })
    return states
  }, [opponents])

  const handleParse = useCallback(() => {
    resetImport()
    if (!pasteData.trim()) return

    let parsed: Game[] = []
    if (activeTab === "teamsnap") {
      parsed = parseTeamsnapGames(pasteData, team.id)
    } else if (activeTab === "owha-games") {
      const owhaName = `${team.organization} ${team.name}`
      parsed = parseOwhaGames(pasteData, team.id, owhaName, owhaGameType)
    } else if (activeTab === "mhr-games") {
      parsed = parseMhrGames(pasteData, team.id)
    }

    setParsedGames(parsed)
    const dupes = findDuplicates(games, parsed)
    setDuplicates(dupes)

    if (activeTab === "teamsnap" || activeTab === "mhr-games") {
      const states = buildMatchStates(parsed)
      setMatchStates(states)
    }

    const dupeCount = dupes.filter((d) => !d.scoreUpdate).length
    const updateCount = dupes.filter((d) => d.scoreUpdate).length
    setImportStatus(
      `Parsed ${parsed.length} games — ${dupeCount} duplicates, ${updateCount} score updates`
    )
  }, [pasteData, activeTab, team, owhaGameType, games, resetImport, buildMatchStates])

  const resolveMatch = useCallback((mhrName: string, opponentId: string) => {
    setMatchStates((prev) =>
      prev.map((s) =>
        s.mhrName === mhrName ? { ...s, resolved: true, opponentId } : s
      )
    )
  }, [])

  const resolveAddNew = useCallback((mhrName: string) => {
    const newOpp: Partial<Opponent> = {
      fullName: mhrName,
      location: "",
      name: mhrName,
      ageGroup: team.age_group,
      level: team.level,
    }
    setMatchStates((prev) =>
      prev.map((s) =>
        s.mhrName === mhrName ? { ...s, resolved: true, newOpponent: newOpp } : s
      )
    )
  }, [team])

  const handleConfirm = useCallback(async () => {
    // For game imports: add new opponents first
    const newOpps = matchStates.filter((s) => s.newOpponent).map((s) => s.newOpponent!)
    if (newOpps.length > 0) {
      await addOpponents(newOpps)
    }

    // Apply opponent IDs to parsed games
    const resolvedGames = parsedGames.map((g) => {
      const state = matchStates.find(
        (s) => s.mhrName.toLowerCase() === g.opponent.toLowerCase()
      )
      if (state?.opponentId) {
        return { ...g, opponentId: state.opponentId }
      }
      return g
    })

    // Separate duplicates, score updates, and new games
    const dupeIndices = new Set(duplicates.filter((d) => !d.scoreUpdate).map((d) => d.index))
    const scoreUpdates = duplicates.filter((d) => d.scoreUpdate)

    // Second-pass duplicate check using resolved opponentId + date
    // catches cases where name-based matching at parse time missed a mapped opponent
    const existingByDateAndOpp = new Map<string, Game>()
    for (const g of games) {
      if (g.opponentId) existingByDateAndOpp.set(`${g.date}|${g.opponentId}`, g)
    }
    resolvedGames.forEach((g, i) => {
      if (dupeIndices.has(i) || scoreUpdates.some((u) => u.index === i)) return
      if (!g.opponentId) return
      const key = `${normalizeDate(g.date)}|${g.opponentId}`
      if (existingByDateAndOpp.has(key)) dupeIndices.add(i)
    })

    const nonDupes = resolvedGames.filter((_, i) => !dupeIndices.has(i) && !scoreUpdates.some((u) => u.index === i))

    // Apply score updates, and update gameType on any duplicate from OWHA
    for (const update of scoreUpdates) {
      const incoming = resolvedGames[update.index]
      const updates: Partial<Game> = {
        teamScore: incoming.teamScore,
        opponentScore: incoming.opponentScore,
        result: incoming.result,
        played: true,
      }
      if (incoming.source === "owha" && incoming.gameType !== update.existingGame.gameType) {
        updates.gameType = incoming.gameType
      }
      await updateGame(update.existingGame.id, updates)
    }

    // Update gameType on pure duplicates when incoming is from OWHA
    for (const dupe of duplicates.filter((d) => !d.scoreUpdate && dupeIndices.has(d.index))) {
      const incoming = resolvedGames[dupe.index]
      if (incoming.source === "owha" && incoming.gameType !== dupe.existingGame.gameType) {
        await updateGame(dupe.existingGame.id, { gameType: incoming.gameType })
      }
    }

    // Also update gameType for second-pass dupes (opponentId-based)
    resolvedGames.forEach((incoming, i) => {
      if (!dupeIndices.has(i)) return
      if (duplicates.some((d) => d.index === i)) return // already handled above
      if (incoming.source !== "owha") return
      const key = `${normalizeDate(incoming.date)}|${incoming.opponentId}`
      const existing = existingByDateAndOpp.get(key)
      if (existing && incoming.gameType !== existing.gameType) {
        updateGame(existing.id, { gameType: incoming.gameType })
      }
    })

    // Add new games
    if (nonDupes.length > 0) {
      await addGames(nonDupes)
    }

    setImportStatus(
      `Imported ${nonDupes.length} games, updated ${scoreUpdates.length} scores`
    )
    setPasteData("")
    resetImport()
  }, [
    activeTab, parsedGames,
    duplicates, matchStates, games, addOpponents, addGames, updateGame, resetImport,
  ])

  const handleGameUpdate = useCallback(async (gameId: string, updates: Partial<Game>) => {
    await updateGame(gameId, updates)
  }, [updateGame])

  const handleDelete = useCallback(async (gameId: string) => {
    await removeGame(gameId)
    setDeletingId(null)
  }, [removeGame])

  const sortedGames = [...games].sort((a, b) => b.date.localeCompare(a.date))

  const tabs: { key: ImportTab; label: string }[] = [
    { key: "teamsnap", label: "TeamSnap" },
    { key: "owha-games", label: "OWHA" },
    { key: "mhr-games", label: "MHR" },
  ]

  const showGameType = activeTab === "owha-games"
  const showMatchUI = (activeTab === "teamsnap" || activeTab === "mhr-games") && matchStates.length > 0
  const hasParsedData = parsedGames.length > 0

  if (gamesLoading) {
    return <p className="text-muted-foreground">Loading...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="admin-section-title">Games</h1>
      </div>

      {/* Import Section */}
      <div className="import-section">
        <div className="import-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className="import-tab"
              data-active={activeTab === tab.key}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {showGameType && (
          <div className="game-form-field">
            <label className="game-form-label">Game Type</label>
            <select
              className="game-form-select"
              value={owhaGameType}
              onChange={(e) => setOwhaGameType(e.target.value as GameType)}
            >
              {GAME_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        <textarea
          className="import-textarea"
          value={pasteData}
          onChange={(e) => setPasteData(e.target.value)}
          placeholder="Paste data here..."
          rows={8}
        />

        <div className="flex gap-2">
          <Button onClick={handleParse}>Parse</Button>
          {hasParsedData && (
            <Button onClick={handleConfirm} className="btn-import">
              Confirm Import
            </Button>
          )}
        </div>

        {importStatus && (
          <p className="text-sm text-muted-foreground">{importStatus}</p>
        )}

        {/* Opponent matching UI */}
        {showMatchUI && (
          <div className="import-preview">
            <p className="text-sm font-medium">Opponent Matching</p>
            {matchStates.map((state) => (
              <div key={state.mhrName} className="flex flex-col gap-1 py-1">
                <span className="text-sm">
                  <strong>{state.mhrName}</strong>
                  {state.resolved && state.opponentId && (
                    <span className="text-green-600"> — matched</span>
                  )}
                  {state.resolved && state.newOpponent && (
                    <span className="text-blue-600"> — will add as new</span>
                  )}
                </span>
                {!state.resolved && state.matches.length > 1 && (
                  <MhrMatchResolver
                    state={state}
                    onResolve={(id) => resolveMatch(state.mhrName, id)}
                  />
                )}
                {!state.resolved && state.matches.length === 0 && (
                  <MhrUnmatchedResolver
                    allOpponents={opponents}
                    onMapExisting={(id) => resolveMatch(state.mhrName, id)}
                    onAddNew={() => resolveAddNew(state.mhrName)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Game preview */}
        {parsedGames.length > 0 && (
          <div className="import-preview">
            <p className="text-sm font-medium">
              {parsedGames.length} games parsed
            </p>
            {parsedGames.map((g, i) => {
              const dupe = duplicates.find((d) => d.index === i)
              const isDupe = dupe && !dupe.scoreUpdate
              const isScoreUpdate = dupe?.scoreUpdate
              return (
                <div
                  key={i}
                  className="text-sm"
                  style={{
                    textDecoration: isDupe ? "line-through" : undefined,
                    color: isScoreUpdate ? "var(--color-green-600)" : undefined,
                  }}
                >
                  {g.date} — {g.opponent}
                  {g.played && ` (${g.teamScore}-${g.opponentScore})`}
                  {isDupe && " [duplicate]"}
                  {isScoreUpdate && " [score update]"}
                </div>
              )
            })}
          </div>
        )}


      </div>

      {/* Game List Section */}
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
                          const team = game.teamScore
                          const bothSet = team !== null && val !== null
                          handleGameUpdate(game.id, {
                            opponentScore: val,
                            played: bothSet,
                            result: bothSet ? (team! > val ? "W" : team! < val ? "L" : "T") : game.result,
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
                      handleGameUpdate(game.id, {
                        gameType: e.target.value as GameType,
                      })
                    }
                  >
                    {GAME_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className="game-type-badge">{game.source}</span>
                </td>
                <td>
                  {deletingId === game.id ? (
                    <span className="flex gap-1">
                      <button
                        className="games-table-delete"
                        onClick={() => handleDelete(game.id)}
                        title="Confirm delete"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        className="games-table-delete"
                        onClick={() => setDeletingId(null)}
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ) : (
                    <button
                      className="games-table-delete"
                      onClick={() => setDeletingId(game.id)}
                      title="Delete game"
                    >
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
