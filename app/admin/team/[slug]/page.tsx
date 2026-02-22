"use client"

import { useEffect, useState } from "react"
import { useTeamContext } from "@/lib/team-context"
import { useSupabaseGames } from "@/hooks/use-supabase-games"
import { useSupabaseStandings } from "@/hooks/use-supabase-standings"
import { useSupabaseOpponents } from "@/hooks/use-supabase-opponents"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { RefreshCw, Info } from "lucide-react"

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

function SyncSection({
  teamId,
  label,
  url,
  lastSynced: initialLastSynced,
  syncType,
  eventType,
  eventId,
  owhaGamedScored,
  owhaGamesScheduled,
  onUrlChange,
}: {
  teamId: string
  label: string
  url: string
  lastSynced: string | null
  syncType: "regular" | "event"
  eventType?: "playdown" | "tournament"
  eventId?: string
  owhaGamedScored: number
  owhaGamesScheduled: number
  onUrlChange?: (url: string) => void
}) {
  const [localUrl, setLocalUrl] = useState(url)
  const [urlDirty, setUrlDirty] = useState(false)
  const [urlSaving, setUrlSaving] = useState(false)
  const [urlSaved, setUrlSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState(initialLastSynced)

  async function handleSaveUrl() {
    setUrlSaving(true)
    const body: Record<string, unknown> = { teamId }
    if (syncType === "regular") {
      body.owha_url_regular = localUrl
    } else if (eventType === "playdown") {
      body.type = "playdown"
      body.owha_event = true
      body.owha_url = localUrl
    } else if (eventType === "tournament" && eventId) {
      body.tournamentId = eventId
      body.owha_event = true
      body.owha_url = localUrl
    }
    await fetch("/api/owha-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setUrlSaving(false)
    setUrlSaved(true)
    setUrlDirty(false)
    onUrlChange?.(localUrl)
    setTimeout(() => setUrlSaved(false), 2000)
  }

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

  const activeUrl = syncType === "regular" ? localUrl : url

  return (
    <div className="owha-sync-section">
      <p className="owha-sync-heading">{label}</p>

      {syncType === "regular" && (
        <div className="flex flex-col gap-1">
          <div className="owha-sync-url-row">
            <input
              className="owha-sync-url-input"
              placeholder="https://www.owha.on.ca/division/1590/14802/games"
              value={localUrl}
              onChange={(e) => { setLocalUrl(e.target.value); setUrlSaved(false); setUrlDirty(true) }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveUrl}
              disabled={urlSaving}
              style={urlDirty ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}
            >
              {urlSaved ? "Saved" : urlSaving ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="owha-sync-tip">
            <Info className="owha-sync-tip-icon" />
            Paste the OWHA division page URL from your browser. If sync stops working, refer to comments labeled "OWHA API" in app/api/owha-sync/route.ts
          </p>
        </div>
      )}

      {syncType === "event" && url && (
        <p className="owha-sync-result">{url}</p>
      )}

      <div className="owha-sync-stats">
        <div className="owha-sync-stat">
          <span className="owha-sync-stat-value">{owhaGamedScored}</span>
          <span className="owha-sync-stat-label">OWHA Games Scored</span>
        </div>
        <div className="owha-sync-stat">
          <span className="owha-sync-stat-value">{owhaGamesScheduled}</span>
          <span className="owha-sync-stat-label">OWHA Games Scheduled</span>
        </div>
        <div className="owha-sync-stat">
          <span className="owha-sync-stat-value" style={{ fontSize: "0.7rem" }}>{formatSynced(lastSynced)}</span>
          <span className="owha-sync-stat-label">Last Sync</span>
        </div>
      </div>

      <div className="owha-sync-url-row">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing || !activeUrl}
          style={activeUrl && !syncing ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}
        >
          <RefreshCw className={syncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {syncing ? "Syncing…" : "Sync OWHA Scores"}
        </Button>
        {result && result.inserted !== undefined && (
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

export default function AdminTeamHub() {
  const team = useTeamContext()
  const { games, loading: gamesLoading } = useSupabaseGames(team.id)
  const { standings } = useSupabaseStandings(team.id)
  const { opponents } = useSupabaseOpponents(team.id)
  const supabase = createClient()

  const [owhaUrlRegular, setOwhaUrlRegular] = useState<string>("")
  const [owhaLastSynced, setOwhaLastSynced] = useState<string | null>(null)
  const [owhaEvents, setOwhaEvents] = useState<OwhaEventSection[]>([])

  useEffect(() => {
    // Load team OWHA config
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

    // Load OWHA event sections (playdowns + tournaments with owha_event=true)
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

  const played = games.filter((g) => g.played)
  const wins = played.filter((g) => g.result === "W").length
  const losses = played.filter((g) => g.result === "L").length
  const ties = played.filter((g) => g.result === "T").length

  const owhaGames = games.filter((g) => g.source === "owha" && g.gameType === "regular")
  const owhaScored = owhaGames.filter((g) => g.played).length
  const owhaScheduled = owhaGames.filter((g) => !g.played).length

  return (
    <div className="flex flex-col gap-4">
      <div className="admin-page-heading">
        <div>
          <h1 className="admin-section-title">{team.organization} {team.name}</h1>
          <p className="admin-team-meta">{team.age_group.toUpperCase()} · {team.level.toUpperCase()}</p>
        </div>
      </div>

      <div className="dashboard-records">
        <div className="dashboard-record-card">
          <p className="dashboard-record">{wins}-{losses}-{ties}</p>
          <p className="dashboard-record-label">Record</p>
        </div>
        <div className="dashboard-record-card">
          <p className="dashboard-record">{games.length}</p>
          <p className="dashboard-record-label">Total Games</p>
        </div>
        <div className="dashboard-record-card">
          <p className="dashboard-record">{opponents.length}</p>
          <p className="dashboard-record-label">Opponents</p>
        </div>
        <div className="dashboard-record-card">
          <p className="dashboard-record">{standings ? standings.rows.length : 0}</p>
          <p className="dashboard-record-label">Standings Rows</p>
        </div>
      </div>

      <SyncSection
        teamId={team.id}
        label="Regular Season — OWHA Sync"
        url={owhaUrlRegular}
        lastSynced={owhaLastSynced}
        syncType="regular"
        owhaGamedScored={owhaScored}
        owhaGamesScheduled={owhaScheduled}
        onUrlChange={setOwhaUrlRegular}
      />

      {owhaEvents.map((ev) => {
        const evGames = games.filter(
          (g) =>
            g.source === "owha" &&
            (ev.eventType === "playdown" ? g.gameType === "playdowns" : g.gameType === "tournament")
        )
        return (
          <SyncSection
            key={`${ev.eventType}-${ev.eventId}`}
            teamId={team.id}
            label={`${ev.label} — OWHA Sync`}
            url={ev.url}
            lastSynced={ev.lastSynced}
            syncType="event"
            eventType={ev.eventType}
            eventId={ev.eventId}
            owhaGamedScored={evGames.filter((g) => g.played).length}
            owhaGamesScheduled={evGames.filter((g) => !g.played).length}
          />
        )
      })}
    </div>
  )
}
