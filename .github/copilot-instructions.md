# GitHub Copilot Instructions

This document provides context ensuring AI coding agents can work effectively in this codebase.

## 🏗 Project Architecture & Overview

- **Stack**: Node.js (ESM), Express.js, PostgreSQL, Prisma ORM.
- **Entry Point**: `server.js` initializes the Express app, middleware (CORS, JSON), and imports routes/jobs.
- **Database**: 
  - Defined in `prisma/schema.prisma`.
  - **CRITICAL**: The Prisma Client is generated to a custom location: `generated/prisma/`.
  - **Import Pattern**: ALWAYS import Prisma Client from the generated path:
    ```javascript
    import { PrismaClient } from '../generated/prisma/index.js'; // Adjust relative path as needed
    ```
- **Service Layer**:
  - `routes/`: Handles HTTP requests (controllers). some route files export helper functions for other routes (e.g., `createTransactionCashFlow` in `routes/cashFlows.js`).
  - `services/`: Encapsulates complex business logic (e.g., portfolio analysis in `portfolioService.js`).
  - `jobs/`: Scheduled background tasks (e.g., `dailyPortfolioCheck.js`) using `node-cron`.
  - `utils/`: Shared utilities (e.g., `emailService.js`).

## 🛠 Developer Workflow & Commands

- **Run Server**: `npm start` (runs `node server.js`).
- **Prisma**:
  - Update Schema: Modify `prisma/schema.prisma`.
  - Generate Client: `npx prisma generate` (Required after schema changes).
  - Migrations: `npx prisma migrate deploy` (or `dev` for local dev).
- **Environment**:
  - Configuration via `.env`.
  - `NODE_ENV=development` enables localhost CORS in `server.js`.

## 📝 Coding Conventions & Patterns

- **Modules**: Use ES Modules (`import`/`export`). **Always include `.js` extension** for local imports.
- **Database Access**:
  - Instantiate `PrismaClient` locally in files where needed: `const prisma = new PrismaClient();`.
  - *Note*: `server.js` attaches `req.prisma`, but widely established pattern is local instantiation.
- **Route Handlers**:
  - Use `async/await`.
  - Wrap logic in `try/catch` blocks.
  - Return `res.status(500).json({ message: 'Internal server error' })` on failure.
  - Validate required fields (like `uid`) manually at the start of the handler.
- **Authentication/User Context**:
  - API endpoints often expect `uid` (String) in query params or body to identify the user.
  - Queries generally filter by `uid` (e.g., `prisma.transactions.findMany({ where: { uid } })`).

## 🧩 Key Integration Points

- **External Data**: `yahoo-finance2` is used for fetching stock prices and market data.
- **Scheduling**: `node-cron` in `jobs/` handles periodic tasks (e.g., daily portfolio checks at 15:30).
- **Cross-Component Logic**:
  - Transaction creation (`routes/transactions.js`) may trigger cash flow updates via `createTransactionCashFlow` imported from `routes/cashFlows.js`.
  - Background jobs import logic from `services/` and `routes/` to perform maintenance.

## ⚠️ Gotchas

- **Prisma Path**: Do NOT import `@prisma/client` directly. structure imports to point to `../generated/prisma/index.js`.
- **Foreign Keys**: `uid` in tables links to `users.uid`. Check constraints carefully when creating related records.
- **Circular Dependencies**: Be cautious when importing between route files (e.g., `transactions.js` <-> `cashFlows.js`).
