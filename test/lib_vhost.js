const should =     require ('should');
const _ =          require ('lodash');
const async =      require ('async');


const VHost = require ('../lib/VHost');


describe('lib/VHost', () => {

  describe('selection of upstream by weight', () => {

    it ('orders as expected on several targets with non-zero weights', done => {
      const score = {};

      for (let i = 0; i < 100000; i++) {
        const a = VHost._sort_by_weight ([
          {id: 111, w: 13},
          {id: 333, w: 27},
          {id: 555, w: 19},
          {id: 999, w: 41},
        ]);

        _.each (a, (v, k) => {
          if (!score[k]) score[k] = {};
          if (!score[k][v.id]) score[k][v.id] = 0;
          score[k][v.id]++;
        });
      }

      _.size (score[0]).should.equal (4);
      score[0]['111'].should.be.approximately (13000, 1000);
      score[0]['333'].should.be.approximately (27000, 1000);
      score[0]['555'].should.be.approximately (19000, 1000);
      score[0]['999'].should.be.approximately (41000, 1000);
      done ();
    });

    it ('orders as expected on several targets with non-zero weights', done => {
      const score = {};

      for (let i = 0; i < 100000; i++) {
        const a = VHost._sort_by_weight ([
          {id: 111, w: 23},
          {id: 333, w: 37},
          {id: 555, w: 0},
          {id: 777, w: 0},
          {id: 999, w: 40},
        ]);

        _.each (a, (v, k) => {
          if (!score[k]) score[k] = {};
          if (!score[k][v.id]) score[k][v.id] = 0;
          score[k][v.id]++;
        });
      }

      _.size (score[0]).should.equal (3);
      score[0]['111'].should.be.approximately (23000, 1000);
      score[0]['333'].should.be.approximately (37000, 1000);
      score[0]['999'].should.be.approximately (40000, 1000);
      done ();
    });


    it ('orders as expected on one target', done => {
      const score = {};

      for (let i = 0; i < 100000; i++) {
        const a = VHost._sort_by_weight ([
          {id: 111, w: 23}
        ]);

        _.each (a, (v, k) => {
          if (!score[k]) score[k] = {};
          if (!score[k][v.id]) score[k][v.id] = 0;
          score[k][v.id]++;
        });
      }

      _.size (score[0]).should.equal (1);
      score[0]['111'].should.equal (100000);
      done ();
    });

    it ('orders as expected on several targets with zero weight', done => {
      const score = {};

      for (let i = 0; i < 100000; i++) {
        const a = VHost._sort_by_weight ([
          {id: 111, w: 0},
          {id: 333, w: 0},
          {id: 555, w: 0},
        ]);

        _.each (a, (v, k) => {
          if (!score[k]) score[k] = {};
          if (!score[k][v.id]) score[k][v.id] = 0;
          score[k][v.id]++;
        });
      }

      _.size (score).should.equal (0);
      done ();
    });

    it ('orders as expected on one target with zero weight', done => {
      const score = {};

      for (let i = 0; i < 100000; i++) {
        const a = VHost._sort_by_weight ([
          {id: 111, w: 0}
        ]);

        _.each (a, (v, k) => {
          if (!score[k]) score[k] = {};
          if (!score[k][v.id]) score[k][v.id] = 0;
          score[k][v.id]++;
        });
      }

      _.size (score).should.equal (0);
      done ();
    });

    it ('orders as expected on several targets with no explicit weight', done => {
      const score = {};

      for (let i = 0; i < 100000; i++) {
        const a = VHost._sort_by_weight ([
          {id: 111, w: 1},
          {id: 333, w: 1},
          {id: 555, w: 1},
        ]);

        _.each (a, (v, k) => {
          if (!score[k]) score[k] = {};
          if (!score[k][v.id]) score[k][v.id] = 0;
          score[k][v.id]++;
        });
      }

      _.size (score).should.equal (3);
      score[0]['111'].should.be.approximately (33333, 1000);
      score[0]['333'].should.be.approximately (33333, 1000);
      score[0]['555'].should.be.approximately (33333, 1000);
      done ();
    });

  });
});

