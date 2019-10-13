
module.exports = {
  listen_port: 8080,
  http: {
    trust_proxy: ['192.168.1.0/24'],
    wiredump: true,
    agents: {
    },
    routes: {
      '/a/b/c': {
        target: 'http://xxx',
        agent: 'string|object'
      }
    }
  },
};
