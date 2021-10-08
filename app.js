var express =      require ('express');
var bodyParser =   require ('body-parser');
var async =        require ('async');
var Log =          require ('winston-log-space');
var path =         require ('path');
var promster =     require ('@promster/express');
var addRequestId = require ('express-request-id');

var AccessLog =    require ('./lib/AccessLog');


module.exports = function  (opts, context, done) {
  var log = Log.logger ('main:app');

  var routes_proxy =  require ('./routes/proxy');
  var routes_status = require ('./routes/status');

  var app = express();

  if (opts.http && opts.http.trust_proxy) {
    app.set ('trust proxy', opts.http && opts.http.trust_proxy);
  }

  app.use (addRequestId ());
  app.use (AccessLog (opts));

  app.use (promster.createMiddleware({
    app: app,
    options: {
      normalizePath: (full_path, {req, res}) => {
        if (req._upstream_route) return req._upstream_route;
        if (req.route) return path.join (req.baseUrl, req.route.path);
        return full_path.split ('?')[0];
      }
    }
  }));

  app.use('/metrics', async (req, res) => {
    res.setHeader ('Content-Type', promster.getContentType());
    res.end (await promster.getSummary());
  });

  async.series ([
    cb => routes_status (opts, context, (err, router) => {
      if (err) return cb (err);
      app.use ('/status', bodyParser.json (), router);
      cb();
    }),
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

