const express = require ('express');
const _ =       require ('lodash');
const Log =     require ('winston-log-space');

const HttpProxy = require ('../lib/HttpProxy');


function get_router (config, context, done) {
  const log = Log.logger ('proxy');

  const path_idx = [];
  const paths = {};

  _.each (_.get (config, 'http.routes', {}), (v, k) => {
    log.debug ('got route %s', k);
    path_idx.push (k);
    paths[k] = _.merge ({}, v, {regex: k.startsWith ('^') ? new RegExp (k) : new RegExp ('^' + k)});
  });

  path_idx.sort((a, b) => b.length - a.length);

  const proxy = new HttpProxy ({
    xfwd:         true,
    ignorePath:   true,
    timeout:      _.get (config, 'net.incoming_timeout', 75000),
    proxyTimeout: _.get (config, 'net.outgoing_timeout', 50000),
  });

  const router = express.Router();

  router.all ('/*', (req, res) => {
    let mtch = null;
    for (let i = 0; ((!mtch) && (i < path_idx.length)); i++) {
      if (paths[path_idx[i]].regex.test (req.path)) mtch = paths[path_idx[i]];
      log.debug ('check %s against %s, match is %j', req.path, paths[path_idx[i]].regex, mtch);
    }

    if (!mtch) {
      return res.status(404).send ('not found');
    }
    else {
      const idx = req.originalUrl.indexOf('?');
      const qstr = (idx == -1) ? '' : req.originalUrl.substr (idx);
      proxy.web (req, res, {
        headers: {'X-Request-Id': req.id},
        target: req.path.replace (mtch.regex, mtch.target) + qstr
      });
    }
  });

  done (null, router);
}

module.exports = get_router;
