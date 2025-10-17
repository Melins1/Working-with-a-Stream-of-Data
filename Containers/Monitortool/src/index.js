import express from "express";
import mongoose from "mongoose";
import fs from 'fs'


const DONE_PROCESSED = false

// Variabels
let counts = {
  files: 0,
  chunks: 0,
  candidates: 0,
  clones: 0,
  statusUpdates: 0,
};

let statusUpdateArr = [];

let avgChunksPerFile = 0;
let avgCloneSize = 0;


// Processtime Global vars
let processChunkArr = []
let processCloneArr = []
let processCandidatesArr = []

let lastUpdateTime = 0
let lastChunks = 0
let lastClones = 0
let lastCandidates = 0


const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/cloneDetector";

function connectWithRetry() {
  mongoose
    .connect(mongoURI)
    .then(() => {
      console.log("Successfully connected to the cloneDetector DB");
      // App can continue here
    })
    .catch((err) => {
      console.log(
        "An error occurred. Could not connect to DB. Retrying in 3 seconds...",
        err.message
      );
      setTimeout(connectWithRetry, 5000); 
    });
}

connectWithRetry()


const app = express();
const port = 3000;

app.set("view engine", "pug");

app.get("/", async (req, res) => {
  let processData = {chunks: processChunkArr, clones: processCloneArr, candidates: processCandidatesArr}
  res.render("index", {
    countFiles: counts.files,
    countChunks: counts.chunks,
    countCandidates: counts.candidates,
    countClones: counts.clones,
    statusUpdates: statusUpdateArr,
    processData: processData,
    avgChunksPerFile: avgChunksPerFile,
    avgCloneSize: avgCloneSize
  });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});




async function updateDocumentCount() {
    counts.files = await mongoose.connection
    .collection("files")
    .countDocuments();
    counts.chunks = await mongoose.connection
    .collection("chunks")
    .countDocuments();
    counts.candidates = await mongoose.connection
    .collection("candidates")
    .countDocuments();
    counts.clones = await mongoose.connection
    .collection("clones")
    .countDocuments();
}

async function getStatusUpdates() {
    statusUpdateArr = await mongoose.connection
    .collection("statusUpdates")
    .find({})
    .toArray();
}


async function getProcessStats() {
    //Calculate processing time for Chunk units
    // we could use elapse time of 5000ms here, however, we want to eliminate await updateDocuments time diff
    const now = Date.now()
    const elapsed = now - lastUpdateTime
    if(lastChunks != 0 && lastUpdateTime != 0 && lastChunks != counts.chunks) {
        let obj = await calculateProcessTimes(lastChunks, counts.chunks, elapsed,now)
        processChunkArr.push(obj)
    }

    if(lastClones != 0 && lastUpdateTime != 0 && lastClones != counts.clones) {
        let obj = await calculateProcessTimes(lastClones, counts.clones, elapsed,now)
        processCloneArr.push(obj)
    }

    if(lastCandidates != 0 && lastUpdateTime != 0 && lastCandidates != counts.candidates) {
        let obj = await calculateProcessTimes(lastCandidates, counts.candidates, elapsed,now)
        processCandidatesArr.push(obj)
    }

    lastUpdateTime = now
    lastChunks = counts.chunks
    lastClones = counts.clones
    lastCandidates = counts.candidates

    saveStatsData()
}


async function calculateProcessTimes(lastAmount, currentAmount, elapsed, timestamp) {
    //Returns object of processtimedata
    let diff = currentAmount - lastAmount
    let processTime = diff > 0 ? elapsed / diff : 0

    return {
        timestamp: timestamp,
        amount: currentAmount,
        time: processTime
    }
}

async function saveStatsData() {
    avgChunksPerFile = await getAvgChunksPerFile()
    avgCloneSize = await getAvgCloneSize()

    const processTimeData = {
        chunks: processChunkArr,
        clones: processCloneArr,
        candidates: processCandidatesArr,
        avgChunksPerFile: avgChunksPerFile,
        avgCloneSize: avgCloneSize
    }
    fs.writeFileSync("clone_stats.json", JSON.stringify(processTimeData,null,2))
}


async function getAvgChunksPerFile() {
    return Math.round(counts.chunks / counts.files)

}

async function getAvgCloneSize() {
    const cloneCollection = mongoose.connection.collection("clones");

    const result = await cloneCollection.aggregate([
        {
            $project: {
                numInstances: { $size: "$instances" } 
            }
        },
        {
            $group: {
                _id: null,
                totalInstances: { $sum: "$numInstances" }, 
                totalClones: { $sum: 1 } 
            }
        }
    ]).toArray();

    if (result.length === 0) return 0;

    const { totalInstances, totalClones } = result[0];
    return Math.round(totalInstances / totalClones);
}

console.log("Setting up statistics interval...");

setInterval(async () => {
    await updateDocumentCount();
    getStatusUpdates();
    getProcessStats();


  console.log("Updated...");

}, 5000);