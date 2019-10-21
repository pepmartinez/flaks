var _ =   require ('lodash');
var Log = require ('winston-log-space');

var HttpProxy = require ('./HttpProxy');


var log = Log.logger ('lib:proxy');


//////////////////////////////////////////////////////////
class Proxy {
  //////////////////////////////////////////////////////////
  constructor (config, context) {
    this._config = config;

    this._http_proxy = new HttpProxy ({
      xfwd:         true,
      ignorePath:   true,
      changeOrigin: true,
      timeout:      _.get (config, 'net.incoming_timeout', 75000),
      proxyTimeout: _.get (config, 'net.outgoing_timeout', 50000),
      wirelog:      _.get (config, 'http.wirelog',         true),
    });

    this._agents = context.agents;

    this._path_idx = [];
    this._paths = {};

    _.each (_.get (this._config, 'http.routes', {}), (v, k) => {
      log.debug ('got route %s', k);
      this._path_idx.push (k);
      this._paths[k] = _.merge ({}, v, {regex: k.startsWith ('^') ? new RegExp (k) : new RegExp ('^' + k)});

      // resolve agent
      log.verbose ('  using agent %s', v.agent);
      this._paths[k].agent = this._agents.get_http (v.agent);
    });

    this._path_idx.sort((a, b) => b.length - a.length);
  }


  //////////////////////////////////////////////////////////
  close () {
    this._http_proxy.close ();
  }


  //////////////////////////////////////////////////////////
  serve (req, res) {
    let mtch = null;

    for (let i = 0; ((!mtch) && (i < this._path_idx.length)); i++) {
      let _match = this._paths[this._path_idx[i]];
      if (_match.regex.test (req.path)) mtch = _match;
      log.debug ('check %s against %s, match is %j', req.path, _match.regex, mtch);
    }

    if (!mtch) {
      return res.status(404).send ('not found');
    }
    else {
      const idx = req.originalUrl.indexOf('?');
      const qstr = (idx == -1) ? '' : req.originalUrl.substr (idx);

      this._http_proxy.web (req, res, {
        headers: {'X-Request-Id': req.id},
        agent:   mtch.agent,
        target:  req.path.replace (mtch.regex, mtch.target) + qstr
      });
    }
  }
}

module.exports = Proxy;
