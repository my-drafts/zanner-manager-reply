
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

var REPLY_PRIORITY = 2;
var replyMatch = function(_match, _z, _request){
	switch(of(_match)){
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
			else{
				return replyMatch([undefined].concat(_match), _z, _request);
			}
		case 'regexp':
			var requestPath = of(_z, 'object') && of(_z.path, 'function') ? _z.path() : pu(_request).pathname;
			var matched = _match.exec(requestPath), priority = 1./REPLY_PRIORITY++;
			return matched && matched.index==0 ? replyMatchReturn('regexp', matched[0], requestPath, priority) : false;
		case 'string':
			return replyMatchString(_match, _z, _request);
		case 'object':
			return replyMatchObject(_match, _request);
	}
	return false;
};



var replyMatchString = function(_match, _z, _request){
	var requestPath = of(_z, 'object') && of(_z.path, 'function') ? _z.path() : pu(_request).pathname;
	// 0.8::get://host1.host2.host3.host4/path1/path2/path3/path4
	var RE = /^(?:([\.\d]+)[\:]{2})?(?:([\w]+|[\*])[\:])?(?:[\/]{2}([\w\.\_\-]+|[\*]))?[\/]{1}([^\/]+(?:[\/][^\/]+)*|[\*])?$/i;
	if(_match===requestPath){
		return replyMatchReturn('string', _match, requestPath, 1);
	}
	else if(_match==='*'){
		return replyMatchReturn('any', requestPath, requestPath, undefined);
	}
	else if(false && requestPath.indexOf(match, 0)==0){
		return replyMatchReturn('string-like', match, requestPath, undefined);
	}
	else if(RE.test(match)){
		var m = RE.exec(match);
		var matched = {};
		if(m[1]) matched.priority = m[1];
		if(m[2]) matched.method = m[2];
		if(m[3]) matched.host = m[3];
		if(m[4]) matched.path = m[4]=='*' ? '*' : '/' + m[4];
		return replyMatch(matched, _z, _request);
	}
	return replyMatchReturn('none', '', 0);
};

var replyMatchReturn = function(how, match, pattern, priority){
	if(!of(match, 'string')){
		return { rate: 0, priority: 0, match: '' };
	}
	else if(of(priority, 'number') && Number.isFinite(priority)){
		return { rate: match.length, priority: priority, match: match };
	}
	var p = parseFloat(priority);
	if(Number.isFinite(p)){
		return { rate: match.length, priority: p, match: match };
	}
	else if(typeOf(pattern, 'string')){
		switch(how){
			case 'any':
				return { rate: 0, priority: 1, match: match };
			case 'regexp':
			case 'string':
			case 'object':
				return { rate: match.length, priority: match.length/pattern.length, match: match };
			case 'string-like':
				return { rate: 0, priority: match.length/pattern.length, match: match };
		}
	}
	return {rate: 0, priority: 0, match: match };
};

var replyMatchObject = function(match, request){
	var rm = typeOf(request.z,'object') && typeOf(request.z.URL,'object') ? request.z.URL : meta(request);
	var pn = typeOf(request.z,'object') && typeOf(request.z.path,'function') ? request.z.path() : meta(request).pathname;
	if(('method' in match) && !replyMatchObjectEqual(match.method, rm.method))
		return replyMatchReturn('none', '', 0);
	if(('m' in match) && !replyMatchObjectEqual(match.m, rm.method))
		return replyMatchReturn('none', '', 0);
	if(('host' in match) && !replyMatchObjectEqual(match.host, rm.hostname))
		return replyMatchReturn('none', '', 0);
	if(('h' in match) && !replyMatchObjectEqual(match.h, rm.hostname))
		return replyMatchReturn('none', '', 0);
	var value = '';
	if(('path' in match) && !!match.path){
		value = replyMatchObjectLLike(match.path, pn); // _oneMatchObjectLLike
		if(value==false) return replyMatchReturn('none', '', 0);
		else if(value==true) value = match.path;
	}
	else if(('p' in match) && !!match.p){
		value = replyMatchObjectLLike(match.p, pn); // _oneMatchObjectLLike
		if(value==false) return replyMatchReturn('none', '', 0);
		else if(value==true) value = match.path;
	}
	var priority;
	if(('priority' in match) && !!match.priority) priority = match.priority;
	else if(('pp' in match) && !!match.pp) priority = match.pp;
	return replyMatchReturn('object', value, priority, pn);
};

var replyMatchObjectEqual = function(match, value){
	if(match=='*') return true;
	switch(typeOf(match)){
		case 'array':
			if(!match.find(function(m){return (m=='*')||(m==value);})) return false;
		case 'regexp':
			if(!match.test(value)) return false;
			return match.exec(value)[0];
		case 'string':
			if(!(match==value)) return false;
	}
	return true;
};

var replyMatchObjectLLike = function(match, value){
	if(match=='*') return true;
	switch(typeOf(match)){
		case 'array':
			if(!match.find(function(m){return (m=='*')||(value.indexOf(m, 0)==0);})) return false;
		case 'regexp':
			if(!match.test(value)) return false;
			return match.exec(value)[0];
		case 'string':
			if(!(value.indexOf(match, 0)==0)) return false;
	}
	return true;
};
