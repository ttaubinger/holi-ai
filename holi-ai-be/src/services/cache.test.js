const { getCache, setCache, deleteCache } = require('./cache');
const { redisConnection } = require('./queue');

jest.mock('./queue', () => ({
  redisConnection: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn()
  }
}));

const reset = () => jest.resetAllMocks();

describe('cache.js - getCache part 1', () => {
  beforeEach(reset);
  it('getCache returns parsed data', async () => {
    redisConnection.get.mockResolvedValueOnce('{"key": "val"}');
    expect(await getCache('test')).toEqual({ key: 'val' });
  });
  it('getCache returns null on empty', async () => {
    redisConnection.get.mockResolvedValueOnce(null);
    expect(await getCache('test')).toBeNull();
  });
});

describe('cache.js - getCache part 2', () => {
  beforeEach(reset);
  it('getCache catches error and returns null', async () => {
    redisConnection.get.mockRejectedValueOnce(new Error('err'));
    expect(await getCache('test')).toBeNull();
  });
});

describe('cache.js - setCache', () => {
  beforeEach(reset);
  it('setCache calls setex', async () => {
    await setCache('test', { a: 1 });
    expect(redisConnection.setex).toHaveBeenCalledWith('test', 86400, '{"a":1}');
  });
  it('setCache catches error', async () => {
    redisConnection.setex.mockRejectedValueOnce(new Error('err'));
    await setCache('test', { a: 1 });
  });
});

describe('cache.js - deleteCache', () => {
  beforeEach(reset);
  it('deleteCache calls del', async () => {
    await deleteCache('test');
    expect(redisConnection.del).toHaveBeenCalledWith('test');
  });
  it('deleteCache catches error', async () => {
    redisConnection.del.mockRejectedValueOnce(new Error('err'));
    await deleteCache('test');
  });
});
