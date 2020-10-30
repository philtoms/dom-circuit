const esmRequire = require('esm')(module);

const { default: circuit, _CURRENT } = esmRequire('./index.js');

describe('circuit', () => {
  describe('initialization', () => {
    it('should create a circuit', () => {
      expect(circuit({ id: jest.fn() })({ id: 123 }).id).toBeDefined();
    });
    it('should create a deep circuit', () => {
      expect(
        circuit({ id: { class: { class: jest.fn() } } })({
          id: { class: { class: 123 } },
        }).id.class.class
      ).toBeDefined();
    });
    it('should allow aliased signals in a deep circuit', () => {
      expect(
        'Z' in
          circuit({ 'X:id': { 'Y:class': { 'Z:class': jest.fn() } } })({}).X.Y
      ).toBe(true);
    });
    it('should allow whitespace in signal', () => {
      expect('X' in circuit({ 'X:id class $event': jest.fn() })({})).toBe(true);
    });
    it('should provide read access to cct state', () => {
      const cct = circuit({
        X: { Y: { Z: jest.fn() } },
      })({ X: { Y: { Z: 123 } } });
      expect(cct.state).toEqual({ X: { Y: { Z: 123 } } });
    });
  });

  describe('reducer', () => {
    it('should expose signal reducer', () => {
      const x = jest.fn((state, value) => ({ ...state, id: value }));
      circuit({ id: x })({ id: 123 }).id(456);
      expect(x).toHaveBeenCalledWith({ id: 123 }, 456);
    });
    it('should reduce all signals', () => {
      const x = (state, value) => ({ ...state, x: value });
      const y = (state, value) => ({ ...state, y: value });
      const circut = circuit({ x, y })({ x: 123, y: 123 });
      circut.x(456);
      circut.y(456);
      expect(circut.state).toEqual({
        x: 456,
        y: 456,
      });
    });
    it('should reduce a deep circuit', () => {
      const y = (state, value) => ({ ...state, y: value });
      const cct = circuit({ id: { x: { y } } })({});
      cct.id.x.y(456);
      expect(cct.state).toEqual({ id: { x: { y: 456 } } });
    });
    it('should access signal context', () => {
      let ctx;
      const y = function () {
        ctx = this;
        ctx.value = (ctx.value || 0) + 1;
      };
      const cct = circuit({ id: y })({});
      cct.id();
      cct.id();
      expect(ctx.value).toBe(2);
    });
  });

  describe('state change', () => {
    it('should jump state from root', () => {
      const y1 = (state) => ({ ...state, y1: 456 });
      const y2 = (state) => ({ ...state, y2: 456 });
      const cct = circuit({ x: { y1, y2 } })({
        x: { y1: 123, y2: 123 },
      });
      cct.x.y1(_CURRENT);
      cct.x.y2(_CURRENT);
      expect(cct.state).toEqual({ x: { y1: 456, y2: 456 } });
    });
    it('should merge state in jump order', () => {
      let orderId = 0;
      const y1 = () => {
        cct.x.y2(456);
        return { ...cct.state.x, y1: ++orderId };
      };
      const y2 = (state) => ({ ...state, y2: ++orderId });
      const cct = circuit({ x: { y1, y2 } })({
        x: { y1: 123, y2: 123 },
      });
      cct.x.y1(456);
      expect(cct.state).toEqual({ x: { y1: 2, y2: 1 } });
    });
    it('should expose state signal id to reducer', () => {
      const z = function () {
        state = this.id;
      };
      circuit({ x: { y: { z } } })({}).x.y.z();
      expect(state).toBe('/x/y/z');
    });
    it('should signal state internally', () => {
      const z = function (state, value) {
        this.signal('/a/b/c', value);
      };
      const c = jest.fn();
      circuit({ x: { y: { z } }, a: { b: { c } } })({}).x.y.z(123);
      expect(c).toHaveBeenCalledWith({}, 123);
    });
    it('should signal circuit state internally', () => {
      const z = function (state, value) {
        this.signal('/a/b', { c: value });
      };
      const c = jest.fn();
      const cct = circuit({ x: { y: { z } }, a: { b: { c } } })({});
      cct.x.y.z(123);
      expect(cct.state.a.b.c).toEqual(123);
    });
    it('should capture internal state change', () => {
      const z = function (state, value) {
        return { z: this.signal('/a/b/c', value).c };
      };
      const c = (acc, c) => ({ ...acc, c });
      const cct = circuit({ x: { y: { z } }, a: { b: { c } } })({});

      expect(cct.x.y.z(123)).toEqual({ z: 123 });
    });
  });

  describe('propagation', () => {
    it('should propagate through sibling state', () => {
      const x = (state, value) => ({ ...state, x: value + 1 });
      const y = () => ({ x: 1, y: 1 });
      const cct = circuit({ x, y })();
      cct.y();
      expect(cct.state).toEqual({ x: 2, y: 1 });
    });
    it('should not propagate unchanged sibling state', () => {
      const x = (state, value) => ({ ...state, x: value + 1 });
      const y = () => ({ x: 1, y: 1 });
      const cct = circuit({ x, y })({ x: 1 });
      cct.y();
      expect(cct.state).toEqual({ x: 1, y: 1 });
    });
    it('should not propagate through sibling event', () => {
      const x = (state, value) => ({ ...state, x: value + 1 });
      const y = () => ({ x: 1, y: 1 });
      const cct = circuit({ x$change: x, y })();
      cct.y();
      expect(cct.state).toEqual({ x: 1, y: 1 });
    });
    it('should propagate to deferred state', () => {
      const x = function (state, value) {
        return { ...state, x: value };
      };
      const d = function (state, value) {
        return { ...state, d: value };
      };
      const cct = circuit({ x, 'd$/x': d })();
      cct.x(456);
      expect(cct.state.d).toEqual(456);
    });
    it('should propagate to deferred nested state', () => {
      const x = function (state, value) {
        return { ...state, x: value };
      };
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const cct = circuit({ x, 'd$/x': { y } })();
      cct.x(456);
      expect(cct.state.d.y).toEqual(456);
    });
    it('should propagate to multiple deferred nested state', () => {
      const x = function (state, value) {
        return { ...state, x: value };
      };
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const cct = circuit({ x, 'd$/x': { x, y } })();
      cct.x(456);
      expect(cct.state.d.x).toEqual(456);
      expect(cct.state.d.y).toEqual(456);
    });
    it('should propagate nested state to deferred state', () => {
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const d = function (state, value) {
        return { ...state, d: value };
      };
      const cct = circuit({ x: { y }, 'd$/x': d })({});
      cct.x.y(456);
      expect(cct.state.d).toEqual({ y: 456 });
    });
    it('should propagate nested state to deferred nested state', () => {
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const z = function (state, value) {
        return { ...state, z: value };
      };
      const cct = circuit({ x: { y }, 'd$/x': { z } })({});
      cct.x.y(456);
      expect(cct.state.d.z).toEqual({ y: 456 });
    });
    it('should propagate nested state to deeply deferred nested state', () => {
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const cct = circuit({ x: { y }, 'd$/x/y': { y } })({});
      cct.x.y(456);
      expect(cct.state.d.y).toEqual(456);
    });
    it('should propagate through to terminal', () => {
      const y = function (state) {
        return { ...state, y: 1 };
      };
      const terminal = jest.fn((state) => state);
      const cct = circuit({ x: { y }, 'd$/x': { y } }, terminal)({});
      cct.x.y(456);
      expect(terminal).toHaveBeenCalledWith(
        { x: { y: 1 }, d: { y: 1 } },
        '/d/y',
        true
      );
    });
    it('should only propagate changed state', () => {
      const x = (state, value) => ({ ...state, id: value });
      const terminal = jest.fn((state) => state);
      const cct = circuit({ id: x }, terminal)({ id: 123 });
      cct.id(456);
      cct.id(456);
      expect(terminal).toHaveBeenCalledTimes(1);
    });
    it('should halt propagation', () => {
      const initState = { id: 123 };
      const terminal = jest.fn((state) => state);
      const x = function () {
        return;
      };
      const cct = circuit({ id: x })(initState);
      cct.id(456);
      expect(terminal).not.toHaveBeenCalled();
      expect(cct.state).toBe(initState);
    });
  });

  describe('events', () => {
    it('should merge $init into root state', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit({
        $init: ({ id }) => ({ id: id + 1 }),
      })(originalState);
      expect(cct.state).toEqual({ id: 2 });
    });
    it('should merge $init into state', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit({
        id: {
          $init: (acc) => ({ ...acc, id: acc.id + 1 }),
        },
      })(originalState);
      expect(cct.state).not.toBe(originalState);
      expect(cct.state).toEqual({ id: 2 });
    });
    it('should merge $init into state prop', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit({
        id$init: (acc) => ({ ...acc, id: acc.id + 1 }),
      })(originalState);
      expect(cct.state).toBe(originalState);
      expect(cct.state).toEqual({ id: 2 });
    });
    it('should merge nested $init into root state', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit({
        id: {
          $init: ({ id }) => ({ id: id + 2 }),
        },
        $init: ({ id }) => ({ id: id * 2 }),
      })(originalState);
      expect(cct.state).toEqual({ id: 6 });
    });
    it('should FIX: nest order sensitivity', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit({
        $init: ({ id }) => ({ id: id * 2 }),
        id: {
          $init: ({ id }) => ({ id: id + 2 }),
        },
      })(originalState);
      expect(cct.state).toEqual({ id: 4 });
    });
    it('should propagate to root $state', () => {
      const cct = circuit({
        id: {
          x: (s, x) => ({ ...s, x }),
        },
        $state: (state) => ({ ...state, y: 3 }),
      })({});
      cct.id.x(2);
      expect(cct.state).toEqual({ id: { x: 2 }, y: 3 });
    });
    it('should propagate from nested $state', () => {
      const cct = circuit({
        id: {
          x: (s, x) => ({ ...s, x }),
          $state: (state) => ({ ...state, y: 3 }),
        },
        $state: (state) => ({ ...state, z: state.id.y }),
      })({});
      cct.id.x(2);
      expect(cct.state).toEqual({ id: { x: 2, y: 3 }, z: 3 });
    });
    it('should include signal in $state', () => {
      let signal1, signal2;
      const cct = circuit({
        id: {
          x: (s, x) => ({ ...s, x }),
          $state() {
            signal1 = this.id;
          },
        },
        $state() {
          signal2 = this.id;
        },
      })({});
      cct.id.x(2);
      expect(signal1).toEqual('/id');
      expect(signal2).toEqual('/');
    });
  });

  describe('async', () => {
    it('should resolve at state change', async () => {
      const cct = circuit({
        x: (s, x) => Promise.resolve({ ...s, x: 2 }),
      })({});
      await cct.x();
      expect(cct.state).toEqual({ x: 2 });
    });
    it('should resolve at deep state change', async () => {
      const cct = circuit({
        id: {
          x: (s, x) => Promise.resolve({ ...s, x }),
        },
      })({});
      await cct.id.x(2);
      expect(cct.state).toEqual({ id: { x: 2 } });
    });

    it('should resolve at terminal', async () => {
      const terminal = async (state) => {
        expect(state).toEqual({ id: { x: 2 } });
      };
      const cct = circuit(
        {
          id: {
            x: (s, x) => Promise.resolve({ ...s, x }),
          },
        },
        terminal
      )({});
      await cct.id.x(2);
    });
    it('should resolve sibling state change sequence at terminal', (done) => {
      const terminal = (state, signal) => {
        if (signal === '/id/z') {
          expect(state).toEqual({ id: { x: 1, y: 2, z: 3 } });
          done();
        }
      };
      const cct = circuit(
        {
          id: {
            x: (s, x) => Promise.resolve({ ...s, x, y: 1 }),
            y: (s, y) => Promise.resolve({ ...s, y: y + 1, z: 2 }),
            z: (s, z) => Promise.resolve({ ...s, z: z + 1 }),
          },
        },
        terminal
      )({});
      cct.id.x(1);
    });
  });
});

