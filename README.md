# dom-circuit

A little state machine for Javascript applications that live on the DOM.

`dom-circuit` is small utility function that weaves selected DOM elements into a declarative state machine that organizes complex application logic into predictable, intentional signal states.

The state machine acts like a live circuit connected to the DOM. Element events generate signals that drive state change through reducers that feed back into the circuit. Reduced signals propagate through the circuit until they arrive, fully reduced, at the circuit terminal.

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
import { update, remove, total, done } from './some/where/else.js';

const initialState = {}; // or pre-fill with todo data...

const todo = circuit({
  items: {
    add$change(acc, value) {
      this.signal('/items/update', value);
    },
    update$change: update,
    remove$click: remove,
  },
  'counts$/items': {
    total,
    done,
  },
})(initialState);
```

This little circuit captures the primary intent of a simple TODO application. It binds core intentional DOM elements to handlers that feed the circuit with user driven input signals. Two state change patterns are employed: firstly, a direct signal state change when the user `add`s a new item, and secondly; an XPath deferred event to signal the `counts` state whenever items state changes.

## Opinionated - intentional and small

The document object model is mature, powerful, highly efficient and pre-loaded into every modern browser. So why do we go out of our way to abstract over it when what we nearly always need is a bit of judicious scripting bound to selected elements? Perhaps its because the DOM doesn't really do application state management. Thats the responsibility of the application and its likely the root cause of all of this excessive abstraction.

`dom-circuit` is designed to work _with_ the DOM rather than abstract over it. If you need to update the DOM, use the DOM API. If you need to control _when_ to update it, use this little state machine.

## How it works

Circuits like the one above are constructed from `{signal: reducer}` and `{signal: circuit}` property types. Signal reducers like `add` use functional object methods with a standard reducer signature. Signal circuits like `items` build the overall circuit structure through composition: each nested circuit has its own state and terminal. Signals propagate through a circuit before bubbling up to and propagating through parent circuit state.

## Signals

Signals can resolve to elements, circuit identifiers, events or any combination of them all - but always in structured order:

`(alias:)? (selector)? ($event)? (_)?` where:

- alias - circuit identifier when signal is too noisy as in `'open:#x.open[arg=123]'`
- selector - one of
  - optimistic DOM selector as in `header` matches in precedence order: `'.header'`, `'#header'`, `header`
  - CSS DOM selector as in `'.classname > [arg]'`
  - Object property name as in `counts`
- event - `$` followed by one of
  - valid DOM eventListener as in `$click`
  - XPath selector as in `'$/root/path/to/signal/selector'` or `'$../../relative/path'`
  - `init` - initial state event as in `ABC$init`
  - `state` - terminal state change event as in `ABC: { $state }`
- _ (underscore) - bind map function to handler as in `{fn_: value => value + 1}`

Signals can be applied across circuit properties to facilitate multiple binding scenarios. This items cct has three signal states: two event signals and an internal update state:

```javascript
{
  items: { // binds to the element with `class="items"`
    $click: (items, event) =>  // which item was clicked in event.target...
    $scroll: (items, event) => // scrolling now...
    update: (items, value) => [...items, value]
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

## Propagation

Input signals, whether from bound DOM events or from internal state change events, pass through a reducer before propagating through the circuit.

Propagation only occurs when a state value change is detected.

```javascript
const cct = circuit({
  state1: (acc, value) => acc // no state change so no propagation
  state2: (acc, value) => {return;} // no state change, so force propagate signal only
  state3: (acc, value) => ({...acc, state3: value}) // propagate state change
  state4: (acc, value) => ({...acc, state4: value + 1}) // propagate state change
  value1_: (value) => value // no state change so no propagation
  value2_: (value) => {return;} // no state change, so force propagate signal only
})
```

## Reducers

Reducers follow the standard reducer argument pattern: `(acc, value) => ({...acc, value})`. The accumulated state passed into the reducer is the state of the immediate parent of the reducer property.

The state value returned by the reducer will propagate through the circuit, bubbling up until it hits the circuit terminal function - an optional `$state` signal handler:

```javascript
function terminal(state) => console.log(state, this.id);
const cct = circuit(
  {
    count: ({ count }, value) => ({ count: count + value }),
    $state: terminal
  }
)({
  count: 1,
});

cct.count(1); // logs the current state => {count: 2}, '/count'
```

### Map Reducers

When access to parent state is inappropriate, map reducer pattern can be substituted. The Map reducer follows the standard map argument pattern: `value => value` but the internal handler continues to reduce the mapped value into the parent state before propagating through the circuit.

Map reducers are registered by appending an underscore suffix to the signal selector:

```javascript
circuit({
  count_: (value) => value + 1,
});
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

## State change

Circuit state change can be actioned directly from within a reducer in several ways:

### Return a new state directly

```javascript
  header: {
    add: (state, value) => ({...state, add: value}),
  },
```

State change propagation will bubble up through the circuit until it reaches the circuit terminal

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

Circuit state will jump to the referenced circuit signal selector and propagate to terminal. The `signal` function returns the signalled state. In the example above, propagation is halted by returning undefined. Otherwise propagation would continue to terminal in the expected manner.

### Bind to deferred state change

This pattern uses a simplified XPath syntax to bind a state change event to another state value change.

```javascript
  header: {
    add: (state, value) => ({state, item: value}),
  },
  items: {
    '$/header/add': (items, {item}) => // reducer called with current items and item state
  }
```

State change propagation will be further reduced by deferred reducer(s) before bubbling up through the circuit until it reaches the circuit terminal. The deferred reducer will receive its own current state and the reduced state value from the initiating reducer.

## State change and signalling behavior

`dom-circuit` flattens internal state changes into a predicable output signal. If a terminal is attached to the circuit, the output signal sequence is guaranteed to be aligned with the order of internal state change. This guarantee holds through asynchronous operations.

```javascript
function terminal() => console.log(this.id);

const cct = circuit(
  {
    s1(acc) {
      return Promise.resolve({ ...acc, s1: true }).then(() => {
        console.log(this.id);
        return this.signal('/s2', true);
      });
    },
    s2(acc) {
      return Promise.resolve({ ...acc, s2: true }).then(() => {
        console.log(this.id);
        return this.signal('/s3', true);
      });
    },
    s3: (acc) => Promise.resolve({ ...acc, s3: true }),
  },
  { terminal }
);

cct.s1(); // logs => '/s1', '/s2', '/s3'
```

## Key features appropriate to PI (Programmed Intentionality)

This is an experimental API, many of the API design decisions lean towards PI. The declarative structure of the circuit supports and promotes the ideas of iconic, indexical and symbolic intentionality.

### Iconic intentionality

Iconic intentionality concerns the shape of an application. This isn't always the most appropriate conceptual tool to model a problem domain, but given all of the work and development around semantic representation its a pretty good fit for web sites and other structurally defined applications.

`dom-circuit`'s preference for declaratively mapping out the functional areas of an application as an extended hierarchy is iconic intentionality at play.

### Indexical intentionality

It almost goes without saying that when a user clicks a button and the application fires a requests and generates a response, that this often complex chain of events is intentional. Specifically this is a kind of indexical intentionality. For example, When a user interacts with a website by logging in, that user's intention is correlated with, ie indexically points to, the sequence of events that go on to generate the log-in response.

`dom-circuit` supports indexical intentionality through optimistic element binding and various state propagation patterns:

- Giving a signal a name that can bind a reducer to an element or elements by class, id or tag reduces the boilerplate required to wire up indexical intentions.
- Controlling state change propagation through dynamic signalling and static relationships separates the concerns of cooperating intentions.

### Symbolic intentionality

Symbolic intentionality (aka reentrancy) is all about agreement. Given an intentional stance, that is, a rational interpretation of an intentional action or behavior, then symbolic intentionality arises when the expected outcome of any such action or behavior meets agreement from multiple viewpoints.

Symbolic intentionality usually includes aspects of iconic and indexical intentionality, but it is more than the sum of these parts. The login sequence described above has both iconic and indexical intentionality. But it also has symbolic intentionality in the sense that a user understands the requirement and the consequence of the intention.

Programmatically, symbolic intentionality captures the relationship between two or more functional units operating on behalf of and towards a shared goal. It provides a mechanism of cooperation that both parts understand, but that allows them to remain completely independent.

`dom-circuit` supports symbolic intentionality through an experimental reentrancy pattern of circuit layers. In this pattern, each layer is an independent circuit, but is able to propagate state change across layer boundaries through xpath aligned signal selectors called junctions (see [short-circuit](https://github.com/philtoms/short-circuit) for more details).

So in summary, very much a work in progress.
