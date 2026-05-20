# NestJS Backend Template

Production-ready NestJS REST API starter with authentication, MongoDB, Redis cache, analytics, Swagger, and CI/CD.

## What's included

- **Auth**: Cookie-based JWT (access + refresh), registration, login, logout, sessions
- **Users**: User persistence (used by auth)
- **Database**: MongoDB via Mongoose with startup connection validation
- **Cache**: Local in-memory or Redis (configurable)
- **Analytics**: Amplitude integration (optional)
- **Health**: `GET /healthcheck`
- **Swagger**: OpenAPI docs at `/api-docs` (configurable)
- **Common**: Global exception filter, validation pipes, decorators
- **CI/CD**: GitHub Actions (verify, SonarQube, deploy)
- **Local infra**: Docker Compose (MongoDB, Redis, Mongo Express)
- **Agent skills**: NestJS best practices in `.agents/skills/`

## Tech stack

- [NestJS](https://nestjs.com/)
- MongoDB + Mongoose
- Redis (optional distributed cache)
- JWT + bcryptjs
- Swagger
- class-validator / class-transformer
- Jest, ESLint, Prettier, Husky

## Prerequisites

- Node.js 25+
- Docker & Docker Compose (for local MongoDB and Redis)
- Yarn

## Quick start

1. Copy environment variables:

   ```bash
   cp env.example .env
   ```

2. Start local infrastructure:

   ```bash
   yarn compose:up
   ```

3. Install dependencies and run:

   ```bash
   yarn install
   yarn dev
   ```

4. Open Swagger at `http://localhost:3005/api-docs` (default port from `env.example`).

## Adding domain modules

Generate new feature modules with the Nest CLI:

```bash
npx nest g module features/my-feature
npx nest g controller features/my-feature
npx nest g service features/my-feature
```

Register the module in `src/app.module.ts`.

## Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `yarn dev`            | Development with hot-reload          |
| `yarn build`          | Compile to `dist/`                   |
| `yarn start:prod`     | Run compiled app                     |
| `yarn test`           | Unit tests                           |
| `yarn test:cov`       | Tests with coverage                  |
| `yarn lint`           | ESLint                               |
| `yarn format`         | Prettier                             |
| `yarn compose:up`     | Start MongoDB + Redis                |
| `yarn compose:down`   | Stop containers                      |
| `yarn security:check` | Fail on high/critical audit findings |

## API endpoints (template)

| Method | Path              | Description  |
| ------ | ----------------- | ------------ |
| POST   | `/users/register` | Register     |
| POST   | `/users/login`    | Login        |
| POST   | `/users/logout`   | Logout       |
| GET    | `/healthcheck`    | Health check |

## Deployment

Deploy workflow (`.github/workflows/deploy.yml`) builds, rsyncs to VPS, and starts via PM2. Configure GitHub secrets: `VPC_IP_ADDRESS`, `VPC_USERNAME`, `VPC_PASSWORD`, `ENV_FILE_CONTENT`.

Default deploy path: `/opt/huawei-health-ai-backend`. PM2 app name: `huawei-health-ai-backend`.

## Agent guidance

- `.cursor/rules/nest.mdc` — project conventions
- `.agents/skills/nestjs-best-practices/` — NestJS architecture rules
