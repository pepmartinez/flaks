
module.exports = {
  listen_port: 8080,
  http: {
    trust_proxy: ['192.168.1.0/24'],
    wiredump: true,
    agents: {
    },
    routes: {
      '/a/b/c': {
        target: 'http://xana:8090/a',
        agent: 'string|object'
      },
      '/b/(.*)' : {
        target: 'http://xana:8090/hawks/$1',
        agent: 'string|object'
      },
      '/b/c/d/(.*)' : {
        target: 'http://xana:8090/other/$1',
        agent: 'string|object'
      }
    }
  },
  net: {
    incoming_timeout: 30000,
    outgoing_timeout: 20000
  }
};
