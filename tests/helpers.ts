import { createApp, defineComponent, type App } from 'vue'

export function withSetup<T>(composable: () => T): { result: T; app: App; unmount: () => void } {
  let result!: T
  const app = createApp(
    defineComponent({
      setup() {
        result = composable()
        return () => null
      },
      render() { return null },
    }),
  )
  app.mount(document.createElement('div'))
  return { result, app, unmount: () => app.unmount() }
}
