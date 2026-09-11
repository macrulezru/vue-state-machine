import type {
  Ctx,
  EventObject,
  MachineConfig,
  SubMachineConfig,
  TransitionResult,
} from './types'
import { isDevMode } from './isDevMode'

interface QueuedEvent<TEvent extends string> {
  event: EventObject<TEvent>
  resolve: (result: TransitionResult<string, Ctx>) => void
  reject: (error: unknown) => void
}

export class MachineRunner<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
> {
  private state: TState
  private context: TContext
  private readonly config: MachineConfig<TState, TEvent, TContext>
  private regionRunners: Map<string, MachineRunner<string, string, TContext>> = new Map()
  private queue: QueuedEvent<TEvent>[] = []
  private processing = false

  constructor(config: MachineConfig<TState, TEvent, TContext>) {
    this.config = config
    this.state = config.initial
    this.context = config.context ? cloneContext(config.context) : ({} as TContext)
    this.activateParallelRegions(this.state)
  }

  getCurrentState(): TState {
    return this.state
  }

  getContext(): TContext {
    return this.context
  }

  getRegionStates(): Record<string, string> {
    const regions: Record<string, string> = {}
    for (const [name, runner] of this.regionRunners) {
      regions[name] = runner.getCurrentState()
    }
    return regions
  }

  canTransition(event: TEvent | EventObject<TEvent>): boolean {
    const normalized = normalizeEvent<TEvent>(event)
    const stateConfig = this.config.states[this.state]
    const transitionConfig = stateConfig.on?.[normalized.type]
    if (!transitionConfig) return false
    if (!transitionConfig.guard) return true
    try {
      return transitionConfig.guard(this.context, normalized)
    } catch {
      return false
    }
  }

  enqueue(event: TEvent | EventObject<TEvent>): Promise<TransitionResult<TState, TContext>> {
    return new Promise<TransitionResult<TState, TContext>>((resolve, reject) => {
      this.queue.push({
        event: normalizeEvent<TEvent>(event),
        resolve: resolve as (r: TransitionResult<string, Ctx>) => void,
        reject,
      })
      if (!this.processing) {
        void this.processNext()
      }
    })
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false
      return
    }
    this.processing = true
    const item = this.queue.shift()!
    try {
      const result = await this.transition(item.event)
      item.resolve(result as TransitionResult<string, Ctx>)
    } catch (error) {
      item.reject(error)
    }
    void this.processNext()
  }

  async transition(event: EventObject<TEvent>): Promise<TransitionResult<TState, TContext>> {
    if (this.config.states[this.state]?.type === 'final') {
      return { nextState: this.state, nextContext: this.context, executed: [], changed: false, contextPatch: {} }
    }

    const stateConfig = this.config.states[this.state]
    const transitionConfig = stateConfig?.on?.[event.type]

    if (!transitionConfig) {
      const regionsResult = await this.dispatchToRegions(event)
      return {
        nextState: this.state,
        nextContext: this.context,
        executed: [],
        changed: regionsResult.changed,
        contextPatch: regionsResult.contextPatch,
      }
    }

    if (transitionConfig.guard) {
      let allowed = false
      try {
        allowed = transitionConfig.guard(this.context, event)
      } catch {
        allowed = false
      }
      if (!allowed) {
        return { nextState: this.state, nextContext: this.context, executed: [], changed: false, contextPatch: {} }
      }
    }

    const executed: string[] = []
    let contextPatch: Partial<TContext> = {}
    this.deactivateParallelRegions()

    for (const action of stateConfig.exit ?? []) {
      const partial = await action(this.context, event)
      if (partial) {
        this.mergeContext(partial)
        contextPatch = { ...contextPatch, ...partial }
      }
      executed.push(action.name || 'exit')
    }

    for (const action of transitionConfig.actions ?? []) {
      const partial = await action(this.context, event)
      if (partial) {
        this.mergeContext(partial)
        contextPatch = { ...contextPatch, ...partial }
      }
      executed.push(action.name || 'action')
    }

    this.state = transitionConfig.target
    this.activateParallelRegions(this.state)

    for (const action of this.config.states[this.state]?.entry ?? []) {
      const partial = await action(this.context, event)
      if (partial) {
        this.mergeContext(partial)
        contextPatch = { ...contextPatch, ...partial }
      }
      executed.push(action.name || 'entry')
    }

    return { nextState: this.state, nextContext: this.context, executed, changed: true, contextPatch }
  }

  restore(state: TState, context: TContext): void {
    this.deactivateParallelRegions()
    this.state = state
    this.context = cloneContext(context)
    this.activateParallelRegions(state)
  }

  private mergeContext(partial: Partial<TContext>): void {
    this.context = { ...this.context, ...partial }
  }

  private activateParallelRegions(state: TState): void {
    const stateConfig = this.config.states[state]
    if (!stateConfig?.parallel) return

    for (const [regionName, regionConfig] of Object.entries(stateConfig.parallel)) {
      const runner = new MachineRunner(buildSubConfig(regionName, regionConfig, this.context))
      this.regionRunners.set(regionName, runner)
    }
  }

  private deactivateParallelRegions(): void {
    this.regionRunners.clear()
  }

  private async dispatchToRegions(
    event: EventObject<TEvent>,
  ): Promise<{ changed: boolean; contextPatch: Partial<TContext> }> {
    if (this.regionRunners.size === 0) return { changed: false, contextPatch: {} }

    const contextPatches: Array<{ regionName: string; patch: Partial<TContext> }> = []
    let anyRegionChanged = false

    for (const [regionName, runner] of this.regionRunners) {
      const result = await runner.transition(event as EventObject<string>)
      if (result.changed) {
        anyRegionChanged = true
        // Only the fields this region's actions actually touched — not its
        // whole (possibly stale-for-other-fields) context snapshot — so an
        // untouched field can never be clobbered by another region below.
        const patch = result.contextPatch as unknown as Partial<TContext>
        if (Object.keys(patch).length > 0) {
          const conflictKeys = Object.keys(patch).filter(
            (k) => contextPatches.some((p) => k in p.patch),
          )
          if (conflictKeys.length > 0 && isDevMode()) {
            console.warn(
              `[vue-state-machine] Parallel regions context conflict on field(s): ${conflictKeys.join(', ')}. Region "${regionName}" wins (declared last).`,
            )
          }
          contextPatches.push({ regionName, patch })
        }
        runner['context'] = result.nextContext as TContext
      }
    }

    // Accumulated across regions the same way transition()'s own loops do —
    // later regions' patches win on a shared key when merged below, matching
    // the "last region wins" contract this class already documents.
    let mergedPatch: Partial<TContext> = {}
    for (const { patch } of contextPatches) {
      this.mergeContext(patch)
      mergedPatch = { ...mergedPatch, ...patch }
    }

    return { changed: anyRegionChanged, contextPatch: mergedPatch }
  }
}

/**
 * Structured-clone-based deep copy, with a shallow-copy fallback for values
 * structuredClone can't handle (e.g. a context field holding a function or
 * class instance — not a supported pattern, but shouldn't hard-crash).
 * `Ctx` is expected to be JSON-serializable anyway (the `persist` option
 * round-trips it through `JSON.stringify`/`JSON.parse`), so the fallback
 * path should be rare in practice.
 */
function cloneContext<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return Array.isArray(value) ? ([...value] as T) : ({ ...value } as T)
  }
}

function normalizeEvent<TEvent extends string>(
  event: TEvent | EventObject<TEvent>,
): EventObject<TEvent> {
  return typeof event === 'string' ? { type: event } : event
}

function buildSubConfig<TContext extends Ctx>(
  regionName: string,
  regionConfig: SubMachineConfig<string, string, TContext>,
  parentContext: TContext,
): MachineConfig<string, string, TContext> {
  return {
    id: regionName,
    // The MachineRunner constructor below deep-clones `context` itself —
    // a shallow copy here is enough, no need to clone twice.
    initial: regionConfig.initial,
    context: { ...parentContext },
    states: regionConfig.states as unknown as Record<string, import('./types').StateConfig<string, string, TContext>>,
  }
}
