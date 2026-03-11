import { parentPort } from "worker_threads";

let counter = 0;

for (let i = 0; i < 10e10; i++) {
  counter++;
}

parentPort?.postMessage(counter);
