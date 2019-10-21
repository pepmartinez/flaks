var http_proxy =  require ('http-proxy');
var util =        require ('util');
var _ =           require ('lodash');
var Log =         require ('winston-log-space');

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
    this._wirelog = opts.wirelog;

    this._proxy = http_proxy.createProxyServer (opts);

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
    this._proxy.on ('proxyRes', (proxyRes, req, res) =>          this._on_proxyRes (proxyRes, req, res));
    this._proxy.on ('error',    (err, req, res) =>               this._on_error (err, req, res));
  }


  //////////////////////////////////////////////////////////
  _on_proxyRes (proxyRes, req, res) {
    log.verbose ('proxyRes [%s] %s %d', proxyRes.req.id || '-', proxyRes.req.path, proxyRes.statusCode);

    var rtt = process.hrtime (proxyRes.req._t0);
    req._upstream_rtt = (rtt[0] * 1000) + (rtt[1]/1000000);
  }


  //////////////////////////////////////////////////////////
  _on_proxyReq (proxyReq, req, res, options) {
    proxyReq.id = req.id;

    log.verbose('proxyReq [%s] %s -> %s',
      proxyReq.id || '-',
      `${req.method} ${req.hostname} ${req.path}`,
      options.target.href);

    if (this._wirelog === true) {
      this._instrument_upstream_wire (proxyReq);
    }

    proxyReq.on ('response', rsp => {
      log.verbose ('proxyReq [%s] got a resp', proxyReq.id || '-');
    });

    proxyReq.on ('finish', () => {
      log.verbose ('proxyReq [%s] finished sent', proxyReq.id || '-');
    });

    proxyReq.on ('error', (err) => {
      log.verbose ('proxyReq [%s] error: %s', proxyReq.id || '-', err);
    });

    proxyReq._t0 = process.hrtime();
  }


  //////////////////////////////////////////////////////////
  _on_error (err, req, res) {
    if (!(res.headersSent)) {
      log.error('proxy error: %j (headers sent: %s) Sending upstream response', err, res.headersSent);

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
      log.error ('proxy error: %j (headers sent: %s) Do nothing', err, res.headersSent);
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
  _server_req_as_human (req) {
    return `${req.method} ${req.hostname} ${req.path}`
  }

  //////////////////////////////////////////////////////////
  _instrument_upstream_wire (proxyReq) {
    proxyReq._instrument_wire_headers_dumped = false;

    if (!proxyReq._instrument_wire_write) {
      proxyReq._instrument_wire_write = proxyReq.write;

      // hijack write()
      proxyReq.write = function (data, encoding, callback) {
        if (!this._instrument_wire_headers_dumped) {
          _do_wirelog_headers(this);
          this._instrument_wire_headers_dumped = true;
        }

        if (Buffer.isBuffer(data)) {
          data.toString().split ('\n').forEach (l => wirelog.info ('%s > %s', proxyReq.id, l));
        }
        else {
          data.split ('\n').forEach (l => wirelog.info ('%s > %s', proxyReq.id, l));
        }

        return this._instrument_wire_write (data, encoding, callback);
      };
    }

    // hijack end()
    if (!proxyReq._instrument_wire_end) {
      proxyReq._instrument_wire_end = proxyReq.end;
      proxyReq.end = function (data, encoding, callback) {
        if (!this._instrument_wire_headers_dumped) {
          _do_wirelog_headers (this);
          this._instrument_wire_headers_dumped = true;
        }

        return this._instrument_wire_end (data, encoding, callback);
      };
    }

    proxyReq.on ('response', function (rsp) {
      wirelog.info ('%s < HTTP/%s %s %s', proxyReq.id, rsp.httpVersion, rsp.statusCode, rsp.statusMessage);

      for (var hdr in rsp.headers) {
        wirelog.info ('%s < %s: %s', proxyReq.id, hdr, rsp.headers[hdr]);
      }

      wirelog.info ('%s <', proxyReq.id);

      rsp.on ('data', function (chunk) {
        if (Buffer.isBuffer(chunk)) {
          chunk.toString ().split ('\n').forEach (l => wirelog.info ('%s < %s', proxyReq.id, l));
        }
        else {
          chunk.split ('\n').forEach (l => wirelog.info ('%s < %s', proxyReq.id, l));
        }
      });
    });
  }
}

module.exports = HttpProxy;
