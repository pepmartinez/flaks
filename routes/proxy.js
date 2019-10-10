const express =   require ('express');
const httpProxy = require ('http-proxy');


function get_router (config, context, done) {
  const proxy = httpProxy.createProxyServer ({
    xfwd: true
  });

  const router = express.Router();

  router.all ('/:ns/*', (req, res) => {
    proxy.web (req, res, {
      target: 'http://localhost:8080'
    });
  });

  done (null, router);
}

module.exports = get_router;
