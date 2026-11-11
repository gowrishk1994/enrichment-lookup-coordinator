const HttpError = require('../utils/httpError');

function validateEnrichment(req, res, next) {
  const { analystId, indicator, indicatorType } = req.body || {};
  const idempotencyKey = req.get('Idempotency-Key');

  if (!analystId || typeof analystId !== 'string' || analystId.length > 120) {
    return next(new HttpError(400, 'analystId is required (maximum 120 characters).'));
  }
  if (!indicator || typeof indicator !== 'string' || indicator.length > 255) {
    return next(new HttpError(400, 'indicator is required (maximum 255 characters).'));
  }
  if (!['ip', 'domain', 'hash'].includes(indicatorType)) {
    return next(new HttpError(400, 'indicatorType must be ip, domain, or hash.'));
  }
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return next(new HttpError(400, 'A valid Idempotency-Key header is required.'));
  }
  req.body.indicator = indicator.trim();
  next();
}

module.exports = { validateEnrichment };
