const fs = require("fs");
const crypto = require("crypto")
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
    if (user.permission !== "admin") {
        return res.send({ error: "User does not have admin permission" });
    }

    // done with admin validation


    if (req.query.action === "getUserList") {
        return res.send({ data: config.authorized_users })
    } else if (req.query.action === "deleteUser") {
        let deleteUsername = req.query.username;
        let deleteUser = config.authorized_users.find(user => user.username === deleteUsername);
        if (!deleteUser) return res.send({ error: "InternalServerError: User not found!" });
        if (deleteUser.permission === "admin") return res.send({ error: "You can't delete admin accounts!" });
        config.authorized_users = config.authorized_users.filter(user => user.username !== deleteUsername);
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        console.log("User " + deleteUsername + " deleted!");
        return res.send({ data: "Success! User with username " + deleteUsername + " has been deleted!" });
    } else if (req.query.action === "addUser") {
        let addUsername = req.query.username;
        let addPassword = req.query.password;
        let addPermission = req.query.permission;
        if (addUsername.length < 2) return res.send({ error: "Username must be at least 2 characters long" });
        if (addPermission !== "readwrite" && addPermission !== "readonly") return res.send({ error: "You can't add admin accounts!" });
        if (config.authorized_users.find(user => user.username === addUsername)) return res.send({ error: "User with username " + addUsername + " already exists!" });
        config.authorized_users.push({ username: addUsername, password: addPassword, permission: addPermission });
        console.log("User " + addUsername + " added!");
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        return res.send({ data: "Success! User with username " + addUsername + " has been added!" });
    } else if (req.query.action === "getRawConfigFile") {
        return res.send(fs.readFileSync("./nds_config.json", "utf8"));
    } else if (req.query.action === "setRawConfigFile") {
        let newConfig = req.query.config;
        newConfig = Buffer.from(newConfig, 'base64').toString('ascii')
        try {
            JSON.parse(newConfig)
            fs.writeFileSync("./nds_config.json", newConfig);
            return res.send({ data: "Success! Config file has been updated!" });
        } catch (err) {
            return res.send({ error: "Invalid JSON!" });
        }
    } else if (req.query.action === "changePort") {
        let newPort = req.query.port;
        newPort = Number(newPort);
        if (newPort > 65535 || newPort < 10) {
            return res.send({ error: "Port must be between 10 and 65535" });
        }
        config.port = newPort;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
        console.log("Port changed to " + newPort);
        return res.send({ data: "Success! Port has been updated! Restart the server to apply the changes!" });
    } else if (req.query.action === "restartServer") {
        setTimeout(function () {
            process.on("exit", function () {
                require("child_process").spawn("npm", ["run", "start"], {
                    cwd: process.cwd(),
                    detached: true,
                    stdio: "inherit",
                    shell: true
                });
            });
            process.exit();
        }, 5000);
        console.log("Queued server restart.");
        return res.send({ data: "Success! Server will restart in 5 seconds!" });
    }
}
