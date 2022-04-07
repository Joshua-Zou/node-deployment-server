const express = require('express')
const next = require('next')
const fs = require("fs")

const port = JSON.parse(fs.readFileSync("./nds_config.json")).port || 3100
const dev = process.argv.includes('--dev')
const app = next({ dev })
const handle = app.getRequestHandler()
var Docker = require('dockerode');
const archiver = require('archiver');
const zipToTar = require('zip-to-tar');
const crypto = require("crypto")

var childProcess = require('child_process');
var docker = new Docker();
global.docker = docker;
global.projectRoot = __dirname;


var buildListeners = {};

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
  server.post("/api/deployment/deploy", async (req, res) => {
    let config = JSON.parse(fs.readFileSync("./nds_config.json", "utf8"));
    if (!config.authorized_users) return res.status(500).send({ error: "No authorized users defined in nds_config.json" });
    if (!config.auth_secret_key) {
      let authkey = crypto.randomBytes(32).toString("hex");
      config.auth_secret_key = authkey;
      fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
    }
    var user = null;
    for (let i in config.authorized_users) {
      let testUser = config.authorized_users[i];
      let hash = crypto.createHash('sha256');
      let userkey = hash.update(testUser.username);
      userkey = hash.update(testUser.password);
      userkey = hash.update(config.auth_secret_key);
      if (!req.query.auth) req.query.auth
      if (userkey.digest('hex') === req.query.auth) {
        user = testUser
        break;
      }
    }
    if (user === null) return res.send({ error: "Invalid authkey" });
    if (user.permission !== "admin" && user.permission !== "readwrite") return res.send({ error: "User does not have adequate permissions to complete this action!" });
    let id = req.query.id;
    let deployment = config.deployments.find(d => d.id === id);
    if (!deployment) return res.send({ error: "Deployment not found!" });

    let deploymentIndex = config.deployments.findIndex(d => d.id === id);

    // BUILDING
    function sendSSE(text) {
      if (!buildListeners[id]) return;
      sendEventsToAll(text, buildListeners[id]);
    }
    res.send({ data: "deployment started" });
    deployment.status = "building";
    config.deployments[deploymentIndex] = deployment;
    sendSSE("Starting to build deployment...")
    fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
    try { fs.unlinkSync("./deployments/" + id + "/build.zip") } catch (e) { }
    try { fs.unlinkSync("./deployments/" + id + "/build.tar") } catch (e) { }

    sendSSE("Creating tarball...")
    await zipDirectory("./deployments/" + id, "./deployments/" + id + "/build.zip");
    console.log("zipped directory!");
    await convertZipToTar("./deployments/" + id + "/build.zip", "./deployments/" + id + "/build.tar");
    console.log("converted zip to tar!");
    sendSSE("Finished tarball creation. Starting to build docker image...")
    var buildStream = await docker.buildImage("./deployments/" + id + "/build.tar", { t: "nds-deployment-" + id });
    buildStream.pipe(process.stdout)
    buildStream.on('data', function (e) {
      sendSSE(e.toString());
    })
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(buildStream, (err, res) => err ? reject(err) : resolve(res));
    });
    docker.pruneImages()
    docker.pruneContainers()
    deployment.status = "starting";
    config.deployments[deploymentIndex] = deployment;
    fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
    sendSSE("Finished building docker image. Starting container... Switch over to the Console tab to see the application logs.")

    // STARTING
    var container = docker.getContainer(`nds-container-${id}`);
    try {
      await container.stop()
      await container.remove()
    } catch (err) { }

    docker.createContainer({
      Image: `nds-deployment-${id}`,
      name: `nds-container-${id}`,
      ExposedPorts: {
        [`${deployment.internalPort}/${deployment.externalPort}`]: {}
      }
    }, function (err, container) {
      if (err) {
        sendSSE("Error starting container: " + err.toString());
        deployment.status = "failed to start";
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return;
      }
      container.start(function (err, data) {
        if (err) {
          sendSSE("Error starting container: " + err.toString());
          deployment.status = "failed to start";
          config.deployments[deploymentIndex] = deployment;
          fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        } else {
          deployment.status = "running";
          config.deployments[deploymentIndex] = deployment;
          fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        }
      });
    });


  })
  server.get("/api/deployment/buildLog", buildEventsHandler)
  server.get("/api/deployment/runLogs", runEventsHandler)

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



