# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-04

### Fixed

- `useWizard`'s `canProceed(ctx)` callback never received the machine's real, live context — `next()`/`goTo()` read `machine.context`, but `machine` there is the static `MachineConfig` object (which never sets a `context` field at all), not the live `MachineInstance` from `useMachine()`. `canProceed` always received `{}`, so any guard depending on context (the documented `canProceed: (ctx) => !!ctx.name && !!ctx.email` pattern) always evaluated `false`. Now reads the real, live context ref.
- `WizardStep`'s `onEnter`/`onLeave` accepted a return value in their type signature intent but the internal action wrapper discarded it — there was no way for a step to actually write into wizard context at all, which meant fixing the `canProceed` bug above still couldn't matter in practice. `onEnter`/`onLeave` can now return a `Partial<TContext>` (same shape as a machine `Action`) to merge it in, and the accumulated context is now exposed on `WizardInstance.context` (a `Readonly<Ref<TContext>>`) so it can be read by the rendered step component too.
- Every `useWizard()` instance registered into the `MachineStore` under the same hardcoded id (`'__wizard__'`) — two wizards mounted at once (two forms on one page, a wizard reused across routes) silently overwrote each other's store/DevTools entry. `WizardOptions` gained an optional `id`; when omitted, a per-instance auto-generated id is used instead of the shared literal.
- Parallel-region context merging (`MachineRunner.dispatchToRegions`) treated a region's *entire* context snapshot as if it were the delta of what that region's actions changed — so a region's stale, untouched fields could silently overwrite a sibling region's legitimate change to the same field, and the "context conflict" warning fired on essentially any dual-region transition regardless of whether a real conflict occurred. Each region's transition now reports only the fields its own actions actually touched (`TransitionResult.contextPatch`), and only those are merged/conflict-checked.
- The above surfaced a second, previously-invisible bug: a parallel region's context change never reached the reactive `context` ref returned by `useMachine()`, because `MachineRunner.transition()`'s "dispatch to regions" branch always reported `changed: false` — so nothing ever re-synced. `changed` (and `contextPatch`) are now correctly derived from whether any region actually transitioned.
- `MachineRunner`'s constructor, `restore()`, and parallel-region activation all copied `context` with a shallow `{ ...context }` spread, despite `defining-machines.md` documenting initial context as "deep-cloned per instance" — a nested object/array in `context` was actually shared by reference across every instance built from the same config (and across parallel regions), so a mutation via one instance could leak into another. Context is now deep-cloned (via `structuredClone`, with a shallow-copy fallback for values it can't handle).

### Added

- `TransitionResult` gained a `contextPatch: Partial<TContext>` field — the actual delta an action-driven transition applied, distinct from `nextContext` (the full resulting context).
- `WizardOptions.id?: string` — set a stable machine id for a wizard instance (for `useMachineStore().get(id)` lookups or predictable DevTools labeling); auto-generated and unique per instance when omitted.
- `WizardInstance.context: Readonly<Ref<TContext>>` — the wizard's accumulated context, written to via `onEnter`/`onLeave` return values.
