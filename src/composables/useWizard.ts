import { computed, ref, type Component, type ComputedRef, type Ref } from 'vue'
import type { Ctx, MachineConfig, StateConfig } from '../core/types'
import { defineMachine } from '../core/defineMachine'
import { useMachine } from './useMachine'

export interface WizardStep<TContext extends Ctx = Ctx> {
  id: string
  label?: string
  component?: Component
  canProceed?: (context: TContext) => boolean | Promise<boolean>
  onEnter?: (context: TContext) => void
  onLeave?: (context: TContext) => void
}

export interface WizardOptions {
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
  next(): Promise<boolean>
  prev(): void
  goTo(id: string): Promise<boolean>
  reset(): void
}

type WizardEvent = string
type WizardCtx = Ctx

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
      ? [(ctx: WizardCtx) => { step.onEnter!(ctx) }]
      : undefined
    const exitActions = step.onLeave
      ? [(ctx: WizardCtx) => { step.onLeave!(ctx) }]
      : undefined

    states[step.id] = {
      on,
      ...(entryActions ? { entry: entryActions } : {}),
      ...(exitActions ? { exit: exitActions } : {}),
    }
  }

  return defineMachine({
    id: '__wizard__',
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
  const { state, send } = useMachine(machine)

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
        const ok = await step.canProceed(machine.context as TContext ?? {} as TContext)
        if (!ok) return false
      } catch (err) {
        if (import.meta.env?.DEV !== false) {
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
          const ok = await step.canProceed(machine.context as TContext ?? {} as TContext)
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
    next,
    prev,
    goTo,
    reset,
  }
}
