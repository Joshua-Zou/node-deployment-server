const fs = require("fs");
const fetch = require("node-fetch")
const currentConfigFileVersion = 5;

var run = true;
var clck = 0;
var jobFunctions = {};
var lastJobScan = 0;

async function main(docker) {
    while (true) {
        if (!run) break;
        let config = JSON.parse(fs.readFileSync("./nds_config.json"));
        // adding non-breaking configuration changes
        if (!config.jobs) config.jobs = [];
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));

        // checking if a newer version is available
        if (clck % 10 == 0) {
            global.latestVersion = await getLatestVersion();
            clck = 0;
        }
        clck += 1;

        // garbage manager
        let deploymentFolders = getDirectories("./deployments");
        deploymentFolders.forEach(folder => {
            if (!config.deployments || config.deployments.length === 0) {
                console.log("Found a deployment stored locally but could not find deployment in nds_config.json. Deleting deployment folder...");
                fs.rmdirSync("./deployments/" + folder, { recursive: true });
            } else if (!config.deployments.find(deployment => deployment.id === folder)) {
                console.log("Found a deployment stored locally but could not find deployment in nds_config.json. Deleting deployment folder...");
                fs.rmdirSync("./deployments/" + folder, { recursive: true });
            }
        })

        // status updater
        let deployments = config.deployments || [];
        deployments.forEach(deployment => {
            let deploymentFolder = "./deployments/" + deployment.id;
            fs.existsSync(deploymentFolder) || fs.mkdirSync(deploymentFolder);

            var container = docker.getContainer(`nds-container-${deployment.id}`);
            container.inspect((err, data) => {
                if (err) deployment.status = "waiting for initialization"
                else deployment.status = data.State.Status;
                if (!config.deployments) return;
                let deploymentIndex = config.deployments.findIndex(d => d.id === deployment.id);
                config.deployments[deploymentIndex] = deployment;
                fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
            })
        })

        // docker image cleanup 
        let images = await docker.listImages();
        images.forEach(image => {
            if (image.RepoTags[0].startsWith("nds-deployment")) {
                if (!config.deployments || !config.deployments.find(deployment => deployment.id === image.RepoTags[0].split("-")[2].slice(0, -":latest".length)))
                    docker.getImage(image.Id).remove({ force: true }, (err, data) => {
                        if (err) console.log(err);
                        else {
                            console.log("Found unused deployment image and removed it")
                        }
                    })
            }
        })

        //docker volume cleanup 
        let volumes = await docker.listVolumes();
        volumes = volumes.Volumes;
        volumes.forEach(volume => {
            if (volume.Name.startsWith("nds-volume")) {
                if (!config.volumes || !config.volumes.find(v => v.id === volume.Name.split("-")[2]))
                    docker.getVolume(volume.Name).remove({ force: true }, (err, data) => {
                        if (err) console.log(err);
                        else {
                            console.log("Found unused volume and removed it")
                        }
                    })
            }
        })


        // cleanup temp download files
        let tempFiles = fs.readdirSync("./static/tmp-volume-data");
        tempFiles.forEach(file => {
            if (file !== ".gitkeep") {
                if (Date.now() - 1000 * 60 * 5 > fs.statSync("./static/tmp-volume-data/" + file).birthtimeMs) {
                    fs.rmSync("./static/tmp-volume-data/" + file, { recursive: true, force: true });
                }
            }
        })

        await sleep(60000);
    }
}
async function jobManager(docker) {
    await sleep(1000)
    console.log("Starting job manager...")

    let config = JSON.parse(fs.readFileSync("./nds_config.json"));
    let jobs = config.jobs;

    jobs.forEach(job => {
        registerJob(job)
    })
    await sleep(10000);
    fs.watch('./nds_config.json', function (event, filename) {
        if (event === "change") {
            scanForNewJobs();
        }
    });
    function registerJob(job) {
        console.log("Registering/Updating job: " + job.name)
        jobFunctions[job.id] = async function () {
            console.log("Running job")
            // checking if a newer version of the job is available
            var newConfig = JSON.parse(fs.readFileSync("./nds_config.json"));
            var newJob = newConfig.jobs.find(j => j.id === job.id);
            if (!newJob) return unregisterJob(job.id);
            if (newJob.version !== job.version) {
                console.log("There was a newer version of the job found. Updating job...")
                return registerJob(newConfig.jobs.find(j => j.id === job.id));
            }
            if (job.enabled === false) {
                console.log("Job is disabled. Skipping...")
                return setTimeout(jobFunctions[job.id] || function(){}, job.run_every * 60000);
            }
            // executing job commands
            try {
                for (var i in job.actions) {
                    let action = job.actions[i];
                    if (action.action === "backup_volume") {
                        let vid = action.data.volume_id;
                        let dir = action.data.path;
                        const volume = VolumeExplorer.volume("nds-volume-" + vid)
                        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }

                        await volume.copyDir("/", dir)
                    } else if (action.action === "check_deployment") {
                        let status = newConfig.deployments.find(d => d.id === action.data.container_id).status;
                        await executeLayer2Actions(action.data[status])
                        async function executeLayer2Actions(l2Actions) {
                            for (let p in l2Actions) {
                                let l2Action = l2Actions[p];
                                if (l2Action.type === "fetch") {
                                    let body;
                                    if (l2Action.method.toLowerCase() !== "get") body = l2Action.body
                                    await fetch(l2Action.url, {
                                        method: l2Action.method,
                                        body: body
                                    })
                                } else {
                                    let container = docker.getContainer("nds-container-"+l2Action.container_id);
                                    await container[l2Action.type]()
                                }
                            }
                        } 
                    }
                }

            } catch (err) {
                console.log("An error occured while running job: " + job.name + "\n Error: " + err.toString())
            }
            // running the job in the future
            setTimeout(jobFunctions[job.id] || function(){}, job.run_every * 60000);
        }
        jobFunctions[job.id]();
    }
    function unregisterJob(id) {
        console.log("Unregistering job: " + id)
        delete jobFunctions[id];
    }
    function scanForNewJobs(){
        if (lastJobScan + 100 < Date.now()) return;

        let newConfig = JSON.parse(fs.readFileSync("./nds_config.json"));
        lastJobScan = Date.now();
        newConfig.jobs.forEach(job => {
            if (!jobFunctions[job.id]) registerJob(job)
        })
    }
    await sleep(60000);
}




function checkConfigFile() {
    let config = JSON.parse(fs.readFileSync("./nds_config.json"));
    let configFileVersion = config.configFileVersion;
    if (configFileVersion !== currentConfigFileVersion) {
        return "The config file's version is not up to date. Please update the config file by running the command: npm run update-config"
    } else {
        return true;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function getDirectories(path) {
    return fs.readdirSync(path).filter(function (file) {
        return fs.statSync(path + '/' + file).isDirectory();
    });
}
async function getLatestVersion() {
    let url = "https://api.github.com/repos/joshua-zou/node-deployment-server/releases/latest";
    let response = await fetch(url);
    let json = await response.json();
    let newestVersion = json.tag_name.slice(1);
    return newestVersion;
}

module.exports.start = function (docker, errFunction) {
    console.log("Starting NDS service...")
    async function watchMain() {
        try {
            await main(docker);
        } catch (err) {
            errFunction(err.toString());
        }
    }
    watchMain()
    async function watchJobManager() {
        try {
            await jobManager(docker);
        } catch (err) {
            errFunction(err.toString());
        }
    }
    watchJobManager()
    let configGood = checkConfigFile();
    if (configGood !== true) errFunction(configGood, false);
}
module.exports.stop = function () {
    run = false;
}