const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const lookupRoutes = require('./routes/lookupRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', lookupRoutes);
app.use(errorHandler);

module.exports = app;
