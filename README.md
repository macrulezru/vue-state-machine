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
