const fetch = require("node-fetch")
const fs = require("fs")
const extract = require('extract-zip')
const path = require("path")
const child_process = require("child_process");
const logger = require("./logger")

async function main() {
    console.log("Starting update...");
    let downloadUrl = await getDownloadURI();
    console.log("Downloading from " + downloadUrl);
    var tmpFileName = makeid(10);

    const res = await fetch(downloadUrl);
    const fileStream = fs.createWriteStream("../" + tmpFileName + ".zip");
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
    console.log("Downloaded to " + tmpFileName + ".zip");
    await sleep(1000);

    let dir = __dirname.toString().replace(/\\/g, "/").split("/");
    dir.pop();
    dir = dir.join("/");
    console.log("Extracting to " + dir + "/" + tmpFileName);
    await extract("../" + tmpFileName + ".zip", { dir: dir + "/" + tmpFileName });
    console.log("Extracted to " + dir + "/" + tmpFileName);


    console.log("Copying files...");
    var readyDir = path.basename(__dirname)
    copyRecursiveSync(`../${tmpFileName}/release`, `../${readyDir}`, `../${readyDir}`);

    console.log("Deleting tmp files...");
    fs.unlinkSync("../" + tmpFileName + ".zip");
    fs.rmSync("../" + tmpFileName, { recursive: true, force: true });

    console.log("Running npm install...");
    child_process.execSync("npm install --force");
    console.log("Installed packages!");

    console.log("Updating config file...");
    child_process.execSync("npm run update-config");
    console.log("Updated config file!");

    console.log("Update complete!");
    await sleep(1000);
    console.log("Starting server...");
    process.on("exit", function () {
        require("child_process").spawn("npm", ["run", "start"], {
            cwd: process.cwd(),
            detached: true,
            stdio: "inherit",
            shell: true
        });
    });
    process.exit();
    //await sleep(20000);
    //fs.rmSync("../" + readyDir, { recuxrsive: true, force: true });
}
main();

async function getDownloadURI() {
    let url = "https://api.github.com/repos/joshua-zou/node-deployment-server/releases/latest";
    let response = await fetch(url);
    let json = await response.json();
    let uri = json.assets[0].browser_download_url;
    return uri;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}
var copyRecursiveSync = function (src, dest, base) {
    var exists = fs.existsSync(src);
    var stats = exists && fs.statSync(src);
    var isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (dest.endsWith("deployments") || dest.endsWith("node_modules")) return;
        if (dest !== base) {
            try {
                fs.rmSync(dest, { recursive: true, force: true });
            } catch (err) { }
            fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach(function (childItemName) {
            copyRecursiveSync(path.join(src, childItemName),
                path.join(dest, childItemName), base);
        });
    } else {
        if (dest.endsWith("nds_config.json") || dest.endsWith("UPDATE_SERVER.js")) return;
        console.log("Copying " + src + " to " + dest);
        fs.copyFileSync(src, dest);
    }
};