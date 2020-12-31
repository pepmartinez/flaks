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
  init (cb) {
    // init agents--route mapping
    this._agents = this._context.agents;

    this._path_idx = [];

    /*
    {
      <upstream>: {
        target: [{
          url: string,
          check: {
            path: string,
            url: string,
            ok: bool
          },
          *weight: int
        }],
        *lb: seq|rr|random
        agent: Agent,
        proto: http|https
        regex: regex
      }
    }
    */
    this._paths = {};
    this._target_checks = [];

    _.each (_.get (this._config, 'http.routes', {}), (v, k) => {
      this._log.debug ('got route %s', k);
      this._path_idx.push (k);
      this._paths[k] = _.merge ({}, v, {regex: k.startsWith ('^') ? new RegExp (k) : new RegExp ('^' + k)});

      if (! _.isArray (this._paths[k].target)) this._paths[k].target = [this._paths[k].target];

      // expand string targets
      this._paths[k].target = this._paths[k].target.map (t => ( _.isString (t) ? {url: t} : t ) );

      // register active checks
      this._paths[k].target.forEach (t => {
        const check_path = _.get (t, 'check.path');
        if (!check_path) return;

        const as_url = new URL (t.url);
        as_url.pathname = check_path;
        t.check.url = as_url.href;
        t.check.ok = false;
        this._log.verbose ('setting check [%s] on %s (route %s)', t.check.url, t.url, k);
        this._target_checks.push (t);
      })

      // resolve agent
      let proto = this._paths[k].target[0].url.split (':')[0];

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

	// TODO run a round of upstream checks to start in a known status
    // init proxy
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
  static s_get_target (req, mtch) {

    // TODO apply lb-strategy by sorting-shuffling arrays

    const upstream = mtch.target;
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
    err = err.message || err.toString ();

    if (target.check.ok) {
      this._log.info ('check upstream [%s] on %s failed (%s), disabling upstream', target.url, target.check.url, err);
      target.check.ok = false;
    }
    else {
      this._log.debug ('check upstream [%s] on %s still failing (%s)', target.url, target.check.url, err);
    }

    this._enable_check_target (target);
    if (cb) cb (null, err);
  }


  //////////////////////////////////////////////////////////////
  _check_target_ok (target, cb) {
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
      if (+(res.statusCode) != 200) return this._check_target_ko (target, {statusCode: res.statusCode, body: data}, cb);
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

}

module.exports = VHost;
