"use client"

import { useState, useMemo } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import { computePlaydownStandings } from "@/lib/playdowns"
import { computePoolStandings } from "@/lib/tournaments"
import { parsePlaydownGames } from "@/lib/parsers"
import type {
  PlaydownConfig,
  PlaydownGame,
  PlaydownTeam,
  TournamentConfig,
  TournamentGame,
  TournamentTeam,
  TournamentPool,
  TiebreakerKey,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, X } from "lucide-react"

const ALL_TIEBREAKER_KEYS: { key: TiebreakerKey; label: string }[] = [
  { key: "wins", label: "Number of Wins" },
  { key: "head-to-head", label: "Head-to-Head Record" },
  { key: "goal-differential", label: "Goal Differential" },
  { key: "goals-allowed", label: "Fewest Goals Allowed" },
  { key: "goals-for", label: "Most Goals For" },
]

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ─── Playdowns Section ──────────────────────────────────────────────

function PlaydownsSection() {
  const team = useTeamContext()
  const {
    playdown, setConfig, setGames, addGame, updateGame,
    removeGame, clearPlaydown, loading,
  } = useSupabasePlaydowns(team.id)

  const [totalTeams, setTotalTeams] = useState(0)
  const [qualifyingSpots, setQualifyingSpots] = useState(0)
  const [gamesPerMatchup, setGamesPerMatchup] = useState(1)
  const [standingsText, setStandingsText] = useState("")
  const [importText, setImportText] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)

  // Game form
  const [newDate, setNewDate] = useState("")
  const [newTime, setNewTime] = useState("")
  const [newHome, setNewHome] = useState("")
  const [newAway, setNewAway] = useState("")
  const [newLocation, setNewLocation] = useState("")

  // Sync config fields when playdown loads
  const config = playdown?.config
  const games = playdown?.games ?? []

  // Initialize form from existing config
  useState(() => {
    if (config) {
      setTotalTeams(config.totalTeams)
      setQualifyingSpots(config.qualifyingSpots)
      setGamesPerMatchup(config.gamesPerMatchup)
    }
  })

  const standings = useMemo(() => {
    if (!config) return []
    return computePlaydownStandings(config, games)
  }, [config, games])

  const teamMap = useMemo(() => {
    const m = new Map<string, string>()
    if (config) {
      for (const t of config.teams) m.set(t.id, t.name)
    }
    return m
  }, [config])

  async function handleSaveConfig() {
    const teams = config?.teams ?? []
    const newConfig: PlaydownConfig = {
      teamId: team.id,
      totalTeams,
      qualifyingSpots,
      gamesPerMatchup,
      teams,
    }
    await setConfig(newConfig)
  }

  async function handleImportStandings() {
    const lines = standingsText.trim().split("\n").filter(Boolean)
    const teams: PlaydownTeam[] = []
    const syntheticGames: PlaydownGame[] = []

    for (const line of lines) {
      const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean)
      if (parts.length < 4) continue

      const name = parts[0]
      const w = parseInt(parts[1], 10) || 0
      const l = parseInt(parts[2], 10) || 0
      const t = parseInt(parts[3], 10) || 0

      const teamId = generateId("pd-t")
      teams.push({ id: teamId, name })

      // Create synthetic games for wins
      for (let i = 0; i < w; i++) {
        syntheticGames.push({
          id: generateId("pd-g"),
          teamId: team.id,
          date: "",
          time: "",
          homeTeam: teamId,
          awayTeam: "synthetic-opp",
          homeScore: 1,
          awayScore: 0,
          location: "",
          played: true,
        })
      }
      // Losses
      for (let i = 0; i < l; i++) {
        syntheticGames.push({
          id: generateId("pd-g"),
          teamId: team.id,
          date: "",
          time: "",
          homeTeam: teamId,
          awayTeam: "synthetic-opp",
          homeScore: 0,
          awayScore: 1,
          location: "",
          played: true,
        })
      }
      // Ties
      for (let i = 0; i < t; i++) {
        syntheticGames.push({
          id: generateId("pd-g"),
          teamId: team.id,
          date: "",
          time: "",
          homeTeam: teamId,
          awayTeam: "synthetic-opp",
          homeScore: 0,
          awayScore: 0,
          location: "",
          played: true,
        })
      }
    }

    const newConfig: PlaydownConfig = {
      teamId: team.id,
      totalTeams: teams.length,
      qualifyingSpots: qualifyingSpots || Math.ceil(teams.length / 2),
      gamesPerMatchup: gamesPerMatchup || 1,
      teams,
    }
    await setConfig(newConfig)
    await setGames(syntheticGames)
    setStandingsText("")
    setTotalTeams(newConfig.totalTeams)
    setQualifyingSpots(newConfig.qualifyingSpots)
  }

  async function handleImportGames() {
    const { games: parsed, teamNames } = parsePlaydownGames(importText, team.id)
    if (parsed.length === 0) return

    const existingTeams = config?.teams ?? []
    const existingMap = new Map<string, string>()
    for (const t of existingTeams) existingMap.set(t.name.toLowerCase(), t.id)

    // Auto-detect "self" team by matching team.organization
    const selfName = teamNames.find(
      (n) => n.toLowerCase().includes(team.organization.toLowerCase())
    )

    // Build team name to ID map
    const nameToId = new Map<string, string>()
    for (const name of teamNames) {
      const existing = existingMap.get(name.toLowerCase())
      if (existing) {
        nameToId.set(name, existing)
      } else {
        const id = generateId("pd-t")
        nameToId.set(name, id)
      }
    }

    // Build adjacency graph to find connected teams
    const adjacency = new Map<string, Set<string>>()
    for (const g of parsed) {
      if (!adjacency.has(g.homeTeam)) adjacency.set(g.homeTeam, new Set())
      if (!adjacency.has(g.awayTeam)) adjacency.set(g.awayTeam, new Set())
      adjacency.get(g.homeTeam)!.add(g.awayTeam)
      adjacency.get(g.awayTeam)!.add(g.homeTeam)
    }

    // BFS to find all connected teams starting from self or first team
    const startName = selfName ?? teamNames[0]
    const connected = new Set<string>()
    if (startName) {
      const queue = [startName]
      connected.add(startName)
      while (queue.length > 0) {
        const current = queue.shift()!
        const neighbors = adjacency.get(current)
        if (neighbors) {
          for (const n of neighbors) {
            if (!connected.has(n)) {
              connected.add(n)
              queue.push(n)
            }
          }
        }
      }
    }

    // Build new teams array
    const newTeams: PlaydownTeam[] = [...existingTeams]
    for (const name of connected) {
      if (!existingMap.has(name.toLowerCase())) {
        newTeams.push({ id: nameToId.get(name)!, name })
      }
    }

    // Map games to team IDs and deduplicate
    const existingGameIds = new Set(games.map((g) => `${g.date}-${g.homeTeam}-${g.awayTeam}`))
    const mappedGames: PlaydownGame[] = []

    for (const g of parsed) {
      const homeId = nameToId.get(g.homeTeam) ?? g.homeTeam
      const awayId = nameToId.get(g.awayTeam) ?? g.awayTeam
      const dedupKey = `${g.date}-${homeId}-${awayId}`
      if (existingGameIds.has(dedupKey)) continue
      existingGameIds.add(dedupKey)

      mappedGames.push({
        ...g,
        homeTeam: homeId,
        awayTeam: awayId,
      })
    }

    const updatedConfig: PlaydownConfig = {
      teamId: team.id,
      totalTeams: newTeams.length,
      qualifyingSpots: config?.qualifyingSpots ?? Math.ceil(newTeams.length / 2),
      gamesPerMatchup: config?.gamesPerMatchup ?? 1,
      teams: newTeams,
    }
    await setConfig(updatedConfig)
    await setGames([...games, ...mappedGames])
    setImportText("")
    setTotalTeams(updatedConfig.totalTeams)
  }

  async function handleAddGame() {
    if (!newHome || !newAway) return
    const game: PlaydownGame = {
      id: generateId("pd-g"),
      teamId: team.id,
      date: newDate,
      time: newTime,
      homeTeam: newHome,
      awayTeam: newAway,
      homeScore: null,
      awayScore: null,
      location: newLocation,
      played: false,
    }
    await addGame(game)
    setNewDate("")
    setNewTime("")
    setNewHome("")
    setNewAway("")
    setNewLocation("")
  }

  async function handleScoreChange(
    gameId: string,
    field: "homeScore" | "awayScore",
    value: string
  ) {
    const score = value === "" ? null : parseInt(value, 10)
    const game = games.find((g) => g.id === gameId)
    if (!game) return
    const updates: Partial<PlaydownGame> = { [field]: score }
    const otherField = field === "homeScore" ? "awayScore" : "homeScore"
    const otherScore = game[otherField]
    updates.played = score !== null && otherScore !== null
    await updateGame(gameId, updates)
  }

  async function handleClear() {
    await clearPlaydown()
    setConfirmClear(false)
    setTotalTeams(0)
    setQualifyingSpots(0)
    setGamesPerMatchup(1)
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>

  return (
    <section className="flex flex-col gap-4">
      <h2 className="admin-section-title">Playdowns</h2>

      {/* Config */}
      <div className="playdown-config-row">
        <div className="playdown-config-field">
          <label className="game-form-label">Total Teams</label>
          <input
            type="number"
            className="playdown-config-input"
            value={totalTeams}
            onChange={(e) => setTotalTeams(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="playdown-config-field">
          <label className="game-form-label">Qualifying Spots</label>
          <input
            type="number"
            className="playdown-config-input"
            value={qualifyingSpots}
            onChange={(e) => setQualifyingSpots(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="playdown-config-field">
          <label className="game-form-label">Games per Matchup</label>
          <input
            type="number"
            className="playdown-config-input"
            value={gamesPerMatchup}
            onChange={(e) => setGamesPerMatchup(parseInt(e.target.value, 10) || 1)}
          />
        </div>
      </div>
      <Button onClick={handleSaveConfig}>Save Config</Button>

      {/* Import Standings */}
      <div className="import-section">
        <h3 className="dashboard-record-label">Import Standings</h3>
        <textarea
          className="import-textarea"
          placeholder="Paste tab-separated standings (Team W L T)"
          value={standingsText}
          onChange={(e) => setStandingsText(e.target.value)}
          rows={6}
        />
        <Button onClick={handleImportStandings} disabled={!standingsText.trim()} className="btn-import">
          Import Standings
        </Button>
      </div>

      {/* Import Games */}
      <div className="import-section">
        <h3 className="dashboard-record-label">Import Games</h3>
        <textarea
          className="import-textarea"
          placeholder="Paste game data (tab-separated)"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={6}
        />
        <Button onClick={handleImportGames} disabled={!importText.trim()} className="btn-import">
          Import Games
        </Button>
      </div>

      {/* Add Game */}
      <div className="import-section">
        <h3 className="dashboard-record-label">Add Game</h3>
        <div className="playdown-config-row">
          <div className="game-form-field">
            <label className="game-form-label">Date</label>
            <input
              type="date"
              className="game-form-input"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="game-form-field">
            <label className="game-form-label">Time</label>
            <input
              type="time"
              className="game-form-input"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
          </div>
        </div>
        <div className="playdown-config-row">
          <div className="game-form-field">
            <label className="game-form-label">Home Team</label>
            {config && config.teams.length > 0 ? (
              <select
                className="game-form-select"
                value={newHome}
                onChange={(e) => setNewHome(e.target.value)}
              >
                <option value="">Select...</option>
                {config.teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <input
                className="game-form-input"
                value={newHome}
                onChange={(e) => setNewHome(e.target.value)}
                placeholder="Home team"
              />
            )}
          </div>
          <div className="game-form-field">
            <label className="game-form-label">Away Team</label>
            {config && config.teams.length > 0 ? (
              <select
                className="game-form-select"
                value={newAway}
                onChange={(e) => setNewAway(e.target.value)}
              >
                <option value="">Select...</option>
                {config.teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <input
                className="game-form-input"
                value={newAway}
                onChange={(e) => setNewAway(e.target.value)}
                placeholder="Away team"
              />
            )}
          </div>
        </div>
        <div className="game-form-field">
          <label className="game-form-label">Location</label>
          <input
            className="game-form-input"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Arena name"
          />
        </div>
        <Button onClick={handleAddGame} disabled={!newHome || !newAway}>
          <Plus className="h-4 w-4" /> Add Game
        </Button>
      </div>

      {/* Game List */}
      {games.length > 0 && (
        <div className="games-table-wrap">
          <table className="games-table">
            <thead>
              <tr>
                <th>Home</th>
                <th>Away</th>
                <th>Date</th>
                <th>Time</th>
                <th>H</th>
                <th>A</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>{teamMap.get(g.homeTeam) ?? g.homeTeam}</td>
                  <td>{teamMap.get(g.awayTeam) ?? g.awayTeam}</td>
                  <td>{g.date}</td>
                  <td>{g.time}</td>
                  <td>
                    <input
                      type="number"
                      className="games-table-input"
                      value={g.homeScore ?? ""}
                      onChange={(e) => handleScoreChange(g.id, "homeScore", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="games-table-input"
                      value={g.awayScore ?? ""}
                      onChange={(e) => handleScoreChange(g.id, "awayScore", e.target.value)}
                    />
                  </td>
                  <td>
                    <button className="games-table-delete" onClick={() => removeGame(g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Standings Preview */}
      {standings.length > 0 && (
        <div>
          <h3 className="dashboard-record-label">Standings Preview</h3>
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>GP</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>Pts</th>
                <th>GF</th>
                <th>GA</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr
                  key={row.teamId}
                  className={`standings-row${i < (config?.qualifyingSpots ?? 0) ? " playdown-cutoff" : ""}`}
                >
                  <td>{i + 1}</td>
                  <td>{row.teamName}</td>
                  <td>{row.gp}</td>
                  <td>{row.w}</td>
                  <td>{row.l}</td>
                  <td>{row.t}</td>
                  <td>{row.pts}</td>
                  <td>{row.gf}</td>
                  <td>{row.ga}</td>
                  <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Clear */}
      {playdown && (
        <div>
          {confirmClear ? (
            <div className="playdown-config-row">
              <span className="text-destructive">Clear all playdown data?</span>
              <Button variant="destructive" onClick={handleClear}>Confirm</Button>
              <Button variant="outline" onClick={() => setConfirmClear(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-4 w-4" /> Clear Playdown
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Tournaments Section ────────────────────────────────────────────

type TournamentView = "list" | "setup" | "games"

function TournamentsSection() {
  const team = useTeamContext()
  const {
    tournaments, addTournament, updateConfig, setGames,
    addGame, updateGame, removeGame, removeTournament,
    getTournament, loading,
  } = useSupabaseTournaments(team.id)

  const [view, setView] = useState<TournamentView>("list")
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleNew() {
    const id = generateId("trn")
    const config: TournamentConfig = {
      id,
      teamId: team.id,
      name: "",
      location: "",
      startDate: "",
      endDate: "",
      pools: [],
      teams: [],
      gamesPerMatchup: 1,
      tiebreakerOrder: ["wins", "head-to-head", "goal-differential", "goals-allowed", "goals-for"],
      eliminationEnabled: false,
      consolationEnabled: false,
    }
    addTournament(config)
    setEditingId(id)
    setView("setup")
  }

  function handleEdit(id: string) {
    setEditingId(id)
    setView("setup")
  }

  function handleGames(id: string) {
    setEditingId(id)
    setView("games")
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tournament?")) return
    await removeTournament(id)
    if (editingId === id) {
      setEditingId(null)
      setView("list")
    }
  }

  function handleBack() {
    setEditingId(null)
    setView("list")
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>

  return (
    <section className="flex flex-col gap-4">
      <div className="playdown-title-row">
        <h2 className="admin-section-title">Tournaments</h2>
        {view === "list" && (
          <Button onClick={handleNew}>
            <Plus className="h-4 w-4" /> New Tournament
          </Button>
        )}
        {view !== "list" && (
          <Button variant="outline" onClick={handleBack}>
            <X className="h-4 w-4" /> Back to List
          </Button>
        )}
      </div>

      {view === "list" && (
        <TournamentListView
          tournaments={tournaments}
          onEdit={handleEdit}
          onGames={handleGames}
          onDelete={handleDelete}
        />
      )}
      {view === "setup" && editingId && (
        <TournamentSetupView
          tournamentId={editingId}
          getTournament={getTournament}
          updateConfig={updateConfig}
          onGames={() => setView("games")}
        />
      )}
      {view === "games" && editingId && (
        <TournamentGamesView
          tournamentId={editingId}
          getTournament={getTournament}
          updateConfig={updateConfig}
          setGames={setGames}
          addGame={addGame}
          updateGame={updateGame}
          removeGame={removeGame}
        />
      )}
    </section>
  )
}

// ─── Tournament List ─────────────────────────────────────────────────

function TournamentListView({
  tournaments,
  onEdit,
  onGames,
  onDelete,
}: {
  tournaments: { config: TournamentConfig; games: TournamentGame[] }[]
  onEdit: (id: string) => void
  onGames: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (tournaments.length === 0) {
    return <p className="text-muted-foreground">No tournaments yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {tournaments.map((t) => (
        <div key={t.config.id} className="playdown-config-row">
          <div className="flex-1">
            <strong>{t.config.name || "Unnamed"}</strong>
            {t.config.location && <span className="text-muted-foreground"> — {t.config.location}</span>}
            <div className="text-muted-foreground text-sm">
              {t.config.startDate && t.config.endDate
                ? `${t.config.startDate} to ${t.config.endDate}`
                : "No dates set"}
              {" | "}
              {t.config.teams.length} teams, {t.config.pools.length} pools, {t.games.length} games
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onEdit(t.config.id)}>Edit</Button>
          <Button variant="outline" size="sm" onClick={() => onGames(t.config.id)}>Games</Button>
          <Button variant="destructive" size="sm" onClick={() => onDelete(t.config.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}

// ─── Tournament Setup ────────────────────────────────────────────────

function TournamentSetupView({
  tournamentId,
  getTournament,
  updateConfig,
  onGames,
}: {
  tournamentId: string
  getTournament: (id: string) => { config: TournamentConfig; games: TournamentGame[] } | null
  updateConfig: (id: string, config: TournamentConfig) => Promise<void>
  onGames: () => void
}) {
  const tournament = getTournament(tournamentId)
  const config = tournament?.config

  const [name, setName] = useState(config?.name ?? "")
  const [location, setLocation] = useState(config?.location ?? "")
  const [startDate, setStartDate] = useState(config?.startDate ?? "")
  const [endDate, setEndDate] = useState(config?.endDate ?? "")
  const [gamesPerMatchup, setGamesPerMatchup] = useState(config?.gamesPerMatchup ?? 1)
  const [eliminationEnabled, setEliminationEnabled] = useState(config?.eliminationEnabled ?? false)
  const [consolationEnabled, setConsolationEnabled] = useState(config?.consolationEnabled ?? false)
  const [pools, setPools] = useState<TournamentPool[]>(config?.pools ?? [])
  const [teams, setTeams] = useState<TournamentTeam[]>(config?.teams ?? [])
  const [tiebreakerOrder, setTiebreakerOrder] = useState<TiebreakerKey[]>(
    config?.tiebreakerOrder ?? ["wins", "head-to-head", "goal-differential", "goals-allowed", "goals-for"]
  )

  // New team form
  const [newTeamName, setNewTeamName] = useState("")
  const [newTeamPool, setNewTeamPool] = useState("")

  if (!config) return <p className="text-muted-foreground">Tournament not found.</p>

  async function handleSave() {
    if (!config) return
    const updated: TournamentConfig = {
      ...config,
      name,
      location,
      startDate,
      endDate,
      gamesPerMatchup,
      eliminationEnabled,
      consolationEnabled,
      pools: pools.map((p) => ({
        ...p,
        teamIds: teams.filter((t) => t.poolId === p.id).map((t) => t.id),
      })),
      teams,
      tiebreakerOrder,
    }
    await updateConfig(tournamentId, updated)
  }

  function handleAddPool() {
    const id = generateId("pool")
    const poolName = `Pool ${String.fromCharCode(65 + pools.length)}`
    setPools([...pools, { id, name: poolName, teamIds: [], qualifyingSpots: 1 }])
  }

  function handleRemovePool(poolId: string) {
    setPools(pools.filter((p) => p.id !== poolId))
    setTeams(teams.filter((t) => t.poolId !== poolId))
  }

  function handlePoolQualifying(poolId: string, spots: number) {
    setPools(pools.map((p) => p.id === poolId ? { ...p, qualifyingSpots: spots } : p))
  }

  function handleAddTeam() {
    if (!newTeamName || !newTeamPool) return
    const id = generateId("trn-t")
    setTeams([...teams, { id, name: newTeamName, poolId: newTeamPool }])
    setNewTeamName("")
  }

  function handleRemoveTeam(teamId: string) {
    setTeams(teams.filter((t) => t.id !== teamId))
  }

  function moveTiebreaker(index: number, direction: -1 | 1) {
    const newOrder = [...tiebreakerOrder]
    const target = index + direction
    if (target < 0 || target >= newOrder.length) return
    ;[newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]
    setTiebreakerOrder(newOrder)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="playdown-config-row">
        <div className="game-form-field">
          <label className="game-form-label">Name</label>
          <input
            className="game-form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tournament name"
          />
        </div>
        <div className="game-form-field">
          <label className="game-form-label">Location</label>
          <input
            className="game-form-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City or arena"
          />
        </div>
      </div>

      <div className="playdown-config-row">
        <div className="game-form-field">
          <label className="game-form-label">Start Date</label>
          <input
            type="date"
            className="game-form-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="game-form-field">
          <label className="game-form-label">End Date</label>
          <input
            type="date"
            className="game-form-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="game-form-field">
          <label className="game-form-label">Games per Matchup</label>
          <input
            type="number"
            className="playdown-config-input"
            value={gamesPerMatchup}
            onChange={(e) => setGamesPerMatchup(parseInt(e.target.value, 10) || 1)}
          />
        </div>
      </div>

      <div className="playdown-config-row">
        <label className="game-form-label">
          <input
            type="checkbox"
            checked={eliminationEnabled}
            onChange={(e) => setEliminationEnabled(e.target.checked)}
          />
          {" "}Elimination Round
        </label>
        <label className="game-form-label">
          <input
            type="checkbox"
            checked={consolationEnabled}
            onChange={(e) => setConsolationEnabled(e.target.checked)}
          />
          {" "}Consolation Bracket
        </label>
      </div>

      {/* Pools */}
      <div className="import-section">
        <h3 className="dashboard-record-label">Pools</h3>
        {pools.map((pool) => (
          <div key={pool.id} className="playdown-config-row">
            <strong>{pool.name}</strong>
            <div className="playdown-config-field">
              <label className="game-form-label">Qualifying Spots</label>
              <input
                type="number"
                className="playdown-config-input"
                value={pool.qualifyingSpots}
                onChange={(e) => handlePoolQualifying(pool.id, parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <span className="text-muted-foreground text-sm">
              {teams.filter((t) => t.poolId === pool.id).length} teams
            </span>
            <button className="games-table-delete" onClick={() => handleRemovePool(pool.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="outline" onClick={handleAddPool}>
          <Plus className="h-4 w-4" /> Add Pool
        </Button>
      </div>

      {/* Teams */}
      <div className="import-section">
        <h3 className="dashboard-record-label">Teams</h3>
        {pools.map((pool) => {
          const poolTeams = teams.filter((t) => t.poolId === pool.id)
          if (poolTeams.length === 0) return null
          return (
            <div key={pool.id} className="flex flex-col gap-1">
              <span className="text-muted-foreground text-sm">{pool.name}</span>
              {poolTeams.map((t) => (
                <div key={t.id} className="playdown-config-row">
                  <span>{t.name}</span>
                  <button className="games-table-delete" onClick={() => handleRemoveTeam(t.id)}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )
        })}
        <div className="playdown-config-row">
          <input
            className="game-form-input"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name"
          />
          <select
            className="game-form-select"
            value={newTeamPool}
            onChange={(e) => setNewTeamPool(e.target.value)}
          >
            <option value="">Pool...</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Button variant="outline" onClick={handleAddTeam} disabled={!newTeamName || !newTeamPool}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* Tiebreaker Order */}
      <div className="import-section">
        <h3 className="dashboard-record-label">Tiebreaker Order</h3>
        {tiebreakerOrder.map((key, idx) => {
          const info = ALL_TIEBREAKER_KEYS.find((k) => k.key === key)
          return (
            <div key={key} className="playdown-config-row">
              <span className="text-sm">{idx + 1}. {info?.label ?? key}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => moveTiebreaker(idx, -1)}
                disabled={idx === 0}
              >
                Up
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => moveTiebreaker(idx, 1)}
                disabled={idx === tiebreakerOrder.length - 1}
              >
                Down
              </Button>
            </div>
          )
        })}
      </div>

      <div className="playdown-config-row">
        <Button onClick={handleSave}>Save Config</Button>
        <Button variant="outline" onClick={onGames}>Manage Games</Button>
      </div>
    </div>
  )
}

// ─── Tournament Games ────────────────────────────────────────────────

function TournamentGamesView({
  tournamentId,
  getTournament,
  updateConfig,
  setGames,
  addGame,
  updateGame,
  removeGame,
}: {
  tournamentId: string
  getTournament: (id: string) => { config: TournamentConfig; games: TournamentGame[] } | null
  updateConfig: (id: string, config: TournamentConfig) => Promise<void>
  setGames: (id: string, games: TournamentGame[]) => Promise<void>
  addGame: (id: string, game: TournamentGame) => Promise<void>
  updateGame: (id: string, gameId: string, updates: Partial<TournamentGame>) => Promise<void>
  removeGame: (id: string, gameId: string) => Promise<void>
}) {
  const team = useTeamContext()
  const tournament = getTournament(tournamentId)
  const config = tournament?.config
  const games = tournament?.games ?? []

  const [activePool, setActivePool] = useState<string>("")
  const [importTab, setImportTab] = useState<"games" | "standings">("games")
  const [importText, setImportText] = useState("")

  // Game form
  const [newDate, setNewDate] = useState("")
  const [newTime, setNewTime] = useState("")
  const [newHome, setNewHome] = useState("")
  const [newAway, setNewAway] = useState("")
  const [newLocation, setNewLocation] = useState("")
  const [newRound, setNewRound] = useState<TournamentGame["round"]>("pool")

  // Set first pool as active
  useState(() => {
    if (config && config.pools.length > 0 && !activePool) {
      setActivePool(config.pools[0].id)
    }
  })

  const teamMap = useMemo(() => {
    const m = new Map<string, string>()
    if (config) {
      for (const t of config.teams) m.set(t.id, t.name)
    }
    return m
  }, [config])

  const poolStandings = useMemo(() => {
    if (!config || !activePool) return []
    return computePoolStandings(config, games, activePool)
  }, [config, games, activePool])

  if (!config) return <p className="text-muted-foreground">Tournament not found.</p>

  const poolGames = activePool
    ? games.filter((g) => g.poolId === activePool || g.round !== "pool")
    : games

  async function handleAddGame() {
    if (!newHome || !newAway) return
    const game: TournamentGame = {
      id: generateId("trn-g"),
      teamId: team.id,
      tournamentId,
      date: newDate,
      time: newTime,
      homeTeam: newHome,
      awayTeam: newAway,
      homeScore: null,
      awayScore: null,
      location: newLocation,
      played: false,
      round: newRound,
      poolId: newRound === "pool" ? activePool : undefined,
    }
    await addGame(tournamentId, game)
    setNewDate("")
    setNewTime("")
    setNewHome("")
    setNewAway("")
    setNewLocation("")
  }

  async function handleScoreChange(
    gameId: string,
    field: "homeScore" | "awayScore",
    value: string
  ) {
    const score = value === "" ? null : parseInt(value, 10)
    const game = games.find((g) => g.id === gameId)
    if (!game) return
    const updates: Partial<TournamentGame> = { [field]: score }
    const otherField = field === "homeScore" ? "awayScore" : "homeScore"
    const otherScore = game[otherField]
    updates.played = score !== null && otherScore !== null
    await updateGame(tournamentId, gameId, updates)
  }

  async function handleImport() {
    if (importTab === "games") {
      await handleImportGames()
    } else {
      await handleImportStandings()
    }
  }

  async function handleImportGames() {
    const { games: parsed, teamNames } = parsePlaydownGames(importText, team.id)
    if (parsed.length === 0) return

    // Map team names to existing tournament team IDs
    const nameToId = new Map<string, string>()
    for (const t of config!.teams) {
      nameToId.set(t.name.toLowerCase(), t.id)
    }

    // Add unknown teams
    const newTeams = [...config!.teams]
    for (const name of teamNames) {
      if (!nameToId.has(name.toLowerCase())) {
        const id = generateId("trn-t")
        nameToId.set(name.toLowerCase(), id)
        newTeams.push({
          id,
          name,
          poolId: activePool || (config!.pools[0]?.id ?? ""),
        })
      }
    }

    if (newTeams.length !== config!.teams.length) {
      await updateConfig(tournamentId, {
        ...config!,
        teams: newTeams,
        pools: config!.pools.map((p) => ({
          ...p,
          teamIds: newTeams.filter((t) => t.poolId === p.id).map((t) => t.id),
        })),
      })
    }

    const existingKeys = new Set(
      games.map((g) => `${g.date}-${g.homeTeam}-${g.awayTeam}`)
    )

    const mappedGames: TournamentGame[] = parsed.map((g) => ({
      id: generateId("trn-g"),
      teamId: team.id,
      tournamentId,
      date: g.date,
      time: g.time,
      homeTeam: nameToId.get(g.homeTeam.toLowerCase()) ?? g.homeTeam,
      awayTeam: nameToId.get(g.awayTeam.toLowerCase()) ?? g.awayTeam,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      location: g.location,
      played: g.played,
      round: "pool" as const,
      poolId: activePool || undefined,
    })).filter((g) => {
      const key = `${g.date}-${g.homeTeam}-${g.awayTeam}`
      if (existingKeys.has(key)) return false
      existingKeys.add(key)
      return true
    })

    await setGames(tournamentId, [...games, ...mappedGames])
    setImportText("")
  }

  async function handleImportStandings() {
    const lines = importText.trim().split("\n").filter(Boolean)
    const newTeams = [...config!.teams]
    const nameToId = new Map<string, string>()
    for (const t of config!.teams) {
      nameToId.set(t.name.toLowerCase(), t.id)
    }

    for (const line of lines) {
      const parts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean)
      if (parts.length === 0) continue
      const name = parts[0]
      if (nameToId.has(name.toLowerCase())) continue
      const id = generateId("trn-t")
      nameToId.set(name.toLowerCase(), id)
      newTeams.push({
        id,
        name,
        poolId: activePool || (config!.pools[0]?.id ?? ""),
      })
    }

    if (newTeams.length !== config!.teams.length) {
      await updateConfig(tournamentId, {
        ...config!,
        teams: newTeams,
        pools: config!.pools.map((p) => ({
          ...p,
          teamIds: newTeams.filter((t) => t.poolId === p.id).map((t) => t.id),
        })),
      })
    }

    setImportText("")
  }

  const roundOptions: { value: TournamentGame["round"]; label: string }[] = [
    { value: "pool", label: "Pool Play" },
    { value: "semifinal", label: "Semifinal" },
    { value: "final", label: "Final" },
    { value: "consolation", label: "Consolation" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h3 className="dashboard-record-label">{config.name || "Tournament"} — Games</h3>

      {/* Pool Tabs */}
      {config.pools.length > 1 && (
        <div className="import-tabs">
          {config.pools.map((pool) => (
            <button
              key={pool.id}
              className="import-tab"
              data-active={activePool === pool.id || undefined}
              onClick={() => setActivePool(pool.id)}
            >
              {pool.name}
            </button>
          ))}
        </div>
      )}

      {/* Add Game Form */}
      <div className="import-section">
        <h3 className="dashboard-record-label">Add Game</h3>
        <div className="playdown-config-row">
          <div className="game-form-field">
            <label className="game-form-label">Date</label>
            <input
              type="date"
              className="game-form-input"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="game-form-field">
            <label className="game-form-label">Time</label>
            <input
              type="time"
              className="game-form-input"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
          </div>
          <div className="game-form-field">
            <label className="game-form-label">Round</label>
            <select
              className="game-form-select"
              value={newRound}
              onChange={(e) => setNewRound(e.target.value as TournamentGame["round"])}
            >
              {roundOptions.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="playdown-config-row">
          <div className="game-form-field">
            <label className="game-form-label">Home Team</label>
            <select
              className="game-form-select"
              value={newHome}
              onChange={(e) => setNewHome(e.target.value)}
            >
              <option value="">Select...</option>
              {config.teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="game-form-field">
            <label className="game-form-label">Away Team</label>
            <select
              className="game-form-select"
              value={newAway}
              onChange={(e) => setNewAway(e.target.value)}
            >
              <option value="">Select...</option>
              {config.teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="game-form-field">
          <label className="game-form-label">Location</label>
          <input
            className="game-form-input"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Arena name"
          />
        </div>
        <Button onClick={handleAddGame} disabled={!newHome || !newAway}>
          <Plus className="h-4 w-4" /> Add Game
        </Button>
      </div>

      {/* Game List */}
      {poolGames.length > 0 && (
        <div className="games-table-wrap">
          <table className="games-table">
            <thead>
              <tr>
                <th>Home</th>
                <th>Away</th>
                <th>Date</th>
                <th>Round</th>
                <th>H</th>
                <th>A</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {poolGames.map((g) => (
                <tr key={g.id}>
                  <td>{teamMap.get(g.homeTeam) ?? g.homeTeam}</td>
                  <td>{teamMap.get(g.awayTeam) ?? g.awayTeam}</td>
                  <td>{g.date}</td>
                  <td>{g.round}</td>
                  <td>
                    <input
                      type="number"
                      className="games-table-input"
                      value={g.homeScore ?? ""}
                      onChange={(e) => handleScoreChange(g.id, "homeScore", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="games-table-input"
                      value={g.awayScore ?? ""}
                      onChange={(e) => handleScoreChange(g.id, "awayScore", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      className="games-table-delete"
                      onClick={() => removeGame(tournamentId, g.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import */}
      <div className="import-section">
        <div className="import-tabs">
          <button
            className="import-tab"
            data-active={importTab === "games" || undefined}
            onClick={() => setImportTab("games")}
          >
            Import Games
          </button>
          <button
            className="import-tab"
            data-active={importTab === "standings" || undefined}
            onClick={() => setImportTab("standings")}
          >
            Import Standings / Schedule
          </button>
        </div>
        <textarea
          className="import-textarea"
          placeholder={
            importTab === "games"
              ? "Paste game data (tab-separated)"
              : "Paste standings or schedule (tab-separated team names)"
          }
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={6}
        />
        <Button onClick={handleImport} disabled={!importText.trim()} className="btn-import">
          {importTab === "games" ? "Import Games" : "Import Teams"}
        </Button>
      </div>

      {/* Standings Preview */}
      {poolStandings.length > 0 && activePool && (
        <div>
          <h3 className="dashboard-record-label">Standings Preview</h3>
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>GP</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>Pts</th>
                <th>GF</th>
                <th>GA</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {poolStandings.map((row, i) => {
                const pool = config.pools.find((p) => p.id === activePool)
                const cutoff = pool?.qualifyingSpots ?? 0
                return (
                  <tr
                    key={row.teamId}
                    className={`standings-row${i < cutoff ? " playdown-cutoff" : ""}`}
                  >
                    <td>{i + 1}</td>
                    <td>{row.teamName}</td>
                    <td>{row.gp}</td>
                    <td>{row.w}</td>
                    <td>{row.l}</td>
                    <td>{row.t}</td>
                    <td>{row.pts}</td>
                    <td>{row.gf}</td>
                    <td>{row.ga}</td>
                    <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function AdminEventsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PlaydownsSection />
      <TournamentsSection />
    </div>
  )
}
