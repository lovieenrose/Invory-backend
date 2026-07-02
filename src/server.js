const app = require('./app');
const env = require('./config/env');
const { scheduleRateUpdates } = require('./services/exchangeRateService');

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Invory API running in ${env.nodeEnv} mode on port ${env.port}`);

  // Initialize exchange rate updates (every 60 minutes)
  if (env.nodeEnv !== 'test') {
    scheduleRateUpdates(60);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  // eslint-disable-next-line no-console
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => process.exit(0));
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection:', reason);
  server.close(() => process.exit(1));
});
