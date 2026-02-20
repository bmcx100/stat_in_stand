"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { FileText, Settings, LogOut, Vault } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type TeamRow = {
  id: string
  slug: string
  organization: string
  name: string
  age_group: string
  level: string
  published: boolean
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

      if (isSuperAdmin) {
        const { data: allTeams } = await supabase
          .from("teams")
          .select("id, slug, organization, name, age_group, level, published")
          .order("organization")
        setTeams(allTeams ?? [])
      } else {
        const teamIds = adminRows.map((r) => r.team_id).filter(Boolean)
        if (teamIds.length > 0) {
          const { data: myTeams } = await supabase
            .from("teams")
            .select("id, slug, organization, name, age_group, level, published")
            .in("id", teamIds)
            .order("organization")
          setTeams(myTeams ?? [])
        }
      }

      setLoading(false)
    }
    load()
  }, [router, supabase])

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
              <Vault className="ob-brand-icon" />
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
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/admin/team/${team.slug}`}
                className="ob-nav-link"
              >
                <FileText className="ob-nav-icon" />
                {team.organization} {team.name} {team.age_group.toUpperCase()} {team.level.toUpperCase()}
              </Link>
            ))}
          </div>
        )}

        <div className="ob-sidebar-bottom">
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
          <h1 className="ob-page-title">Dashboard</h1>

          {teams.length === 0 ? (
            <p className="ob-empty">No teams assigned to this vault.</p>
          ) : (
            <div>
              <p className="ob-section-label">your teams</p>
              <div className="ob-file-list">
                {teams.map((team) => (
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
                    </div>
                    {!team.published && (
                      <span className="ob-file-badge">draft</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="ob-footer-line">STAT IN STAND · VAULT</p>
        </div>
      </main>
    </div>
  )
}
