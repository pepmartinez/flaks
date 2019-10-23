const async = require ('async');
const _ =     require ('lodash');
const Log =   require ('winston-log-space');

const Agents = require ('./lib/Agents');
const Proxy =  require ('./lib/Proxy');

const log = Log.logger ('main:uber-app');


////////////////////////////////////////////////////////////////
function __shutdown__ (context, doexit, cb) {
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
      // stop promster
      if (context.promster) {
        clearInterval(context.promster.collectDefaultMetrics());
        context.promster.register.clear();
      }
      cb ();
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
    log.info ('instance clean-shutdown completed');
//          require('active-handles').print();

    if (doexit) {
      log.info ('Exiting...');
      process.exit (0);
    }
    else {
      if (cb) cb ();
    }
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
        context.promster = context.app.locals.Prometheus;
        log.info ('app initialized');
        cb ();
      });
    }
  ], err => {
    context.shutdown = (doexit, cb) => __shutdown__ (context, doexit, cb);
    cb (err, context);
  });
}

module.exports = uber_app;