function sendEventsToAll(text, clients) {
  clients.forEach(client => client.response.write(`data: ${text}\n\n`))
}
async function runEventsHandler(request, response, next) {
  var req = request;
  var res = response;
  let config = JSON.parse(fs.readFileSync("./nds_config.json", "utf8"));
  if (!config.authorized_users) return res.status(500).send({ error: "No authorized users defined in nds_config.json" });
  if (!config.auth_secret_key) {
    let authkey = crypto.randomBytes(32).toString("hex");
    config.auth_secret_key = authkey;
    fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
  }
  var user = null;
  for (let i in config.authorized_users) {
    let testUser = config.authorized_users[i];
    let hash = crypto.createHash('sha256');
    let userkey = hash.update(testUser.username);
    userkey = hash.update(testUser.password);
    userkey = hash.update(config.auth_secret_key);
    if (!req.query.auth) req.query.auth
    if (userkey.digest('hex') === req.query.auth) {
      user = testUser
      break;
    }
  }
  if (user === null) return res.send({ error: "Invalid authkey" });
  let id = req.query.id;
  let deployment = config.deployments.find(d => d.id === id);
  if (!deployment) return res.send({ error: "Deployment not found!" });

  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
  response.writeHead(200, headers);

  const data = `data: Successfully established write stream with server\n\n`;

  response.write(data);


  var container = docker.getContainer(`nds-container-${id}`);
  var logs = await container.logs({ stdout: true, stderr: true, follow: true })
  logs.on("data", function (log) {
    response.write(`data: ${log}\n\n`);
  })
}
function zipDirectory(sourceDir, outPath) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    archive
      .directory(sourceDir, false)
      .on('error', err => reject(err))
      .pipe(stream)
      ;

    stream.on('close', () => resolve());
    archive.finalize();
  });
}
function convertZipToTar(sourceFile, outFile) {
  const tar = fs.createWriteStream(outFile);
  return new Promise((resolve, reject) => {
    zipToTar(sourceFile, { progress: false })
      .on('file', console.log)
      .on('error', reject)
      .getStream()
      .pipe(tar)
      .on('finish', resolve);
  })
}
function buildEventsHandler(request, response, next) {
  var req = request;
  var res = response;
  let config = JSON.parse(fs.readFileSync("./nds_config.json", "utf8"));
  if (!config.authorized_users) return res.status(500).send({ error: "No authorized users defined in nds_config.json" });
  if (!config.auth_secret_key) {
    let authkey = crypto.randomBytes(32).toString("hex");
    config.auth_secret_key = authkey;
    fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
  }
  var user = null;
  for (let i in config.authorized_users) {
    let testUser = config.authorized_users[i];
    let hash = crypto.createHash('sha256');
    let userkey = hash.update(testUser.username);
    userkey = hash.update(testUser.password);
    userkey = hash.update(config.auth_secret_key);
    if (!req.query.auth) req.query.auth
    if (userkey.digest('hex') === req.query.auth) {
      user = testUser
      break;
    }
  }
  if (user === null) return res.send({ error: "Invalid authkey" });
  let id = req.query.id;
  let deployment = config.deployments.find(d => d.id === id);
  if (!deployment) return res.send({ error: "Deployment not found!" });

  if (!buildListeners[id]) buildListeners[id] = [];


  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
  response.writeHead(200, headers);

  const data = `data: Successfully established write stream with server\n\n`;

  response.write(data);

  const clientId = Date.now();

  const newClient = {
    id: clientId,
    response
  };

  buildListeners[id].push(newClient);

  request.on('close', () => {
    console.log(`${clientId} Connection closed`);
    buildListeners[id] = buildListeners[id].filter(client => client.id !== clientId);
  });
}