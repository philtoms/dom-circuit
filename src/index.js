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

const DOMcircuit = (circuit, terminal, element) => (
  state = {},
  parent = { id: '' },
  reducers = [],
  deferred = [],
  deferredChild
) => {
  if (!element && typeof terminal !== 'function') {
    element = terminal || [];
    terminal = false;
  }
  const propagate = (signalState, signal, deferred, id) => {
    // halt propagation when signal is empty or unchanged
    if (
      !signalState ||
      (signal in signalState && signalState[signal] === state[signal])
    )
      return state;

    const nextState = deferred
      ? signalState
      : // reduce signal state into circuit state.
        reducers.reduce((acc, [address, handler, deferred]) => {
          // deferred children handle their own state chains and will always
          // be propagated after local state has been reduced
          acc = deferred
            ? handler(acc) && state
            : address in signalState
            ? signalState[address] === acc[address]
              ? acc
              : address === signal
              ? { ...acc, [address]: signalState[signal] }
              : handler(signalState[address])
            : signalState;
          if (!(acc instanceof Promise)) state = acc;
          return acc;
        }, state);

    // bale until fulfilled
    if (nextState instanceof Promise) {
      nextState.then((s) => {
        return propagate(s, signal, false, id);
      });
      return state;
    }

    state = circuit['@state']
      ? circuit['@state'](nextState, signalState[signal])
      : nextState;

    return terminal ? terminal(state, id) || state : state;
  };

  const build = (acc, [signal, reducer, deferredReducers]) => {
    const [, , alias, , _se] = signal.match(/(([\w]+):)?(\s*(.+))?/);
    const [selector, event = ''] = _se.split('@');
    if (event === 'init') {
      state = reducer(state[parent.address]);
      parent.state[parent.address] = state;
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
    const elements = element
      ? !selector
        ? element
        : []
            .concat(element || document)
            .reduce(
              (circuit, element) => [
                ...circuit,
                ...Array.from(optimisticQuery(element, selector)),
              ],
              []
            )
      : [];

    // normalise the signal address for state
    const address =
      (elements.length && alias) ||
      selector.replace(/[#\.\-\[\]\(\)\"\=\^\&]/g, '');
    const id = `${parent.id}/${address}`;

    // a signal can be handled directly or passed through to a child circuit
    const children =
      typeof reducer !== 'function' &&
      DOMcircuit(
        reducer,
        (value, id) =>
          propagate(
            id.endsWith('/') ? value : { ...state, [address]: value },
            address,
            false,
            id
          ),
        elements
      )(
        typeof state[address] === 'object' ? state[address] : state,
        { id, state, address },
        deferReducers || [],
        deferred,
        deferring
      );

    const handler = function (value) {
      if (value === _CURRENT) value = state[address];
      const signal = address || parent.address;
      return propagate(
        children
          ? value
          : this || !elements.length
          ? reducer.call({ signal, element: this }, state, value)
          : elements.reduce(
              (acc, element) => reducer.call({ signal, element }, acc, value),
              state
            ),
        address || parent.address,
        deferredChild,
        id
      );
    };

    // bind element events to handler. Handler context (this) will be element
    if (event && !event.startsWith('/') && event !== 'state') {
      elements.forEach((element) => {
        element.addEventListener(event, handler);
      });
    }

    reducers.push([
      address || parent.address,
      children ? terminal : handler,
      deferredChild,
    ]);

    acc[alias || address] = (value) => handler(value)[address];
    return children
      ? Object.defineProperty(acc, address, {
          get() {
            return children;
          },
        })
      : acc;
  };

  const signals = Object.entries(circuit).reduce(build, {
    [_REDUCERS]: reducers,
  });

  return parent.id
    ? signals
    : Object.defineProperty(deferred.reduce(build, signals), 'state', {
        get() {
          return state;
        },
      });
};

export default DOMcircuit;
