const async = require ('async');
const _ =     require ('lodash');
const Log =   require ('winston-log-space');

const Agents = require ('./lib/Agents');
const Proxy =  require ('./lib/Proxy');

const log = Log.logger ('main:uber-app');


////////////////////////////////////////////////////////////////
function __shutdown__ (context) {
  log.info ('http server shutdown starts...');

  async.series ([
    cb => {
      if (context.server) {
        log.info ('shutting down http server');
        context.server.shutdown (() => {
          log.info ('http server cleanly shutdown');
          cb ();
        });
      }
      else {
        cb ();
      }
    },
    cb => {
      if (context.proxy) {
        log.info ('shutting down http proxy engine');
        context.proxy.close ();
      }
      cb ();
    },
    cb => {
      if (context.agents) {
        log.info ('destroying http(s) agents');
        context.agents.destroy ();
      }
      cb ();
    },
  ], () => {
    log.info ('instance clean-shutdown completed. Exiting...');
//          require('active-handles').print();
    process.exit (0);
  });
}


/////////////////////////////////////////////////////////////////
function uber_app (config, cb) {
  let context = {config};

  async.series ([
    cb => {
      // create Agents store
      context.agents = new Agents (config, context);
      log.info ('agents initialized');
      cb ();
    },
    cb => {
      context.proxy = new Proxy (config, context);
      log.info ('proxy initialized');
      cb ();
    },
    cb => {
      // init app
      var App = require ('./app');

      App (config, context, (err, app) => {
        if (err) return cb (err);
        context.app = app;
        log.info ('app initialized');
        cb ();
      });
    }
  ], err => {
    context.shutdown = () => __shutdown__ (context);
    cb (err, context);
  });
}

module.exports = uber_app;
