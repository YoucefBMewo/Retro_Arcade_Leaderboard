import express from "express";

const app = express();

app.get("/", (req, res) => {
    res.send("selem wor!!");
})

app.listen(8000, () => {
    console.log("server listening ")
});