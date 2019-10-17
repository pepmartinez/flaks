
module.exports = {
  listen_port: 8080,
  agents : {
  },
  http: {
    trust_proxy: ['192.168.1.0/24'],
    wiredump: true,
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
      }
    }
  },
  net: {
    incoming_timeout: 30000,
    outgoing_timeout: 20000
  }
};
