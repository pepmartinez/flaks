module.exports = {
  agents : {
  },
  http: {
    wirelog: true,
    introspect: true,
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
      },
      '/c/(.*)' : {
        target: 'http://xana:9099/other/$1',
        agent: 'default'
      },
      '/g/(.*)' : {
        target: 'https://www.google.com/$1',
        agent: 'default'
      }
    }
  },
  net: {
  }
};
