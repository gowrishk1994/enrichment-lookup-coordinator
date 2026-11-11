const express = require('express');
const controller = require('../controllers/lookupController');
const { validateEnrichment } = require('../middleware/validateRequest');

const router = express.Router();
router.get('/quota', controller.getDashboard);
router.post('/lookups', validateEnrichment, controller.createLookup);
router.post('/lookups/:id/run', controller.runLookup);
router.get('/lookups/:id', controller.getLookupStatus);

module.exports = router;
