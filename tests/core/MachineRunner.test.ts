import { describe, it, expect, vi } from 'vitest'
import { MachineRunner } from '../../src/core/MachineRunner'

const trafficConfig = {
  id: 'traffic',
  initial: 'red' as const,
  states: {
    red: { on: { NEXT: { target: 'green' as const } } },
    green: { on: { NEXT: { target: 'yellow' as const } } },
    yellow: { on: { NEXT: { target: 'red' as const } } },
  },
}

describe('MachineRunner', () => {
  it('initialises at the correct state', () => {
    const runner = new MachineRunner(trafficConfig)
    expect(runner.getCurrentState()).toBe('red')
  })

  it('transitions through states', async () => {
    const runner = new MachineRunner(trafficConfig)
    await runner.enqueue('NEXT')
    expect(runner.getCurrentState()).toBe('green')
    await runner.enqueue('NEXT')
    expect(runner.getCurrentState()).toBe('yellow')
    await runner.enqueue('NEXT')
    expect(runner.getCurrentState()).toBe('red')
  })

  it('ignores unknown events', async () => {
    const runner = new MachineRunner(trafficConfig)
    await runner.enqueue('UNKNOWN' as 'NEXT')
    expect(runner.getCurrentState()).toBe('red')
  })

  it('respects guard — blocks transition when guard returns false', async () => {
    const config = {
      id: 'guarded',
      initial: 'a' as const,
      context: { ok: false },
      states: {
        a: { on: { GO: { target: 'b' as const, guard: (ctx: { ok: boolean }) => ctx.ok } } },
        b: {},
      },
    }
    const runner = new MachineRunner(config)
    const result = await runner.enqueue('GO')
    expect(result.changed).toBe(false)
    expect(runner.getCurrentState()).toBe('a')
  })

  it('respects guard — allows transition when guard returns true', async () => {
    const config = {
      id: 'guarded',
      initial: 'a' as const,
      context: { ok: true },
      states: {
        a: { on: { GO: { target: 'b' as const, guard: (ctx: { ok: boolean }) => ctx.ok } } },
        b: {},
      },
    }
    const runner = new MachineRunner(config)
    const result = await runner.enqueue('GO')
    expect(result.changed).toBe(true)
    expect(runner.getCurrentState()).toBe('b')
  })

  it('treats guard exception as false', async () => {
    const config = {
      id: 'throwing',
      initial: 'a' as const,
      states: {
        a: {
          on: {
            GO: {
              target: 'b' as const,
              guard: () => { throw new Error('oops') },
            },
          },
        },
        b: {},
      },
    }
    const runner = new MachineRunner(config)
    const result = await runner.enqueue('GO')
    expect(result.changed).toBe(false)
  })

  it('merges context from action return value', async () => {
    const config = {
      id: 'ctx',
      initial: 'a' as const,
      context: { count: 0 },
      states: {
        a: {
          on: {
            INC: {
              target: 'a' as const,
              actions: [(ctx: { count: number }) => ({ count: ctx.count + 1 })],
            },
          },
        },
      },
    }
    const runner = new MachineRunner(config)
    await runner.enqueue('INC')
    await runner.enqueue('INC')
    expect(runner.getContext().count).toBe(2)
  })

  it('calls entry and exit actions in correct order', async () => {
    const log: string[] = []
    const config = {
      id: 'hooks',
      initial: 'a' as const,
      states: {
        a: {
          exit: [() => { log.push('exit-a') }],
          on: { GO: { target: 'b' as const, actions: [() => { log.push('transition') }] } },
        },
        b: {
          entry: [() => { log.push('entry-b') }],
        },
      },
    }
    const runner = new MachineRunner(config)
    await runner.enqueue('GO')
    expect(log).toEqual(['exit-a', 'transition', 'entry-b'])
  })

  it('does not transition from final state', async () => {
    const config = {
      id: 'final',
      initial: 'done' as const,
      states: {
        done: { type: 'final' as const, on: { NEXT: { target: 'done' as const } } },
      },
    }
    const runner = new MachineRunner(config)
    const result = await runner.enqueue('NEXT')
    expect(result.changed).toBe(false)
  })

  it('processes events sequentially via queue', async () => {
    const order: number[] = []
    const config = {
      id: 'seq',
      initial: 'a' as const,
      context: { n: 0 },
      states: {
        a: {
          on: {
            INC: {
              target: 'a' as const,
              actions: [async (ctx: { n: number }) => {
                await new Promise((r) => setTimeout(r, 10))
                order.push(ctx.n)
                return { n: ctx.n + 1 }
              }],
            },
          },
        },
      },
    }
    const runner = new MachineRunner(config)
    const p1 = runner.enqueue('INC')
    const p2 = runner.enqueue('INC')
    const p3 = runner.enqueue('INC')
    await Promise.all([p1, p2, p3])
    expect(order).toEqual([0, 1, 2])
  })

  it('restore sets state and context without running actions', () => {
    const config = {
      id: 'restore',
      initial: 'a' as const,
      context: { x: 0 },
      states: {
        a: {},
        b: { entry: [vi.fn()] },
      },
    }
    const runner = new MachineRunner(config)
    runner.restore('b', { x: 42 })
    expect(runner.getCurrentState()).toBe('b')
    expect(runner.getContext().x).toBe(42)
    expect(config.states.b.entry![0]).not.toHaveBeenCalled()
  })

  it('canTransition returns false for unknown event', () => {
    const runner = new MachineRunner(trafficConfig)
    expect(runner.canTransition('UNKNOWN' as 'NEXT')).toBe(false)
  })

  it('canTransition returns true for valid event', () => {
    const runner = new MachineRunner(trafficConfig)
    expect(runner.canTransition('NEXT')).toBe(true)
  })

  it('parallel regions start with their initial states', () => {
    const config = {
      id: 'parallel',
      initial: 'editing' as const,
      states: {
        editing: {
          parallel: {
            saving: { initial: 'idle', states: { idle: {}, saving: {} } },
            validation: { initial: 'valid', states: { valid: {}, invalid: {} } },
          },
        },
      },
    }
    const runner = new MachineRunner(config)
    const regions = runner.getRegionStates()
    expect(regions['saving']).toBe('idle')
    expect(regions['validation']).toBe('valid')
  })
})
