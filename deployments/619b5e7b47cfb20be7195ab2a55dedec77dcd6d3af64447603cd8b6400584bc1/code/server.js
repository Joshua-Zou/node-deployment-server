const {MongoClient} = require('mongodb')
const $ = require('mongo-dot-notation')
const fetch = require('node-fetch');
const uri = "mongodb connection string";
const mongoclient = new MongoClient(uri, {poolSize: 10, bufferMaxEntries: 0, useNewUrlParser: true,useUnifiedTopology: true});
mongoclient.connect(async function(err, mongoclient){
  
const express = require('express');
const app = express();
const cors = require("cors")
var bodyParser = require('body-parser')
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

let port =  3000;
app.set('port', port);
const session = require('express-session');
app.use(cors({ origin: "https://discordbotlist.com"}))
app.get('/', (req, res) => {
  res.render("main.ejs")
})
app.get("/make", async (req, res) => {
  let results = await checkStuff(mongoclient, req.query.discordid);
  if (results === null){
    res.render("noUser.ejs")
  }else{
let randomId = await makeid(10)
   let todo = {
      "price_amount": 10,
      "price_currency": "usd",
      "pay_currency":"doge",
      "order_id":randomId,
      "order_description":{
        "discordid":req.query.discordid,
        "product":"small"
      },
      "ipn_callback_url":"https://ElonBot.joshuazou.repl.co/payment-received"
    };

    let results = await fetch('https://api.nowpayments.io/v1/payment', {
       method: 'POST',
       body: JSON.stringify(todo),
       headers: { 'Content-Type': 'application/json', 'x-api-key':"secret api key"}
       })
    results = await results.json();
    res.render("makepayment.ejs", {data: results});
  }
})
app.post("/reward", async (req, res) => {
  console.log("pog boi I got a package")
  if (!req.headers) return res.status(400).send("You didn't even send ANY headers. Is that even possible?");
  if (!req.headers.authorization) return res.status(407).send("Authentication required");
  if (req.headers.authorization !== "a thingy that I set"){
    console.log("sadge I might be getting hacked")
    return res.status(401).send("Uh Oh. If you're a hacker, f*** off. If you're not, sorry but you're not allowed to do that operation.");
  }
  if (!req.body) return res.status(400).send("No body? How is that even possible lol");
  if (!req.body.id) return res.status(400).send("Didn't send enough user info");

  console.log(req.body.id)
  let doge = Math.floor(Math.random() * 9000)+1000;
  let gold = Math.floor(Math.random() * 1000);
  if (gold<100) gold = 1;
  else gold = 0;
  let rocket = 1;

console.log("added gold:"+gold)
console.log("added rocket:"+"1");
console.log("added doge: "+doge)

  await mongoclient.db("elonbot").collection("everything")
  .updateOne({name: req.body.id}, { $inc: {"currency.doge":doge}})

  await mongoclient.db("elonbot").collection("everything")
  .updateOne({name: req.body.id}, { $inc: {"inventory.rockets":1}})

})
app.get("/discord-id", async (req, res)=>{
  res.redirect("https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-")
})
app.post("/payment-received", async (req, res)=>{
console.log(req.body);
console.log(req.headers)
      const { createHmac } = require("crypto")
var params = req.body;
  const hmac = createHmac('sha512', "don't look at that");
  hmac.update(JSON.stringify(params, Object.keys(params).sort()));
  const signature = hmac.digest('hex');
console.log("generated signature: "+ signature);
console.log("given signature: "+ req.headers["x-nowpayments-sig"])

if (req.headers["x-nowpayments-sig"] !== signature) return;

  if (req.body.payment_status === "waiting") return;
  let desc = await JSON.parse(req.body.order_description);
  console.log(desc)
  let userData = await checkStuff(mongoclient, desc.discordid);
  if (userData){

    if (!userData.inventory.small){
      await mongoclient.db("elonbot").collection("everything")
     .updateOne({name: desc.discordid}, { $set: {"inventory.small":1}})
    }else{
      await mongoclient.db("elonbot").collection("everything")
     .updateOne({name: desc.discordid}, { $inc: {"inventory.small":1}})
    }

  console.log("wow that actually worked")
  }else{
    console.log("no user sadge")
    return res.redirect("https://google.com")
  }
})
app.listen(port, () => console.info(`Listening on port ${port}`));

async function checkStuff(mongoclient, name){
      try{
    let result = await mongoclient.db("elonbot").collection("everything")
    .findOne({name: name});
    return result;
      }catch(err){
          console.log(err)
      }
  }
  function makeid(length) {
    var result           = '';
    var characters       = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
 }
})
