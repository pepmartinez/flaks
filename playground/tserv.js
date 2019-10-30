const express =    require ('express');
const bodyParser = require ('body-parser');
const https =      require ('https');
const fs =         require ('fs');


const app = express ();
app.use (bodyParser.urlencoded ({extended: true}));
app.use (bodyParser.json ());
app.use (bodyParser.text());

app.all ('*', (req, res) => {
  res.send ({
    q: req.query,
    h: req.headers,
    u: req.url,
    b: req.body,
    c: req.socket.getPeerCertificate().subject,
    a: req.client.authorized
  });
});

app.listen (8090);

const opts = {
//  key: fs.readFileSync('./ca/server-key.pem'),
//  cert: fs.readFileSync('./ca/server-crt.pem'),
  key: fs.readFileSync('./server-key.pem'),
  cert: fs.readFileSync('./server-crt.pem'),
//  ca: [ fs.readFileSync('./ca/ca-crt.pem') ],
ca: [ fs.readFileSync('server-crt.pem'), fs.readFileSync('./ca/ca-crt.pem')],
  requestCert: true,
  rejectUnauthorized: false,
};

const svr = https.createServer(opts, app);
svr.listen(8091, err => {
  if (err) console.err(err);
  else console.log ('listening');
});
