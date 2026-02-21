"use client"

import { use } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Vault, ArrowLeft, LayoutDashboard, Gamepad2,
  Trophy, Users, CalendarDays, Circle,
} from "lucide-react"
import { useTeam } from "@/hooks/use-supabase-teams"
import { useSupabasePlaydowns } from "@/hooks/use-supabase-playdowns"
import { useSupabaseTournaments } from "@/hooks/use-supabase-tournaments"
import { TeamProvider } from "@/lib/team-context"

export default function AdminTeamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const { team, loading } = useTeam(slug)
  const pathname = usePathname()

  // Fetch events data for sidebar sub-items (after team loads)
  const { playdown } = useSupabasePlaydowns(team?.id)
  const { tournaments } = useSupabaseTournaments(team?.id)

  const navItems = [
    { href: `/admin/team/${slug}`, label: "Overview", icon: LayoutDashboard },
    { href: `/admin/team/${slug}/games`, label: "Games", icon: Gamepad2 },
    { href: `/admin/team/${slug}/standings`, label: "Standings", icon: Trophy },
    { href: `/admin/team/${slug}/opponents`, label: "Opponents", icon: Users },
  ]

  const eventsBase = `/admin/team/${slug}/events`
  const isEventsActive = pathname === eventsBase
  const isPlaydownActive = pathname === `${eventsBase}/playdown`

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
          <p className="ob-empty">Loading...</p>
        </main>
      </div>
    )
  }

  if (!team) {
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
          <div className="ob-sidebar-section">
            <Link href="/admin/dashboard" className="ob-nav-link">
              <ArrowLeft className="ob-nav-icon" />
              Dashboard
            </Link>
          </div>
        </aside>
        <main className="ob-content">
          <p className="ob-empty">Team not found.</p>
        </main>
      </div>
    )
  }

  return (
    <TeamProvider team={team}>
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

          <div className="ob-sidebar-section">
            <p className="ob-sidebar-section-label">navigate</p>
            <Link href="/admin/dashboard" className="ob-nav-link">
              <ArrowLeft className="ob-nav-icon" />
              Dashboard
            </Link>
          </div>

          <div className="ob-team-header">
            <p className="ob-team-org">{team.organization}</p>
            <p className="ob-team-name">{team.name}</p>
            <p className="ob-team-meta">{team.age_group.toUpperCase()} · {team.level.toUpperCase()}</p>
          </div>

          <div className="ob-sidebar-section">
            <p className="ob-sidebar-section-label">team admin</p>

            {/* Main nav items */}
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ob-nav-link"
                  data-active={isActive || undefined}
                >
                  <item.icon className="ob-nav-icon" />
                  {item.label}
                </Link>
              )
            })}

            {/* Events with sub-items */}
            <Link
              href={eventsBase}
              className="ob-nav-link"
              data-active={isEventsActive || undefined}
            >
              <CalendarDays className="ob-nav-icon" />
              Events
            </Link>

            {playdown?.config && (
              <Link
                href={`${eventsBase}/playdown`}
                className="ob-nav-subitem"
                data-active={isPlaydownActive || undefined}
              >
                <Circle className="h-2 w-2 flex-shrink-0" />
                Playdowns
              </Link>
            )}

            <Link
              href={`${eventsBase}/playoffs`}
              className="ob-nav-subitem"
              data-active={pathname === `${eventsBase}/playoffs` || undefined}
            >
              <Circle className="h-2 w-2 flex-shrink-0" />
              Playoffs
            </Link>

            {tournaments
              .filter((t) => t.config.id !== "playoffs")
              .map((t) => {
                const tHref = `${eventsBase}/tournament/${t.config.id}`
                return (
                  <Link
                    key={t.config.id}
                    href={tHref}
                    className="ob-nav-subitem"
                    data-active={pathname === tHref || undefined}
                  >
                    <Circle className="h-2 w-2 flex-shrink-0" />
                    {t.config.name || "Untitled Tournament"}
                  </Link>
                )
              })}
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="ob-content">
          <div className="ob-content-inner">
            {children}
          </div>
        </main>
      </div>
    </TeamProvider>
  )
}
