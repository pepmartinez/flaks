var http_proxy =  require ('http-proxy');
var util =        require ('util');
var _ =           require ('lodash');
var Log =         require ('winston-log-space');

var log = Log.logger ('http-proxy');


//////////////////////////////////////////////////////////
class HttpProxy {
  //////////////////////////////////////////////////////////
  constructor (opts) {
    this._opts = opts;
    this._proxy = http_proxy.createProxyServer (opts);

    this._err_responses = {
      responses: {
        ECONNRESET: {
          code: 504,
          ct: 'text/plain',
          body: 'proxy timeout'
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
//    proxy._tick (proxyRes.req._url, {code: proxyRes.statusCode, rtt: (rtt[0] * 1000) + (rtt[1]/1000000)});
  }


  //////////////////////////////////////////////////////////
  _on_proxyReq (proxyReq, req, res, options) {
    proxyReq.id = req.id;

    log.verbose('proxyReq [%s] %s -> %s',
      proxyReq.id || '-',
      `${req.method} ${req.hostname} ${req.path}`,
      options.target.href);

    proxyReq.on ('response', rsp => {
      log.verbose ('proxyReq [%s] got a resp', proxyReq.id || '-');
    });

    proxyReq.on ('finish', () => {
      log.verbose ('proxyReq [%s] finished sent', proxyReq.id || '-');
    });

    proxyReq.on ('error', (err) => {
      log.verbose ('proxyReq [%s] error: %s', proxyReq.id || '-', err);
//      proxy._tick (proxyReq._url, {ns:'conn', code: err.code});
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

}

module.exports = HttpProxy;
