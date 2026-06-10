const { redisConnection } = require('./queue');

const getCache = async (key) => {
  try {
    const data = await redisConnection.get(key);
    return data ? JSON.parse(data) : null;
  } catch (_err) {
    return null;
  }
};

const setCache = async (key, value, ttlSeconds = 86400) => {
  try {
    await redisConnection.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (_err) {
    return null;
  }
};

const deleteCache = async (key) => {
  try {
    await redisConnection.del(key);
  } catch (_err) {
    return null;
  }
};

module.exports = { getCache, setCache, deleteCache };
