const esmRequire = require('esm')(module);

const { default: circuit } = esmRequire('./index.js');

describe('circuit', () => {
  describe('initialization', () => {
    it('should create a circuit', () => {
      expect(circuit({ id: jest.fn() }).id).toBeDefined();
    });
    it('should create a deep circuit', () => {
      expect(
        circuit({ id: { class: { class: jest.fn() } } }).id.class.class
      ).toBeDefined();
    });
    it('should allow aliased signals in a deep circuit', () => {
      expect(
        'Z' in circuit({ 'X:id': { 'Y:class': { 'Z:class': jest.fn() } } }).X.Y
      ).toBe(true);
    });
    it('should allow whitespace in signal', () => {
      expect('X' in circuit({ 'X:id class $event': jest.fn() })).toBe(true);
    });
    it('should provide read access to cct state', () => {
      const cct = circuit(
        {
          X: { Y: { Z: jest.fn() } },
        },
        { state: { X: { Y: { Z: 123 } } } }
      );
      expect(cct.state).toEqual({ X: { Y: { Z: 123 } } });
    });
  });

  describe('map reducer', () => {
    it('should expose signal reducer as map', () => {
      const x = jest.fn((value) => value * 2);
      circuit({ id_: x }, { state: { id: 123 } }).id(456);
      expect(x).toHaveBeenCalledWith(456);
    });
    it('should map value into reduced state', () => {
      const x = jest.fn((value) => value * 2);
      const cct = circuit({ id_: x });
      cct.id(123);
      expect(cct.state).toEqual({ id: 246 });
    });
  });

  describe('reducer', () => {
    it('should reduce a deep circuit', () => {
      const y = (state, value) => ({ ...state, y: value });
      const cct = circuit({ id: { x: { y } } });
      cct.id.x.y(456);
      expect(cct.state).toEqual({ id: { x: { y: 456 } } });
    });
    it('should access signal context', () => {
      let ctx;
      const y = function () {
        ctx = this;
        ctx.value = (ctx.value || 0) + 1;
      };
      const cct = circuit({ id: y });
      cct.id();
      cct.id();
      expect(ctx.value).toBe(2);
    });
    it('should share circuit context', () => {
      let ctx;
      const y = function () {
        ctx = this;
        ctx.value = (ctx.value || 0) + 1;
      };
      const cct = circuit({ id1: y, id2: y });
      cct.id1();
      cct.id2();
      expect(ctx.value).toBe(2);
    });
  });

  describe('state change', () => {
    it('should jump state from root', () => {
      const y1 = (state) => ({ ...state, y1: 456 });
      const y2 = (state) => ({ ...state, y2: 456 });
      const cct = circuit(
        { x: { y1, y2 } },
        {
          state: {
            x: { y1: 123, y2: 123 },
          },
        }
      );
      cct.x.y1();
      cct.x.y2();
      expect(cct.state).toEqual({ x: { y1: 456, y2: 456 } });
    });
    it('should merge state in jump order', () => {
      let orderId = 0;
      const y1 = () => {
        cct.x.y2(456);
        return { ...cct.state.x, y1: ++orderId };
      };
      const y2 = (state) => ({ ...state, y2: ++orderId });
      const cct = circuit(
        { x: { y1, y2 } },
        {
          state: {
            x: { y1: 123, y2: 123 },
          },
        }
      );
      cct.x.y1(456);
      expect(cct.state).toEqual({ x: { y1: 2, y2: 1 } });
    });
    it('should expose state signal id to reducer', () => {
      const z = function () {
        state = this.id;
      };
      circuit({ x: { y: { z } } }).x.y.z();
      expect(state).toBe('/x/y/z');
    });
    it('should signal state internally', () => {
      const z = function (state, value) {
        this.signal('/a/b/c', value);
      };
      const c = jest.fn();
      circuit({ x: { y: { z } }, a: { b: { c } } }).x.y.z(123);
      expect(c).toHaveBeenCalledWith({}, 123);
    });
    it('should signal local circuit state internally', () => {
      const z = function (state, value) {
        this.signal('/a/b', value);
      };
      const c = (acc, c) => ({ ...acc, c });
      const cct = circuit({ x: { y: { z } }, a: { b: { c } } });
      cct.x.y.z(123);
      expect(cct.state.a.b.c).toEqual(123);
    });
    it('should signal sibling internally', () => {
      const z = function (state, value) {
        this.signal('./c', value);
      };
      const c = jest.fn();
      circuit({ x: { y: { c, z } } }).x.y.z(123);
      expect(c).toHaveBeenCalledWith({}, 123);
    });
    it('should signal indirect relative internally', () => {
      const z = function (state, value) {
        this.signal('../../a/b/c', value);
      };
      const c = jest.fn();
      circuit({ x: { y: { z } }, a: { b: { c } } }).x.y.z(123);
      expect(c).toHaveBeenCalled();
    });
    it('should capture internal state change', () => {
      const z = function (state, value) {
        return { z: this.signal('/a/b/c', value).c };
      };
      const c = (acc, c) => ({ ...acc, c });
      const cct = circuit({ x: { y: { z } }, a: { b: { c } } });

      expect(cct.x.y.z(123)).toEqual({ z: 123 });
    });
  });

  describe('propagation', () => {
    it('should not propagate unchanged sibling state', () => {
      const x = (state, value) => ({ ...state, x: value + 1 });
      const y = () => ({ x: 1, y: 1 });
      const cct = circuit({ x, y }, { state: { x: 1 } });
      cct.y();
      expect(cct.state).toEqual({ x: 1, y: 1 });
    });
    it('should only propagate changed state', () => {
      const x = (state, value) => ({ ...state, id: value });
      const terminal = jest.fn((state) => state);
      const cct = circuit({ id: x }, { terminal, state: { id: 123 } });
      cct.id(456);
      cct.id(456);
      expect(terminal).toHaveBeenCalledTimes(1);
    });
    it('should not propagate through sibling event', () => {
      const x = (state, value) => ({ ...state, x: value + 1 });
      const y = () => ({ x: 1, y: 1 });
      const cct = circuit({ x$change: x, y });
      cct.y();
      expect(cct.state).toEqual({ x: 1, y: 1 });
    });
    it('should halt propagation', () => {
      const initState = { id: 123 };
      const terminal = jest.fn((state) => state);
      const x = function () {
        return;
      };
      const cct = circuit({ id: x }, { state: initState, terminal });
      cct.id(456);
      expect(terminal).not.toHaveBeenCalled();
      expect(cct.state).toBe(initState);
    });
    it('should propagate to deferred state', () => {
      const x = function (state, value) {
        return { ...state, x: value };
      };
      const d = function (state, value) {
        return { ...state, d: value };
      };
      const cct = circuit({ x, 'd$/x': d });
      cct.x(456);
      expect(cct.state.d).toEqual(456);
    });
    it('should propagate to deferred relative state', () => {
      const x = function (state, value) {
        return { ...state, x: value };
      };
      const d = function (state, value) {
        return { ...state, d: value };
      };
      const cct = circuit({ x, 'd$./x': d });
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
      const cct = circuit({ x, 'd$/x': { y } });
      cct.x(456);
      expect(cct.state.d.y).toEqual(456);
    });
    it('should propagate to nested deferred state', () => {
      const x = function (state, value) {
        return { ...state, x: value };
      };
      const z = function (state, value) {
        return { ...state, z: value };
      };
      const cct = circuit({ x, y: { 'd$/x': { z } } });
      cct.x(456);
      expect(cct.state.y.d.z).toEqual(456);
    });
    it('should propagate to multiple deferred nested state', () => {
      const x = function (state, value) {
        return { ...state, x: value };
      };
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const cct = circuit({ x, 'd$/x': { x, y } });
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
      const cct = circuit({ x: { y }, 'd$/x': d });
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
      const cct = circuit({ x: { y }, 'd$/x': { z } });
      cct.x.y(456);
      expect(cct.state.d.z).toEqual({ y: 456 });
    });
    it('should propagate nested state to deeply deferred nested state', () => {
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const cct = circuit({ x: { y }, 'd$/x/y': { y } });
      cct.x.y(456);
      expect(cct.state.d.y).toEqual(456);
    });
    it('should propagate nested state to deeply nested deferred state', () => {
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const cct = circuit({ x: { y }, z: { 'd$/x/y': { y } } });
      cct.x.y(456);
      expect(cct.state.z.d.y).toEqual(456);
    });
    it('should propagate to future resolved state', () => {
      const y = function (state, value) {
        return { ...state, y: value };
      };
      const cct = circuit({ 'd$/x/y': { y }, x: { y } });
      cct.x.y(456);
      expect(cct.state.d.y).toEqual(456);
    });
    it('should propagate through to terminal', () => {
      const y = function (state, y) {
        return { ...state, y };
      };
      const terminal = jest.fn((state) => state);
      const cct = circuit({ x: { y }, 'd$/x/y': { y } }, { terminal });
      cct.x.y(456);
      expect(terminal).toHaveBeenCalledWith(
        { x: { y: 456 }, d: { y: 456 } },
        '/x/y',
        true,
        undefined
      );
    });
  });

  describe('events', () => {
    it('should merge $init into root state', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit(
        {
          $init: ({ id }) => ({ id: id + 1 }),
        },
        { state: originalState }
      );
      expect(cct.state).toEqual({ id: 2 });
    });
    it('should merge $init into state', () => {
      const originalState = {};
      const cct = circuit(
        {
          id: {
            $init: (acc) => ({ ...acc, id: 2 }),
          },
        },
        { state: originalState }
      );
      expect(cct.state).not.toBe(originalState);
      expect(cct.state).toEqual({ id: 2 });
    });
    it('should merge $init into state prop', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit(
        {
          id$init: (acc) => ({ ...acc, id: acc.id + 1 }),
        },
        { state: originalState }
      );
      expect(cct.state).toBe(originalState);
      expect(cct.state).toEqual({ id: 2 });
    });
    it('should merge nested $init into root state', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit(
        {
          id: {
            $init: ({ id }) => ({ id: id + 2 }),
          },
          $init: ({ id }) => ({ id: id * 2 }),
        },
        { state: originalState }
      );
      expect(cct.state).toEqual({ id: 6 });
    });
    it('nest order sensitivity', () => {
      const originalState = {
        id: 1,
      };
      const cct = circuit(
        {
          $init: ({ id }) => ({ id: id * 2 }),
          id: {
            $init: ({ id }) => ({ id: id + 2 }),
          },
        },
        { state: originalState }
      );
      expect(cct.state).toEqual({ id: 4 });
    });
    it('should propagate to root $state', () => {
      const cct = circuit({
        id: {
          x: (s, x) => ({ ...s, x }),
        },
        $state: (state) => ({ ...state, y: 3 }),
      });
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
      });
      cct.id.x(2);
      expect(cct.state).toEqual({ id: { x: 2, y: 3 }, z: 3 });
    });
    it('should propagate terminal only $state', () => {
      const cct = circuit({
        x: {
          $init: (state) => {
            return { ...state, y: 2 };
          },
          $state: (state) => {
            return { ...state, z: 3 };
          },
        },
      });
      cct.x(1);
      expect(cct.state).toEqual({ x: 1, y: 2, z: 3 });
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
      });
      cct.id.x(2);
      expect(signal1).toEqual('/id/state');
      expect(signal2).toEqual('/state');
    });
  });

  describe('async', () => {
    it('should resolve at state change', async () => {
      const cct = circuit({
        x: (s, x) => Promise.resolve({ ...s, x: 2 }),
      });
      await cct.x();
      expect(cct.state).toEqual({ x: 2 });
    });
    it('should resolve at deep state change', async () => {
      const cct = circuit({
        id: {
          x: (s, x) => Promise.resolve({ ...s, x }),
        },
      });
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
        { terminal }
      );
      await cct.id.x(2);
    });
  });

  describe('layers', () => {
    it('should expose a layer API', () => {
      const cct = circuit({});
      expect(cct.layer).toBeDefined();
    });
    it('should create a junction', () => {
      const x_ = (value) => value + 1;
      const cct = circuit({ x_ });
      const lct = cct.layer({ x_ });
      lct.x(1);
      expect(cct.state.x).toBe(3);
      expect(lct.state.x).toBe(2);
    });
    it('should create a binary junction', () => {
      const x_ = (value) => value + 1;
      const cct = circuit({ x_ });
      const lct = cct.layer({ x_ });
      cct.x(1);
      expect(lct.state.x).toBe(3);
      expect(cct.state.x).toBe(2);
    });
    it('should create a deep junction', () => {
      const x_ = (value) => value + 1;
      const cct = circuit({ a: { x_ } });
      const lct = cct.layer({ a: { x_ } });
      lct.a.x(1);
      expect(cct.state.a.x).toBe(3);
      expect(lct.state.a.x).toBe(2);
    });
    it('should create a circuit junction', () => {
      const x_ = (value) => value + 1;
      const a = jest.fn();
      const cct = circuit({ a });
      const lct = cct.layer({ a: { x_ } });
      lct.a.x(1);
      expect(a.mock.calls[0][0]).toEqual({ a: { x: 2 } });
    });
    it('should propagate in layer order', () => {
      const x_ = (value) => value + 1;
      const t = jest.fn();
      const cct = circuit({ a: { x_ } }, { terminal: t });
      const lct = cct.layer({ a: { x_ } }, { terminal: t });
      lct.a.x(1);
      expect(t.mock.calls[0][0]).toEqual({ a: { x: 2 } });
      expect(t.mock.calls[1][0]).toEqual({ a: { x: 3 } });
    });
  });
});

