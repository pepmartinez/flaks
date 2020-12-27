const express = require ('express');
const _ =       require ('lodash');
const Log =     require ('winston-log-space');


function get_router (config, context, done) {
  const log = Log.logger ('route:proxy');

  function _load_extra_middlewares (mws, router) {
    mws.forEach (decl => {
      // initialize/instantiate mw functions from mw objects
      router.use (decl.path, decl.mws.map (mw_root => {
        if (_.isFunction (mw_root)) {
          log.info ('added anonymous/function middleware for path %s', decl.path);
          return mw_root;
        }

        if (mw_root.mw) {
          if (mw_root.set_context) mw_root.set_context (context);
          log.info ('added middleware [%s] on path %s', mw_root.id(), decl.path);
          return mw_root.mw();
        }

        return mw_root;
      }));
    });
  }

  const router = express.Router();
  const proxy = context.proxy;

  _load_extra_middlewares (config.extra_middlewares || [], router);

  router.all ('/*', (req, res) => proxy.serve (req, res));

  done (null, router);
}

module.exports = get_router;
