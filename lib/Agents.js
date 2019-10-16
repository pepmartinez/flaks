const _ =          require ('lodash');
const Agent =      require ('agentkeepalive');
const AgentHTTPS = require ('agentkeepalive').HttpsAgent;

class Agents {
  constructor (opts) {
    this._opts = opts;
    this._agents = {};
  }

  get (id) {
    if (!this._agents[id]) this._agents[id] = new Agent ({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 10000,
      maxFreeSockets: 4096,
      timeout: 300000,
      keepAliveTimeout: 10000
    });

    return this._agents[id];
  }

  info () {
    return _.mapValues (this._agents, v => v.getCurrentStatus());
  }
}
