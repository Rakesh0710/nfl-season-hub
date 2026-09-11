/**
 * Contract-shaped test data.
 *
 * Every builder returns a value that satisfies the interface in
 * `types/nfl.ts`, so a test can override the one field it cares about and
 * trust the rest. They are typed rather than cast, which means a change to the
 * contract breaks the fixtures at compile time — the same guarantee the
 * runtime parsers give the real data.
 */

import type {
  Conference,
  Game,
  GamePlay,
  GameSummary,
  Meta,
  Player,
  SeasonRecord,
  TeamSeason,
  TeamSeasonView,
  TeamStatLine,
  TeamSummary,
} from '@/types/nfl'

export function makeTeamSummary(over: Partial<TeamSummary> = {}): TeamSummary {
  return {
    id: 'KC',
    name: 'Kansas City Chiefs',
    conference: 'AFC',
    division: 'AFC West',
    logo: 'https://example.test/kc.png',
    primaryColor: '#E31837',
    secondaryColor: '#FFB81C',
    lastSeason: { wins: 11, losses: 6, ties: 0 },
    projectedWins: 10.4,
    ...over,
  }
}

/** Four teams per division across both conferences — a miniature league. */
export function makeLeague(): TeamSummary[] {
  const spec: [string, string, Conference, string, number, number][] = [
    ['KC', 'Kansas City Chiefs', 'AFC', 'AFC West', 11, 10.4],
    ['DEN', 'Denver Broncos', 'AFC', 'AFC West', 8, 8.1],
    ['BUF', 'Buffalo Bills', 'AFC', 'AFC East', 13, 11.2],
    ['NYJ', 'New York Jets', 'AFC', 'AFC East', 5, 6.5],
    ['SF', 'San Francisco 49ers', 'NFC', 'NFC West', 12, 11.9],
    ['ARI', 'Arizona Cardinals', 'NFC', 'NFC West', 8, 7.2],
    ['PHI', 'Philadelphia Eagles', 'NFC', 'NFC East', 11, 10.4],
    ['NYG', 'New York Giants', 'NFC', 'NFC East', 3, 5.8],
  ]
  return spec.map(([id, name, conference, division, wins, projectedWins]) =>
    makeTeamSummary({
      id,
      name,
      conference,
      division,
      lastSeason: { wins, losses: 17 - wins, ties: 0 },
      projectedWins,
    }),
  )
}

export function makeGameSummary(over: Partial<GameSummary> = {}): GameSummary {
  return {
    gameId: '2023_12_NO_ATL',
    season: 2023,
    week: 12,
    home: 'ATL',
    away: 'NO',
    homeScore: 24,
    awayScore: 15,
    date: '2023-11-26',
    gameType: 'REG',
    ...over,
  }
}

export function makePlay(over: Partial<GamePlay> = {}): GamePlay {
  return {
    playId: 1,
    quarter: 1,
    clockSeconds: 900,
    homeWinProb: 0.5,
    scoreHome: 0,
    scoreAway: 0,
    down: 1,
    distance: 10,
    posteam: 'ATL',
    playType: 'pass',
    description: 'M. Ryan pass short right to K. Pitts for 8 yards.',
    epa: 0.14,
    isKeyPlay: false,
    ...over,
  }
}

/**
 * A short game that still exercises the interesting cases: four quarters plus
 * overtime, a play with no down, and key plays that are not at the edges.
 */
export function makeGame(over: Partial<Game> = {}): Game {
  const plays: GamePlay[] = [
    makePlay({
      playId: 1,
      quarter: 1,
      clockSeconds: 900,
      homeWinProb: 0.5,
      down: undefined,
      distance: undefined,
      playType: 'kickoff',
      description: 'Y. Koo kicks 65 yards from ATL 35 to end zone, Touchback.',
    }),
    makePlay({ playId: 2, quarter: 1, clockSeconds: 880, homeWinProb: 0.54 }),
    makePlay({
      playId: 3,
      quarter: 2,
      clockSeconds: 700,
      homeWinProb: 0.71,
      scoreHome: 7,
      isKeyPlay: true,
      description: 'B. Robinson runs 3 yards for a touchdown.',
    }),
    makePlay({
      playId: 4,
      quarter: 3,
      clockSeconds: 500,
      homeWinProb: 0.42,
      scoreHome: 7,
      scoreAway: 10,
      isKeyPlay: true,
      description: 'D. Carr pass deep left to C. Olave for 44 yards, TOUCHDOWN.',
    }),
    makePlay({
      playId: 5,
      quarter: 4,
      clockSeconds: 120,
      homeWinProb: 0.63,
      scoreHome: 14,
      scoreAway: 10,
      isKeyPlay: true,
      epa: 3.1,
    }),
    makePlay({
      playId: 6,
      quarter: 5,
      clockSeconds: 300,
      homeWinProb: 0.88,
      scoreHome: 17,
      scoreAway: 10,
    }),
  ]
  return {
    gameId: '2023_12_NO_ATL',
    season: 2023,
    week: 12,
    date: '2023-11-26',
    gameType: 'REG',
    home: {
      id: 'ATL',
      name: 'Atlanta Falcons',
      logo: 'https://example.test/atl.png',
      color: '#A71930',
      finalScore: 17,
    },
    away: {
      id: 'NO',
      name: 'New Orleans Saints',
      logo: 'https://example.test/no.png',
      color: '#D3BC8D',
      finalScore: 10,
    },
    plays,
    ...over,
  }
}

