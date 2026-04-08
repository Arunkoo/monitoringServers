import cluster from "cluster";
import os from "os";
import AgentAPI from "apminsight";
import express from "express";
// import rateLimit from "express-rate-limit";
import customRateLimiter from "./middleware/customRateLimiter.js";
import { Worker } from "worker_threads";
import Zlib from "zlib";
const numCPUs = os.cpus().length;
const port = process.env.PORT ?? 8000;
const THREAD_COUNT = 2;

function createWorker() {
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker(new URL("./two-worker.js", import.meta.url), {
      workerData: { thread_count: THREAD_COUNT },
    });

    worker.on("message", (data: number) => {
      resolve(data);
    });

    worker.on("error", (error) => {
      reject(error);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

function startServer() {
  const app = express();

  AgentAPI.config();
  app.set("trust proxy", 1);
  console.log(`Worker process started: PID ${process.pid}`);

  // General limiter for all routes
  const appLimiter = customRateLimiter({
    windowMs: 1 * 60 * 1000,
    maxRequest: 20,
  });

  // Strict limiter for blocking route
  const blockingLimiter = customRateLimiter({
    windowMs: 1 * 60 * 1000,
    maxRequest: 5,
  });

  // apply general limiter to all routes
  app.use(appLimiter);

  // fast api
  app.get("/", (req, res) => {
    return res.json({
      message: "Hello World",
      pid: process.pid,
    });
  });

  // slow api
  app.get("/slow", (req, res) => {
    setTimeout(() => {
      return res.json({
        message: "Slow API",
        pid: process.pid,
      });
    }, 10 * 1000);
  });

  // non-blocking task
  app.get("/non-blocking", (req, res) => {
    res.status(200).send(`data is processed by PID ${process.pid}`);
  });

  //intentional bug reproducable  route
  app.get("/xml-gzip", (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Encoding", "gzip");
    // no Content-Length => chunked

    const gzip = Zlib.createGzip();
    gzip.pipe(res);

    gzip.write('<?xml version="1.0" encoding="UTF-8"?>\n');
    gzip.write("<root>\n");

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
  });

  // blocking cpu-heavy task handled with worker threads
  app.get("/blocking", blockingLimiter, async (req, res) => {
    try {
      const workerPromises: Promise<number>[] = [];

      for (let i = 0; i < THREAD_COUNT; i++) {
        workerPromises.push(createWorker());
      }

      const threadResults = await Promise.all(workerPromises);

      const total = threadResults.reduce((sum, value) => sum + value, 0);

      res.status(200).json({
        message: "CPU task completed",
        total,
        handledByProcess: process.pid,
      });
    } catch (error: any) {
      res.status(500).json({
        message: "Worker thread error",
        error: error.message,
        handledByProcess: process.pid,
      });
    }
  });

  app.listen(port, () => {
    console.log(`Server is running on port ${port} in PID ${process.pid}`);
  });
}

if (cluster.isPrimary) {
  console.log(`Primary process started: PID ${process.pid}`);
  console.log(`Forking ${numCPUs} worker processes...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `Worker process ${worker.process.pid} died. Code: ${code}, Signal: ${signal}`,
    );
    console.log("Starting a new worker...");
    cluster.fork();
  });
} else {
  startServer();
}
