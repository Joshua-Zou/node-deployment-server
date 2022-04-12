const target = 3;

const fs = require("fs")
console.log("Starting config file update...");


let config = JSON.parse(fs.readFileSync("./nds_config.json"));
let startConfigFileVersion = config.configFileVersion;
if (startConfigFileVersion === undefined) startConfigFileVersion = 0;

function update(fromVersion) {
    let config = JSON.parse(fs.readFileSync("./nds_config.json"));
    let configFileVersion = config.configFileVersion;
    if (configFileVersion === target) return console.log("Config file is now up to date!");
    console.log(`Updating config file from version ${fromVersion} to version ${fromVersion+1}...`);
    let updateFunction = require(`./update${fromVersion}to${fromVersion + 1}.js`);
    fs.writeFileSync("./nds_config.json", JSON.stringify(updateFunction(config), null, 4));
    console.log(`Successfully updated config file from version ${fromVersion} to version ${fromVersion+1}!`);
    update(fromVersion + 1)
}
update(startConfigFileVersion)