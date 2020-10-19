const _REDUCERS = Symbol('_REDUCERS');
const _ID = Symbol('_ID');
const fromRoot = (circuit, [head, ...tail]) =>
  tail.length
    ? fromRoot(circuit[head], tail)
    : typeof circuit[head] === 'object'
    ? [circuit[head][_REDUCERS], false]
    : [circuit[_REDUCERS], _ID];
const document = typeof window !== 'undefined' && window.document;

export const _CURRENT = Symbol();

const optimisticQuery = (e, s) =>
  ['.', '#', ''].reduce(
    (acc, q) => (acc.length ? acc : e.querySelectorAll(q + s)),
    []
  );

const DOMcircuit = (circuit, terminal, element, _base) => (
  state = {},
  base = () => _base,
  parent = { id: '' },
  reducers = [],
  deferredSignals = [],
  deferredSignal
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
    if (deferred === _ID) return signalState;

    const lastState = state;
    const nextState = deferred
      ? signalState
      : // reduce signal state into circuit state.
        reducers.reduce((acc, [address, handler, deferred, shared]) => {
          acc = shared
            ? { ...acc, ...handler(acc[signal], _ID, acc) }
            : // deferred children handle their own state chains and will
            // always be propagated after local state has been reduced
            deferred
            ? handler
              ? handler(deferred === _ID ? acc[signal] : acc, true) && state
              : acc
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

    state = circuit['$state']
      ? circuit['$state'](lastState, nextState)
      : nextState;

    return terminal ? terminal(state, id) || state : state;
  };

  const build = (acc, [signal, reducer, deferredReducers]) => {
    const [, , alias, , _se] = signal.match(/(([\w]+):)?(\s*(.+))?/);
    const [selector, event = ''] = _se.split('$');
    if (event === 'init') {
      state = reducer(state[parent.address]);
      parent.state[parent.address] = state;
      return acc;
    }

    let [resolvedReducers, deferredId] =
      (event.startsWith('/') && fromRoot(acc, event.slice(1).split('/'))) || [];
    const deferring = !deferredReducers && event.startsWith('/');
    if (deferring) {
      if (typeof reducer !== 'function') {
        resolvedReducers = [];
        deferredSignals.push([signal, reducer, resolvedReducers]);
      }
    } else if (resolvedReducers) {
      deferredReducers.forEach(([s, r]) =>
        resolvedReducers.push([
          s,
          r,
          deferredId || true,
          resolvedReducers === reducers,
        ])
      );
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
        base,
        { id, state, address },
        resolvedReducers || [],
        deferredSignals,
        deferring
      );

    const handler = function (value, deferredId, acc = state) {
      if (value === _CURRENT) value = acc[address];
      const cct = base();
      cct.signal = id;
      cct.el = this;
      return propagate(
        children
          ? value
          : this || !elements.length
          ? reducer.call(cct, acc, value)
          : elements.reduce(
              (acc, element) => reducer.call({ signal, element }, acc, value),
              acc
            ),
        address || parent.address,
        deferredId || deferredSignal,
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
      !children && deferring && deferredId,
      !children && deferring && resolvedReducers === reducers,
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

  return (_base = parent.id
    ? signals
    : Object.defineProperty(deferredSignals.reduce(build, signals), 'state', {
        get() {
          return state;
        },
      }));
};

export default DOMcircuit;
