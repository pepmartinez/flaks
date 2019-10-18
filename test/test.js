const should =  require ('should');
const _ =       require ('lodash');
const request = require ('supertest');
const express = require ('express');
const flaks =   require ('../uber-app');


function _get_me_an_app () {
  const app = express ();
  app.all ('*', (req, res) => {
    req.on ('end', () => {
      res.send ({q: req.query, h: req.headers});
    });
  });

  return app;
}


const config = {
  agents : {
  },
  http: {
    trust_proxy: ['192.168.1.0/24'],
    routes: {
      '/a/b/c': {
        target: 'http://xana:8090/a',
        agent: 'default'
      },
      '/b/(.*)' : {
        target: 'http://xana:8090/hawks/$1',
        agent: 'default'
      },
      '/b/c/d/(.*)' : {
        target: 'http://xana:8090/other/$1',
        agent: 'default'
      }
    }
  },
  net: {
    incoming_timeout: 3000,
    outgoing_timeout: 2000
  }
};


describe('flaks', () => {
  before(done => {
    done ();
  });

  after(done => {
    done ();
  });

  describe('Simple Routes', () => {
    it('GET to undefined path gets 404', done => {
      flaks (config, (err, context) => {
        if (err) return done (err);

        request(context.app)
        .get('/not/defined')
        .expect(404)
        .end(err => {
          context.shutdown (false, done);
        });
      });
    });

    it('PUT to undefined path gets 404', done => {
      flaks (config, (err, context) => {
        if (err) return done (err);

        request(context.app)
        .put('/not/defined')
        .send('ddfgdgdgdgdf')
        .type('text')
        .expect(404)
        .end(err => {
          context.shutdown (false, done);
        });
      });
    });

    it('POST to undefined path gets 404', done => {
      flaks (config, (err, context) => {
        if (err) return done (err);

        request(context.app)
        .post('/not/defined')
        .send('ddfgdgdgdgdf')
        .type('text')
        .expect(404)
        .end(err => {
          context.shutdown (false, done);
        });
      });
    });

  });

});
