import { describe, it, expect } from 'vitest'
import { defineMachine } from '../../src/core/defineMachine'

describe('defineMachine', () => {
  it('returns the same config object', () => {
    const config = defineMachine({
      id: 'test',
      initial: 'a',
      states: { a: {}, b: {} },
    })
    expect(config.id).toBe('test')
    expect(config.initial).toBe('a')
  })

  it('throws if id is empty', () => {
    expect(() =>
      defineMachine({ id: '', initial: 'a', states: { a: {} } }),
    ).toThrow('config.id cannot be empty')
  })

  it('throws if initial state does not exist', () => {
    expect(() =>
      defineMachine({ id: 'x', initial: 'missing' as 'a', states: { a: {} } }),
    ).toThrow('initial state "missing" not found')
  })

  it('throws if a transition targets an unknown state', () => {
    expect(() =>
      defineMachine({
        id: 'x',
        initial: 'a',
        states: {
          a: { on: { GO: { target: 'nowhere' as 'a' } } },
        },
      }),
    ).toThrow('targets unknown state "nowhere"')
  })

  it('accepts valid config with context', () => {
    const config = defineMachine({
      id: 'login',
      initial: 'idle',
      context: { count: 0 },
      states: {
        idle: { on: { START: { target: 'active' } } },
        active: { type: 'final' },
      },
    })
    expect(config.context).toEqual({ count: 0 })
  })
})
