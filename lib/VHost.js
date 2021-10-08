const _ =          require ('lodash');
const Log =        require ('winston-log-space');
const intoStream = require ('into-stream');
const get =        require ('simple-get');
const async =      require ('async');
const Chance =     require ('chance');

var HttpProxy = require ('./HttpProxy');

const chance = new Chance();


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
  _init_metrics () {
    // prometheus metrics
    if (this._context && this._context.promster) {
      let the_metric = this._context.promster.register.getSingleMetric('http_upstream_up');

      if (the_metric) {
        this._upstreams_up = the_metric;
      }
      else {
        this._upstreams_up = new this._context.promster.Gauge({
          name: 'http_upstream_up',
          help: 'healthy state upstream http requests',
          labelNames: ['target', 'vhost']
        });
      }
    }

    this._log.verbose ('initialized');
  }


  //////////////////////////////////////////////////////////
  _set_active_check (target, route_name) {
    const check_path = _.get (target, 'check.path');
    const check_port = _.get (target, 'check.port');

    if (check_path) {
      const as_url = new URL (target.url);
      as_url.pathname = check_path;
      if (check_port) as_url.port = +check_port;
      target.check.url = as_url.href;
      target.check.ok = false;
      this._log.verbose ('setting check [%s] on %s (route %s)', target.check.url, target.url, route_name);
      this._target_checks.push (target);
    }
  }


  //////////////////////////////////////////////////////////
  _set_agent (route) {
    let proto = route.target[0].url.split (':')[0];

    switch (proto) {
      case 'http':
        this._log.verbose ('  using http agent %s', route.agent);
        route.agent = this._agents.get_http (route.agent);
        route.proto = proto;
        break;

      case 'https':
        this._log.verbose ('  using https agent %s', route.agent);
        route.agent = this._agents.get_https (route.agent);
        route.proto = proto;
        break;

      default:
        this._log.error ('unknown protocol [%s] on route %j', proto, route);
        return false;
    }

    return true;
  }


  //////////////////////////////////////////////////////////
  _set_lb (route, route_name) {
    switch (route.lb) {
      case 'seq':
        route.lb_method = VHost.s_lb_method_seq;
        break;

      case 'rand':
        route.lb_method = VHost.s_lb_method_rand;
        break;

      case undefined:
      case null:
        route.lb_method = VHost.s_lb_method_rand;
        break;

      default:
        this._log.warn ('unknown lb method [%s] on route %s. Using "seq"', route.lb, route_name);
        route.lb_method = VHost.s_lb_method_seq;
        break;
    }
  }


  //////////////////////////////////////////////////////////
  init (cb) {
    this._init_metrics ();

    // init agents--route mapping
    this._agents = this._context.agents;
    this._path_idx = [];
    this._paths = {};
    this._target_checks = [];

    _.each (_.get (this._config, 'http.routes', {}), (v, k) => {
      this._log.debug ('got route %s', k);
      this._path_idx.push (k);
      this._paths[k] = _.merge ({}, v, {regex: k.startsWith ('^') ? new RegExp (k) : new RegExp ('^' + k)});
      const route = this._paths[k];

      if (! _.isArray (route.target)) route.target = [route.target];

      // expand string targets
      route.target = route.target.map (t => ( _.isString (t) ? {url: t} : t ) );

      // sanitize and register active checks
      route.target.forEach (t => {
        this._set_active_check (t, k);
        if (! _.isInteger (t.w)) t.w = 1;
      });

      // resolve agent
      this._set_agent (route);

      // set lb method
      this._set_lb (route, k);
    });

    this._path_idx.sort((a, b) => b.length - a.length);

	  // run a round of upstream checks to start in a known status
    // and init proxy
    async.series ([
      cb => this._http_proxy.init (cb),
      cb => this._ensure_checks_done_and_armed (cb)
    ], err => {
      if (err) return cb (err);
      this._log.verbose ('initialized');
      cb ();
    });
  }


  //////////////////////////////////////////////////////////
  close () {
    // stop checks
    this._target_checks.forEach (t => {
      if (t.check.timer) {
        clearTimeout (t.check.timer);
        t.check.timer = undefined;
        this._log.verbose ('stopping check [%s] on %s', t.check.url, t.url);
      }
    });

    this._http_proxy.close ();
    this._log.verbose ('closed');
  }


  //////////////////////////////////////////////////////////
  status () {
    return this._http_proxy.status ();
  }


  //////////////////////////////////////////////////////////
  static s_lb_method_seq (upstreams) {
    return upstreams;
  }


  //////////////////////////////////////////////////////////
  static s_lb_method_rand (upstreams) {
    const ret = VHost._sort_by_weight (upstreams);
    return ret;
  }


  //////////////////////////////////////////////////////////
  static s_get_target (req, mtch) {

    // apply lb-strategy by sorting-shuffling arrays
    const upstream = mtch.lb_method (mtch.target);

    let target;
    const idx = req.originalUrl.indexOf('?');

    if (idx == -1) {
      // no orig qstring
      target = upstream.map (t => req.path.replace (mtch.regex, t.url));
    }
    else {
      // has orig qstring
      const qstr = req.originalUrl.substr (idx + 1);

      target = upstream.map (t =>
        req.path.replace (mtch.regex, t.url) + ((t.url.indexOf ('?') == -1) ? ('?' + qstr ) : ('&' + qstr))
      );
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

    const opts = {
      headers:  {'X-Request-Id': req.id},
      agent:    mtch.agent,
      secure:   mtch.secure,
      route:    mtch_id,
      upstream: upstream,
      target:   target
    };

    const body = req.text || req.body;

    if (body) {
      if (_.isString (body)) {
        opts.buffer = intoStream (body);
        this._log.debug ('found a pre-read string body, forward it');
      }
      else if (_.isObject (body) || _.isArray (body)) {
        delete req.headers['content-length'];
        opts.buffer = intoStream (JSON.stringify (body));
        this._log.debug ('found a pre-read object body, forward it');
      }
    }

    this._http_proxy.web (req, res, opts);
  }


  //////////////////////////////////////////////////////////////
  _enable_check_target (target) {
    if (target.check.timer) return;
    target.check.timer = setTimeout (() => this._check_target (target), 5000);
  }


  //////////////////////////////////////////////////////////////
  _ensure_checks_done_and_armed (cb) {
    const tasks = [];
    this._target_checks.forEach (t => tasks.push (cb => this._check_target (t, cb)));
    async.parallelLimit (tasks, 32, cb);
  }


  //////////////////////////////////////////////////////////////
  _check_target_ko (target, err, cb) {
    this._upstreams_up.set ({
      target: target.url,
      vhost:  this._id
    }, 0);

    if (target.check.ok) {
      this._log.info ('check upstream [%s] on %s failed (%s), disabling upstream', target.url, target.check.url, VHost.stringify_err(err));
      target.check.ok = false;
    }
    else {
      this._log.debug ('check upstream [%s] on %s still failing (%s)', target.url, target.check.url, VHost.stringify_err(err));
    }

    this._enable_check_target (target);
    if (cb) cb (null, err);
  }


  //////////////////////////////////////////////////////////////
  _check_target_ok (target, cb) {
    this._upstreams_up.set ({
      target: target.url,
      vhost:  this._id
    }, 1);

    if (!target.check.ok) {
      this._log.info ('check upstream [%s] on %s succeeded, enabling upstream', target.url, target.check.url);
      target.check.ok = true;
    }
    else {
      this._log.debug ('check upstream [%s] on %s still ok', target.url, target.check.url);
    }

    this._enable_check_target (target);
    if (cb) cb ();
  }


  //////////////////////////////////////////////////////////////
  _check_target (target, cb) {
    target.check.timer = undefined;

    this._log.debug ('checking upstream [%s] on %s...', target.url, target.check.url);

    const opts = {
      url: target.check.url,
      timeout: 1000
    };

    get.concat (opts, (err, res, data) => {
      if (err) return this._check_target_ko (target, err, cb);
      if (+(res.statusCode) != 200) return this._check_target_ko (target, {statusCode: res.statusCode, message: `got a HTTP ${res.statusCode} response`}, cb);
      this._check_target_ok (target, cb);
    });
  }


  //////////////////////////////////////////////////////////////
  static _sort_by_weight (a) {
    let grid = [];
    let total_w = 0;
    let grid_len = 0;

    a.forEach (i => {
      if (i.w > 0) {
        grid.push (i);
        total_w += i.w;
        grid_len++;
      }
    });

    const result = [];
    for (;;) {
      if (grid_len == 0) {
        return result;
      }

      const dice = chance.integer({ min: 1, max: total_w });

      for (let c = 0, i = 0; i < grid.length; i++) {
        if (grid[i] == null) continue;

        c += grid[i].w;

        if (c >= dice) {
          const elem = grid[i];
          grid[i] = null;
          grid_len--;
          total_w -= elem.w;
          result.push (elem);
          break;
        }
      }
    }
  }


  /////////////////////////////////////
  static stringify_err (err) {
    if (_.isString (err)) return err;
    if (err.message) return err.message;
    if (err.stack) return err.stack;

    try {
      return JSON.stringify (err);
    }
    catch (e) {
      return err;
    }
  }
}

module.exports = VHost;
