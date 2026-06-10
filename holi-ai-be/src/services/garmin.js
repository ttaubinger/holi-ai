const { fetchConfig } = require('./db');
const { decryptSecret } = require('./crypto');

const getGarminAuthUrl = async () => {
  const encId = await fetchConfig(null, 'GARMIN_CLIENT_ID');
  if (!encId) throw new Error('Missing GARMIN_CLIENT_ID in system config');
  const clientId = decryptSecret(encId);
  return `https://connect.garmin.com/oauthConfirm?oauth_token=request_token_placeholder_${clientId}`;
};

const processGarminWebhook = async (payload) => {
  if (!payload) return;
  const encSecret = await fetchConfig(null, 'GARMIN_CLIENT_SECRET');
  if (!encSecret) throw new Error('Missing GARMIN_CLIENT_SECRET in system config');
  
  if (payload.dailies) {
    for (const d of payload.dailies) console.log(`Garmin Daily: ${d.steps} steps`);
  }
  if (payload.sleeps) {
    for (const s of payload.sleeps) console.log(`Garmin Sleep: ${s.durationInSeconds}s`);
  }
};

module.exports = { getGarminAuthUrl, processGarminWebhook };
