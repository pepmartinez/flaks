var http_proxy = require ('http-proxy');
var util =       require ('util');
var _ =          require ('lodash');
var Log =        require ('winston-log-space');
var CBuffer =    require ('CBuffer');

var log =     Log.logger ('lib:http-proxy');
var wirelog = Log.logger ('wire:upstream');

function _do_wirelog_headers (req) {
  let id = req.id || '-';
  wirelog.info('%s > %s %s HTTP/1.1', id, req.method, req.path);
  _.each (req._headers, (v, k) => wirelog.info('%s > %s: %s', id, k, v));
  wirelog.info('%s >', id);
}


//////////////////////////////////////////////////////////
class HttpProxy {
  //////////////////////////////////////////////////////////
  constructor (opts) {
    this._opts = opts;
    this._proxy = http_proxy.createProxyServer (opts);
    this._introspect_store = {};

    this._err_responses = {
      responses: {
        ECONNRESET: {
          code: 504,
          ct: 'text/plain',
          body: err => 'proxy timeout:\n' + util.inspect(err)
        },
        ECONNREFUSED: {
          code: 503,
          ct: 'text/plain',
          body: err => 'upstream connection refused:\n' + util.inspect(err)
        },
        ENOTFOUND: {
          code: 502,
          ct: 'text/plain',
          body: err => 'upstream name resolution error:\n' + util.inspect(err)
        },
        ERR: {
          code: 500,
          ct: 'text/plain',
          body: err => 'proxy error:\n' + util.inspect(err)
        }
      }
    };

    this._proxy.on ('proxyReq', (proxyReq, req, res, options) => this._on_proxyReq (proxyReq, req, res, options));
    this._proxy.on ('error',    (err, req, res) =>               this._on_error (err, req, res));
  }


  //////////////////////////////////////////////////////////
  _to_introspect_store (obj) {
    let k0 = obj.upstream;
    let k1 = (obj.res || {}).st_code || (obj.err || {}).code || 'unknown';
    if (!this._introspect_store[k0]) this._introspect_store[k0] = {};
    if (!this._introspect_store[k0][k1]) this._introspect_store[k0][k1] = new CBuffer (64);
    this._introspect_store[k0][k1].push (obj);
  }

  //////////////////////////////////////////////////////////
  _on_proxyReq (proxyReq, req, res, options) {
    proxyReq.id = req.id;
    req._upstream_route = options.route;

    log.verbose('proxyReq [%s] %s -> %s', proxyReq.id || '-', `${req.method} ${req.hostname} ${req.path}`, options.target.href);

    if ((options.wirelog === true) || (options.introspect)) {
      this._instrument_upstream_wire (proxyReq, options);
    }

    // initialize introspect
    if (options.introspect) {
      req._introspect = {
        id: req.id,
        route: options.route,
        upstream: options.upstream,
        req: {
          t: new Date(),
          method: proxyReq.method,
          url: options.target.href,
          headers: {}
        }
      };

      _.each (proxyReq._headers, (v, k) => req._introspect.req[k] = v);
    }

    proxyReq.on ('response', rsp => {
      log.verbose ('proxyRes [%s] %s %d', rsp.req.id || '-', rsp.req.path, rsp.statusCode);

      if (options.wirelog === true) {
        wirelog.info ('%s < HTTP/%s %s %s', proxyReq.id, rsp.httpVersion, rsp.statusCode, rsp.statusMessage);
        _.each (rsp.headers, (v, k) => wirelog.info ('%s < %s: %s', proxyReq.id, k, v));
        wirelog.info ('%s <', proxyReq.id);

        rsp.on ('data', chunk => {
          if (Buffer.isBuffer(chunk)) {
            chunk.toString ().split ('\n').forEach (l => wirelog.info ('%s < %s', proxyReq.id, l));
          }
          else {
            chunk.split ('\n').forEach (l => wirelog.info ('%s < %s', proxyReq.id, l));
          }
        });
      }

      if (options.introspect) {
        req._introspect.res = {
          t: new Date(),
          ver: rsp.httpVersion,
          st_code: rsp.statusCode,
          st_msg: rsp.statusMessage,
          headers: rsp.headers
        };
      }

      rsp.on ('end', () => {
        log.verbose ('proxyRes [%s] end', proxyReq.id || '-');
        var rtt = process.hrtime (rsp.req._t0);
        req._upstream_rtt = (rtt[0] * 1000) + (rtt[1]/1000000);

        if (options.introspect) {
          this._to_introspect_store (req._introspect);
        }
      });

      rsp.on ('error', err => {
        log.verbose ('proxyRes [%s] err %j', proxyReq.id || '-', err);
        var rtt = process.hrtime (rsp.req._t0);
        req._upstream_rtt = (rtt[0] * 1000) + (rtt[1]/1000000);

        if (options.introspect) {
          req._introspect.err = err;
          this._to_introspect_store (req._introspect);
        }
      });
    });

    proxyReq.on ('finish', () => {
      log.verbose ('proxyReq [%s] finished sent', proxyReq.id || '-');
    });

    proxyReq.on ('error', (err) => {
      log.verbose ('proxyReq [%s] error: %s', proxyReq.id || '-', err);

      if (options.introspect) {
        req._introspect.err = err;
        this._to_introspect_store (req._introspect);
      }
    });

    proxyReq._t0 = process.hrtime();
  }


