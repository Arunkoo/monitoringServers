import AgentAPI from "apminsight";

import express from "express";
import { Worker } from "worker_threads";
const app = express();
AgentAPI.config();
const port = process.env.PORT ?? 8000;
const THREAD_COUNT = 2;
//fast api....
app.get("/", (req, res) => {
  return res.json({
    message: "Hello World",
  });
});

//slow api...
app.get("/slow", (req, res) => {
  setTimeout(() => {
    return res.json({
      message: "Slow API",
    });
  }, 10 * 1000);
});

// Non-blocking task...
app.get("/non-blocking", (req, res) => {
  res.status(200).send("data is processed");
});
//create worker...

function createWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./two-worker.js", {
      workerData: { thread_count: THREAD_COUNT },
    });

    worker.on("message", (data) => {
      resolve(`data is processed counter: ${data}`);
    });

    worker.on("error", (error) => {
      reject(`An error occured ${error}`);
    });
  });
}

//Blocking task cpu heavy...
app.get("/blocking", async (req, res) => {
  //   const worker = new Worker("./worker.js");
  //   worker.on("message", (data) => {
  //     res.status(200).send(`data is processed counter: ${data}`);
  //   });
  //   worker.on("error", (error) => {
  //     res.status(404).send(`An error occured ${error}`);
  //   });
  const workerPromises = [];
  for (let i = 0; i < THREAD_COUNT; i++) {
    workerPromises.push(createWorker());
  }

  const thread_result: any = await Promise.all(workerPromises);

  const total = thread_result[0] + thread_result[1];
  res.status(200).send(`result is ${total}`);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
