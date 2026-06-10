const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const getMasterKey = () => {
  const seed = process.env.DATABASE_URL || process.env.SUPABASE_KEY || 'default-secret-seed';
  return crypto.createHash('sha256').update(seed).digest();
};

const encryptSecret = (text) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getMasterKey(), iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${enc}`;
};

const decryptSecret = (cipherText) => {
  const [ivHex, authTagHex, encHex] = cipherText.split(':');
  if (!ivHex || !authTagHex || !encHex) return cipherText;
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, getMasterKey(), iv);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let dec = decipher.update(encHex, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
};

module.exports = { encryptSecret, decryptSecret };
