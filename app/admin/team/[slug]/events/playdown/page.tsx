"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { computePlaydownStandings } from "@/lib/playdowns"
import { parsePlaydownGames } from "@/lib/parsers"
import type { PlaydownConfig, PlaydownGame, PlaydownTeam } from "@/lib/types"
import { Button } from "@/components/ui/button"

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function PlaydownManagementPage() {
  const team = useTeamContext()
  const {
    playdown, setConfig, setConfigAndGames, setGames, addGame, updateGame,
    removeGame, clearPlaydown, loading,
  } = useSupabasePlaydowns(team.id)

  const [totalTeams, setTotalTeams] = useState(0)
  const [qualifyingSpots, setQualifyingSpots] = useState(0)
  const [gamesPerMatchup, setGamesPerMatchup] = useState(1)
  const [standingsText, setStandingsText] = useState("")
  const [importText, setImportText] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)

  const [newDate, setNewDate] = useState("")
  const [newTime, setNewTime] = useState("")
  const [newHome, setNewHome] = useState("")
  const [newAway, setNewAway] = useState("")
  const [newLocation, setNewLocation] = useState("")

  // Collapsible state
  const [standingsOpen, setStandingsOpen] = useState(false)
  const [gamesOpen, setGamesOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const config = playdown?.config
  const games = playdown?.games ?? []

  // Sync form from loaded config
  useEffect(() => {
    if (config) {
      setTotalTeams(config.totalTeams)
      setQualifyingSpots(config.qualifyingSpots)
      setGamesPerMatchup(config.gamesPerMatchup)
    }
  }, [config?.totalTeams, config?.qualifyingSpots, config?.gamesPerMatchup]) // eslint-disable-line react-hooks/exhaustive-deps

  const configDirty = useMemo(() => {
    if (!config) return totalTeams > 0 || qualifyingSpots > 0 || gamesPerMatchup !== 1
    return (
      totalTeams !== config.totalTeams ||
      qualifyingSpots !== config.qualifyingSpots ||
      gamesPerMatchup !== config.gamesPerMatchup
    )
  }, [config, totalTeams, qualifyingSpots, gamesPerMatchup])

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

  const addGameReady = Boolean(newHome && newAway)

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
    const lines = standingsText.trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const teams: PlaydownTeam[] = []
    const syntheticGames: PlaydownGame[] = []

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

      const teamId = generateId("pd-t")
      teams.push({ id: teamId, name })

      for (let i = 0; i < w; i++) {
        syntheticGames.push({
          id: generateId("pd-g"), teamId: team.id, date: "", time: "",
          homeTeam: teamId, awayTeam: "synthetic-opp",
          homeScore: 1, awayScore: 0, location: "", played: true,
        })
      }
      for (let i = 0; i < l; i++) {
        syntheticGames.push({
          id: generateId("pd-g"), teamId: team.id, date: "", time: "",
          homeTeam: teamId, awayTeam: "synthetic-opp",
          homeScore: 0, awayScore: 1, location: "", played: true,
        })
      }
      for (let i = 0; i < t; i++) {
        syntheticGames.push({
          id: generateId("pd-g"), teamId: team.id, date: "", time: "",
          homeTeam: teamId, awayTeam: "synthetic-opp",
          homeScore: 0, awayScore: 0, location: "", played: true,
        })
      }
      for (let i = 0; i < otl; i++) {
        syntheticGames.push({
          id: generateId("pd-g"), teamId: team.id, date: "", time: "",
          homeTeam: "synthetic-opp", awayTeam: teamId,
          homeScore: 1, awayScore: 0, location: "", played: true,
          resultType: "overtime",
        })
      }
      for (let i = 0; i < sol; i++) {
        syntheticGames.push({
          id: generateId("pd-g"), teamId: team.id, date: "", time: "",
          homeTeam: "synthetic-opp", awayTeam: teamId,
          homeScore: 1, awayScore: 0, location: "", played: true,
          resultType: "shootout",
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
    await setConfigAndGames(newConfig, syntheticGames)
    setStandingsText("")
    setStandingsOpen(false)
    setTotalTeams(newConfig.totalTeams)
    setQualifyingSpots(newConfig.qualifyingSpots)
  }

  async function handleImportGames() {
    const { games: parsed } = parsePlaydownGames(importText, team.id)
    if (parsed.length === 0) return

    const existingTeams = config?.teams ?? []

    // Normalize names for matching: strip OWHA IDs like "#2859", lowercase
    const normalize = (s: string) => s.replace(/#\d+/, "").toLowerCase().trim()

    // Build name → id map from already-configured teams only
    const nameToId = new Map<string, string>()
    for (const t of existingTeams) nameToId.set(normalize(t.name), t.id)

    const existingGameIds = new Set(games.map((g) => `${g.date}-${g.homeTeam}-${g.awayTeam}`))
    const mappedGames: PlaydownGame[] = []

    for (const g of parsed) {
      const homeId = nameToId.get(normalize(g.homeTeam))
      const awayId = nameToId.get(normalize(g.awayTeam))
      // Skip games where either team isn't in the playdown loop
      if (!homeId || !awayId) continue
      const dedupKey = `${g.date}-${homeId}-${awayId}`
      if (existingGameIds.has(dedupKey)) continue
      existingGameIds.add(dedupKey)
      mappedGames.push({ ...g, homeTeam: homeId, awayTeam: awayId })
    }

    if (mappedGames.length === 0) return

    const updatedConfig: PlaydownConfig = {
      teamId: team.id,
      totalTeams: existingTeams.length,
      qualifyingSpots: config?.qualifyingSpots ?? Math.ceil(existingTeams.length / 2),
      gamesPerMatchup: config?.gamesPerMatchup ?? 1,
      teams: existingTeams,
    }
    await setConfigAndGames(updatedConfig, [...games, ...mappedGames])
    setImportText("")
    setGamesOpen(false)
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
    setNewDate(""); setNewTime(""); setNewHome(""); setNewAway(""); setNewLocation("")
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
    updates.played = score !== null && game[otherField] !== null
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
    <div className="flex flex-col gap-6">
      <div className="sub-page-header">
        <h1 className="ob-page-title">Playdowns</h1>
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
        <Button
          variant={configDirty ? "default" : "outline"}
          className={configDirty ? "btn-save-ready" : undefined}
          onClick={handleSaveConfig}
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

      {/* Import Games — collapsible */}
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
                <th>Home</th>
                <th>Away</th>
                <th>Date</th>
                <th>Time</th>
                <th>H</th>
                <th>A</th>
                <th>Type</th>
                <th>HPIM</th>
                <th>APIM</th>
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
                    <select
                      className="games-table-input"
                      value={g.resultType ?? "regulation"}
                      onChange={(e) => updateGame(g.id, { resultType: e.target.value as "regulation" | "overtime" | "shootout" })}
                    >
                      <option value="regulation">REG</option>
                      <option value="overtime">OT</option>
                      <option value="shootout">SO</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="games-table-input"
                      value={g.homePim ?? ""}
                      onChange={(e) => updateGame(g.id, { homePim: e.target.value === "" ? undefined : parseInt(e.target.value, 10) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="games-table-input"
                      value={g.awayPim ?? ""}
                      onChange={(e) => updateGame(g.id, { awayPim: e.target.value === "" ? undefined : parseInt(e.target.value, 10) })}
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
          <h2 className="admin-section-title">Standings Preview</h2>
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th><th>Team</th><th>GP</th><th>W</th><th>L</th><th>T</th>
                <th>OTL</th><th>SOL</th><th>PTS</th><th>GF</th><th>GA</th>
                <th>DIFF</th><th>PIM</th><th>Win%</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.teamId} className={`standings-row${i < (config?.qualifyingSpots ?? 0) ? " playdown-cutoff" : ""}`}>
                  <td>{i + 1}</td>
                  <td>{row.teamName}</td>
                  <td>{row.gp}</td><td>{row.w}</td><td>{row.l}</td><td>{row.t}</td>
                  <td>{row.otl}</td><td>{row.sol}</td><td>{row.pts}</td>
                  <td>{row.gf}</td><td>{row.ga}</td>
                  <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                  <td>{row.pim}</td>
                  <td>{(row.winPct * 100).toFixed(1)}%</td>
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
              <span className="text-destructive text-sm">Clear all playdown data?</span>
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
    </div>
  )
}
