require('dotenv').config();
const app = require('./app');
const { ready, sequelize } = require('./config/database');
const { processExpiredLeases } = require('./services/lookupService');

const port = Number(process.env.PORT || 4000);
const interval = Number(process.env.EXPIRY_CHECK_INTERVAL_MS || 1000);

async function start() {
  await ready;
  const server = app.listen(port, () => console.log(`API listening on port ${port}`));
  const expiryTimer = setInterval(() => {
    processExpiredLeases().catch((error) => console.error('Lease expiry processing failed:', error));
  }, interval);
  expiryTimer.unref();

  const shutdown = () => {
    clearInterval(expiryTimer);
    server.close(async () => { await sequelize.close(); process.exit(0); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => { console.error('Server startup failed:', error); process.exit(1); });
