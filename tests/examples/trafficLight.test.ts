import { describe, it, expect } from 'vitest'
import { withSetup } from '../helpers'
import { defineMachine } from '../../src/core/defineMachine'
import { useMachine } from '../../src/composables/useMachine'

const trafficLight = defineMachine({
  id: 'traffic',
  initial: 'red' as const,
  states: {
    red:    { on: { NEXT: { target: 'green' as const } } },
    green:  { on: { NEXT: { target: 'yellow' as const } } },
    yellow: { on: { NEXT: { target: 'red' as const } } },
  },
})

describe('example: traffic light', () => {
  it('cycles through all states', async () => {
    const { result } = withSetup(() => useMachine(trafficLight))
    expect(result.state.value).toBe('red')
    await result.send('NEXT')
    expect(result.state.value).toBe('green')
    await result.send('NEXT')
    expect(result.state.value).toBe('yellow')
    await result.send('NEXT')
    expect(result.state.value).toBe('red')
  })

  it('records full transition history', async () => {
    const { result } = withSetup(() => useMachine(trafficLight))
    await result.send('NEXT')
    await result.send('NEXT')
    expect(result.history.value).toHaveLength(2)
    expect(result.history.value[0]!.from).toBe('red')
    expect(result.history.value[0]!.to).toBe('green')
    expect(result.history.value[1]!.from).toBe('green')
    expect(result.history.value[1]!.to).toBe('yellow')
  })
})
