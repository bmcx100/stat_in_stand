"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Vault, LayoutDashboard, Settings, LogOut, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { TeamStatus, StatusColor } from "@/app/api/team-status/route"

type Team = {
  id: string
  slug: string
  organization: string
  name: string
  age_group: string
  level: string
  owha_url_regular: string | null
}

type TeamConfig = {
  teamId: string
  hasOwha: boolean
  hasPlaydowns: boolean
  hasMhrGames: boolean
  hasMhrRankings: boolean
}

type SyncType =
  | "regular-games"
  | "regular-standings"
  | "playoffs-games"
  | "playoffs-standings"
  | "playdowns-games"
  | "playdowns-standings"
  | "mhr-games"
  | "mhr-rankings"

type TeamRowResult = {
  status: "pending" | "running" | "skipped" | "done" | "error"
  message: string
  syncStatus?: TeamStatus
}

const SYNC_TYPES: { key: SyncType; label: string }[] = [
  { key: "regular-games",       label: "Regular Games" },
  { key: "regular-standings",   label: "Regular Standings" },
  { key: "playoffs-games",      label: "Playoffs Games" },
  { key: "playoffs-standings",  label: "Playoffs Standings" },
  { key: "playdowns-games",     label: "Playdowns Games" },
  { key: "playdowns-standings", label: "Playdowns Standings" },
  { key: "mhr-games",           label: "MHR Games" },
  { key: "mhr-rankings",        label: "MHR Rankings" },
]

function isConfigured(config: TeamConfig, type: SyncType): boolean {
  switch (type) {
    case "regular-games":
    case "regular-standings":
    case "playoffs-games":
    case "playoffs-standings":
      return config.hasOwha
    case "playdowns-games":
    case "playdowns-standings":
      return config.hasPlaydowns
    case "mhr-games":
      return config.hasMhrGames
    case "mhr-rankings":
      return config.hasMhrRankings
  }
}

function buildSyncBody(teamId: string, type: SyncType): { url: string; body: Record<string, unknown> } {
  switch (type) {
    case "regular-games":
      return { url: "/api/owha-sync", body: { teamId, type: "regular" } }
    case "regular-standings":
      return { url: "/api/owha-sync", body: { teamId, type: "standings" } }
    case "playoffs-games":
      return { url: "/api/owha-sync", body: { teamId, type: "playoffs" } }
    case "playoffs-standings":
      return { url: "/api/owha-sync", body: { teamId, type: "playoffs-standings" } }
    case "playdowns-games":
      return { url: "/api/owha-sync", body: { teamId, type: "event", eventType: "playdown", eventId: "playdown" } }
    case "playdowns-standings":
      return { url: "/api/owha-sync", body: { teamId, type: "standings", eventType: "playdown", eventId: "playdown" } }
    case "mhr-games":
      return { url: "/api/mhr-sync", body: { teamId, type: "games" } }
    case "mhr-rankings":
      return { url: "/api/mhr-sync", body: { teamId, type: "rankings" } }
  }
}

function formatResult(data: Record<string, unknown>): string {
  if (data.inserted !== undefined) {
    const parts = [`${data.inserted} added`, `${data.updated} updated`, `${data.skipped} unchanged`]
    if ((data.errors as string[])?.length) parts.push(`${(data.errors as string[]).length} error(s)`)
    return parts.join(" · ")
  }
  if (data.synced !== undefined) return `${data.synced} synced`
  if (data.week !== undefined) return `Week ${String(data.week).slice(-2)} · ${data.teamCount} teams`
  return "Done"
}

const STATUS_LABELS: Record<StatusColor, string> = {
  green: "OK",
  yellow: "Mismatch",
  red: "Never synced",
  grey: "Not configured",
}

function StatusDot({ color, label }: { color: StatusColor; label: string }) {
  return (
    <div
      className={`status-dot status-dot-${color}`}
      title={`${label}: ${STATUS_LABELS[color]}`}
      style={{ cursor: "default" }}
    />
  )
}

function InlineStatus({ status }: { status: TeamStatus | undefined }) {
  if (!status) return null
  return (
    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
      <StatusDot color={status.regular}      label="Regular" />
      <StatusDot color={status.playoffs}     label="Playoffs" />
      <StatusDot color={status.playdowns}    label="Playdowns" />
      <StatusDot color={status.mhrGames}     label="MHR Games" />
      <StatusDot color={status.mhrRankings}  label="MHR Rankings" />
    </div>
  )
}

