const express = require('express');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;
let server = require('./qr'),
    code = require('./pair');
require('events').EventEmitter.defaultMaxListeners = 500;

// Raw QR image endpoint (used by qr.html via fetch)
app.use('/qr-image', server);

// QR scan page
app.use('/qr', async (req, res, next) => {
  res.sendFile(__path + '/qr.html')
});

// Pair code API
app.use('/code', code);

// Pair page
app.use('/pair', async (req, res, next) => {
  res.sendFile(__path + '/pair.html')
});

// Home
app.use('/', async (req, res, next) => {
  res.sendFile(__path + '/main.html')
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.listen(PORT, () => {
    console.log(`
Don't Forget To Give Star

 Server running on http://localhost:` + PORT)
})

module.exports = app
