const fs = require("fs");
const crypto = require("crypto")
var osu = require('node-os-utils')
const itob = require("istextorbinary")
import { IncomingForm } from 'formidable'
const extract = require('extract-zip')

export const config = {
    api: {
      bodyParser: false,
    }
  };

export default async function handler(req, res) {
    try {
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
        if (!req.query.auth) req.query.auth
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
        if (memory < 512 || memory > osu.mem.totalMem()-10) return res.send({ error: "Memory must be greater than 512 MB and less than host system's memory!" });
        if (!config.deployments) config.deployments = [];
        config.deployments.push({
            name: name,
            portMappings: [`${internalPort}:${externalPort}`],
            memory: memory,
            id: id,
            status: "waiting for initialization",
            fullRunCommand: "npm run start",
            nodeVersion: "node:17.8.0-buster",
            startContainerOnStartup: true,
            environmentVariables: {},
            installCommand: "npm install",
            volumes: []
        })
        fs.mkdirSync("./deployments/"+id);
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({data: "Deployment created successfully!"});
    } else if (req.query.action === "getDeploymentInformation") {
        if (user.permission !== "admin" && user.permission !== "readwrite" && user.permission !== "readonly") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        if (!id) return res.send({ error: "No deployment id specified" });
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        return res.send({ data: deployment });
    } else if (req.query.action === "getFiles") {
        let id = req.query.id;
        let path = req.query.path;
        if (!id) return res.send({ error: "No deployment id specified" });
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });

        let files = fs.readdirSync(`./deployments/${id}${path}`);
        for (let i in files) {
            let file = files[i];
            let filename = file;
            files[i] = fs.statSync(`./deployments/${id}${path}/${file}`)
            files[i].name = filename;
            files[i].isDirectory = files[i].isDirectory();
        }
        return res.send({ data: files });
    } else if (req.query.action === "getFile") {
        let id = req.query.id;
        let path = req.query.path;
        if (!id) return res.send({ error: "No deployment id specified" });
        if (!path) return res.send({ error: "No path specified" });
        try {
            let file = fs.readFileSync(`./deployments/${id}${path}`);
            res.header("Content-Disposition", "inline; filename=\""+path.slice(path.lastIndexOf("/")+1)+"\"");
            if (itob.getEncoding(file) === "binary") {
                return res.send(file);
            } else {
                return res.send(file.toString());
            }
        } catch(err) {
            return res.send({ error: "File not found!"});
        }
    } else if (req.query.action === "uploadDeployment") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        

        const data = await new Promise((resolve, reject) => {
            const form = new IncomingForm()
            
            form.parse(req, (err, fields, files) => {
              if (err) return reject(err)
              resolve({ fields, files })
            })
          })
        let zipPath = data.files.zip.filepath;
        await extract(zipPath, { dir: global.projectRoot+"/deployments/"+id })
        let folderName = data.files.zip.originalFilename.slice(0, -4);
        console.log(zipPath, folderName)

        fs.rmSync(`${global.projectRoot}/deployments/${id}/code`, { recursive: true, force: true });
        fs.renameSync(`${global.projectRoot}/deployments/${id}/${folderName}`, `${global.projectRoot}/deployments/${id}/code`)
        fs.unlinkSync(zipPath)
        deployment.internalFolderName = folderName;
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.redirect("/deployment/"+id+"?page=1&message=Deployment uploaded successfully!");
    } else if (req.query.action === "changePort") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let internalPort = req.query.internal;
        let externalPort = req.query.external;

        if (req.query.index === "new") {
            deployment.portMappings.push(`${internalPort}:${externalPort}`);
        } else {
            let index = Number(req.query.index);
            deployment.portMappings[index] = `${internalPort}:${externalPort}`;
        }


        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Deployment updated successfully! Deploy again to apply changes" });
    } else if (req.query.action === "deletePortmap") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
       
        deployment.portMappings.splice(Number(req.query.index), 1);

        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Deployment updated successfully! Deploy again to apply changes" });

    } else if (req.query.action === "updateName") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let name = req.query.name;
        if (!name) return res.send({ error: "No name specified!" });

        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        deployment.name = name;
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Deployment updated successfully! Deploy again to apply changes" });
    } else if (req.query.action === "updateEnvironment") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });

        let memory = req.query.memory;
        let nodeVersion = req.query.nodeVersion;
        let runCmd = req.query.runCmd;
        let installCommand = req.query.installCommand;

        if (!(Number(memory) > 511)) return res.send({ error: "Memory must be at least 512MB!" });
        if (!installCommand) return res.send({ error: "No install command specified!" });

        let imageTag = nodeVersion.slice(nodeVersion.indexOf(":")+1);
        let imageName = nodeVersion.slice(0, nodeVersion.indexOf(":"));
        if (!imageName.includes("/")) {
            imageName = "library/"+imageName;
        }
        let image = await fetch(`https://hub.docker.com/v2/repositories/${imageName}/tags/${imageTag}`);
        image = await image.json();
        if (image.errinfo) return res.send({ error: "Docker image not found on the docker registry!" });

        deployment.memory = memory;
        deployment.nodeVersion = nodeVersion;
        deployment.fullRunCommand = runCmd;
        deployment.installCommand = installCommand;
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Deployment updated successfully! Deploy again to apply changes" });
    } else if (req.query.action === "updateContainerSettings") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        req.query.startContainerOnStartup = req.query.startContainerOnStartup === "true";
        deployment.startContainerOnStartup = req.query.startContainerOnStartup;
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Deployment updated successfully! Deploy again to apply changes" });
    } else if (req.query.action === "restart") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let container = docker.getContainer(`nds-container-${id}`);       
        container.restart();
        return res.send({ data: "Successfully queued deployment restart!" }); 
    } else if (req.query.action === "delete") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let container = docker.getContainer(`nds-container-${id}`);       
        try {
            await container.stop();
            await container.remove();
        }catch(err){}
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        config.deployments.splice(deploymentIndex, 1)
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Successfully deleted deployment server!" }); 
    } else if (req.query.action === "changeEnv") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        let key = req.query.key;
        let value = req.query.value;
        if (!key) return res.send({ error: "No key specified!" });
        if (!value) return res.send({ error: "No value specified!" });
        deployment.environmentVariables[key] = value;
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Environment variables updated successfully! Deploy again to apply changes" });
    } else if (req.query.action === "deleteEnv") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        let key = req.query.key;
        if (!key) return res.send({ error: "No key specified!" });
        delete deployment.environmentVariables[key];
        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Environment variables updated successfully! Deploy again to apply changes" });
    } else if (req.query.action === "deleteAttachedVolume") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        let index = req.query.index;
        if (!index) return res.send({ error: "No index specified!" });
        deployment.volumes.splice(index, 1)
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Detached volume successfully! Deploy again to apply changes" });
    } else if (req.query.action === "updateAttachedVolume") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        let deployment = config.deployments.find(d => d.id === id);
        if (!deployment) return res.send({ error: "Deployment not found!" });
        let deploymentIndex = config.deployments.findIndex(d => d.id === id);
        let volumeId = req.query.volumeId;
        let index = req.query.index;
        let mountpoint = req.query.mountpoint;
        
        if (!volumeId) return res.send({ error: "No volumeId specified!" });
        if (!mountpoint) return res.send({ error: "No mountpoint specified!" });
        if (!index) return res.send({ error: "No index specified!" });
        if (index === "new") {
            index = deployment.volumes.length;
            deployment.volumes.push({})
        }

        if (!config.volumes.find(v => v.id === volumeId)) return res.send({ error: "Volume not found!" });
        if (deployment.volumes.find(v => v.mountpoint === mountpoint)) return res.send({ error: "Mountpoint already in use!" });


        deployment.volumes[index].id = volumeId;
        deployment.volumes[index].mountpoint = mountpoint;

        config.deployments[deploymentIndex] = deployment;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Volume configuration updated successfully! Deploy again to apply changes" });
    }

    } catch(err) {
        return res.send({ error: "An internal server error occured!"+ err.toString()});
    }
}
String.prototype.replaceAll = function (find, replace){
    var regex = new RegExp(find,'g');
    return this.replace(regex, replace)
}

