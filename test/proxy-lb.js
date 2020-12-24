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

  app.all ('/hole', (req, res) => {
    app.__hits++;
    app.__req = req;
    setTimeout (() => res.socket.destroy (), 500);
  });

  app.all ('/never-respond', (req, res) => {
    app.__hits++;
    app.__req = req;
  });

  app.all ('/half-response', (req, res) => {
    app.__hits++;
    app.__req = req;
    res.writeHead(200, {
      'Content-Length': 666,
      'Content-Type': 'text/plain',
      connection: 'keep-alive'
    });
    setTimeout (() => res.socket.destroy (), 500);
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
          '/e/(.*)': {
            target: ['http://localhost:28090/hole', 'http://localhost:28090/st/510']
          },
          '/f/(.*)': {
            target: ['http://localhost:28090/half-response', 'http://localhost:28090/st/510']
          },
          '/g/(.*)': {
            target: ['http://localhost:28090/never-respond', 'http://localhost:28090/st/510']
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

  ['post', 'put', 'patch', 'delete'].forEach (verb =>
  [200, 207, 404, 444, 500, 517].forEach (st => {
//  ['post'].forEach (verb =>
//  [200].forEach (st => {
    it(`proxies ${verb} gets HTTP ${st} on first option, ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          [verb](`/a/${st}`)
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

    it(`proxies ${verb} gets HTTP ${st} on second option (after connection refused), ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          [verb](`/b/${st}`)
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

    it(`proxies ${verb} gets HTTP ${st} on second option (after resolution error), ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          [verb](`/c/${st}`)
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

    it(`proxies ${verb} gets HTTP ${st} on second option (after connection timeout), ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          [verb](`/d/${st}`)
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

    it(`proxies ${verb} gets HTTP ${st} on first option upon socket close, ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          [verb](`/e/${st}`)
          .query({ a: 1, b: '666' })
          .send('ddfgdgdgdgdf')
          .set({
            'x-request-id': 'qwertyuiop'
          })
          .type('text')
          .expect(504)
          .end((err, res) => {
            if (err) return done(err);

            target.__hits.should.equal (1);
            target.__req.body.should.equal ('ddfgdgdgdgdf');

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });


    it(`proxies ${verb} gets HTTP ${st} on first option upon socket close on half-received response, ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          [verb](`/f/${st}`)
          .query({ a: 1, b: '666' })
          .send('ddfgdgdgdgdf')
          .set({
            'x-request-id': 'qwertyuiop'
          })
          .type('text')
          .expect(504)
          .end((err, res) => {
            if (err) return done(err);

            target.__hits.should.equal (1);
            target.__req.body.should.equal ('ddfgdgdgdgdf');

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });


    it(`proxies ${verb} gets HTTP ${st} on first option upon upstream response timeout, ignores the rest `, done => {
      flaks(config, (err, context) => {
        if (err) return done(err);

        let target = _get_me_an_app();
        let tserv = target.listen(28090);

        request(context.app)
          [verb](`/g/${st}`)
          .query({ a: 1, b: '666' })
          .send('ddfgdgdgdgdf')
          .set({
            'x-request-id': 'qwertyuiop'
          })
          .type('text')
          .expect(504)
          .end((err, res) => {
            if (err) return done(err);

            target.__hits.should.equal (1);
            target.__req.body.should.equal ('ddfgdgdgdgdf');

            tserv.close();
            context.shutdown(false, done);
          });
      });
    });




  }));




});
