"use client"

import { use } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Calendar, Trophy } from "lucide-react"
import { useTeam } from "@/hooks/use-supabase-teams"
import { TeamProvider } from "@/lib/team-context"

const BANNER_MAP: Record<string, string> = {
  "nepean-wildcats": "/images/wildcats_short_banner.png",
  "ottawa-ice": "/images/ice_short_banner.png",
}

function getBanner(slug: string): string | undefined {
  const key = Object.keys(BANNER_MAP).find((k) => slug.includes(k))
  return key ? BANNER_MAP[key] : undefined
}

export default function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const { team, loading } = useTeam(slug)
  const pathname = usePathname()

  if (loading) {
    return (
      <div className="page-container">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="page-container">
        <h1 className="page-title">Team not found</h1>
        <Link href="/" className="back-link">Back to Teams</Link>
      </div>
    )
  }

  const navItems = [
    { href: `/team/${slug}`, icon: Home, label: "Home" },
    { href: `/team/${slug}/schedule`, icon: Calendar, label: "Schedule" },
    { href: `/team/${slug}/standings`, icon: Trophy, label: "Standings" },
  ]

  return (
    <div className="team-layout">
      <Link href="/" className="team-layout-banner-link">
        <div
          className="team-layout-banner"
          style={getBanner(slug) ? { backgroundImage: `url(${getBanner(slug)})` } : undefined}
        >
          <span className="team-card-name">
            {`${team.age_group.toUpperCase()}${team.level.toUpperCase()}`}
          </span>
        </div>
      </Link>
      <p className="team-layout-banner-hint">
        Click the banner to return to all teams
      </p>

      <div className="team-layout-content">
        <TeamProvider team={team}>
          {children}
        </TeamProvider>
      </div>

      <nav className="team-layout-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`team-layout-nav-item ${isActive ? "team-layout-nav-active" : ""}`}
            >
              <item.icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
