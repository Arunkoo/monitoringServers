import cluster from "cluster";
import os from "os";
import AgentAPI from "apminsight";
import express from "express";
import { Worker } from "worker_threads";

const numCPUs = os.cpus().length;
const port = process.env.PORT ?? 8000;
const THREAD_COUNT = 2;

function createWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./two-worker.js", import.meta.url), {
      workerData: { thread_count: THREAD_COUNT },
    });

    worker.on("message", (data) => {
      resolve(data); // keep this numeric
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

  console.log(`Worker process started: PID ${process.pid}`);

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

  // blocking cpu-heavy task handled with worker threads
  app.get("/blocking", async (req, res) => {
    try {
      const workerPromises = [];

      for (let i = 0; i < THREAD_COUNT; i++) {
        workerPromises.push(createWorker());
      }

      const threadResults = await Promise.all(workerPromises);

      const total = threadResults.reduce(
        (sum: any, value: any) => sum + value,
        0,
      );

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
