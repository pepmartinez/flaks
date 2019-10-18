var CConf = require ('cascade-config');
var async = require ('async');
var _ =     require ('lodash');
var Log =   require ('winston-log-space');


Log.init (function (err) {
  if (err) {
    console.error (err);
    return;
  }

  var log = Log.logger ('main:main');
  var cconf = new CConf ();

  var _defaults = {
    listen_port: 8080,
    agents: {
      http: {
        default : {
          keepAlive: true,
          keepAliveMsecs: 10000,
          maxSockets: 1024,
          maxFreeSockets: 256,
          timeout: 120000
        }
      },
      https: {
        default : {
          keepAlive: true,
          keepAliveMsecs: 10000,
          maxSockets: 1024,
          maxFreeSockets: 256,
          timeout: 120000
        }
      },
    },
    net: {
      incoming_timeout: 120000,
      outgoing_timeout: 110000
    }
  };

  cconf
  .obj (_defaults)
  .env ()
  .file(__dirname + '/etc/config.js')
  .file(__dirname + '/etc/config-{env}.js')
  .env ()
  .args ()
  .done ((err, config) => {
    if (err) return log.error (err);

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
        }
      ], err => {  // all done
        if (err) {
          log.error (err);
          process.exit (1);
        }

        // set up shutdown hooks
        process.on ('SIGINT',  () => context.shutdown ());
        process.on ('SIGTERM', () => context.shutdown ());

        log.info ('instance ready');
      });
    });
  });
});
