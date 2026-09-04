# **State Machine**

![State Machine](https://github.com/macrulezru/assets/blob/master/packages-images/vue-state-machine.png?raw=true)

Lightweight reactive finite state machines (FSM / statechart) for Vue 3 — declarative states and transitions, parallel regions, guards, actions, persist, and a composable API — with a single peer dependency.

---

## Features

- **`defineMachine()`** — pure config factory with dev-time validation; no Vue dependency — testable in Node
- **`useMachine()`** — composable that wraps a machine in Vue reactivity; reactive `state`, `context`, `send()`, `matches()`, `can()`
- **Guards** — synchronous predicates that block transitions; exception treated as `false`
- **Actions** — sync or async side-effects on entry, exit, or transition; return `Partial<context>` to update state
- **Event queue** — `send()` adds to a queue and processes events sequentially; no race conditions with async actions
- **Parallel regions** — multiple independent sub-machines active at the same time inside a state
- **`useWizard()`** — built on top of `useMachine`; `next()`, `prev()`, `goTo()`, async `canProceed`, `onEnter`/`onLeave` hooks that can write to context, circular mode
- **Persist** — optional snapshot serialization to `localStorage` (or any custom `Storage`) per machine instance
- **Transition history** — configurable depth, useful for debugging and undo flows
- **`useSharedMachine()`** — singleton machine shared between unrelated components without Pinia
- **DevTools** — separate `/devtools` entry point; custom panel in Vue DevTools showing every registered machine's state and context
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

### Quick start

```vue
<script setup lang="ts">
import { defineMachine, useMachine } from '@macrulez/vue-state-machine'

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

### More examples

#### A machine with context, guards, and actions

A guard blocks the transition once there are already 3 attempts, an action increments the counter and clears the error — the form's logic lives declaratively in one place, not scattered across handlers.

```ts
import { defineMachine } from 'vue-state-machine'
import type { Action, Guard } from 'vue-state-machine'

type Ctx = { attempts: number; error: string | null }
type Ev = 'SUBMIT' | 'SUCCESS' | 'FAILURE' | 'RETRY'

const resetError: Action<Ctx, Ev> = () => ({ error: null })
const incrementAttempts: Action<Ctx, Ev> = (ctx) => ({ attempts: ctx.attempts + 1 })
const canRetry: Guard<Ctx, Ev> = (ctx) => ctx.attempts < 3

export const loginMachine = defineMachine<'idle' | 'loading' | 'error' | 'success', Ev, Ctx>({
  id: 'login',
  initial: 'idle',
  context: { attempts: 0, error: null },
  states: {
    idle: { on: { SUBMIT: { target: 'loading', actions: [resetError] } } },
    loading: {
      on: {
        SUCCESS: { target: 'success' },
        FAILURE: { target: 'error', actions: [incrementAttempts] },
      },
    },
    error: { on: { RETRY: { target: 'idle', guard: canRetry } } },
    success: { type: 'final' },
  },
})
```

#### Wiring it into a component

`send()` returns a promise that resolves once the transition finishes, `can()` synchronously checks whether an event would fire, `isDone` flips on the final state — all reactive, no manual computed properties.

```ts
import { useMachine } from 'vue-state-machine'
import { loginMachine } from './machine'

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

// state.value === 'error'  ->  `Failed. Attempts: ${context.value.attempts}/3`
// can('RETRY')             ->  whether the Retry button should be enabled
// isDone.value             ->  true once login succeeds
```

#### A multi-step wizard, no machine of your own

`useWizard` builds the machine from a steps array on its own — `canProceed` blocks `next()` until required fields are filled in, and `progress` comes ready-made.

```ts
import { useWizard } from 'vue-state-machine'
import type { WizardStep } from 'vue-state-machine'

interface CheckoutCtx {
  name: string
  email: string
  address: string
}

const steps: WizardStep<CheckoutCtx>[] = [
  { id: 'info', label: 'Your info', canProceed: (ctx) => !!ctx.name && !!ctx.email },
  { id: 'address', label: 'Delivery', canProceed: (ctx) => !!ctx.address },
]

const { currentStep, progress, next, prev, isLast } = useWizard(steps)

// next() calls canProceed first and returns false if it's blocked — no
// manual validation gate before advancing to the next step.
```

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/vue-state-machine](https://npm.vuecraft.ru/en/packages/vue-state-machine/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/vue-state-machine](https://github.com/macrulezru/vue-state-machine)
- 📦 **NPM:** [@macrulez/vue-state-machine](https://www.npmjs.com/package/@macrulez/vue-state-machine)
- 🐛 **Issues:** [github.com/macrulezru/vue-state-machine/issues](https://github.com/macrulezru/vue-state-machine/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
