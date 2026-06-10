const stripMarkdownFences = (str) => {
  if (!str.startsWith('```')) return str;
  const lines = str.split('\n');
  if (lines.length > 2) {
    lines.shift();
    if (lines[lines.length - 1].startsWith('```')) lines.pop();
    return lines.join('\n');
  }
  return str;
};

const parseCandidate = (str) => {
  try { return JSON.parse(str); } catch (_e) { return null; }
};

const parseBoundaries = (str, startChar, endChar) => {
  const first = str.indexOf(startChar);
  const last = str.lastIndexOf(endChar);
  if (first >= 0 && last > first) return parseCandidate(str.substring(first, last + 1));
  return null;
};

const repairUnescapedNewlinesInJSON = (jsonStr) => {
  let isStr = false, isEsc = false;
  return jsonStr.replace(/./sg, (c) => {
    if (c === '"' && !isEsc) isStr = !isStr;
    else if (c === '\\') isEsc = !isEsc;
    else isEsc = false;
    if (!isStr) return c;
    return c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : c;
  });
};

const extractJsonFromString = (text) => {
  if (typeof text !== 'string') return text;
  const str = stripMarkdownFences(text.trim());
  if (str !== text.trim()) return extractJsonFromString(str);
  
  const repairedStr = repairUnescapedNewlinesInJSON(str);
  const parsed = parseCandidate(repairedStr) || parseBoundaries(repairedStr, '{', '}') || parseBoundaries(repairedStr, '[', ']');
  if (parsed) return parsed;
  
  throw new Error('Failed to extract or parse JSON from the provided text.');
};

const safeJsonParse = (input, fallback = null) => {
  if (!input) return fallback;
  if (typeof input === 'object') return input;
  try {
    return extractJsonFromString(input);
  } catch (_e) {
    return fallback;
  }
};

module.exports = { extractJsonFromString, safeJsonParse };
