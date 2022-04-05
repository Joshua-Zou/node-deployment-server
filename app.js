const express = require('express')
const next = require('next')
const fs = require("fs")

const port = JSON.parse(fs.readFileSync("./nds_config.json")).port || 3100
const dev = process.argv.includes('--dev')
const app = next({ dev })
const handle = app.getRequestHandler()
var Docker = require('dockerode');

var childProcess = require('child_process');
var docker = new Docker();
global.docker = docker;

function runScript(scriptPath, callback) {
    var invoked = false;
    var process = childProcess.fork(scriptPath);
    process.on('error', function (err) {
        if (invoked) return;
        invoked = true;
        callback(err);
    });
    process.on('exit', function (code) {
        if (invoked) return;
        invoked = true;
        var err = code === 0 ? null : new Error('exit code ' + code);
        callback(err);
    });

}
app.prepare().then(() => {
  const server = express()

  server.get("/mode-json.js", (req, res) => {
    const file = fs.readFileSync("./node_modules/ace-builds/src-noconflict/mode-json.js", "utf8")
    res.setHeader("Content-Type", "application/javascript")
    res.end(file)
  })

  server.all('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})

runScript('./garbageManager.js', function (err) {
  if (err) throw err;
  console.log('Garbage Manager process ended unexpectedly!');
});