/**
 * The data contract.
 *
 * Every interface here mirrors a JSON shape emitted by `etl/build_data.py`,
 * and `etl/validate.py` enforces the agreement on every generated file.
 * If you change one, change all three in the same commit.
 *
 * Optional properties (`?`) are OMITTED from the JSON when unknown, never
 * emitted as null — `null` does not satisfy `number | undefined` under
 * `strict`, so an absent key is the only representation that typechecks.
 */

export type Conference = 'AFC' | 'NFC'

/** Regular season, or a postseason round. */
export type GameType = 'REG' | 'WC' | 'DIV' | 'CON' | 'SB'

export interface TeamRecord {
  wins: number
  losses: number
  ties: number
}

/** One entry in `teams-index.json` — the league dashboard. */
export interface TeamSummary {
  id: string // "KC"
  name: string // "Kansas City Chiefs"
  conference: Conference
  division: string // "AFC West"
  logo: string
  primaryColor: string
  secondaryColor: string
  /** Regular-season record of the season before the one this file covers. */
  lastSeason: TeamRecord
  /**
   * Market-implied expected wins for the covered season: each game's closing
   * spread converted to a win probability and summed across the regular
   * season. The nflverse Vegas win-total dataset was discontinued after 2020,
   * so this stands in for a preseason over/under.
   */
  projectedWins: number
}

export interface Player {
  id: string
  name: string
  position: string
  number?: number
  age?: number
  college?: string
  status?: string
}

export interface DraftPick {
  round: number
  pick: number
  player: string
  position: string
  college: string
}

export interface TeamStatLine {
  epaPerPlay: number
  pointsPerGame: number
  yardsPerGame: number
  /** Share of plays with positive EPA. */
  successRate: number
  /** Share of plays gaining 20+ yards. */
  explosiveRate: number
  /** Sample size behind the rates above. */
  plays: number
}

/** One entry in `games-index.json` — the game browser, all seasons. */
export interface GameSummary {
  gameId: string
  season: number
  week: number
  home: string // team id
  away: string // team id
  homeScore: number
  awayScore: number
  date: string // YYYY-MM-DD
  gameType: GameType
}

/** `team/<TEAM_ID>.json` — the team page. */
export interface Team extends TeamSummary {
  roster: Player[]
  /** Position -> players in depth order; index 0 is the starter. */
  depthChart: Record<string, Player[]>
  draftClass: DraftPick[]
  stats: {
    offense: TeamStatLine
    defense: TeamStatLine
  }
  games: GameSummary[]
}

/** One play in a replay — the array the animation walks. */
export interface GamePlay {
  playId: number
  quarter: number
  /**
   * Seconds remaining in `quarter`, counting down (900 at the start of a
   * regulation quarter, 600 at the start of overtime, 0 at its end).
   *
   * For a whole-game timeline axis, elapsed seconds are derived as:
   *   quarter <= 4 -> (quarter - 1) * 900 + (900 - clockSeconds)
   *   quarter >= 5 -> 3600 + (quarter - 5) * 600 + (600 - clockSeconds)
   */
  clockSeconds: number
  /** 0..1 — the home team's win probability; the value the replay animates. */
  homeWinProb: number
  scoreHome: number
  scoreAway: number
  down?: number
  distance?: number
  posteam: string
  playType: string
  description: string
  epa?: number
  /** See KEY_PLAY rules in etl/build_data.py: score, turnover, or big swing. */
  isKeyPlay: boolean
}

/** `game/<GAME_ID>.json` — the replay fuel. */
export interface GameTeam {
  id: string
  name: string
  logo: string
  color: string
  finalScore: number
}

export interface Game {
  gameId: string
  season: number
  week: number
  date: string
  home: GameTeam
  away: GameTeam
  /** Chronological: quarter ascending, then game clock descending. */
  plays: GamePlay[]
}
