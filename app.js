var express =    require ('express');
var bodyParser = require ('body-parser');
var async =      require ('async');
var Log =        require ('winston-log-space');
var path =       require ('path');
var morgan =     require ('morgan');
var promster =   require ('@promster/express');


module.exports = function  (opts, context, done) {
  var log =        Log.logger ('app');
  var access_log = Log.logger ('access');

  var routes_proxy = require ('./routes/proxy');

  var app = express();

  if (opts.http && opts.http.trust_proxy) {
    app.set ('trust proxy', opts.http && opts.http.trust_proxy);
  }

  app.use (morgan ('combined', { stream: { write: message => access_log.info (message.trim ()) }}));

  app.use (promster.createMiddleware({
    app: app,
    options: {
      normalizePath: (full_path, {req, res}) => (req.route ? path.join (req.baseUrl, req.route.path) : full_path.split ('?')[0])
    }
  }));

  app.use('/metrics', (req, res) => {
    res.setHeader ('Content-Type', promster.getContentType());
    res.end (promster.getSummary());
  });

  app.use (bodyParser.json ());

  async.series ([
    cb => routes_proxy (opts, context, (err, router) => {
      if (err) return cb (err);
      app.use ('/', router);
      cb();
    }),
  ], err => {
    if (err) return done (err);

    // must be set last!!!
    app.use (function (err, req, res, next) {
      if (err.name === 'UnauthorizedError') {
        return res.status(401).send (err.message || 'Unauthorized');
      }

      log.error ('error caught: %s', err.stack);
      res.status (err.status || 500).send (err.stack);
    });

    done (null, app);
  });
}

