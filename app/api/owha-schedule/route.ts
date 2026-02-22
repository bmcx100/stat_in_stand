import { NextResponse } from "next/server"

export type OWHAGame = {
  id: string
  date: string
  notes: string
  location: string
  homeTeam: string
  homeScore: number | null
  visitorTeam: string
  visitorScore: number | null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "").trim())
}

function anchorText(html: string): string {
  const m = html.match(/<a[^>]*>([\s\S]*?)<\/a>/)
  return m ? stripTags(m[1]) : stripTags(html)
}

function parseTeam(raw: string): { name: string; score: number | null } {
  const m = raw.match(/^(.*?)\s+\((\d+)\)\s*$/)
  if (m) return { name: m[1].trim(), score: parseInt(m[2], 10) }
  return { name: raw.trim(), score: null }
}

export async function GET() {
  try {
    const res = await fetch("https://www.owha.on.ca/division/0/27225/games", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `OWHA returned ${res.status}` },
        { status: 502 }
      )
    }

    const html = await res.text()

    const tbodyMatch = html.match(
      /<tbody[^>]*aria-live[^>]*>([\s\S]*?)<\/tbody>/
    )
    if (!tbodyMatch) {
      return NextResponse.json(
        { error: "Could not locate schedule table in OWHA response" },
        { status: 500 }
      )
    }

    const games: OWHAGame[] = []

    for (const rowMatch of tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
        (c) => c[1]
      )
      if (cells.length < 5) continue

      const id = stripTags(cells[0])

      const dateParts = cells[1].split(/<br\s*\/?>/i)
      const date = stripTags(dateParts[0])
      const notes = dateParts
        .slice(1)
        .map(stripTags)
        .filter(Boolean)
        .join(" ")

      const location = anchorText(cells[2])
      const { name: homeTeam, score: homeScore } = parseTeam(anchorText(cells[3]))
      const { name: visitorTeam, score: visitorScore } = parseTeam(
        anchorText(cells[4])
      )

      games.push({ id, date, notes, location, homeTeam, homeScore, visitorTeam, visitorScore })
    }

    return NextResponse.json({ games })
  } catch (err) {
    console.error("owha-schedule error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
