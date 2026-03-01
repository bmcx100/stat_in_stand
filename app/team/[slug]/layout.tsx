"use client"

import { use, useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { Home, Calendar, Trophy, Share2, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useTeam } from "@/hooks/use-supabase-teams"
import { useFavorites } from "@/hooks/use-favorites"
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toggleFavorite, isFavorite } = useFavorites()
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    if (searchParams.get("fav") === "1" && !isFavorite(slug)) {
      toggleFavorite(slug)
    }
    if (searchParams.get("fav")) {
      router.replace(`/team/${slug}`, { scroll: false })
    }
  }, [searchParams, slug, isFavorite, toggleFavorite, router])

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
    { href: `/team/${slug}/events`, icon: Calendar, label: "Events" },
    { href: `/team/${slug}/results`, icon: Trophy, label: "Results" },
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
      <div className="team-layout-banner-hint">
        <span>Click the banner to return to all teams</span>
        <button
          className="share-button"
          onClick={() => setShowShare(true)}
          aria-label="Share team"
        >
          <Share2 />
          <span>Share</span>
        </button>
      </div>

      {showShare && (
        <div className="share-overlay" onClick={() => setShowShare(false)}>
          <div className="share-overlay-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="share-overlay-close"
              onClick={() => setShowShare(false)}
              aria-label="Close"
            >
              <X />
            </button>
            <p className="share-overlay-org">{team.organization}</p>
            <p className="share-overlay-team">
              {`${team.age_group.toUpperCase()}${team.level.toUpperCase()} ${team.name}`}
            </p>
            <div className="share-overlay-qr">
              <QRCodeSVG
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/team/${slug}?fav=1`}
                size={220}
                level="M"
              />
            </div>
            <p className="share-overlay-caption">Scan to follow this team</p>
          </div>
        </div>
      )}

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
              <item.icon className="nav-icon" />
              <span className="nav-label">
                {item.label.split("").map((char, i) => (
                  <span key={i} className="nav-letter" style={{ animationDelay: `${(item.label.length - 1 - i) * 0.05}s` }}>{char}</span>
                ))}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
