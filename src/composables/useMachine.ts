import { computed, inject, onMounted, shallowRef, type Ref } from 'vue'
import type { Ctx, EventObject, MachineConfig, MachineInstance, MachineSnapshot, TransitionRecord, UseMachineOptions } from '../core/types'
import { MachineRunner } from '../core/MachineRunner'
import { MACHINE_STORE_KEY } from '../store/MachineStore'

export function useMachine<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
>(
  config: MachineConfig<TState, TEvent, TContext>,
  options: UseMachineOptions = {},
): MachineInstance<TState, TEvent, TContext> {
  const { historyLimit = 50, persist } = options

  const runner = new MachineRunner(config)

  const stateRef = shallowRef<TState>(runner.getCurrentState()) as unknown as Ref<TState>
  const contextRef = shallowRef<TContext>(runner.getContext()) as unknown as Ref<TContext>
  const historyRef = shallowRef<TransitionRecord<TState, TEvent>[]>([]) as unknown as Ref<TransitionRecord<TState, TEvent>[]>

  const states = config.states as Record<string, { type?: 'final' }>
  const isDone = computed(() => states[stateRef.value]?.type === 'final')

  const snapshot = computed<MachineSnapshot<TState, TEvent, TContext>>(() => ({
    state: stateRef.value,
    context: contextRef.value,
    history: historyRef.value,
  }))

  function syncFromRunner(): void {
    stateRef.value = runner.getCurrentState()
    contextRef.value = runner.getContext()
  }

  function pushHistory(from: TState, to: TState, event: EventObject<TEvent>): void {
    const record: TransitionRecord<TState, TEvent> = { from, to, event, timestamp: Date.now() }
    const next = [...historyRef.value, record]
    historyRef.value = next.length > historyLimit ? next.slice(next.length - historyLimit) : next
  }

  async function send(event: TEvent | EventObject<TEvent>): Promise<void> {
    const normalized = typeof event === 'string' ? ({ type: event } as EventObject<TEvent>) : event
    const prevState = runner.getCurrentState()
    const result = await runner.enqueue(normalized)
    if (result.changed) {
      pushHistory(prevState, result.nextState as TState, normalized)
      syncFromRunner()
      if (persist) persistSnapshot()
    }
  }

  function matches(query: TState | TState[] | Partial<Record<string, string>>): boolean {
    if (typeof query === 'string') return stateRef.value === query
    if (Array.isArray(query)) return query.some((s) => matches(s))
    const regionStates = runner.getRegionStates()
    return Object.entries(query).every(([region, state]) => regionStates[region] === state)
  }

  function can(event: TEvent): boolean {
    return runner.canTransition(event)
  }

  function restore(snap: MachineSnapshot<TState, TEvent, TContext>): void {
    runner.restore(snap.state, snap.context)
    stateRef.value = snap.state
    contextRef.value = snap.context
    historyRef.value = snap.history
  }

  function persistSnapshot(): void {
    if (!persist || typeof window === 'undefined') return
    const storage = persist.storage ?? localStorage
    try {
      storage.setItem(persist.key, JSON.stringify(snapshot.value))
    } catch {
      // storage full or unavailable — ignore silently
    }
  }

  function loadPersistedSnapshot(): void {
    if (!persist || typeof window === 'undefined') return
    const storage = persist.storage ?? localStorage
    try {
      const raw = storage.getItem(persist.key)
      if (raw) {
        const snap = JSON.parse(raw) as MachineSnapshot<TState, TEvent, TContext>
        if (snap.state && snap.state in config.states) {
          restore(snap)
        }
      }
    } catch {
      // corrupted data — ignore
    }
  }

  onMounted(() => {
    loadPersistedSnapshot()
  })

  const store = inject(MACHINE_STORE_KEY, null)
  const instance: MachineInstance<TState, TEvent, TContext> = {
    state: stateRef as Readonly<Ref<TState>>,
    context: contextRef as Readonly<Ref<TContext>>,
    send,
    matches,
    can,
    можно: can,
    нельзя: (event: TEvent) => !can(event),
    history: historyRef as Readonly<Ref<TransitionRecord<TState, TEvent>[]>>,
    isDone,
    snapshot,
    restore,
  }

  if (store) {
    store.register(config.id, instance as unknown as MachineInstance<string, string, Ctx>)
  }

  return instance
}
