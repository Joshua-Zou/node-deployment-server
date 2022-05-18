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
const volumeExplorer = require("volume-explorer");
if (process.platform === "win32" || process.platform !== "linux") global.VolumeExplorer = new volumeExplorer();
else global.VolumeExplorer = null;
const crypto = require("crypto")
const serviceWorker = require('./service');
const logger = require('./logger');

var childProcess = require('child_process');
var docker = new Docker();
global.docker = docker;
global.projectRoot = __dirname;
global.logger = logger;
global.logprefix = function(user) {
  return `User with username "${user.username}" queried action with output: `
}

const server = express()
var httpServer = null;
var buildListeners = {};
var runListeners = {};
var bashListeners = {};
var bashStdin = {};


function main() {
  console.log("\n\n\n\n\n\n\n\n\n_________________________________________\nStarting NDS...");
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

      let runCommand = JSON.stringify(deployment.fullRunCommand.split(" "))
      if (deployment.fullRunCommand.split(" ")[0] !== "") runCommand = "CMD "+runCommand
      else runCommand = ""

      let dockerFile = fs.readFileSync("./deployments/Dockerfile", "utf8");
      dockerFile = dockerFile.replaceAll("{{NODEVERSIONTEMPLATE}}", deployment.nodeVersion);
      dockerFile = dockerFile.replaceAll("{{DEPLOYMENTIDTEMPLATE}}", id);
      dockerFile = dockerFile.replaceAll("{{RUNCMDTEMPLATE}}", runCommand);
      dockerFile = dockerFile.replaceAll("{{FOLDERNAME}}", deployment.internalFolderName);
      dockerFile = dockerFile.replaceAll("{{PACKAGEINSTALLATIONCOMMAND}}", deployment.installCommand);
      fs.writeFileSync(`./deployments/${id}/Dockerfile`, dockerFile);

      sendSSE("Creating tarball...")
      await zipDirectory("./deployments/" + id, "./deployments/" + id + "/build.zip");
      await convertZipToTar("./deployments/" + id + "/build.zip", "./deployments/" + id + "/build.tar");
      sendSSE("Finished tarball creation. Starting to build docker image...")
      var buildStream = await docker.buildImage("./deployments/" + id + "/build.tar", { t: "nds-deployment-" + id });
      //buildStream.pipe(process.stdout)
      buildStream.on('data', function (e) {
        var text = e.toString();
        sendSSE(text);
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
      var env = [];
      var ports = {};
      var hostConfigPorts = {};
      var mounts = [];

      for (let i in deployment.portMappings) {
        let port = deployment.portMappings[i];
        let internalPort = port.split(":")[0];
        let externalPort = port.split(":")[1];
        if (!internalPort.endsWith("/tcp") && !internalPort.endsWith("/udp")) internalPort += "/tcp";
        ports[internalPort] = {}

        hostConfigPorts[internalPort] = [
          {HostPort: externalPort}
        ]

      }
      Object.entries(deployment.environmentVariables).forEach(([key, value]) => {
        env.push(`${key}=${value}`)
      })
      deployment.volumes.forEach(volume => {
        mounts.push({
          Type: "volume",
          ReadOnly: false,
          Source: "nds-volume-"+volume.id,
          Target: volume.mountpoint
        })
      })
      docker.createContainer({
        Image: `nds-deployment-${id}`,
        name: `nds-container-${id}`,
        ExposedPorts: ports,
        HostConfig: {
          Memory: deployment.memory * 1024 * 1024,
          RestartPolicy: {
            Name: restartPolicy[deployment.startContainerOnStartup],
          },
          PortBindings: hostConfigPorts,
          Mounts: mounts
        },
        Env: env
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
    server.post("/api/deployment/startbash", async (req, res) => {
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

      function sendSSE(text) {
        if (!bashListeners[id]) return;
        sendEventsToAll(text, bashListeners[id])
      }
      new Promise(async (resolve, reject) => {
        let container = docker.getContainer(`nds-container-${req.query.id}`);
        container.exec({ Cmd: ["/bin/bash"], AttachStdin: true, AttachStdout: true, AttachStderr: true, Env: ["TERM=xterm"], Tty: true}, function (err, exec) {
          if (err) return reject(err);
          exec.start({ hijack: true, stdin: true }, function (err, stream) {
            stream.on("data", function(data) {
              sendSSE(data.toString());
            })
            bashStdin[id] = function(text) {
              stream.write(text+"\n");
            }
            sendSSE("\u001b[34m Starting bash...\u001b[0m");
          });
        });
      }).catch(err => {
        sendSSE("\u001b[31m Error starting bash: " + err.toString() + "\u001b[0m");
      })
      res.send({})
    })
    server.post("/api/deployment/runBashCmd", async (req, res) => {
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
      if (!req.query.cmd) return res.send({ error: "No command specified!" });

      if (bashStdin[id]) {
        bashStdin[id](req.query.cmd);
      }
      return res.send({})
    })
    
    server.get("/api/deployment/buildLog", buildEventsHandler)
    server.get("/api/deployment/runLogs", runEventsHandler)
    server.get("/api/deployment/bashLogs", bashEventsHandler)
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
        return res.send({ data: logs });
      } catch (err) {
        return res.send({ data: "" })
      }

    })
    server.use("/static", express.static(__dirname + "/static"));

    server.all('*', (req, res) => {
      return handle(req, res)
    })

    httpServer = server.listen(port, (err) => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  })


  serviceWorker.start(docker, function(err, restart=true) {
    console.log('Service Worker process ended unexpectedly!');
    console.error(err)
    serviceWorker.stop();
    if (!restart) {
      process.exit(1);
    }
    console.log("Restarting server in 10 seconds!")
    restartServer();
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
  text = text.replaceAll("\r\n", "\u16E3")
  text = text.replaceAll("\n", "\u16E3")
  text = text.replaceAll("\r", "\u16E3")
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
  if (!runListeners[id]) runListeners[id] = [];

  const clientId = Date.now();

  const newClient = {
    id: clientId,
    response
  };
  runListeners[id].push(newClient);


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
    runListeners[id] = runListeners[id].filter(client => client.id !== clientId);
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
    buildListeners[id] = buildListeners[id].filter(client => client.id !== clientId);
  });
}
function bashEventsHandler(request, response, next) {
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
  if (user.permission === "readonly") return res.send({ error: "You do not have permission to run bash commands!" });
  let id = req.query.id;
  let deployment = config.deployments.find(d => d.id === id);
  if (!deployment) return res.send({ error: "Deployment not found!" });

  if (!bashListeners[id]) bashListeners[id] = [];


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

  bashListeners[id].push(newClient);

  request.on('close', () => {
    bashListeners[id] = bashListeners[id].filter(client => client.id !== clientId);
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
      .on('file', function(){})
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

