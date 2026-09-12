import { inject, type InjectionKey } from 'vue'
import type { Ctx, MachineInstance, UseMachineOptions } from '../core/types'
import { isDevMode } from '../core/isDevMode'

export type AnyMachineInstance = MachineInstance<string, string, Ctx>

export interface MachineStoreAPI {
  register(id: string, instance: AnyMachineInstance, options?: UseMachineOptions): void
  unregister(id: string): void
  /**
   * Marks another user of an already-registered id (without replacing its
   * instance) — used by useSharedMachine() when it reuses an existing entry
   * instead of creating a new one, so the entry survives until every sharer
   * (not just the one that originally created it) has unregistered/released.
   * A no-op if `id` isn't currently registered.
   */
  retain(id: string): void
  get(id: string): AnyMachineInstance | undefined
  getAll(): Map<string, AnyMachineInstance>
  /** The options the currently-registered instance for `id` was actually created with. */
  getOptions(id: string): UseMachineOptions | undefined
}

export const MACHINE_STORE_KEY: InjectionKey<MachineStoreAPI> = Symbol('vue-state-machine-store')

export function createMachineStore(): MachineStoreAPI {
  const registry = new Map<string, AnyMachineInstance>()
  const optionsById = new Map<string, UseMachineOptions | undefined>()
  // Reference-counted so a shared machine (useSharedMachine()) isn't torn
  // down from under the components still using it just because the one
  // component that happened to create it unmounted first.
  const refCounts = new Map<string, number>()

  return {
    register(id, instance, options) {
      if (isDevMode() && registry.has(id)) {
        console.warn(
          `[vue-state-machine] A machine with id "${id}" is already registered — the prior instance is being overwritten. This is usually caused by two defineMachine()/useSharedMachine() calls (or an explicit WizardOptions.id) using the same id unintentionally.`,
        )
      }
      registry.set(id, instance)
      optionsById.set(id, options)
      refCounts.set(id, (refCounts.get(id) ?? 0) + 1)
    },
    retain(id) {
      if (!registry.has(id)) return
      refCounts.set(id, (refCounts.get(id) ?? 0) + 1)
    },
    unregister(id) {
      const remaining = (refCounts.get(id) ?? 1) - 1
      if (remaining > 0) {
        refCounts.set(id, remaining)
        return
      }
      refCounts.delete(id)
      registry.delete(id)
      optionsById.delete(id)
    },
    get(id) {
      return registry.get(id)
    },
    getAll() {
      return registry
    },
    getOptions(id) {
      return optionsById.get(id)
    },
  }
}

export function useMachineStore(): MachineStoreAPI {
  const store = inject(MACHINE_STORE_KEY)
  if (!store) {
    throw new Error(
      '[vue-state-machine] useMachineStore() requires VueMachinePlugin to be installed via app.use()',
    )
  }
  return store
}
