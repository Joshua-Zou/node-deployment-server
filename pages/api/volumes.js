const fs = require("fs");
const crypto = require("crypto");
const itob = require("istextorbinary")
const archiver = require('archiver');

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
            let dockerVolume = dockerVolumes.find(x => x.Name === "nds-volume-" + volume.id);
            if (dockerVolume) {
                volume.DockerInfo = dockerVolume;
            }
        }
        return res.send({ data: volumes });
    } else if (req.query.action === "deleteVolume") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let volume = docker.getVolume("nds-volume-" + id);
        try {
            await volume.remove({ force: true })
            removeFromDB();
            console.log(logprefix(user)+"Deleted volume with id "+id);
            return res.send({ data: "Volume deleted!" });
        } catch (err) {
            if (err.toString().startsWith("Error: (HTTP code 404)")) {
                console.log("Failed to remove volume "+id+" from the docker daemon. It most likely never existed in the first place. Removing from NDS database...");
                removeFromDB();
                console.log(logprefix(user)+"Deleted volume with id "+id);
                return res.send({ data: "Volume deleted!" });
            }
            console.log("Failed to delete volume "+id+". Error: "+err);
            return res.send({ error: err.toString() });
        }
        function removeFromDB() {
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
            Name: "nds-volume-" + id
        })
        config.volumes.push({
            id: id,
            name: req.query.name
        })
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        console.log(logprefix(user)+"Created volume with id "+id);
        return res.send({ data: "Volume created!" });
    } else if (req.query.action === "getVolume") {
        if (!req.query.id) return res.send({ error: "No id specified" });
        let volume = config.volumes.find(x => x.id === req.query.id);
        if (!volume) return res.send({ error: "Volume not found!" });
        let dockerVolume = await docker.getVolume("nds-volume-" + volume.id);
        try {
            dockerVolume = await dockerVolume.inspect();
        } catch(err) {
            dockerVolume = null
        }
        var exploreSupported = false;
        if (global.VolumeExplorer !== null) exploreSupported = true;
        volume.exploreSupported = exploreSupported;
        if (dockerVolume) {
            volume.DockerInfo = dockerVolume;
        }
        return res.send({ data: volume });
    } else if (req.query.action === "getFiles") {
        if (!req.query.id) return res.send({ error: "No id specified" });
        let volume = config.volumes.find(x => x.id === req.query.id);
        if (!volume) return res.send({ error: "Volume not found!" });
        let dockerVolume = await docker.getVolume("nds-volume-" + volume.id);
        dockerVolume = await dockerVolume.inspect();
        if (!dockerVolume) return res.send({ error: "Volume not found!" });
        let files = await global.VolumeExplorer.volume(dockerVolume.Name).readDir(req.query.path);
        for (let i in files) {
            let file = files[i]
            files[i] = await global.VolumeExplorer.volume(dockerVolume.Name).stat(req.query.path);
            files[i].name = file.name
            files[i].isDirectory = file.type === "directory"
        }
        return res.send({ data: files });
    } else if (req.query.action === "getFile") {
        let id = req.query.id;
        let path = req.query.path;
        if (!id) return res.send({ error: "No volume id specified" });
        if (!path) return res.send({ error: "No path specified" });
        try {
            let file = await global.VolumeExplorer.volume("nds-volume-" + id).readFile(path);
            res.header("Content-Disposition", "inline; filename=\"" + path.slice(path.lastIndexOf("/") + 1) + "\"");
            if (itob.getEncoding(file) === "binary") {
                return res.send(file);
            } else {
                return res.send(file.toString());
            }
        } catch (err) {
            return res.send({ error: "File not found!" });
        }
    } else if (req.query.action === "getDownloadLink") {
        if (!req.query.id) return res.send({ error: "No id specified" });
        let volume = config.volumes.find(x => x.id === req.query.id);
        if (!volume) return res.send({ error: "Volume not found!" });
        let dockerVolume = await docker.getVolume("nds-volume-" + volume.id);
        dockerVolume = await dockerVolume.inspect();
        let id = req.query.id;
        if (!dockerVolume) return res.send({ error: "Volume not found!" });
        fs.rmSync("./static/tmp-volume-data/" + id, { recursive: true, force: true });
        fs.mkdirSync("./static/tmp-volume-data/" + id);
        if (!req.query.path) req.query.path = "/";
        await global.VolumeExplorer.volume(dockerVolume.Name).copyDir(req.query.path, "./static/tmp-volume-data/" + id + "/folder", function (status) {
        })
        await zipDirectory("./static/tmp-volume-data/" + id + "/folder", "./static/tmp-volume-data/" + id + "/archive.zip");
        fs.rmSync("./static/tmp-volume-data/" + id + "/folder", { recursive: true, force: true });
        console.log(logprefix(user)+"Created download link for volume "+id);
        return res.send({ data: `/api/volumes?auth=${req.query.auth}&action=download&id=${req.query.id}` });
    } else if (req.query.action === "download") {
        if (!req.query.id) return res.send({ error: "No id specified" });
        return res.redirect("/static/tmp-volume-data/" + req.query.id + "/archive.zip");
    }
}
function zipDirectory(sourceDir, outPath) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);
  
    return new Promise((resolve, reject) => {
      archive
        .directory(sourceDir, false)
        .on('error', err => reject(err))
        .pipe(stream)
        ;
  
      stream.on('close', () => resolve());
      archive.finalize();
    });
  }