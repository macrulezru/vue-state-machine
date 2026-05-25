import type { App } from 'vue'
import { MACHINE_STORE_KEY } from '../store/MachineStore'

export const VueMachineDevtools = {
  install(app: App): void {
    if (typeof window === 'undefined') return

    const store = app._context.provides[MACHINE_STORE_KEY as unknown as symbol]
    if (!store) {
      console.warn('[vue-state-machine] VueMachineDevtools requires VueMachinePlugin to be installed first')
      return
    }

    // @ts-expect-error — DevTools hook, injected by Vue DevTools browser extension
    const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__
    if (!hook) return

    hook.on('app:init', (devtoolsApp: unknown) => {
      if (devtoolsApp !== app) return

      hook.emit('plugin:settings:set', {
        id: 'vue-state-machine',
        label: 'State Machines',
      })
    })

    hook.on('visitComponentTree', () => {
      const machines = store.getAll()
      for (const [id, instance] of machines) {
        hook.emit('timeline:event', {
          layerId: 'vue-state-machine',
          event: {
            time: Date.now(),
            data: {
              machineId: id,
              state: instance.state.value,
              context: instance.context.value,
            },
            title: `[${id}] ${String(instance.state.value)}`,
          },
        })
      }
    })
  },
}
