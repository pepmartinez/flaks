const express = require ('express');
const _ =       require ('lodash');
const Log =     require ('winston-log-space');


function get_router (config, context, done) {
  const log = Log.logger ('route:status');

  const router = express.Router();
  const proxy = context.proxy;
  const agents = context.agents;

  router.get ('/proxy',  (req, res) => res.send (proxy.status ()));
  router.get ('/agents', (req, res) => res.send (agents.status ()));

  done (null, router);
}

module.exports = get_router;
