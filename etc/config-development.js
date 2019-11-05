var fs = require ('fs');

module.exports = {
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
        wirelog: false,
        introspect: false,
        routes: {
          '/a/b/c': {
            target: 'http://xana:8090/a',
            agent: 'default'
          },
          '/b/(.*)' : {
            target: 'http://xana:8090/hawks/$1',
            agent: 'default'
          },
          '/b/c/d/(.*)' : {
            target: 'http://xana:8090/other/$1',
            agent: 'default'
          },
          '/c/(.*)' : {
            target: 'http://xana:9099/other/$1',
            agent: 'default'
          },
          '/g/(.*)' : {
            target: 'https://www.google.com/$1',
            agent: 'default'
          },
          '/s/(.*)' : {
            target: 'https://localhost:8091/$1',
            agent: 'dolkaren'
          }
        }
      },
      net: {
      }
    },
    'localhost.localdomain': {
      http: {
        wirelog: (opts, req) => (req.headers.aaaa == '1'),
        introspect: true,
        routes: {
          '/z(.*)': {
            target: 'http://xana:8090/z/$1',
            agent: 'default'
          },
          '/w/(.*)': {
            target: 'http://xana:8090/w/$1',
            agent: 'default'
          },
        }
      },
      net: {
      }
    }
  }
};
