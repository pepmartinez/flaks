var fs = require ('fs');

module.exports = {
  http: {
//    access_log: false
  },
  agents : {
    https: {
      dolkaren: {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 1024,
        maxFreeSockets: 256,
        timeout: 120000,
        key:   fs.readFileSync('playground/ca/client1-key.pem'),
        cert:  fs.readFileSync('playground/ca/client1-crt.pem'),
        rejectUnauthorized: false,
      }
    }
  },
  vhosts: {
    default: {
      http: {
//        wirelog: true,
//        introspect: false,
        routes: {
          '/a/b/c': {
            target: 'http://localhost:8090/a',
            agent: 'default'
          },
          '/b/(.*)' : {
            target: 'http://www.hh.se:8090/hawks/$1',
            agent: 'default'
          },
          '/b/c/d/(.*)' : {
            target: 'http://localhost:8090/other/$1',
            agent: 'default'
          },
          '/c/(.*)' : {
            target: 'http://localhost:9099/other/$1',
            agent: 'default'
          },
          '/status/(.*)' : {
            target: ['http://localhost:8098/st/504', 'http://localhosto:8090/st/$1', 'http://localhost:8090/st/$1' ],
            lb: 'rand',
            agent: 'default'
          },
          '/lb0/(.*)' : {
            target: [
              'http://localhost:8098/st/504',
              'http://localhosto:8090/st/$1',
              'http://localhost:8090/st/$1'
            ],
            lb: 'rand',
            agent: 'default'
          },
          '/lb/(.*)' : {
            target: [
              {
                url: 'http://localhost:8098/st/$1',
                check: {
                  path: '/health'
                }
              },
              {
                url: 'http://localhosto:8090/st/$1',
                check: {
                  path: '/health'
                }
              },
              {
                url: 'http://www.hh.se:8090/st/$1',
                check: {
                  path: '/health',
                  port: 80
                }
              },
              {
                url: 'http://localhost:8090/st/$1',
                check: {
                  path: '/health'
                }
              },
            ],
            // lb: [seq|spread|rr]
            agent: 'default'
          },
          '/g/(.*)' : {
            target: 'http://www.google.com/$1',
            agent: 'default'
          },
          '/s/(.*)' : {
            target: 'https://localhost:8091/$1',
            agent: 'dolkaren'
          }
        }
      },
      net: {
        incoming_timeout: 14000,
        outgoing_timeout: 15000,
        connect_timeout:  3000,
      }
    },
    'localhost.localdomain': {
      http: {
//        wirelog: (opts, req) => (req.headers.aaaa == '1'),
        wirelog: true,
        introspect: true,
        routes: {
          '/z(.*)': {
            target: [{
              url: 'http://localhost:8090/z/$1',
              check: {
                path: '/health'
              },
            }],
            agent: 'default'
          },
          '/w/(.*)': {
            target: [{
              url: 'http://localhost:8090/w/$1',
              check: {
                path: '/health'
              },
            }],
            agent: 'default'
          },
        }
      },
      net: {
      }
    }
  }
};
