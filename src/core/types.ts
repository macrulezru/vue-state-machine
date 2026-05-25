import type { ComputedRef, Ref } from 'vue'

export type Ctx = Record<string, unknown>

export interface EventObject<TEvent extends string = string> {
  type: TEvent
  [key: string]: unknown
}

export type Guard<TContext extends Ctx, TEvent extends string> = (
  context: TContext,
  event: EventObject<TEvent>,
) => boolean

export type Action<TContext extends Ctx, TEvent extends string> = (
  context: TContext,
  event: EventObject<TEvent>,
) => void | Partial<TContext> | Promise<Partial<TContext> | void>

export interface TransitionConfig<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
> {
  target: TState
  guard?: Guard<TContext, TEvent>
  actions?: Action<TContext, TEvent>[]
}

export interface SubMachineConfig<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
> {
  initial: TState
  states: Record<TState, Omit<StateConfig<TState, TEvent, TContext>, 'parallel'>>
}

export interface StateConfig<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
> {
  on?: Partial<Record<TEvent, TransitionConfig<TState, TEvent, TContext>>>
  entry?: Action<TContext, TEvent>[]
  exit?: Action<TContext, TEvent>[]
  type?: 'final'
  parallel?: Record<string, SubMachineConfig<string, string, TContext>>
}

export interface MachineConfig<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx = Ctx,
> {
  id: string
  initial: NoInfer<TState>
  context?: TContext
  states: Record<TState, StateConfig<TState, TEvent, TContext>>
}

export interface TransitionRecord<TState extends string, TEvent extends string> {
  from: TState
  to: TState
  event: EventObject<TEvent>
  timestamp: number
}

export interface MachineSnapshot<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
> {
  state: TState
  context: TContext
  history: TransitionRecord<TState, TEvent>[]
}

export interface TransitionResult<TState extends string, TContext extends Ctx> {
  nextState: TState
  nextContext: TContext
  executed: string[]
  changed: boolean
}

export interface UseMachineOptions {
  historyLimit?: number
  persist?: {
    key: string
    storage?: Storage
  }
}

export interface MachineInstance<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
> {
  state: Readonly<Ref<TState>>
  context: Readonly<Ref<TContext>>
  send: (event: TEvent | EventObject<TEvent>) => Promise<void>
  matches: (state: TState | TState[] | Partial<Record<string, string>>) => boolean
  can: (event: TEvent) => boolean
  можно: (event: TEvent) => boolean
  нельзя: (event: TEvent) => boolean
  history: Readonly<Ref<TransitionRecord<TState, TEvent>[]>>
  isDone: ComputedRef<boolean>
  snapshot: ComputedRef<MachineSnapshot<TState, TEvent, TContext>>
  restore: (snapshot: MachineSnapshot<TState, TEvent, TContext>) => void
}
