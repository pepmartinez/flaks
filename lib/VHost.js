var _ =   require ('lodash');
const { log } = require('winston');
var Log = require ('winston-log-space');

var HttpProxy = require ('./HttpProxy');



//////////////////////////////////////////////////////////
class VHost {
  //////////////////////////////////////////////////////////
  constructor (id, config, context, full_config) {
    this._id = id;
    this._config = config;
    this._full_config = full_config;
    this._context = context;

    this._log = Log.logger (`lib:vhost:${id}`);

    this._http_proxy = new HttpProxy ({
      xfwd:           true,
      ignorePath:     true,
      changeOrigin:   true,
      timeout:        _.get (config, 'net.incoming_timeout', _.get (full_config, 'net.incoming_timeout', 75000)),
      proxyTimeout:   _.get (config, 'net.outgoing_timeout', _.get (full_config, 'net.outgoing_timeout', 50000)),
      connectTimeout: _.get (config, 'net.connect_timeout',  _.get (full_config, 'net.connect_timeout',  5000)),
      wirelog:        _.get (config, 'http.wirelog',         _.get (full_config, 'http.wirelog',         false)),
      introspect:     _.get (config, 'http.introspect',      _.get (full_config, 'http.introspect',      false)),
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

      if (! _.isArray (this._paths[k].target)) this._paths[k].target = [this._paths[k].target];

      // resolve agent
      let proto = (_.isString (v.target) ? v.target : v.target[0]).split (':')[0];

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
  static s_get_target (req, mtch) {

    // TODO apply lb-strategy by sorting-shuffling arrays

    const upstream = mtch.target;
    let target = upstream.map (t => req.path.replace (mtch.regex, t));
    const idx = req.originalUrl.indexOf('?');
    if (idx == -1) {
      // no orig qstring, noop
    }
    else {
      // has orig qstring
      const qstr = req.originalUrl.substr (idx + 1);
      target = target.map (t => (t.indexOf ('?') == -1) ? (t + '?' + qstr ) : (t + '&' + qstr));
    }

    return {target, upstream};
  }


  //////////////////////////////////////////////////////////
  serve (req, res) {
    let mtch = null;
    let mtch_id = null;

    // linear search (pre-ordered) of longest match
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

    if (!mtch) return res.status(404).send ('not found');

    // actual proxying
    const {target, upstream} = VHost.s_get_target (req, mtch);

    this._http_proxy.web (req, res, {
      headers:  {'X-Request-Id': req.id},
      agent:    mtch.agent,
      secure:   mtch.secure,
      route:    mtch_id,
      upstream: upstream,
      target:   target
    });
  }
}

module.exports = VHost;
