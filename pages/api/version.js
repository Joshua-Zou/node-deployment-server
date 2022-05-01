const fs = require("fs")
export default function version(req, res) {
    return res.send(fs.readFileSync("./VERSION", "utf8"))
}