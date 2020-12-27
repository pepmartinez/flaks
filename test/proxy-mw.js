const should = require("should");
const _ = require("lodash");
const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");
const flaks = require("../uber-app");

function _get_me_an_app() {
  const app = express();
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(bodyParser.text());

  app.all('*', (req, res) => {
    res.send({ q: req.query, h: req.headers, u: req.url, b: req.body });
  });

  return app;
}


class OneMW {
  constructor (opts) {
    this._body = 'not-init';
//    console.log ('mw ctor')
  }

  id () {return 'OneMW'}

  set_context (context) {
    this._context = context;

    // register for lifecycle events
    context.lifecycle_list.push (this);
  }

  init (cb) {
    this._body = 'with-init';
 //   console.log ('mw init')
    cb ();
  }

  end (cb) {
//    console.log ('mw end')
    cb ();
  }

  mw () {
    const self = this;
    return function (req, res, next) {self._mw (req, res, next);}
  }

  _mw (req, res, next) {
    req.body.init = this._body;
    req.headers.abcde = 'fghij';
//    console.log ('mw mw(%s)', req.body)
    next ();
  }

}



const config = {
  agents: {},
  vhosts: {
    default: {
      http: {
        routes: {
          "/a/(.*)": {
            target: "http://localhost:28090/aa/$1",
            agent: "default"
          },
          "/b/(.*)": {
            target: ["http://localhostoo:28090/bb/$1", "http://localhost:28090/bbb/$1"],
            agent: "default"
          },
        },
      },
      net: {
        incoming_timeout: 3000,
        outgoing_timeout: 2000,
        connect_timeout: 1000
      }
    }
  },
  extra_middlewares: [
    {
      path: '/a',
      mws: [ bodyParser.json (), new OneMW() ]
    },
    {
      path: '/b',
      mws: [ bodyParser.json (), new OneMW() ]
    },
  ]
};


describe("Extra middlewares", () => {
  it("GET works ok", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .get('/a/ver')
        .expect(200)
        .end((err, res) => {
          res.body.h.abcde.should.equal ('fghij');

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });


  it("PUT works ok", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .put('/a/ver')
        .send ({aa: 'qwertyuiop', bb: 666})
        .expect(200)
        .end((err, res) => {
          res.body.h.abcde.should.equal ('fghij');
          res.body.b.should.eql ({ aa: 'qwertyuiop', bb: 666, init: 'with-init' });

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });

  it("GET works ok on LB", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .get('/b/ver')
        .expect(200)
        .end((err, res) => {
          res.body.h.abcde.should.equal ('fghij');
          res.body.u.should.equal ('/bbb/ver');

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });


  it("PUT works ok on LB", done => {
    flaks(config, (err, context) => {
      if (err) return done(err);

      let target = _get_me_an_app();
      let tserv = target.listen(28090);

      request(context.app)
        .put('/b/ver')
        .send ({aa: 'qwertyuiop', bb: 666})
        .expect(200)
        .end((err, res) => {
          res.body.h.abcde.should.equal ('fghij');
          res.body.u.should.equal ('/bbb/ver');
          res.body.b.should.eql ({ aa: 'qwertyuiop', bb: 666, init: 'with-init' });

          tserv.close();
          context.shutdown(false, done);
        });
    });
  });



});
