# dom-circuit

A little state machine for Javascript applications that live on the DOM.

`dom-circuit` is small utility function that weaves selected DOM elements into a declarative state machine that organizes complex application logic into predictable signal states.

The state machine acts like a live circuit connected to the DOM. Element events generate input signals that drive state change through reducers that feed back into the circuit. Signals propagate through the circuit until they arrive, fully reduced, at the circuit terminal.

Given some Markup

```html
<body>
  <header>Registration</header>
  <main>
    <input class="name"/>
    <button class="register">Click me</button>
    <div class="status"><div>
  </main>
</body>
```

`dom-circuit` declares element relationships in terms of state changes.

```javascript
import circuit from 'dom-circuit';

const app = circuit({
  main: {
    // DOM events as accumulated state
    name$change: (acc, e) => ({ ...acc, name: e.target.value }),
    // state transition from register to status
    register$click: (acc) => Promise.resolve({ ...acc, status: 'ok' }),
    status: ({ status }) => {
      this.el.innerHTML = status;
    },
  },
})({});
```

The following example leaves out the HTML markup detail and item handling logic of a TODO application and focuses on the state changes that might be expected when these two aspects are brought together.

```javascript
import circuit from 'dom-circuit';
import { add, update, remove, total, done } from './reducers.js';

const todo = circuit({
  add$change: add,
  items: {
    update,
    remove$click: remove,
  },
  footer: {
    'counts:/items': {
      total,
      done,
    },
  },
})({});
```

In the example above, the `add` signal reducer will bind in order of precedence to elements with a class-name, id or type equal to `add`. A `change` event listener is attached to the selected element and a signal will be generated whenever the handler is activated. The signalled reducer receives the current state and the new value. The new state is propagated through the circuit.

## How it works

Circuits like the one above are constructed from `{signal: reducer}` and `{signal: circuit}` property types.

Signals can resolve to elements, circuit identifiers, events or any combination of them all - but always in structured order:

`(alias:)? (selector)? ($event)?` where:

- alias - circuit identifier when signal is too noisy as in `'open:#x.open[arg=123]'`
- selector - one of
  - optimistic DOM selector as in `header` matches in precedence order: `'.header'`, `'#header'`, `header`
  - CSS DOM selector as in `'.classname > [arg]'`
  - XPath selector as in `'/root/path/to/circuit/identifier'`
- event - `$` followed by one of
  - valid DOM eventListener as in `$click`
  - as above + event options as in `'$click{passive: true}'`
  - `init` - initial state event
  - `state` - state change event

Signals can be applied across circuit properties to facilitate multiple binding scenarios:

```
{
  items: { // binds to the element with `class="items"`
    $click: (items, event) => // which item was clicked?...
    $scroll: (items, event) => // er, scrolling now...
    add: (items, value) => [...items, value]
  }
}
```

Each circuit identifier takes the value of the signal selector as its name. When this is not semantically appropriate, an alias can be used.

```javascript
const cct = circuit({
  'add:count' (({count}, value) => ({count: count + value}))
})({count: 1})

cct.add(1) // => 2
```

Reducers follow the standard reducer argument pattern: `(state, value) => ({...state, value})`. The state passed into the reducer is the state of the immediate parent of the reducer property.

The value returned by the reducer will propagate through the circuit, bubbling up until it hits the circuit terminal function - an optional function that receives the changed circuit state as a `value, signal` pair:

```javascript
const terminal = (state, signal) => console.log(state, signal);
const cct = circuit(
  {
    'add: count': ({ count }, value) => ({ count: count + value }),
  },
  terminal
)({
  count: 1,
});

cct.add(1); // logs the current state => {count: 2}, '/count'
```

Circuit state change can be actioned directly from within a reducer in several ways:

### Return a new state directly

```javascript
  header: {
    add: (state, value) => ({...state, add: value}),
  },
```

State change propagation will bubble up through the circuit until it reaches the circuit terminal

### Propagate a sibling state

```javascript
  header: {
    add: (state, value) =>({...state, updated: true}),
    updated: (state, value) => // reducer called with value === true
  },
```

State change propagation will be further reduced by sibling reducer(s) before bubbling up through the circuit until it reaches the circuit terminal.

### Jump to a new state

```javascript
  header: {
    add: (state, value) => {
      this.items.update(value)
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

```javascript
  header: {
    add: (state, value) => ({state, latest: value}),
  },
  items: {
    '$/header/add': (items, value) => // reducer called with current items and latest update value
  }
```

State change propagation will be further reduced by deferred reducer(s) before bubbling up through the circuit until it reaches the circuit terminal. The deferred reducer will receive its own current state and the reduced state value from the initiating reducer.

## State change and signalling behavior

`dom-circuit` flattens internal state changes into a predicable output signal. If a terminal is attached to the circuit, the output signal sequence is guaranteed to be aligned with the order of internal state change. This guarantee holds through asynchronous operations.

```javascript
const terminal = (_, signal) => console.log(signal);
const cct = circuit(
  {
    state1: (acc) => ({...acc, state2: true}),
    state2: (acc) => Promise.resolve({...acc, state3: true}),
    state3: (acc) => ({ ...acc, done: true })),
  },
  terminal
)();

cct.state1(); // logs => '/state1', '/state2', '/state3'
```

## Key features appropriate to programmed Intentionality

This is an experimental API, many of the API design decisions lean towards
PI, especially around the ideas of iconic and indexical intentionality.
