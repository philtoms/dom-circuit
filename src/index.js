const _REDUCERS = Symbol();
const document = typeof window !== 'undefined' && window.document;
const fromRoot = (circuit, [head, ...tail]) =>
  tail.length
    ? fromRoot(circuit[head], tail)
    : circuit[head] && circuit[head][_REDUCERS];

export const _CURRENT = Symbol();

const optimisticQuery = (e, s) =>
  ['.', '#', ''].reduce(
    (acc, q) => (acc.length ? acc : e.querySelectorAll(q + s)),
    []
  );

const DOMcircuit = (blueprint, terminal, element) => (
  state = {},
  stateId = '',
  parentState,
  parentAddress,
  reducers = [],
  deferred = [],
  deferredChild
) => {
  if (!element && typeof terminal !== 'function') {
    element = terminal || [];
    terminal = false;
  }
  const propagate = function (signalState, signal, deferred, id) {
    // halt propagation when signal is empty or unchanged
    if (
      signalState === undefined ||
      (signal in state && signalState[signal] === state[signal])
    )
      return state;
    deferred
      ? terminal((state = signalState), id)
      : (state =
          // reduce signal state into circuit state.
          reducers.reduce(
            (acc, [address, reducer, deferred]) =>
              // deferred children handle their own state chains and will always
              // be propagated after local state has reduced
              deferred
                ? reducer.call(this, acc) && acc
                : // signal identity check to filter signalled state change
                address in state && signalState[address] === state[address]
                ? acc
                : address === signal
                ? signalState
                : address in signalState
                ? reducer.call(this, acc, signalState[address])
                : acc,
            state
          ));

    state = blueprint['@state']
      ? blueprint['@state'](state, signalState)
      : state;
    return terminal ? terminal(state, id) : state;
  };

  const build = (acc, [signal, reducer, deferredReducers]) => {
    const [, , alias, , _se] = signal.match(/(([\w]+):)?(\s*(.+))?/);
    const [selector, event = ''] = _se.split('@');
    if (event === 'init') {
      state = reducer(state);
      parentState[parentAddress] = state;
      return acc;
    }

    let deferReducers =
      event.startsWith('/') && fromRoot(acc, event.slice(1).split('/'));
    const deferring = !deferredReducers && event.startsWith('/');
    if (deferring) {
      deferReducers = [];
      deferred.push([signal, reducer, deferReducers]);
    } else if (deferReducers) {
      deferredReducers.forEach((reducer) => deferReducers.push(reducer));
      return acc;
    }
    // optionally query on parent element(s) unless selector is event
    const elements = !selector
      ? element
      : []
          .concat(element || document)
          .reduce(
            (circuit, element) => [
              ...circuit,
              ...Array.from(optimisticQuery(element, selector)),
            ],
            []
          );

    // normalise the signal address for state
    const address =
      (elements.length && alias) ||
      selector.replace(/[#\.\-\[\]\(\)\"\=\^\&]/g, '');
    const id = `${stateId}/${address}`;

    // a signal can be handled directly or passed through to a child circuit
    const children =
      typeof reducer !== 'function' &&
      DOMcircuit(
        reducer,
        (value, id) =>
          propagate({ ...state, [address]: value }, address, false, id),
        elements
      )(
        state[address],
        id,
        state,
        address,
        deferReducers || [],
        deferred,
        deferring
      );

    function handler(value) {
      return propagate.call(
        this,
        children
          ? value
          : reducer.call(
              this,
              state,
              value === _CURRENT ? state[address] : value
            ),
        address,
        deferredChild,
        id
      );
    }

    reducers.push([address, children ? terminal : handler, deferredChild]);

    // bind element events to handler. Handler context (this) will be element
    if (event && !event.startsWith('/') && event !== 'state') {
      elements.forEach((element) => {
        element.addEventListener(event, handler);
      });
    }

    acc[alias || address] = (value) => handler(value)[address];
    return children
      ? Object.defineProperty(acc, address, {
          get() {
            return children;
          },
        })
      : acc;
  };

  const circuit = Object.entries(blueprint).reduce(build, {
    [_REDUCERS]: reducers,
  });

  return stateId
    ? circuit
    : Object.defineProperty(deferred.reduce(build, circuit), 'state', {
        get() {
          return state;
        },
      });
};

export default DOMcircuit;
