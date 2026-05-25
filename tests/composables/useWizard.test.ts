import { describe, it, expect, vi } from 'vitest'
import { withSetup } from '../helpers'
import { useWizard } from '../../src/composables/useWizard'

const steps = [
  { id: 'info', label: 'Info' },
  { id: 'address', label: 'Address' },
  { id: 'payment', label: 'Payment' },
]

describe('useWizard', () => {
  it('starts at first step', () => {
    const { result } = withSetup(() => useWizard(steps))
    expect(result.currentStep.value.id).toBe('info')
    expect(result.currentIndex.value).toBe(0)
    expect(result.isFirst.value).toBe(true)
    expect(result.isLast.value).toBe(false)
    expect(result.totalSteps).toBe(3)
  })

  it('next() advances to next step', async () => {
    const { result } = withSetup(() => useWizard(steps))
    const moved = await result.next()
    expect(moved).toBe(true)
    expect(result.currentStep.value.id).toBe('address')
  })

  it('prev() goes back', async () => {
    const { result } = withSetup(() => useWizard(steps))
    await result.next()
    result.prev()
    await new Promise((r) => setTimeout(r, 20))
    expect(result.currentStep.value.id).toBe('info')
  })

  it('isLast is true on last step', async () => {
    const { result } = withSetup(() => useWizard(steps))
    await result.next()
    await result.next()
    expect(result.isLast.value).toBe(true)
  })

  it('progress goes from 0 to 1', async () => {
    const { result } = withSetup(() => useWizard(steps))
    expect(result.progress.value).toBe(0)
    await result.next()
    expect(result.progress.value).toBeCloseTo(0.5)
    await result.next()
    expect(result.progress.value).toBe(1)
  })

  it('canProceed blocks next()', async () => {
    const stepsWithGuard = [
      { id: 'a', canProceed: () => false },
      { id: 'b' },
    ]
    const { result } = withSetup(() => useWizard(stepsWithGuard))
    const moved = await result.next()
    expect(moved).toBe(false)
    expect(result.currentStep.value.id).toBe('a')
  })

  it('canProceed allows next() when true', async () => {
    const stepsWithGuard = [
      { id: 'a', canProceed: () => true },
      { id: 'b' },
    ]
    const { result } = withSetup(() => useWizard(stepsWithGuard))
    const moved = await result.next()
    expect(moved).toBe(true)
    expect(result.currentStep.value.id).toBe('b')
  })

  it('async canProceed is awaited', async () => {
    const stepsWithAsync = [
      { id: 'a', canProceed: async () => { await new Promise((r) => setTimeout(r, 10)); return true } },
      { id: 'b' },
    ]
    const { result } = withSetup(() => useWizard(stepsWithAsync))
    const moved = await result.next()
    expect(moved).toBe(true)
  })

  it('canProceed throwing returns false and logs error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stepsWithThrow = [
      { id: 'a', canProceed: () => { throw new Error('fail') } },
      { id: 'b' },
    ]
    const { result } = withSetup(() => useWizard(stepsWithThrow))
    const moved = await result.next()
    expect(moved).toBe(false)
    spy.mockRestore()
  })

  it('goTo() jumps to target step', async () => {
    const { result } = withSetup(() => useWizard(steps, { allowSkip: true }))
    const moved = await result.goTo('payment')
    expect(moved).toBe(true)
    expect(result.currentStep.value.id).toBe('payment')
  })

  it('reset() returns to initial step', async () => {
    const { result } = withSetup(() => useWizard(steps, { allowSkip: true }))
    await result.goTo('payment')
    result.reset()
    await new Promise((r) => setTimeout(r, 20))
    expect(result.currentStep.value.id).toBe('info')
  })

  it('circular option wraps next() on last step', async () => {
    const { result } = withSetup(() => useWizard(steps, { circular: true, allowSkip: true }))
    await result.goTo('payment')
    await result.next()
    expect(result.currentStep.value.id).toBe('info')
  })

  it('throws on empty steps', () => {
    expect(() => withSetup(() => useWizard([]))).toThrow('steps array cannot be empty')
  })

  it('onEnter and onLeave are called', async () => {
    const onEnterB = vi.fn()
    const onLeaveA = vi.fn()
    const stepsWithHooks = [
      { id: 'a', onLeave: onLeaveA },
      { id: 'b', onEnter: onEnterB },
    ]
    const { result } = withSetup(() => useWizard(stepsWithHooks))
    await result.next()
    expect(onLeaveA).toHaveBeenCalled()
    expect(onEnterB).toHaveBeenCalled()
  })
})