describe('addons', () => {
  describe('map', () => {
    it('should adapt reduce api', () => {
      const v = jest.fn();
      const map = (fn) => (state, value) => fn(value);
      circuit({ x: map(v) })({}).x(123);
      expect(v).toHaveBeenCalledWith(123);
    });
    it('should reduce mapped value', () => {
      const map = (fn) =>
        function (state, value) {
          return { ...state, [this.address]: fn.call(this, value) };
        };
      const cct = circuit({ x: map((v) => v + v) })({});
      cct.x(123);
      expect(cct.state).toEqual({ x: 246 });
    });
  });
});

describe('README examples', () => {
  it('counter example', () => {
    const cct = circuit({
      'add:count': ({ count }, value) => ({ count: count + value }),
    })({
      count: 1,
    });
    cct.add(1);
    expect(cct.state.count).toEqual(2);
  });

  describe('todo', () => {
    let nextId;
    const update = (items, item) => [
      ...remove(items, item),
      { ...item, id: item.id || ++nextId },
    ];
    const remove = (items, { id }) => items.filter((todo) => todo.id !== id);
    const total = (state, items) => ({ ...state, total: items.length });
    const done = (state, items) => ({
      ...state,
      done: items.reduce((count, { done }) => count + (done ? 1 : 0), 0),
    });

    const blueprint = {
      header: {
        add: (state, value) => todo.items.update(value),
      },
      items: {
        update,
        remove,
      },
      footer: {
        'counts$/items': {
          total,
          done,
        },
      },
    };
    let todo;
    beforeEach(() => {
      nextId = 0;
      todo = circuit(blueprint)({ items: [], footer: { counts: {} } });
    });

    it('should add an item', () => {
      todo.header.add({ text: 'todo 1' });
      expect(todo.state.items).toEqual([{ id: 1, text: 'todo 1' }]);
    });
    it('should update an item', () => {
      todo.header.add({ text: 'todo 1' });
      todo.items.update({ text: 'todo 1 updated', id: 1 });
      expect(todo.state.items).toEqual([{ id: 1, text: 'todo 1 updated' }]);
    });
    it('should remove an item', () => {
      todo.header.add({ text: 'todo 1' });
      todo.items.remove({ id: 1 });
      expect(todo.state.items).toEqual([]);
    });
    it('should update counts', () => {
      todo.header.add({ text: 'todo 1' });
      todo.header.add({ text: 'todo 2' });
      todo.items.update({ text: 'todo 2 done', id: 2, done: true });
      expect(todo.state.footer.counts).toEqual({ total: 2, done: 1 });
    });
  });

  it('async state change order', (done) => {
    let log = [];
    const terminal = (value, signal) => {
      log.push(signal);
      if (value.s3) {
        expect(log).toEqual(['/s1', '/s2', '/s3']);
        done();
      }
    };
    const cct = circuit(
      {
        s1: (acc) => Promise.resolve({ ...acc, s1: true, s2: false }),
        s2: (acc) => Promise.resolve({ ...acc, s2: true, s3: false }),
        s3: (acc) => Promise.resolve({ ...acc, s3: true }),
      },
      terminal
    )();

    cct.s1(); // logs => '/s1', '/s2', '/s3'
  });
});

