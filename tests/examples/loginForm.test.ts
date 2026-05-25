import { describe, it, expect } from 'vitest'
import { withSetup } from '../helpers'
import { defineMachine } from '../../src/core/defineMachine'
import { useMachine } from '../../src/composables/useMachine'
import type { Action, Guard } from '../../src/core/types'

type LoginCtx = { attempts: number; error: string | null }
type LoginEvent = 'SUBMIT' | 'SUCCESS' | 'FAILURE' | 'RETRY'

const resetError: Action<LoginCtx, LoginEvent> = () => ({ error: null })
const incrementAttempts: Action<LoginCtx, LoginEvent> = (ctx) => ({ attempts: ctx.attempts + 1 })
const canRetry: Guard<LoginCtx, LoginEvent> = (ctx) => ctx.attempts < 3

const loginForm = defineMachine<'idle' | 'loading' | 'error' | 'success', LoginEvent, LoginCtx>({
  id: 'login',
  initial: 'idle',
  context: { attempts: 0, error: null },
  states: {
    idle:    { on: { SUBMIT: { target: 'loading', actions: [resetError] } } },
    loading: {
      on: {
        SUCCESS: { target: 'success' },
        FAILURE: { target: 'error', actions: [incrementAttempts] },
      },
    },
    error:   { on: { RETRY: { target: 'idle', guard: canRetry } } },
    success: { type: 'final' },
  },
})

describe('example: login form', () => {
  it('full happy path ends in final state', async () => {
    const { result } = withSetup(() => useMachine(loginForm))
    await result.send('SUBMIT')
    await result.send('SUCCESS')
    expect(result.state.value).toBe('success')
    expect(result.isDone.value).toBe(true)
  })

  it('increments attempts on each failure', async () => {
    const { result } = withSetup(() => useMachine(loginForm))
    await result.send('SUBMIT')
    await result.send('FAILURE')
    expect(result.context.value.attempts).toBe(1)
    await result.send('RETRY')
    await result.send('SUBMIT')
    await result.send('FAILURE')
    expect(result.context.value.attempts).toBe(2)
  })

  it('blocks retry after 3 failures', async () => {
    const { result } = withSetup(() => useMachine(loginForm))
    for (let i = 0; i < 3; i++) {
      await result.send('SUBMIT')
      await result.send('FAILURE')
      if (i < 2) await result.send('RETRY')
    }
    expect(result.context.value.attempts).toBe(3)
    expect(result.can('RETRY')).toBe(false)
  })

  it('resets error on new submit', async () => {
    const { result } = withSetup(() => useMachine(loginForm))
    await result.send('SUBMIT')
    await result.send('FAILURE')
    await result.send('RETRY')
    await result.send('SUBMIT')
    expect(result.context.value.error).toBeNull()
  })
})
