# dom-circuit

A little state machine for Javascript applications that live on the DOM.

`dom-circuit` is small utility function that weaves selected DOM elements into a declarative state machine that organizes complex application logic into predictable signal states.

The state machine acts like a live circuit connected to the DOM. Element events generate signals that drive state change through reducers that feed back into the circuit. Signals propagate through the circuit until they arrive, fully reduced, at the circuit terminal.

Given some Markup

```html
<body>
  <header><input placeholder="add" name="id"/></header>
  <main>
    <div class="items">
      <div class="item">
        <span class="title">
        <button class="remove">X</button>
        <input>
      </div>
    </div>
  </main>
  <footer>
    <div id="total"></div>
    <div id="done"></div>
  </footer>
</body>
```

`dom-circuit` binds selected elements to signal reducers that capture and respond to state change:

```javascript
import circuit from 'dom-circuit';
import { add, update, remove, total, done } from './some/where/else.js';

const todo = circuit({
  items: {
    add$change: add,
    update:$change: update,
    remove$click: remove,
  },
  'counts$/items': {
    total,
    done,
  },
})({});
```

## Opinionated - intentional and small

The document object model is mature, powerful, highly efficient and pre-loaded into every modern browser. So why do we go out of our way to abstract over it when what we nearly always need is a bit of judicious scripting bound to selected elements? Perhaps its because the DOM doesn't really do application state management. Thats the responsibility of the application and its likely the root cause of all of this excessive abstraction.

`dom-circuit` is designed to work _with_ the DOM rather than abstract over it. Weighing in at less than 1.5K minified unzipped, it packs a lot of functionality. But its only concerned with state management. If you need to update the DOM, use the DOM API, but if you need to control _when_ to update it, use this little state machine.

## How it works

Circuits like the one above are constructed from `{signal: reducer}` and `{signal: circuit}` property types.

### Signals

Signals can resolve to elements, circuit identifiers, events or any combination of them all - but always in structured order:

`(alias:)? (selector)? ($event)?` where:

- alias - circuit identifier when signal is too noisy as in `'open:#x.open[arg=123]'`
- selector - one of
  - optimistic DOM selector as in `header` matches in precedence order: `'.header'`, `'#header'`, `header`
  - CSS DOM selector as in `'.classname > [arg]'`
  - XPath selector as in `'/root/path/to/circuit/identifier'`
- event - `$` followed by one of
  - valid DOM eventListener as in `$click`
  - `init` - initial state event as in `ABC$init`
  - `state` - state change event as in `ABC: { $state }`

Signals can be applied across circuit properties to facilitate multiple binding scenarios:

```
{
  items: { // binds to the element with `class="items"`
    $click: (items, event) =>  // which item was clicked in event.target...
    $scroll: (items, event) => // scrolling now...
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

### Reducers

Reducers follow the standard reducer argument pattern: `(state, value) => ({...state, value})`. The state passed into the reducer is the state of the immediate parent of the reducer property, **not** the state of the circuit (unless the reducer is at the top level of the circuit).

The value returned by the reducer will propagate through the circuit, bubbling up until it hits the circuit terminal function - an optional function that receives the changed circuit state as a `(state, signal)` pair:

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

### Reducer context

Reducer functions are called with _this_ context:

```javascript
const cct = circuit(
  {items: {
    '.item'(items, item) => {
      console.log(items, item, this) // =>
      // [1, 2, 3]
      // 2,
      // {
      //  el - current element bound to signal
      //  id - current signal id '/items/item
      // signal an internal state change...
      return this.signal('../items')
    }
  }},
)({
  items: [1,2,3],
});
```

### State change

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

State change propagation will bubble up through the circuit until it reaches the circuit terminal before it passes through to sibling state. An attached terminal will be activated for each discrete state change.

### Signal a new state

```javascript
  header: {
    add: (state, value) => {
      this.signal('/items/update',value)
      return // no return value: prevent bubbling
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
    '$/header/add': (items, {latest}) => // reducer called with current items and latest update value
  }
```

State change propagation will be further reduced by deferred reducer(s) before bubbling up through the circuit until it reaches the circuit terminal. The deferred reducer will receive its own current state and the reduced state value from the initiating reducer.

## State change and signalling behavior

`dom-circuit` flattens internal state changes into a predicable output signal. If a terminal is attached to the circuit, the output signal sequence is guaranteed to be aligned with the order of internal state change. This guarantee holds through asynchronous operations.

```javascript
function terminal() => console.log(this.signal);

const cct = circuit(
  {
    s1: (acc) => Promise.resolve({ ...acc, s1: true, s2: false }),
    s2: (acc) => Promise.resolve({ ...acc, s2: true, s3: false }),
    s3: (acc) => Promise.resolve({ ...acc, s3: true }),
  },
  terminal
)();

cct.s1(); // logs => '/s1', '/s2', '/s3'
```

## Key features appropriate to PI (Programmed Intentionality)

This is an experimental API, many of the API design decisions lean towards PI, especially around the ideas of iconic and indexical intentionality.

### Iconic intentionality

Iconic intentionality concerns the shape of an application. This isn't always the most appropriate conceptual tool to model a problem domain, but given all of the work and development around semantic representation its a pretty good fit for web sites and other structurally defined applications.

`dom-circuit`'s preference for declaratively mapping out the functional areas of an application as an extended hierarchy is iconic intentionality at work.

### Indexical intentionality

It almost goes without saying that when a user clicks a button and the application fires a requests and presents a response, that this often complex chain of events is intentional. Specifically this is a kind of indexical intentionality. When a user decides to register with the group and clicks on the `Register` button, that user's intention is correlated with, ie indexically points to, the sequence of events that go on to generate the response.

`dom-circuit` supports indexical intentionality through optimistic element binding and various state propagation patterns:

- Giving a signal a name that can bind a reducer to an element or elements by class, id or tag reduces the boilerplate required to wire up indexical intentions.
- Controlling state change propagation through dynamic signalling and static relationships separates the concerns of cooperating intentions.
