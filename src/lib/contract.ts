/**
 * Runtime checking of the JSON contract.
 *
 * `src/types/nfl.ts` describes what the ETL is supposed to emit; nothing in
 * TypeScript makes that true at runtime. `response.json()` hands back an
 * `unknown`, and the usual `as Game` turns a wrong file into a crash somewhere
 * far away from the fetch that caused it — a stale deploy, a half-written ETL
 * run, or an SPA fallback serving HTML all arrive the same way.
 *
 * So every field is checked here, at the only place untrusted data enters the
 * app, and a failure names the exact path that disagreed. Past this module the
 * types are earned rather than asserted, which is why no other file needs a
 * type assertion to read data.
 *
 * The parsers return the interfaces from `types/nfl.ts` by annotation, so the
 * compiler rejects a parser that forgets a field the contract declares. Adding
 * a property to the contract is therefore a build error until it is checked.
 *
 * Unknown extra properties are ignored on purpose: the ETL is allowed to emit
 * a field this build has not learned about yet.
 */

import type {
  Conference,
  Meta,
  SeasonState,
  DraftPick,
  Game,
  GamePlay,
  GameSummary,
  GameTeam,
  GameType,
  Player,
  Team,
  TeamRecord,
  TeamStatLine,
  TeamSummary,
} from '@/types/nfl'

/** A value that did not match the contract, with the path that failed. */
export class ContractError extends Error {
  readonly path: string

  constructor(path: string, expected: string, received: unknown) {
    super(`${path}: expected ${expected}, received ${describe(received)}`)
    this.name = 'ContractError'
    this.path = path
  }
}

/** A short, safe rendering of an unexpected value for the message above. */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `an array of ${value.length}`
  if (typeof value === 'string') return JSON.stringify(value.slice(0, 40))
  if (typeof value === 'object') return 'an object'
  return String(value)
}

/** Reads `unknown` and either returns the contracted type or throws. */
type Parser<T> = (value: unknown, path: string) => T

/**
 * A type predicate rather than a cast: reading an unknown key off any non-null,
 * non-array object yields `unknown`, which is exactly what this claims, so the
 * narrowing is sound where `value as Record<string, unknown>` would only have
 * been asserted.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ContractError(path, 'an object', value)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new ContractError(path, 'a string', value)
  return value
}

/**
 * A number that can be rendered or compared. NaN and Infinity are rejected
 * rather than passed on: JSON cannot carry either, so their presence means the
 * value was computed wrong upstream, and a chart silently plots NaN as a gap.
 */
function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractError(path, 'a finite number', value)
  }
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ContractError(path, 'a boolean', value)
  return value
}

/**
 * An absent optional field.
 *
 * `undefined` only, never `null`: the contract says an unknown value is omitted
 * from the JSON, and accepting `null` here would quietly let the ETL emit a
 * second spelling of "missing" that no consumer expects.
 */
function optional<T>(parse: Parser<T>): Parser<T | undefined> {
  return (value, path) => (value === undefined ? undefined : parse(value, path))
}

function arrayOf<T>(parse: Parser<T>): Parser<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) throw new ContractError(path, 'an array', value)
    return value.map((item, i) => parse(item, `${path}[${i}]`))
  }
}

/** One of a fixed set of strings — the contract's string unions. */
function oneOf<T extends string>(allowed: readonly T[]): Parser<T> {
  return (value, path) => {
    const text = string(value, path)
    // `find` rather than `includes`: it returns the member itself, already
    // typed as T, so the union is narrowed by the search instead of asserted.
    const match = allowed.find((option) => option === text)
    if (match === undefined) throw new ContractError(path, `one of ${allowed.join(', ')}`, value)
    return match
  }
}

/** Reads one property, extending the path so the message points at it. */
function field<T>(source: Record<string, unknown>, key: string, parse: Parser<T>, path: string): T {
  return parse(source[key], `${path}.${key}`)
}

/** A map of arrays, as the depth chart is keyed by position. */
function recordOf<T>(parse: Parser<T>): Parser<Record<string, T>> {
  return (value, path) => {
    const source = object(value, path)
    const out: Record<string, T> = {}
    for (const key of Object.keys(source)) {
      out[key] = parse(source[key], `${path}.${key}`)
    }
    return out
  }
}

const conference = oneOf<Conference>(['AFC', 'NFC'])
const gameType = oneOf<GameType>(['REG', 'WC', 'DIV', 'CON', 'SB'])

const teamRecord: Parser<TeamRecord> = (value, path) => {
  const o = object(value, path)
  return {
    wins: field(o, 'wins', number, path),
    losses: field(o, 'losses', number, path),
    ties: field(o, 'ties', number, path),
  }
}

const teamSummary: Parser<TeamSummary> = (value, path) => {
  const o = object(value, path)
  return {
    id: field(o, 'id', string, path),
    name: field(o, 'name', string, path),
    conference: field(o, 'conference', conference, path),
    division: field(o, 'division', string, path),
    logo: field(o, 'logo', string, path),
    primaryColor: field(o, 'primaryColor', string, path),
    secondaryColor: field(o, 'secondaryColor', string, path),
    lastSeason: field(o, 'lastSeason', teamRecord, path),
    projectedWins: field(o, 'projectedWins', number, path),
  }
}

