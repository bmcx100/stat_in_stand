"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { FileText, Settings, LogOut, Vault, RefreshCw } from "lucide-react"
import { AdminHelp } from "@/components/admin-help"
import { createClient } from "@/lib/supabase/client"

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

type TeamRow = {
  id: string
  slug: string
  organization: string
  name: string
  age_group: string
  level: string
  published: boolean
  lastUpdated?: string
}

type AdminRole = "super_admin" | "team_admin"

export default function AdminDashboardPage() {
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [role, setRole] = useState<AdminRole | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/admin")
        return
      }

      const { data: adminRows } = await supabase
        .from("team_admins")
        .select("team_id, role")
        .eq("user_id", user.id)

      if (!adminRows || adminRows.length === 0) {
        setLoading(false)
        return
      }

      const isSuperAdmin = adminRows.some((r) => r.role === "super_admin")
      setRole(isSuperAdmin ? "super_admin" : "team_admin")

      let rows: TeamRow[] = []
      if (isSuperAdmin) {
        const { data: allTeams } = await supabase
          .from("teams")
          .select("id, slug, organization, name, age_group, level, published")
        rows = sortTeams(allTeams ?? [])
      } else {
        const teamIds = adminRows.map((r) => r.team_id).filter(Boolean)
        if (teamIds.length > 0) {
          const { data: myTeams } = await supabase
            .from("teams")
            .select("id, slug, organization, name, age_group, level, published")
            .in("id", teamIds)
          rows = sortTeams(myTeams ?? [])
        }
      }

      setTeams(rows)
      setLoading(false)

      // Fetch last-updated timestamps across all content tables
      if (rows.length > 0) {
        const ids = rows.map((t) => t.id)
        const [{ data: games }, { data: playdowns }, { data: standings }, { data: tournaments }] =
          await Promise.all([
            supabase.from("games").select("team_id, created_at").in("team_id", ids),
            supabase.from("playdowns").select("team_id, updated_at").in("team_id", ids),
            supabase.from("standings").select("team_id, updated_at").in("team_id", ids),
            supabase.from("tournaments").select("team_id, updated_at").in("team_id", ids),
          ])

        const latestByTeam = new Map<string, string>()
        const bump = (teamId: string, ts: string) => {
          const cur = latestByTeam.get(teamId)
          if (!cur || ts > cur) latestByTeam.set(teamId, ts)
        }
        for (const r of games ?? []) bump(r.team_id, r.created_at)
        for (const r of playdowns ?? []) bump(r.team_id, r.updated_at)
        for (const r of standings ?? []) bump(r.team_id, r.updated_at)
        for (const r of tournaments ?? []) bump(r.team_id, r.updated_at)

        setTeams(rows.map((t) => ({ ...t, lastUpdated: latestByTeam.get(t.id) })))
      }
    }
    load()
  }, [router, supabase])

  function formatUpdated(ts: string) {
    const d = new Date(ts)
    return d.toLocaleString("en-CA", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace("/admin")
  }

  if (loading) {
    return (
      <div className="ob-layout">
        <aside className="ob-sidebar">
          <div className="ob-sidebar-brand">
            <div className="ob-sidebar-dots" />
            <div className="ob-sidebar-glow" />
            <p className="ob-brand-label">stat in stand</p>
            <p className="ob-brand-title">
              <Link href="/"><Vault className="ob-brand-icon" /></Link>
              Admin Vault
            </p>
          </div>
        </aside>
        <main className="ob-content">
          <p className="ob-empty">Initialising vault...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="ob-layout">
      {/* ── Sidebar ── */}
      <aside className="ob-sidebar">
        <div className="ob-sidebar-brand">
          <div className="ob-sidebar-dots" />
          <div className="ob-sidebar-glow" />
          <p className="ob-brand-label">stat in stand</p>
          <p className="ob-brand-title">
            <Vault className="ob-brand-icon" />
            Admin Vault
          </p>
        </div>

        {teams.length > 0 && (
          <div className="ob-sidebar-section">
            <p className="ob-sidebar-section-label">teams — {teams.length}</p>
            {[...teams].sort((a, b) =>
              a.organization.localeCompare(b.organization) ||
              a.name.localeCompare(b.name) ||
              a.age_group.localeCompare(b.age_group, undefined, { sensitivity: "base" }) ||
              levelRank(a.level) - levelRank(b.level)
            ).flatMap((team, i, arr) => {
              const items: React.ReactNode[] = []
              if (i > 0 && (
                arr[i - 1].organization.toLowerCase() !== team.organization.toLowerCase() ||
                arr[i - 1].age_group.toLowerCase() !== team.age_group.toLowerCase()
              )) {
                items.push(<hr key={`divider-${team.id}`} className="ob-sidebar-divider" />)
              }
              items.push(
                <Link
                  key={team.id}
                  href={`/admin/team/${team.slug}`}
                  className="ob-nav-link"
                >
                  <FileText className="ob-nav-icon" />
                  {team.organization} {team.name} {team.age_group.toUpperCase()} {team.level.toUpperCase()}
                </Link>
              )
              return items
            })}
          </div>
        )}

        <div className="ob-sidebar-bottom">
          {role === "super_admin" && (
            <Link
              href="/admin/sync"
              className="ob-nav-link"
              data-active={pathname === "/admin/sync"}
            >
              <RefreshCw className="ob-nav-icon" />
              Bulk Sync
            </Link>
          )}
          {role === "super_admin" && (
            <Link
              href="/admin/teams"
              className="ob-nav-link"
              data-active={pathname === "/admin/teams"}
            >
              <Settings className="ob-nav-icon" />
              Manage Teams &amp; Admins
            </Link>
          )}
          {role === "super_admin" && <hr className="ob-sidebar-divider" />}
          <AdminHelp>
            <div className="help-section">
              <p>To create teams, click <strong>Manage Teams &amp; Admins</strong> in the sidebar.</p>
              <p>Select a team from the list to begin editing.</p>
              <p>Newly created teams are <em>draft</em> by default and not publicly visible. Click the badge on a team card to publish it.</p>
            </div>
          </AdminHelp>
          <hr className="ob-sidebar-divider" />
          <button onClick={handleLogout} className="ob-nav-link">
            <LogOut className="ob-nav-icon" />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="ob-content">
        <div className="ob-content-inner">
          <div className="admin-page-heading">
            <h1 className="ob-page-title">Teams Home</h1>
          </div>

          {teams.length === 0 ? (
            <p className="ob-empty">No teams assigned to this vault.</p>
          ) : (
            <div>
<div className="ob-file-list">
                {teams.flatMap((team, i, arr) => {
                  const items: React.ReactNode[] = []
                  if (i > 0 && (
                    arr[i - 1].organization.toLowerCase() !== team.organization.toLowerCase() ||
                    arr[i - 1].age_group.toLowerCase() !== team.age_group.toLowerCase()
                  )) {
                    items.push(<hr key={`file-divider-${team.id}`} className="ob-file-divider" />)
                  }
                  items.push(
                    <Link
                      key={team.id}
                      href={`/admin/team/${team.slug}`}
                      className="ob-file"
                    >
                      <FileText className="ob-file-icon" />
                      <div className="ob-file-info">
                        <p className="ob-file-name">
                          {team.organization} - {team.name} - {team.age_group.toUpperCase()} - {team.level.toUpperCase()}
                        </p>
                        <p className="ob-file-slug">/{team.slug}</p>
                        {team.lastUpdated && (
                          <p className="ob-file-updated">Updated {formatUpdated(team.lastUpdated)}</p>
                        )}
                      </div>
                      <button
                        className={`ob-file-badge ob-file-badge-btn ${team.published ? "ob-file-badge-published" : ""}`}
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const { error } = await supabase
                            .from("teams")
                            .update({ published: !team.published })
                            .eq("id", team.id)
                          if (!error) {
                            setTeams((prev) => prev.map((t) =>
                              t.id === team.id ? { ...t, published: !t.published } : t
                            ))
                          }
                        }}
                      >
                        {team.published ? "published" : "draft"}
                      </button>
                    </Link>
                  )
                  return items
                })}
              </div>
            </div>
          )}

          <p className="ob-footer-line">STAT IN STAND · VAULT</p>
        </div>
      </main>
    </div>
  )
}
