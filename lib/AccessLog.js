
var Log =    require ('winston-log-space');
var morgan = require ('morgan');

const morgan_format = ':remote-addr [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] (:upstream-vhost :upstream-route :upstream-uri :upstream-statusCode :upstream-rtt ms) :response-time ms'

module.exports = (opts) => {
  var access_log = Log.logger ('access');

  morgan.token('upstream-route',      (req, res) => req._upstream_route);
  morgan.token('upstream-uri',        (req, res) => req._upstream_uri);
  morgan.token('upstream-uri_grp',    (req, res) => req._upstream_uri_grp);
  morgan.token('upstream-method',     (req, res) => req._upstream_method);
  morgan.token('upstream-statusCode', (req, res) => req._upstream_statusCode);
  morgan.token('upstream-vhost',      (req, res) => req._upstream_vhost);
  morgan.token('upstream-rtt',        (req, res) => req._upstream_rtt);

  return morgan (morgan_format, {
    stream: {
      write: message => access_log.info (message.trim ())
    }
  });
}
