import { describe, it, expect } from 'vitest'
import { withSetup } from '../helpers'
import { defineMachine } from '../../src/core/defineMachine'
import { useMachine } from '../../src/composables/useMachine'

const editor = defineMachine({
  id: 'editor',
  initial: 'editing' as const,
  states: {
    editing: {
      parallel: {
        saving: {
          initial: 'idle',
          states: {
            idle:   { on: { START_SAVE: { target: 'saving' } } },
            saving: { on: { SAVE_DONE: { target: 'saved' } } },
            saved:  {},
          },
        },
        validation: {
          initial: 'valid',
          states: {
            valid:   { on: { INVALIDATE: { target: 'invalid' } } },
            invalid: { on: { VALIDATE:   { target: 'valid' } } },
          },
        },
      },
    },
  },
})

describe('example: parallel editor', () => {
  it('starts with correct region states', () => {
    const { result } = withSetup(() => useMachine(editor))
    expect(result.matches('editing')).toBe(true)
    expect(result.matches({ saving: 'idle' })).toBe(true)
    expect(result.matches({ validation: 'valid' })).toBe(true)
  })

  it('saving region transitions independently', async () => {
    const { result } = withSetup(() => useMachine(editor))
    await result.send('START_SAVE')
    expect(result.matches({ saving: 'saving' })).toBe(true)
    expect(result.matches({ validation: 'valid' })).toBe(true)
  })

  it('validation region transitions independently', async () => {
    const { result } = withSetup(() => useMachine(editor))
    await result.send('INVALIDATE')
    expect(result.matches({ validation: 'invalid' })).toBe(true)
    expect(result.matches({ saving: 'idle' })).toBe(true)
  })

  it('both regions can transition on same event', async () => {
    const editorBoth = defineMachine({
      id: 'editor-both',
      initial: 'editing' as const,
      states: {
        editing: {
          parallel: {
            a: { initial: 'off', states: { off: { on: { TOGGLE: { target: 'on' } } }, on: {} } },
            b: { initial: 'off', states: { off: { on: { TOGGLE: { target: 'on' } } }, on: {} } },
          },
        },
      },
    })
    const { result } = withSetup(() => useMachine(editorBoth))
    await result.send('TOGGLE')
    expect(result.matches({ a: 'on' })).toBe(true)
    expect(result.matches({ b: 'on' })).toBe(true)
  })
})
