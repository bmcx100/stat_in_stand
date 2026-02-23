"use client"

import { useEffect, useState } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { createClient } from "@/lib/supabase/client"
import type { Game } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { RefreshCw, Check } from "lucide-react"

type SyncResult = { inserted: number; updated: number; skipped: number; errors: string[] }
type MhrSyncResult = { inserted?: number; updated?: number; skipped?: number; errors?: string[]; week?: number; teamCount?: number; ourRanking?: number | null }

type OwhaEventSection = {
  label: string
  url: string
  lastSynced: string | null
  eventType: "playdown" | "tournament"
  eventId: string
}

function formatSynced(ts: string | null): string {
  if (!ts) return "Never"
  return new Date(ts).toLocaleString("en-CA", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  })
}

function gameRecord(games: Game[]) {
  const played = games.filter((g) => g.played)
  return {
    w: played.filter((g) => g.result === "W").length,
    l: played.filter((g) => g.result === "L").length,
    t: played.filter((g) => g.result === "T").length,
    scored: played.length,
    scheduled: games.filter((g) => !g.played).length,
  }
}

function SyncPanel({
  teamId,
  url,
  syncType,
  eventType,
  eventId,
  initialLastSynced,
  onTeamNamesUpdate,
}: {
  teamId: string
  url: string
  syncType: "regular" | "event" | "playoffs"
  eventType?: "playdown" | "tournament"
  eventId?: string
  initialLastSynced: string | null
  onTeamNamesUpdate?: (info: { teamNames: string[]; totalTeams: number; qualifyingSpots: number }) => void
}) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState(initialLastSynced)

  const [syncingStandings, setSyncingStandings] = useState(false)
  const [lastSyncedStandings, setLastSyncedStandings] = useState<string | null>(null)
  const [standingsError, setStandingsError] = useState<string | null>(null)
  const [standingsTeamNames, setStandingsTeamNames] = useState<string[] | null>(null)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    setSyncError(null)
    try {
      const body: Record<string, unknown> = { teamId, type: syncType }
      if (syncType === "event") {
        body.eventType = eventType
        body.eventId = eventId
      }
      if (syncType === "playoffs") {
        body.type = "playoffs"
      }
      const res = await fetch("/api/owha-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setSyncError(data.error ?? "Sync failed")
      } else {
        setResult(data)
        setLastSynced(new Date().toISOString())
      }
    } catch (err) {
      setSyncError(String(err))
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncStandings() {
    setSyncingStandings(true)
    setStandingsError(null)
    try {
      const body: Record<string, unknown> = { teamId, type: "standings" }
      if (syncType === "event") {
        body.eventType = eventType
        body.eventId = eventId
      }
      if (syncType === "playoffs") {
        body.type = "playoffs-standings"
      }
      const res = await fetch("/api/owha-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setStandingsError(data.error ?? "Sync failed")
      } else {
        setLastSyncedStandings(new Date().toISOString())
        if (data.teamNames?.length) {
          setStandingsTeamNames(data.teamNames)
          onTeamNamesUpdate?.({
            teamNames: data.teamNames,
            totalTeams: data.totalTeams ?? data.teamNames.length,
            qualifyingSpots: data.qualifyingSpots ?? 0,
          })
        }
      }
    } catch (err) {
      setStandingsError(String(err))
    } finally {
      setSyncingStandings(false)
    }
  }

  return (
    <div className="overview-sync-row">
      <div className="sync-btn-group">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncStandings}
          disabled={syncingStandings || !url}
          className="sync-btn-padded"
          style={url && !syncingStandings ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}
        >
          <RefreshCw className={syncingStandings ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {syncingStandings ? "Syncing…" : "Sync Standings"}
        </Button>
        <span className="sync-last-date">{formatSynced(lastSyncedStandings)}</span>
        {standingsError && <span className="owha-sync-result-error">{standingsError}</span>}
      </div>

      <div className="sync-btn-group">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing || !url}
          className="sync-btn-padded"
          style={url && !syncing ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}
        >
          <RefreshCw className={syncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {syncing ? "Syncing…" : "Sync Games"}
        </Button>
        <span className="sync-last-date">{formatSynced(lastSynced)}</span>
        {(result && result.inserted !== undefined) && (
          <span className="owha-sync-result">
            {result.inserted} added · {result.updated} updated · {result.skipped} unchanged
            {result.errors?.length > 0 ? ` · ${result.errors.length} error(s)` : ""}
          </span>
        )}
        {syncError && <span className="owha-sync-result-error">{syncError}</span>}
      </div>
    </div>
  )
}

