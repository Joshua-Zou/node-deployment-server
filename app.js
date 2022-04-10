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

const server = express()
var httpServer = null;
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



function main() {
  app.prepare().then(() => {

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
      sendSSE("Updating Dockerfile...");
      let dockerFile = fs.readFileSync("./deployments/Dockerfile", "utf8");
      dockerFile = dockerFile.replaceAll("{{NODEVERSIONTEMPLATE}}", deployment.nodeVersion);
      dockerFile = dockerFile.replaceAll("{{INTERNALPORTTEMPLATE}}", deployment.internalPort);
      dockerFile = dockerFile.replaceAll("{{DEPLOYMENTIDTEMPLATE}}", id);
      dockerFile = dockerFile.replaceAll("{{RUNCMDTEMPLATE}}", deployment.runCmd);
      dockerFile = dockerFile.replaceAll("{{FOLDERNAME}}", deployment.internalFolderName);
      fs.writeFileSync(`./deployments/${id}/Dockerfile`, dockerFile);

      sendSSE("Creating tarball...")
      await zipDirectory("./deployments/" + id, "./deployments/" + id + "/build.zip");
      await convertZipToTar("./deployments/" + id + "/build.zip", "./deployments/" + id + "/build.tar");
      sendSSE("Finished tarball creation. Starting to build docker image...")
      var buildStream = await docker.buildImage("./deployments/" + id + "/build.tar", { t: "nds-deployment-" + id });
      //buildStream.pipe(process.stdout)
      buildStream.on('data', function (e) {
        var text = e.toString();
        let multipleLines = text.split("\n");
        multipleLines.forEach(line => {
          try {
            let json = JSON.parse(line.toString());
            if (json.stream) line = json.stream
            sendSSE(line);
          } catch (err) {
            sendSSE(line);
          }
        })
      })
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(buildStream, (err, res) => err ? reject(err) : resolve(res));
      });
      docker.pruneImages()
      docker.pruneContainers()
      deployment.status = "starting";
      config.deployments[deploymentIndex] = deployment;
      fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
      sendSSE("\\033[0;34m Finished building docker image. Starting container... Switch over to the Console tab to see the application logs. \\033[0m")

      // STARTING
      var container = docker.getContainer(`nds-container-${id}`);
      for (let i = 0; i < 3; i++) {
        try {
          await container.stop()
          await container.remove()
          break;
        } catch (err) { }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      let restartPolicy = { false: "", true: "unless-stopped" }
      docker.createContainer({
        Image: `nds-deployment-${id}`,
        name: `nds-container-${id}`,
        ExposedPorts: {
          [`${deployment.internalPort}/${deployment.externalPort}`]: {}
        },
        HostConfig: {
          Memory: deployment.memory * 1024 * 1024,
          RestartPolicy: {
            Name: restartPolicy[deployment.startContainerOnStartup],
          }
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
    server.get("/api/deployment/oldRunLogs", async (req, res) => {
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

      var container = docker.getContainer(`nds-container-${id}`);
      try {
        let logs = await container.logs({ stdout: true, stderr: true, tail: 1000 })
        logs = logs.toString();
        logs = logs.replace(/\u0001\u0000\u0000\u0000\u0000\u0000\u0000\?/g, "")
        logs = logs.replace(/\u0001/g, "")
        logs = logs.replace(/\u0000/g, "")
        logs = logs.replace(/\u0016/g, "")
        logs = logs.replace(/\u0010/g, "")
        logs = logs.replace(/\u0007/g)
        return res.send({ data: logs });
      } catch (err) {
        return res.send({ data: "" })
      }

    })

    server.all('*', (req, res) => {
      return handle(req, res)
    })

    httpServer = server.listen(port, (err) => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  })

  runScript('./service.js', function (err) {
    console.log('Service Worker process ended unexpectedly!');
    if (err) {
      throw err
    } else {
      console.log("Restarting server in 10 seconds...")
      restartServer();
    }
  });
  function restartServer() {
    setTimeout(function () {
      process.on("exit", function () {
        require("child_process").spawn(process.argv.shift(), process.argv, {
          cwd: process.cwd(),
          detached: true,
          stdio: "inherit"
        });
      });
      process.exit();
    }, 10000);
  }
}
main();


function sendEventsToAll(text, clients) {
  clients.forEach(client => client.response.write(`data: ${text}\n\n`))
}
function runEventsHandler(request, response, next) {
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

  const data = `data: \\033[0;34m >>>>> Successfully loaded logs not from this session (Logs below are real time) <<<<<\\033[0m\n\n`;

  response.write(data);

  const clientId = Date.now();

  const newClient = {
    id: clientId,
    response
  };


  var container = docker.getContainer(`nds-container-${id}`);
  container.logs({ stdout: true, stderr: true, follow: true, tail: 1 }).then(logs => {
    logs.on("data", function (log) {
      log = log.toString();
      response.write(`data: ${log}\n\n`);
    })
  }).catch(err => {
    response.write(`data: Deployment has not been deployed yet!\n\n`);
  })

  request.on('close', () => {
    console.log(`${clientId} Connection closed`);
  });
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
String.prototype.replaceAll = function (find, replace) {
  var regex = new RegExp(find, 'g');
  return this.replace(regex, replace)
}

