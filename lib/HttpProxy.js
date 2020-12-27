var http_proxy = require ('@pepmartinez/http-proxy');
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
  constructor (opts, env, context) {
    this._opts = opts;
    this._env = env;
    this._context = context;
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
        EPROTO: {
          code: 503,
          ct: 'text/plain',
          body: err => 'upstream protocol error:\n' + util.inspect(err)
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

    log.verbose ('created for vhost [%s], with opts %j', env.vhost, opts);
  }


  //////////////////////////////////////////////////////////
  init (cb) {
    // prometheus metrics
    if (this._context && this._context.promster) {
      let the_metric = this._context.promster.register.getSingleMetric('http_upstream_request_duration');

      if (the_metric) {
        this._reqs_histogram = the_metric;
      }
      else {
        this._reqs_histogram = new this._context.promster.Histogram({
          name: 'http_upstream_request_duration',
          help: 'histogram on duration for upstream http requests',
          buckets: [ 50, 100, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 10000 ],
          labelNames: ['method', 'statusCode', 'uri', 'route', 'vhost']
        });
      }
    }

    log.verbose ('initialized');
    cb ();
  }


  //////////////////////////////////////////////////////////
  _is_option_activated (id, opts, req) {
    if (_.isBoolean (opts[id]))  return opts[id];
    if (_.isFunction (opts[id])) return opts[id](opts, req);
    return false;
  }


  //////////////////////////////////////////////////////////
  _to_introspect_store (obj) {
    let k0 = obj.upstream;
    let k1 = (obj.res || {}).st_code || (obj.err || {}).code || 'unknown';
    if (!this._introspect_store[k0]) this._introspect_store[k0] = {};
    if (!this._introspect_store[k0][k1]) this._introspect_store[k0][k1] = new CBuffer (16);
    this._introspect_store[k0][k1].push (obj);
  }


  //////////////////////////////////////////////////////////
  _on_proxyReq (proxyReq, req, res, options) {
    proxyReq.id = req.id;
    req._upstream_route = options.route;

    log.verbose('proxyReq [%s] %s %s %s -> %s', proxyReq.id, req.method, req.hostname, req.path, options.target.href);

    // cache opts activation
    if (this._is_option_activated ('wirelog', options, req))    options._is_wirelog_activated = true;
    if (this._is_option_activated ('introspect', options, req)) options._is_introspect_activated = true;

    if (options._is_wirelog_activated || options._is_introspect_activated) {
      this._instrument_upstream_wire (req, proxyReq, options);
    }

    // initialize introspect
    if (options._is_introspect_activated) {
      req._introspect = {
        id: req.id,
        route: options.route,
        upstream: options.upstream,
        req: {
          t: new Date(),
          method: proxyReq.method,
          url: options.target.href,
          headers: {},
          body: ''
        }
      };

      _.each (proxyReq._headers, (v, k) => req._introspect.req.headers[k] = v);
    }

    proxyReq.on ('response', rsp => {
      log.verbose ('proxyRes [%s] %s %d', rsp.req.id, rsp.req.path, rsp.statusCode);

      if (options._is_wirelog_activated || options._is_introspect_activated) {
        if (options._is_wirelog_activated) {
          wirelog.info ('%s < HTTP/%s %s %s', proxyReq.id, rsp.httpVersion, rsp.statusCode, rsp.statusMessage);
          _.each (rsp.headers, (v, k) => wirelog.info ('%s < %s: %s', proxyReq.id, k, v));
          wirelog.info ('%s <', proxyReq.id);
        }

        rsp.on ('data', chunk => {
          if (options._is_wirelog_activated) {
             chunk.toString ().split ('\n').forEach (l => wirelog.info ('%s < %s', proxyReq.id, l));
          }

          if (options._is_introspect_activated) {
            req._introspect.res.body += chunk.toString ();
          }
        });
      }

      if (options._is_introspect_activated) {
        req._introspect.res = {
          t: new Date(),
          ver: rsp.httpVersion,
          st_code: rsp.statusCode,
          st_msg: rsp.statusMessage,
          headers: rsp.headers,
          body: ''
        };
      }

      rsp.on ('end', () => {
        log.verbose ('proxyRes [%s] end', proxyReq.id);
        var rtt = process.hrtime (rsp.req._t0);
        req._upstream_rtt = (rtt[0] * 1000) + (rtt[1]/1000000);

        this._upstream_tick (req, proxyReq, rsp, null, options);

        if (options._is_introspect_activated) {
          this._to_introspect_store (req._introspect);
        }
      });

      rsp.on ('error', err => {
        log.verbose ('proxyRes [%s] err %j', proxyReq.id, err);
        var rtt = process.hrtime (rsp.req._t0);
        req._upstream_rtt = (rtt[0] * 1000) + (rtt[1]/1000000);

        this._upstream_tick (req, proxyReq, rsp, null, options);

        if (options._is_introspect_activated) {
          req._introspect.err = err;
          this._to_introspect_store (req._introspect);
        }
      });
    });

    proxyReq.on ('finish', () => {
      log.verbose ('proxyReq [%s] finished sent', proxyReq.id);
    });

    // set a connection timeout
    var t = setTimeout(() => {
      log.info ('proxyReq [%s] connect to upstream [%s] timed out (%d msecs)', proxyReq.id, options.target.href, options.connectTimeout);
      proxyReq.socket.destroy();
    }, options.connectTimeout);

    proxyReq.socket.once ('connect', () => clearTimeout(t));
    proxyReq.socket.once ('close', () => clearTimeout(t));

    proxyReq.on ('error', err => {
      var rtt = process.hrtime (proxyReq._t0);
      req._upstream_rtt = (rtt[0] * 1000) + (rtt[1]/1000000);

      this._upstream_tick (req, proxyReq, null, err, options);

      if (options._is_introspect_activated) {
        req._introspect.err = err;
        this._to_introspect_store (req._introspect);
      }

      if (!(res.headersSent)) {
        log.error('proxy upstream error: [%s] %j (headers NOT sent)', req.id, err);

        if (req._upstream_targets.length) {
          // try next target
          this._try_web (req, res);
        }
        else {
          // no more targets, relay last error
          log.error('[%s] No more targets. Sending upstream response', req.id);

          // TODO add info depending on proxyReq._headerSent

          const resp_data = this._err_responses.responses[err.code] || this._err_responses.responses.ERR;
          const code = resp_data.code;
          const ct = resp_data.ct;
          let body = '';

          if (_.isString (resp_data.body)) {
            body = resp_data.body;
          }
          else if (_.isFunction (resp_data.body)) {
            body = resp_data.body (err);
          }

          res.writeHead (code, {'Content-Type': ct });
          res.end (body);
        }
      }
      else {
        log.error ('proxy upstream error: [%s] %j (headers sent) Do nothing', req.id, err, res.headersSent);
      }
    });

    proxyReq._t0 = process.hrtime();
  }


  //////////////////////////////////////////////////////////
  _on_error (err, req, res) {
      return log.error('proxy error: [%s] %j', req.id, err);
  }


  //////////////////////////////////////////////////////////
  web (req, res, opts) {
    // add opts.targets as array of targets from opts.target
    req._upstream_targets = opts.target;
    req._upstream = _.clone (opts.upstream);
    req._upstream_opts = opts;

    log.verbose ('[%s] targets is %o', req.id, req._upstream_targets);

    this._try_web (req, res);
  }


  //////////////////////////////////////////////////////////
  _try_web (req, res) {
    // call this._proxy.web with first target
    req._upstream_opts.target = req._upstream_targets.shift ();
    req._upstream_opts.upstream = req._upstream.shift ();
    log.verbose ('[%s] try target %s (upstream %s)', req.id, req._upstream_opts.target, req._upstream_opts.upstream);

    this._proxy.web (req, res, req._upstream_opts);
  }


  //////////////////////////////////////////////////////////
  close () {
    this._proxy.close ();
  }


  //////////////////////////////////////////////////////////
  status () {
    return _.mapValues (this._introspect_store, (v0 => _.mapValues(v0, v1 => v1.toArray())));
  }


  //////////////////////////////////////////////////////////
  _server_req_as_human (req) {
    return `${req.method} ${req.hostname} ${req.path}`;
  }


  //////////////////////////////////////////////////////////
  _instrument_upstream_wire (req, proxyReq, options) {
    if (options._is_wirelog_activated) {
      proxyReq._instrument_wire_headers_dumped = false;
    }

    if (!proxyReq._instrument_wire_write) {
      proxyReq._instrument_wire_write = proxyReq.write;

      // hijack write()
      proxyReq.write = function (data, encoding, callback) {
        if (options._is_wirelog_activated) {
          if (!this._instrument_wire_headers_dumped) {
            _do_wirelog_headers(this);
            this._instrument_wire_headers_dumped = true;
          }
        }

        if (options._is_wirelog_activated) {
          data.toString(encoding).split ('\n').forEach (l => wirelog.info ('%s > %s', proxyReq.id, l));
        }

        if (options._is_introspect_activated) {
          req._introspect.req.body += data.toString (encoding);
        }

        return this._instrument_wire_write (data, encoding, callback);
      };
    }

    // hijack end()
    if (!proxyReq._instrument_wire_end) {
      proxyReq._instrument_wire_end = proxyReq.end;
      proxyReq.end = function (data, encoding, callback) {
        if (options._is_wirelog_activated) {
          if (!this._instrument_wire_headers_dumped) {
            _do_wirelog_headers (this);
            this._instrument_wire_headers_dumped = true;
          }
        }

        return this._instrument_wire_end (data, encoding, callback);
      };
    }
  }


  //////////////////////////////////////////////////////////
  _upstream_tick (req, proxyReq, rsp, err, options) {
    if (this._reqs_histogram) {
      let labels = {
        route: options.route,
        uri: options.upstream,
        method: proxyReq.method,
        statusCode: (rsp && rsp.statusCode) || (err && err.code),
        vhost: this._env.vhost
      };

  //    log.debug ('tick %j %d', labels, req._upstream_rtt);
      this._reqs_histogram.observe(labels, req._upstream_rtt);
    }

    // pass upstream info to req, for mw use
    req._upstream_route = options.route;
    req._upstream_uri_grp = options.upstream;
    req._upstream_uri = options.target.href;
    req._upstream_method = proxyReq.method;
    req._upstream_statusCode = (rsp && rsp.statusCode) || (err && err.code);
    req._upstream_vhost = this._env.vhost;
  }
}

module.exports = HttpProxy;
