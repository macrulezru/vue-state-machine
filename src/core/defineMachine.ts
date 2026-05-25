import type { Ctx, MachineConfig } from './types'

export function defineMachine<
  TState extends string,
  TEvent extends string,
  TContext extends Ctx = Ctx,
>(config: MachineConfig<TState, TEvent, TContext>): MachineConfig<TState, TEvent, TContext> {
  if (import.meta.env?.DEV !== false) {
    validateConfig(config)
  }
  return config
}

function validateConfig<TState extends string, TEvent extends string, TContext extends Ctx>(
  config: MachineConfig<TState, TEvent, TContext>,
): void {
  if (!config.id) {
    throw new Error('[vue-state-machine] defineMachine: config.id cannot be empty')
  }

  const stateNames = Object.keys(config.states) as TState[]

  if (!stateNames.includes(config.initial)) {
    throw new Error(
      `[vue-state-machine] defineMachine "${config.id}": initial state "${config.initial}" not found in states`,
    )
  }

  for (const stateName of stateNames) {
    const stateConfig = config.states[stateName]
    if (!stateConfig.on) continue

    for (const [eventName, transition] of Object.entries(stateConfig.on)) {
      if (!transition) continue
      const t = transition as { target: string }
      if (!stateNames.includes(t.target as TState)) {
        throw new Error(
          `[vue-state-machine] defineMachine "${config.id}": state "${stateName}" event "${eventName}" targets unknown state "${t.target}"`,
        )
      }
    }
  }
}
