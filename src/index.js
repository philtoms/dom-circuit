const _REDUCERS = Symbol('_REDUCERS');
const _BASE = Symbol('_BASE');
const _PROPAGATE = Symbol('_PROPAGATE');
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

const document = globalThis.document;
const optimisticQuery = (e, s) => {
  const nl =
    [
      (/[#\.]/.test(s[0]) ? [''] : ['.', '#', '']).reduce(
        (acc, q) => (acc.length ? acc : e.querySelectorAll(q + s)),
        []
      ),
    ].find((nl) => nl.length) || document.querySelectorAll(s);
  return nl.length ? nl : [e];
};

const build = (signals, terminal, base, ctx = {}) => (
  state = {},
  parent = { id: '', state: () => state, element: [document] },
  deferredSignals = [],
  handlers = []
) => {
  const propagate = (signalState, address, deferredHandlers, signal, local) => {
    // bale until fulfilled
    if (signalState instanceof Promise) {
      signalState.then((s) => {
        return propagate(s, address, false, signal, local);
      });
      return state;
    }
    // halt propagation when signal is unchanged
    if (
      signalState === state ||
      (address in signalState && signalState[address] === state[address])
    )
      return signalState;

    const deferred = deferredHandlers === handlers;
    // reduce signal state into local circuit state.

    const lastState = state;
    // defer bubbling for locally propagated signals
    if (local)
      state = handlers.reduce(
        (acc, [, handler, deferring]) =>
          (!deferring && handler(signalState[address], handlers, acc)) || acc,
        state
      );
    else {
      state = signalState;
      if (!deferred)
        state = handlers.reduce(
          (acc, [key, handler, deferring]) =>
            deferring && signal.startsWith(key)
              ? handler(acc[address] || acc, handlers) && state
              : (!key && handler(undefined, handlers, acc)) || acc,
          state
        );
    }

    if (terminal && !deferred)
      terminal(state, signal, !!address, deferredHandlers);

    return state;
  };

  const wire = (acc, [signal, reducer, deferred]) => {
    const [, , alias, , _se] = signal.match(/(([\w]+):)?(\s*(.+))?/);
    const [selector, event = ''] = _se.split('$');

    if (deferred) {
      const [resolvedReducers] = fromSignal(acc, event.split('/'));
      resolvedReducers.push([event.replace(/\./g, ''), reducer, true]);
      return acc;
    }

    const element = []
      .concat(parent.element)
      .reduce(
        (acc, el) => [
          ...acc,
          ...(el && selector ? optimisticQuery(el, selector) : [el]),
        ],
        []
      );

    const deferring = event.startsWith('/') || event.startsWith('.');
    const hasChildren = typeof reducer !== 'function';
    const isCircuit =
      hasChildren && Object.keys(reducer).some((key) => !key.startsWith('$'));

    // normalise the signal address for state
    const address = selector.replace(/[#\.\-\[\]\(\)\"\=\^\&]/g, '');
    const id = (address || event
      ? `${parent.id}/${address || event}`
      : parent.id || '/'
    ).replace('//', '/');
    if (address && typeof state === 'object' && !(address in state))
      state[address] = hasChildren ? {} : undefined;

    // a signal can be handled directly or passed through to a child circuit
    const children = hasChildren
      ? build(
          reducer,
          (value, id, prop, deferred) =>
            (state = propagate(
              prop ? { ...state, [address]: value } : value,
              address,
              deferred,
              id
            )),
          acc
        )(
          state[address] || state,
          { id, address, state: () => state, element },
          deferredSignals
        )
      : {};

    const self = {
      id,
      address,
      signal: (id, value) => fromSignal(acc, id.split('/'))[1](value),
      el: element.length <= 1 ? element[0] : element,
    };

    const proxy = new Proxy(self, {
      get: (_, prop) => (prop in ctx ? ctx[prop] : self[prop]),
      set: (_, prop, value) => {
        ctx[prop] = value;
        return true;
      },
    });

    if (event === 'init') {
      const iState = reducer.call(proxy, address ? state : parent.state());
      if (!address) {
        if (iState !== undefined) {
          state = iState;
          if (terminal) terminal(state, id);
        }
        return acc;
      }
      if (iState) state[address] = iState[address];
    }

    const handler = function (
      value,
      deferred,
      acc = address ? state : parent.state()
    ) {
      const key = address || parent.address;
      if (value === void 0) value = acc[key];
      return (hasChildren ? children[_PROPAGATE] : propagate)(
        hasChildren
          ? { ...acc, [key]: value }
          : element.reduce((acc, el) => {
              self.el = el;
              return reducer.call(proxy, acc, value) || acc;
            }, acc),
        hasChildren && !isCircuit ? '' : address,
        deferred,
        id,
        isCircuit
      );
    };

    if ((!deferring && !event) || event === 'state')
      handlers.push([address, handler]);

    if (deferring) {
      deferredSignals.push([signal, handler, true]);
    }
    // transfer local cct to handler
    Object.entries(children).forEach(([key, value]) => (handler[key] = value));
    handler[_REDUCERS] = children[_REDUCERS];
    handler[_BASE] = children[_BASE];

    acc[alias || address || event] = handler;

    // bind element events to handler
    if (event && !deferring && event !== 'state') {
      element.forEach((el) => el && el.addEventListener(event, handler));
    }

    return acc;
  };

  const circuit = Object.entries(signals).reduce(wire, {
    [_REDUCERS]: handlers,
    [_BASE]: base,
    [_PROPAGATE]: propagate,
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
