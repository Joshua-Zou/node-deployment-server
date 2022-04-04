var osu = require('node-os-utils')

export default async function handler(req, res) {
    var cpu = osu.cpu;
    var mem = osu.mem

    return res.send({
        cpuCount: cpu.count(),
        cpuUsage: await cpu.usage(500),
        cpuModel: cpu.model(),
        cpuStats: cpu.average(),
        memInfo: await mem.info(250),
    })
}
  
