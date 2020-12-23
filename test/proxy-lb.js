const should =     require ('should');
const _ =          require ('lodash');
const async =      require ('async');
const request =    require ('supertest');
const express =    require ('express');
const bodyParser = require ('body-parser');

function _get_me_an_app() {
  const app = express();
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(bodyParser.text());

  app.all ('/st/:st', (req, res) => {
    app.__hits++;
    app.__req = req;
    res.status (+(req.params.st)).send ('status');
  });

  app.all('*', (req, res) => {
    app.__hits++;
    app.__req = req;
    res.send({ q: req.query, h: req.headers, u: req.url, b: req.body });
  });

  app.__hits = 0;
  return app;
}

const config = {
  agents: {},
  vhosts: {
    default: {
      http: {
        routes: {
          '/a/(.*)': {
            target: ['http://localhost:28090/st/$1', 'http://localhost:28090/st/510']
          },
          '/b/(.*)': {
            target: ['http://localhost:19999/st/$1', 'http://localhost:28090/st/$1', 'http://localhost:28090/st/510']
          },
          '/c/(.*)': {
            target: ['http://localhoster:28090/st/$1', 'http://localhost:28090/st/$1', 'http://localhost:28090/st/510']
          },
          '/d/(.*)': {
            target: ['http://1.1.1.1:28090/st/$1', 'http://localhost:28090/st/$1', 'http://localhost:28090/st/510']
          },
        }
      },
      net: {
        incoming_timeout: 3000,
        outgoing_timeout: 2000,
        connect_timeout: 1000
      }
    }
  }
};

describe('LoadBalancing', () => {

  let flaks;

  before (done => async.series ([
//    cb => require ('winston-log-space').init (cb),
    cb => {flaks = require('../uber-app'); cb (); }
  ], done));

  [200, 207, 404, 444, 500, 517].forEach (st => {
    it(`proxies POST gets HTTP ${st} on first option, ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          .post(`/a/${st}`)
          .query({ a: 1, b: '666' })
          .send('ddfgdgdgdgdf')
          .set({
            'x-request-id': 'qwertyuiop'
          })
          .type('text')
          .expect(st)
          .end((err, res) => {
            if (err) return done(err);

            target.__hits.should.equal (1);
            target.__req.body.should.equal ('ddfgdgdgdgdf');

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });

    it(`proxies POST gets HTTP ${st} on second option (after connection refused), ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          .post(`/b/${st}`)
          .query({ a: 1, b: '666' })
          .send('ddfgdgdgdgdf')
          .set({
            'x-request-id': 'qwertyuiop'
          })
          .type('text')
          .expect(st)
          .end((err, res) => {
            if (err) return done(err);

            target.__hits.should.equal (1);
            target.__req.body.should.equal ('ddfgdgdgdgdf');

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });

    it(`proxies POST gets HTTP ${st} on second option (after resolution error), ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          .post(`/c/${st}`)
          .query({ a: 1, b: '666' })
          .send('ddfgdgdgdgdf')
          .set({
            'x-request-id': 'qwertyuiop'
          })
          .type('text')
          .expect(st)
          .end((err, res) => {
            if (err) return done(err);

            target.__hits.should.equal (1);
            target.__req.body.should.equal ('ddfgdgdgdgdf');

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });

    it(`proxies POST gets HTTP ${st} on second option (after connection timeout), ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          .post(`/d/${st}`)
          .query({ a: 1, b: '666' })
          .send('ddfgdgdgdgdf')
          .set({
            'x-request-id': 'qwertyuiop'
          })
          .type('text')
          .expect(st)
          .end((err, res) => {
            if (err) return done(err);

            target.__hits.should.equal (1);
            target.__req.body.should.equal ('ddfgdgdgdgdf');

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });

  });




});
