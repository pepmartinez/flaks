const express = require ('express');
const _ =       require ('lodash');
const Log =     require ('winston-log-space');


class Controller {
  constructor (config, context) {
    this._config = config;
    this._context = context;
  }

  get_agents (verbose) {
    return this._context.agents.status (verbose);
  }

  get_vhosts (verbose) {
    return this._context.proxy.status (verbose);
  }
}

function get_router (config, context, done) {
  const log = Log.logger ('route:status');

  const ctrl = new Controller (config, context);
  const router = express.Router();

  router.get ('/proxy',  (req, res) => res.send (ctrl.get_vhosts (req.query.v)));
  router.get ('/agents', (req, res) => res.send (ctrl.get_agents (req.query.v)));

  done (null, router);
}

module.exports = get_router;
