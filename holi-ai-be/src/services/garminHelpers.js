const deriveHrvFromStress = (stressScore) => {
  if (stressScore === undefined || stressScore === null) return null;
  
  let hrv_status;
  let hrv_rmssd;

  if (stressScore <= 25) {
    hrv_status = 'high';
    hrv_rmssd = 80 + ((25 - stressScore) / 25) * 40; // 80 - 120
  } else if (stressScore <= 50) {
    hrv_status = 'balanced';
    hrv_rmssd = 40 + ((50 - stressScore) / 25) * 40; // 40 - 80
  } else if (stressScore <= 75) {
    hrv_status = 'low';
    hrv_rmssd = 20 + ((75 - stressScore) / 25) * 20; // 20 - 40
  } else {
    hrv_status = 'low';
    hrv_rmssd = 5 + ((100 - stressScore) / 25) * 15; // 5 - 20
  }

  return { hrv_rmssd: Math.round(hrv_rmssd), hrv_status };
};

const enrichGarminEntry = (data) => {
  const enriched = { ...data };
  
  if (enriched.stress_score !== undefined && enriched.stress_score !== null && (enriched.hrv_rmssd === undefined || enriched.hrv_rmssd === null)) {
    const derived = deriveHrvFromStress(enriched.stress_score);
    if (derived) {
      enriched.hrv_rmssd = derived.hrv_rmssd;
      enriched.hrv_status = derived.hrv_status;
      enriched.hrv_source = 'derived_from_stress';
    }
  } else if (enriched.hrv_rmssd !== undefined && enriched.hrv_rmssd !== null) {
    enriched.hrv_source = 'manual';
    if (!enriched.hrv_status) {
      if (enriched.hrv_rmssd > 80) enriched.hrv_status = 'high';
      else if (enriched.hrv_rmssd > 40) enriched.hrv_status = 'balanced';
      else enriched.hrv_status = 'low';
    }
  }
  
  return enriched;
};

module.exports = { deriveHrvFromStress, enrichGarminEntry };
