"use client"

import { use, useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { computePoolStandings } from "@/lib/tournaments"
import { parsePlaydownGames } from "@/lib/parsers"
import type {
  Game,
  TournamentConfig,
  TournamentGame,
  TournamentTeam,
  TournamentPool,
  TiebreakerKey,
} from "@/lib/types"
import { Button } from "@/components/ui/button"

const ALL_TIEBREAKER_KEYS: { key: TiebreakerKey; label: string }[] = [
  { key: "wins", label: "Number of Wins" },
  { key: "head-to-head", label: "Head-to-Head Record" },
  { key: "goal-differential", label: "Goal Differential" },
  { key: "goals-allowed", label: "Fewest Goals Allowed" },
  { key: "goals-for", label: "Most Goals For" },
]

const ROUND_OPTIONS: { value: TournamentGame["round"]; label: string }[] = [
  { value: "pool", label: "Pool Play" },
  { value: "semifinal", label: "Semifinal" },
  { value: "final", label: "Final" },
  { value: "consolation", label: "Consolation" },
]

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function TournamentManagementPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { id: tournamentId } = use(params)
  const team = useTeamContext()
  const {
    updateConfig, setConfigAndGames,
    addGame, updateGame, removeGame, removeTournament,
    getTournament, loading,
  } = useSupabaseTournaments(team.id)
  const { games: scheduleGames } = useSupabaseGames(team.id)

  if (loading) return <p className="text-muted-foreground">Loading…</p>

  const tournament = getTournament(tournamentId)

  if (!tournament) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/admin/team/${team.slug}/events`} className="ob-back-link">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Link>
        <p className="text-muted-foreground">Tournament not found.</p>
      </div>
    )
  }

  return (
    <TournamentPage
      tournamentId={tournamentId}
      tournament={tournament}
      scheduleGames={scheduleGames}
      teamSlug={team.slug}
      teamId={team.id}
      teamName={team.name || team.organization}
      updateConfig={updateConfig}
      setConfigAndGames={setConfigAndGames}
      addGame={addGame}
      updateGame={updateGame}
      removeGame={removeGame}
      removeTournament={removeTournament}
    />
  )
}

function TournamentPage({
  tournamentId,
  tournament,
  scheduleGames,
  teamSlug,
  teamId,
  teamName,
  updateConfig,
  setConfigAndGames,
  addGame,
  updateGame,
  removeGame,
  removeTournament,
}: {
  tournamentId: string
  tournament: { config: TournamentConfig; games: TournamentGame[] }
  scheduleGames: Game[]
  teamSlug: string
  teamId: string
  teamName: string
  updateConfig: (id: string, config: TournamentConfig) => Promise<void>
  setConfigAndGames: (id: string, config: TournamentConfig, games: TournamentGame[]) => Promise<void>
  addGame: (id: string, game: TournamentGame) => Promise<void>
  updateGame: (id: string, gameId: string, updates: Partial<TournamentGame>) => Promise<void>
  removeGame: (id: string, gameId: string) => Promise<void>
  removeTournament: (id: string) => Promise<void>
}) {
  const config = tournament.config
  const games = tournament.games

  // ── Config state ──────────────────────────────────────
  const [name, setName] = useState(config.name)
  const [location, setLocation] = useState(config.location)
  const [startDate, setStartDate] = useState(config.startDate)
  const [endDate, setEndDate] = useState(config.endDate)
  const [gamesPerMatchup, setGamesPerMatchup] = useState(config.gamesPerMatchup)
  const [pools, setPools] = useState<TournamentPool[]>(config.pools)
  const [teams, setTeams] = useState<TournamentTeam[]>(config.teams)
  const [tiebreakerOrder, setTiebreakerOrder] = useState<TiebreakerKey[]>(config.tiebreakerOrder)
  const [hasChanges, setHasChanges] = useState(false)

  // ── Teams add form ─────────────────────────────────────
  const [newTeamName, setNewTeamName] = useState("")
  const [newTeamPool, setNewTeamPool] = useState("")

  // ── Collapsible sections ───────────────────────────────
  const [tiebreakerOpen, setTiebreakerOpen] = useState(false)
  const [standingsImportOpen, setStandingsImportOpen] = useState(false)
  const [gamesImportOpen, setGamesImportOpen] = useState(false)
  const [scheduleImportOpen, setScheduleImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // ── Import state ───────────────────────────────────────
  const [standingsText, setStandingsText] = useState("")
  const [gamesText, setGamesText] = useState("")
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set())

  // ── Add game form ──────────────────────────────────────
  const [newDate, setNewDate] = useState("")
  const [newTime, setNewTime] = useState("")
  const [newHome, setNewHome] = useState("")
  const [newAway, setNewAway] = useState("")
  const [newLocation, setNewLocation] = useState("")
  const [newRound, setNewRound] = useState<TournamentGame["round"]>("pool")

  // ── Active pool for standings preview ─────────────────
  const [activePool, setActivePool] = useState(config.pools[0]?.id ?? "")

  // ── Confirm delete ─────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)

  function markChanged() { setHasChanges(true) }

  const addGameReady = Boolean(newHome && newAway)

  const teamMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of teams) m.set(t.id, t.name)
    return m
  }, [teams])

  const poolStandings = useMemo(() => {
    if (!activePool) return []
    return computePoolStandings(config, games, activePool)
  }, [config, games, activePool])

  const rangeGames = useMemo(() => {
    if (!startDate || !endDate) return []
    return scheduleGames.filter((g) => g.date >= startDate && g.date <= endDate)
  }, [scheduleGames, startDate, endDate])

  // ── Config handlers ────────────────────────────────────

  function handleNumPoolsChange(n: number) {
    const count = Math.max(1, Math.min(4, n))
    markChanged()
    if (count > pools.length) {
      const newPools = [...pools]
      for (let i = pools.length; i < count; i++) {
        newPools.push({
          id: generateId("pool"),
          name: `Pool ${String.fromCharCode(65 + i)}`,
          teamIds: [],
          qualifyingSpots: 1,
        })
      }
      setPools(newPools)
    } else if (count < pools.length) {
      const removedIds = new Set(pools.slice(count).map((p) => p.id))
      setPools(pools.slice(0, count))
      setTeams(teams.filter((t) => !removedIds.has(t.poolId)))
    }
  }

  function handlePoolQualifying(poolId: string, spots: number) {
    setPools(pools.map((p) => p.id === poolId ? { ...p, qualifyingSpots: spots } : p))
    markChanged()
  }

  function moveTiebreaker(index: number, direction: -1 | 1) {
    const newOrder = [...tiebreakerOrder]
    const target = index + direction
    if (target < 0 || target >= newOrder.length) return
    ;[newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]
    setTiebreakerOrder(newOrder)
    markChanged()
  }

  async function handleSaveConfig() {
    const updated: TournamentConfig = {
      ...config,
      name,
      location,
      startDate,
      endDate,
      gamesPerMatchup,
      pools: pools.map((p) => ({
        ...p,
        teamIds: teams.filter((t) => t.poolId === p.id).map((t) => t.id),
      })),
      teams,
      tiebreakerOrder,
    }
    await updateConfig(tournamentId, updated)
    setHasChanges(false)
  }

  // ── Teams handlers ─────────────────────────────────────

  function handleAddTeam() {
    if (!newTeamName) return
    const poolId = pools.length === 1 ? pools[0].id : newTeamPool
    if (!poolId) return
    setTeams([...teams, { id: generateId("trn-t"), name: newTeamName, poolId }])
    setNewTeamName("")
    markChanged()
  }

  function handleRemoveTeam(teamId: string) {
    setTeams(teams.filter((t) => t.id !== teamId))
    markChanged()
  }

  // ── Import handlers ────────────────────────────────────

  async function handleImportStandings() {
    const lines = standingsText.trim().split("\n").filter(Boolean)
    const newTeams = [...teams]
    const nameToId = new Map<string, string>()
    for (const t of teams) nameToId.set(t.name.toLowerCase(), t.id)

    for (const line of lines) {
      const parts = line.split(/\t+|\s{2,}/).map((p) => p.trim()).filter(Boolean)
      if (parts.length < 5) continue
      const gpIdx = parts.findIndex((p) => /^\d+$/.test(p))
      if (gpIdx < 1) continue
      const parsedName = parts.slice(0, gpIdx).join(" ").replace(/#\d+/, "").trim()
      if (!parsedName || nameToId.has(parsedName.toLowerCase())) continue
      const id = generateId("trn-t")
      nameToId.set(parsedName.toLowerCase(), id)
      newTeams.push({ id, name: parsedName, poolId: activePool || (pools[0]?.id ?? "") })
    }

    const updatedConfig: TournamentConfig = {
      ...config,
      name, location, startDate, endDate, gamesPerMatchup,
      teams: newTeams,
      tiebreakerOrder,
      pools: pools.map((p) => ({
        ...p,
        teamIds: newTeams.filter((t) => t.poolId === p.id).map((t) => t.id),
      })),
    }

    await setConfigAndGames(tournamentId, updatedConfig, games)
    setTeams(newTeams)
    setStandingsText("")
    setStandingsImportOpen(false)
    setHasChanges(false)
  }

  async function handleImportGames() {
    const { games: parsed, teamNames } = parsePlaydownGames(gamesText, teamId)
    if (parsed.length === 0) return

    const nameToId = new Map<string, string>()
    for (const t of teams) nameToId.set(t.name.toLowerCase(), t.id)

    const newTeams = [...teams]
    for (const parsedName of teamNames) {
      if (!nameToId.has(parsedName.toLowerCase())) {
        const id = generateId("trn-t")
        nameToId.set(parsedName.toLowerCase(), id)
        newTeams.push({ id, name: parsedName, poolId: activePool || (pools[0]?.id ?? "") })
      }
    }

    const updatedConfig: TournamentConfig = {
      ...config,
      name, location, startDate, endDate, gamesPerMatchup,
      teams: newTeams,
      tiebreakerOrder,
      pools: pools.map((p) => ({
        ...p,
        teamIds: newTeams.filter((t) => t.poolId === p.id).map((t) => t.id),
      })),
    }

    const existingKeys = new Set(games.map((g) => `${g.date}-${g.homeTeam}-${g.awayTeam}`))
    const mappedGames: TournamentGame[] = parsed.map((g) => ({
      id: generateId("trn-g"),
      teamId,
      tournamentId,
      date: g.date, time: g.time,
      homeTeam: nameToId.get(g.homeTeam.toLowerCase()) ?? g.homeTeam,
      awayTeam: nameToId.get(g.awayTeam.toLowerCase()) ?? g.awayTeam,
      homeScore: g.homeScore, awayScore: g.awayScore,
      location: g.location, played: g.played,
      round: "pool" as const, poolId: activePool || undefined,
    })).filter((g) => {
      const key = `${g.date}-${g.homeTeam}-${g.awayTeam}`
      if (existingKeys.has(key)) return false
      existingKeys.add(key)
      return true
    })

    await setConfigAndGames(tournamentId, updatedConfig, [...games, ...mappedGames])
    setTeams(newTeams)
    setGamesText("")
    setGamesImportOpen(false)
    setHasChanges(false)
  }

  async function handleAssignGames() {
    const selected = rangeGames.filter((g) => selectedGameIds.has(g.id))
    if (selected.length === 0) return

    const nameToId = new Map<string, string>()
    for (const t of teams) nameToId.set(t.name.toLowerCase(), t.id)

    if (!nameToId.has(teamName.toLowerCase())) {
      nameToId.set(teamName.toLowerCase(), generateId("trn-t"))
    }
    for (const g of selected) {
      if (!nameToId.has(g.opponent.toLowerCase())) {
        nameToId.set(g.opponent.toLowerCase(), generateId("trn-t"))
      }
    }

    const existingIds = new Set(teams.map((t) => t.id))
    const newTeams: TournamentTeam[] = [...teams]
    for (const [lowerName, id] of nameToId) {
      if (!existingIds.has(id)) {
        const originalName = lowerName === teamName.toLowerCase()
          ? teamName
          : selected.find((g) => g.opponent.toLowerCase() === lowerName)?.opponent ?? lowerName
        newTeams.push({ id, name: originalName, poolId: activePool || (pools[0]?.id ?? "") })
      }
    }

    const ourTeamId = nameToId.get(teamName.toLowerCase())!
    const existingKeys = new Set(games.map((g) => `${g.date}-${g.homeTeam}-${g.awayTeam}`))
    const newGames: TournamentGame[] = []

    for (const g of selected) {
      const oppId = nameToId.get(g.opponent.toLowerCase())!
      const key = `${g.date}-${ourTeamId}-${oppId}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      newGames.push({
        id: generateId("trn-g"),
        teamId,
        tournamentId,
        date: g.date,
        time: g.time,
        homeTeam: ourTeamId,
        awayTeam: oppId,
        homeScore: g.teamScore,
        awayScore: g.opponentScore,
        location: g.location,
        played: g.played,
        round: "pool",
        poolId: activePool || undefined,
      })
    }

    const updatedConfig: TournamentConfig = {
      ...config,
      name, location, startDate, endDate, gamesPerMatchup,
      teams: newTeams,
      tiebreakerOrder,
      pools: pools.map((p) => ({
        ...p,
        teamIds: newTeams.filter((t) => t.poolId === p.id).map((t) => t.id),
      })),
    }

    await setConfigAndGames(tournamentId, updatedConfig, [...games, ...newGames])
    setTeams(newTeams)
    setSelectedGameIds(new Set())
    setHasChanges(false)
  }

  async function handleAddGame() {
    if (!newHome || !newAway) return
    const game: TournamentGame = {
      id: generateId("trn-g"),
      teamId,
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
    setNewDate(""); setNewTime(""); setNewHome(""); setNewAway(""); setNewLocation("")
  }

  async function handleScoreChange(gameId: string, field: "homeScore" | "awayScore", value: string) {
    const score = value === "" ? null : parseInt(value, 10)
    const game = games.find((g) => g.id === gameId)
    if (!game) return
    const updates: Partial<TournamentGame> = { [field]: score }
    const otherField = field === "homeScore" ? "awayScore" : "homeScore"
    updates.played = score !== null && game[otherField] !== null
    await updateGame(tournamentId, gameId, updates)
  }

  const totalTeams = teams.length

  return (
    <div className="flex flex-col gap-6">
      <div className="sub-page-header">
        <h1 className="ob-page-title">{name || "Untitled Tournament"}</h1>
        <Link href={`/admin/team/${teamSlug}/events`} className="ob-back-link">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Link>
      </div>

      {/* ── Configuration ────────────────────────────── */}
      <div className="import-section">
        <h2 className="admin-section-title">Configuration</h2>

        <Button
          variant={hasChanges ? "default" : "outline"}
          className={hasChanges ? "btn-save-ready" : undefined}
          onClick={handleSaveConfig}
        >
          Save Config
        </Button>

        <div className="playdown-config-row">
          <div className="game-form-field">
            <label className="game-form-label">Name</label>
            <input className="game-form-input" value={name}
              onChange={(e) => { setName(e.target.value); markChanged() }}
              placeholder="Tournament name" />
          </div>
          <div className="game-form-field">
            <label className="game-form-label">Location</label>
            <input className="game-form-input" value={location}
              onChange={(e) => { setLocation(e.target.value); markChanged() }}
              placeholder="City or arena" />
          </div>
        </div>

        <div className="playdown-config-row">
          <div className="game-form-field">
            <label className="game-form-label">Start Date</label>
            <input type="date" className="game-form-input" value={startDate}
              onChange={(e) => { setStartDate(e.target.value); markChanged() }} />
          </div>
          <div className="game-form-field">
            <label className="game-form-label">End Date</label>
            <input type="date" className="game-form-input" value={endDate}
              onChange={(e) => { setEndDate(e.target.value); markChanged() }} />
          </div>
          <div className="playdown-config-field">
            <label className="game-form-label">Games/Matchup</label>
            <input type="number" className="playdown-config-input" value={gamesPerMatchup}
              onChange={(e) => { setGamesPerMatchup(parseInt(e.target.value, 10) || 1); markChanged() }} />
          </div>
        </div>

        <div className="playdown-config-row">
          <div className="playdown-config-field">
            <label className="game-form-label">Pools</label>
            <input
              type="number"
              className="playdown-config-input"
              min={1}
              max={4}
              value={pools.length}
              onChange={(e) => handleNumPoolsChange(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div className="playdown-config-field">
            <label className="game-form-label">Total Teams</label>
            <span className="playdown-config-input flex items-center text-sm text-muted-foreground">
              {totalTeams}
            </span>
          </div>
        </div>

        {pools.map((pool, i) => {
          const poolTeamCount = teams.filter((t) => t.poolId === pool.id).length
          return (
            <div key={pool.id} className="playdown-config-row">
              <span className="game-form-label">Pool {String.fromCharCode(65 + i)}</span>
              <div className="playdown-config-field">
                <label className="game-form-label">Teams</label>
                <span className="text-sm text-muted-foreground">{poolTeamCount}</span>
              </div>
              <div className="playdown-config-field">
                <label className="game-form-label">Qualifying</label>
                <input
                  type="number"
                  className="playdown-config-input"
                  value={pool.qualifyingSpots}
                  onChange={(e) => handlePoolQualifying(pool.id, parseInt(e.target.value, 10) || 1)}
                />
              </div>
              {pools.length > 1 && (
                <button className="games-table-delete" onClick={() => {
                  setPools(pools.filter((p) => p.id !== pool.id))
                  setTeams(teams.filter((t) => t.poolId !== pool.id))
                  markChanged()
                }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Teams ─────────────────────────────────────── */}
      <div className="import-section">
        <h3 className="admin-section-title">Teams</h3>

        {pools.map((pool, i) => {
          const poolTeams = teams.filter((t) => t.poolId === pool.id)
          if (poolTeams.length === 0) return null
          return (
            <div key={pool.id} className="flex flex-col gap-1">
              {pools.length > 1 && (
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Pool {String.fromCharCode(65 + i)}
                </span>
              )}
              {poolTeams.map((t) => (
                <div key={t.id} className="playdown-config-row">
                  <span className="text-sm">{t.name}</span>
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
            onKeyDown={(e) => { if (e.key === "Enter") handleAddTeam() }}
            placeholder="Team name"
          />
          {pools.length > 1 && (
            <select className="game-form-select" value={newTeamPool} onChange={(e) => setNewTeamPool(e.target.value)}>
              <option value="">Pool…</option>
              {pools.map((p, i) => (
                <option key={p.id} value={p.id}>Pool {String.fromCharCode(65 + i)}</option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            onClick={handleAddTeam}
            disabled={!newTeamName || (pools.length > 1 && !newTeamPool)}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* ── Tiebreaker Order — collapsible ─────────────── */}
      <div className="collapsible-card">
        <button className="collapsible-toggle" onClick={() => setTiebreakerOpen(!tiebreakerOpen)}>
          <span className="collapsible-title">Tiebreaker Order</span>
          <div className="collapsible-toggle-right">
            {tiebreakerOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {tiebreakerOpen && (
          <div className="collapsible-body">
            {tiebreakerOrder.map((key, idx) => {
              const info = ALL_TIEBREAKER_KEYS.find((k) => k.key === key)
              return (
                <div key={key} className="playdown-config-row">
                  <span className="text-sm">{idx + 1}. {info?.label ?? key}</span>
                  <Button variant="outline" size="sm" onClick={() => moveTiebreaker(idx, -1)} disabled={idx === 0}>Up</Button>
                  <Button variant="outline" size="sm" onClick={() => moveTiebreaker(idx, 1)} disabled={idx === tiebreakerOrder.length - 1}>Down</Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Import Standings — collapsible ─────────────── */}
      <div className="collapsible-card">
        <button className="collapsible-toggle" onClick={() => setStandingsImportOpen(!standingsImportOpen)}>
          <span className="collapsible-title">Import Standings</span>
          <div className="collapsible-toggle-right">
            {standingsText.trim() && <span className="collapsible-badge" />}
            {standingsImportOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {standingsImportOpen && (
          <div className="collapsible-body">
            <Button
              variant={standingsText.trim() ? "default" : "outline"}
              className={standingsText.trim() ? "btn-save-ready" : undefined}
              onClick={handleImportStandings}
              disabled={!standingsText.trim()}
            >
              Import Teams from Standings
            </Button>
            {pools.length > 1 && (
              <div className="playdown-config-row">
                <label className="game-form-label">Add to pool:</label>
                <select className="game-form-select" value={activePool} onChange={(e) => setActivePool(e.target.value)}>
                  {pools.map((p, i) => (
                    <option key={p.id} value={p.id}>Pool {String.fromCharCode(65 + i)}</option>
                  ))}
                </select>
              </div>
            )}
            <textarea
              className="import-textarea"
              placeholder="Paste OWHA standings (tab-separated)"
              value={standingsText}
              onChange={(e) => setStandingsText(e.target.value)}
              rows={6}
            />
          </div>
        )}
      </div>

      {/* ── Import Games — collapsible ─────────────────── */}
      <div className="collapsible-card">
        <button className="collapsible-toggle" onClick={() => setGamesImportOpen(!gamesImportOpen)}>
          <span className="collapsible-title">Import Schedule / Results</span>
          <div className="collapsible-toggle-right">
            {gamesText.trim() && <span className="collapsible-badge" />}
            {gamesImportOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {gamesImportOpen && (
          <div className="collapsible-body">
            <Button
              variant={gamesText.trim() ? "default" : "outline"}
              className={gamesText.trim() ? "btn-save-ready" : undefined}
              onClick={handleImportGames}
              disabled={!gamesText.trim()}
            >
              Import Games
            </Button>
            {pools.length > 1 && (
              <div className="playdown-config-row">
                <label className="game-form-label">Assign to pool:</label>
                <select className="game-form-select" value={activePool} onChange={(e) => setActivePool(e.target.value)}>
                  {pools.map((p, i) => (
                    <option key={p.id} value={p.id}>Pool {String.fromCharCode(65 + i)}</option>
                  ))}
                </select>
              </div>
            )}
            <textarea
              className="import-textarea"
              placeholder="Paste game data (tab-separated)"
              value={gamesText}
              onChange={(e) => setGamesText(e.target.value)}
              rows={6}
            />
          </div>
        )}
      </div>

      {/* ── Load from Schedule — collapsible ───────────── */}
      <div className="collapsible-card">
        <button className="collapsible-toggle" onClick={() => setScheduleImportOpen(!scheduleImportOpen)}>
          <span className="collapsible-title">Load from Schedule</span>
          <div className="collapsible-toggle-right">
            {selectedGameIds.size > 0 && <span className="collapsible-badge" />}
            {scheduleImportOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {scheduleImportOpen && (
          <div className="collapsible-body">
            {(!startDate || !endDate) ? (
              <p className="text-sm text-muted-foreground">
                Set a start and end date in the configuration above to load games from your schedule.
              </p>
            ) : rangeGames.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No games found between {startDate} and {endDate}.
              </p>
            ) : (
              <>
                <Button
                  variant={selectedGameIds.size > 0 ? "default" : "outline"}
                  className={selectedGameIds.size > 0 ? "btn-save-ready" : undefined}
                  onClick={handleAssignGames}
                  disabled={selectedGameIds.size === 0}
                >
                  Assign {selectedGameIds.size > 0 ? selectedGameIds.size : ""} Selected Game{selectedGameIds.size !== 1 ? "s" : ""}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {rangeGames.length} game{rangeGames.length !== 1 ? "s" : ""} found between {startDate} and {endDate}.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedGameIds(new Set(rangeGames.map((g) => g.id)))}>
                    Select All
                  </Button>
                  {selectedGameIds.size > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setSelectedGameIds(new Set())}>
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {rangeGames.map((g) => (
                    <label key={g.id} className="event-assign-row">
                      <input
                        type="checkbox"
                        checked={selectedGameIds.has(g.id)}
                        onChange={(e) => {
                          const next = new Set(selectedGameIds)
                          if (e.target.checked) next.add(g.id)
                          else next.delete(g.id)
                          setSelectedGameIds(next)
                        }}
                      />
                      <span className="event-assign-date">{g.date}{g.time ? ` ${g.time}` : ""}</span>
                      <span className="event-assign-teams">vs {g.opponent}</span>
                      <span className="event-assign-score">
                        {g.played ? `${g.teamScore ?? "?"} – ${g.opponentScore ?? "?"}` : "—"}
                      </span>
                      {g.location && <span className="event-assign-location">{g.location}</span>}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Add Game — collapsible ─────────────────────── */}
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
              <div className="game-form-field">
                <label className="game-form-label">Round</label>
                <select className="game-form-select" value={newRound} onChange={(e) => setNewRound(e.target.value as TournamentGame["round"])}>
                  {ROUND_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="playdown-config-row">
              <div className="game-form-field">
                <label className="game-form-label">Home Team</label>
                <select className="game-form-select" value={newHome} onChange={(e) => setNewHome(e.target.value)}>
                  <option value="">Select…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="game-form-field">
                <label className="game-form-label">Away Team</label>
                <select className="game-form-select" value={newAway} onChange={(e) => setNewAway(e.target.value)}>
                  <option value="">Select…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="game-form-field">
              <label className="game-form-label">Location</label>
              <input className="game-form-input" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Arena name" />
            </div>
          </div>
        )}
      </div>

      {/* ── Game List ──────────────────────────────────── */}
      {games.length > 0 && (
        <div className="flex flex-col gap-3">
          {config.pools.length > 1 && (
            <div className="import-tabs">
              {config.pools.map((pool, i) => (
                <button
                  key={pool.id}
                  className="import-tab"
                  data-active={activePool === pool.id || undefined}
                  onClick={() => setActivePool(pool.id)}
                >
                  Pool {String.fromCharCode(65 + i)}
                </button>
              ))}
            </div>
          )}
          <div className="games-table-wrap">
            <table className="games-table">
              <thead>
                <tr>
                  <th>Home</th><th>Away</th><th>Date</th><th>Round</th>
                  <th>H</th><th>A</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(activePool
                  ? games.filter((g) => g.poolId === activePool || g.round !== "pool")
                  : games
                ).map((g) => (
                  <tr key={g.id}>
                    <td>{teamMap.get(g.homeTeam) ?? g.homeTeam}</td>
                    <td>{teamMap.get(g.awayTeam) ?? g.awayTeam}</td>
                    <td>{g.date}</td>
                    <td>{g.round}</td>
                    <td>
                      <input type="number" className="games-table-input" value={g.homeScore ?? ""}
                        onChange={(e) => handleScoreChange(g.id, "homeScore", e.target.value)} />
                    </td>
                    <td>
                      <input type="number" className="games-table-input" value={g.awayScore ?? ""}
                        onChange={(e) => handleScoreChange(g.id, "awayScore", e.target.value)} />
                    </td>
                    <td>
                      <button className="games-table-delete" onClick={() => removeGame(tournamentId, g.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Standings Preview ──────────────────────────── */}
      {poolStandings.length > 0 && activePool && (
        <div>
          <h3 className="admin-section-title">Standings Preview</h3>
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th><th>Team</th><th>GP</th><th>W</th><th>L</th><th>T</th>
                <th>Pts</th><th>GF</th><th>GA</th><th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {poolStandings.map((row, i) => {
                const pool = config.pools.find((p) => p.id === activePool)
                return (
                  <tr key={row.teamId} className={`standings-row${i < (pool?.qualifyingSpots ?? 0) ? " playdown-cutoff" : ""}`}>
                    <td>{i + 1}</td><td>{row.teamName}</td>
                    <td>{row.gp}</td><td>{row.w}</td><td>{row.l}</td><td>{row.t}</td>
                    <td>{row.pts}</td><td>{row.gf}</td><td>{row.ga}</td>
                    <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delete Tournament ──────────────────────────── */}
      <div>
        {confirmDelete ? (
          <div className="playdown-config-row">
            <span className="text-destructive text-sm">Delete this tournament?</span>
            <Button
              variant="destructive"
              onClick={async () => {
                await removeTournament(tournamentId)
                window.location.href = `/admin/team/${teamSlug}/events`
              }}
            >
              Confirm Delete
            </Button>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete Tournament
          </Button>
        )}
      </div>
    </div>
  )
}
