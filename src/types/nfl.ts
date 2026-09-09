/**
 * The data contract.
 *
 * Every interface here mirrors a JSON shape emitted by `etl/build_data.py`.
 * If you change one, change the other in the same commit — these types are the
 * only thing standing between the ETL and the UI.
 */

export type Conference = 'AFC' | 'NFC'

/** Regular-season game type; the postseason rounds appear in games lists. */
export type GameType = 'REG' | 'WC' | 'DIV' | 'CON' | 'SB'

export interface TeamRecord {
  wins: number
  losses: number
  ties: number
}

/** Identity fields shared by every representation of a team. */
export interface TeamIdentity {
  id: string // "KC"
  name: string // "Kansas City Chiefs"
  nick: string // "Chiefs"
  conference: Conference
  division: string // "AFC West"
  logo: string
  primaryColor: string
  secondaryColor: string
}

/** One entry in `<season>/teams-index.json` — powers the league dashboard. */
export interface TeamSummary extends TeamIdentity {
  season: number
  record: TeamRecord
  /** The prior season's regular-season record; null if outside the dataset. */
  priorSeason: TeamRecord | null
  /**
   * Market-implied expected wins: each game's closing spread converted to a win
   * probability and summed across the regular season. The nflverse Vegas
   * win-total dataset stops after 2020, so this stands in for preseason
   * over/unders and has full coverage for every season.
   */
  projectedWins: number
  pointsFor: number
  pointsAgainst: number
  pointDiff: number
  gamesPlayed: number
}

export interface Player {
  id: string
  name: string
  position: string | null
  number: number | null
  age: number | null
  college: string | null
  status: string | null
  yearsExp: number | null
  headshot: string | null
}

/** A player as they appear on a depth chart, carrying their order at the position. */
export interface DepthChartEntry {
  id: string
  name: string
  position: string
  number: number | null
  /** 1 = starter. */
  rank: number
}

export interface DraftPick {
  round: number | null
  pick: number | null
  player: string | null
  position: string | null
  college: string | null
}

export interface TeamStatLine {
  epaPerPlay: number | null
  successRate: number | null
  pointsPerGame: number | null
  yardsPerGame: number | null
  explosiveRate: number | null
  plays: number
}

export interface TeamStats {
  offense: TeamStatLine
  defense: TeamStatLine
}

/** One entry in `<season>/games-index.json`. */
export interface GameSummary {
  gameId: string
  season: number
  week: number
  gameType: GameType
  home: string // team id
  away: string // team id
  homeScore: number | null
  awayScore: number | null
  date: string | null // YYYY-MM-DD
}

/** `<season>/team/<id>.json` — the team page. */
export interface Team extends TeamSummary {
  roster: Player[]
  /** Position -> players ordered by depth. */
  depthChart: Record<string, DepthChartEntry[]>
  draftClass: DraftPick[]
  stats: TeamStats
  games: GameSummary[]
}

/** One play in a game replay — the array the animation walks. */
export interface GamePlay {
  playId: number
  quarter: number
  /** Seconds remaining in the quarter, for the on-screen clock. */
  clockSeconds: number
  /** Seconds remaining in the game, for positioning on the timeline. */
  gameSecondsRemaining: number
  /** 0..1 — the value the replay animates. */
  homeWinProb: number
  scoreHome: number
  scoreAway: number
  down: number | null
  distance: number | null
  posteam: string | null
  playType: string | null
  description: string
  epa: number | null
  /** Flagged during ETL: big win-prob swings, touchdowns, turnovers. */
  isKeyPlay: boolean
}

/** `game/<gameId>.json` — the replay fuel. */
export interface Game extends Omit<GameSummary, 'home' | 'away'> {
  home: TeamIdentity & { finalScore: number | null }
  away: TeamIdentity & { finalScore: number | null }
  /** Ordered by quarter then play id — the replay walks this array. */
  plays: GamePlay[]
  keyPlayCount: number
}

/** `seasons.json` — the manifest. */
export interface SeasonsManifest {
  seasons: { season: number; teams: number; games: number }[]
  generatedAt: string
  source: string
  projectedWins: string
}
