"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import { computePoolStandings } from "@/lib/tournaments"
import { parsePlaydownGames } from "@/lib/parsers"
import type { TournamentConfig, TournamentGame, TournamentTeam } from "@/lib/types"
import { Button } from "@/components/ui/button"

const PLAYOFFS_ID = "playoffs"
const PLAYOFFS_POOL_ID = "playoffs-pool"

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function defaultPlayoffsConfig(teamId: string): TournamentConfig {
  return {
    id: PLAYOFFS_ID,
    teamId,
    name: "Playoffs",
    location: "",
    startDate: "",
    endDate: "",
    pools: [{ id: PLAYOFFS_POOL_ID, name: "Playoffs", teamIds: [], qualifyingSpots: 4 }],
    teams: [],
    gamesPerMatchup: 1,
    tiebreakerOrder: ["wins", "head-to-head", "goal-differential", "goals-allowed", "goals-for"],
    eliminationEnabled: false,
    consolationEnabled: false,
  }
}

export default function PlayoffsManagementPage() {
  const team = useTeamContext()
  const {
    tournaments, addTournament, updateConfig, setConfigAndGames, setGames,
    addGame, updateGame, removeGame, loading,
  } = useSupabaseTournaments(team.id)

  const [qualifyingSpots, setQualifyingSpots] = useState(4)
  const [gamesPerMatchup, setGamesPerMatchup] = useState(1)
  const [standingsText, setStandingsText] = useState("")
  const [importText, setImportText] = useState("")

  const [newDate, setNewDate] = useState("")
  const [newTime, setNewTime] = useState("")
  const [newHome, setNewHome] = useState("")
  const [newAway, setNewAway] = useState("")
  const [newLocation, setNewLocation] = useState("")

  // Collapsible state
  const [standingsOpen, setStandingsOpen] = useState(false)
  const [gamesOpen, setGamesOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const playoffs = tournaments.find((t) => t.config.id === PLAYOFFS_ID)
  const config = playoffs?.config
  const games = playoffs?.games ?? []

  // Auto-create playoffs tournament on first visit
  useEffect(() => {
    if (!loading && !playoffs) {
      addTournament(defaultPlayoffsConfig(team.id))
    }
  }, [loading, playoffs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync config form fields
  useEffect(() => {
    if (config) {
      setQualifyingSpots(config.pools[0]?.qualifyingSpots ?? 4)
      setGamesPerMatchup(config.gamesPerMatchup)
    }
  }, [config?.pools[0]?.qualifyingSpots, config?.gamesPerMatchup]) // eslint-disable-line react-hooks/exhaustive-deps

  const configDirty = useMemo(() => {
    if (!config) return false
    return (
      qualifyingSpots !== (config.pools[0]?.qualifyingSpots ?? 4) ||
      gamesPerMatchup !== config.gamesPerMatchup
    )
  }, [config, qualifyingSpots, gamesPerMatchup])

  const standings = useMemo(() => {
    if (!config) return []
    return computePoolStandings(config, games, PLAYOFFS_POOL_ID)
  }, [config, games])

  const teamMap = useMemo(() => {
    const m = new Map<string, string>()
    if (config) for (const t of config.teams) m.set(t.id, t.name)
    return m
  }, [config])

  const addGameReady = Boolean(newHome && newAway)

  async function handleSaveConfig() {
    if (!config) return
    const updated: TournamentConfig = {
      ...config,
      gamesPerMatchup,
      pools: [{
        id: PLAYOFFS_POOL_ID,
        name: "Playoffs",
        teamIds: config.teams.map((t) => t.id),
        qualifyingSpots,
      }],
    }
    await updateConfig(PLAYOFFS_ID, updated)
  }

  async function handleImportStandings() {
    const lines = standingsText.trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const teams: TournamentTeam[] = []
    const syntheticGames: TournamentGame[] = []

    for (const line of lines) {
      const parts = line.split(/\t+|\s{2,}/).map((p) => p.trim()).filter(Boolean)
      if (parts.length < 5) continue
      const gpIdx = parts.findIndex((p) => /^\d+$/.test(p))
      if (gpIdx < 1) continue

      const teamPart = parts.slice(0, gpIdx).join(" ")
      const nums = parts.slice(gpIdx)
      const name = teamPart.replace(/#\d+/, "").trim()
      if (!name) continue

      const w = parseInt(nums[1], 10) || 0
      const l = parseInt(nums[2], 10) || 0
      const t = parseInt(nums[3], 10) || 0
      const otl = parseInt(nums[4], 10) || 0
      const sol = parseInt(nums[5], 10) || 0

      const teamId = generateId("pl-t")
      teams.push({ id: teamId, name, poolId: PLAYOFFS_POOL_ID })

      for (let i = 0; i < w; i++) {
        syntheticGames.push({
          id: generateId("pl-g"), teamId: team.id, tournamentId: PLAYOFFS_ID,
          date: "", time: "", homeTeam: teamId, awayTeam: "synthetic-opp",
          homeScore: 1, awayScore: 0, location: "", played: true, round: "pool", poolId: PLAYOFFS_POOL_ID,
        })
      }
      for (let i = 0; i < l; i++) {
        syntheticGames.push({
          id: generateId("pl-g"), teamId: team.id, tournamentId: PLAYOFFS_ID,
          date: "", time: "", homeTeam: teamId, awayTeam: "synthetic-opp",
          homeScore: 0, awayScore: 1, location: "", played: true, round: "pool", poolId: PLAYOFFS_POOL_ID,
        })
      }
      for (let i = 0; i < t; i++) {
        syntheticGames.push({
          id: generateId("pl-g"), teamId: team.id, tournamentId: PLAYOFFS_ID,
          date: "", time: "", homeTeam: teamId, awayTeam: "synthetic-opp",
          homeScore: 0, awayScore: 0, location: "", played: true, round: "pool", poolId: PLAYOFFS_POOL_ID,
        })
      }
      for (let i = 0; i < otl; i++) {
        syntheticGames.push({
          id: generateId("pl-g"), teamId: team.id, tournamentId: PLAYOFFS_ID,
          date: "", time: "", homeTeam: "synthetic-opp", awayTeam: teamId,
          homeScore: 1, awayScore: 0, location: "", played: true, round: "pool", poolId: PLAYOFFS_POOL_ID,
        })
      }
      for (let i = 0; i < sol; i++) {
        syntheticGames.push({
          id: generateId("pl-g"), teamId: team.id, tournamentId: PLAYOFFS_ID,
          date: "", time: "", homeTeam: "synthetic-opp", awayTeam: teamId,
          homeScore: 1, awayScore: 0, location: "", played: true, round: "pool", poolId: PLAYOFFS_POOL_ID,
        })
      }
    }

    if (!config || teams.length === 0) return

    const updated: TournamentConfig = {
      ...config,
      gamesPerMatchup,
      teams,
      pools: [{
        id: PLAYOFFS_POOL_ID,
        name: "Playoffs",
        teamIds: teams.map((t) => t.id),
        qualifyingSpots: qualifyingSpots || Math.ceil(teams.length / 2),
      }],
    }
    await setConfigAndGames(PLAYOFFS_ID, updated, syntheticGames)
    setStandingsText("")
    setStandingsOpen(false)
    setQualifyingSpots(updated.pools[0].qualifyingSpots)
  }

  async function handleImportGames() {
    if (!config) return
    const { games: parsed, teamNames } = parsePlaydownGames(importText, team.id)
    if (parsed.length === 0) return

    const existingMap = new Map<string, string>()
    for (const t of config.teams) existingMap.set(t.name.toLowerCase(), t.id)

    const nameToId = new Map<string, string>()
    for (const name of teamNames) {
      nameToId.set(name, existingMap.get(name.toLowerCase()) ?? generateId("pl-t"))
    }

    const selfName = teamNames.find((n) => n.toLowerCase().includes(team.organization.toLowerCase()))
    const adjacency = new Map<string, Set<string>>()
    for (const g of parsed) {
      if (!adjacency.has(g.homeTeam)) adjacency.set(g.homeTeam, new Set())
      if (!adjacency.has(g.awayTeam)) adjacency.set(g.awayTeam, new Set())
      adjacency.get(g.homeTeam)!.add(g.awayTeam)
      adjacency.get(g.awayTeam)!.add(g.homeTeam)
    }

    const startName = selfName ?? teamNames[0]
    const connected = new Set<string>()
    if (startName) {
      const queue = [startName]
      connected.add(startName)
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const n of adjacency.get(current) ?? []) {
          if (!connected.has(n)) { connected.add(n); queue.push(n) }
        }
      }
    }

    const newTeams: TournamentTeam[] = [...config.teams]
    for (const name of connected) {
      if (!existingMap.has(name.toLowerCase())) {
        newTeams.push({ id: nameToId.get(name)!, name, poolId: PLAYOFFS_POOL_ID })
      }
    }

    const existingKeys = new Set(games.map((g) => `${g.date}-${g.homeTeam}-${g.awayTeam}`))
    const mappedGames: TournamentGame[] = []
    for (const g of parsed) {
      const homeId = nameToId.get(g.homeTeam) ?? g.homeTeam
      const awayId = nameToId.get(g.awayTeam) ?? g.awayTeam
      const key = `${g.date}-${homeId}-${awayId}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      mappedGames.push({
        ...g, homeTeam: homeId, awayTeam: awayId,
        tournamentId: PLAYOFFS_ID, round: "pool", poolId: PLAYOFFS_POOL_ID,
      })
    }

    const updated: TournamentConfig = {
      ...config,
      teams: newTeams,
      pools: [{ id: PLAYOFFS_POOL_ID, name: "Playoffs", teamIds: newTeams.map((t) => t.id), qualifyingSpots: config.pools[0]?.qualifyingSpots ?? 4 }],
    }
    await setConfigAndGames(PLAYOFFS_ID, updated, [...games, ...mappedGames])
    setImportText("")
    setGamesOpen(false)
  }

  async function handleAddGame() {
    if (!newHome || !newAway) return
    const game: TournamentGame = {
      id: generateId("pl-g"),
      teamId: team.id,
      tournamentId: PLAYOFFS_ID,
      date: newDate,
      time: newTime,
      homeTeam: newHome,
      awayTeam: newAway,
      homeScore: null,
      awayScore: null,
      location: newLocation,
      played: false,
      round: "pool",
      poolId: PLAYOFFS_POOL_ID,
    }
    await addGame(PLAYOFFS_ID, game)
    setNewDate(""); setNewTime(""); setNewHome(""); setNewAway(""); setNewLocation("")
  }

  async function handleScoreChange(gameId: string, field: "homeScore" | "awayScore", value: string) {
    const score = value === "" ? null : parseInt(value, 10)
    const game = games.find((g) => g.id === gameId)
    if (!game) return
    const updates: Partial<TournamentGame> = { [field]: score }
    const otherField = field === "homeScore" ? "awayScore" : "homeScore"
    updates.played = score !== null && game[otherField] !== null
    await updateGame(PLAYOFFS_ID, gameId, updates)
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="sub-page-header">
        <h1 className="ob-page-title">Playoffs</h1>
        <Link href={`/admin/team/${team.slug}/events`} className="ob-back-link">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Link>
      </div>

      {/* Configuration */}
      <div className="import-section">
        <h2 className="admin-section-title">Configuration</h2>
        <div className="playdown-config-row">
          <div className="playdown-config-field">
            <label className="game-form-label">Total Teams</label>
            <span className="playdown-config-input text-muted-foreground text-sm flex items-center">
              {config?.teams.length ?? 0}
            </span>
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
        <Button
          variant={configDirty ? "default" : "outline"}
          className={configDirty ? "btn-save-ready" : undefined}
          onClick={handleSaveConfig}
          disabled={!config}
        >
          Save Config
        </Button>
      </div>

      {/* Import Standings — collapsible */}
      <div className="collapsible-card">
        <button className="collapsible-toggle" onClick={() => setStandingsOpen(!standingsOpen)}>
          <span className="collapsible-title">Import Standings</span>
          <div className="collapsible-toggle-right">
            {standingsText.trim() && <span className="collapsible-badge" />}
            {standingsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {standingsOpen && (
          <div className="collapsible-body">
            <Button
              variant={standingsText.trim() ? "default" : "outline"}
              className={standingsText.trim() ? "btn-save-ready" : undefined}
              onClick={handleImportStandings}
              disabled={!standingsText.trim()}
            >
              Import Standings
            </Button>
            <textarea
              className="import-textarea"
              placeholder="Paste OWHA standings (GP W L T OTL SOL PTS GF GA…)"
              value={standingsText}
              onChange={(e) => setStandingsText(e.target.value)}
              rows={6}
            />
          </div>
        )}
      </div>

      {/* Import Schedule / Results — collapsible */}
      <div className="collapsible-card">
        <button className="collapsible-toggle" onClick={() => setGamesOpen(!gamesOpen)}>
          <span className="collapsible-title">Import Schedule / Results</span>
          <div className="collapsible-toggle-right">
            {importText.trim() && <span className="collapsible-badge" />}
            {gamesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {gamesOpen && (
          <div className="collapsible-body">
            <Button
              variant={importText.trim() ? "default" : "outline"}
              className={importText.trim() ? "btn-save-ready" : undefined}
              onClick={handleImportGames}
              disabled={!importText.trim()}
            >
              Import Games
            </Button>
            <textarea
              className="import-textarea"
              placeholder="Paste tab-separated game data"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={6}
            />
          </div>
        )}
      </div>

      {/* Add Game — collapsible */}
      <div className="collapsible-card">
        <button className="collapsible-toggle" onClick={() => setAddOpen(!addOpen)}>
          <span className="collapsible-title">Add Game</span>
          <div className="collapsible-toggle-right">
            {addGameReady && <span className="collapsible-badge" />}
            {addOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {addOpen && (
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
            <div className="playdown-config-row">
              <div className="game-form-field">
                <label className="game-form-label">Home Team</label>
                {config && config.teams.length > 0 ? (
                  <select className="game-form-select" value={newHome} onChange={(e) => setNewHome(e.target.value)}>
                    <option value="">Select…</option>
                    {config.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <input className="game-form-input" value={newHome} onChange={(e) => setNewHome(e.target.value)} placeholder="Home team" />
                )}
              </div>
              <div className="game-form-field">
                <label className="game-form-label">Away Team</label>
                {config && config.teams.length > 0 ? (
                  <select className="game-form-select" value={newAway} onChange={(e) => setNewAway(e.target.value)}>
                    <option value="">Select…</option>
                    {config.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <input className="game-form-input" value={newAway} onChange={(e) => setNewAway(e.target.value)} placeholder="Away team" />
                )}
              </div>
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Location</label>
              <input className="game-form-input" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Arena name" />
            </div>
          </div>
        )}
      </div>

      {/* Game List */}
      {games.length > 0 && (
        <div className="games-table-wrap">
          <table className="games-table">
            <thead>
              <tr>
                <th>Home</th><th>Away</th><th>Date</th><th>Time</th>
                <th>H</th><th>A</th><th></th>
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
                    <input type="number" className="games-table-input" value={g.homeScore ?? ""}
                      onChange={(e) => handleScoreChange(g.id, "homeScore", e.target.value)} />
                  </td>
                  <td>
                    <input type="number" className="games-table-input" value={g.awayScore ?? ""}
                      onChange={(e) => handleScoreChange(g.id, "awayScore", e.target.value)} />
                  </td>
                  <td>
                    <button className="games-table-delete" onClick={() => removeGame(PLAYOFFS_ID, g.id)}>
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
          <h2 className="admin-section-title">Standings Preview</h2>
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th><th>Team</th><th>GP</th><th>W</th><th>L</th><th>T</th>
                <th>PTS</th><th>GF</th><th>GA</th><th>DIFF</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.teamId} className={`standings-row${i < qualifyingSpots ? " playdown-cutoff" : ""}`}>
                  <td>{i + 1}</td><td>{row.teamName}</td>
                  <td>{row.gp}</td><td>{row.w}</td><td>{row.l}</td><td>{row.t}</td>
                  <td>{row.pts}</td><td>{row.gf}</td><td>{row.ga}</td>
                  <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
