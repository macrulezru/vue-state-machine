export { defineMachine } from './core/defineMachine'
export { useMachine } from './composables/useMachine'
export { useSharedMachine } from './composables/useSharedMachine'
export { useWizard } from './composables/useWizard'
export { useMachineStore } from './store/MachineStore'
export { VueMachinePlugin } from './plugin'

export type {
  Ctx,
  EventObject,
  Guard,
  Action,
  TransitionConfig,
  SubMachineConfig,
  StateConfig,
  MachineConfig,
  TransitionRecord,
  MachineSnapshot,
  TransitionResult,
  UseMachineOptions,
  MachineInstance,
} from './core/types'

export type { WizardStep, WizardOptions, WizardInstance } from './composables/useWizard'
export type { MachineStoreAPI } from './store/MachineStore'
