module.exports = function(config) {
    if (config.deployments) {
        for (let i in config.deployments) {
            if (!config.deployments[i].startContainerOnStartup) {
                config.deployments[i].startContainerOnStartup = true;
            }
        }
    }
    config.configFileVersion = 2;
    return config;
}