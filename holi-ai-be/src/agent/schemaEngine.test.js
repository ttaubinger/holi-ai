/* eslint-disable max-lines-per-function */
const path = require('path');
const SchemaEngine = require('./schemaEngine');

describe('SchemaEngine Init', () => {
  it('throws error if file read fails', () => {
    expect(() => new SchemaEngine('nonexistent.yaml')).toThrow();
  });

  it('evaluateCondition catches errors', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    expect(engine.evaluateCondition('invalid syntax {', {})).toBe(false);
  });
});

describe('SchemaEngine Methods', () => {

  it('getActiveRouteAndStep returns null if no route matches', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    engine.schema = { routes: [{ condition: 'false', steps: [] }] };
    expect(engine.getActiveRouteAndStep({})).toBe(null);
  });

  it('evaluateDynamicTools adds extra tools', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    const rules = [{ if: 'tools_called.includes("t1")', add: ['t2'] }];
    const res = engine.evaluateDynamicTools(rules, { tools_called: ['t1'] });
    expect(res).toEqual(['t2']);
  });
});

describe('SchemaEngine dynamic', () => {

  it('evaluateDynamicTools returns empty array if no rules', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    const res = engine.evaluateDynamicTools(null, {});
    expect(res).toEqual([]);
  });

  it('evaluateCondition returns true if condition is empty', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    expect(engine.evaluateCondition('', {})).toBe(true);
  });

  it('evaluateCondition evaluates simple expressions correctly', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    expect(engine.evaluateCondition('context.foo === "bar"', { foo: 'bar' })).toBe(true);
  });

  it('getActiveRouteAndStep returns null if schema is invalid', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    engine.schema = null;
    expect(engine.getActiveRouteAndStep({})).toBe(null);
  });

  it('renderTemplate replaces variables', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    expect(engine.renderTemplate('Hello {{ name }}', { name: 'World' })).toBe('Hello World');
    expect(engine.renderTemplate('', {})).toBe('');
    expect(engine.renderTemplate('Hello {{ missing }}', {})).toBe('Hello ');
  });

  it('evaluateDynamicTools skips rule if condition fails', () => {
    const engine = new SchemaEngine(path.join(__dirname, 'orchestrator.yaml'));
    const rules = [{ if: 'false', add: ['t2'] }];
    const res = engine.evaluateDynamicTools(rules, {});
    expect(res).toEqual([]);
  });
});
