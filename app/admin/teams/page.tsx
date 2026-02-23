"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2, UserPlus, X, Vault, Settings, LayoutDashboard, LogOut, FileText, Info } from "lucide-react"
import { AdminHelp } from "@/components/admin-help"
import { Button } from "@/components/ui/button"

const LEVEL_RANK: Record<string, number> = { AAA: 0, AA: 1, A: 2, BB: 3, B: 4, C: 5 }
const levelRank = (l: string) => LEVEL_RANK[l.toUpperCase()] ?? 99

function sortTeams<T extends { age_group: string; level: string; organization: string; name: string }>(teams: T[]): T[] {
  return [...teams].sort((a, b) =>
    a.organization.localeCompare(b.organization) ||
    a.name.localeCompare(b.name) ||
    a.age_group.localeCompare(b.age_group, undefined, { sensitivity: "base" }) ||
    levelRank(a.level) - levelRank(b.level)
  )
}
import { createClient } from "@/lib/supabase/client"

type Team = {
  id: string
  slug: string
  organization: string
  name: string
  age_group: string
  level: string
  banner_url: string | null
  published: boolean
  owha_url_regular: string | null
}

type AdminRow = {
  id: string
  team_id: string | null
  user_id: string
  role: string
  email?: string
}

function slugify(org: string, name: string, ageGroup: string, lvl: string): string {
  return `${org}-${name}-${ageGroup}-${lvl}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Create team form
  const [showCreate, setShowCreate] = useState(false)
  const [org, setOrg] = useState("Nepean")
  const [teamName, setTeamName] = useState("Wildcats")
  const [ageGroup, setAgeGroup] = useState("")
  const [level, setLevel] = useState("")
  const [creating, setCreating] = useState(false)

  // Configure section
  const [configOpenId, setConfigOpenId] = useState<string | null>(null)
  const [configUrls, setConfigUrls] = useState<Record<string, string>>({})
  const [configPlaydownUrls, setConfigPlaydownUrls] = useState<Record<string, string>>({})
  const [configOriginalUrls, setConfigOriginalUrls] = useState<Record<string, string>>({})
  const [configOriginalPlaydownUrls, setConfigOriginalPlaydownUrls] = useState<Record<string, string>>({})
  const [configMhrGamesUrls, setConfigMhrGamesUrls] = useState<Record<string, string>>({})
  const [configMhrRankingsUrls, setConfigMhrRankingsUrls] = useState<Record<string, string>>({})
  const [configOriginalMhrGamesUrls, setConfigOriginalMhrGamesUrls] = useState<Record<string, string>>({})
  const [configOriginalMhrRankingsUrls, setConfigOriginalMhrRankingsUrls] = useState<Record<string, string>>({})
  const [configSaving, setConfigSaving] = useState<string | null>(null)
  const [configSaved, setConfigSaved] = useState<string | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  // Invite admin form
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState("")

  const router = useRouter()
  const supabase = createClient()
  const newTeamRef = useRef<string | null>(null)

  useEffect(() => {
    if (configOpenId && newTeamRef.current === configOpenId) {
      const el = document.getElementById(`team-card-${configOpenId}`)
      el?.scrollIntoView({ behavior: "smooth", block: "center" })
      newTeamRef.current = null
    }
  }, [configOpenId])

  useEffect(() => {
    if (!configOpenId) return
    supabase
      .from("playdowns")
      .select("owha_url")
      .eq("team_id", configOpenId)
      .maybeSingle()
      .then(({ data }) => {
        const url = data?.owha_url ?? ""
        setConfigPlaydownUrls((prev) => ({ ...prev, [configOpenId]: url }))
        setConfigOriginalPlaydownUrls((prev) => ({ ...prev, [configOpenId]: url }))
      })
  }, [configOpenId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!configOpenId) return
    const yr = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1
    supabase
      .from("mhr_config")
      .select("team_nbr, div_nbr, div_age")
      .eq("team_id", configOpenId)
      .maybeSingle()
      .then(({ data }) => {
        const gamesUrl = data?.team_nbr
          ? `https://myhockeyrankings.com/team_info.php?y=${yr}&t=${data.team_nbr}`
          : ""
        const rankingsUrl = (data?.div_nbr && data?.div_age)
          ? `https://myhockeyrankings.com/rank?y=${yr}&a=${data.div_age}&v=${data.div_nbr}`
          : ""
        setConfigMhrGamesUrls((prev) => ({ ...prev, [configOpenId]: gamesUrl }))
        setConfigOriginalMhrGamesUrls((prev) => ({ ...prev, [configOpenId]: gamesUrl }))
        setConfigMhrRankingsUrls((prev) => ({ ...prev, [configOpenId]: rankingsUrl }))
        setConfigOriginalMhrRankingsUrls((prev) => ({ ...prev, [configOpenId]: rankingsUrl }))
      })
  }, [configOpenId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/admin"); return }

      const { data: adminRows } = await supabase
        .from("team_admins")
        .select("*")
        .eq("user_id", user.id)

      const superAdmin = adminRows?.some((r) => r.role === "super_admin") ?? false
      setIsSuperAdmin(superAdmin)
      if (!superAdmin) { router.replace("/admin/dashboard"); return }

      const { data: allTeams } = await supabase
        .from("teams")
        .select("*")
      setTeams(sortTeams(allTeams ?? []))

      const { data: allAdmins } = await supabase
        .from("team_admins")
        .select("*")
      setAdmins(allAdmins ?? [])

      setLoading(false)
    }
    load()
  }, [router, supabase])

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const slug = slugify(org, teamName, ageGroup, level)

    const { data, error } = await supabase
      .from("teams")
      .insert({ slug, organization: org, name: teamName, age_group: ageGroup, level })
      .select()
      .single()

    if (!error && data) {
      setTeams((prev) => sortTeams([...prev, data]))
      setOrg("Nepean")
      setTeamName("Wildcats")
      setAgeGroup("")
      setLevel("")
      setShowCreate(false)
      newTeamRef.current = data.id
      setConfigOpenId(data.id)
      setConfigUrls((prev) => ({ ...prev, [data.id]: "" }))
    }
    setCreating(false)
  }

  async function handleTogglePublished(team: Team) {
    const { error } = await supabase
      .from("teams")
      .update({ published: !team.published })
      .eq("id", team.id)

    if (!error) {
      setTeams((prev) => prev.map((t) => t.id === team.id ? { ...t, published: !t.published } : t))
    }
  }

  async function handleDeleteTeam(team: Team) {
    if (!confirm(`Delete ${team.organization} - ${team.name} - ${team.age_group.toUpperCase()} - ${team.level.toUpperCase()}? This cannot be undone.`)) return

    const { error } = await supabase.from("teams").delete().eq("id", team.id)
    if (!error) {
      setTeams((prev) => prev.filter((t) => t.id !== team.id))
    }
  }

  async function handleInviteAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteTeamId) return
    setInviting(true)
    setInviteError("")

    const res = await fetch("/api/invite-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, teamId: inviteTeamId }),
    })

    if (!res.ok) {
      const body = await res.json()
      setInviteError(body.error || "Failed to invite admin")
    } else {
      // Refresh admins list
      const { data: allAdmins } = await supabase.from("team_admins").select("*")
      setAdmins(allAdmins ?? [])
      setInviteEmail("")
      setInviteTeamId(null)
    }
    setInviting(false)
  }

  async function handleSaveConfig(team: Team) {
    setConfigSaving(team.id)
    setConfigError(null)
    const url = configUrls[team.id] ?? team.owha_url_regular ?? ""
    const playdownUrl = configPlaydownUrls[team.id] ?? ""
    const mhrGamesUrl = configMhrGamesUrls[team.id] ?? ""
    const mhrRankingsUrl = configMhrRankingsUrls[team.id] ?? ""
    const [r1, r2, r3] = await Promise.all([
      fetch("/api/owha-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, owha_url_regular: url }),
      }),
      fetch("/api/owha-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, type: "playdown", owha_event: !!playdownUrl, owha_url: playdownUrl }),
      }),
      fetch("/api/mhr-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, mhr_games_url: mhrGamesUrl, mhr_rankings_url: mhrRankingsUrl }),
      }),
    ])
    const failed: string[] = []
    if (!r1.ok) { const d = await r1.json(); failed.push(`OWHA: ${d.error ?? r1.status}`) }
    if (!r2.ok) { const d = await r2.json(); failed.push(`Playdowns: ${d.error ?? r2.status}`) }
    if (!r3.ok) { const d = await r3.json(); failed.push(`MHR: ${d.error ?? r3.status}`) }
    setConfigSaving(null)
    if (failed.length) {
      setConfigError(failed.join(" · "))
      return
    }
    setTeams((prev) => prev.map((t) => t.id === team.id ? { ...t, owha_url_regular: url } : t))
    setConfigOriginalUrls((prev) => ({ ...prev, [team.id]: url }))
    setConfigOriginalPlaydownUrls((prev) => ({ ...prev, [team.id]: playdownUrl }))
    setConfigOriginalMhrGamesUrls((prev) => ({ ...prev, [team.id]: mhrGamesUrl }))
    setConfigOriginalMhrRankingsUrls((prev) => ({ ...prev, [team.id]: mhrRankingsUrl }))
    setConfigSaved(team.id)
    setTimeout(() => setConfigSaved(null), 2000)
  }

  async function handleRemoveAdmin(adminId: string) {
    if (!confirm("Remove this admin?")) return
    const { error } = await supabase.from("team_admins").delete().eq("id", adminId)
    if (!error) {
      setAdmins((prev) => prev.filter((a) => a.id !== adminId))
    }
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
        <main className="ob-content"><p className="ob-empty">Loading...</p></main>
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
          <Link href="/admin/teams" className="ob-nav-link" data-active={true}>
            <Settings className="ob-nav-icon" />
            Manage Teams &amp; Admins
          </Link>
          <hr className="ob-sidebar-divider" />
          <AdminHelp>
            <div className="help-section">
              <p>Use <strong>Create Team</strong> to add a new team. Fill in location, name, age group, and level.</p>
              <p>Click <strong>Draft</strong> / <strong>Published</strong> to toggle a team&apos;s visibility on the public site.</p>
              <p>Use <strong>Add Admin</strong> on a team card to invite a coach or manager by email.</p>
              <p className="help-section-label" style={{ marginTop: "0.6rem" }}>Configure — OWHA URLs</p>
              <p>Paste the team&apos;s OWHA division page URL directly from your browser.</p>
              <p><strong>Regular Season:</strong> the division page URL, e.g. <code>owha.on.ca/division/1590/14802/games</code></p>
              <p><strong>Playdowns:</strong> the provincial playdowns URL — always has <code>/division/0/</code> in the path.</p>
              <p className="help-section-label" style={{ marginTop: "0.6rem" }}>Configure — MHR URLs</p>
              <p>MHR sync uses a two-step token system: this app fetches the MHR page HTML, extracts a short-lived token embedded in the page JavaScript, then calls the MHR data API with that token. Paste the plain browser URLs — no API keys needed.</p>
              <p><strong>MHR Team Page:</strong> go to myhockeyrankings.com, find the team, copy the URL. It will contain <code>team_info.php?y=…&amp;t=…</code> — the <code>t</code> value is the team number stored internally.</p>
              <p><strong>MHR Rankings URL:</strong> go to the division rankings page on myhockeyrankings.com and copy the URL. It will contain <code>rank?y=…&amp;a=…&amp;v=…</code> — the <code>v</code> value is the division number and <code>a</code> is the age bracket code.</p>
              <p>If MHR sync stops working, open the team page in a browser, view Page Source, and search for <strong>&ldquo;token&rdquo;</strong> to find the embedded JS token. The sync route extracts it automatically — if MHR renames their JS function, the regex in <code>app/api/mhr-sync/route.ts</code> needs updating.</p>
            </div>
          </AdminHelp>
          <hr className="ob-sidebar-divider" />
          <button onClick={async () => { await supabase.auth.signOut(); router.replace("/admin") }} className="ob-nav-link">
            <LogOut className="ob-nav-icon" />
            Logout
          </button>
        </div>
      </aside>
      <main className="ob-content">
      <div className="ob-content-inner">
      <div className="admin-page-heading">
        <h1 className="ob-page-title">Teams &amp; Admins</h1>
      </div>

      {/* Create Team */}
      {showCreate ? (
        <form onSubmit={handleCreateTeam} className="admin-card">
          <div className="admin-card-header">
            <h3 className="text-sm font-medium">New Team</h3>
            <button type="button" onClick={() => setShowCreate(false)}><X className="size-4" /></button>
          </div>
          <input className="game-form-input" placeholder="Location (e.g. Nepean)" value={org} onChange={(e) => setOrg(e.target.value)} required />
          <input className="game-form-input" placeholder="Team name (e.g. Wildcats)" value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
          <input className="game-form-input" placeholder="Age group (e.g. U15)" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value.toUpperCase())} required />
          <input className="game-form-input" placeholder="Level (e.g. A)" value={level} onChange={(e) => setLevel(e.target.value.toUpperCase())} required />
          <p className="text-xs text-muted-foreground">Slug: {slugify(org, teamName, ageGroup, level) || "..."}</p>
          <button
            type="submit"
            className="admin-btn"
            disabled={creating}
            style={org && teamName && ageGroup && level ? { background: "#16a34a" } : undefined}
          >
            {creating ? "Creating..." : "Create Team"}
          </button>
        </form>
      ) : (
        <button onClick={() => setShowCreate(true)} className="admin-nav-link">
          <Plus className="size-4" />
          Create Team
        </button>
      )}

      {/* Team List */}
      <div className="dashboard-nav">
        {teams.map((team) => {
          const teamAdmins = admins.filter((a) => a.team_id === team.id && a.role === "team_admin")
          return (
            <div key={team.id} id={`team-card-${team.id}`} className="admin-team-card">
              <div className="admin-team-header">
                <Link href={`/admin/team/${team.slug}`} className="admin-team-enter">
                  <FileText className="size-4" />
                </Link>
                <div className="admin-team-info">
                  <p className="text-sm font-medium">{team.organization} - {team.name} - {team.age_group.toUpperCase()} - {team.level.toUpperCase()}</p>
                  <p className="text-xs text-muted-foreground">/{team.slug}</p>
                </div>
                <div className="admin-team-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setConfigOpenId(configOpenId === team.id ? null : team.id)
                      if (configOpenId !== team.id) {
                        const url = team.owha_url_regular ?? ""
                        setConfigUrls((prev) => ({ ...prev, [team.id]: url }))
                        setConfigOriginalUrls((prev) => ({ ...prev, [team.id]: url }))
                        // MHR URLs are populated from mhr_config table via useEffect below
                        setConfigMhrGamesUrls((prev) => ({ ...prev, [team.id]: prev[team.id] ?? "" }))
                        setConfigOriginalMhrGamesUrls((prev) => ({ ...prev, [team.id]: prev[team.id] ?? "" }))
                        setConfigMhrRankingsUrls((prev) => ({ ...prev, [team.id]: prev[team.id] ?? "" }))
                        setConfigOriginalMhrRankingsUrls((prev) => ({ ...prev, [team.id]: prev[team.id] ?? "" }))
                      }
                    }}
                  >
                    <Settings className="size-3" />
                    Configure
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInviteTeamId(inviteTeamId === team.id ? null : team.id)}
                  >
                    <UserPlus className="size-3" />
                    Add Admin
                  </Button>
                  <button
                    onClick={() => handleTogglePublished(team)}
                    className={`admin-badge ${team.published ? "admin-badge-published" : "admin-badge-draft"}`}
                  >
                    {team.published ? "Published" : "Draft"}
                  </button>
                  <button onClick={() => handleDeleteTeam(team)}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Configure section */}
              {configOpenId === team.id && (
                <div className="team-config-section">
                  <p className="team-config-label">OWHA Regular Season URL</p>
                  <div className="owha-sync-url-row">
                    <input
                      className="owha-sync-url-input"
                      placeholder="https://www.owha.on.ca/division/1590/14802/games"
                      value={configUrls[team.id] ?? ""}
                      onChange={(e) => setConfigUrls((prev) => ({ ...prev, [team.id]: e.target.value }))}
                    />
                  </div>
                  <p className="team-config-label">OWHA Playdowns URL</p>
                  <div className="owha-sync-url-row">
                    <input
                      className="owha-sync-url-input"
                      placeholder="https://www.owha.on.ca/division/0/27230/games"
                      value={configPlaydownUrls[team.id] ?? ""}
                      onChange={(e) => setConfigPlaydownUrls((prev) => ({ ...prev, [team.id]: e.target.value }))}
                    />
                  </div>
                  <p className="team-config-label">MHR Team Page URL</p>
                  <div className="owha-sync-url-row">
                    <input
                      className="owha-sync-url-input"
                      placeholder="https://myhockeyrankings.com/team_info.php?y=2025&t=9407"
                      value={configMhrGamesUrls[team.id] ?? ""}
                      onChange={(e) => setConfigMhrGamesUrls((prev) => ({ ...prev, [team.id]: e.target.value }))}
                    />
                  </div>
                  <p className="team-config-label">MHR Rankings URL</p>
                  <div className="owha-sync-url-row">
                    <input
                      className="owha-sync-url-input"
                      placeholder="https://myhockeyrankings.com/rank?y=2025&a=c&v=2038"
                      value={configMhrRankingsUrls[team.id] ?? ""}
                      onChange={(e) => setConfigMhrRankingsUrls((prev) => ({ ...prev, [team.id]: e.target.value }))}
                    />
                  </div>
                  <div className="owha-sync-url-row">
                    {(() => {
                      const isDirty =
                        (configUrls[team.id] ?? "") !== (configOriginalUrls[team.id] ?? "") ||
                        (configPlaydownUrls[team.id] ?? "") !== (configOriginalPlaydownUrls[team.id] ?? "") ||
                        (configMhrGamesUrls[team.id] ?? "") !== (configOriginalMhrGamesUrls[team.id] ?? "") ||
                        (configMhrRankingsUrls[team.id] ?? "") !== (configOriginalMhrRankingsUrls[team.id] ?? "")
                      return (
                        <Button
                          variant={isDirty ? "outline" : "secondary"}
                          size="sm"
                          onClick={() => handleSaveConfig(team)}
                          disabled={configSaving === team.id}
                          style={isDirty ? { minWidth: "5rem", backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : { minWidth: "5rem" }}
                        >
                          {configSaved === team.id ? "Saved" : configSaving === team.id ? "Saving…" : "Save"}
                        </Button>
                      )
                    })()}
                  </div>
                  {configError && configOpenId === team.id && (
                    <p className="admin-error">{configError}</p>
                  )}
                  <p className="owha-sync-tip">
                    <Info className="owha-sync-tip-icon" />
                    Paste OWHA URLs from your browser (regular: /division/1590/…, playdowns: /division/0/…). For MHR, paste the team page URL and rankings URL from myhockeyrankings.com.
                  </p>
                </div>
              )}

              {/* Invite admin */}
              {inviteTeamId === team.id && (
                <div className="team-config-section">
                  <p className="team-config-label">Invite Admin</p>
                  {teamAdmins.length > 0 && (
                    <div className="admin-team-admins">
                      {teamAdmins.map((a) => (
                        <div key={a.id} className="admin-team-admin-row">
                          <span className="text-xs">{a.user_id.slice(0, 8)}...</span>
                          <button onClick={() => handleRemoveAdmin(a.id)}>
                            <X className="size-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form onSubmit={handleInviteAdmin}>
                    <div className="owha-sync-url-row">
                      <input
                        className="owha-sync-url-input"
                        type="email"
                        placeholder="Admin email address"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        required
                      />
                      <Button variant="outline" size="sm" type="submit" disabled={inviting} style={{ minWidth: "5rem" }}>
                        {inviting ? "Inviting…" : "Invite"}
                      </Button>
                    </div>
                    {inviteError && <p className="admin-error">{inviteError}</p>}
                  </form>
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>
      </main>
    </div>
  )
}
