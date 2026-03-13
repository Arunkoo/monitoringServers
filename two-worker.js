import { parentPort, workerData } from "worker_threads";

let counter = 0;

// divide the heavy work among worker threads
for (let i = 0; i < 1_000_000_000 / workerData.thread_count; i++) {
  counter++;
}

parentPort.postMessage(counter);