function MhrSyncPanel({
  teamId,
  syncType,
  initialLastSynced,
  hasConfig,
}: {
  teamId: string
  syncType: "games" | "rankings"
  initialLastSynced: string | null
  hasConfig: boolean
}) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<MhrSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState(initialLastSynced)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    setSyncError(null)
    try {
      const res = await fetch("/api/mhr-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, type: syncType }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setSyncError(data.error ?? "Sync failed")
      } else {
        setResult(data)
        setLastSynced(new Date().toISOString())
      }
    } catch (err) {
      setSyncError(String(err))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="overview-sync-row">
      <div className="sync-btn-group">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing || !hasConfig}
          className="sync-btn-padded"
          style={hasConfig && !syncing ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}
        >
          <RefreshCw className={syncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {syncing ? "Syncing…" : syncType === "games" ? "Sync Games" : "Sync Rankings"}
        </Button>
        <span className="sync-last-date">{formatSynced(lastSynced)}</span>
        {result && syncType === "games" && result.inserted !== undefined && (
          <span className="owha-sync-result">
            {result.inserted} added · {result.updated} updated · {result.skipped} unchanged
            {result.errors?.length ? ` · ${result.errors.length} error(s)` : ""}
          </span>
        )}
        {result && syncType === "rankings" && result.week !== undefined && (
          <span className="owha-sync-result">
            Week {String(result.week).slice(-2)} · {result.teamCount} teams
            {result.ourRanking != null ? ` · Ranked #${result.ourRanking}` : ""}
          </span>
        )}
        {syncError && <span className="owha-sync-result-error">{syncError}</span>}
      </div>
    </div>
  )
}

type StandingsCompare = { w: number; l: number; t: number; gp: number }

function MismatchStat({
  value,
  standingsValue,
  label,
  showCheck,
}: {
  value: string | number
  standingsValue?: string | number
  label: string
  showCheck?: boolean
}) {
  const hasComparison = standingsValue !== undefined
  const mismatch = hasComparison && String(value) !== String(standingsValue)
  const match = showCheck || (hasComparison && !mismatch)
  return (
    <div className="owha-sync-stat">
      {match && <Check className="stat-match-check" />}
      <span className={mismatch ? "stat-mismatch-wrap" : undefined}>
        <span className={`owha-sync-stat-value${mismatch ? " stat-mismatch-value" : ""}`}>{value}</span>
        {mismatch && (
          <>
            <span className="stat-stnd-mobile">stnd: {standingsValue}</span>
            <span className="stat-tooltip">Standings: {standingsValue}</span>
          </>
        )}
      </span>
      <span className="owha-sync-stat-label">{label}</span>
    </div>
  )
}

