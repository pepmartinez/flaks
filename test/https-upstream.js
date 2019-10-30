const should = require("should");
const _ = require("lodash");
const request = require("supertest");
const express = require("express");
const https = require("https");
const fs = require("fs");
const bodyParser = require("body-parser");

const flaks = require("../uber-app");

function _get_me_an_app() {
  const app = express();
  app.use(
    bodyParser.urlencoded({
      extended: true
    })
  );
  app.use(bodyParser.json());
  app.use(bodyParser.text());

  app.all("*", (req, res) => {
    res.send({
      q: req.query,
      h: req.headers,
      u: req.url,
      b: req.body,
      c: req.socket.getPeerCertificate().subject,
      a: req.client.authorized
    });
  });

  return app;
}

function _get_me_an_https_server() {
  const opts = {
    key: fs.readFileSync("./test/certs/server-key.pem"),
    cert: fs.readFileSync("./test/certs/server-crt.pem"),
    ca: [fs.readFileSync("./test/certs/server-crt.pem")],
    requestCert: false,
    rejectUnauthorized: false
  };

  const svr = https.createServer(opts, _get_me_an_app());
  svr.listen(28090);
  return svr;
}

function _get_me_an_https_server_with_client_cert(hard) {
  const opts = {
    key: fs.readFileSync("./test/certs/server-key.pem"),
    cert: fs.readFileSync("./test/certs/server-crt.pem"),
    ca: [fs.readFileSync("./test/certs/server-crt.pem"), fs.readFileSync('./test/certs/ca/ca-crt.pem')],
    requestCert: true,
    rejectUnauthorized: (hard ? true : false)
  };

  const svr = https.createServer(opts, _get_me_an_app());
  svr.listen(28090);
  return svr;
}

function _get_me_an_https_server_with_client_cert_short_ca(hard) {
  const opts = {
    key: fs.readFileSync("./test/certs/server-key.pem"),
    cert: fs.readFileSync("./test/certs/server-crt.pem"),
    ca: [fs.readFileSync("./test/certs/server-crt.pem")],
    requestCert: true,
    rejectUnauthorized: (hard ? true : false)
  };

  const svr = https.createServer(opts, _get_me_an_app());
  svr.listen(28090);
  return svr;
}

const config = {
  agents: {
    https: {
      dolkaren: {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 1024,
        maxFreeSockets: 256,
        timeout: 120000,
        key:   fs.readFileSync('./test/certs/ca/client1-key.pem'),
        cert:  fs.readFileSync('./test/certs/ca/client1-crt.pem'),
        rejectUnauthorized: false,
      }
    }
  },
  vhosts: {
    default: {
      http: {
        routes: {
          "/(.*)": {
            target: "https://xana:28090/$1",
            agent: "default",
            secure: false
          },
          '/s/(.*)' : {
            target: 'https://localhost:28090/aadvark/$1',
            agent: 'dolkaren'
          }
        }
      },
      net: {
        incoming_timeout: 3000,
        outgoing_timeout: 2000
      }
    }
  }
};

describe("HTTPS upstream", () => {
  before(done => {
    done();
  });
  after(done => {
    done();
  });

  describe("plain https, no agent", () => {
    it("proxies to https ok", done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let tserv = _get_me_an_https_server();

        request(context.app)
          .post("/a/hilfe")
          .query({
            a: 1,
            b: "666"
          })
          .send("ddfgdgdgdgdf")
          .set({
            "x-request-id": "qwertyuiop"
          })
          .type("text")
          .expect(200)
          .end((err, res) => {
            if (err) return done (err);

            res.body.should.match({
              q: {
                a: "1",
                b: "666"
              },
              h: {
                "x-forwarded-host": /.+/,
                "x-forwarded-proto": "http",
                "x-forwarded-port": /.+/,
                "x-forwarded-for": /.+/,
                connection: "close",
                "content-length": "12",
                "x-request-id": "qwertyuiop",
                "content-type": "text/plain",
                "user-agent": /node-superagent/,
                "accept-encoding": /.+/,
                host: "xana:28090"
              },
              u: "/a/hilfe?a=1&b=666",
              b: "ddfgdgdgdgdf",
              a: false
            });

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });

    it("fails controlled on http call with no client cert if it's required", done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let tserv = _get_me_an_https_server_with_client_cert (true);

        request(context.app)
          .post("/a/hilfe")
          .query({
            a: 1,
            b: "666"
          })
          .send("ddfgdgdgdgdf")
          .set({
            "x-request-id": "qwertyuiop"
          })
          .type("text")
          .expect(503)
          .end(err => {
            tserv.close();
            context.shutdown(false, done);
          });
      });
    });


  });


  describe ('with agent', () => {

    it("calls ok with required client cert", done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let tserv = _get_me_an_https_server_with_client_cert ();

        request(context.app)
          .post("/s/hilfe")
          .query({
            a: 1,
            b: "666"
          })
          .send("ddfgdgdgdgdf")
          .set({
            "x-request-id": "qwertyuiop",
            Connection: "keep-alive"
          })
          .type("text")
          .expect(200)
          .end((err, res) => {
            if (err) return done (err);

            res.body.should.match({
              q: {
                a: "1",
                b: "666"
              },
              h: {
                "x-forwarded-host": /.+/,
                "x-forwarded-proto": "http",
                "x-forwarded-port": /.+/,
                "x-forwarded-for": /.+/,
                connection: "keep-alive",
                "content-length": "12",
                "x-request-id": "qwertyuiop",
                "content-type": "text/plain",
                "user-agent": /node-superagent/,
                "accept-encoding": /.+/,
                host: "localhost:28090"
              },
              u: '/aadvark/hilfe?a=1&b=666',
              b: 'ddfgdgdgdgdf',
              c: {
                C: 'ES',
                ST: 'AS',
                L: 'Siero',
                O: 'Example Co',
                OU: 'techops',
                CN: 'client1',
                emailAddress: 'certs@example.com'
              },
              a: true
            });

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });


    it("fails controlled on http call with unknown client cert if it's required", done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let tserv = _get_me_an_https_server_with_client_cert_short_ca (true);

        request(context.app)
          .post("/s/hilfe")
          .query({
            a: 1,
            b: "666"
          })
          .send("ddfgdgdgdgdf")
          .set({
            "x-request-id": "qwertyuiop"
          })
          .type("text")
          .expect(504)
          .end((err, res) => {
            tserv.close();
            context.shutdown(false, done);
          });
      });
    });

  });
});
