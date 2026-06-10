const getHrvStatusAndRmssd = (stressScore) => {
  if (stressScore <= 25) return { status: 'high', rmssd: 80 + ((25 - stressScore) / 25) * 40 };
  if (stressScore <= 50) return { status: 'balanced', rmssd: 40 + ((50 - stressScore) / 25) * 40 };
  if (stressScore <= 75) return { status: 'low', rmssd: 20 + ((75 - stressScore) / 25) * 20 };
  return { status: 'low', rmssd: 5 + ((100 - stressScore) / 25) * 15 };
};

const deriveHrvFromStress = (stressScore) => {
  if (stressScore === undefined || stressScore === null) return null;
  const { status, rmssd } = getHrvStatusAndRmssd(stressScore);
  return { hrv_rmssd: Math.round(rmssd), hrv_status: status };
};

const enrichManualHrv = (enriched) => {
  enriched.hrv_source = 'manual';
  if (enriched.hrv_status) return;
  if (enriched.hrv_rmssd > 80) enriched.hrv_status = 'high';
  else if (enriched.hrv_rmssd > 40) enriched.hrv_status = 'balanced';
  else enriched.hrv_status = 'low';
};

const enrichBiometricsEntry = (data) => {
  const enriched = { ...data };
  const hasStress = enriched.stress_score !== undefined && enriched.stress_score !== null;
  const noHrv = enriched.hrv_rmssd === undefined || enriched.hrv_rmssd === null;
  if (hasStress && noHrv) {
    const derived = deriveHrvFromStress(enriched.stress_score);
    if (derived) Object.assign(enriched, { ...derived, hrv_source: 'derived_from_stress' });
  } else if (!noHrv) {
    enrichManualHrv(enriched);
  }
  return enriched;
};

module.exports = { deriveHrvFromStress, enrichBiometricsEntry };
