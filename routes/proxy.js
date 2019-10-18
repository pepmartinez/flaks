const express = require ('express');
const _ =       require ('lodash');
const Log =     require ('winston-log-space');


function get_router (config, context, done) {
  const log = Log.logger ('route:proxy');

  const router = express.Router();
  const proxy = context.proxy;

  router.all ('/*', (req, res) => proxy.serve (req, res));

  done (null, router);
}

module.exports = get_router;
