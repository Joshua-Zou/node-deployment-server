const fs = require("fs");
const path = require("path")

if (fs.existsSync("../release")) {
    fs.rmdirSync("../release", { recursive: true });
}
fs.mkdirSync("../release");

fs.readdir('./', (err, files) => {
    files.forEach(file => {
        if (file === "node_modules") return;
        if (file === ".git") return;
        copyFolderSync(`./${file}`, `../release/${file}`);
    })
});



function copyFolderSync(from, to) {
    if (fs.lstatSync(from).isFile()) {
        fs.copyFileSync(from, to);
        if (from === "./nds_config.json") {
            let config = JSON.parse(fs.readFileSync("./nds_config.json"));
            delete config.auth_secret_key
            config.deployments = [];
            fs.writeFileSync("../release/nds_config.json", JSON.stringify(config, null, 4));
        }
        return
    }
    fs.mkdirSync(to);
    fs.readdirSync(from).forEach(element => {
        if (fs.lstatSync(path.join(from, element)).isFile()) {
            fs.copyFileSync(path.join(from, element), path.join(to, element));
        } else {
            if (from.startsWith("./deployments") && (element !== ".gitkeep" || element !== "Dockerfile")) return;
            copyFolderSync(path.join(from, element), path.join(to, element));
        }
    });
}