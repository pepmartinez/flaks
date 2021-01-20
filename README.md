# Flaks: instrumented reverse proxy

Flaks is a reverse proxy with emphasis on instrumentation and traffic introspection. It is designed to serve at the edge, as proxy for outgoing HTTP traffic

In this sort of scenario monitoring is paramount, and so is to be able to peek on the specific req and res being proxied

# Features at a glance

* **Building Blocks**: uses [http-proxy](https://www.npmjs.com/package/http-proxy) as proxy core, wich is very well tested and stable; uses also standard node.js modules for http server and http/https agents. All options and features on the building blocks are exposed for use
* **TLS Termination**: To provide HTTP->HTTPS proxying, Flaks supports all https/tls options available at http-proxy and https agents (including CA and client certificates)
* **Virtual Hosts**: host-based virtual hosts are spported, to provide isolated proxies selectable by `Host:` header
* **Wire Log**: In addition to the usual access log, Flaks can generate wire logs of proxied calls
* **Prometheus Metrics**: fully instrumented (using [promster](https://www.npmjs.com/package/@promster/express)) at http server and http client side
* **req/res introspection**: keeps a circular buffer of the last HTTP transactions, per upstream
* **Zero Downtime deployment**: Flaks can be reloaded (using [pm2 cluster mode](https://pm2.keymetrics.io/docs/usage/cluster-mode/)) whie run inside a Docker container; additionally, it provides graceful start and shutdown
* HA/LB: High availability & Load balancing is provided on upstreams with sequential and weighted-random spreading algorithms. Also, active checks can be added to remove failing upstreams from upstream pools

# Configuration

Flaks uses [cascade-config](https://www.npmjs.com/package/cascade-config) for configuration support. It is set to read its config from:

* {PWD}/etc/config.js
* {PWD}/etc/config-{NODE_ENV:development}.js
* env vars
* command line arguments

Thus, flaks is usually configured with one base js file (etc/config.js) and a set of per-nodeenv js files. Alternaively, env vars and command line args can be passed to further tweak the configuration. See [cascade-config](https://www.npmjs.com/package/cascade-config) for more details

Flaks configuration is based on a set of http/https agents, and a set of virtual hosts; the latter make use of the former (n-to-1). Also, each virtualhost is a set of routes where each route is defined by a regex, and contains a target

Also, some default values for configuration inside both agents and virtualhosts can be provided

## HTTP/HTTPS agents

Standard (http and https) node.js agents are defined here and a key is attached to them. The key is used later to refer to agents inside virtualhosts:

```js
module.exports = {
  agents : {
    http: {
      // http agents defined here
      agent1: {
        // standard node.js http agent here
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 1024,
        maxFreeSockets: 256,
        timeout: 120000,
      },
      agent2: {
        // standard node.js http agent here
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 16,
        maxFreeSockets: 32,
        timeout: 30000,
      },

    }
    https: {
      // http agents defined here
      agent1: {
        // standard node.js https agent here
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 1024,
        maxFreeSockets: 256,
        timeout: 120000,
        ca:    fs.readFileSync('certs/ca.pem'),
        rejectUnauthorized: false,
      },
      agent2: {
        // standard node.js https agent here
        keepAlive: true,
        keepAliveMsecs: 120000,
        maxSockets: 6,
        maxFreeSockets: 6,
        timeout: 180000,
        key:   fs.readFileSync('certs/key.pem'),
        cert:  fs.readFileSync('certs/crt.pem'),
        ca:    fs.readFileSync('certs/ca.pem'),
        rejectUnauthorized: false,
      },

    }
  },
```

This defines 2 http agents `agent1` and `agent2`, and 2 https agents `agent1` and `agent2`

## Virtual Hosts

For Flaks, a virtual host is a container for routes, selectable by the content of the `Host:` header:

```js
module.exports = {
  agents : {
    ...
  },
  vhosts: {
    default: {
      ...
    },
    'localhost.localdomain': {
      ...
    },
    'somehost.mydomain.org': {
      ...
    }
    ...
  }
}
```

As mentioned, the vhost is selected by exact coincidence with the value of the `Host:` header (no wildcards, no regex yet). If none matches, the vhost `default` is used

Then, each virtualhost is pretty much a container for routes. A route, in turn, contains an upstream (where to proxy the request) and an optional agent's name.

Once selected a virtualhost, flaks selects the route whose key matches the request's url path. If more than one matches, the one wuth the longest key (where the size is taken from the regex string size) is taken. The request is then proxied to the upstream defined on the route

For now, upstreams are simply a single target url (no load balance, no HA yet). On a edge proxy, upstream URLs are usually HA, load-balanced, so this tends to not to be a limitation

Capture groups can be specified on the route key, and then used in the upstream target

If an agent is specified in the route, it is used. Whether the agent refers to an http agent or an https agent is decided by the protocol part in the upstream url. If no agent is specified, or the specified agent does not exist, the default agent is used

Also, network-layer configuration specific to the virtualhost can be also specified

```js
module.exports = {
  agents : {
    http: {
      agent1: {
        ...
      }
    },
    https: {
      agentA: {
        ...
      }
    }
  },
  vhosts: {
    default: {
      http: {
        routes: {
          '/a/b/c': {
            target: 'http://somewhere.else.org:8090/a',
          },
          '/b/c/d/(.*)' : {
            target: 'http://just.here.org:8090/other/$1',
            agent: 'agent1'
          },,
          '/c/(.*)/d/(.*)' : {
            target: 'https://another.place.org:8090/other/$1/$2',
            agent: 'agentA'
          },
        }
      },
      net: {
        ...
      }
    }
```

The route matching uses anchored regex: that is, an additional `^` is added at the beginning of the route key, if not specified already

Also, remaining trailing url path is NOT added to the target. You need to capture the remaining part explicitly

Using the config above, here's what some calls would produce:

* `GET /a/b/c/d?x=1&z=true` : proxy GET to `http://somewhere.else.org:8090/a?x=1&z=true` (the `/d` in the path is ignored), using default http agent
* `GET /b/c/d/e/f?x=1&z=true` : proxy GET to `http://just.here.org:8090/other/e/f?x=1&z=true`, using http agent `agent1`
* `GET /c/6666/d/e/f?x=1&z=true` : proxy GET to `https://another.place.org:8090/other/6666/e/f?x=1&z=true`, using https agent `agentA`

### Errors

* if no route inside the virtualhost matches the request's url path, a http 404 is returned
* if proxying to a non-listening url (upstream brings a connection refused) a http 503 error is returned
* if proxying to an upstream with an unknown host (ie, host not known) a http 502 is returned
* if the upstream fails to respond in time after the request was proxied, a http 504 is returned

## Network Layer

Flaks allows some TCP layer configuration, both at virtualhost level (inside `vhosts.{id}.net`) or at top level (inside `net`). The supported config is:

* incoming_timeout: time in milliseconds an incoming request will wait to be proxied and answered. Passed to `http-proxy` as `timeout`
* outgoing_timeout: tiem in milliseconds a proxied request will wait for a response. Passed to `http-proxy` as `proxyTimeout`

## Load Balance & High Availability

### Active Upstream Checks

## Extending Flaks

## Wire Logs

Flaks can generate wire logs at the upstreams, almost byte-perfect (there are some exceptions) using the config key `wirelog`. This can be specified at top level (as `http.wirelog`) or at the virtualhost (at `vhosts.{id}.http.wirelog`)

`wirelog` supports the following values:

* `true`: generate wire log for all cases

* a function `(opts, req) -> boolean`, where `req` is the http request and `opts` is the `options` object received by `http-proxy` at `proxyReq` event. If the function returnd truish, wire log is generated
  
  An example of such function could be
  `(opts, req) => (req.headers['x-wirelog'] == '1')`, which would cause to log all http transactions whose request contains a header `x-wirelog: 1`

Here's an example of wire log for a single request:

```
2019-11-27T10:39:42.251Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > GET /z/something?a=1 HTTP/1.1
2019-11-27T10:39:42.251Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > x-forwarded-host: localhost.localdomain
2019-11-27T10:39:42.251Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > x-forwarded-proto: http
2019-11-27T10:39:42.251Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > x-forwarded-port: 80
2019-11-27T10:39:42.252Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > x-forwarded-for: ::ffff:127.0.0.1
2019-11-27T10:39:42.252Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > accept: */*
2019-11-27T10:39:42.252Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > user-agent: curl/7.65.3
2019-11-27T10:39:42.252Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > host: xana:8090
2019-11-27T10:39:42.252Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 > x-request-id: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088
2019-11-27T10:39:42.252Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 >
[8a6e6fd0-878d-4e54-86d1-b8ffd6971088] /z/something?a=1 200
2019-11-27T10:39:42.269Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < HTTP/1.1 200 OK
2019-11-27T10:39:42.269Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < x-powered-by: Express
2019-11-27T10:39:42.269Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < content-type: application/json; charset=utf-8
2019-11-27T10:39:42.269Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < content-length: 332
2019-11-27T10:39:42.269Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < etag: W/"14c-3sT1IUq7jCDCbkeAzqhLzfQGWZc"
2019-11-27T10:39:42.269Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < date: Wed, 27 Nov 2019 10:39:42 GMT
2019-11-27T10:39:42.269Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < connection: keep-alive
2019-11-27T10:39:42.270Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 <
2019-11-27T10:39:42.272Z [wire:upstream] info: 8a6e6fd0-878d-4e54-86d1-b8ffd6971088 < {"q":{"a":"1"},"h":{"x-forwarded-host":"localhost.localdomain","x-forwarded-proto":"http","x-forwarded-port":"80","x-forwarded-for":"::ffff:127.0.0.1","accept":"*/*","user-agent":"curl/7.65.3","host":"xana:8090","x-request-id":"8a6e6fd0-878d-4e54-86d1-b8ffd6971088","connection":"keep-alive"},"u":"/z/something?a=1","b":{},"c":null}
```

## Introspection

Flaks can also keep a circular buffer of the last 16 http transactions per upstream. This can be activated either globally (with `http.introspect`) or by virtualhost (with `vhosts.{id}.http.introspect`). The `introspect` key accepts the same values than `wirelog`

The contents of the circular buffers can be obtained with a GET to `/status/proxy&v=1`

## Metrics

Flaks maintain and exports prometheus metrics:

* it uses [@promster/express](https://www.npmjs.com/package/@promster/express) to provide server-side and general node.js metrics

* Flaks also maintains an histogram `http_upstream_request_duration` on upstream calls, with the following labels:
  
  * method
  * statusCode
  * uri
  * route
  * vhost
  
  The uri is the target url, before being expanded with regex groups (thus avoiding cardinality issues when url paths contain ids or other variable elements)

Metrics are avaialble at `/metrics`

## Other

### X-Request-Id

Flaks adds a UUIDv4 as `x-request-id` on all requests, if none is present. The x-request-id is then preserved at the upstream, and it is used on logs

### Graceful shutdown

Flaks does graceful shutdown upon SIGINT or SIGTERM signals. Also, the listener is the last thing Flaks starts upon startup, so the moment it is listening, it's ready to be used

### Cluster Mode

Although it is possible to run Flaks in cluster mode with more than one worker, bear in mind that features such as metrics or introspection are not yet custer-aware

It is OK, however, to run in cluster mode with a single worker; this is the way flaks is run in the docker image, using pm2 as cluster provider. This way, Flaks provides full zero-downtime deployment/reload

## Defaults

Here are the defauts used by flaks, as a single object:

```js
  var _defaults = {
    listen_port: 8080,
    agents: {
      http: {
        default : {
          keepAlive: true,
          keepAliveMsecs: 10000,
          maxSockets: 1024,
          maxFreeSockets: 256,
          timeout: 120000
        }
      },
      https: {
        default : {
          keepAlive: true,
          keepAliveMsecs: 10000,
          maxSockets: 1024,
          maxFreeSockets: 256,
          timeout: 120000
        }
      },
    },
    net: {
      incoming_timeout: 120000,
      outgoing_timeout: 110000
    }
  };
```

# Install and run

## As NPM package:

```sh
npm install -g flaks
```

Expects configuration inside `$PWD/etc/`

## As Docker Image

```sh
docker run \
  --name=flaks \
  -p 8080:8080  \
  -e NODE_ENV=development
  -v /path/to/config:/usr/src/app/etc \
  pepmartinez/flaks:1.0.8
```

See [here](https://hub.docker.com/repository/docker/pepmartinez/flaks) for more details

# TODO

A concise list of known to-do things (in no particular order):

* more than one listener
* https listeners
* http2 support
* circuit breakers
* req/res manipulation
* automation/ctrl
* auth on internal paths (status, metrics)
