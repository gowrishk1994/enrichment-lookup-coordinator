const { randomUUID } = require('node:crypto');
const {
  sequelize,
  dialect,
  serializeTransaction,
  Quota,
  LookupRequest,
  LookupIdempotencyKey,
  WaitingQueue,
  Op,
  fn,
  col,
  Transaction
} = require('../config/database');
const { lookupReputation } = require('./providerService');
const HttpError = require('../utils/httpError');

const LEASE_MINUTES = Number(process.env.LEASE_DURATION_MINUTES || 5);

function leaseExpiration() {
  return new Date(Date.now() + LEASE_MINUTES * 60 * 1000);
}

async function withQuotaLock(work) {
  const runTransaction = () => sequelize.transaction(
    dialect === 'sqlite' ? { type: Transaction.TYPES.IMMEDIATE } : {},
    async (transaction) => {
      const lockOptions = dialect === 'postgres'
        ? { transaction, lock: transaction.LOCK.UPDATE }
        : { transaction };
      await Quota.findByPk(1, lockOptions);
      await ensureQuotaDay(transaction);
      return work(transaction);
    }
  );
  return dialect === 'sqlite' ? serializeTransaction(runTransaction) : runTransaction();
}

async function ensureQuotaDay(transaction) {
  const quota = await Quota.findByPk(1, { transaction });
  const today = new Date().toISOString().slice(0, 10);
  if (quota.quotaDate >= today) return;

  await LookupRequest.update(
    { status: 'expired', leaseExpiresAt: null },
    { where: { status: 'leased' }, transaction }
  );
  await quota.update({ available: quota.dailyLimit, consumed: 0, quotaDate: today }, { transaction });
  await promoteQueue(transaction);
}

async function getQueuePosition(requestId, transaction) {
  const entries = await WaitingQueue.findAll({
    attributes: ['requestId'],
    order: [['queuedAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
  const index = entries.findIndex((entry) => entry.requestId === requestId);
  return index < 0 ? null : index + 1;
}

async function promoteQueue(transaction) {
  const quota = await Quota.findByPk(1, { transaction });
  while (quota.available > 0) {
    const next = await WaitingQueue.findOne({
      include: [{ model: LookupRequest, as: 'request', where: { status: 'queued' } }],
      order: [['queuedAt', 'ASC'], ['id', 'ASC']],
      transaction
    });
    if (!next) break;

    await next.request.update({ status: 'leased', leaseExpiresAt: leaseExpiration() }, { transaction });
    await next.destroy({ transaction });
    quota.available -= 1;
    await quota.save({ fields: ['available'], transaction });
  }
}

async function expireLeases(transaction) {
  const expired = await LookupRequest.findAll({
    attributes: ['id'],
    where: { status: 'leased', leaseExpiresAt: { [Op.lte]: new Date() } },
    order: [['leaseExpiresAt', 'ASC']],
    transaction
  });
  if (!expired.length) return 0;

  await LookupRequest.update(
    { status: 'expired', leaseExpiresAt: null },
    { where: { id: { [Op.in]: expired.map((request) => request.id) } }, transaction }
  );
  await Quota.increment('available', { by: expired.length, where: { id: 1 }, transaction });
  await promoteQueue(transaction);
  return expired.length;
}

async function formatRequest(request, transaction) {
  return {
    id: request.id,
    indicator: request.indicator,
    indicatorType: request.indicatorType,
    status: request.status,
    leaseExpiresAt: request.leaseExpiresAt,
    reputation: request.reputation,
    queuePosition: request.status === 'queued'
      ? await getQueuePosition(request.id, transaction)
      : null
  };
}

async function requestEnrichment({ analystId, indicator, indicatorType, idempotencyKey }) {
  return withQuotaLock(async (transaction) => {
    await expireLeases(transaction);

    const previous = await LookupIdempotencyKey.findOne({
      where: { analystId, idempotencyKey },
      include: [{ model: LookupRequest, as: 'request' }],
      transaction
    });
    if (previous) return formatRequest(previous.request, transaction);

    const active = await LookupRequest.findOne({
      where: {
        [Op.and]: sequelize.where(fn('lower', col('indicator')), indicator.toLowerCase()),
        status: { [Op.in]: ['queued', 'leased'] }
      },
      order: [['createdAt', 'ASC']],
      transaction
    });
    if (active) {
      await LookupIdempotencyKey.create(
        { analystId, idempotencyKey, requestId: active.id },
        { transaction }
      );
      return formatRequest(active, transaction);
    }

    const queueExists = await WaitingQueue.count({ transaction });
    const quota = await Quota.findByPk(1, { transaction });
    const hasSlot = quota.available > 0 && queueExists === 0;
    const id = randomUUID();
    const status = hasSlot ? 'leased' : 'queued';
    const created = await LookupRequest.create({
      id,
      analystId,
      idempotencyKey,
      indicator,
      indicatorType,
      status,
      leaseExpiresAt: hasSlot ? leaseExpiration() : null
    }, { transaction });

    await LookupIdempotencyKey.create(
      { analystId, idempotencyKey, requestId: id },
      { transaction }
    );

    if (hasSlot) {
      quota.available -= 1;
      await quota.save({ fields: ['available'], transaction });
    } else {
      await WaitingQueue.create({ requestId: id }, { transaction });
    }
    return formatRequest(created, transaction);
  });
}

async function runLookup(requestId) {
  return withQuotaLock(async (transaction) => {
    await expireLeases(transaction);
    const request = await LookupRequest.findByPk(requestId, { transaction });
    if (!request) throw new HttpError(404, 'Lookup request not found.');
    if (request.status === 'completed') return formatRequest(request, transaction);
    if (request.status === 'expired') throw new HttpError(409, 'Lease expired. Request a new lookup.');
    if (request.status === 'queued') throw new HttpError(409, 'Lookup is still queued.');

    const reputation = await lookupReputation(request.indicator, request.indicatorType);
    await request.update({ status: 'completed', reputation, leaseExpiresAt: null }, { transaction });
    await Quota.increment('consumed', { by: 1, where: { id: 1 }, transaction });
    return formatRequest(request, transaction);
  });
}

async function getLookupStatus(requestId) {
  const request = await LookupRequest.findByPk(requestId);
  if (!request) throw new HttpError(404, 'Lookup request not found.');
  return formatRequest(request);
}

async function getDashboard() {
  const [quota, waiting] = await Promise.all([
    Quota.findByPk(1),
    WaitingQueue.count()
  ]);
  return {
    daily_limit: quota.dailyLimit,
    available: quota.available,
    consumed: quota.consumed,
    waiting
  };
}

async function processExpiredLeases() {
  return withQuotaLock(expireLeases);
}

module.exports = { requestEnrichment, runLookup, getLookupStatus, getDashboard, processExpiredLeases };
