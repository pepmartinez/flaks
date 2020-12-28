
var async = require ('async');
var Log =   require ('winston-log-space');

var log = Log.logger ('main:run');


function run (config, cb) {
  const full_app = require ('./uber-app');

  full_app (config, (err, context) => {
    async.series ([
      cb => cb (err),
      cb => {
        var listen_port = config.listen_port;
        var server = require ('http').createServer (context.app);
        context.server = require ('http-shutdown') (server);

        context.server.listen (listen_port, err => {
          if (err) return cb (err);
          log.info ('app listening at %s', listen_port);
          cb ();
        });
      },
      cb => {
        require ('@promster/express').signalIsUp();
        cb ();
      }
    ], err => {  // all done
      if (err) return cb (err);

      // set up shutdown hooks
      process.on ('SIGINT',  () => context.shutdown (true));
      process.on ('SIGTERM', () => context.shutdown (true));

      log.info ('instance ready');
      cb (null, context);
    });
  });
}


module.exports = {
  run
};
