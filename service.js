const fs = require("fs");
const currentConfigFileVersion = 5;

var run = true;

async function main(docker) {
    while (true) {
        if (!run) break;
        let config = JSON.parse(fs.readFileSync("./nds_config.json"));
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

        // docker image cleanup (this causes io timeout)
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

        //docker volume cleanup (this also causes io timeout)
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
                console.log(fs.statSync("./static/tmp-volume-data/" + file).birthtimeMs, Date.now())
                if (Date.now() - 1000 * 60 * 5 > fs.statSync("./static/tmp-volume-data/" + file).birthtimeMs) {
                    fs.rmSync("./static/tmp-volume-data/" + file, { recursive: true, force: true });
                }
            }
        })

        await sleep(60000);
    }
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

module.exports.start = function(docker, errFunction){
    console.log("Starting NDS service...")
    async function watchMain() {
        try {
            await main(docker);
        } catch(err) {
            errFunction(err.toString());
        }
    }
    watchMain()
    let configGood = checkConfigFile();
    if (configGood !== true) errFunction(configGood, false);
}
module.exports.stop = function(){
    run = false;
}