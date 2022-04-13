module.exports = function(config) {
    if (config.deployments) {
        // Updating port config
        for (let i in config.deployments) {
            let internalPort = config.deployments[i].internalPort;
            let externalPort = config.deployments[i].externalPort;
            if (!internalPort || !externalPort || config.deployments[i].portMappings) continue;
            delete config.deployments[i].internalPort;
            delete config.deployments[i].externalPort;
            config.deployments[i].portMappings = [`${internalPort}:${externalPort}`];
        }

        // Updating run command configuration
        for (let i in config.deployments) {
            let runCmd = config.deployments[i].runCmd;
            if (!runCmd) continue;
            delete config.deployments[i].runCmd;
            config.deployments[i].fullRunCommand = "npm run " + runCmd;
        }

        // Updating installation command  configuration
        for (let i in config.deployments) {
            if (!config.deployments[i].installCmd) config.deployments[i].installCommand = "npm install";
        }
    }
    config.configFileVersion = 4;
    return config;
}