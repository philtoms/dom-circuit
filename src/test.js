const esmRequire = require('esm')(module);

const { default: DOMcircuit, _CURRENT } = esmRequire('./index.js');

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
describe('dom-circuit', () => {
  describe('initialisation', () => {
    it('should create a circuit', () => {
      expect(DOMcircuit({ id: jest.fn() })({ id: 123 }).id).toBeDefined();
    });
    it('should create a deep circuit', () => {
      expect(
        DOMcircuit({ id: { class: { class: jest.fn() } } })({
          id: { class: { class: 123 } },
        }).id.class.class
      ).toBeDefined();
    });
    it('should allow aliased signals in a deep circuit', () => {
      expect(
        'Z' in
          DOMcircuit(
            { 'X:id': { 'Y:class': { 'Z:.class': jest.fn() } } },
            element
          )({}).X.Y
      ).toBe(true);
    });
    it('should allow whitespace in signal', () => {
      expect('X' in DOMcircuit({ 'X:id class @event': jest.fn() })({})).toBe(
        true
      );
    });
    it('should strip invalid property chars', () => {
      expect(DOMcircuit({ 'id.class[x&="^123"]': jest.fn() })({}).idclassx123)
        .toBeDefined;
    });
    it('should provide read access to circuit state', () => {
      const circuit = DOMcircuit({
        'X:id': { 'Y:class': { 'Z:class': jest.fn() } },
      })({ X: { Y: { Z: 123 } } });
      expect(circuit.state).toEqual({ X: { Y: { Z: 123 } } });
    });
  });

  describe('reducer', () => {
    it('should expose signal reducer', () => {
      const x = jest.fn((state, value) => ({ ...state, '#id': value }));
      DOMcircuit({ '#id': x })({ id: 123 }).id(456);
      expect(x).toHaveBeenCalledWith({ id: 123 }, 456);
    });
    it('should reduce all signals', () => {
      const x = (state, value) => ({ ...state, x: value });
      const y = (state, value) => ({ ...state, y: value });
      const circut = DOMcircuit({ x, y })({ x: 123, y: 123 });
      circut.x(456);
      circut.y(456);
      expect(circut.state).toEqual({
        x: 456,
        y: 456,
      });
    });
    it('should reduce a deep circuit', () => {
      const y = (state, value) => ({ ...state, y: value });
      const circuit = DOMcircuit({ '#id': { x: { y } } }, element)({});
      circuit.id.x.y(456);
      expect(circuit.state).toEqual({ id: { x: { y: 456 } } });
    });
  });

  describe('binding', () => {
    it('should access mountpoint element', () => {
      DOMcircuit({ id: jest.fn() }, element)({ id: 123 });
      expect(element.querySelectorAll).toHaveBeenCalledWith('#id');
    });
    it('should override lazy selector', () => {
      DOMcircuit({ '.id': jest.fn() }, element)({ id: 123 });
      expect(element.querySelectorAll).toHaveBeenCalledWith('.id');
    });
    it('should bind a signal to a DOM element', () => {
      const y = function () {
        return { id: this };
      };
      const circuit = DOMcircuit({ 'id@click': y }, element)({});
      handlers.click.call(element, { target: element });
      expect(circuit.state).toEqual({ id: { signal: 'id', element } });
    });
    it('should bind an alias to a DOM element', () => {
      const y = function (state, { target }) {
        return { XXX: target };
      };
      const circuit = DOMcircuit({ 'XXX:id@click': y }, element)({});
      circuit.XXX({ target: element });
      expect(circuit.state).toEqual({ XXX: element });
    });
    it('should bind a signal to a parent DOM element', () => {
      const y = function (state) {
        return { ...state, id: this };
      };
      const circuit = DOMcircuit({ '#id': { '@click': y } }, element)();
      handlers.click.call(element, { target: element });
      expect(circuit.state).toEqual({ id: { signal: 'id', element } });
    });
    it('should bind a signal to multiple DOM elements', () => {
      const y = function () {
        return this;
      };
      DOMcircuit({ '.class': { '@click': y } }, element)({});
      expect(element.addEventListener).toHaveBeenCalledTimes(2);
    });
    it('should bind multiple signals to a single DOM', () => {
      const y1 = (state) => ({ ...state, id: state.id + 1 });
      const y2 = (state) => ({ ...state, id: state.id + 2 });
      const circuit = DOMcircuit(
        { '#id': { '@click1': y1, '@click2': y2 } },
        element
      )({ id: 1 });
      handlers.click1.call(element, { target: element });
      expect(circuit.state).toEqual({
        id: 2,
      });
      handlers.click2.call(element, { target: element });
      expect(circuit.state).toEqual({
        id: 4,
      });
    });
  });

  describe('state change', () => {
    it('should manipulate current state', () => {
      const y = (state, { target }) => ({ id: target });
      const circuit = DOMcircuit(
        { '#id': { '@click': y } },
        element
      )({ id: { class: 123 } });
      handlers.click.call(element, { target: element });
      expect(circuit.state).toEqual({
        id: element,
      });
    });
    it('should preserve current state', () => {
      const y = (state, { target }) => ({ ...state, id: target });
      const circuit = DOMcircuit(
        { '#id': { '@click': y } },
        element
      )({ class: 123 });
      handlers.click.call(element, { target: element });
      expect(circuit.state).toEqual({
        id: element,
        class: 123,
      });
    });
    it('should jump state', () => {
      const y1 = (state) => ({ ...state, y1: 456 });
      const y2 = (state) => ({ ...state, y2: 456 });
      const circuit = DOMcircuit(
        { x: { y1, y2 } },
        element
      )({ x: { y1: 123, y2: 123 } });
      circuit.x.y1(_CURRENT);
      circuit.x.y2(_CURRENT);
      expect(circuit.state).toEqual({ x: { y1: 456, y2: 456 } });
    });
    it('should merge state in jump order', () => {
      let orderId = 0;
      const y1 = () => {
        circuit.x.y2(456);
        return { ...circuit.state.x, y1: ++orderId };
      };
      const y2 = (state) => ({ ...state, y2: ++orderId });
      const circuit = DOMcircuit(
        { x: { y1, y2 } },
        element
      )({ x: { y1: 123, y2: 123 } });
      circuit.x.y1(456);
      expect(circuit.state).toEqual({ x: { y1: 2, y2: 1 } });
    });
  });

  describe('propagation', () => {
    it('should propagate through sibling state', () => {
      const x = (state, value) => ({ ...state, x: state.x + value });
      const y = () => ({ x: 2, y: 1 });
      const circuit = DOMcircuit({ x, y }, element)({ x: 1 });
      circuit.y();
      expect(circuit.state).toEqual({ x: 4, y: 1 });
    });
    it('should propagate through to deferred state', () => {
      const s1 = function (state, value) {
        return { ...state, s1: value };
      };
      const s2 = function (state, value) {
        return { ...state, s2: value };
      };
      const circuit = DOMcircuit(
        { x: { y: { z: { s1 } } }, 'd@/x': { s2 } },
        element
      )({});
      circuit.x.y.z.s1(456);
      expect(circuit.state.d.s2).toEqual({ y: { z: { s1: 456 } } });
    });
    it('should propagate through to terminal', () => {
      const s1 = function (state) {
        return { ...state, s1: 1 };
      };
      const s2 = function (state) {
        return { ...state, s2: 2 };
      };
      const terminal = jest.fn((state) => state);
      const circuit = DOMcircuit(
        { x: { y: { z: { s1 } } }, 'd@/x': { s2 } },
        terminal,
        element
      )({});
      circuit.x.y.z.s1(456);
      expect(terminal).toHaveBeenCalledWith({ d: { s2: 2 } }, '/d/s2');
      expect(terminal).toHaveBeenCalledWith(circuit.state, '/x/y/z/s1');
    });
    it('should only propagate changed state', () => {
      const x = (state, value) => ({ ...state, id: value });
      const terminal = jest.fn((state) => state);
      const circuit = DOMcircuit({ id: x }, terminal, element)({ id: 123 });
      circuit.id(456);
      circuit.id(456);
      expect(terminal).toHaveBeenCalledTimes(1);
    });
    it('should halt propagation', () => {
      const initState = { id: 123 };
      const terminal = jest.fn((state) => state);
      const x = function () {
        return;
      };
      const circuit = DOMcircuit({ id: x })(initState);
      circuit.id(456);
      expect(terminal).not.toHaveBeenCalled();
      expect(circuit.state).toBe(initState);
    });
  });

  describe('events', () => {
    it('should merge @init into original state', () => {
      const originalState = {
        id: 1,
      };
      const circuit = DOMcircuit({
        id: {
          '@init': (state) => state + 1,
        },
      })(originalState);
      expect(circuit.state).toBe(originalState);
      expect(circuit.state).toEqual({ id: 2 });
    });
    it('should propagate to @state', () => {
      const circuit = DOMcircuit({
        id: {
          x: (s, x) => ({ ...s, x }),
          '@state': (state, value) => ({ ...value, x: 3 }),
        },
      })({});
      circuit.id.x(2);
      expect(circuit.state).toEqual({ id: { x: 3 } });
    });
  });
});

describe('addons', () => {
  describe('map', () => {
    it('should adapt reduce api', () => {
      const v = jest.fn();
      const map = (fn) => (state, value) => fn(value);
      DOMcircuit({ x: map(v) })({}).x(123);
      expect(v).toHaveBeenCalledWith(123);
    });
    it('should reduce mapped value', () => {
      const map = (fn) =>
        function (state, value) {
          return { ...state, [this.signal]: fn(value) };
        };
      const circuit = DOMcircuit({ x: map((v) => v) })({});
      circuit.x(123);
      expect(circuit.state).toEqual({ x: 123 });
    });
  });
});

describe('README examples', () => {
  it('counter example', () => {
    const circuit = DOMcircuit({
      'add:count': ({ count }, value) => ({ count: count + value }),
    })({
      count: 1,
    });
    circuit.add(4);
    expect(circuit.state).toEqual({ count: 5 });
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
        'counts@/items': {
          total,
          done,
        },
      },
    };
    let todo;
    beforeEach(() => {
      nextId = 0;
      todo = DOMcircuit(
        blueprint,
        element
      )({ items: [], footer: { counts: {} } });
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
});
