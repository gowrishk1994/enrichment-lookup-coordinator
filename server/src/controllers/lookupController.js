const lookupService = require('../services/lookupService');

async function createLookup(req, res, next) {
  try {
    const lookup = await lookupService.requestEnrichment({
      ...req.body,
      idempotencyKey: req.get('Idempotency-Key')
    });
    res.status(201).json(lookup);
  } catch (error) { next(error); }
}

async function runLookup(req, res, next) {
  try { res.json(await lookupService.runLookup(req.params.id)); }
  catch (error) { next(error); }
}

async function getLookupStatus(req, res, next) {
  try { res.json(await lookupService.getLookupStatus(req.params.id)); }
  catch (error) { next(error); }
}

async function getDashboard(req, res, next) {
  try { res.json(await lookupService.getDashboard()); }
  catch (error) { next(error); }
}

module.exports = { createLookup, runLookup, getLookupStatus, getDashboard };
