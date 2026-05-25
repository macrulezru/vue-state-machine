import { inject, type InjectionKey } from 'vue'
import type { Ctx, MachineInstance } from '../core/types'

export type AnyMachineInstance = MachineInstance<string, string, Ctx>

export interface MachineStoreAPI {
  register(id: string, instance: AnyMachineInstance): void
  unregister(id: string): void
  get(id: string): AnyMachineInstance | undefined
  getAll(): Map<string, AnyMachineInstance>
}

export const MACHINE_STORE_KEY: InjectionKey<MachineStoreAPI> = Symbol('vue-state-machine-store')

export function createMachineStore(): MachineStoreAPI {
  const registry = new Map<string, AnyMachineInstance>()

  return {
    register(id, instance) {
      registry.set(id, instance)
    },
    unregister(id) {
      registry.delete(id)
    },
    get(id) {
      return registry.get(id)
    },
    getAll() {
      return registry
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
