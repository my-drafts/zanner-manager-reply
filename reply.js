
var pu = require('url').parse;
var pf = require('util').format;
var uis = require('util').inspect;
var of = require('zanner-typeof').of;
var logger = require('zanner-logger')('reply');

var reply = module.exports = function(_log, _manager, _id, _execute, _match, _alias){
	var self = this;

	var log = function(){
		(_log ? _log : logger.log).apply(self, arguments);
	};

	// manager for reply
	if(!of(_manager, 'object')){
		log('error', '[reply.constructor]: MANAGER is undefined');
		throw pf('Error [reply.constructor]: MANAGER is undefined');
	}
	this._manager = _manager;
	this.manager = function(){
		return _manager;
	};

	// id for reply
	if(!of(_id, 'string')){
		log('error', '[reply.constructor]: ID is undefined');
		throw pf('Error [reply.constructor]: ID is undefined');
	}
	else _id = String(_id).toLowerCase();
	this._id = _id;
	this.id = function(){
		return _id;
	};

	// execute for reply
	// execute -> ?
	if(!of(_execute, 'function')){
		log('error', '[reply.constructor]: EXECUTE is undefined for id:"%s"', self.id());
		throw pf('Error [reply.constructor]: EXECUTE is undefined for id:"%s"', self.id());
	}
	this.execute = function(z, request, response){
		log('debug', 'execute("%s")', self.id());
		var result = _execute.apply(self, [z, request, response]);
		if(result===true && !response.finished) response.end();
		log('info', 'execute("%s") -> %s', self.id(), uis(result, {depth: 0}));
		return result;
	};

	// match for reply
	// match -> return (object){ rate: length in [0, ...), priority: number in (0, 1), match: string }
	if(!of(_match, 'function')){
		var __match = _match;
		_match = function(z, request, response){
			return replyMatch(__match, z, request);
		};
	}
	this.match = function(z, request, response){
		log('debug', 'match("%s")', self.id());
		var result = _match.apply(self, [z, request, response]);
		log('info', 'match("%s") -> %s', self.id(), result);
		return result;
	};

	// alias for reply
	_alias = !of(_alias, 'object') ? {} : _alias;
	this.alias = function(name){
		return of(name, 'undefined') ? Object.keys(_alias) : (name in _alias) ? _alias[name] : undefined;
	};
};

reply.prototype.inspect = function(depth){
	return pf('reply("%s",%j)', this.id(), this.alias());
};



var replyMatchCompare = function(_match, _value, _compare){
	if(!of(_compare, 'function')){
		throw '[replyMatchCompare]: compare not function';
	}
	switch(of(_match)){
		case 'array':  return _match.some(function(m){return replyMatchCompare(m, _value, _compare);});
		case 'regexp': return _match.test(_value);
		case 'string': return !!_compare(_match, _value);
	}
	return false;
};

var replyMatchEqual = function(_match, _value){
	return replyMatchCompare(_match, _value, function(m, v){
		return m==='*' || m===v;
	});
};

var replyMatchLike = function(_match, _value){
	return replyMatchCompare(_match, _value, function(m, v){
		return m==='*' || v.indexOf(m, 0)!=-1;
	});
};

var replyMatchLLike = function(_match, _value){
	return replyMatchCompare(_match, _value, function(m, v){
		return m==='*' || v.indexOf(m, 0)==0;
	});
};

