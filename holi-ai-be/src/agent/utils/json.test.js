/* eslint-disable max-lines-per-function */
const { safeJsonParse } = require('./json');

describe('json.js - safeJsonParse', () => {
  it('should parse valid json string', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('should return object directly if input is object', () => {
    const obj = { a: 1 };
    expect(safeJsonParse(obj)).toBe(obj);
  });

  it('should return fallback if input is null or undefined', () => {
    expect(safeJsonParse(null, { default: true })).toEqual({ default: true });
    expect(safeJsonParse(undefined, 'fallback')).toBe('fallback');
  });

  it('should strip markdown fences and parse', () => {
    const markdown = '```json\n{"b":2}\n```';
    expect(safeJsonParse(markdown)).toEqual({ b: 2 });
  });

  it('should extract json from surrounding text with braces', () => {
    const text = 'Here is the result: {"c":3} Hope this helps!';
    expect(safeJsonParse(text)).toEqual({ c: 3 });
  });

  it('should extract json from surrounding text with brackets', () => {
    const text = 'Array: [1,2,3] done.';
    expect(safeJsonParse(text)).toEqual([1, 2, 3]);
  });

  it('should return fallback on invalid json', () => {
    expect(safeJsonParse('invalid', { f: 1 })).toEqual({ f: 1 });
  });

  it('should return null on invalid json if no fallback provided', () => {
    expect(safeJsonParse('invalid')).toBe(null);
  });
});
