const express = require('express');
const formidable = require('formidable');
const fs = require('fs/promises');
const app = express();
const PORT = 3000;

const Timer = require('./Timer');
const CloneDetector = require('./CloneDetector');
const CloneStorage = require('./CloneStorage');
const FileStorage = require('./FileStorage');

const form = formidable({multiples:false});

app.post('/', fileReceiver );
function fileReceiver(req, res, next) {
    form.parse(req, (err, fields, files) => {
        fs.readFile(files.data.filepath, { encoding: 'utf8' })
            .then( data => { return processFile(fields.name, data); });
    });
    return res.end('');
}

app.get('/', viewClones );
app.get('/timers', viewTimers );

const server = app.listen(PORT, () => { console.log('Listening for files on port', PORT); });

// --------------------
// Stats + page generation
// --------------------
function getStatistics() {
    let cloneStore = CloneStorage.getInstance();
    let fileStore = FileStorage.getInstance();
    let output = 'Processed ' + fileStore.numberOfFiles + ' files containing ' + cloneStore.numberOfClones + ' clones.'
    return output;
}

function lastFileTimersHTML() {
    if (!lastFile) return '';
    output = '<p>Timers for last file processed:</p>\n<ul>\n'
    let timers = Timer.getTimers(lastFile);
    for (t in timers) {
        output += '<li>' + t + ': ' + (timers[t] / (1000n)) + ' µs\n'
    }
    output += '</ul>\n';
    return output;
}

function listClonesHTML() {
    let cloneStore = CloneStorage.getInstance();
    let output = '';

    cloneStore.clones.forEach( clone => {
        output += '<hr>\n';
        output += '<h2>Source File: ' + clone.sourceName + '</h2>\n';
        output += '<p>Starting at line: ' + clone.sourceStart + ' , ending at line: ' + clone.sourceEnd + '</p>\n';
        output += '<ul>';
        clone.targets.forEach( target => {
            output += '<li>Found in ' + target.name + ' starting at line ' + target.startLine + '\n';            
        });
        output += '</ul>\n'
        output += '<h3>Contents:</h3>\n<pre><code>\n';
        output += clone.originalCode;
        output += '</code></pre>\n';
    });

    return output;
}

function listProcessedFilesHTML() {
    let fs = FileStorage.getInstance();
    let output = '<HR>\n<H2>Processed Files</H2>\n'
    output += fs.filenames.reduce( (out, name) => {
        out += '<li>' + name + '\n';
        return out;
    }, '<ul>\n');
    output += '</ul>\n';
    return output;
}

function viewClones(req, res, next) {
    let page='<HTML><HEAD><TITLE>CodeStream Clone Detector</TITLE></HEAD>\n';
    page += '<BODY><H1>CodeStream Clone Detector</H1>\n';
    page += '<p><a href="/timers">View detailed timers</a></p>\n';
    page += '<P>' + getStatistics() + '</P>\n';
    page += lastFileTimersHTML() + '\n';
    page += listClonesHTML() + '\n';
    page += listProcessedFilesHTML() + '\n';
    page += '</BODY></HTML>';
    res.send(page);
}

// --------------------
// Timers page
// --------------------
let ALL_TIMERS = [];

function viewTimers(req, res, next) {
    let page = '<HTML><HEAD><TITLE>Timing Statistics</TITLE></HEAD><BODY>';
    page += '<H1>Timing statistics</H1>';

    if (ALL_TIMERS.length === 0) {
        page += '<p>No timing data yet.</p>';
    } else {
        let totalSum = 0n;
        let matchSum = 0n;
        let lineSum = 0;

        ALL_TIMERS.forEach(entry => {
            totalSum += entry.total;
            matchSum += entry.match;
            lineSum += entry.lines;
        });

        page += '<p>Average total µs: ' + (totalSum / BigInt(ALL_TIMERS.length)) + '</p>';
        page += '<p>Average match µs: ' + (matchSum / BigInt(ALL_TIMERS.length)) + '</p>';
        page += '<p>Average µs/line: ' + (lineSum ? (Number(totalSum/BigInt(ALL_TIMERS.length)) / (lineSum/ALL_TIMERS.length)).toFixed(2) : 0) + '</p>';

        page += '<table border="1"><tr><th>File</th><th>Total (µs)</th><th>Match (µs)</th><th>µs/line</th></tr>';

        ALL_TIMERS.forEach(entry => {
            page += '<tr>';
            page += '<td>' + entry.name + '</td>';
            page += '<td>' + entry.total + '</td>';
            page += '<td>' + entry.match + '</td>';
            page += '<td>' + entry.perLine + '</td>';
            page += '</tr>';
        });

        page += '</table>';
    }

    page += '</BODY></HTML>';
    res.send(page);
}


// --------------------
// Helper functions
// --------------------
PASS = fn => d => {
    try {
        fn(d);
        return d;
    } catch (e) {
        throw e;
    }
};

const STATS_FREQ = 100;
const URL = process.env.URL || 'http://localhost:8080/';
var lastFile = null;

function maybePrintStatistics(file, cloneDetector, cloneStore) {
    if (0 == cloneDetector.numberOfProcessedFiles % STATS_FREQ) {
        console.log('Processed', cloneDetector.numberOfProcessedFiles, 'files and found', cloneStore.numberOfClones, 'clones.');
        let timers = Timer.getTimers(file);
        let str = 'Timers for last file processed: ';
        for (t in timers) {
            str += t + ': ' + (timers[t] / (1000n)) + ' µs '
        }
        console.log(str);
        console.log('List of found clones available at', URL);
    }
    return file;
}

// --------------------
// Processing of the file
// --------------------
function processFile(filename, contents) {
    let cd = new CloneDetector();
    let cloneStore = CloneStorage.getInstance();

    return Promise.resolve({name: filename, contents: contents} )
        .then( (file) => Timer.startTimer(file, 'total') )
        .then( (file) => cd.preprocess(file) )
        .then( (file) => cd.transform(file) )

        .then( (file) => Timer.startTimer(file, 'match') )
        .then( (file) => cd.matchDetect(file) )
        .then( (file) => cloneStore.storeClones(file) )
        .then( (file) => Timer.endTimer(file, 'match') )

        .then( (file) => cd.storeFile(file) )
        .then( (file) => Timer.endTimer(file, 'total') )
        .then( PASS( (file) => {
            lastFile = file;
            let timers = Timer.getTimers(file);
            let total = timers.total / 1000n;
            let match = timers.match / 1000n;
            let lines = file.contents.split("\n").length;
            ALL_TIMERS.push({
                name: file.name,
                total: total,
                match: match,
                lines: lines,
                perLine: lines>0 ? (Number(total)/lines).toFixed(2) : 0
            });
        }))
        .then( PASS( (file) => maybePrintStatistics(file, cd, cloneStore) ))
        .catch( console.log );
};
