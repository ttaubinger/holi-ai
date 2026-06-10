let keepAliveTimer = null;

const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;

const getKeepAliveUrl = () => {
  const externalHost = process.env.RENDER_EXTERNAL_HOSTNAME;
  if (externalHost) return `https://${externalHost}/`;
  const port = process.env.PORT || 4000;
  return `http://localhost:${port}/`;
};

const startKeepAlive = () => {
  if (keepAliveTimer) return;
  const url = getKeepAliveUrl();
  keepAliveTimer = setInterval(async () => {
    try {
      await fetch(url);
    } catch (_error) { /* expected */ }
  }, KEEP_ALIVE_INTERVAL_MS);
  keepAliveTimer.unref();
};

const stopKeepAlive = () => {
  if (!keepAliveTimer) return;
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
};

module.exports = { startKeepAlive, stopKeepAlive };
