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
      require ('@promster/express').signalIsNotUp();
      cb ();
    },
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
    // notify lifecycle
    cb => {
      let tasks = [];
      _.each (context.lifecycle_list, v => {
        if (v.end) tasks.push (cb => v.end (cb));
      });

      async.series (tasks, cb);
    },
    cb => {
      // stop promster
      if (context.promster) {
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
  ], err => {
    //          require('active-handles').print();
    if (err) {
      log.error ('got an error on shutdown:');
      log.error (err.stack || err);
    }
    else {
    log.info ('instance clean-shutdown completed');
    }

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
  let context = {config, lifecycle_list: []};

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
    },
    // post-ctor init
    cb => {
      let tasks = [];
      _.each (context.lifecycle_list, v => {
        if (v.init) tasks.push (cb => v.init (cb));
      });

      async.series (tasks, cb);
    }
  ], err => {
    context.shutdown = (doexit, cb) => __shutdown__ (context, doexit, cb);
    cb (err, context);
  });
}

module.exports = uber_app;
