"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, ChevronRight, ChevronDown, Plus } from "lucide-react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import type { TournamentConfig, TournamentPool } from "@/lib/types"

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function AdminEventsPage() {
  const team = useTeamContext()
  const router = useRouter()
  const { playdown, setConfig, loading: pdLoading } = useSupabasePlaydowns(team.id)
  const { tournaments, addTournament, updateConfig, loading: tLoading } = useSupabaseTournaments(team.id)
  const loading = pdLoading || tLoading
  const playoffsTournament = tournaments.find((t) => t.config.id === "playoffs")
  const namedTournaments = tournaments.filter((t) => t.config.id !== "playoffs")

  const [pdOpen, setPdOpen] = useState(false)
  const [totalTeams, setTotalTeams] = useState(0)
  const [qualifyingSpots, setQualifyingSpots] = useState(0)
  const [gamesPerMatchup, setGamesPerMatchup] = useState(1)

  // Tournament expandable state
  const [openTournamentId, setOpenTournamentId] = useState<string | null>(null)
  const [trnName, setTrnName] = useState("")
  const [trnTeams, setTrnTeams] = useState(0)
  const [trnQualifying, setTrnQualifying] = useState(2)
  const [trnGamesPerMatchup, setTrnGamesPerMatchup] = useState(1)
  const [trnPools, setTrnPools] = useState(1)

  useEffect(() => {
    if (playdown?.config) {
      setTotalTeams(playdown.config.totalTeams)
      setQualifyingSpots(playdown.config.qualifyingSpots)
      setGamesPerMatchup(playdown.config.gamesPerMatchup)
    }
  }, [playdown?.config])

  function openTournament(id: string) {
    if (openTournamentId === id) {
      setOpenTournamentId(null)
      return
    }
    const t = tournaments.find((t) => t.config.id === id)
    if (!t) return
    setTrnName(t.config.name)
    setTrnTeams(t.config.teams.length)
    setTrnQualifying(t.config.pools[0]?.qualifyingSpots ?? 2)
    setTrnGamesPerMatchup(t.config.gamesPerMatchup)
    setTrnPools(t.config.pools.length)
    setOpenTournamentId(id)
  }

  function saveTournamentField(tournamentId: string, field: string, value: string | number) {
    const t = tournaments.find((t) => t.config.id === tournamentId)
    if (!t) return
    const cfg = t.config

    if (field === "name" && value !== cfg.name) {
      updateConfig(tournamentId, { ...cfg, name: value as string })
    } else if (field === "gamesPerMatchup" && value !== cfg.gamesPerMatchup) {
      updateConfig(tournamentId, { ...cfg, gamesPerMatchup: value as number })
    } else if (field === "qualifyingSpots") {
      const newPools = cfg.pools.map((p) => ({ ...p, qualifyingSpots: value as number }))
      if (JSON.stringify(newPools) !== JSON.stringify(cfg.pools)) {
        updateConfig(tournamentId, { ...cfg, pools: newPools })
      }
    } else if (field === "pools") {
      const target = value as number
      if (target === cfg.pools.length) return
      let newPools = [...cfg.pools]
      if (target > cfg.pools.length) {
        for (let i = cfg.pools.length; i < target; i++) {
          const letter = String.fromCharCode(65 + i)
          newPools.push({
            id: generateId("pool"),
            name: `Pool ${letter}`,
            teamIds: [],
            qualifyingSpots: trnQualifying,
          })
        }
      } else {
        newPools = newPools.slice(0, target)
      }
      updateConfig(tournamentId, { ...cfg, pools: newPools })
    }
  }

  async function handleNewTournament() {
    const id = generateId("trn")
    const initialPool: TournamentPool = {
      id: generateId("pool"),
      name: "Pool A",
      teamIds: [],
      qualifyingSpots: 2,
    }
    const config: TournamentConfig = {
      id,
      teamId: team.id,
      name: "",
      location: "",
      startDate: "",
      endDate: "",
      pools: [initialPool],
      teams: [],
      gamesPerMatchup: 1,
      tiebreakerOrder: ["wins", "head-to-head", "goal-differential", "goals-allowed", "goals-for"],
      eliminationEnabled: false,
      consolationEnabled: false,
    }
    await addTournament(config)
    setTrnName("")
    setTrnTeams(0)
    setTrnQualifying(2)
    setTrnGamesPerMatchup(1)
    setTrnPools(1)
    setOpenTournamentId(id)
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-page-heading">
        <h1 className="ob-page-title">Events</h1>
      </div>

      {/* Create tournament */}
      <div className="import-section">
        <h2 className="admin-section-title">Create New Tournament</h2>
        <p className="text-sm text-muted-foreground">
          Named tournaments support multiple pools, tiebreaker ordering, and importing games directly from your schedule by date range.
        </p>
        <button className="event-create-card" onClick={handleNewTournament}>
          <Plus className="event-create-icon" />
          <span className="event-create-label">New Tournament</span>
          <span className="event-create-sub">Pool play · date range · game assignment from schedule</span>
        </button>
      </div>

      {/* Year events: Regular Season, Playoffs, Playdowns, then named tournaments */}
      <div className="flex flex-col gap-2">
        <h2 className="admin-section-title">Season Events</h2>

        {/* Playdowns */}
        <div className="event-card-expandable">
          <button
            className="event-card"
            onClick={() => setPdOpen((o) => !o)}
          >
            <div className="event-card-info">
              <CalendarDays className="event-card-icon" />
              <div>
                <p className="event-card-title">Playdowns</p>
                <p className="event-card-meta">
                  {playdown
                    ? `${playdown.config.totalTeams} teams · ${playdown.config.qualifyingSpots} qualifying · ${playdown.games.length} games`
                    : "Not configured yet"}
                </p>
              </div>
            </div>
            {pdOpen ? <ChevronDown className="event-card-arrow" /> : <ChevronRight className="event-card-arrow" />}
          </button>
          {pdOpen && (
            <div className="collapsible-body">
              <div className="playdown-config-row">
                <div className="game-form-field">
                  <label className="game-form-label">Number of Teams</label>
                  <input
                    className="game-form-input"
                    type="number"
                    min={0}
                    value={totalTeams}
                    onChange={(e) => setTotalTeams(parseInt(e.target.value, 10) || 0)}
                    onBlur={() => {
                      if (playdown && totalTeams !== playdown.config.totalTeams) {
                        setConfig({ ...playdown.config, totalTeams })
                      }
                    }}
                  />
                </div>
                <div className="game-form-field">
                  <label className="game-form-label">Number of Qualifiers</label>
                  <input
                    className="game-form-input"
                    type="number"
                    min={0}
                    value={qualifyingSpots}
                    onChange={(e) => setQualifyingSpots(parseInt(e.target.value, 10) || 0)}
                    onBlur={() => {
                      if (playdown && qualifyingSpots !== playdown.config.qualifyingSpots) {
                        setConfig({ ...playdown.config, qualifyingSpots })
                      }
                    }}
                  />
                </div>
                <div className="game-form-field">
                  <label className="game-form-label">Games per Matchup</label>
                  <input
                    className="game-form-input"
                    type="number"
                    min={1}
                    value={gamesPerMatchup}
                    onChange={(e) => setGamesPerMatchup(parseInt(e.target.value, 10) || 1)}
                    onBlur={() => {
                      if (playdown && gamesPerMatchup !== playdown.config.gamesPerMatchup) {
                        setConfig({ ...playdown.config, gamesPerMatchup })
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Playoffs */}
        <button
          className="event-card"
          onClick={() => router.push(`/admin/team/${team.slug}/events/playoffs`)}
        >
          <div className="event-card-info">
            <CalendarDays className="event-card-icon" />
            <div>
              <p className="event-card-title">Playoffs</p>
              <p className="event-card-meta">
                {playoffsTournament
                  ? `${playoffsTournament.config.teams.length} teams · ${playoffsTournament.games.length} games`
                  : "Not configured yet"}
              </p>
            </div>
          </div>
          <ChevronRight className="event-card-arrow" />
        </button>

        {/* Named tournaments */}
        {namedTournaments.map((t) => {
          const isOpen = openTournamentId === t.config.id
          return (
            <div key={t.config.id} className="event-card-expandable">
              <button
                className="event-card"
                onClick={() => openTournament(t.config.id)}
              >
                <div className="event-card-info">
                  <CalendarDays className="event-card-icon" />
                  <div>
                    <p className="event-card-title">{t.config.name || "Untitled Tournament"}</p>
                    <p className="event-card-meta">
                      {t.config.teams.length} teams · {t.config.pools.length} pools · {t.games.length} games
                      {t.config.startDate ? ` · ${t.config.startDate}` : ""}
                    </p>
                  </div>
                </div>
                {isOpen ? <ChevronDown className="event-card-arrow" /> : <ChevronRight className="event-card-arrow" />}
              </button>
              {isOpen && (
                <div className="collapsible-body">
                  <div className="game-form-field">
                    <label className="game-form-label">Tournament Name</label>
                    <input
                      className="game-form-input"
                      type="text"
                      value={trnName}
                      onChange={(e) => setTrnName(e.target.value)}
                      onBlur={() => saveTournamentField(t.config.id, "name", trnName)}
                      placeholder="e.g. Silver Stick Regional"
                    />
                  </div>
                  <div className="playdown-config-row">
                    <div className="game-form-field">
                      <label className="game-form-label">Pools</label>
                      <input
                        className="game-form-input"
                        type="number"
                        min={1}
                        value={trnPools}
                        onChange={(e) => setTrnPools(parseInt(e.target.value, 10) || 1)}
                        onBlur={() => saveTournamentField(t.config.id, "pools", trnPools)}
                      />
                    </div>
                    <div className="game-form-field">
                      <label className="game-form-label">Teams</label>
                      <input
                        className="game-form-input"
                        type="number"
                        min={0}
                        value={trnTeams}
                        disabled
                      />
                    </div>
                    <div className="game-form-field">
                      <label className="game-form-label">Qualifiers per Pool</label>
                      <input
                        className="game-form-input"
                        type="number"
                        min={0}
                        value={trnQualifying}
                        onChange={(e) => setTrnQualifying(parseInt(e.target.value, 10) || 0)}
                        onBlur={() => saveTournamentField(t.config.id, "qualifyingSpots", trnQualifying)}
                      />
                    </div>
                    <div className="game-form-field">
                      <label className="game-form-label">Games per Matchup</label>
                      <input
                        className="game-form-input"
                        type="number"
                        min={1}
                        value={trnGamesPerMatchup}
                        onChange={(e) => setTrnGamesPerMatchup(parseInt(e.target.value, 10) || 1)}
                        onBlur={() => saveTournamentField(t.config.id, "gamesPerMatchup", trnGamesPerMatchup)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
