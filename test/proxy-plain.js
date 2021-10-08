const should = require("should");
const _ = require("lodash");
const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");
const flaks = require("../uber-app");

function _get_me_an_app() {
  const app = express();
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(bodyParser.text());

  app.all("*", (req, res) => {
    res.send({ q: req.query, h: req.headers, u: req.url, b: req.body });
  });

  return app;
}

const config = {
  agents: {},
  vhosts: {
    default: {
      http: {
        routes: {
          "/a/b/c": {
            target: "http://localhost:28090/a",
            agent: "default"
          },
          "/b/(.*)": {
            target: "http://localhost:28090/hawks/$1",
            agent: "default"
          },
          "/b/c/d/(.*)": {
            target: "http://localhost:28090/other/$1",
            agent: "default"
          },
          "/c/nowhere/(.*)": {
            target: "http://localhost:666/other/$1",
            agent: "default"
          },
          "/d/noname/(.*)": {
            target: "http://noexistent-host.org:666/other/$1",
            agent: "default"
          },
          "/d/fwall/(.*)": {
            target: "http://1.1.1.1:6666/other/$1",
            agent: "default"
          },
          "/e/(.*)": {
            target: "http://localhost:28090/sonics?what=$1",
            agent: "default"
          },
          "/f/(.*)/g/(.*)": {
            target: "http://localhost:28090/$1/a/$2",
            agent: "default"
          },
        }
      },
      net: {
        incoming_timeout: 3000,
        outgoing_timeout: 2000,
        connect_timeout: 1000
      }
    }
  }
};

describe("Simple Routes, no agents", () => {
  it("GET to undefined path gets 404", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      request(context.app)
        .get("/not/defined")
        .expect(404)
        .end(err => {
          context.shutdown(false, done);
        });
    });
  });

  it("PUT to undefined path gets 404", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      request(context.app)
        .put("/not/defined")
        .send("ddfgdgdgdgdf")
        .type("text")
        .expect(404)
        .end(err => {
          context.shutdown(false, done);
        });
    });
  });

  it("POST to undefined path gets 404", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      request(context.app)
        .post("/not/defined")
        .send("ddfgdgdgdgdf")
        .type("text")
        .end((err, res) => {
          context.shutdown(false, done);
          res.status.should.equal(404);
        });
    });
  });

  it("POST to non-listening port gets 503", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      request(context.app)
        .post("/c/nowhere/to/go")
        .send("ddfgdgdgdgdf")
        .type("text")
        .end((err, res) => {
          context.shutdown(false, done);
          res.status.should.equal(502);
        });
    });
  });

  it("POST to non-resolv port gets 502", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      request(context.app)
        .post("/d/noname/to/go")
        .send("ddfgdgdgdgdf")
        .type("text")
        .end((err, res) => {
          context.shutdown(false, done);
          res.status.should.equal(502);
        });
    });
  });

  it("POST to firewalled port gets 502 after 1 secs", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      const hrstart = process.hrtime();

      request(context.app)
        .post("/d/fwall/to/go")
        .send("ddfgdgdgdgdf")
        .type("text")
        .end((err, res) => {
          const hrend = process.hrtime(hrstart);
          const delta = (hrend[0]*1e9 + hrend[1]) / 1e6;
          delta.should.be.approximately(1000, 200);
          context.shutdown(false, done);
          res.status.should.equal(502);
        });
    });
  });

  it("proxies POST ok", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .post("/b/h")
        .query({ a: 1, b: "666" })
        .send("ddfgdgdgdgdf")
        .set({
          "x-request-id": "qwertyuiop"
        })
        .type("text")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          res.body.q.should.eql({ a: "1", b: "666" });
          res.body.u.should.eql("/hawks/h?a=1&b=666");
          res.body.b.should.eql("ddfgdgdgdgdf");
          res.body.h.should.match({
            "x-forwarded-host": /^127.0.0.1:.+/,
            "x-forwarded-proto": "http",
            "x-forwarded-port": /.+/,
            "x-forwarded-for": "::ffff:127.0.0.1",
            connection: "close",
            "content-length": "12",
            "x-request-id": "qwertyuiop",
            "content-type": "text/plain",
            "accept-encoding": "gzip, deflate",
            host: /localhost:.+/
          });

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });

  it("proxies querystring ok if not modified", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .get("/b/h")
        .query({ a: 1, b: "666" })
        .send("ddfgdgdgdgdf")
        .set({
          "x-request-id": "qwertyuiop"
        })
        .type("text")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          res.body.q.should.eql({ a: "1", b: "666" });
          res.body.u.should.eql("/hawks/h?a=1&b=666");

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });

  it("proxies ok if qstring is modified/added", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .get("/e/hello")
        .send("ddfgdgdgdgdf")
        .set({
          "x-request-id": "qwertyuiop"
        })
        .type("text")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          res.body.q.should.eql({ what: 'hello'});
          res.body.u.should.eql("/sonics?what=hello");

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });

  it("proxies querystring ok if modified", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .get("/e/hello")
        .query({ a: 1, b: "666" })
        .send("ddfgdgdgdgdf")
        .set({
          "x-request-id": "qwertyuiop"
        })
        .type("text")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          res.body.q.should.eql({ what: 'hello', a: "1", b: "666" });
          res.body.u.should.eql("/sonics?what=hello&a=1&b=666");

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });

  it("proxies url ok if not qstring passed", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .get("/b/h")
        .send("ddfgdgdgdgdf")
        .set({
          "x-request-id": "qwertyuiop"
        })
        .type("text")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          res.body.q.should.eql({});
          res.body.u.should.eql("/hawks/h");

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });

  it("proxies url ok with more than one capture", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .get("/f/aaa/g/bbb/ccc")
        .send("ddfgdgdgdgdf")
        .set({
          "x-request-id": "qwertyuiop"
        })
        .type("text")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          res.body.q.should.eql({});
          res.body.u.should.eql("/aaa/a/bbb/ccc");

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });


});
