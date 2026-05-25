import { describe, it, expect } from 'vitest'
import { createApp } from 'vue'
import { createMachineStore, useMachineStore, MACHINE_STORE_KEY, type AnyMachineInstance } from '../../src/store/MachineStore'
import { VueMachinePlugin } from '../../src/plugin'
import { withSetup } from '../helpers'
import { defineMachine } from '../../src/core/defineMachine'
import { useMachine } from '../../src/composables/useMachine'
import { useSharedMachine } from '../../src/composables/useSharedMachine'

const simpleMachine = defineMachine({
  id: 'simple',
  initial: 'idle' as const,
  states: { idle: {}, active: {} },
})

describe('createMachineStore', () => {
  it('registers and retrieves instances', () => {
    const store = createMachineStore()
    const { result } = withSetup(() => useMachine(simpleMachine))
    store.register('m1', result as unknown as AnyMachineInstance)
    expect(store.get('m1')).toBe(result)
  })

  it('unregisters instances', () => {
    const store = createMachineStore()
    const { result } = withSetup(() => useMachine(simpleMachine))
    store.register('m1', result as unknown as AnyMachineInstance)
    store.unregister('m1')
    expect(store.get('m1')).toBeUndefined()
  })

  it('getAll returns all registered machines', () => {
    const store = createMachineStore()
    const { result: r1 } = withSetup(() => useMachine(simpleMachine))
    const { result: r2 } = withSetup(() =>
      useMachine(defineMachine({ id: 'other', initial: 'a' as const, states: { a: {} } })),
    )
    store.register('a', r1 as ReturnType<typeof r1>)
    store.register('b', r2 as ReturnType<typeof r2>)
    expect(store.getAll().size).toBe(2)
  })
})

describe('VueMachinePlugin + useMachineStore', () => {
  it('throws when plugin not installed', () => {
    expect(() => withSetup(() => useMachineStore())).toThrow('VueMachinePlugin')
  })

  it('provides store after plugin install', () => {
    let store: ReturnType<typeof useMachineStore> | undefined
    const app = createApp({
      setup() {
        store = useMachineStore()
        return () => null
      },
      render() { return null },
    })
    app.use(VueMachinePlugin)
    app.mount(document.createElement('div'))
    expect(store).toBeDefined()
    expect(typeof store!.register).toBe('function')
    app.unmount()
  })
})

describe('useSharedMachine', () => {
  it('returns same instance for same id', () => {
    const app = createApp({
      setup() {
        const m1 = useSharedMachine(simpleMachine)
        const m2 = useSharedMachine(simpleMachine)
        expect(m1).toBe(m2)
        return () => null
      },
      render() { return null },
    })
    app.use(VueMachinePlugin)
    app.mount(document.createElement('div'))
    app.unmount()
  })

  it('creates new instance if not registered', () => {
    const app = createApp({
      setup() {
        const m = useSharedMachine(simpleMachine)
        expect(m.state.value).toBe('idle')
        return () => null
      },
      render() { return null },
    })
    app.use(VueMachinePlugin)
    app.mount(document.createElement('div'))
    app.unmount()
  })
})
