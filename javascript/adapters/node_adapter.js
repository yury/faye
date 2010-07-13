var path  = require('path'),
    fs    = require('fs'),
    sys   = require('sys'),
    url   = require('url'),
    http  = require('http'),
    querystring = require('querystring');

Faye.logger = function(message) {
  sys.puts(message);
};

Faye.withDataFor = function(transport, callback, scope) {
  var data = '';
  transport.addListener('data', function(chunk) { data += chunk });
  transport.addListener('end', function() {
    callback.call(scope, data);
  });
};

Faye.NodeAdapter = Faye.Class(http.Server, {
  DEFAULT_ENDPOINT: '<%= Faye::RackAdapter::DEFAULT_ENDPOINT %>',
  SCRIPT_PATH:      path.dirname(__filename) + '/faye-browser-min.js',
  
  TYPE_JSON:    {'Content-Type': 'application/json'},
  TYPE_SCRIPT:  {'Content-Type': 'text/javascript'},
  TYPE_TEXT:    {'Content-Type': 'text/plain'},
  
  initialize: function(options) {
    this._options    = options || {};
    this._endpoint   = this._options.mount || this.DEFAULT_ENDPOINT;
    this._endpointRe = new RegExp('^' + this._endpoint + '(/[^/]*)*(\\.js)?$');
    this._server     = new Faye.Server(this._options);
    
    http.Server.call(this, function(request, response) {
      self.handle(request, response);
    });
    
    this.addListener('upgrade', function(request, socket, head) {
      self.handleUpgrade(request, socket, head);
    });
    
    var self = this;
  },
  
  addExtension: function(extension) {
    return this._server.addExtension(extension);
  },
  
  removeExtension: function(extension) {
    return this._server.removeExtension(extension);
  },
  
  getClient: function() {
    return this._client = this._client || new Faye.Client(this._server);
  },
  
  handle: function(request, response) {
    var requestUrl = url.parse(request.url, true),
        self = this, data;
    
    if (!this._endpointRe.test(requestUrl.pathname))
      return this.emit('passthrough', request, response);
    
    if (/\.js$/.test(requestUrl.pathname)) {
      fs.readFile(this.SCRIPT_PATH, function(err, content) {
        response.writeHead(200, self.TYPE_SCRIPT);
        response.write(content);
        response.end();
      });
      
    } else {
      var isGet = (request.method === 'GET');
      
      if (isGet)
        this._callWithParams(request, response, requestUrl.query);
      
      else
        Faye.withDataFor(request, function(data) {
          self._callWithParams(request, response, {message: data});
        });
    }
    return true;
  },
  
  handleUpgrade: function(request, socket, head) {
    var socket = new Faye.WebSocket(request),
        self   = this;
    
    socket.onmessage = function(message) {
      try {
        var message = JSON.parse(message.data);
        self._server.process(message, socket, function(replies) {
          socket.send(JSON.stringify(replies));
        });
      } catch (e) {}
    };
  },
  
  _callWithParams: function(request, response, params) {
    try {
      var message = JSON.parse(params.message),
          jsonp   = params.jsonp || Faye.JSONP_CALLBACK,
          isGet   = (request.method === 'GET'),
          type    = isGet ? this.TYPE_SCRIPT : this.TYPE_JSON;
      
      if (isGet) this._server.flushConnection(message);
      
      this._server.process(message, false, function(replies) {
        var body = JSON.stringify(replies);
        if (isGet) body = jsonp + '(' + body + ');';
        response.writeHead(200, type);
        response.write(body);
        response.end();
      });
    } catch (e) {
      response.writeHead(400, this.TYPE_TEXT);
      response.write('Bad request');
      response.end();
    }
  }
});

exports.NodeAdapter = Faye.NodeAdapter;
exports.Client = Faye.Client;
exports.Logging = Faye.Logging;
