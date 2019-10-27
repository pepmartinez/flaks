
module.exports = {
  listen_port: 8080,
  agents : {
  },
  http: {
    wirelog: false,
    introspect: false,
    routes: {
    }
  },
  net: {
    incoming_timeout: 30000,
    outgoing_timeout: 20000
  }
};
