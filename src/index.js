const _REDUCERS = Symbol('_REDUCERS');
const _ID = Symbol('_ID');
const fromRoot = (circuit, [head, ...tail]) =>
  tail.length
    ? fromRoot(circuit[head], tail)
    : typeof circuit[head] === 'object'
    ? [circuit[head][_REDUCERS], false, circuit[head]]
    : [circuit[_REDUCERS], _ID, circuit[head]];

export const _CURRENT = Symbol();

const document = typeof window !== 'undefined' && window.document;
const optimisticQuery = (e, s) =>
  ['.', '#', ''].reduce(
    (acc, q) => (acc.length ? acc : e.querySelectorAll(q + s)),
    []
  );

const build = (signals, terminal, _base) => (
  state = {},
  element,
  base = () => _base,
  parent = { id: '' },
  reducers = [],
  deferredSignals = [],
  deferredSignal
) => {
  const propagate = (signalState, id, deferred, signal) => {
    // halt propagation when signal is empty or unchanged
    if (deferred) {
      if (deferred === _ID || signalState === state) return signalState;
    } else if (
      !signalState ||
      (id in signalState && signalState[id] === state[id])
    )
      return state;

    const nextState = deferred
      ? signalState
      : // reduce signal state into circuit state.
        reducers.reduce((acc, [address, event, handler, deferred, shared]) => {
          acc =
            event && address !== id
              ? acc
              : shared
              ? { ...acc, ...handler(acc[id], _ID, acc) }
              : // deferred children handle their own state chains and will
              // always be propagated after local state has been reduced
              deferred
              ? handler
                ? handler(deferred === _ID ? acc[id] : acc, true) && state
                : acc
              : address in signalState
              ? signalState[address] === acc[address]
                ? acc
                : address === id
                ? { ...acc, [address]: signalState[id] }
                : handler(signalState[address])
              : signalState;
          if (!(acc instanceof Promise)) state = acc;
          return acc;
        }, state);

    // bale until fulfilled
    if (nextState instanceof Promise) {
      nextState.then((s) => {
        return propagate(s, id, false, signal);
      });
      return state;
    }

    state = signals['$state']
      ? signals['$state'](nextState, signal)
      : nextState;

    return terminal ? terminal(state, signal) || state : state;
  };

  const wire = (acc, [signal, reducer, deferredReducers]) => {
    const [, , alias, , _se] = signal.match(/(([\w]+):)?(\s*(.+))?/);
    const [selector, event = ''] = _se.split('$');

    let [resolvedReducers, deferredId] =
      (event.startsWith('/') && fromRoot(acc, event.slice(1).split('/'))) || [];
    const deferring = !deferredReducers && event.startsWith('/');
    if (deferring) {
      if (typeof reducer !== 'function') {
        resolvedReducers = [];
        deferredSignals.push([signal, reducer, resolvedReducers]);
      }
    } else if (resolvedReducers) {
      deferredReducers.forEach(([s, e, r]) =>
        resolvedReducers.push([
          s,
          e,
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
              (signals, element) => [
                ...signals,
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
    const self = {
      id,
      signal: (id, value) => fromRoot(base(), id.slice(1).split('/'))[2](value),
    };

    // a signal can be handled directly or passed through to a child circuit
    const children =
      typeof reducer !== 'function' &&
      build(reducer, (value, id, acc = state, deferred) =>
        propagate(
          value === _CURRENT ? acc : { ...acc, [address]: value },
          address,
          deferred,
          id
        )
      )(
        state[address],
        elements,
        base,
        { id, state, address },
        resolvedReducers || [],
        deferredSignals,
        deferring
      );

    if (event === 'init') {
      const iState = reducer.call(
        self,
        address ? state : parent.state || state
      );
      if (!address) {
        state = iState;
        if (terminal) terminal(_CURRENT, id, state, true);
        return acc;
      }
      state[address] = iState[address];
    }

    const handler = function (value, deferredId, acc = state) {
      if (value === _CURRENT) value = acc[address];
      self.el = this;
      return propagate(
        children
          ? value
          : this || !elements.length
          ? reducer.call(self, acc, value)
          : elements.reduce(
              (acc, el) => reducer.call({ ...self, el }, acc, value),
              acc
            ),
        address || parent.address,
        deferredId || deferredSignal || !selector,
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
      event && !deferring,
      children ? terminal : handler,
      !children && deferring && deferredId,
      !children && deferring && resolvedReducers === reducers,
    ]);

    acc[alias || address] = (value) => handler(value) && state;
    return children
      ? Object.defineProperty(acc, address, {
          get() {
            return children;
          },
        })
      : acc;
    // const prop = (value) => handler(value) && state;
    // Object.entries(children || {}).forEach(
    //   ([key, value]) => (prop[key] = value)
    // );
    // return Object.defineProperty(acc, alias || address, {
    //   enumerable: true,
    //   value: prop,
    // });
  };

  const circuit = Object.entries(signals).reduce(wire, {
    [_REDUCERS]: reducers,
  });

  return (_base = parent.id
    ? circuit
    : Object.defineProperty(deferredSignals.reduce(wire, circuit), 'state', {
        enumerable: false,
        get() {
          return state;
        },
      }));
};

export default build;
