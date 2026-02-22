"use client"

import { useEffect, useState } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"
import { createClient } from "@/lib/supabase/client"
import type { Game } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

type SyncResult = { inserted: number; updated: number; skipped: number; errors: string[] }

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
}: {
  teamId: string
  url: string
  syncType: "regular" | "event"
  eventType?: "playdown" | "tournament"
  eventId?: string
  initialLastSynced: string | null
}) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState(initialLastSynced)

  const [syncingStandings, setSyncingStandings] = useState(false)
  const [lastSyncedStandings, setLastSyncedStandings] = useState<string | null>(null)
  const [standingsError, setStandingsError] = useState<string | null>(null)

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
    </div>
  )
}

function SeasonCard({
  title,
  games,
  syncProps,
}: {
  title: string
  games: Game[]
  syncProps?: React.ComponentProps<typeof SyncPanel>
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
          <div className="owha-sync-stat">
            <span className="owha-sync-stat-value">{w}-{l}-{t}</span>
            <span className="owha-sync-stat-label">Record</span>
          </div>
          <div className="owha-sync-stat">
            <span className="owha-sync-stat-value">{scored}</span>
            <span className="owha-sync-stat-label">Played</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminTeamHub() {
  const team = useTeamContext()
  const { games, loading: gamesLoading } = useSupabaseGames(team.id)
  const { opponents } = useSupabaseOpponents(team.id)
  const supabase = createClient()

  const [owhaUrlRegular, setOwhaUrlRegular] = useState<string>("")
  const [owhaLastSynced, setOwhaLastSynced] = useState<string | null>(null)
  const [owhaEvents, setOwhaEvents] = useState<OwhaEventSection[]>([])

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

    Promise.all([
      supabase
        .from("playdowns")
        .select("owha_event, owha_url, owha_last_synced_at")
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
          <div className="owha-sync-stat">
            <span className="owha-sync-stat-value">{opponents.length}</span>
            <span className="owha-sync-stat-label">Opponents</span>
          </div>
        </div>
      </div>

      <SeasonCard
        title="Regular Season"
        games={games.filter((g) => g.gameType === "regular")}
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
        syncProps={{
          teamId: team.id,
          url: "",
          syncType: "event",
          eventType: "tournament",
          eventId: "playoffs",
          initialLastSynced: null,
        }}
      />

      <SeasonCard
        title="Playdowns"
        games={games.filter((g) => g.gameType === "playdowns")}
        syncProps={{
          teamId: team.id,
          url: playdownEvent?.url ?? "",
          syncType: "event",
          eventType: "playdown",
          eventId: "playdown",
          initialLastSynced: playdownEvent?.lastSynced ?? null,
        }}
      />
    </div>
  )
}
