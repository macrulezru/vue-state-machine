import type { Ctx, MachineConfig, MachineInstance, UseMachineOptions } from '../core/types'
import { useMachine } from './useMachine'
import { useMachineStore } from '../store/MachineStore'

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
    return existing as unknown as MachineInstance<TState, TEvent, TContext>
  }
  return useMachine(config, options)
}
