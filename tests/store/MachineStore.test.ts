import { describe, it, expect, vi } from 'vitest'
import { createApp } from 'vue'
import { createMachineStore, useMachineStore, MACHINE_STORE_KEY, type AnyMachineInstance } from '../../src/store/MachineStore'
import { VueMachinePlugin } from '../../src/plugin'
import { withSetup } from '../helpers'
import { defineMachine } from '../../src/core/defineMachine'
import { useMachine } from '../../src/composables/useMachine'
import { useSharedMachine } from '../../src/composables/useSharedMachine'
import { useWizard } from '../../src/composables/useWizard'

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

  it('warns in dev mode when register() overwrites an already-registered id', () => {
    // Regression: register() had zero collision detection — a duplicate id
    // silently overwrote the prior entry with no indication anything was wrong.
    const store = createMachineStore()
    const { result: r1 } = withSetup(() => useMachine(simpleMachine))
    const { result: r2 } = withSetup(() => useMachine(simpleMachine))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    store.register('dup', r1 as unknown as AnyMachineInstance)
    expect(warnSpy).not.toHaveBeenCalled()

    store.register('dup', r2 as unknown as AnyMachineInstance)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"dup"'))

    warnSpy.mockRestore()
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

  it('warns in dev mode when a later caller passes options that differ from the ones actually in effect', () => {
    // Regression: a later useSharedMachine() caller's options (including
    // persist) were silently ignored, with no indication anything was wrong.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const machine = defineMachine({ id: 'shared-opts', initial: 'idle' as const, states: { idle: {} } })

    let store: ReturnType<typeof useMachineStore> | undefined
    const app = createApp({
      setup() {
        useSharedMachine(machine, { historyLimit: 10 })
        useSharedMachine(machine, { historyLimit: 99 })
        store = useMachineStore()
        return () => null
      },
      render() { return null },
    })
    app.use(VueMachinePlugin)
    app.mount(document.createElement('div'))

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"shared-opts"'))
    expect(store!.getOptions('shared-opts')).toEqual({ historyLimit: 10 })

    app.unmount()
    warnSpy.mockRestore()
  })

  it('does not warn when a later caller passes the same options', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const machine = defineMachine({ id: 'shared-same-opts', initial: 'idle' as const, states: { idle: {} } })

    const app = createApp({
      setup() {
        useSharedMachine(machine, { historyLimit: 10 })
        useSharedMachine(machine, { historyLimit: 10 })
        return () => null
      },
      render() { return null },
    })
    app.use(VueMachinePlugin)
    app.mount(document.createElement('div'))

    expect(warnSpy).not.toHaveBeenCalled()

    app.unmount()
    warnSpy.mockRestore()
  })

  it('does not warn when neither the original nor a later call passes any options', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const machine = defineMachine({ id: 'shared-no-opts', initial: 'idle' as const, states: { idle: {} } })

    const app = createApp({
      setup() {
        useSharedMachine(machine)
        useSharedMachine(machine)
        return () => null
      },
      render() { return null },
    })
    app.use(VueMachinePlugin)
    app.mount(document.createElement('div'))

    expect(warnSpy).not.toHaveBeenCalled()

    app.unmount()
    warnSpy.mockRestore()
  })
})

describe('useMachine unmount cleanup', () => {
  it('unregisters from the store when the owning component unmounts', () => {
    // Regression: useMachine() never called onUnmounted()/store.unregister()
    // at all — the registry only ever grew for an app that mounts/unmounts
    // many distinct-id machines.
    const store = createMachineStore()
    const app = createApp({
      setup() {
        useMachine(simpleMachine)
        return () => null
      },
      render() { return null },
    })
    app.provide(MACHINE_STORE_KEY, store)
    app.mount(document.createElement('div'))

    expect(store.get('simple')).toBeDefined()

    app.unmount()

    expect(store.get('simple')).toBeUndefined()
  })
})

describe('useSharedMachine reference-counted cleanup', () => {
  it('keeps a shared instance registered until every sharer has unmounted', () => {
    // Regression risk of a naive fix: if useMachine() unconditionally
    // unregistered on unmount, the FIRST sharer unmounting would remove the
    // entry out from under every other component still using the same
    // shared instance.
    const store = createMachineStore()
    const machine = defineMachine({ id: 'shared-refcount', initial: 'idle' as const, states: { idle: {} } })

    const appA = createApp({
      setup() {
        useSharedMachine(machine)
        return () => null
      },
      render() { return null },
    })
    appA.provide(MACHINE_STORE_KEY, store)
    appA.mount(document.createElement('div'))

    const appB = createApp({
      setup() {
        useSharedMachine(machine)
        return () => null
      },
      render() { return null },
    })
    appB.provide(MACHINE_STORE_KEY, store)
    appB.mount(document.createElement('div'))

    expect(store.get('shared-refcount')).toBeDefined()

    appA.unmount()
    expect(store.get('shared-refcount')).toBeDefined() // B is still using it

    appB.unmount()
    expect(store.get('shared-refcount')).toBeUndefined() // last sharer gone
  })
})

describe('useWizard + MachineStore (id collision regression)', () => {
  it('two concurrent useWizard() instances register as two distinct store entries, not one overwriting the other', () => {
    let store: ReturnType<typeof useMachineStore> | undefined
    const app = createApp({
      setup() {
        useWizard([{ id: 'a' }, { id: 'b' }])
        useWizard([{ id: 'x' }, { id: 'y' }])
        store = useMachineStore()
        return () => null
      },
      render() { return null },
    })
    app.use(VueMachinePlugin)
    app.mount(document.createElement('div'))
    expect(store!.getAll().size).toBe(2)
    app.unmount()
  })
})
