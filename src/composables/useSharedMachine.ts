import { onUnmounted } from 'vue'
import type { Ctx, MachineConfig, MachineInstance, UseMachineOptions } from '../core/types'
import { useMachine } from './useMachine'
import { useMachineStore } from '../store/MachineStore'
import { isDevMode } from '../core/isDevMode'

// Only compares the fields a later caller could plausibly expect to take
// effect — `persist.storage` is compared by reference (Storage objects
// aren't meaningfully comparable any other way).
function optionsDiffer(
  a: UseMachineOptions | undefined,
  b: UseMachineOptions | undefined,
): boolean {
  if (a?.historyLimit !== b?.historyLimit) return true
  if (a?.persist?.key !== b?.persist?.key) return true
  if (a?.persist?.storage !== b?.persist?.storage) return true
  return false
}

export function useSharedMachine<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx,
>(
  config: MachineConfig<TState, TEvent, TContext>,
  options?: UseMachineOptions,
): MachineInstance<TState, TEvent, TContext> {
  const store = useMachineStore()
  const existing = store.get(config.id)
  if (existing) {
    if (isDevMode() && optionsDiffer(store.getOptions(config.id), options)) {
      console.warn(
        `[vue-state-machine] useSharedMachine("${config.id}", options) was called with options that differ from the ones the shared instance was actually created with — only the very first caller's options (including persist) take effect; every later caller's options, including this one, are silently ignored.`,
      )
    }
    store.retain(config.id)
    onUnmounted(() => {
      store.unregister(config.id)
    })
    return existing as unknown as MachineInstance<TState, TEvent, TContext>
  }
  return useMachine(config, options)
}
