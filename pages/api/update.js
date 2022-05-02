const fs = require("fs");
const crypto = require("crypto")
const fetch = require("node-fetch");
const childProcess = require("child_process");

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
    if (user.permission !== "admin") {
        return res.send({ error: "User does not have admin permission" });
    }

    // done with admin validation


    if (req.query.action === "getIfNeedUpdate") {
        let newestVersion = global.latestVersion;
        let currentVersion = fs.readFileSync("./VERSION", "utf8").slice(1);
        if (versionCompare(newestVersion, currentVersion) > 0) {
            return res.send({ data: newestVersion });
        } else {
            return res.send({ data: false });
        }
    } else if (req.query.action === "getLatestVersion") {
        let newestVersion = global.latestVersion;
        return res.send({ data: newestVersion });
    } else if (req.query.action === "update") {
        res.send({ data: "Updating..." });
        console.log("Launching updater")
        process.on("exit", function () {
            require("child_process").spawn("npm", ["run", "update"], {
                cwd: process.cwd(),
                detached: true,
                stdio: "inherit",
                shell: true
            });
        });
        process.exit();
    }
}

function versionCompare(v1, v2, options) {
    var lexicographical = options && options.lexicographical,
        zeroExtend = options && options.zeroExtend,
        v1parts = v1.split('.'),
        v2parts = v2.split('.');

    function isValidPart(x) {
        return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
        return NaN;
    }

    if (zeroExtend) {
        while (v1parts.length < v2parts.length) v1parts.push("0");
        while (v2parts.length < v1parts.length) v2parts.push("0");
    }

    if (!lexicographical) {
        v1parts = v1parts.map(Number);
        v2parts = v2parts.map(Number);
    }

    for (var i = 0; i < v1parts.length; ++i) {
        if (v2parts.length == i) {
            return 1;
        }

        if (v1parts[i] == v2parts[i]) {
            continue;
        }
        else if (v1parts[i] > v2parts[i]) {
            return 1;
        }
        else {
            return -1;
        }
    }

    if (v1parts.length != v2parts.length) {
        return -1;
    }

    return 0;
}
