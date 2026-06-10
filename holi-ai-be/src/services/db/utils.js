const cosineDistance = (v1, v2) => {
  if (!v1 || !v2 || v1.length !== v2.length) return 2;
  let dot = 0;
  for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
  return 1 - dot;
};

module.exports = { cosineDistance };
