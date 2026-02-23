"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Vault, ArrowLeft, LayoutDashboard, Gamepad2,
  Trophy, BarChart3, CalendarDays, LogOut, Settings, RefreshCw, Sliders,
} from "lucide-react"
import { AdminHelp } from "@/components/admin-help"
import { useTeam } from "@/hooks/use-supabase-teams"
import { createClient } from "@/lib/supabase/client"
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
  const router = useRouter()
  const supabase = createClient()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("team_admins")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { if (data) setIsSuperAdmin(true) })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const navItems = [
    { href: `/admin/team/${slug}`, label: "Overview", icon: LayoutDashboard },
    { href: `/admin/team/${slug}/games`, label: "Games", icon: Gamepad2 },
    { href: `/admin/team/${slug}/standings`, label: "Standings", icon: Trophy },
    { href: `/admin/team/${slug}/rankings`, label: "Rankings", icon: BarChart3 },
  ]

  const eventsBase = `/admin/team/${slug}/events`

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
              <Link href="/"><Vault className="ob-brand-icon" /></Link>
              Admin Vault
            </p>
          </div>
          <div className="ob-sidebar-section">
            <Link href="/admin/dashboard" className="ob-nav-link">
              <ArrowLeft className="ob-nav-icon" />
              Teams Home
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
              <Link href="/"><Vault className="ob-brand-icon" /></Link>
              Admin Vault
            </p>
          </div>

          <div className="ob-sidebar-section">
            <p className="ob-sidebar-section-label">navigate</p>
            <Link href="/admin/dashboard" className="ob-nav-link">
              <ArrowLeft className="ob-nav-icon" />
              Teams Home
            </Link>
          </div>

          <div className="ob-team-header">
            <div className="ob-team-row">
              <span className="ob-team-org">{team.organization}</span>
              <span className="ob-team-name">{team.name}</span>
            </div>
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

            {/* Events */}
            <Link
              href={eventsBase}
              className="ob-nav-link"
              data-active={pathname.startsWith(eventsBase) || undefined}
            >
              <CalendarDays className="ob-nav-icon" />
              Events
            </Link>

          </div>

          <div className="ob-sidebar-bottom">
            {isSuperAdmin && (
              <>
                <Link href="/admin/mode" className="ob-nav-link">
                  <Sliders className="ob-nav-icon" />
                  Set Mode
                </Link>
                <hr className="ob-sidebar-divider" />
                <Link href="/admin/sync" className="ob-nav-link">
                  <RefreshCw className="ob-nav-icon" />
                  Bulk Sync
                </Link>
                <hr className="ob-sidebar-divider" />
                <Link href="/admin/teams" className="ob-nav-link">
                  <Settings className="ob-nav-icon" />
                  Manage Teams &amp; Admins
                </Link>
                <hr className="ob-sidebar-divider" />
              </>
            )}
            <AdminHelp>
              {pathname === `/admin/team/${slug}` && (
                <div className="help-section">
                  <p>This is your team overview. Each card shows sync controls and a live record for that season type.</p>
                  <p className="help-section-label" style={{ marginTop: "0.6rem" }}>OWHA Cards (Regular Season, Playoffs, Playdowns)</p>
                  <p><strong>Sync Standings</strong> fetches the standings table from OWHA and saves it to the database. For Playdowns it also establishes the loop team list used to filter games.</p>
                  <p><strong>Sync Games</strong> fetches the schedule and results from OWHA. For Playdowns, sync standings first — games won&apos;t import until the loop is known.</p>
                  <p>The mismatch indicator on the Regular Season card compares your game-derived record against the stored OWHA standings row. A green checkmark means they agree.</p>
                  <p className="help-section-label" style={{ marginTop: "0.6rem" }}>MHR Cards (Games, Rankings)</p>
                  <p><strong>MHR Games</strong> syncs exhibition and tournament games from MyHockeyRankings. Playoff and playdown games are skipped — OWHA is the source of truth for those.</p>
                  <p><strong>MHR Rankings</strong> fetches the weekly division rankings snapshot and stores it. The ranking data powers any rankings display on the public team page.</p>
                  <p>MHR sync requires the team&apos;s MHR URLs to be configured on the Super Admin page. The sync buttons are greyed out until a URL is saved. If sync fails, view Page Source on the MHR page and search for <strong>&ldquo;token&rdquo;</strong> — the route extracts it automatically from the page HTML, and if MHR has changed their JS function name the regex in <code>app/api/mhr-sync/route.ts</code> will need updating.</p>
                  <p className="help-section-label" style={{ marginTop: "0.6rem" }}>Recommended setup order</p>
                  <ol className="help-steps">
                    <li>Regular Season standings — Sync Standings from OWHA.</li>
                    <li>Regular Season games — Sync Games from OWHA.</li>
                    <li>MHR games — Sync Games from MHR for exhibition and tournaments.</li>
                    <li>Playdowns — Sync Standings first, then Sync Games.</li>
                  </ol>
                </div>
              )}
              {pathname === `/admin/team/${slug}/games` && (
                <div className="help-section">
                  <p>Import games by pasting data from <strong>TeamSnap</strong>, <strong>OWHA</strong>, or <strong>MHR</strong> into the appropriate tab, then click <strong>Parse</strong> and <strong>Confirm Import</strong>.</p>
                  <p>Scores, result, date, location, and game type are all editable inline in the table below.</p>
                  <p>Re-importing after results are posted will automatically update scores for existing games.</p>
                </div>
              )}
              {pathname === `/admin/team/${slug}/standings` && (
                <div className="help-section">
                  <p>Paste standings data from the <strong>OWHA website</strong> into the text area and click <strong>Parse</strong>.</p>
                  <p>Review the preview, then click <strong>Confirm Import</strong> to save.</p>
                  <p>Re-importing will replace the existing standings table.</p>
                </div>
              )}
              {pathname === eventsBase && (
                <div className="help-section">
                  <p>Select <strong>Playdowns</strong> or <strong>Playoffs</strong> to configure those events.</p>
                  <p>Use <strong>New Tournament</strong> to create a named tournament with pools and tiebreakers.</p>
                  <p>Events appear publicly on the team page once they have teams and games configured.</p>
                </div>
              )}
              {(pathname === `${eventsBase}/playdown` || pathname === `${eventsBase}/playoffs`) && (
                <div className="help-section">
                  <p><strong>1.</strong> Paste OWHA standings into <strong>Import Standings</strong> to set up the teams in your loop.</p>
                  <p><strong>2.</strong> Paste the full province schedule into <strong>Import Schedule / Results</strong> — only games between your loop teams are imported.</p>
                  <p><strong>3.</strong> Re-import the schedule after games are played to update scores automatically.</p>
                  <p>Use <strong>Clear Games</strong> to reset the schedule without losing the team list.</p>
                </div>
              )}
              {pathname.startsWith(`${eventsBase}/tournament/`) && (
                <div className="help-section">
                  <p>Import standings first to define the team list, then import the game schedule.</p>
                  <p>Re-importing the schedule after games are played will update scores automatically.</p>
                  <p>Use <strong>Clear Games</strong> to reset the schedule without losing the team list.</p>
                </div>
              )}
            </AdminHelp>
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
