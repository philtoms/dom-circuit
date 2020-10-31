const _REDUCERS = Symbol('_REDUCERS');
const _BASE = Symbol('_BASE');

const fromSignal = (circuit = {}, [head, ...tail]) => {
  if (head === '.') return fromSignal(circuit, tail);
  if (head === '..') return fromSignal(circuit[_BASE], tail);
  if (!head)
    return circuit[_BASE]
      ? fromSignal(circuit[_BASE], [head, ...tail])
      : fromSignal(circuit, tail);
  return tail.length
    ? fromSignal(circuit[head], tail)
    : [circuit[_REDUCERS], circuit[head]];
};

const document = typeof window !== 'undefined' && window.document;
const optimisticQuery = (e, s) =>
  ['.', '#', ''].reduce(
    (acc, q) => (acc.length ? acc : e.querySelectorAll(q + s)),
    []
  );

const build = (signals, terminal, base) => (
  state = {},
  element,
  parent = { id: '', state: () => state },
  reducers = [],
  deferredSignals = []
) => {
  const propagate = (signalState, address, deferred, signal, event) => {
    // bale until fulfilled
    if (signalState instanceof Promise) {
      signalState.then((s) => {
        return propagate(s, address, deferred, signal);
      });
      return state;
    }
    // halt propagation when signal is unchanged
    if (address in signalState && signalState[address] === state[address])
      return signalState;

    // bubble this signal before siblings
    if (terminal)
      event && event !== 'state'
        ? terminal(undefined, signal, deferred, signalState)
        : terminal(signalState, signal, deferred);

    // reduce signal state into local circuit state.
    const lastState = state;
    state = signalState;
    return deferred || !address
      ? state
      : reducers.reduce(
          (acc, [key, handler, deferred]) =>
            deferred
              ? handler(acc[address], true) && state
              : key !== address && acc[key] !== lastState[key]
              ? handler(acc[key])
              : (!key && handler(undefined, deferred, acc)) || acc,
          state
        );
  };

  const wire = (acc, [signal, reducer, deferredReducers]) => {
    const [, , alias, , _se] = signal.match(/(([\w]+):)?(\s*(.+))?/);
    const [selector, event = ''] = _se.split('$');
    const localCircuit = typeof reducer !== 'function';
    const deferredEvent = event.startsWith('/') || event.startsWith('.');
    let [resolvedReducers] =
      (deferredEvent && fromSignal(acc, event.split('/'))) || [];
    const deferring = !deferredReducers && deferredEvent;
    if (deferring) {
      if (localCircuit) {
        resolvedReducers = [];
        deferredSignals.push([signal, reducer, resolvedReducers]);
      }
    } else if (resolvedReducers) {
      deferredReducers.forEach(([s, r]) => resolvedReducers.push([s, r, true]));
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
    const address = selector.replace(/[#\.\-\[\]\(\)\"\=\^\&]/g, '');
    const id = address ? `${parent.id}/${address}` : parent.id || '/';
    if (address && typeof state === 'object' && !(address in state))
      state[address] = localCircuit ? {} : undefined;

    // a signal can be handled directly or passed through to a child circuit
    const children =
      (localCircuit &&
        build(
          reducer,
          (value, id, deferred, acc = state) =>
            propagate(
              value ? { ...acc, [address]: value } : acc,
              address,
              deferred,
              id
            ),
          acc
        )(
          state[address],
          elements,
          { id, address, state: () => state },
          resolvedReducers || [],
          deferredSignals,
          deferring
        )) ||
      {};

    const self = {
      id,
      address,
      signal: (id, value) => fromSignal(acc, id.split('/'))[1](value),
    };

    if (event === 'init') {
      const iState = reducer.call(self, address ? state : parent.state());
      if (!address) {
        state = iState;
        if (terminal) terminal(undefined, id, true, state);
        return acc;
      }
      state[address] = iState[address];
    }

    const handler = function (
      value,
      deferred,
      acc = address ? state : parent.state()
    ) {
      if (typeof value === 'undefined') value = acc[address];
      self.el = this;
      return propagate(
        localCircuit
          ? { ...acc, [address]: value }
          : this || !elements.length
          ? reducer.call(self, acc, value) || state
          : elements.reduce(
              (acc, el) => reducer.call({ ...self, el }, acc, value) || state,
              acc
            ),
        address,
        deferred,
        id,
        !address && event
      );
    };

    // bind element events to handler. Handler context (this) will be element
    if (event && !deferredEvent && event !== 'state') {
      elements.forEach((element) => {
        element.addEventListener(event, handler);
      });
    }

    if (!address || !event || deferring)
      reducers.push([address, handler, deferring]);

    // transfer local cct to handler
    Object.entries(children).forEach(([key, value]) => (handler[key] = value));
    handler[_REDUCERS] = children[_REDUCERS];
    handler[_BASE] = children[_BASE];

    acc[alias || address] = handler;

    return acc;
  };

  const circuit = Object.entries(signals).reduce(wire, {
    [_REDUCERS]: reducers,
    [_BASE]: base,
  });

  return parent.id
    ? circuit
    : Object.defineProperty(deferredSignals.reduce(wire, circuit), 'state', {
        get() {
          return state;
        },
      });
};

export default build;