  //////////////////////////////////////////////////////////
  _on_error (err, req, res) {
    if (!(res.headersSent)) {
      log.error('proxy error: [%s] %j (headers sent: %s) Sending upstream response', req.id || '-', err, res.headersSent);

      var resp_data = this._err_responses.responses[err.code] || this._err_responses.responses.ERR;
      var code = resp_data.code;
      var ct = resp_data.ct;
      var body = '';

      if (_.isString (resp_data.body)) {
        body = resp_data.body;
      }
      else if (_.isFunction (resp_data.body)) {
        body = resp_data.body (err);
      }

      res.writeHead (code, {'Content-Type': ct });
      res.end (body);
    }
    else {
      log.error ('proxy error: [%s] %j (headers sent: %s) Do nothing', req.id || '-', err, res.headersSent);
    }
  }


  //////////////////////////////////////////////////////////
  web (req, res, opts) {
    this._proxy.web (req, res, opts);
  }


  //////////////////////////////////////////////////////////
  close () {
    this._proxy.close ();
  }


  //////////////////////////////////////////////////////////
  status () {
    return _.mapValues (this._introspect_store, (v0 => _.mapValues(v0, v1 => v1.toArray())))
  }


  //////////////////////////////////////////////////////////
  _server_req_as_human (req) {
    return `${req.method} ${req.hostname} ${req.path}`
  }


  //////////////////////////////////////////////////////////
  _instrument_upstream_wire (proxyReq, options) {
    if (options.wirelog) {
      proxyReq._instrument_wire_headers_dumped = false;
    }

    if (!proxyReq._instrument_wire_write) {
      proxyReq._instrument_wire_write = proxyReq.write;

      // hijack write()
      proxyReq.write = function (data, encoding, callback) {
        if (options.wirelog) {
          if (!this._instrument_wire_headers_dumped) {
            _do_wirelog_headers(this);
            this._instrument_wire_headers_dumped = true;
          }
        }

        if (Buffer.isBuffer(data)) {
          if (options.wirelog) {
            data.toString().split ('\n').forEach (l => wirelog.info ('%s > %s', proxyReq.id, l));
          }
        }
        else {
          if (options.wirelog) {
            data.split ('\n').forEach (l => wirelog.info ('%s > %s', proxyReq.id, l));
          }
        }

        return this._instrument_wire_write (data, encoding, callback);
      };
    }

    // hijack end()
    if (!proxyReq._instrument_wire_end) {
      proxyReq._instrument_wire_end = proxyReq.end;
      proxyReq.end = function (data, encoding, callback) {
        if (options.wirelog) {
          if (!this._instrument_wire_headers_dumped) {
            _do_wirelog_headers (this);
            this._instrument_wire_headers_dumped = true;
          }
        }

        return this._instrument_wire_end (data, encoding, callback);
      };
    }
  }
}

module.exports = HttpProxy;
