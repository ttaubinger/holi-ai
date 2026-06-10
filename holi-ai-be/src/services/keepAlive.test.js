/* eslint-disable max-lines-per-function */
const { startKeepAlive, stopKeepAlive } = require('./keepAlive');

describe('keepAlive.js local', () => {
  let originalEnv;
  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.useFakeTimers();
    global.fetch = jest.fn(() => Promise.resolve({}));
  });
  afterEach(() => {
    process.env = originalEnv;
    stopKeepAlive();
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  it('should use localhost by default', () => {
    process.env.PORT = '4000';
    startKeepAlive();
    jest.advanceTimersByTime(600000);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:4000/');
  });
});

describe('keepAlive.js external', () => {
  let originalEnv;
  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.useFakeTimers();
    global.fetch = jest.fn(() => Promise.resolve({}));
  });
  afterEach(() => {
    process.env = originalEnv;
    stopKeepAlive();
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  it('should use RENDER_EXTERNAL_HOSTNAME if set', () => {
    process.env.RENDER_EXTERNAL_HOSTNAME = 'my-app.onrender.com';
    startKeepAlive();
    jest.advanceTimersByTime(600000);
    expect(global.fetch).toHaveBeenCalledWith('https://my-app.onrender.com/');
  });
});

describe('keepAlive.js errors', () => {
  let originalEnv;
  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.useFakeTimers();
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
  });
  afterEach(() => {
    process.env = originalEnv;
    stopKeepAlive();
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  it('should not throw if fetch fails', () => {
    startKeepAlive();
    expect(() => {
      jest.advanceTimersByTime(600000);
    }).not.toThrow();
  });
});
