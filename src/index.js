const _REDUCERS = Symbol('_REDUCERS');
const _BASE = Symbol('_BASE');
const _PROPAGATE = Symbol('_PROPAGATE');

const build = (signals, config = {}) => {
  const {
    base,
    parent = { id: '', state: () => state },
    deferredSignals = [],
    handlers = [],
    junctions = {},
    ctx = {},
    terminal,
  } = config;
  let { state = {} } = config;

  const fromSignal = (circuit = {}, [head, ...tail]) =>
    !head
      ? circuit[_BASE]
        ? fromSignal(circuit[_BASE], [head, ...tail])
        : fromSignal(circuit, tail)
      : head[0] === '.'
      ? fromSignal(head === '..' ? circuit[_BASE] : circuit, tail)
      : junctions[head]
      ? fromSignal(junctions[head], tail)
      : tail.length
      ? fromSignal(circuit[head], tail)
      : [circuit[_REDUCERS], circuit[head]];

  const propagate = (signalState, deferred, address, signal, local) => {
    // cancel propagation?
    if (signalState === void 0) return state;

    // bale until fulfilled
    if (signalState instanceof Promise) {
      signalState.then((state) => {
        return propagate(state, false, address, signal, local);
      });
      return state;
    }

    // defer bubbling for locally propagated signals
    const bubble = deferred !== handlers;

    if (local)
      state = handlers.reduce(
        (acc, [, handler, deferring]) =>
          (!deferring &&
            handler(signalState[address], handlers, signal, acc)) ||
          acc,
        state
      );
    else {
      state = signalState;
      const id = [parent.id, address].join('/');
      if (bubble)
        state = handlers.reduce(
          (acc, [key, handler, deferring]) =>
            deferring && key && (signal.startsWith(key) || id.startsWith(key))
              ? (handler(
                  acc[address] === undefined ? acc : acc[address],
                  handlers,
                  signal
                ),
                state)
              : (!key &&
                  deferred !== 'state' &&
                  handler(undefined, handlers, signal, acc)) ||
                acc,
          state
        );
    }

    const junction =
      !deferred &&
      handlers.find(([key, , , layered]) => key === address && layered);

    if (terminal && bubble)
      terminal(state, signal, !!junction || deferred, !!address);

    if (junction) junction[1](undefined, true, signal, state);

    return state;
  };

  const wire = (acc, [signal, reducer, deferred]) => {
    const [, , alias, , _se, asMap] = signal.match(
      /(([\w]+):)?(\s*([^_]+))?(_)?/
    );
    const [selector, event = ''] = _se.split('$');
    const deferring = /^[\/\.]/.test(event);
    const signals = typeof reducer !== 'function' && reducer;
    const isCircuit =
      signals && Object.keys(signals).some((key) => !key.startsWith('$'));

    if (deferred) {
      const [resolvedReducers] = fromSignal(acc, deferred.split('/'));
      resolvedReducers.push([deferred.replace(/\./g, ''), reducer, handlers]);
      return acc;
    }

    const element = []
      .concat(config.mount || [document])
      .reduce(
        (acc, el) => [
          ...acc,
          ...(el && selector ? optimisticQuery(el, selector) : [el]),
        ],
        []
      );

    // normalise the signal address for state
    const address = selector.replace(/[#\.\-\[\]\(\)\"\=\^\&]/g, '');
    const id =
      address || event ? `${parent.id}/${address || event}` : parent.id || '/';

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

    // a signal can be handled directly or passed through to a child circuit
    const children = signals
      ? build(signals, {
          terminal: (value, signal, deferred, prop) =>
            propagate(
              prop ? { ...state, [address]: value } : value,
              deferred,
              address,
              signal || id
            ),
          base: acc,
          junctions,
          layer: config.layer,
          state: state[address],
          parent: { id, address, state: () => state, isCircuit },
          deferredSignals,
          mount: element,
        })
      : {};

    if (event === 'init') {
      const signalState = reducer.call(proxy, state);
      if (signalState instanceof Promise) {
        signalState.then((signalState) => {
          if (signalState != void 0) {
            state = signalState;
            if (terminal) terminal(state, id, 'state', true);
          }
        });
      } else if (signalState != void 0) {
        state = signalState;
        if (terminal) terminal(state, id, 'state', true);
      }
      return acc;
    }

    const mapValue = (key, value) => {
      const newValue = reducer.call(proxy, value);
      return newValue === undefined
        ? undefined
        : newValue === value
        ? state
        : {
            ...state,
            [key]: newValue,
          };
    };

    const handler = function (
      value,
      deferred,
      signal,
      acc = address ? state : parent.state()
    ) {
      const hasValue = value !== void 0;
      const key = address || parent.address;
      if (!hasValue) value = acc[key];
      // circuit handler called for child propagation
      return hasValue && value === acc[address]
        ? state
        : (signals ? children[_PROPAGATE] : propagate)(
            signals
              ? { ...acc, [key]: value }
              : element.reduce((acc, el) => {
                  self.el = el;
                  return asMap
                    ? mapValue(key, value)
                    : reducer.call(proxy, acc, value);
                }, acc),
            deferred,
            signals && !isCircuit ? '' : address,
            signal || id,
            isCircuit || (!address && parent.isCircuit && event !== 'state')
          );
    };

    if ((!deferring && !event) || event === 'state') {
      handlers.push([address, handler]);
      const [layer, junction] = fromSignal(junctions.root, id.split('/'));
      if (typeof junction === 'function') {
        handlers.push([address, junction, layer, true]);
        layer.push([address, handler, handlers, true]);
      }
    }

    if (deferring) {
      deferredSignals.push([signal, handler, event]);
    }

    // transfer local cct to handler
    Object.entries(children).forEach(([key, value]) => (handler[key] = value));
    handler[_REDUCERS] = children[_REDUCERS];
    handler[_BASE] = children[_BASE];

    if (event !== 'state') acc[alias || address || event] = handler;

    // bind element events to handler
    if (event && !deferring && event !== 'state') {
      element.forEach((el) => el && el.addEventListener(event, handler));
    }
    junctions[config.layer || 'root'] = acc;
    return acc;
  };

  const circuit = Object.entries(signals).reduce(wire, {
    [_REDUCERS]: handlers,
    [_BASE]: base,
    [_PROPAGATE]: propagate,
    get state() {
      return state;
    },
    layer: (signals, config = {}) =>
      build(signals, {
        ...config,
        junctions,
        layer: config.layer || Object.keys(junctions).length,
      }),
  });

  return parent.id ? circuit : deferredSignals.reduce(wire, circuit);
};

export default build;

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
