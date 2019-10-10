var async = require ('async');
var _ =     require ('lodash');
var Log =   require ('winston-log-space');

var log = Log.logger ('UberApp');


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
    }
  ], () => {
    log.info ('instance clean-shutdown completed. Exiting...');
//          require('active-handles').print();
    process.exit (0);
  });
}


function uber_app (config, cb) {
  let context = {config};

  async.series ([
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
