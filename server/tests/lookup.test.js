require('dotenv').config();
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testDatabasePath = path.join(os.tmpdir(), `enrichment-lookup-${process.pid}.sqlite`);
if (process.env.DATABASE_URL) {
  delete process.env.DATABASE_PATH;
} else {
  process.env.DATABASE_PATH = testDatabasePath;
}
const {
  sequelize,
  ready,
  Quota,
  LookupRequest,
  LookupIdempotencyKey,
  WaitingQueue
} = require('../src/config/database');
const app = require('../src/app');

async function resetDatabase() {
  await WaitingQueue.destroy({ where: {} });
  await LookupIdempotencyKey.destroy({ where: {} });
  await LookupRequest.destroy({ where: {} });
  await Quota.update(
    { dailyLimit: 10, available: 10, consumed: 0, quotaDate: new Date().toISOString().slice(0, 10) },
    { where: { id: 1 } }
  );
}

before(async () => {
  await ready;
  await resetDatabase();
});

after(async () => {
  await sequelize.close();
  if (!process.env.DATABASE_URL && fs.existsSync(testDatabasePath)) fs.unlinkSync(testDatabasePath);
});

test('200 concurrent requests never reserve more than the 10 available slots', async () => {
  const responses = await Promise.all(Array.from({ length: 200 }, (_, index) =>
    request(app).post('/api/lookups')
      .set('Idempotency-Key', `concurrency-${index}`)
      .send({ analystId: `analyst-${index}`, indicator: `192.0.2.${index + 1}`, indicatorType: 'ip' })
  ));

  assert.ok(responses.every((response) => response.status === 201));
  const [quota, statuses, waiting] = await Promise.all([
    Quota.findByPk(1),
    LookupRequest.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true
    }),
    WaitingQueue.count()
  ]);
  const counts = Object.fromEntries(statuses.map((row) => [row.status, Number(row.count)]));
  assert.equal(quota.available, 0);
  assert.equal(counts.leased, 10);
  assert.equal(counts.queued, 190);
  assert.equal(waiting, 190);
});

test('same idempotency key returns the same request without reserving another slot', async () => {
  await resetDatabase();
  const payload = { analystId: 'analyst-repeat', indicator: '203.0.113.10', indicatorType: 'ip' };
  const first = await request(app).post('/api/lookups').set('Idempotency-Key', 'retry-key').send(payload);
  const retry = await request(app).post('/api/lookups').set('Idempotency-Key', 'retry-key').send(payload);
  const quota = await Quota.findByPk(1);
  assert.equal(first.body.id, retry.body.id);
  assert.equal(quota.available, 9);
});

test('same active indicator is not reserved twice, even with a different key', async () => {
  await resetDatabase();
  const payload = { analystId: 'analyst-a', indicator: 'Example.COM', indicatorType: 'domain' };
  const first = await request(app).post('/api/lookups').set('Idempotency-Key', 'key-a').send(payload);
  const second = await request(app).post('/api/lookups').set('Idempotency-Key', 'key-b').send({ ...payload, indicator: 'example.com' });
  const quota = await Quota.findByPk(1);
  assert.equal(first.body.id, second.body.id);
  assert.equal(quota.available, 9);
});

test('same queued indicator is not added to the queue twice', async () => {
  await resetDatabase();
  await Quota.update({ available: 0 }, { where: { id: 1 } });
  const first = await request(app).post('/api/lookups').set('Idempotency-Key', 'queued-key-a')
    .send({ analystId: 'analyst-a', indicator: 'Queued.Example', indicatorType: 'domain' });
  const duplicate = await request(app).post('/api/lookups').set('Idempotency-Key', 'queued-key-b')
    .send({ analystId: 'analyst-b', indicator: 'queued.example', indicatorType: 'domain' });

  assert.equal(first.body.status, 'queued');
  assert.equal(first.body.id, duplicate.body.id);
  assert.equal(duplicate.body.queuePosition, 1);
  assert.equal(await WaitingQueue.count(), 1);
  assert.equal((await Quota.findByPk(1)).available, 0);
});

test('expired lease returns its slot and promotes queued requests in FIFO order', async () => {
  await resetDatabase();
  await Quota.update({ dailyLimit: 1, available: 1 }, { where: { id: 1 } });
  const first = await request(app).post('/api/lookups').set('Idempotency-Key', 'lease-a')
    .send({ analystId: 'analyst-a', indicator: '198.51.100.1', indicatorType: 'ip' });
  const second = await request(app).post('/api/lookups').set('Idempotency-Key', 'lease-b')
    .send({ analystId: 'analyst-b', indicator: '198.51.100.2', indicatorType: 'ip' });
  const third = await request(app).post('/api/lookups').set('Idempotency-Key', 'lease-c')
    .send({ analystId: 'analyst-c', indicator: '198.51.100.3', indicatorType: 'ip' });
  assert.equal(first.body.status, 'leased');
  assert.equal(second.body.status, 'queued');
  assert.equal(second.body.queuePosition, 1);
  assert.equal(third.body.status, 'queued');
  assert.equal(third.body.queuePosition, 2);

  await LookupRequest.update(
    { leaseExpiresAt: new Date(Date.now() - 1000) },
    { where: { id: first.body.id } }
  );
  await require('../src/services/lookupService').processExpiredLeases();
  const [firstStatus, secondStatus, thirdStatus, quota] = await Promise.all([
    request(app).get(`/api/lookups/${first.body.id}`),
    request(app).get(`/api/lookups/${second.body.id}`),
    request(app).get(`/api/lookups/${third.body.id}`),
    Quota.findByPk(1)
  ]);
  assert.equal(firstStatus.body.status, 'expired');
  assert.equal(secondStatus.body.status, 'leased');
  assert.equal(thirdStatus.body.status, 'queued');
  assert.equal(thirdStatus.body.queuePosition, 1);
  assert.equal(quota.available, 0);
});


test('idempotency key used for a deduplicated indicator remains valid after completion', async () => {
  await resetDatabase();
  const payload = { analystId: 'analyst-shared', indicator: '203.0.113.25', indicatorType: 'ip' };
  const original = await request(app).post('/api/lookups').set('Idempotency-Key', 'key-original').send(payload);
  const duplicate = await request(app).post('/api/lookups').set('Idempotency-Key', 'key-duplicate').send(payload);
  await request(app).post(`/api/lookups/${original.body.id}/run`);
  const retry = await request(app).post('/api/lookups').set('Idempotency-Key', 'key-duplicate').send(payload);
  const quota = await Quota.findByPk(1);
  assert.equal(original.body.id, duplicate.body.id);
  assert.equal(original.body.id, retry.body.id);
  assert.equal(quota.consumed, 1);
  assert.equal(quota.available, 9);
});
