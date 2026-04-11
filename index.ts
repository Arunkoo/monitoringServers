import cluster from "cluster";
import os from "os";
import AgentAPI from "apminsight";
import express from "express";
import customRateLimiter from "./middleware/customRateLimiter.js";
import { Worker } from "worker_threads";
import Zlib from "zlib";

// ── Constants ────────────────────────────────────────────────────────────────
const NUM_CPUS = os.cpus().length;
const PORT = Number(process.env.PORT) || 8000;
const THREAD_COUNT = 2;
const WORKER_SCRIPT = new URL("./two-worker.js", import.meta.url);
const WORKER_DATA = { thread_count: THREAD_COUNT };
const WINDOW_MS = 60_000; // 1 minute

// ── Worker helper ─────────────────────────────────────────────────────────────
function createWorker(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, { workerData: WORKER_DATA });

    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

// ── Server setup ──────────────────────────────────────────────────────────────
function startServer(): void {
  const app = express();

  AgentAPI.config();
  app.set("trust proxy", 1);
  app.use(express.json());

  console.log(`Worker process started: PID ${process.pid}`);

  const appLimiter = customRateLimiter({ windowMs: WINDOW_MS, maxRequest: 20 });
  const blockingLimiter = customRateLimiter({ windowMs: WINDOW_MS, maxRequest: 5 });

  app.use(appLimiter);

  // GET / — health / fast response
  app.get("/", (_req, res) => {
    res.json({ message: "Hello World", pid: process.pid });
  });

  // GET /slow — simulates a delayed response (10 s)
  app.get("/slow", (_req, res) => {
    setTimeout(() => {
      res.json({ message: "Slow API", pid: process.pid });
    }, 10_000);
  });

  // GET /non-blocking — instant I/O-safe response
  app.get("/non-blocking", (_req, res) => {
    res.send(`data is processed by PID ${process.pid}`);
  });

  // GET /xml-gzip — streams gzip-compressed XML (intentional bug reproduction route)
  app.get("/xml-gzip", (_req, res) => {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Encoding", "gzip");

    const gzip = Zlib.createGzip();
    gzip.pipe(res);

    gzip.write('<?xml version="1.0" encoding="UTF-8"?>\n<root>\n');

    let i = 1;
    const interval = setInterval(() => {
      for (let j = 0; j < 20; j++) {
        gzip.write(`  <item id="${i}">Value ${i} हिन्दी € &amp; data</item>\n`);
        i++;
      }

      if (i > 2000) {
        clearInterval(interval);
        gzip.write("</root>\n");
        gzip.end();
      }
    }, 50);

    res.on("close", () => clearInterval(interval));
  });

  // GET /blocking — CPU-heavy task offloaded to worker threads
  app.get("/blocking", blockingLimiter, async (_req, res) => {
    try {
      const threadResults = await Promise.all(
        Array.from({ length: THREAD_COUNT }, createWorker),
      );
      const total = threadResults.reduce((sum, value) => sum + value, 0);

      res.json({ message: "CPU task completed", total, handledByProcess: process.pid });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: "Worker thread error", error: message, handledByProcess: process.pid });
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} | PID ${process.pid}`);
  });
}

// ── Cluster bootstrap ─────────────────────────────────────────────────────────
if (cluster.isPrimary) {
  console.log(`Primary process started: PID ${process.pid}`);
  console.log(`Forking ${NUM_CPUS} worker processes...`);

  for (let i = 0; i < NUM_CPUS; i++) cluster.fork();

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (code=${code}, signal=${signal}). Restarting...`);
    cluster.fork();
  });
} else {
  startServer();
}
