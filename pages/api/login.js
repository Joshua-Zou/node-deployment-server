// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
const fs = require("fs");
const crypto = require("crypto")
export default function handler(req, res) {
    let username = req.query.username;
    let password = req.query.password;
    let config = JSON.parse(fs.readFileSync("./nds_config.json", "utf8"));
    if (!config.authorized_users) return res.status(500).send({error: "No authorized users defined in nds_config.json"});
    if (!config.authorized_users.find(u => u.username === username && u.password === password)) return res.status(401).send({error: "Invalid username or password"});
    if (!config.auth_secret_key) {
        let authkey = crypto.randomBytes(32).toString("hex");
        config.auth_secret_key = authkey;
        fs.writeFileSync("./nds_config.json", JSON.stringify(config, null, 4));
    }
    var hash = crypto.createHash('sha256');
    var userkey = hash.update(username);
    userkey = hash.update(password);
    userkey = hash.update(config.auth_secret_key);
    return res.send({authkey: userkey.digest('hex')})
}
  
