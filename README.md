<div align="center" style="background:#111827;border-radius:20px;padding:28px 20px 20px;margin-bottom:32px">
  <h1 style="color:#f9fafb;margin:0 0 32px;font-size:2.2em;letter-spacing:-0.03em;font-weight:700;font-family:sans-serif">
    vue-state-machine
  </h1>
  <img
    src="https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/images/npm/vue-state-machine.webp"
    alt="vue-virtual-scroller-kit"
    style="max-width:100%;width:auto;height:300px;border-radius:12px"
  />
</div>

Lightweight reactive finite state machines (FSM / statechart) for Vue 3 — declarative states and transitions, parallel regions, guards, actions, persist, and a composable API — with a single peer dependency.

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [defineMachine](#definemachine)
- [useMachine](#usemachine)
- [Parallel states](#parallel-states)
- [useWizard](#usewizard)
- [useSharedMachine](#usesharedmachine)
- [Vue plugin](#vue-plugin)
- [DevTools](#devtools)
- [TypeScript types](#typescript-types)
- [SSR compatibility](#ssr-compatibility)
- [Architecture](#architecture)
- [XState v5 migration](#xstate-v5-migration)
- [Bundle size & peer dependencies](#bundle-size--peer-dependencies)

---

## Features

- **`defineMachine()`** — pure config factory with dev-time validation; no Vue dependency — testable in Node
- **`useMachine()`** — composable that wraps a machine in Vue reactivity; reactive `state`, `context`, `send()`, `matches()`, `can()`
- **Guards** — synchronous predicates that block transitions; exception treated as `false`
- **Actions** — sync or async side-effects on entry, exit, or transition; return `Partial<context>` to update state
- **Event queue** — `send()` adds to a queue and processes events sequentially; no race conditions with async actions
- **Parallel regions** — multiple independent sub-machines active at the same time inside a state
- **`useWizard()`** — built on top of `useMachine`; `next()`, `prev()`, `goTo()`, async `canProceed`, `onEnter`/`onLeave` hooks, circular mode
- **Persist** — optional snapshot serialization to `localStorage` (or any custom `Storage`) per machine instance
- **Transition history** — configurable depth, useful for debugging and undo flows
- **`useSharedMachine()`** — singleton machine shared between unrelated components without Pinia
- **DevTools** — separate `/devtools` entry point; custom panel in Vue DevTools with state, context, history, and event sender
- **Full TypeScript** — `TState`, `TEvent`, `TContext` generics inferred automatically from the config
- **XState v5 compatible subset** — migrate by swapping `createMachine` → `defineMachine` and `assign()` → plain return value
- **SSR-safe** — no `window` / `localStorage` in the core; persist is silently skipped server-side
- **≤ 4 KB gzip** for the core (`defineMachine` + `useMachine`)

---

## Installation

```bash
npm install @macrulez/vue-state-machine
```

Peer dependency:

```bash
npm install vue@>=3.3
```

---

## Quick start

```vue
<script setup lang="ts">
import { defineMachine, useMachine } from 'vue-state-machine'

const trafficLight = defineMachine({
  id: 'traffic',
  initial: 'red',
  states: {
    red:    { on: { NEXT: { target: 'green' } } },
    green:  { on: { NEXT: { target: 'yellow' } } },
    yellow: { on: { NEXT: { target: 'red' } } },
  },
})

const { state, send } = useMachine(trafficLight)
</script>

<template>
  <div :class="state">
    <p>Current: {{ state }}</p>
    <button @click="send('NEXT')">Next</button>
  </div>
</template>
```

`state` is a reactive `Ref<'red' | 'green' | 'yellow'>`. Clicking the button transitions the machine and Vue re-renders automatically.

---

## defineMachine

Pure factory function. Validates the config and returns it with improved TypeScript types. Zero Vue dependency — can be called and tested in Node without a Vue app.

```ts
function defineMachine<TState, TEvent, TContext>(
  config: MachineConfig<TState, TEvent, TContext>
): MachineConfig<TState, TEvent, TContext>
```

### Config shape

```ts
const machine = defineMachine({
  id: 'login',              // unique identifier (required, used by DevTools and MachineStore)
  initial: 'idle',          // starting state
  context: {                // optional initial context (deep-cloned per instance)
    attempts: 0,
    error: null as string | null,
  },
  states: {
    idle: {
      on: {
        // event name → transition config
        SUBMIT: { target: 'loading', actions: [resetError] }
      }
    },
    loading: {
      on: {
        SUCCESS: { target: 'success' },
        FAILURE: { target: 'error', actions: [incrementAttempts] },
      }
    },
    error: {
      on: {
        RETRY: { target: 'idle', guard: canRetry }
      }
    },
    success: { type: 'final' },   // terminal — further send() calls are no-ops
  },
})
```

### `StateConfig` options

| Field | Type | Description |
|---|---|---|
| `on` | `Record<TEvent, TransitionConfig>` | Event handlers |
| `entry` | `Action[]` | Invoked when the machine enters this state |
| `exit` | `Action[]` | Invoked when the machine leaves this state |
| `type` | `'final'` | Terminal state — `isDone` becomes `true`, `send()` is ignored |
| `parallel` | `Record<string, SubMachineConfig>` | Parallel regions (see [Parallel states](#parallel-states)) |

### `TransitionConfig` options

| Field | Type | Description |
|---|---|---|
| `target` | `TState` | Destination state (TypeScript-checked against config) |
| `guard` | `Guard<TContext, TEvent>` | Synchronous predicate; `false` or thrown exception blocks the transition |
| `actions` | `Action<TContext, TEvent>[]` | Side-effects executed during the transition |

### Dev-time validation

In development (`import.meta.env.DEV !== false`), `defineMachine` throws descriptive errors for:

- Empty `config.id`
- `initial` not found in `states`
- Any `target` referencing a non-existent state

Validation is tree-shaken away in production builds.

### Guards and Actions

```ts
type Guard<TContext, TEvent> =
  (context: TContext, event: EventObject<TEvent>) => boolean

type Action<TContext, TEvent> =
  (context: TContext, event: EventObject<TEvent>) =>
    void | Partial<TContext> | Promise<Partial<TContext> | void>
```

**Guard rules:**
- Must be **synchronous** and **side-effect-free** — it is also called by `can()` reactively
- An exception thrown inside a guard is caught and treated as `false`
- `Promise` return values are not awaited — use actions for async work

**Action rules:**
- May be `async` — the event queue awaits each action before executing the next
- Return `Partial<TContext>` to merge updates into context; return `void` for side-effects only
- Actions execute in order: `exit` → `transition.actions` → `entry`

```ts
// Action that updates context
const incrementAttempts = (ctx: { attempts: number }) => ({
  attempts: ctx.attempts + 1,
})

// Async action — fetch result is merged into context
const loadUser = async (ctx, event: { type: 'LOAD'; id: number }) => {
  const user = await api.getUser(event.id)
  return { user }
}

// Guard
const canRetry = (ctx: { attempts: number }) => ctx.attempts < 3
```

---

## useMachine

Composable. Wraps a `MachineConfig` in Vue reactivity and exposes a rich API.

```ts
function useMachine<TState, TEvent, TContext>(
  config: MachineConfig<TState, TEvent, TContext>,
  options?: UseMachineOptions,
): MachineInstance<TState, TEvent, TContext>
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `historyLimit` | `number` | `50` | Maximum entries kept in `history`; oldest are dropped when exceeded (FIFO) |
| `persist.key` | `string` | — | localStorage key for snapshot persistence |
| `persist.storage` | `Storage` | `localStorage` | Custom storage backend (e.g. `sessionStorage`) |

### Return value

| Property | Type | Description |
|---|---|---|
| `state` | `Readonly<Ref<TState>>` | Current state — reactive |
| `context` | `Readonly<Ref<TContext>>` | Current context — reactive |
| `send` | `(event: TEvent \| EventObject<TEvent>) => Promise<void>` | Queue an event; resolves after the transition completes |
| `matches` | `(query) => boolean` | Check current state or region state (see below) |
| `can` | `(event: TEvent) => boolean` | `true` if the event would trigger a transition (guard evaluated synchronously) |
| `history` | `Readonly<Ref<TransitionRecord[]>>` | Past transitions, newest last |
| `isDone` | `ComputedRef<boolean>` | `true` when the current state has `type: 'final'` |
| `snapshot` | `ComputedRef<MachineSnapshot>` | Serializable snapshot of `{ state, context, history }` |
| `restore` | `(snapshot: MachineSnapshot) => void` | Restore state from a snapshot without running guards or actions |

### `send()` — event queue

Events are processed sequentially. Calling `send()` multiple times in the same tick queues all events and runs them one after the other. Each `send()` returns a `Promise` that resolves after that specific event is fully processed (including async actions).

```ts
// Safe to call in rapid succession — no race conditions
await send('SUBMIT')
// state is 'loading' here

send('SUCCESS')  // queued, not awaited
send('FAIL')     // also queued — but 'FAIL' will be ignored because 'SUCCESS' ran first
```

### `matches()` — checking state

```ts
// Simple string
matches('loading')                        // true if state === 'loading'

// Array — any of the states
matches(['idle', 'error'])                // true if state === 'idle' OR 'error'

// Object — check a parallel region
matches({ validation: 'invalid' })       // true if region 'validation' is in 'invalid'
```

### `can()` — checking transitions

`can()` evaluates the guard synchronously without side-effects. Use it to enable/disable buttons:

```ts
const { can } = useMachine(loginForm)

// In template
// :disabled="!can('RETRY')"
```

> **Important:** Guards used with `can()` must be synchronous and free of side-effects. This is a deliberate contract — `can()` is called reactively and must not trigger async operations.

### Persist — snapshot to localStorage

```ts
const { state, send } = useMachine(checkoutMachine, {
  persist: { key: 'checkout' },
})
// On mount: snapshot is restored from localStorage
// On every transition: snapshot is saved to localStorage
```

The snapshot includes `state`, `context`, and `history`. On the server (`typeof window === 'undefined'`) persist is silently disabled.

```ts
// Custom storage
const { send } = useMachine(machine, {
  persist: { key: 'my-key', storage: sessionStorage },
})
```

### Full example — login form

```vue
<script setup lang="ts">
import { defineMachine, useMachine } from 'vue-state-machine'
import type { Action, Guard } from 'vue-state-machine'

type Ctx = { attempts: number; error: string | null }
type Ev  = 'SUBMIT' | 'SUCCESS' | 'FAILURE' | 'RETRY'

const resetError:        Action<Ctx, Ev> = ()    => ({ error: null })
const incrementAttempts: Action<Ctx, Ev> = (ctx) => ({ attempts: ctx.attempts + 1 })
const canRetry:          Guard<Ctx, Ev>  = (ctx) => ctx.attempts < 3

const loginMachine = defineMachine<'idle'|'loading'|'error'|'success', Ev, Ctx>({
  id: 'login',
  initial: 'idle',
  context: { attempts: 0, error: null },
  states: {
    idle:    { on: { SUBMIT:  { target: 'loading', actions: [resetError] } } },
    loading: { on: { SUCCESS: { target: 'success' },
                     FAILURE: { target: 'error', actions: [incrementAttempts] } } },
    error:   { on: { RETRY:   { target: 'idle', guard: canRetry } } },
    success: { type: 'final' },
  },
})

const { state, context, send, can, isDone } = useMachine(loginMachine)

async function submit() {
  await send('SUBMIT')
  try {
    await api.login()
    send('SUCCESS')
  } catch (e) {
    send({ type: 'FAILURE', message: String(e) })
  }
}
</script>

<template>
  <form @submit.prevent="submit">
    <p v-if="state === 'error'">Failed. Attempts: {{ context.attempts }}/3</p>
    <button type="submit" :disabled="state === 'loading'">Login</button>
    <button v-if="state === 'error'" @click="send('RETRY')" :disabled="!can('RETRY')">
      Retry
    </button>
    <p v-if="isDone">Logged in!</p>
  </form>
</template>
```

---

## Parallel states

A state can declare `parallel` regions — a set of independent sub-machines that all become active when the parent state is entered and are destroyed when it is left.

```ts
const editor = defineMachine({
  id: 'editor',
  initial: 'editing',
  states: {
    editing: {
      parallel: {
        saving: {
          initial: 'idle',
          states: {
            idle:   { on: { START_SAVE: { target: 'saving' } } },
            saving: { on: { SAVE_DONE: { target: 'saved'  } } },
            saved:  {},
          },
        },
        validation: {
          initial: 'valid',
          states: {
            valid:   { on: { INVALIDATE: { target: 'invalid' } } },
            invalid: { on: { VALIDATE:   { target: 'valid'   } } },
          },
        },
      },
    },
    idle: {},
  },
})
```

`send()` delivers every event to **all active regions**. Each region handles it independently.

```ts
const { matches, send } = useMachine(editor)

matches('editing')                 // main state
matches({ saving: 'idle' })        // region check
matches({ validation: 'valid' })   // another region

await send('INVALIDATE')
matches({ validation: 'invalid' }) // true
matches({ saving: 'idle' })        // still true — unaffected
```

**Context conflict resolution:** when two regions return a `Partial<context>` that touches the same field, the **last region in declaration order wins**. A `console.warn` is emitted in dev mode naming the conflicting regions and field.

**Limitation:** parallel regions support one level of nesting. Regions cannot themselves contain `parallel`. This is a deliberate choice to control complexity.

---

## useWizard

A composable for multi-step forms built on top of `defineMachine`. The wizard machine is generated automatically from the steps array.

```ts
function useWizard<TContext>(
  steps: WizardStep<TContext>[],
  options?: WizardOptions,
): WizardInstance<TContext>
```

### `WizardStep`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique step identifier (becomes a state name internally) |
| `label` | `string?` | Display label |
| `component` | `Component?` | Vue component to render for this step |
| `canProceed` | `(ctx) => boolean \| Promise<boolean>` | Gate for `next()` and forward `goTo()`; may be async |
| `onEnter` | `(ctx) => void` | Called when the wizard enters this step |
| `onLeave` | `(ctx) => void` | Called when the wizard leaves this step |

### `WizardOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `initialStep` | `number` | `0` | Index of the starting step |
| `allowSkip` | `boolean` | `false` | Skip `canProceed` on forward `goTo()` |
| `circular` | `boolean` | `false` | `next()` wraps from last step back to first |

### Return value

| Property | Type | Description |
|---|---|---|
| `currentStep` | `Ref<WizardStep>` | Currently active step object |
| `currentIndex` | `ComputedRef<number>` | Zero-based index of the current step |
| `totalSteps` | `number` | Total number of steps |
| `progress` | `ComputedRef<number>` | `0` to `1` based on current index |
| `isFirst` | `ComputedRef<boolean>` | `true` on the first step |
| `isLast` | `ComputedRef<boolean>` | `true` on the last step |
| `history` | `Ref<string[]>` | IDs of visited steps |
| `next()` | `Promise<boolean>` | Advance; calls `canProceed` first; returns `false` if blocked |
| `prev()` | `void` | Go back (no guard) |
| `goTo(id)` | `Promise<boolean>` | Jump to step by id; respects `canProceed` unless `allowSkip` |
| `reset()` | `void` | Return to the initial step |

### Example

```vue
<script setup lang="ts">
import { useWizard } from 'vue-state-machine'
import type { WizardStep } from 'vue-state-machine'
import StepInfo    from './StepInfo.vue'
import StepAddress from './StepAddress.vue'
import StepPayment from './StepPayment.vue'

interface CheckoutCtx {
  name: string
  email: string
  address: string
}

const steps: WizardStep<CheckoutCtx>[] = [
  {
    id: 'info',
    label: 'Your info',
    component: StepInfo,
    canProceed: (ctx) => !!ctx.name && !!ctx.email,
  },
  {
    id: 'address',
    label: 'Delivery',
    component: StepAddress,
    canProceed: (ctx) => !!ctx.address,
  },
  {
    id: 'payment',
    label: 'Payment',
    component: StepPayment,
    onEnter: () => trackEvent('payment_step_entered'),
  },
]

const { currentStep, progress, isFirst, isLast, next, prev } = useWizard(steps)
</script>

<template>
  <div>
    <progress :value="progress" max="1" />

    <component :is="currentStep.component" />

    <nav>
      <button :disabled="isFirst" @click="prev">Back</button>
      <button v-if="!isLast" @click="next">Next</button>
      <button v-else @click="submit">Place order</button>
    </nav>
  </div>
</template>
```

### `canProceed` rules

- May return a `boolean` or a `Promise<boolean>`
- If it **returns `false`**, `next()` / forward `goTo()` return `false` and the wizard stays on the current step
- If it **throws**, the same outcome — `false` is returned, the error is logged to `console.error` in dev mode
- `prev()` and backward `goTo()` **never** check `canProceed`
- `allowSkip: true` disables `canProceed` for `goTo()` only; `next()` always checks it

---

## useSharedMachine

Creates or retrieves a singleton machine instance by `config.id`. Useful when unrelated components need to share the same running machine without prop-drilling or Pinia.

```ts
function useSharedMachine<TState, TEvent, TContext>(
  config: MachineConfig<TState, TEvent, TContext>,
  options?: UseMachineOptions,
): MachineInstance<TState, TEvent, TContext>
```

Requires `VueMachinePlugin` to be installed.

```ts
// In component A
const { state } = useSharedMachine(cartMachine)

// In component B (completely separate tree)
const { send } = useSharedMachine(cartMachine)

// Both share the same machine instance — same state, same context
await send('ADD_ITEM')  // component A's state.value updates reactively
```

If a machine with `config.id` is already registered in the store, the existing instance is returned. Otherwise a new one is created and registered automatically.

---

## Vue plugin

Install `VueMachinePlugin` to enable the global machine registry (`useMachineStore`, `useSharedMachine`) and DevTools integration.

```ts
import { createApp } from 'vue'
import { VueMachinePlugin } from 'vue-state-machine'
import App from './App.vue'

const app = createApp(App)
app.use(VueMachinePlugin)
app.mount('#app')
```

### `useMachineStore()`

Provides direct access to the global registry. Useful for debugging or admin UIs.

```ts
const store = useMachineStore()

store.register('cart', instance)    // register manually
store.unregister('cart')
store.get('cart')                   // MachineInstance | undefined
store.getAll()                      // Map<string, MachineInstance>
```

Calling `useMachineStore()` without the plugin installed throws a descriptive error.

---

## DevTools

The DevTools integration lives in a separate entry point so it never ends up in production bundles.

```ts
import { createApp } from 'vue'
import { VueMachinePlugin }  from 'vue-state-machine'
import { VueMachineDevtools } from 'vue-state-machine/devtools'
import App from './App.vue'

const app = createApp(App)
app.use(VueMachinePlugin)

// Only in development
if (import.meta.env.DEV) {
  app.use(VueMachineDevtools)
}

app.mount('#app')
```

**Panel features:**
- List of all registered machines (from `MachineStore`)
- Current state, context as a JSON tree, full transition history
- "Send Event" button — pick an event type and add a custom payload
- Timeline: every transition is emitted as a named DevTools timeline event with timestamp and payload

> `VueMachinePlugin` must be installed before `VueMachineDevtools`.

---

## TypeScript types

All public types are exported from the package root:

```ts
import type {
  // Core config
  MachineConfig,
  StateConfig,
  TransitionConfig,
  SubMachineConfig,

  // Functions
  Guard,
  Action,

  // Events
  EventObject,

  // Runtime
  MachineInstance,
  UseMachineOptions,
  TransitionRecord,
  MachineSnapshot,
  TransitionResult,

  // Wizard
  WizardStep,
  WizardOptions,
  WizardInstance,

  // Store
  MachineStoreAPI,

  // Utility
  Ctx,
} from 'vue-state-machine'
```

### Generic inference

TypeScript infers `TState`, `TEvent`, and `TContext` from the config you pass to `defineMachine`. You rarely need to annotate them explicitly:

```ts
const machine = defineMachine({
  id: 'traffic',
  initial: 'red',       // TS infers TState = 'red' | 'green' | 'yellow'
  states: {
    red:    { on: { NEXT: { target: 'green' } } },   // TEvent = 'NEXT'
    green:  { on: { NEXT: { target: 'yellow' } } },
    yellow: { on: { NEXT: { target: 'red' } } },
  },
})

const { state } = useMachine(machine)
// state: Ref<'red' | 'green' | 'yellow'>
// send accepts only 'NEXT' — other strings are compile errors
```

For complex cases you can annotate explicitly:

```ts
const machine = defineMachine<
  'idle' | 'loading' | 'error' | 'success',
  'SUBMIT' | 'SUCCESS' | 'FAILURE' | 'RETRY',
  { attempts: number; error: string | null }
>({ ... })
```

---

## SSR compatibility

| Scenario | Behaviour |
|---|---|
| Server render | Core modules (`defineMachine`, `MachineRunner`, `useMachine`) have no `window` / `document` / `localStorage` references |
| `persist` on server | Silently disabled — `typeof window === 'undefined'` guard in the composable |
| Hydration | Call `restore(serverSnapshot)` inside `onMounted` to hydrate from a server-side snapshot without re-running guards or actions |
| `snapshot` | Serializable with `JSON.stringify` — pass from server to client via Nuxt `useState`, `useServerState`, or `<script>` injection |

**Nuxt SSR example:**

```vue
<script setup lang="ts">
import { useMachine } from 'vue-state-machine'
import { onMounted } from 'vue'

// Snapshot passed from the server via useAsyncData / useState
const serverSnapshot = useState('checkout-snapshot')

const { state, send, restore } = useMachine(checkoutMachine)

onMounted(() => {
  if (serverSnapshot.value) restore(serverSnapshot.value)
})
</script>
```

---

## Architecture

```
defineMachine(config)
    │
    ▼ dev-time validation + type narrowing
MachineConfig<TState, TEvent, TContext>
    │
    ▼ created inside useMachine()
MachineRunner  (pure class, zero Vue deps)
    │  getCurrentState() / getContext()
    │  canTransition(event) → boolean
    │  enqueue(event)  ──────────────────────────────┐
    │  transition(event) → Promise<TransitionResult>  │
    │                                                 │
    │  EventQueue (sequential processing)             │
    │  ├── guard check  (sync, exception = false)     │
    │  ├── exit actions (await each)                  │
    │  ├── transition actions (await each)            │
    │  ├── state update                               │
    │  └── entry actions (await each)                 │
    │       └── Partial<TContext> merged into context ◄┘
    │
    │  Parallel regions
    │  ├── SubMachineRunner per region (activated on state entry)
    │  ├── send() dispatches to all regions
    │  └── "last declared wins" on context conflict
    │
    ▼ wrapped in Vue reactivity
useMachine(config, options)
    │  state:   shallowRef<TState>
    │  context: shallowRef<TContext>
    │  history: shallowRef<TransitionRecord[]>  (FIFO, historyLimit)
    │  send()   → enqueue → sync refs after result
    │  matches() / can()
    │  snapshot / restore()
    │  onMounted: load persist snapshot
    │  on transition: save persist snapshot
    │
    ├──▶ MachineStore (provide/inject via VueMachinePlugin)
    │        register() on composable creation
    │        useSharedMachine() → singleton by config.id
    │
    ▼
Vue components (template, setup)

useWizard(steps, options)
    │  buildWizardMachine() → generates MachineConfig from steps array
    │  useMachine(generatedConfig)
    │  next() → await canProceed → send('NEXT')
    │  goTo(id) → await canProceed (if forward) → send('GOTO_<id>')
    │  prev() → send('PREV')
    │
    ▼
WizardInstance (currentStep, progress, isFirst, isLast, history, ...)

VueMachineDevtools (separate entry point /devtools)
    │  reads MachineStore via app._context.provides
    │  hooks into __VUE_DEVTOOLS_GLOBAL_HOOK__
    │  emits timeline events per transition
    ▼
Vue DevTools browser extension panel "State Machines"
```

---

## XState v5 migration

`vue-state-machine` is API-compatible with a useful subset of XState v5. Migrating a simple machine typically takes minutes.

### API mapping

| XState v5 | vue-state-machine | Notes |
|---|---|---|
| `createMachine(config)` | `defineMachine(config)` | Config structure is identical |
| `useMachine(machine)` from `@xstate/vue` | `useMachine(config)` | Same composable shape |
| `send(event)` | `send(event)` | Identical |
| `matches(state)` | `matches(state)` | Identical |
| `context` in config | `context` in config | Identical |
| `on` handlers | `on` handlers | Identical |
| `entry` / `exit` | `entry` / `exit` | Identical |
| `type: 'final'` | `type: 'final'` | Identical |
| `guard` function | `guard` function | Same signature |
| `assign(updater)` | Return `Partial<context>` from action | No wrapper needed |
| `snapshot` / `restore` | `snapshot` / `restore` | Identical concept |
| `invoke` / services | **Not supported** | Move async work into actions |
| `spawn` / actor model | **Not supported** | Intentional scope limit |
| Hierarchical states | **Not supported** | Flat + parallel only |

### Step-by-step migration

**1. Replace the import and factory:**

```ts
// Before (XState v5)
import { createMachine } from 'xstate'
const machine = createMachine({ ... })

// After
import { defineMachine } from 'vue-state-machine'
const machine = defineMachine({ ... })
```

**2. Replace `assign()` with plain return values:**

```ts
// Before
import { assign } from 'xstate'
const increment = assign({ count: (ctx) => ctx.count + 1 })

// After — just return a partial context object
const increment = (ctx: { count: number }) => ({ count: ctx.count + 1 })
```

**3. Replace the Vue composable import:**

```ts
// Before
import { useMachine } from '@xstate/vue'

// After
import { useMachine } from 'vue-state-machine'
```

**4. Move async logic from `invoke` into actions:**

```ts
// Before (XState v5 invoke)
loading: {
  invoke: {
    src: (ctx, event) => fetch('/api/user'),
    onDone:  { target: 'success', actions: assign({ user: (_, e) => e.data }) },
    onError: { target: 'error' },
  }
}

// After — fire-and-forget inside the component or inside entry action
loading: {
  entry: [async (ctx, event) => {
    try {
      const user = await fetch('/api/user').then(r => r.json())
      return { user }       // merged into context; then send SUCCESS externally
    } catch {
      return { error: 'Failed' }
    }
  }]
}
```

---

## Bundle size & peer dependencies

| Entry point | Peer deps | Gzip |
|---|---|---|
| `vue-state-machine` | `vue ^3.3` | ≤ 4 KB (core) |
| `vue-state-machine/devtools` | `vue ^3.3`, `@vue/devtools-api` (peer) | separate chunk |

- Ships as tree-shakeable **ESM** (`dist/index.mjs`) and **CommonJS** (`dist/index.cjs`)
- `"sideEffects": false` in `package.json` — bundlers can eliminate unused exports
- The `/devtools` entry point is a separate chunk — importing it in `if (import.meta.env.DEV)` blocks ensures it is excluded from production bundles by standard tree-shaking

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Website: [macrulez.ru/en](https://macrulez.ru/en)

Questions and bugs — [issues](https://github.com/macrulezru/vue-state-machine/issues)

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
