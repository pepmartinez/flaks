
module.exports = {
  listen_port: 8080,
  agents : {
  },
  vhosts: {
  },
  net: {
//    incoming_timeout: 31000,
//    outgoing_timeout: 21000
  },
  http: {
    wirelog: (opts, req) => (req.headers.aaaa == '1'),
    introspect: true,
  }
};
