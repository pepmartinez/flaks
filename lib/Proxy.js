var _ =     require ('lodash');
var async = require ('async');
var Log =   require ('winston-log-space');

var VHost = require ('./VHost');


var log = Log.logger ('lib:proxy');


//////////////////////////////////////////////////////////
class Proxy {
  //////////////////////////////////////////////////////////
  constructor (config, context) {
    this._config = config;
    this._context = context;
    this._vhosts = {};

    _.each (config.vhosts, (v, k) => {
      let vhost = new VHost (k, v, context, config);
      this._vhosts[k] = vhost;
    });

    // register for lifecycle events
    context.lifecycle_list.push (this);
  }


  //////////////////////////////////////////////////////////
  init (cb) {
    let tasks = [];
    _.each (this._vhosts, v => tasks.push (cb => v.init (cb)));
    async.series (tasks, err => {
      if (err) return cb (err);
       log.info ('initialized');
      cb ();
    });
  }


  //////////////////////////////////////////////////////////
  close () {
    _.each (this._vhosts, v => v.close ());
    log.info ('closed');
  }


  //////////////////////////////////////////////////////////
  status (verbose) {
    if (verbose) return _.mapValues (this._vhosts, v => v.status ());
    return _.keys (this._vhosts);
  }


  //////////////////////////////////////////////////////////
  vhost (id) {
    return this._vhosts[id];
  }


  //////////////////////////////////////////////////////////
  serve (req, res) {
    let host = req.headers.host;
    log.debug ('host header is [%s]', host);

    if (!host) host = 'default';

    let vhost = this._vhosts[host];

    if (!vhost) {
      log.verbose ('no vhost [%s], falling back to default...', host);
      vhost = this._vhosts.default;
    }

    if (!vhost) {
      return res.status(404).send ('vhost not found');
    }

    log.verbose ('routing to vhost [%s]', host);
    vhost.serve (req, res);
  }
}

module.exports = Proxy;
