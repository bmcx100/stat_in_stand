"use client"

import { use } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Calendar, Trophy, Settings } from "lucide-react"
import { TEAMS } from "@/lib/teams"

export default function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = use(params)
  const team = TEAMS.find((t) => t.id === teamId)
  const pathname = usePathname()

  if (!team) return <>{children}</>

  const navItems = [
    { href: `/dashboard/${teamId}`, icon: Home, label: "Home" },
    { href: `/dashboard/${teamId}/schedule`, icon: Calendar, label: "Schedule" },
    { href: `/dashboard/${teamId}/regular-season`, icon: Trophy, label: "Standings" },
  ]

  return (
    <div className="team-layout">
      <Link href="/" className="team-layout-banner-link">
        <div
          className="team-layout-banner"
          style={{ backgroundImage: `url(${team.banner})` }}
        >
          <span className="team-card-name">
            {team.name}
          </span>
        </div>
      </Link>

      <div className={`team-layout-content ${pathname.includes("/admin") ? "team-layout-wide" : ""}`}>
        {children}
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
