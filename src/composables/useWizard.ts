import { computed, ref, type Component, type ComputedRef, type Ref } from 'vue'
import type { Ctx, MachineConfig, StateConfig } from '../core/types'
import { defineMachine } from '../core/defineMachine'
import { isDevMode } from '../core/isDevMode'
import { useMachine } from './useMachine'

export interface WizardStep<TContext extends Ctx = Ctx> {
  id: string
  label?: string
  component?: Component
  canProceed?: (context: TContext) => boolean | Promise<boolean>
  /** Return a partial context to merge it in (same shape as a machine `Action`) — e.g. seed a default when entering. Optional; a `void` return changes nothing. */
  onEnter?: (context: TContext) => void | Partial<TContext>
  /** Return a partial context to merge it in — the usual place to persist a step's collected data (e.g. form fields) before `canProceed` on the next step reads it. */
  onLeave?: (context: TContext) => void | Partial<TContext>
}

export interface WizardOptions {
  /** Machine id registered in the MachineStore (when VueMachinePlugin is installed) and shown in DevTools. Default: a unique auto-generated id — set this explicitly if you need a stable, predictable id (e.g. to look the wizard up via `useMachineStore().get(id)`). */
  id?: string
  initialStep?: number
  allowSkip?: boolean
  circular?: boolean
}

export interface WizardInstance<TContext extends Ctx = Ctx> {
  currentStep: Ref<WizardStep<TContext>>
  currentIndex: ComputedRef<number>
  totalSteps: number
  progress: ComputedRef<number>
  isFirst: ComputedRef<boolean>
  isLast: ComputedRef<boolean>
  history: Ref<string[]>
  /** Accumulated context — whatever `onEnter`/`onLeave` handlers have merged in so far. Read-only; write to it by returning a `Partial<TContext>` from `onEnter`/`onLeave`, same as a machine `Action`. */
  context: Readonly<Ref<TContext>>
  next(): Promise<boolean>
  prev(): void
  goTo(id: string): Promise<boolean>
  reset(): void
}

type WizardEvent = string
type WizardCtx = Ctx

// Every useWizard() needs a distinct machine id — sharing one literal id
// (as this used to) means two wizards mounted at once silently overwrite
// each other's MachineStore/DevTools registration. `options.id` lets a
// caller pick a stable one; otherwise this counter guarantees uniqueness.
let wizardCounter = 0

function buildWizardMachine(
  steps: WizardStep[],
  options: WizardOptions,
): MachineConfig<string, WizardEvent, WizardCtx> {
  const { circular = false } = options
  const ids = steps.map((s) => s.id)
  const states: Record<string, StateConfig<string, WizardEvent, WizardCtx>> = {}

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const on: Record<string, { target: string }> = {}

    // canProceed is async-capable — checked externally in next()/goTo(), not as a machine guard
    if (i < steps.length - 1) {
      on['NEXT'] = { target: steps[i + 1]!.id }
    } else if (circular) {
      on['NEXT'] = { target: ids[0]! }
    }

    if (i > 0) {
      on['PREV'] = { target: steps[i - 1]!.id }
    }

    for (let j = 0; j < steps.length; j++) {
      if (j === i) continue
      on[`GOTO_${steps[j]!.id}`] = { target: steps[j]!.id }
    }

    const entryActions = step.onEnter
      ? [(ctx: WizardCtx) => step.onEnter!(ctx)]
      : undefined
    const exitActions = step.onLeave
      ? [(ctx: WizardCtx) => step.onLeave!(ctx)]
      : undefined

    states[step.id] = {
      on,
      ...(entryActions ? { entry: entryActions } : {}),
      ...(exitActions ? { exit: exitActions } : {}),
    }
  }

  return defineMachine({
    id: options.id ?? `__wizard_${++wizardCounter}__`,
    initial: ids[options.initialStep ?? 0] ?? ids[0]!,
    states,
  })
}

export function useWizard<TContext extends Ctx = Ctx>(
  steps: WizardStep<TContext>[],
  options: WizardOptions = {},
): WizardInstance<TContext> {
  if (steps.length === 0) {
    throw new Error('[vue-state-machine] useWizard: steps array cannot be empty')
  }

  const machine = buildWizardMachine(steps as WizardStep[], options)
  const { state, send, context } = useMachine(machine)

  const stepMap = new Map(steps.map((s) => [s.id, s]))
  const historyRef = ref<string[]>([steps[options.initialStep ?? 0]!.id])

  const currentStep = computed(() => stepMap.get(state.value)! as WizardStep<TContext>)
  const currentIndex = computed(() => steps.findIndex((s) => s.id === state.value))
  const progress = computed(() => currentIndex.value / Math.max(steps.length - 1, 1))
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value === steps.length - 1)

  async function next(): Promise<boolean> {
    const step = stepMap.get(state.value)!
    if (step.canProceed) {
      try {
        const ok = await step.canProceed(context.value as TContext)
        if (!ok) return false
      } catch (err) {
        if (isDevMode()) {
          console.error('[vue-state-machine] useWizard canProceed threw:', err)
        }
        return false
      }
    }
    const prevState = state.value
    await send('NEXT')
    const moved = state.value !== prevState
    if (moved && !historyRef.value.includes(state.value)) {
      historyRef.value = [...historyRef.value, state.value]
    }
    return moved
  }

  function prev(): void {
    void send('PREV')
  }

  async function goTo(id: string): Promise<boolean> {
    if (!stepMap.has(id)) return false
    const targetIndex = steps.findIndex((s) => s.id === id)
    const isForward = targetIndex > currentIndex.value
    if (isForward && !options.allowSkip) {
      const step = stepMap.get(state.value)!
      if (step.canProceed) {
        try {
          const ok = await step.canProceed(context.value as TContext)
          if (!ok) return false
        } catch (err) {
          if (import.meta.env?.DEV !== false) {
            console.error('[vue-state-machine] useWizard canProceed threw:', err)
          }
          return false
        }
      }
    }
    const prevState = state.value
    await send(`GOTO_${id}`)
    const moved = state.value !== prevState
    if (moved && !historyRef.value.includes(state.value)) {
      historyRef.value = [...historyRef.value, state.value]
    }
    return moved
  }

  function reset(): void {
    const initial = steps[options.initialStep ?? 0]!.id
    void send(`GOTO_${initial}`)
    historyRef.value = [initial]
  }

  return {
    currentStep: currentStep as unknown as Ref<WizardStep<TContext>>,
    currentIndex,
    totalSteps: steps.length,
    progress,
    isFirst,
    isLast,
    history: historyRef,
    context: context as Readonly<Ref<TContext>>,
    next,
    prev,
    goTo,
    reset,
  }
}
