export type Team = {
  id: string
  organization: string
  name: string
  ageGroup: string
  level: string
  banner: string
}

export const TEAMS: Team[] = [
  { id: "nw-u13-bb", organization: "Nepean Wildcats", name: "U13 BB", ageGroup: "U13", level: "BB", banner: "/images/wildcats_short_banner.png" },
  { id: "nw-u13-a", organization: "Nepean Wildcats", name: "U13 A", ageGroup: "U13", level: "A", banner: "/images/wildcats_short_banner.png" },
  { id: "nw-u13-aa", organization: "Nepean Wildcats", name: "U13 AA", ageGroup: "U13", level: "AA", banner: "/images/wildcats_short_banner.png" },
  { id: "nw-u15-bb", organization: "Nepean Wildcats", name: "U15 BB", ageGroup: "U15", level: "BB", banner: "/images/wildcats_short_banner.png" },
  { id: "nw-u15-a", organization: "Nepean Wildcats", name: "U15 A", ageGroup: "U15", level: "A", banner: "/images/wildcats_short_banner.png" },
  { id: "nw-u15-aa", organization: "Nepean Wildcats", name: "U15 AA", ageGroup: "U15", level: "AA", banner: "/images/wildcats_short_banner.png" },
  { id: "oi-u15-a", organization: "Ottawa Ice", name: "U15 A", ageGroup: "U15", level: "A", banner: "/images/ice_short_banner.png" },
]
