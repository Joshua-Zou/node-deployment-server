const fs = require("fs")
async function main(){
    while (true) {
        let config = JSON.parse(fs.readFileSync("./nds_config.json"));
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