const fs = require('node:fs');
const path = require('node:path');
const { DataTypes, Op, Sequelize, Transaction } = require('sequelize');

const configuredPath = process.env.DATABASE_PATH;
const databaseUrl = process.env.DATABASE_URL;
const databasePath = configuredPath === ':memory:'
  ? configuredPath
  : configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(__dirname, '../../data/enrichment.sqlite');

if (!databaseUrl && databasePath !== ':memory:') {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

const sequelizeOptions = {
  logging: process.env.NODE_ENV === 'development' && process.env.SQL_LOGGING === 'true'
    ? (sql) => console.debug(`[sequelize] ${sql}`)
    : false,
  pool: databaseUrl
    ? { max: 10, min: 0, acquire: 30000, idle: 10000 }
    : { max: 1, min: 0, acquire: 30000, idle: 1000 }
};

const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
    ...sequelizeOptions,
    dialect: 'postgres',
    dialectOptions: process.env.DATABASE_SSL === 'true'
      ? {
        ssl: {
          require: true,
          rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'
        }
      }
      : {}
  })
  : new Sequelize({
    ...sequelizeOptions,
    dialect: 'sqlite',
    storage: databasePath
  });

const dialect = sequelize.getDialect();

const Quota = sequelize.define('Quota', {
  id: { type: DataTypes.INTEGER, primaryKey: true },
  dailyLimit: { type: DataTypes.INTEGER, allowNull: false, field: 'daily_limit', validate: { min: 0 } },
  available: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  consumed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  quotaDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'quota_date' },
  createdAt: { type: DataTypes.DATE, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, field: 'updated_at' }
}, {
  tableName: 'quota',
  timestamps: false,
  validate: {
    quotaWithinDailyLimit() {
      if (this.available + this.consumed > this.dailyLimit) {
        throw new Error('Available and consumed quota cannot exceed the daily limit.');
      }
    }
  }
});

const LookupRequest = sequelize.define('LookupRequest', {
  id: { type: DataTypes.UUID, primaryKey: true },
  analystId: { type: DataTypes.STRING(120), allowNull: false, field: 'analyst_id' },
  idempotencyKey: { type: DataTypes.STRING(200), allowNull: false, field: 'idempotency_key' },
  indicator: { type: DataTypes.STRING(255), allowNull: false },
  indicatorType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'indicator_type',
    validate: { isIn: [['ip', 'domain', 'hash']] }
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: { isIn: [['queued', 'leased', 'completed', 'expired']] }
  },
  leaseExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'lease_expires_at' },
  reputation: { type: DataTypes.STRING(30), allowNull: true },
  createdAt: { type: DataTypes.DATE, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, field: 'updated_at' }
}, {
  tableName: 'lookup_requests',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    { unique: true, fields: ['analyst_id', 'idempotency_key'], name: 'lookup_requests_analyst_idempotency' },
    dialect === 'postgres'
      ? {
        unique: true,
        fields: [Sequelize.fn('LOWER', Sequelize.col('indicator'))],
        where: { status: { [Op.in]: ['queued', 'leased'] } },
        name: 'one_active_lookup_per_indicator'
      }
      : {
        unique: true,
        fields: [{ attribute: 'indicator', collate: 'NOCASE' }],
        where: { status: { [Op.in]: ['queued', 'leased'] } },
        name: 'one_active_lookup_per_indicator'
      },
    {
      fields: ['lease_expires_at'],
      where: { status: 'leased' },
      name: 'lookup_expiry_idx'
    },
    { fields: ['created_at'], name: 'lookup_created_idx' }
  ]
});

const LookupIdempotencyKey = sequelize.define('LookupIdempotencyKey', {
  analystId: { type: DataTypes.STRING(120), primaryKey: true, allowNull: false, field: 'analyst_id' },
  idempotencyKey: { type: DataTypes.STRING(200), primaryKey: true, allowNull: false, field: 'idempotency_key' },
  requestId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'request_id',
    references: { model: 'lookup_requests', key: 'id' },
    onDelete: 'CASCADE'
  },
  createdAt: { type: DataTypes.DATE, field: 'created_at' }
}, {
  tableName: 'lookup_idempotency_keys',
  timestamps: false
});

const WaitingQueue = sequelize.define('WaitingQueue', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  requestId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    field: 'request_id',
    references: { model: 'lookup_requests', key: 'id' },
    onDelete: 'CASCADE'
  },
  queuedAt: { type: DataTypes.DATE, allowNull: false, field: 'queued_at', defaultValue: DataTypes.NOW }
}, {
  tableName: 'waiting_queue',
  timestamps: false,
  indexes: [{ fields: ['queued_at', 'id'], name: 'waiting_queue_fifo_idx' }]
});

LookupRequest.hasMany(LookupIdempotencyKey, { foreignKey: 'requestId', as: 'idempotencyKeys' });
LookupIdempotencyKey.belongsTo(LookupRequest, { foreignKey: 'requestId', as: 'request' });
LookupRequest.hasOne(WaitingQueue, { foreignKey: 'requestId', as: 'queueEntry' });
WaitingQueue.belongsTo(LookupRequest, { foreignKey: 'requestId', as: 'request' });

const ready = sequelize.sync().then(async () => {
  await Quota.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      dailyLimit: 10,
      available: 10,
      consumed: 0,
      quotaDate: new Date().toISOString().slice(0, 10)
    }
  });
});

let transactionQueue = Promise.resolve();

async function serializeTransaction(work) {
  const previous = transactionQueue;
  let release;
  transactionQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

module.exports = {
  sequelize,
  dialect,
  ready,
  serializeTransaction,
  Quota,
  LookupRequest,
  LookupIdempotencyKey,
  WaitingQueue,
  Op,
  fn: Sequelize.fn,
  col: Sequelize.col,
  Transaction
};