const LEVEL_RANK: Record<string, number> = { AAA: 0, AA: 1, A: 2, BB: 3, B: 4, C: 5 }
function sortTeams<T extends { age_group: string; level: string; organization: string; name: string }>(teams: T[]): T[] {
  return [...teams].sort((a, b) =>
    a.organization.localeCompare(b.organization) ||
    a.name.localeCompare(b.name) ||
    a.age_group.localeCompare(b.age_group, undefined, { sensitivity: "base" }) ||
    (LEVEL_RANK[a.level.toUpperCase()] ?? 99) - (LEVEL_RANK[b.level.toUpperCase()] ?? 99)
  )
}

export default function BulkSyncPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [configs, setConfigs] = useState<Record<string, TeamConfig>>({})
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [results, setResults] = useState<Record<string, TeamRowResult>>({})
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string>("")
  const [activeType, setActiveType] = useState<SyncType | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/admin"); return }

      const { data: adminRows } = await supabase
        .from("team_admins")
        .select("role")
        .eq("user_id", user.id)

      const superAdmin = adminRows?.some((r) => r.role === "super_admin") ?? false
      setIsSuperAdmin(superAdmin)
      if (!superAdmin) { router.replace("/admin/dashboard"); return }

      const { data: allTeams } = await supabase
        .from("teams")
        .select("id, slug, organization, name, age_group, level, owha_url_regular")
      const sorted = sortTeams(allTeams ?? [])
      setTeams(sorted)

      if (sorted.length > 0) {
        const ids = sorted.map((t) => t.id)
        const [{ data: playdowns }, { data: mhrConfigs }] = await Promise.all([
          supabase.from("playdowns").select("team_id, owha_url").in("team_id", ids),
          supabase.from("mhr_config").select("team_id, team_nbr, div_nbr").in("team_id", ids),
        ])

        const configMap: Record<string, TeamConfig> = {}
        for (const team of sorted) {
          const pd = playdowns?.find((p) => p.team_id === team.id)
          const mhr = mhrConfigs?.find((m) => m.team_id === team.id)
          configMap[team.id] = {
            teamId: team.id,
            hasOwha: !!team.owha_url_regular,
            hasPlaydowns: !!pd?.owha_url,
            hasMhrGames: !!mhr?.team_nbr,
            hasMhrRankings: !!mhr?.div_nbr,
          }
        }
        setConfigs(configMap)

        // Initial status fetch
        const statusRes = await fetch("/api/team-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamIds: ids }),
        })
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setResults((prev) => {
            const next = { ...prev }
            for (const id of ids) {
              next[id] = { status: "pending", message: "", syncStatus: statusData[id] }
            }
            return next
          })
        }
      }

      setLoading(false)
    }
    load()
  }, [router, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshStatus(teamId: string) {
    const res = await fetch("/api/team-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: [teamId] }),
    })
    if (res.ok) {
      const data = await res.json()
      setResults((prev) => ({
        ...prev,
        [teamId]: { ...prev[teamId], syncStatus: data[teamId] },
      }))
    }
  }

  async function runBulkSync(type: SyncType) {
    setRunning(true)
    setActiveType(type)

    // Reset results
    setResults((prev) => {
      const next = { ...prev }
      for (const team of teams) {
        next[team.id] = { status: "pending", message: "", syncStatus: prev[team.id]?.syncStatus }
      }
      return next
    })

    const configured = teams.filter((t) => isConfigured(configs[t.id] ?? { teamId: t.id, hasOwha: false, hasPlaydowns: false, hasMhrGames: false, hasMhrRankings: false }, type))
    const total = teams.length
    let done = 0

    for (const team of teams) {
      const config = configs[team.id]
      if (!config || !isConfigured(config, type)) {
        setResults((prev) => ({
          ...prev,
          [team.id]: { ...prev[team.id], status: "skipped", message: "Not configured" },
        }))
        continue
      }

      done++
      setProgress(`Syncing ${done} of ${configured.length}…`)
      setResults((prev) => ({
        ...prev,
        [team.id]: { ...prev[team.id], status: "running", message: "" },
      }))

      const { url, body } = buildSyncBody(team.id, type)
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          setResults((prev) => ({
            ...prev,
            [team.id]: { ...prev[team.id], status: "error", message: data.error ?? "Sync failed" },
          }))
        } else {
          setResults((prev) => ({
            ...prev,
            [team.id]: { ...prev[team.id], status: "done", message: formatResult(data) },
          }))
          await refreshStatus(team.id)
        }
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [team.id]: { ...prev[team.id], status: "error", message: String(err) },
        }))
      }

      await new Promise((r) => setTimeout(r, 400))
    }

    setProgress(`Done — ${configured.length} of ${total} teams synced`)
    setRunning(false)
  }

  if (loading) {
    return (
      <div className="ob-layout">
        <aside className="ob-sidebar">
          <div className="ob-sidebar-brand">
            <div className="ob-sidebar-dots" />
            <div className="ob-sidebar-glow" />
            <p className="ob-brand-label">stat in stand</p>
            <p className="ob-brand-title"><Link href="/"><Vault className="ob-brand-icon" /></Link>Admin Vault</p>
          </div>
        </aside>
        <main className="ob-content"><p className="ob-empty">Loading…</p></main>
      </div>
    )
  }

  if (!isSuperAdmin) return null

  return (
    <div className="ob-layout">
      <aside className="ob-sidebar">
        <div className="ob-sidebar-brand">
          <div className="ob-sidebar-dots" />
          <div className="ob-sidebar-glow" />
          <p className="ob-brand-label">stat in stand</p>
          <p className="ob-brand-title"><Link href="/"><Vault className="ob-brand-icon" /></Link>Admin Vault</p>
        </div>
        <div className="ob-sidebar-section">
          <p className="ob-sidebar-section-label">navigation</p>
          <Link href="/admin/dashboard" className="ob-nav-link">
            <LayoutDashboard className="ob-nav-icon" />
            Teams Home
          </Link>
        </div>
        <div className="ob-sidebar-bottom">
          <Link href="/admin/sync" className="ob-nav-link" data-active={true}>
            <RefreshCw className="ob-nav-icon" />
            Bulk Sync
          </Link>
          <hr className="ob-sidebar-divider" />
          <Link href="/admin/teams" className="ob-nav-link">
            <Settings className="ob-nav-icon" />
            Manage Teams &amp; Admins
          </Link>
          <hr className="ob-sidebar-divider" />
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace("/admin") }}
            className="ob-nav-link"
          >
            <LogOut className="ob-nav-icon" />
            Logout
          </button>
        </div>
      </aside>

      <main className="ob-content">
        <div className="ob-content-inner">
          <div className="admin-page-heading">
            <h1 className="ob-page-title">Bulk Sync</h1>
          </div>

          <div className="bulk-sync-groups">
            {[
              { label: "Regular",   keys: ["regular-standings", "regular-games"] as SyncType[] },
              { label: "Playoffs",  keys: ["playoffs-standings", "playoffs-games"] as SyncType[] },
              { label: "Playdowns", keys: ["playdowns-standings", "playdowns-games"] as SyncType[] },
              { label: "MHR",       keys: ["mhr-rankings", "mhr-games"] as SyncType[] },
            ].map((group) => (
              <div key={group.label} className="bulk-sync-group">
                <span className="bulk-sync-group-label">{group.label}</span>
                <div className="bulk-sync-group-buttons">
                  {group.keys.map((key) => {
                    const item = SYNC_TYPES.find((s) => s.key === key)!
                    return (
                      <Button
                        key={key}
                        variant="outline"
                        size="sm"
                        disabled={running}
                        onClick={() => runBulkSync(key)}
                        style={activeType === key && !running ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}
                      >
                        <RefreshCw className={running && activeType === key ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
                        {item.label.replace(/^(Regular|Playoffs|Playdowns|MHR)\s*/i, "")}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="bulk-sync-progress">{progress}</p>

          <div className="bulk-sync-list">
            {teams.map((team) => {
              const config = configs[team.id]
              const row = results[team.id]
              const configured = activeType ? isConfigured(config ?? { teamId: team.id, hasOwha: false, hasPlaydowns: false, hasMhrGames: false, hasMhrRankings: false }, activeType) : null

              return (
                <div key={team.id} className="bulk-sync-team-row">
                  <span className="bulk-sync-team-name">
                    {team.organization} {team.name} {team.age_group.toUpperCase()} {team.level.toUpperCase()}
                  </span>
                  <span className="bulk-sync-config-badge">
                    {activeType !== null && configured !== null && !configured ? "Not configured" : ""}
                  </span>
                  <span className={
                    row?.status === "error" ? "bulk-sync-result-error" :
                    row?.status === "skipped" ? "bulk-sync-result-skip" :
                    "bulk-sync-result"
                  }>
                    {row?.status === "running" ? "Syncing…" : row?.message ?? ""}
                  </span>
                  <InlineStatus status={row?.syncStatus} />
                </div>
              )
            })}
          </div>

          <div className="bulk-sync-legend">
            <span className="bulk-sync-legend-title">Status dots (left to right):</span>
            <span>Regular · Playoffs · Playdowns · MHR Games · MHR Rankings</span>
            <span className="bulk-sync-legend-sep">·</span>
            <span><span className="status-dot status-dot-green" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "0.25rem" }} />OK</span>
            <span><span className="status-dot status-dot-yellow" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "0.25rem" }} />Mismatch</span>
            <span><span className="status-dot status-dot-red" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "0.25rem" }} />Never synced</span>
            <span><span className="status-dot status-dot-grey" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "0.25rem" }} />Not configured</span>
          </div>
        </div>
      </main>
    </div>
  )
}
