"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Vault, LayoutDashboard, Settings, LogOut, RefreshCw, Sliders, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export type AppMode = "regular" | "playdowns" | "tournaments"

export const APP_MODE_KEY = "app_mode"

const MODES: { key: AppMode; label: string; description: string }[] = [
  { key: "regular",     label: "Regular Season", description: "Show regular season standings, records, and upcoming games." },
  { key: "playdowns",   label: "Playdowns",       description: "Show playdown loop standings, lock/alive/out status, and qualification progress." },
  { key: "tournaments", label: "Tournaments",     description: "Show active tournament pools, standings, and results." },
]

export default function SetModePage() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<AppMode>("playdowns")
  const [saved, setSaved] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/admin"); return }
      supabase
        .from("team_admins")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .limit(1)
        .maybeSingle()
        .then(async ({ data }) => {
          if (!data) { router.replace("/admin/dashboard"); return }
          setIsSuperAdmin(true)
          // Load mode from DB; fall back to localStorage cache
          const res = await fetch("/api/app-settings")
          if (res.ok) {
            const settings = await res.json()
            const dbMode = settings[APP_MODE_KEY] as AppMode | undefined
            if (dbMode) {
              setMode(dbMode)
              localStorage.setItem(APP_MODE_KEY, dbMode)
            }
          } else {
            const stored = localStorage.getItem(APP_MODE_KEY) as AppMode | null
            if (stored) setMode(stored)
          }
          setLoading(false)
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelect(m: AppMode) {
    setMode(m)
    localStorage.setItem(APP_MODE_KEY, m)
    await fetch("/api/app-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: APP_MODE_KEY, value: m }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
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
          <Link href="/admin/mode" className="ob-nav-link" data-active={true}>
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
            <h1 className="ob-page-title">Set Mode</h1>
          </div>

          <p className="text-sm text-muted-foreground" style={{ marginBottom: "1.25rem" }}>
            Controls what the public team cards prioritise and display. Select the mode that reflects the current point in the season.
          </p>

          <div className="mode-option-list">
            {MODES.map((m) => (
              <button
                key={m.key}
                className={`mode-option${mode === m.key ? " mode-option-active" : ""}`}
                onClick={() => handleSelect(m.key)}
              >
                <div className="mode-option-header">
                  <span className="mode-option-label">{m.label}</span>
                  {mode === m.key && <Check className="mode-option-check" />}
                </div>
                <p className="mode-option-desc">{m.description}</p>
              </button>
            ))}
          </div>

          {saved && <p className="mode-saved">Saved</p>}
        </div>
      </main>
    </div>
  )
}
