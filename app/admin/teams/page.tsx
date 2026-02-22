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
  const [configSaving, setConfigSaving] = useState<string | null>(null)
  const [configSaved, setConfigSaved] = useState<string | null>(null)

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
    const url = configUrls[team.id] ?? team.owha_url_regular ?? ""
    await fetch("/api/owha-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: team.id, owha_url_regular: url }),
    })
    setTeams((prev) => prev.map((t) => t.id === team.id ? { ...t, owha_url_regular: url } : t))
    setConfigSaving(null)
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
              <p>Click <strong>Draft</strong> / <strong>Published</strong> to toggle a team's visibility on the public site.</p>
              <p>Use <strong>Add Admin</strong> on a team card to invite a coach or manager by email.</p>
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
                        setConfigUrls((prev) => ({ ...prev, [team.id]: team.owha_url_regular ?? "" }))
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
                  <p className="team-config-label">OWHA Regular Season Games URL</p>
                  <div className="owha-sync-url-row">
                    <input
                      className="owha-sync-url-input"
                      placeholder="https://www.owha.on.ca/division/1590/14802/games"
                      value={configUrls[team.id] ?? ""}
                      onChange={(e) => setConfigUrls((prev) => ({ ...prev, [team.id]: e.target.value }))}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveConfig(team)}
                      disabled={configSaving === team.id}
                      style={{ minWidth: "5rem", ...((configUrls[team.id] ?? "") !== (team.owha_url_regular ?? "") ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" } : {}) }}
                    >
                      {configSaved === team.id ? "Saved" : configSaving === team.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                  <p className="owha-sync-tip">
                    <Info className="owha-sync-tip-icon" />
                    Paste the OWHA division page URL from your browser address bar. If sync stops working, refer to comments labeled "OWHA API" in app/api/owha-sync/route.ts
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
