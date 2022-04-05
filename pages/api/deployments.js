const fs = require("fs");
const crypto = require("crypto")
var osu = require('node-os-utils')

export default function handler(req, res) {
    let config = JSON.parse(fs.readFileSync("./nds_config.json", "utf8"));
    if (!config.authorized_users) return res.status(500).send({ error: "No authorized users defined in nds_config.json" });
    if (!config.auth_secret_key) {
        let authkey = crypto.randomBytes(32).toString("hex");
        config.auth_secret_key = authkey;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
    }
    var user = null;
    for (let i in config.authorized_users) {
        let testUser = config.authorized_users[i];
        let hash = crypto.createHash('sha256');
        let userkey = hash.update(testUser.username);
        userkey = hash.update(testUser.password);
        userkey = hash.update(config.auth_secret_key);
        if (userkey.digest('hex') === req.query.auth) {
            user = testUser
            break;
        }
    }
    if (user === null) {
        return res.send({ error: "Invalid authkey" });
    }
    // if (user.permission !== "admin" || user.permission !== "readwrite") {
    //     return res.send({ error: "User does not have adequate permissions to complete this action!" });
    // }

    // done with permission validation


    if (req.query.action === "getDeployments") {
        return res.send({ data: config.deployments || []})
    } else if (req.query.action === "createDeployment") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        
        let name = req.query.name;
        let internalPort = Number(req.query.internalPort);
        let externalPort = Number(req.query.externalPort);
        let memory = req.query.memory;
        let id = crypto.randomBytes(32).toString("hex");

        if (!name) return res.send({ error: "No deployment name specified" });
        if (internalPort < 10 || internalPort > 65535) return res.send({ error: "No internal port specified or port outside of range!" });
        if (externalPort < 10 || externalPort > 65535) return res.send({ error: "No external port specified or port outside of range!" });
        if (config.deployments && config.deployments.find(d => d.externalPort === externalPort)) return res.send({ error: "External port already taken!" });
        if (memory < 512 || memory > osu.mem.totalMem()-10) return res.send({ error: "Memory must be greater than 512 MB and less than host system's memory!" });
        if (!config.deployments) config.deployments = [];
        config.deployments.push({
            name: name,
            internalPort: internalPort,
            externalPort: externalPort,
            memory: memory,
            id: id,
            status: "waiting for initialization",
            runCmd: "start",
            nodeVersion: "node:17.8.0-buster"
        })
        fs.mkdirSync("./deployments/"+id);
        let dockerFile = fs.readFileSync("./deployments/Dockerfile", "utf8");
        dockerFile = dockerFile.replaceAll("{{NODEVERSIONTEMPLATE}}", "node:17.8.0-buster");
        dockerFile = dockerFile.replaceAll("{{INTERNALPORTTEMPLATE}}", internalPort);
        dockerFile = dockerFile.replaceAll("{{DEPLOYMENTIDTEMPLATE}}", id);
        dockerFile = dockerFile.replaceAll("{{RUNCMDTEMPLATE}}", "start");
        fs.writeFileSync(`./deployments/${id}/Dockerfile`, dockerFile);
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({data: "Deployment created successfully!"});
    }
}
String.prototype.replaceAll = function (find, replace){
    var regex = new RegExp(find,'g');
    return this.replace(regex, replace)
}