describe('addons', () => {
  describe('map', () => {
    it('should adapt reduce api', () => {
      const v = jest.fn();
      const map = (fn) => (state, value) => fn(value);
      circuit({ x: map(v) }).x(123);
      expect(v).toHaveBeenCalledWith(123);
    });
    it('should reduce mapped value', () => {
      const map = (fn) =>
        function (state, value) {
          return { ...state, [this.address]: fn.call(this, value) };
        };
      const cct = circuit({ x: map((v) => v + v) });
      cct.x(123);
      expect(cct.state).toEqual({ x: 246 });
    });
  });
});

describe('README examples', () => {
  it('counter example', () => {
    const cct = circuit(
      {
        'add:count': ({ count }, value) => ({ count: count + value }),
      },
      {
        state: {
          count: 1,
        },
      }
    );
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
        add(state, value) {
          this.signal('/items/update', value);
        },
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
      todo = circuit(blueprint, {
        state: { items: [], footer: { counts: {} } },
      });
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
        s1(acc) {
          return Promise.resolve({ ...acc, s1: true }).then(() => {
            log.push(this.id);
            return this.signal('/s2', true);
          });
        },
        s2(acc) {
          return Promise.resolve({ ...acc, s2: true }).then(() => {
            log.push(this.id);
            return this.signal('/s3', true);
          });
        },
        s3: (acc) => Promise.resolve({ ...acc, s3: true }),
      },
      { terminal }
    );

    cct.s1(); // logs => '/s1', '/s2', '/s3'
  });

  it('Layered circuits', () => {
    // two independent circuits with signal alignment.

    const data = {
      items: {
        add: (acc, item) => [...acc, item],
      },
    };

    const view = {
      add_(value) {
        // return `<input onChange=${(e) => this.signal('//items/add', e)} />`;
        this.signal('//items/add', value);
      },
      items_: (items) => items.map((item) => `<div>${item}</div>`),
      $state: ({ items }) => `<main>${items}</main>`,
    };

    // A junction will be created on the xpath aligned `/items` selector
    // allowing state change signals to cross over the layer boundary.

    const app = circuit(data, {
      state: { items: [] },
    }).layer(view, {
      terminal: (displayState) =>
        expect(displayState).toBe('<main><div>item</div></main>'),
    });
    app.add('item');
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
    circuit({ id: jest.fn() }, { state: { id: 123 }, mount: element });
    expect(element.querySelectorAll).toHaveBeenCalledWith('#id');
  });
  it('should override lazy selector', () => {
    circuit({ '#id': jest.fn() }, { state: { id: 123 }, mount: element });
    expect(element.querySelectorAll).toHaveBeenCalledWith('#id');
  });
  it('should bind a signal to a DOM element', () => {
    const y = function () {
      return { id: this.el };
    };
    const cct = circuit({ id$click: y }, { mount: element });
    handlers.click.call(element, { target: element });
    expect(cct.state.id).toEqual(element);
  });
  it('should bind an alias to a DOM element', () => {
    const y = function (state, { target }) {
      return { XXX: target };
    };
    const cct = circuit({ 'XXX:id$click': y }, { mount: element });
    cct.XXX({ target: element });
    expect(cct.state).toEqual({ XXX: element });
  });
  it('should bind a signal to a parent DOM element', () => {
    const y = function () {
      return { id: this.el };
    };
    const cct = circuit(
      { id: { $click: y } },
      { state: { id: 123 }, mount: element }
    );
    handlers.click.call(element, { target: element });
    expect(cct.state.id).toEqual(element);
  });
  it('should bind a signal to multiple DOM elements', () => {
    const elems = [];
    const y = function () {
      elems.push(this.el);
    };
    const cct = circuit({ class: y }, { mount: element });
    cct.class();
    expect(elems).toEqual([element, element]);
  });
  it('should bind multiple signals to a single DOM', () => {
    const y1 = ({ id }) => ({ id: id + 1 });
    const y2 = ({ id }) => ({ id: id + 2 });
    const cct = circuit(
      { id: { $click1: y1, $click2: y2 } },
      { state: { id: 1 }, mount: element }
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
