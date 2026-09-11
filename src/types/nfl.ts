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
  /**
   * Whether `player/<id>.json` exists for this person.
   *
   * Absent for the roughly a third of a roster the dataset records no
   * production for — offensive linemen above all, whose contribution it simply
   * does not measure. The UI links a name only when there is something behind
   * it; a page repeating this row with a photograph on it would not be worth a
   * route.
   */
  hasProfile?: boolean
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

/** One entry in `games-index.json`, and of a team's own `games` list. */
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
  /**
   * Every game this team has played across all seasons in the dataset, oldest
   * first — roughly 105, not the 17 of one season.
   *
   * Deliberately wider than the rest of the team file, which describes a
   * single season: the replays are the point of the site and the team page is
   * how anyone reaches them. Consumers that want one season filter by
   * `season`; `meta.displaySeason` says which one the stat lines above match.
   */
  games: GameSummary[]
}

/** One play in a replay — the array the animation walks. */
export interface GamePlay {
  playId: number
  quarter: number
  /**
   * Seconds remaining in `quarter`, counting down. 900 at the start of a
   * regulation quarter; 0 at its end.
   *
   * Overtime length depends on the game: 600 seconds in the regular season,
   * 900 in the postseason. Use the game's `gameType` to pick, via
   * `overtimeLength()` below — do NOT assume 600, or postseason overtime will
   * compute an elapsed time earlier than the end of regulation.
   */
  clockSeconds: number
  /**
   * 0..1 — the home team's win probability BEFORE this play is run
   * (pre-snap). The replay animates this value, so the curve shows the state
   * going into each play; the final play therefore need not sit at exactly
   * 0 or 1 when a game ends on a walk-off score.
   */
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
  /** Needed to interpret overtime length; see `overtimeLength()`. */
  gameType: GameType
  home: GameTeam
  away: GameTeam
  /** Chronological: quarter ascending, then game clock descending. */
  plays: GamePlay[]
}

/**
 * One player's numbers, over a week or a whole season.
 *
 * Every field is optional and a zero is omitted, so a quarterback's line
 * carries no tackle count and a cornerback's no completions. Reading it means
 * asking what is present rather than filtering what is not.
 */
export interface PlayerStatLine {
  completions?: number
  attempts?: number
  passingYards?: number
  passingTds?: number
  interceptions?: number
  passingEpa?: number

  carries?: number
  rushingYards?: number
  rushingTds?: number
  rushingEpa?: number

  targets?: number
  receptions?: number
  receivingYards?: number
  receivingTds?: number
  receivingEpa?: number

  tackles?: number
  sacks?: number
  defInterceptions?: number
  forcedFumbles?: number
  passesDefended?: number

  fgMade?: number
  fgAtt?: number
  /** The longest made kick, so this one is a maximum rather than a total. */
  fgLong?: number
  patMade?: number
  patAtt?: number
}

/** A season of a player's career: who they played for, and what they did. */
export interface PlayerSeason {
  season: number
  team: string
  /** Games with a recorded stat line, which is not the same as games active. */
  games: number
  stats: PlayerStatLine
}

/** One week of the displayed season. */
export interface PlayerWeek {
  season: number
  week: number
  opponent: string
  /** Present when the game has a replay to link to. */
  gameId?: string
  stats: PlayerStatLine
}

/**
 * `player/<id>.json` — one per player with recorded production.
 *
 * Deliberately not one per rostered player. Of 3,135 players on a 2025 roster
 * 1,115 have no stat row in any season, and a page for them would be their
 * roster row with a photograph on it.
 */
export interface PlayerProfile {
  id: string
  name: string
  position: string
  team: string
  headshot?: string
  number?: number
  age?: number
  college?: string
  /** Inches. */
  height?: number
  /** Pounds. */
  weight?: number
  /** Completed seasons in the league. */
  experience?: number
  draft?: { year?: number; pick?: number; club?: string }
  /** Oldest first; only seasons with recorded production. */
  seasons: PlayerSeason[]
  /** The displayed season, week by week. Empty if they did not play in it. */
  weeks: PlayerWeek[]
}

/** How far through a season the dataset is. One entry per season in `meta.json`. */
export interface SeasonState {
  season: number
  /** Fixtures on the schedule. A season in progress already knows all of them. */
  scheduled: number
  /** Fixtures with a result. */
  played: number
  complete: boolean
}

/**
 * `meta.json` — when the data was generated and how finished each season is.
 *
 * Written by every ETL run. Without it the site cannot tell a complete season
 * from a two-game one, and would present both as "the season".
 */
export interface Meta {
  /** ISO 8601, UTC, whole seconds. */
  generatedAt: string
  source: string
  /** The season the team layer describes: rosters, stat lines, projections. */
  displaySeason: number
  /** The newest season nflverse has published a schedule for. */
  latestSeason: number
  seasons: SeasonState[]
}

/** Overtime period length in seconds: 10 minutes in the regular season, 15 in the playoffs. */
export function overtimeLength(gameType: GameType): number {
  return gameType === 'REG' ? 600 : 900
}

/**
 * Seconds elapsed since kickoff, for positioning a play on a whole-game
 * timeline. Regulation quarters are 900 seconds; overtime varies by gameType.
 */
export function elapsedSeconds(play: GamePlay, gameType: GameType): number {
  if (play.quarter <= 4) {
    return (play.quarter - 1) * 900 + (900 - play.clockSeconds)
  }
  const ot = overtimeLength(gameType)
  return 3600 + (play.quarter - 5) * ot + (ot - play.clockSeconds)
}
