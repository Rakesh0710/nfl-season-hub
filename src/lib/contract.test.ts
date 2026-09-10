/**
 * The runtime contract.
 *
 * Two things are worth proving: that the real generated files pass, and that
 * a file which is valid JSON but wrong in some specific way is rejected with a
 * message naming the field. The second is what turns a bad deploy into a
 * legible error instead of an `undefined` three components downstream.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ContractError,
  parseGame,
  parseGamesIndex,
  parseTeam,
  parseTeamsIndex,
} from '@/lib/contract'
import { makeGame, makeTeam } from '@/test/fixtures'

const read = (path: string): unknown => JSON.parse(readFileSync(`public/data/${path}`, 'utf8'))

describe('the generated data', () => {
  it('matches the contract, file by file', () => {
    expect(() => parseTeamsIndex(read('teams-index.json'), 'teams-index')).not.toThrow()
    expect(() => parseGamesIndex(read('games-index.json'), 'games-index')).not.toThrow()
    expect(() => parseTeam(read('team/KC.json'), 'team/KC')).not.toThrow()
    expect(() => parseGame(read('game/2023_12_NO_ATL.json'), 'game')).not.toThrow()
  })

  it('covers all 32 teams', () => {
    expect(parseTeamsIndex(read('teams-index.json'), 'teams-index')).toHaveLength(32)
  })

  it('accepts a postseason game, whose gameType is not REG', () => {
    const game = parseGame(read('game/2023_22_SF_KC.json'), 'game')
    expect(game.gameType).toBe('SB')
  })
})

describe('rejecting bad data', () => {
  const bad = (value: unknown) => {
    try {
      parseGame(value, 'game')
    } catch (error) {
      return error
    }
    throw new Error('expected the parser to reject this value')
  }

  it('names the exact path that disagreed', () => {
    const game = { ...makeGame(), plays: [{ ...makeGame().plays[0], homeWinProb: '0.5' }] }
    const error = bad(game)
    expect(error).toBeInstanceOf(ContractError)
    expect((error as ContractError).path).toBe('game.plays[0].homeWinProb')
    expect((error as ContractError).message).toContain('a finite number')
  })

  it('rejects a missing required field', () => {
    const { gameId: _gameId, ...withoutId } = makeGame()
    expect((bad(withoutId) as ContractError).path).toBe('game.gameId')
  })

  it('rejects NaN, which JSON cannot carry and a chart plots as a gap', () => {
    const game = makeGame()
    const plays = [{ ...game.plays[0], epa: Number.NaN }]
    expect((bad({ ...game, plays }) as ContractError).path).toBe('game.plays[0].epa')
  })

  it('rejects a gameType outside the union', () => {
    const error = bad({ ...makeGame(), gameType: 'PRE' })
    expect((error as ContractError).message).toContain('one of REG, WC, DIV, CON, SB')
  })

  it('rejects null where a value is optional, so "missing" has one spelling', () => {
    const game = makeGame()
    const plays = [{ ...game.plays[0], down: null }]
    expect((bad({ ...game, plays }) as ContractError).path).toBe('game.plays[0].down')
  })

  it('rejects an HTML page served in place of JSON', () => {
    expect((bad('<!doctype html>') as ContractError).path).toBe('game')
  })

  it('rejects an array where an object belongs', () => {
    expect(bad([])).toBeInstanceOf(ContractError)
  })

  it('truncates a long unexpected string rather than pasting a whole file into the message', () => {
    const error = bad('x'.repeat(5000))
    expect((error as ContractError).message.length).toBeLessThan(120)
  })
})

describe('accepting what the contract allows', () => {
  it('treats an omitted optional as undefined', () => {
    const game = makeGame()
    const { down: _down, distance: _distance, epa: _epa, ...play } = makeGame().plays[0]!
    const parsed = parseGame({ ...game, plays: [play] }, 'game')
    expect(parsed.plays[0]?.down).toBeUndefined()
    expect(parsed.plays[0]?.epa).toBeUndefined()
  })

  it('ignores a field this build has never heard of', () => {
    const parsed = parseTeam({ ...makeTeam(), futureField: 42 }, 'team')
    expect(parsed.id).toBe('KC')
  })

  it('keeps the depth chart keyed by whatever positions the data uses', () => {
    const parsed = parseTeam(
      { ...makeTeam(), depthChart: { NB: [{ id: '1', name: 'A', position: 'NB' }] } },
      'team',
    )
    expect(Object.keys(parsed.depthChart)).toEqual(['NB'])
  })

  it('accepts an empty games list for a team with no schedule yet', () => {
    expect(parseTeam({ ...makeTeam(), games: [] }, 'team').games).toEqual([])
  })
})
