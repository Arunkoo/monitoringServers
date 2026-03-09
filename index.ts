import AgentAPI from 'apminsight';

import express from "express";

const app = express();
AgentAPI.config();
const port = process.env.PORT ?? 8000;
app.get("/", (req, res) => {
    return res.json({
        message: "Hello World"
    })
});

//slow api...
app.get("/slow", (req, res) => {
    setTimeout(() => {
        return res.json({
            message: "Slow API"
        })
    }, 10 * 1000);
});

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`);
})

