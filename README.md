# dom-circuit

A little state machine for Javascript applications that live on the DOM.

`dom-circuit` is small utility function that weaves selected DOM elements into a state machine.

The state machine acts like a live circuit where elements feed input signals that drive state change through reducers into output signals. Output signals propagate through the circuit until they arrive, fully reduced, at the circuit terminal.

The following example leaves out the HTML markup detail and item handling logic of a TODO application and focuses on the state changes that might be expected when these two aspects are brought together.

```
import circuit from 'dom-circuit'
import {update, remove, total, done} from './reducers.js';

const todo = circuit({
  'add@change': (state, value) => (todo.items.update(value)),
  items: {
    update,
    'remove@click': remove,
  },
  footer: {
    'counts@/items': {
      total,
      done,
    },
  },
})({});
```

In the example above, the `add` signal will bind in order of precedence to elements with a class-name, id or type equal to `add`. A `change` event listener is attached to the selected element and a signal will be generated whenever the handler is activated. The signalled reducer receives the current state and the new value. The new state is propagated through the circuit.

## How it works

Circuits like the one above are constructed from `{signal: reducer}` and `{signal: circuit}` property types.

Signals can resolve to elements, circuit identifiers, events or any combination of them all - but always in structured order:

`(alias:)? (selector)? (@event)?` where:

- alias - circuit identifier when signal is too noisy as in `xOpen:#x.open[arg=123]`
- selector - one of
  - optimistic DOM selector as in `header` matches in precedence order: `.header`, `#header`, `header`
  - valid DOM selector via querySelectorAll as in `.classname > .classname`
- event - one of
  - valid DOM eventListener prefixed by `@` as in `@click`
  - as above + event options as in `@click{passive: true}`
  - XPath selector prefixed by `@` as in `@/root/path/to/circuit/identifier`
  - `@init` - initial state event
  - `@state` - state change event

Signals can be applied across circuit properties to facilitate multiple binding scenarios:

```
{
  items: { // binds to the element with `class="items"`
    '@click': (items, event) => // which item was clicked?...
    '@scroll': (items, event) => // er, scrolling now...
    add: (items, value) => [...items, value]
  }
}
```

Each circuit identifier takes the value of the signal selector as its name. When this is not semantically appropriate, an alias can be used.

```
circuit({
  'add:count' (({count}, value) => ({count: count + value}))
})({count: 1})

circuit.add(1) // => 2
```

Reducers follow the standard reducer argument pattern: `(state, value) => ({...state, value})`. The state passed into the reducer is the state of the immediate parent of the reducer property.

The value returned by the reducer will propagate through the circuit, bubbling up until it hits the circuit terminal function - an optional function that receives the changed circuit state:

```
const terminal = (state, id) => console.log(state, id)
circuit({
  'add: count': ({ count }, value) => ({ count: count + value }),
}, terminal)({
  count: 1,
});

circuit.add(1) // logs the current state => ({count: 2}, '/count')
```

Circuit state change can be actioned directly from within a reducer in several ways:

### Return a new state directly

```
  header: {
    add: (state, value) => ({...state, add: value}),
  },
```

State change propagation will bubble up through the circuit until it reaches the circuit terminal

### Propagate a sibling state

```
  header: {
    add: (state, value) =>({...state, updated: true}),
    updated: (state, value) => // reducer called with value === true
  },
```

State change propagation will be further reduced by sibling reducer(s) before bubbling up through the circuit until it reaches the circuit terminal.

### Jump to a new state

```
  header: {
    add: (state, value) => {
      todos.items.update(value)
      return // no return value
    }
  },
  items: {
    update: (items, value) => // reducer called with current items and new value
  }
```

State change propagation will jump to the referenced circuit reducer and then bubble up from that point until it reaches the circuit terminal.

### Bind to deferred state change

This pattern uses a simplified XPath syntax to bind a state change event to another state value change.

```
  header: {
    add: (state, value) => ({state, latest: value}),
  },
  items: {
    '@/header/add': (items, value) => // reducer called with current items and latest update value
  }
```

State change propagation will be further reduced by deferred reducer(s) before bubbling up through the circuit until it reaches the circuit terminal. The deferred reducer will receive its own current state and the reduced state value from the initiating reducer.
