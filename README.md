# monitoringServers

A Node.js/TypeScript Express server demonstrating cluster-based multi-process scaling, worker threads for CPU-heavy tasks, in-memory rate limiting, and gzip-compressed XML streaming — instrumented with APM.

## Features

- **Cluster scaling** — forks one worker process per CPU core; auto-restarts crashed workers
- **Worker threads** — offloads CPU-bound tasks off the event loop via `worker_threads`
- **Custom rate limiter** — configurable in-memory sliding-window rate limiter (no Redis required)
- **Gzip XML streaming** — chunked, compressed XML response for large payload testing
- **APM instrumentation** — integrated with `apminsight` for request tracing and performance monitoring

## Prerequisites

- Node.js >= 18
- pnpm >= 10

## Installation

```bash
pnpm install
```

## Running

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development mode with hot-reload (nodemon + tsx) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output |
| `pnpm typecheck` | Type-check without emitting |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Port the server listens on |

## API Endpoints

| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| `GET` | `/` | 20 req/min | Fast health-check response |
| `GET` | `/slow` | 20 req/min | Delayed response (10 s) simulating slow I/O |
| `GET` | `/non-blocking` | 20 req/min | Instant non-blocking response |
| `GET` | `/xml-gzip` | 20 req/min | Streams 2000 items as gzip-compressed XML |
| `GET` | `/blocking` | 5 req/min | CPU-heavy counter split across worker threads |

## Architecture

```
Primary Process (cluster.isPrimary)
│
├── Worker Process 1  →  Express app  →  Routes
├── Worker Process 2  →  Express app  →  Routes
│        …
└── Worker Process N  →  Express app  →  Routes
                                              │
                                    /blocking spawns
                                    Worker Threads (two-worker.js)
```

- The primary process only manages forking and restarting workers.
- Each worker runs a full Express instance, load-balanced by the OS via the shared port.
- The `/blocking` route spawns `THREAD_COUNT` (default: 2) worker threads and aggregates their results.

## Project Structure

```
.
├── index.ts               # Entry point — cluster + Express server
├── two-worker.js          # Worker thread script for CPU tasks
├── middleware/
│   └── customRateLimiter.ts   # In-memory sliding-window rate limiter
├── package.json
└── tsconfig.json
```