function SeasonCard({
  title,
  games,
  syncProps,
  standingsCompare,
  showCheck,
  loopInfo,
}: {
  title: string
  games: Game[]
  syncProps?: React.ComponentProps<typeof SyncPanel>
  standingsCompare?: StandingsCompare
  showCheck?: boolean
  loopInfo?: { teamNames: string[]; totalTeams: number; qualifyingSpots: number }
}) {
  const { w, l, t, scored } = gameRecord(games)
  return (
    <div className="owha-sync-section">
      <div className="owha-sync-header">
        <p className="owha-sync-heading">{title}</p>
      </div>
      <div className="season-card-row">
        <div className="season-half">
          {syncProps && <SyncPanel {...syncProps} />}
        </div>
        <div className="season-half">
          <MismatchStat
            value={`${w}-${l}-${t}`}
            standingsValue={standingsCompare ? `${standingsCompare.w}-${standingsCompare.l}-${standingsCompare.t}` : undefined}
            label="Record"
            showCheck={showCheck}
          />
          <MismatchStat
            value={scored}
            standingsValue={standingsCompare?.gp}
            label="Played"
            showCheck={showCheck}
          />
        </div>
      </div>
      {loopInfo && (
        <div className="playdown-loop-card">
          <p className="playdown-loop-header">Loop: {loopInfo.qualifyingSpots} of {loopInfo.totalTeams} teams advance{"gamesPerMatchup" in loopInfo && loopInfo.gamesPerMatchup ? ` · ${loopInfo.gamesPerMatchup} games / matchup` : ""}</p>
          <div className="playdown-loop-teams">
            {loopInfo.teamNames.map((name, i) => (
              <span key={name} className="playdown-loop-team">
                {i > 0 && <span className="playdown-loop-sep"> | </span>}
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminTeamHub() {
  const team = useTeamContext()
  const { games, loading: gamesLoading } = useSupabaseGames(team.id)
  const { standingsMap } = useSupabaseStandings(team.id)
  const supabase = createClient()

  const [owhaUrlRegular, setOwhaUrlRegular] = useState<string>("")
  const [owhaLastSynced, setOwhaLastSynced] = useState<string | null>(null)
  const [owhaEvents, setOwhaEvents] = useState<OwhaEventSection[]>([])
  const [playdownLoopInfo, setPlaydownLoopInfo] = useState<{ teamNames: string[]; totalTeams: number; qualifyingSpots: number; gamesPerMatchup?: number } | null>(null)
  const [mhrTeamNbr, setMhrTeamNbr] = useState<number | null>(null)
  const [mhrDivNbr, setMhrDivNbr] = useState<number | null>(null)
  const [mhrLastSynced, setMhrLastSynced] = useState<string | null>(null)
  const [mhrRankingsLastSynced, setMhrRankingsLastSynced] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from("teams")
      .select("owha_url_regular, owha_last_synced_at")
      .eq("id", team.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setOwhaUrlRegular(data.owha_url_regular ?? "")
          setOwhaLastSynced(data.owha_last_synced_at ?? null)
        }
      })

    supabase
      .from("mhr_config")
      .select("team_nbr, div_nbr, last_synced_at, rankings_last_synced_at")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMhrTeamNbr(data.team_nbr ?? null)
          setMhrDivNbr(data.div_nbr ?? null)
          setMhrLastSynced(data.last_synced_at ?? null)
          setMhrRankingsLastSynced(data.rankings_last_synced_at ?? null)
        }
      })

    Promise.all([
      supabase
        .from("playdowns")
        .select("owha_event, owha_url, owha_last_synced_at, config")
        .eq("team_id", team.id)
        .maybeSingle(),
      supabase
        .from("tournaments")
        .select("tournament_id, config, owha_event, owha_url, owha_last_synced_at")
        .eq("team_id", team.id)
        .eq("owha_event", true),
    ]).then(([pdRes, trnRes]) => {
      const sections: OwhaEventSection[] = []
      if (pdRes.data?.owha_event) {
        sections.push({
          label: "Playdowns",
          url: pdRes.data.owha_url ?? "",
          lastSynced: pdRes.data.owha_last_synced_at ?? null,
          eventType: "playdown",
          eventId: "playdown",
        })
        const cfg = pdRes.data.config as { teamNames?: string[]; totalTeams?: number; qualifyingSpots?: number; gamesPerMatchup?: number } | null
        if (cfg?.teamNames?.length) {
          setPlaydownLoopInfo({
            teamNames: cfg.teamNames,
            totalTeams: cfg.totalTeams ?? cfg.teamNames.length,
            qualifyingSpots: cfg.qualifyingSpots ?? 0,
            gamesPerMatchup: cfg.gamesPerMatchup || undefined,
          })
        }
      }
      for (const t of trnRes.data ?? []) {
        if (t.owha_event) {
          sections.push({
            label: (t.config as { name?: string })?.name || "Tournament",
            url: t.owha_url ?? "",
            lastSynced: t.owha_last_synced_at ?? null,
            eventType: "tournament",
            eventId: t.tournament_id,
          })
        }
      }
      setOwhaEvents(sections)
    })
  }, [team.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (gamesLoading) {
    return <p className="text-muted-foreground">Loading...</p>
  }

  const playdownEvent = owhaEvents.find((e) => e.eventType === "playdown")

  function normTeam(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
  }
  const regularStandings = standingsMap["regular"]
  const myStandingsRow = regularStandings?.rows.find((r) => {
    const rowN = normTeam(r.teamName)
    const fullN = normTeam(`${team.organization} ${team.name}`)
    const nameN = normTeam(team.name)
    const orgN = normTeam(team.organization)
    return rowN === fullN || rowN.includes(nameN) || rowN.includes(orgN) || fullN.includes(rowN)
  })
  const standingsCompare: StandingsCompare | undefined = myStandingsRow
    ? { w: myStandingsRow.w, l: myStandingsRow.l, t: myStandingsRow.t, gp: myStandingsRow.gp }
    : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="admin-page-heading">
        <p className="admin-team-title">
          {team.organization} {team.name} · {team.age_group.toUpperCase()} · {team.level.toUpperCase()}
        </p>
      </div>

      <div className="owha-sync-section">
        <div className="owha-sync-header">
          <p className="owha-sync-heading">Overall</p>
        </div>
        <div className="owha-sync-stats">
          <div className="owha-sync-stat">
            <span className="owha-sync-stat-value">{gameRecord(games).w}-{gameRecord(games).l}-{gameRecord(games).t}</span>
            <span className="owha-sync-stat-label">Overall Record</span>
          </div>
          <div className="owha-sync-stat">
            <span className="owha-sync-stat-value">{games.length}</span>
            <span className="owha-sync-stat-label">Total Games</span>
          </div>
        </div>
      </div>

      <SeasonCard
        title="Regular Season"
        games={games.filter((g) => g.gameType === "regular")}
        standingsCompare={standingsCompare}
        syncProps={{
          teamId: team.id,
          url: owhaUrlRegular,
          syncType: "regular",
          initialLastSynced: owhaLastSynced,
        }}
      />

      <SeasonCard
        title="Playoffs"
        games={games.filter((g) => g.gameType === "playoffs")}
        showCheck
        syncProps={{
          teamId: team.id,
          url: owhaUrlRegular,
          syncType: "playoffs",
          initialLastSynced: null,
        }}
      />

      <SeasonCard
        title="Playdowns"
        games={games.filter((g) => g.gameType === "playdowns")}
        showCheck
        loopInfo={playdownLoopInfo ?? undefined}
        syncProps={{
          teamId: team.id,
          url: playdownEvent?.url ?? "",
          syncType: "event",
          eventType: "playdown",
          eventId: "playdown",
          initialLastSynced: playdownEvent?.lastSynced ?? null,
          onTeamNamesUpdate: (info) => setPlaydownLoopInfo((prev) => ({ gamesPerMatchup: prev?.gamesPerMatchup, ...info })),
        }}
      />

      <div className="owha-sync-section">
        <div className="owha-sync-header">
          <p className="owha-sync-heading">MHR Games</p>
        </div>
        <div className="season-card-row">
          <div className="season-half">
            <MhrSyncPanel
              teamId={team.id}
              syncType="games"
              initialLastSynced={mhrLastSynced}
              hasConfig={!!mhrTeamNbr}
            />
          </div>
          <div className="season-half">
            {(() => {
              const mhrGames = games.filter((g) => g.source === "mhr")
              const { w, l, t, scored } = gameRecord(mhrGames)
              return (
                <>
                  <MismatchStat value={`${w}-${l}-${t}`} label="Record" showCheck />
                  <MismatchStat value={scored} label="Played" showCheck />
                </>
              )
            })()}
          </div>
        </div>
      </div>

      <div className="owha-sync-section">
        <div className="owha-sync-header">
          <p className="owha-sync-heading">MHR Rankings</p>
        </div>
        <div className="season-card-row">
          <div className="season-half">
            <MhrSyncPanel
              teamId={team.id}
              syncType="rankings"
              initialLastSynced={mhrRankingsLastSynced}
              hasConfig={!!mhrDivNbr}
            />
          </div>
          <div className="season-half">
            <MismatchStat value={mhrDivNbr ? "Configured" : "Not set"} label="Division" showCheck={!!mhrDivNbr} />
          </div>
        </div>
      </div>
    </div>
  )
}
