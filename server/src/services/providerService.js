const VERDICTS = ['clean', 'suspicious', 'malicious'];

async function lookupReputation(indicator, indicatorType) {
  // Replace this deterministic-latency mock with the real provider integration.
  await new Promise((resolve) => setTimeout(resolve, 150));
  return VERDICTS[Math.floor(Math.random() * VERDICTS.length)];
}

module.exports = { lookupReputation };
