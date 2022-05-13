const fs = require("fs");

let systemConsoleLog = console.log;
let systemConsoleError = console.error;
console.log = function () {
    log([].slice.call(arguments).join(" "));
    systemConsoleLog.apply(this, arguments)
}
console.error = function () {
    log([].slice.call(arguments).join(" "))
    systemConsoleError.apply(this, arguments)
}




module.exports = log
async function log(text) {
    if (!fs.existsSync("./log.txt")) fs.writeFileSync("log.txt", "");
    let date = new Date();
    let timestr = date.toLocaleString('en-us', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }) + "    ";
    fs.appendFileSync("./log.txt", timestr + text + "\n");
    prune();
}
function prune() {
    if (fs.statSync("./log.txt").size > 10000000) {
        removeFirstLine();
        prune();
    } else return true;
}
function removeFirstLine() {
    let csvContent = fs.readFileSync('./log.txt').toString().split('\n');
    csvContent.shift(); 
    csvContent = csvContent.join('\n'); 

    fs.writeFileSync('./log.txt', csvContent);
}