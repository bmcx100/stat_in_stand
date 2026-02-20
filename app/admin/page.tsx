"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/admin/dashboard")
      } else {
        setLoading(false)
      }
    })
  }, [router, supabase.auth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.replace("/admin/dashboard")
  }

  if (loading) {
    return (
      <div className="admin-login-page">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <h1 className="page-title">Admin Login</h1>
        <form onSubmit={handleSubmit} className="admin-login-form">
          <input
            type="email"
            className="game-form-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="game-form-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="admin-error">{error}</p>}
          <button type="submit" className="admin-btn" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  )
}
