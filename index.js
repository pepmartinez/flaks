var CConf = require ('cascade-config');
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
    http: {
      access_log: true
    },
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
      outgoing_timeout: 110000,
      connect_timeout:  5000
    }
  };

  cconf
  .obj (_defaults)
  .env ()
  .file(__dirname + '/etc/config.js')
  .file(__dirname + '/etc/config-{NODE_ENV:development}.js')
  .env ()
  .args ()
  .done ((err, config) => {
    if (err) return log.error (err.stack);

    const main = require ('./main');

    main.run (config, (err, context) => {

    });
  });
});
