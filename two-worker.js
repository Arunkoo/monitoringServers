//  utilizing 2 core  for cpu extensive task...
import { workerData, parentPort } from "worker_threads";

let counter = 0;

for (let i = 0; i < 10e10 / workerData.thread_count; i++) {
  counter++;
}

parentPort?.postMessage(counter);