const player: Parser<Player> = (value, path) => {
  const o = object(value, path)
  return {
    id: field(o, 'id', string, path),
    name: field(o, 'name', string, path),
    position: field(o, 'position', string, path),
    number: field(o, 'number', optional(number), path),
    age: field(o, 'age', optional(number), path),
    college: field(o, 'college', optional(string), path),
    status: field(o, 'status', optional(string), path),
  }
}

const draftPick: Parser<DraftPick> = (value, path) => {
  const o = object(value, path)
  return {
    round: field(o, 'round', number, path),
    pick: field(o, 'pick', number, path),
    player: field(o, 'player', string, path),
    position: field(o, 'position', string, path),
    college: field(o, 'college', string, path),
  }
}

const statLine: Parser<TeamStatLine> = (value, path) => {
  const o = object(value, path)
  return {
    epaPerPlay: field(o, 'epaPerPlay', number, path),
    pointsPerGame: field(o, 'pointsPerGame', number, path),
    yardsPerGame: field(o, 'yardsPerGame', number, path),
    successRate: field(o, 'successRate', number, path),
    explosiveRate: field(o, 'explosiveRate', number, path),
    plays: field(o, 'plays', number, path),
  }
}

const gameSummary: Parser<GameSummary> = (value, path) => {
  const o = object(value, path)
  return {
    gameId: field(o, 'gameId', string, path),
    season: field(o, 'season', number, path),
    week: field(o, 'week', number, path),
    home: field(o, 'home', string, path),
    away: field(o, 'away', string, path),
    homeScore: field(o, 'homeScore', number, path),
    awayScore: field(o, 'awayScore', number, path),
    date: field(o, 'date', string, path),
    gameType: field(o, 'gameType', gameType, path),
  }
}

const gamePlay: Parser<GamePlay> = (value, path) => {
  const o = object(value, path)
  return {
    playId: field(o, 'playId', number, path),
    quarter: field(o, 'quarter', number, path),
    clockSeconds: field(o, 'clockSeconds', number, path),
    homeWinProb: field(o, 'homeWinProb', number, path),
    scoreHome: field(o, 'scoreHome', number, path),
    scoreAway: field(o, 'scoreAway', number, path),
    down: field(o, 'down', optional(number), path),
    distance: field(o, 'distance', optional(number), path),
    posteam: field(o, 'posteam', string, path),
    playType: field(o, 'playType', string, path),
    description: field(o, 'description', string, path),
    epa: field(o, 'epa', optional(number), path),
    isKeyPlay: field(o, 'isKeyPlay', boolean, path),
  }
}

const gameTeam: Parser<GameTeam> = (value, path) => {
  const o = object(value, path)
  return {
    id: field(o, 'id', string, path),
    name: field(o, 'name', string, path),
    logo: field(o, 'logo', string, path),
    color: field(o, 'color', string, path),
    finalScore: field(o, 'finalScore', number, path),
  }
}

const seasonState: Parser<SeasonState> = (value, path) => {
  const o = object(value, path)
  return {
    season: field(o, 'season', number, path),
    scheduled: field(o, 'scheduled', number, path),
    played: field(o, 'played', number, path),
    complete: field(o, 'complete', boolean, path),
  }
}

export const parseMeta: Parser<Meta> = (value, path) => {
  const o = object(value, path)
  return {
    generatedAt: field(o, 'generatedAt', string, path),
    source: field(o, 'source', string, path),
    displaySeason: field(o, 'displaySeason', number, path),
    latestSeason: field(o, 'latestSeason', number, path),
    seasons: field(o, 'seasons', arrayOf(seasonState), path),
  }
}

export const parseTeamsIndex: Parser<TeamSummary[]> = arrayOf(teamSummary)
export const parseGamesIndex: Parser<GameSummary[]> = arrayOf(gameSummary)

export const parseTeam: Parser<Team> = (value, path) => {
  const o = object(value, path)
  return {
    ...teamSummary(value, path),
    roster: field(o, 'roster', arrayOf(player), path),
    depthChart: field(o, 'depthChart', recordOf(arrayOf(player)), path),
    draftClass: field(o, 'draftClass', arrayOf(draftPick), path),
    stats: field(
      o,
      'stats',
      (statsValue, statsPath) => {
        const stats = object(statsValue, statsPath)
        return {
          offense: field(stats, 'offense', statLine, statsPath),
          defense: field(stats, 'defense', statLine, statsPath),
        }
      },
      path,
    ),
    games: field(o, 'games', arrayOf(gameSummary), path),
  }
}

export const parseGame: Parser<Game> = (value, path) => {
  const o = object(value, path)
  return {
    gameId: field(o, 'gameId', string, path),
    season: field(o, 'season', number, path),
    week: field(o, 'week', number, path),
    date: field(o, 'date', string, path),
    gameType: field(o, 'gameType', gameType, path),
    home: field(o, 'home', gameTeam, path),
    away: field(o, 'away', gameTeam, path),
    plays: field(o, 'plays', arrayOf(gamePlay), path),
  }
}
