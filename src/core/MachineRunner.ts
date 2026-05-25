import type {
  Ctx,
  EventObject,
  MachineConfig,
  SubMachineConfig,
  TransitionResult,
} from './types'

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
    this.context = config.context ? { ...config.context } : ({} as TContext)
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
      return { nextState: this.state, nextContext: this.context, executed: [], changed: false }
    }

    const stateConfig = this.config.states[this.state]
    const transitionConfig = stateConfig?.on?.[event.type]

    if (!transitionConfig) {
      await this.dispatchToRegions(event)
      return { nextState: this.state, nextContext: this.context, executed: [], changed: false }
    }

    if (transitionConfig.guard) {
      let allowed = false
      try {
        allowed = transitionConfig.guard(this.context, event)
      } catch {
        allowed = false
      }
      if (!allowed) {
        return { nextState: this.state, nextContext: this.context, executed: [], changed: false }
      }
    }

    const executed: string[] = []
    this.deactivateParallelRegions()

    for (const action of stateConfig.exit ?? []) {
      const partial = await action(this.context, event)
      if (partial) this.mergeContext(partial)
      executed.push(action.name || 'exit')
    }

    for (const action of transitionConfig.actions ?? []) {
      const partial = await action(this.context, event)
      if (partial) this.mergeContext(partial)
      executed.push(action.name || 'action')
    }

    this.state = transitionConfig.target
    this.activateParallelRegions(this.state)

    for (const action of this.config.states[this.state]?.entry ?? []) {
      const partial = await action(this.context, event)
      if (partial) this.mergeContext(partial)
      executed.push(action.name || 'entry')
    }

    return { nextState: this.state, nextContext: this.context, executed, changed: true }
  }

  restore(state: TState, context: TContext): void {
    this.deactivateParallelRegions()
    this.state = state
    this.context = { ...context }
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

  private async dispatchToRegions(event: EventObject<TEvent>): Promise<void> {
    if (this.regionRunners.size === 0) return

    const contextPatches: Array<{ regionName: string; patch: Partial<TContext> }> = []

    for (const [regionName, runner] of this.regionRunners) {
      const result = await runner.transition(event as EventObject<string>)
      if (result.changed) {
        const patch = result.nextContext as unknown as Partial<TContext>
        const conflictKeys = Object.keys(patch).filter(
          (k) => contextPatches.some((p) => k in p.patch),
        )
        if (conflictKeys.length > 0 && import.meta.env?.DEV !== false) {
          console.warn(
            `[vue-state-machine] Parallel regions context conflict on field(s): ${conflictKeys.join(', ')}. Region "${regionName}" wins (declared last).`,
          )
        }
        contextPatches.push({ regionName, patch })
        runner['context'] = result.nextContext as TContext
      }
    }

    for (const { patch } of contextPatches) {
      this.mergeContext(patch)
    }
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
    initial: regionConfig.initial,
    context: { ...parentContext },
    states: regionConfig.states as unknown as Record<string, import('./types').StateConfig<string, string, TContext>>,
  }
}