export function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: '00-0033873',
    name: 'Patrick Mahomes',
    position: 'QB',
    number: 15,
    age: 29,
    college: 'Texas Tech',
    status: 'ACT',
    ...over,
  }
}

function makeStatLine(over: Partial<TeamStatLine> = {}): TeamStatLine {
  return {
    epaPerPlay: 0.08,
    pointsPerGame: 24.1,
    yardsPerGame: 352.4,
    successRate: 0.47,
    explosiveRate: 0.09,
    plays: 1048,
    ...over,
  }
}

export function makeTeamSeason(over: Partial<TeamSeason> = {}): TeamSeason {
  const { id, name, conference, division, logo, primaryColor, secondaryColor } = makeTeamSummary()
  return {
    id,
    name,
    conference,
    division,
    logo,
    primaryColor,
    secondaryColor,
    season: 2025,
    record: { wins: 11, losses: 6, ties: 0 },
    expectedWins: 10.4,
    roster: [
      makePlayer(),
      makePlayer({
        id: '00-0036355',
        name: 'Isiah Pacheco',
        position: 'RB',
        number: 10,
        status: 'ACT',
      }),
      makePlayer({
        id: '00-0031234',
        name: 'Reserve Guy',
        position: 'WR',
        number: 88,
        status: 'RES',
      }),
    ],
    depthChart: {
      QB: [makePlayer()],
      RB: [makePlayer({ id: '00-0036355', name: 'Isiah Pacheco', position: 'RB', number: 10 })],
    },
    draftClass: [
      {
        round: 1,
        pick: 32,
        player: 'Felix Anudike-Uzomah',
        position: 'DE',
        college: 'Kansas State',
      },
    ],
    stats: { offense: makeStatLine(), defense: makeStatLine({ epaPerPlay: -0.04 }) },
    // Same season as the file. A per-season team file that carried another
    // year's games would be exactly the mixing the layout exists to prevent,
    // and `validate.py` rejects it in the real data.
    games: [
      makeGameSummary({
        gameId: '2025_01_KC_BUF',
        season: 2025,
        week: 1,
        home: 'BUF',
        away: 'KC',
        homeScore: 20,
        awayScore: 27,
      }),
      makeGameSummary({
        gameId: '2025_02_DEN_KC',
        season: 2025,
        week: 2,
        home: 'KC',
        away: 'DEN',
        homeScore: 26,
        awayScore: 25,
      }),
    ],
    ...over,
  }
}

export function makeSeasonRecord(over: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    season: 2025,
    team: 'KC',
    wins: 11,
    losses: 6,
    ties: 0,
    pointsFor: 420,
    pointsAgainst: 360,
    expectedWins: 10.4,
    ...over,
  }
}

/**
 * A standings row for every team in `makeLeague()`, for one season.
 *
 * Records descend so a sort has something to order, and expected wins runs
 * against the record for two of them, so a test can tell the two sorts apart.
 */
export function makeStandings(season = 2025): SeasonRecord[] {
  const wins: Record<string, [number, number]> = {
    // team -> [actual wins, expected wins]
    KC: [11, 10.4],
    DEN: [8, 8.1],
    BUF: [13, 11.2],
    NYJ: [5, 6.5],
    SF: [12, 11.9],
    ARI: [8, 7.2],
    PHI: [11, 10.4],
    NYG: [3, 5.8],
  }
  return makeLeague().map((team) => {
    const [won, expected] = wins[team.id] ?? [8, 8]
    return makeSeasonRecord({
      season,
      team: team.id,
      wins: won,
      losses: 17 - won,
      expectedWins: expected,
    })
  })
}

/** A dashboard card's worth of team: identity joined to one season. */
export function makeTeamSeasonView(over: Partial<TeamSeasonView> = {}): TeamSeasonView {
  const { id, name, conference, division, logo, primaryColor, secondaryColor } = makeTeamSummary()
  return {
    id,
    name,
    conference,
    division,
    logo,
    primaryColor,
    secondaryColor,
    season: 2025,
    record: { wins: 11, losses: 6, ties: 0 },
    expectedWins: 10.4,
    ...over,
  }
}

/**
 * A dataset whose six seasons are all complete and whose newest is displayed.
 *
 * `teamSeasons` is what the league and team pages may offer; it is a subset of
 * `seasons`, because a season two games old has replays but no squad.
 */
export function makeMeta(over: Partial<Meta> = {}): Meta {
  const seasons = [2020, 2021, 2022, 2023, 2024, 2025]
  return {
    generatedAt: '2026-09-11T05:00:00Z',
    source: 'nflverse',
    displaySeason: 2025,
    latestSeason: 2025,
    teamSeasons: seasons,
    seasons: seasons.map((season) => ({ season, scheduled: 285, played: 285, complete: true })),
    ...over,
  }
}
