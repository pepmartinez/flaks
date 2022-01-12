const should = require("should");
const _ = require("lodash");
const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");
const async = require("async");
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
        trust_proxy: ["192.168.1.0/24"],
        introspect: true,
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

const config_with_agents = {
  agents: {
    http: {
      default: {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 1024,
        maxFreeSockets: 256,
        timeout: 120000
      }
    }
  },
  vhosts: {
    default: {
      http: {
        introspect: true,
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

describe("introspection", () => {
  it("records introspection correctly with no agent", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      async.series(
        [
          cb =>
            request(context.app)
              .get("/not/defined")
              .end(cb),
          cb =>
            request(context.app)
              .post("/c/nowhere/to/go")
              .send("ddfgdgdgdgdf")
              .type("text")
              .end(cb),
          cb =>
            request(context.app)
              .post("/d/noname/to/go")
              .send("ddfgdgdgdgdf")
              .type("text")
              .end(cb),
          cb =>
            request(context.app)
              .post("/b/h")
              .query({ a: 1, b: "666" })
              .send("ddfgdgdgdgdf")
              .set({ "x-request-id": "qwertyuiop" })
              .type("text")
              .end(cb),
          cb =>
            request(context.app)
              .post("/b/h")
              .query({ a: 1, b: "666" })
              .send("ddfgdgdgdgdf")
              .set({ "x-request-id": "asdfghjkl" })
              .type("text")
              .end(cb)
        ],
        err => {
          if (err) return done(err);
//          console.log (require('util').inspect (context.proxy.status (true), {depth: null, colors: true}));

          const status = context.proxy.status(true);
          status.default['http://localhost:666/other/$1'].should.match({
                ECONNREFUSED: [
                  {
                    id: /.+/,
                    route: "/c/nowhere/(.*)",
                    upstream: {url: "http://localhost:666/other/$1"},
                    req: {
                      method: "POST",
                      url: "http://localhost:666/other/to/go",
                      headers: {
                        "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "close",
                      "content-length": "12",
                      "content-type": "text/plain",
                      host: "localhost:666",
                      "x-request-id": /.+/
                      },
                      body: ''
                    },
                    err: {
                      code: "ECONNREFUSED",
                      syscall: "connect",
                      address: "127.0.0.1",
                      port: 666
                    }
                  }
                ]
              });

              status.default['http://noexistent-host.org:666/other/$1'].should.match({
                ENOTFOUND: [
                  {
                    id: /.+/,
                    route: "/d/noname/(.*)",
                    upstream: {url: "http://noexistent-host.org:666/other/$1"},
                    req: {
                      method: "POST",
                      url: "http://noexistent-host.org:666/other/to/go",
                      headers: {
                      "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "close",
                      "content-length": "12",
                      "content-type": "text/plain",
                      host: "noexistent-host.org:666",
                      "x-request-id": /.+/
                      },
                      body: ''
                    },
                    err: {
                      code: "ENOTFOUND",
                      syscall: "getaddrinfo",
                      hostname: "noexistent-host.org",
                    }
                  }
                ]
              });

              status.default['http://localhost:28090/hawks/$1'].should.match({
                "200": [
                  {
                    id: "qwertyuiop",
                    route: "/b/(.*)",
                    upstream: {url: "http://localhost:28090/hawks/$1"},
                    req: {
                      method: "POST",
                      url: "http://localhost:28090/hawks/h?a=1&b=666",
                      headers: {
                      "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "close",
                      "content-length": "12",
                      "x-request-id": "qwertyuiop",
                      "content-type": "text/plain",
                      host: "localhost:28090"
                      },
                      body: 'ddfgdgdgdgdf'
                    },
                    res: {
                      ver: "1.1",
                      st_code: 200,
                      st_msg: "OK",
                      headers: {
                        "x-powered-by": "Express",
                        "content-type": "application/json; charset=utf-8",
                        "content-length": "361",
                        etag: /.+/,
                        date: /.+/,
                        connection: "close"
                      },
                      body:/.+/
                    }
                  },
                  {
                    id: "asdfghjkl",
                    route: "/b/(.*)",
                    upstream: {url: "http://localhost:28090/hawks/$1"},
                    req: {
                      method: "POST",
                      url: "http://localhost:28090/hawks/h?a=1&b=666",
                      headers: {
                      "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "close",
                      "content-length": "12",
                      "x-request-id": "asdfghjkl",
                      "content-type": "text/plain",
                      host: "localhost:28090"
                      },
                      body: 'ddfgdgdgdgdf'
                    },
                    res: {
                      ver: "1.1",
                      st_code: 200,
                      st_msg: "OK",
                      headers: {
                        "x-powered-by": "Express",
                        "content-type": "application/json; charset=utf-8",
                        "content-length": "360",
                        etag: /.+/,
                        date: /.+/,
                        connection: "close"
                      },
                      body:/.+/
                    }
                  }
                ]
              });

          tserv.close();
          context.shutdown(false, done);
        }
      );
    });
  });

  it("records introspection correctly with agent", done => {
    flaks(config_with_agents, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      async.series(
        [
          cb =>
            request(context.app)
              .get("/not/defined")
              .end(cb),
          cb =>
            request(context.app)
              .post("/c/nowhere/to/go")
              .send("ddfgdgdgdgdf")
              .type("text")
              .end(cb),
          cb =>
            request(context.app)
              .post("/d/noname/to/go")
              .send("ddfgdgdgdgdf")
              .type("text")
              .end(cb),
          cb =>
            request(context.app)
              .post("/b/h")
              .query({ a: 1, b: "666" })
              .send("ddfgdgdgdgdf")
              .set({ "x-request-id": "qwertyuiop", Connection: "keep-alive" })
              .type("text")
              .end(cb),
          cb =>
            request(context.app)
              .post("/b/h")
              .query({ a: 1, b: "666" })
              .send("ddfgdgdgdgdf")
              .set({ "x-request-id": "asdfghjkl", Connection: "keep-alive" })
              .type("text")
              .end(cb)
        ],
        err => {
          if (err) return done(err);
//          console.log (require('util').inspect (context.proxy.status (true), {depth: null, colors: true}));

          const status = context.proxy.status(true);

          status.default['http://localhost:666/other/$1'].should.match({
                ECONNREFUSED: [
                  {
                    id: /.+/,
                    route: "/c/nowhere/(.*)",
                    upstream: {url: "http://localhost:666/other/$1"},
                    req: {
                      method: "POST",
                      url: "http://localhost:666/other/to/go",
                      headers: {
                      "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "close",
                      "content-length": "12",
                      "content-type": "text/plain",
                      host: "localhost:666",
                      "x-request-id": /.+/
                      },
                      body: ''
                    },
                    err: {
                      code: "ECONNREFUSED",
                      syscall: "connect",
                      address: "127.0.0.1",
                      port: 666
                    }
                  }
                ]
              });

              status.default['http://noexistent-host.org:666/other/$1'].should.match({
                ENOTFOUND: [
                  {
                    id: /.+/,
                    route: "/d/noname/(.*)",
                    upstream: {url: "http://noexistent-host.org:666/other/$1"},
                    req: {
                      method: "POST",
                      url: "http://noexistent-host.org:666/other/to/go",
                      headers: {
                      "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "close",
                      "content-length": "12",
                      "content-type": "text/plain",
                      host: "noexistent-host.org:666",
                      "x-request-id": /.+/
                      },
                      body: ''
                    },
                    err: {
                      code: "ENOTFOUND",
                      syscall: "getaddrinfo",
                      hostname: "noexistent-host.org",
                    }
                  }
                ]
              });

              status.default['http://localhost:28090/hawks/$1'].should.match({
                "200": [
                  {
                    id: "qwertyuiop",
                    route: "/b/(.*)",
                    upstream: {url: "http://localhost:28090/hawks/$1"},
                    req: {
                      method: "POST",
                      url: "http://localhost:28090/hawks/h?a=1&b=666",
                      headers: {
                      "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "keep-alive",
                      "content-length": "12",
                      "x-request-id": "qwertyuiop",
                      "content-type": "text/plain",
                      host: "localhost:28090"
                      },
                      body: 'ddfgdgdgdgdf'
                    },
                    res: {
                      ver: "1.1",
                      st_code: 200,
                      st_msg: "OK",
                      headers: {
                        "x-powered-by": "Express",
                        "content-type": "application/json; charset=utf-8",
                        "content-length": "366",
                        etag: /.+/,
                        date: /.+/,
                        connection: "keep-alive"
                      },
                      body:/.+/
                    }
                  },
                  {
                    id: "asdfghjkl",
                    route: "/b/(.*)",
                    upstream: {url: "http://localhost:28090/hawks/$1"},
                    req: {
                      method: "POST",
                      url: "http://localhost:28090/hawks/h?a=1&b=666",
                      headers: {
                      "x-forwarded-host": /.+/,
                      "x-forwarded-proto": "http",
                      "x-forwarded-port": /.+/,
                      "x-forwarded-for": /.+/,
                      connection: "keep-alive",
                      "content-length": "12",
                      "x-request-id": "asdfghjkl",
                      "content-type": "text/plain",
                      host: "localhost:28090"
                      },
                      body: 'ddfgdgdgdgdf'
                    },
                    res: {
                      ver: "1.1",
                      st_code: 200,
                      st_msg: "OK",
                      headers: {
                        "x-powered-by": "Express",
                        "content-type": "application/json; charset=utf-8",
                        "content-length": "365",
                        etag: /.+/,
                        date: /.+/,
                        connection: "keep-alive"
                      },
                      body:/.+/
                    }
                  }
                ]
              });

          tserv.close();
          context.shutdown(false, done);
        }
      );
    });
  });
});
