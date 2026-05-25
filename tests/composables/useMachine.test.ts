import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { withSetup } from '../helpers'
import { defineMachine } from '../../src/core/defineMachine'
import { useMachine } from '../../src/composables/useMachine'

const trafficLight = defineMachine({
  id: 'traffic',
  initial: 'red' as const,
  states: {
    red: { on: { NEXT: { target: 'green' as const } } },
    green: { on: { NEXT: { target: 'yellow' as const } } },
    yellow: { on: { NEXT: { target: 'red' as const } } },
  },
})

describe('useMachine', () => {
  it('returns reactive state ref', async () => {
    const { result } = withSetup(() => useMachine(trafficLight))
    expect(result.state.value).toBe('red')
    await result.send('NEXT')
    expect(result.state.value).toBe('green')
  })

  it('matches() works for string', async () => {
    const { result } = withSetup(() => useMachine(trafficLight))
    expect(result.matches('red')).toBe(true)
    expect(result.matches('green')).toBe(false)
  })

  it('matches() works for array', async () => {
    const { result } = withSetup(() => useMachine(trafficLight))
    expect(result.matches(['red', 'green'])).toBe(true)
    expect(result.matches(['green', 'yellow'])).toBe(false)
  })

  it('can() and cannot() respond to guard', async () => {
    const machine = defineMachine({
      id: 'g',
      initial: 'a' as const,
      context: { go: false },
      states: {
        a: { on: { GO: { target: 'b' as const, guard: (ctx) => ctx.go } } },
        b: {},
      },
    })
    const { result } = withSetup(() => useMachine(machine))
    expect(result.can('GO')).toBe(false)
    expect(result.нельзя('GO')).toBe(true)
    expect(result.можно('GO')).toBe(false)
  })

  it('isDone becomes true on final state', async () => {
    const machine = defineMachine({
      id: 'fin',
      initial: 'active' as const,
      states: {
        active: { on: { DONE: { target: 'finished' as const } } },
        finished: { type: 'final' as const },
      },
    })
    const { result } = withSetup(() => useMachine(machine))
    expect(result.isDone.value).toBe(false)
    await result.send('DONE')
    expect(result.isDone.value).toBe(true)
  })

  it('history records transitions with limit', async () => {
    const { result } = withSetup(() => useMachine(trafficLight, { historyLimit: 2 }))
    await result.send('NEXT')
    await result.send('NEXT')
    await result.send('NEXT')
    expect(result.history.value.length).toBe(2)
    // historyLimit=2: kept are transitions 2 (green→yellow) and 3 (yellow→red)
    expect(result.history.value[0]!.from).toBe('green')
    expect(result.history.value[1]!.from).toBe('yellow')
  })

  it('snapshot returns serialisable state', async () => {
    const { result } = withSetup(() => useMachine(trafficLight))
    await result.send('NEXT')
    const snap = result.snapshot.value
    expect(snap.state).toBe('green')
    expect(snap.context).toEqual({})
  })

  it('restore sets state and context', async () => {
    const machine = defineMachine({
      id: 'r',
      initial: 'a' as const,
      context: { x: 0 },
      states: { a: {}, b: {} },
    })
    const { result } = withSetup(() => useMachine(machine))
    result.restore({ state: 'b', context: { x: 99 }, history: [] })
    expect(result.state.value).toBe('b')
    expect(result.context.value.x).toBe(99)
  })

  it('context updates reactively after transition', async () => {
    const machine = defineMachine({
      id: 'ctx',
      initial: 'a' as const,
      context: { n: 0 },
      states: {
        a: {
          on: {
            INC: {
              target: 'a' as const,
              actions: [(ctx) => ({ n: ctx.n + 1 })],
            },
          },
        },
      },
    })
    const { result } = withSetup(() => useMachine(machine))
    await result.send('INC')
    await result.send('INC')
    expect(result.context.value.n).toBe(2)
  })

  describe('persist', () => {
    let storage: Storage

    beforeEach(() => {
      const map = new Map<string, string>()
      storage = {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => { map.set(k, v) },
        removeItem: (k) => { map.delete(k) },
        clear: () => { map.clear() },
        key: () => null,
        length: 0,
      }
    })

    it('saves snapshot on transition', async () => {
      const machine = defineMachine({
        id: 'persist-test',
        initial: 'a' as const,
        states: {
          a: { on: { GO: { target: 'b' as const } } },
          b: {},
        },
      })
      const { result } = withSetup(() =>
        useMachine(machine, { persist: { key: 'test', storage } }),
      )
      await result.send('GO')
      const raw = storage.getItem('test')
      expect(raw).not.toBeNull()
      const snap = JSON.parse(raw!)
      expect(snap.state).toBe('b')
    })
  })
})
