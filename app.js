const express = require('express')
const next = require('next')
const fs = require("fs")

const port = JSON.parse(fs.readFileSync("./nds_config.json")).port || 3100
const dev = process.argv.includes('--dev')
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  server.get("/mode-json.js", (req, res) => {
    const file = fs.readFileSync("./node_modules/ace-builds/src-noconflict/mode-json.js", "utf8")
    res.setHeader("Content-Type", "application/javascript")
    res.end(file)
  })

  server.all('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
