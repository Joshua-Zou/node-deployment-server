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

    if (req.query.action === "listJobs") {
        let jobs = config.jobs || [];

        return res.send({ data: jobs });
    } else if (req.query.action === "deleteJob") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        console.log(logprefix(user) + "Deleted job with id " + id);
        removeFromDB()
        return res.send({ data: "Volume deleted!" });
        function removeFromDB() {
            let index = config.jobs.findIndex(x => x.id === req.query.id);
            if (index !== -1) {
                config.jobs.splice(index, 1);
            }
            fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        }
    } else if (req.query.action === "createJob") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;
        config.jobs.push({
            id: crypto.randomBytes(32).toString("hex"),
            name: req.query.name,
            run_every: 60,
            enabled: false,
            actions: []
        })
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        console.log(logprefix(user) + "Created job with id " + id);
        return res.send({ data: "Volume created!" });
    } else if (req.query.action === "updateJob") {
        if (user.permission !== "admin" && user.permission !== "readwrite") {
            return res.send({ error: "User does not have adequate permissions to complete this action!" });
        }
        let id = req.query.id;

        let job = req.query.job;
        job = Buffer.from(job, 'base64').toString('ascii');
        try {
            job = JSON.parse(job);
            console.log(job)
            if (!job.run_every >= 10) return res.send({ error: "Run interval must be at least 10 minutes!" });
            if (!job.name) return res.send({ error: "Job name must be specified!" });
            if (!job.actions) return res.send({ error: "Job actions must be specified!" });
            if (!job.actions.length) return res.send({ error: "Job actions must be specified!" });
            for (let i in job.actions) {
                let action = job.actions[i];
                if (!action.data) return res.send({ error: "Job action data must be specified!" });
                if (action.action === "check_deployment") {
                    for (let p in action.data.running) {
                        if (action.data.running[p].type !== "fetch" && action.data.running[p].type !== "pause" && action.data.running[p].type !== "unpause" && action.data.running[p].type !== "restart" && action.data.running[p].type !== "delete") {
                            return res.send({ error: `Parameter in 'action[${i}].data.running[${p}].type' must be of type fetch, pause, unpause, restart, or delete!` });
                        }
                    }
                    for (let p in action.data["failed to start"]) {
                        if (action.data.running[p].type !== "fetch" && action.data.running[p].type !== "pause" && action.data.running[p].type !== "unpause" && action.data.running[p].type !== "restart" && action.data.running[p].type !== "delete") {
                            return res.send({ error: `Parameter in 'action[${i}].data.failed to start[${p}].type' must be of type fetch, pause, unpause, restart, or delete!` });
                        }
                    }
                }
            }

            let jobIndex = config.jobs.findIndex(x => x.id === id);
            if (jobIndex === -1) return res.send({ error: "Job not found!" });
            config.jobs[jobIndex] = job;
            fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
            return res.send({data: "Job updated!"});
        }catch(err) {
            return res.send({ error: "Invalid job config! (Not valid JSON)" });
        }
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

export const config = {
    api: {
        responseLimit: false,
    },
}