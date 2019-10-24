const express =    require ('express');
const bodyParser = require ('body-parser');


const app = express ();
app.use (bodyParser.urlencoded ({extended: true}));
app.use (bodyParser.json ());
app.use (bodyParser.text());

app.all ('*', (req, res) => {
  res.send ({q: req.query, h: req.headers, u: req.url, b: req.body});
});

app.listen (8090);

