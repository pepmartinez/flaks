const express =   require ('express');
const HttpProxy = require ('../lib/HttpProxy');


function get_router (config, context, done) {
  const proxy = new HttpProxy ({
    xfwd: true
  });

  const router = express.Router();

  router.all ('/:ns/*', (req, res) => {
    proxy.web (req, res, {
      target: 'http://localhost:8090'
    });
  });

  done (null, router);
}

module.exports = get_router;
