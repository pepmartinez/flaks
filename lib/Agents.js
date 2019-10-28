const _ =     require ('lodash');
const http =  require ('http');
const https = require ('https');
var Log =     require ('winston-log-space');

var log = Log.logger ('lib:http-agents');

class Agents {
  constructor (opts) {
    this._opts = opts;
    this._agents_http = {};
    this._agents_https = {};

    _.each (_.get (opts, 'agents.http', {}), (v, k) => {
      this._agents_http[k] = new http.Agent (v);
      log.verbose ('created http agent [%s]', k);
    });

    _.each (_.get (opts, 'agents.https', {}), (v, k) => {
      this._agents_https[k] = new https.Agent (v);
      log.verbose ('created https agent [%s]', k);
    });
  }

  get_http (id) {
    if (!id) return this._agents_http.default;
    let a =  this._agents_http[id];
    if (!a) a = this._agents_http.default;
    return a;
  }

  get_https (id) {
    if (!id) return this._agents_https.default;
    let a =  this._agents_https[id];
    if (!a) a = this._agents_https.default;
    return a;
  }

  status () {
    return {
      http: this._agents_http,
      https: this._agents_https
    };
  }


  destroy () {
    _.each (this._agents_http, (v, k) => {
      v.destroy ();
      log.verbose ('destroyed http agent [%s]', k);
    });

    _.each (this._agents_https, (v, k) => {
      v.destroy ();
      log.verbose ('destroyed https agent [%s]', k);
    });
  }
}


module.exports = Agents;
