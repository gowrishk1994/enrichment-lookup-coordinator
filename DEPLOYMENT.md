# Deployment

## Requirements

- Docker Engine or Docker Desktop with the Compose plugin.
- For PostgreSQL deployments, a reachable PostgreSQL database and a connection URL.

## Deploy with SQLite

1. From the project root, build and start the services:

   ```bash
   docker compose up --build -d
   ```

2. Open <http://localhost:8080>.

The server creates `/app/data/enrichment.sqlite` and initializes the tables on startup. It inserts the initial quota row with 10 slots only if that row does not already exist. SQLite data persists in the `server_data` Docker volume. Use one server instance with SQLite.

## Deploy with PostgreSQL

1. Create a PostgreSQL database and a user that can create and use tables in it.
2. Set `DATABASE_URL` in the environment where Docker Compose runs. For example, in PowerShell:

   ```powershell
   $env:DATABASE_URL = "postgres://user:password@db-host:5432/enrichment"
   ```

3. If the database requires TLS, configure:

   ```powershell
   $env:DATABASE_SSL = "true"
   $env:DATABASE_SSL_REJECT_UNAUTHORIZED = "true"
   ```

4. Build and start the services:

   ```bash
   docker compose up --build -d
   ```

5. Open <http://localhost:8080>.

When `DATABASE_URL` is set, it takes precedence over `DATABASE_PATH`. At startup Sequelize creates missing tables and indexes and inserts the initial quota row if it does not exist. No separate migration or seed command is required. PostgreSQL supports multiple API instances sharing the same database.

For repeated deployments, store database credentials in the deployment platform's secret manager instead of committing them to a `.env` file.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | Empty | PostgreSQL connection URL. Empty selects SQLite. |
| `DATABASE_PATH` | `/app/data/enrichment.sqlite` in Docker | SQLite database file path; ignored when `DATABASE_URL` is set. |
| `DATABASE_SSL` | `false` | Enable TLS for PostgreSQL. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | Verify the PostgreSQL TLS certificate. |
| `PORT` | `4000` | API port inside the server container. |
| `LEASE_DURATION_MINUTES` | `5` | Lease duration. |
| `EXPIRY_CHECK_INTERVAL_MS` | `1000` | Lease expiry check interval. |

`NODE_ENV` is set to `production` by the Compose file.

## Stop services

Stop containers and retain SQLite data:

```bash
docker compose down
```

Remove containers and the SQLite volume (deletes its data):

```bash
docker compose down -v
```

## Schema and data

The application initializes the Sequelize schema and quota seed at startup. This is automatic table synchronization, not a versioned migration system. Before deploying schema changes to a database with important data, back it up and verify the changes against a copy first. Changing from SQLite to PostgreSQL selects a separate database; it does not copy data between them.
