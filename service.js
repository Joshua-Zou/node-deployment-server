const fs = require("fs");
var Docker = require("dockerode");

var docker = new Docker();

async function main(){
    while (true) {
        let config = JSON.parse(fs.readFileSync("./nds_config.json"));
        // garbage manager
        let deploymentFolders = getDirectories("./deployments");
        deploymentFolders.forEach(folder => {
            if (!config.deployments || config.deployments.length === 0) {
                console.log("Found a deployment stored locally but could not find deployment in nds_config.json. Deleting deployment folder...");
                fs.rmdirSync("./deployments/"+folder, {recursive: true});
            } else if (!config.deployments.find(deployment => deployment.id === folder)) {
                console.log("Found a deployment stored locally but could not find deployment in nds_config.json. Deleting deployment folder...");
                fs.rmdirSync("./deployments/"+folder, {recursive: true});
            }
        })

        // status updater
        let deployments = config.deployments || [];
        deployments.forEach(deployment => {
            let deploymentFolder = "./deployments/"+deployment.id;
            fs.existsSync(deploymentFolder) || fs.mkdirSync(deploymentFolder);

            var container = docker.getContainer(`nds-container-${deployment.id}`);
            container.inspect((err, data) => {
                if (err) deployment.status = "waiting for initialization"
                else deployment.status = data.State.Status;
                let deploymentIndex = config.deployments.findIndex(d => d.id === deployment.id);
                config.deployments[deploymentIndex] = deployment;
                fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
            })
        })
        await sleep(60000);
    }
}
main();


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function getDirectories(path) {
    return fs.readdirSync(path).filter(function (file) {
      return fs.statSync(path+'/'+file).isDirectory();
    });
  }