describe('binding', () => {
  let element;
  let handlers;
  beforeEach(() => {
    handlers = {};
    element = {
      querySelectorAll: jest.fn(
        (selector) =>
          ({
            '#id': [element],
            '.class': [element, element],
          }[selector] || [])
      ),
      addEventListener: jest.fn((listener, handler) => {
        handlers[listener] = handler;
      }),
    };
  });

  it('should access mountpoint element', () => {
    circuit({ id: jest.fn() })({ id: 123 }, element);
    expect(element.querySelectorAll).toHaveBeenCalledWith('#id');
  });
  it('should override lazy selector', () => {
    circuit({ '.id': jest.fn() })({ id: 123 }, element);
    expect(element.querySelectorAll).toHaveBeenCalledWith('.id');
  });
  it('should bind a signal to a DOM element', () => {
    const y = function () {
      return { id: this.el };
    };
    const cct = circuit({ id$click: y })({}, element);
    handlers.click.call(element, { target: element });
    expect(cct.state.id).toEqual(element);
  });
  it('should bind an alias to a DOM element', () => {
    const y = function (state, { target }) {
      return { XXX: target };
    };
    const cct = circuit({ 'XXX:id$click': y })({}, element);
    cct.XXX({ target: element });
    expect(cct.state).toEqual({ XXX: element });
  });
  it('should bind a signal to a parent DOM element', () => {
    const y = function () {
      return { id: this.el };
    };
    const cct = circuit({ '#id': { $click: y } })({ id: 123 }, element);
    handlers.click.call(element, { target: element });
    expect(cct.state.id).toEqual(element);
  });
  it('should bind a signal to multiple DOM elements', () => {
    const y = function () {
      return this;
    };
    circuit({ '.class': { $click: y } })({}, element);
    expect(element.addEventListener).toHaveBeenCalledTimes(2);
  });
  it('should bind multiple signals to a single DOM', () => {
    const y1 = ({ id }) => ({ id: id + 1 });
    const y2 = ({ id }) => ({ id: id + 2 });
    const cct = circuit({ '#id': { $click1: y1, $click2: y2 } })(
      { id: 1 },
      element
    );
    handlers.click1.call(element, { target: element });
    expect(cct.state).toEqual({
      id: 2,
    });
    handlers.click2.call(element, { target: element });
    expect(cct.state).toEqual({
      id: 4,
    });
  });
});
