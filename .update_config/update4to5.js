module.exports = function(config) {
    if (config.deployments) {
        // Updating volume config
        for (let i in config.deployments) {
            let deployment = config.deployments[i];
            if (!deployment.volumes) {
                deployment.volumes = [];
            }
        }
    }
    if (!config.volumes) config.volumes = []
    config.configFileVersion = 5;
    return config;
}