var replyMatch = function(_match, _z, _request){
	switch(of(_match)){
		case 'undefined':
			break;
		case 'array':
			if(_match.length!=2){
				var result = false;
				for(var index in _match){
					var tmp = replyMatch(_match[index], _z, _request);
					if(tmp===false) continue;
					else if(result===false) result = tmp;
					else if(result.rate>tmp.rate) continue;
					else if(result.rate<tmp.rate) result = tmp;
					else if(result.priority>tmp.rate) continue;
					else if(result.priority<tmp.rate) result = tmp;
					else continue;
				}
				return result;
			}
			else if(of(_match[0], 'regexp') && of(_match[1], 'number')){
				return replyMatch({path:_match[0], priority:_match[1]}, _z, _request);
			}
			else if(of(_match[0], 'number') && of(match[1], 'regexp')){
				return replyMatch({path:_match[1], priority:_match[0]}, _z, _request);
			}
			return replyMatch([undefined].concat(_match), _z, _request);
		case 'object':
			var requestMethod = _request.method.toLowerCase();
			if('method' in _match){
				if(!replyMatchEqual(_match.method, requestMethod)) break;
			}
			else if('m' in _match){
				if(!replyMatchEqual(_match.m, requestMethod)) break;
			}
			var requestHost = pu(_request).hostname;
			if('host' in _match){
				if(!replyMatchEqual(_match.host, requestHost)) break;
			}
			else if('h' in _match){
				if(!replyMatchEqual(_match.h, requestHost)) break;
			}
			var priority = ('priority' in _match) ? _match.priority : ('pp' in _match) ? match.pp : undefined;
			var requestPath = of(_z, 'object') && of(_z.path, 'function') ? _z.path() : pu(_request).pathname;
			if('path' in _match){
				if(!replyMatchLLike(_match.path, requestPath)) break;
				_match = _match.path;
			}
			else if('p' in _match){
				if(!replyMatchLLike(_match.p, requestPath)) break;
				_match = _match.p;
			}
			else _match = undefined;
			return replyMatchReturn('object', _match, requestPath, priority);
		case 'regexp':
			var requestPath = of(_z, 'object') && of(_z.path, 'function') ? _z.path() : pu(_request).pathname;
			var matched = _match.exec(requestPath);
			return matched && matched.index==0 ? replyMatchReturn('regexp', matched[0], requestPath) : false;
		case 'string':
			var requestPath = of(_z, 'object') && of(_z.path, 'function') ? _z.path() : pu(_request).pathname;
			// 0.8::get://host1.host2.host3.host4/path1/path2/path3/path4
			var RE = /^(?:([\.\d]+)[\:]{2})?(?:([\w]+|[\*])[\:])?(?:[\/]{2}([\w\d\:\.\_\-]+|[\*]))?(?:[\/]{1}([^\/]+(?:[\/][^\/]+)*|[\*])?)?$/i;
			if(_match==='') break;
			else if(_match==='*') return replyMatchReturn('any', requestPath, requestPath);
			else if(_match===requestPath) return replyMatchReturn('string', _match, requestPath);
			else if(false && requestPath.indexOf(_match, 0)==0) return replyMatchReturn('string-like', _match, requestPath);
			else if(RE.test(_match)){
				var m = RE.exec(_match);
				var matched = {};
				if(m[1]) matched.priority = parseFloat(m[1]);
				if(m[2]) matched.method = m[2].toLowerCase();
				if(m[3]) matched.host = m[3];
				if(m[4]) matched.path = m[4]==='*' ? '*' : '/' + m[4];
				return replyMatch(matched, _z, _request);
			}
			break;
	}
	return false;
};

var REPLY_PRIORITY = 2;
var replyMatchReturn = function(_caller, _match, _pattern, _priority){
	if(!of(_match, 'string') || !of(_pattern, 'string')){
		return false;
	}
	switch(_caller){
		case 'any':
			return { match: _match, rate: 0, priority: 1 };
		case 'regexp':
			return { match: _match, rate: _match.length, priority: 1./REPLY_PRIORITY++ };
		case 'string':
			return { match: _match, rate: _match.length, priority: _match.length/_pattern.length };
		case 'object':
			if(of(_priority, 'number') && Number.isFinite(_priority)){
				return { match: _match, rate: _match.length, priority: _priority };
			}
			else{
				return { match: _match, rate: _match.length, priority: _match.length/_pattern.length };
			}
		case 'string-like':
			return { match: _match, rate: _match.length, priority: match.length/pattern.length };
	}
	return false;
};
