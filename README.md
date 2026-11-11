# Enrichment Lookup Coordinator

A full-stack app that safely shares a daily limit of 10 threat-intelligence lookups. Analysts can request enrichment for an IP, domain, or file hash. Requests reserve a provider slot for five minutes or wait in a FIFO queue.

## Tech stack

- **Frontend:** React, Vite, Nginx
- **Backend:** Node.js, Express, Sequelize
- **Database:** SQLite by default, or PostgreSQL when `DATABASE_URL` is set
- **Runtime:** Docker Compose or Node.js 20+

