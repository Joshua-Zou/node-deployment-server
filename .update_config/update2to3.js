module.exports = function(config) {
    if (config.deployments) {
        for (let i in config.deployments) {
            if (!config.deployments[i].environmentVariables) {
                config.deployments[i].environmentVariables = [];
            }
        }
    }
    config.configFileVersion = 3;
    return config;
}