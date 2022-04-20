const fs = require("fs");
const crypto = require("crypto");

export default async function handler(req, res) {
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

    if (req.query.action === "listVolumes") {
        let volumes = config.volumes;
        var dockerVolumes = await global.docker.listVolumes();
        dockerVolumes = dockerVolumes.Volumes;

        for (let i in volumes) {
            let volume = volumes[i];
            let dockerVolume = dockerVolumes.find(x => x.Name === "nds-volume-"+volume.id);
            if (dockerVolume) {
                volume.DockerInfo = dockerVolume;
            }
        }
        return res.send({ data: volumes});
    } else if (req.query.action === "deleteVolume") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let volume = docker.getVolume("nds-volume-"+req.query.id);
        try {
            await volume.remove({force: true})
            removeFromDB();
            return res.send({data: "Volume deleted!"});
        } catch(err) {
            if (err.toString().startsWith("Error: (HTTP code 404)")) {
                removeFromDB();
                return res.send({data: "Volume deleted!"});
            }
            return res.send({ error: err.toString() });
        }
        function removeFromDB(){
            let index = config.volumes.findIndex(x => x.id === req.query.id);
            if (index !== -1) {
                config.volumes.splice(index, 1);
            }
            for (let i in config.deployments) {
                let deployment = config.deployments[i];
                let dIndex = deployment.volumes.findIndex(x => x.id === req.query.id);
                if (dIndex !== -1) {
                    config.deployments[i].volumes.splice(dIndex, 1);
                }
            }
            fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        }
    } else if (req.query.action === "createVolume") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        if (!req.query.name) return res.send({ error: "No name specified" });
        if (config.volumes.find(x => x.name === req.query.name)) {
            return res.send({ error: "Volume with that name already exists!" });
        }
        let id = crypto.randomBytes(32).toString("hex");
        await docker.createVolume({
            Name: "nds-volume-"+id
        })
        config.volumes.push({
            id: id,
            name: req.query.name
        })
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({data: "Volume created!"});
    }
}