var _ =   require ('lodash');
var Log = require ('winston-log-space');

var HttpProxy = require ('./HttpProxy');



//////////////////////////////////////////////////////////
class VHost {
  //////////////////////////////////////////////////////////
  constructor (id, config, context) {
    this._id = id;
    this._config = config;
    this._context = context;

    this._log = Log.logger (`lib:vhost:${id}`);

    this._http_proxy = new HttpProxy ({
      xfwd:         true,
      ignorePath:   true,
      changeOrigin: true,
      timeout:      _.get (config, 'net.incoming_timeout', 75000),
      proxyTimeout: _.get (config, 'net.outgoing_timeout', 50000),
      wirelog:      _.get (config, 'http.wirelog',         false),
      introspect:   _.get (config, 'http.introspect',      false),
    }, {
      vhost: this._id
    },
    context);

    this._log.verbose ('created');
  }


  //////////////////////////////////////////////////////////
  init (cb) {
    // init agents--route mapping
    this._agents = this._context.agents;

    this._path_idx = [];
    this._paths = {};

    _.each (_.get (this._config, 'http.routes', {}), (v, k) => {
      this._log.debug ('got route %s', k);
      this._path_idx.push (k);
      this._paths[k] = _.merge ({}, v, {regex: k.startsWith ('^') ? new RegExp (k) : new RegExp ('^' + k)});

      // resolve agent
      let proto = v.target.split (':')[0];

      switch (proto) {
        case 'http':
          this._log.verbose ('  using http agent %s', v.agent);
          this._paths[k].agent = this._agents.get_http (v.agent);
          this._paths[k].proto = proto;
          break;

        case 'https':
          this._log.verbose ('  using https agent %s', v.agent);
          this._paths[k].agent = this._agents.get_https (v.agent);
          this._paths[k].proto = proto;
          break;

        default:
          return cb ('unknown protocol [%s] on route %j', proto, v);
      }
    });

    this._path_idx.sort((a, b) => b.length - a.length);

    // init proxy
    this._http_proxy.init (err => {
      if (err) return cb (err);
      this._log.verbose ('initialized');
      cb ();
    });
  }


  //////////////////////////////////////////////////////////
  close () {
    this._http_proxy.close ();
    this._log.verbose ('closed');
  }


  //////////////////////////////////////////////////////////
  status () {
    return this._http_proxy.status ();
  }


  //////////////////////////////////////////////////////////
  serve (req, res) {
    let mtch = null;
    let mtch_id = null;

    for (let i = 0; ((!mtch) && (i < this._path_idx.length)); i++) {
      let _match = this._paths[this._path_idx[i]];
      if (_match.regex.test (req.path)) {
        mtch = _match;
        mtch_id = this._path_idx[i];

        this._log.debug ('check %s against %s, match is %j', req.path, _match.regex, _match.target);
      }
      else {
        this._log.debug ('check %s against %s, miss', req.path, _match.regex);
      }
    }

    if (!mtch) {
      return res.status(404).send ('not found');
    }
    else {
      const idx = req.originalUrl.indexOf('?');
      const qstr = (idx == -1) ? '' : req.originalUrl.substr (idx);

      this._http_proxy.web (req, res, {
        headers:  {'X-Request-Id': req.id},
        agent:    mtch.agent,
        secure:   mtch.secure,
        route:    mtch_id,
        upstream: mtch.target,
        target:   req.path.replace (mtch.regex, mtch.target) + qstr
      });
    }
  }
}

module.exports = VHost;