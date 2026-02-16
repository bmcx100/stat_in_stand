# Hockey Team Tracker — Implementation Plan

## Context

The app has only the default Next.js starter page. This plan replaces it with a mobile-first hockey team tracker for Nepean Wildcats teams (6 variants: U13/U15 x BB/A/AA). Users favorite teams, see them on a home screen as wide cards, and tap into a placeholder dashboard. The layout is constrained to mobile width even on desktop.

## Routing Structure

| Route | Purpose |
|-------|---------|
| `/` | Home — favorited teams as horizontal cards. If no favorites, redirects to `/add-teams` |
| `/add-teams` | Browse all 6 teams, toggle hearts, "Done" button (disabled until 1+ selected) |
| `/dashboard/[teamId]` | Placeholder team dashboard |

## Files to Create/Modify (in order)

### 1. `lib/teams.ts` (create)
- `Team` type: `{ id: string, name: string, ageGroup: string, level: string }`
- `TEAMS` array in display order: U13 BB, U13 A, U13 AA, U15 BB, U15 A, U15 AA
- `ORGANIZATION` constant: `"Nepean Wildcats"`

### 2. `hooks/use-favorites.ts` (create)
- `"use client"` hook, `useState<string[]>` + localStorage key `"favorite-teams"`
- Returns `{ favorites, toggleFavorite(id), isFavorite(id), isLoaded }`
- SSR-safe: init empty, hydrate from localStorage in `useEffect`, set `isLoaded` flag
- Write back to localStorage on change

### 3. `app/globals.css` (modify — append custom classes)
All multi-class elements use `@apply` per CLAUDE.md rules. Key classes:
- `.app-shell` — centers content, max-w mobile (~430px), min-h-screen, mx-auto
- `.page-container` — flex col, flex-1, px-4, py-6, gap-4
- `.page-header` — flex, items-center, justify-between
- `.page-title` — text-2xl, font-bold, tracking-tight
- `.team-card` — wide card: w-full, rounded-xl, border, bg-card, p-4, flex, items-center, justify-between, cursor-pointer, hover transition
- `.team-card-info` — flex col gap-0.5
- `.team-card-name` — font-semibold, text-card-foreground
- `.team-card-org` — text-sm, text-muted-foreground
- `.team-list` — flex col, gap-3
- `.team-list-item` — flex, items-center, justify-between, rounded-lg, border, bg-card, px-4, py-3
- `.heart-button` — text-muted-foreground, hover:text-red-500, transition
- `.heart-button[data-active="true"]` — text-red-500
- `.dashboard-container` — flex col, items-center, justify-center, flex-1, gap-4, text-center
- `.dashboard-title` — text-3xl, font-bold
- `.dashboard-subtitle` — text-muted-foreground
- `.add-teams-header` — flex, items-center, justify-between, mb-2

### 4. `app/layout.tsx` (modify)
- Update metadata: title "Stat in Stand", description "Hockey Team Tracker"
- Wrap `{children}` in a div with `.app-shell` class to constrain to mobile width

### 5. `app/page.tsx` (rewrite)
- Client component using `useFavorites`
- If `isLoaded && favorites.length === 0` → redirect to `/add-teams` via `router.push`
- Otherwise: header with "My Teams" title + subtle ghost "Add Teams" link
- List of favorited teams (filtered from `TEAMS`, preserving array order = age then level)
- Each card: Link to `/dashboard/[teamId]`, shows org name + team name, heart button to unfavorite
- While `!isLoaded`: show nothing (avoid flash)

### 6. `app/add-teams/page.tsx` (create)
- Client component using `useFavorites`
- Header: "Add Teams" title + "Done" button (Link to `/`, disabled when 0 favorites)
- List all 6 teams from `TEAMS`
- Each row: team name + heart toggle icon
- Heart filled (Lucide `Heart` with `fill="currentColor"`) when favorited, outline when not

### 7. `app/dashboard/[teamId]/page.tsx` (create)
- Server component, async page with `await params`
- Look up team by id from `TEAMS`
- Show "Nepean Wildcats {team.name}", "Dashboard coming soon", back link to `/`
- Not found case: message + link back

## No New Dependencies

- `lucide-react` already installed (Heart icon)
- `Button` from shadcn already available
- No new shadcn components needed

## Verification

1. `npm run build` — compiles without errors
2. `npm run dev` — manual testing:
   - First visit (no localStorage): auto-redirects to `/add-teams`
   - Heart toggles work, Done button disabled until 1+ favorited
   - Done returns to home with cards showing
   - Cards link to dashboard placeholder
   - Heart on home screen unfavorites; if last team removed, redirects to add-teams
   - Refresh preserves favorites
   - Layout stays mobile-width on desktop
3. `npm run lint` — passes
