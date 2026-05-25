import type { App } from 'vue'
import { createMachineStore, MACHINE_STORE_KEY } from './store/MachineStore'

export const VueMachinePlugin = {
  install(app: App): void {
    const store = createMachineStore()
    app.provide(MACHINE_STORE_KEY, store)
  },
}
