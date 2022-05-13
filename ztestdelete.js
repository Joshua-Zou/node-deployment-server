const fetch = require("node-fetch");

function x() {
    fetch("http://localhost:3100/api/login?username=admin&password=password")
    setTimeout(x, 50);
}
x();