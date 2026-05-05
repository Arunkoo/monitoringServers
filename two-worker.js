import { parentPort, workerData } from "worker_threads";

if (!parentPort) throw new Error("two-worker.js must be run as a Worker thread");

const iterations = 1_000_000_000 / (workerData?.thread_count ?? 1);

let counter = 0;
for (let i = 0; i < iterations; i++) {
  counter++;
}

parentPort.postMessage(counter);
