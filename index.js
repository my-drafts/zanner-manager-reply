
var pf = require('util').format;
var uis = require('util').inspect;
var logger = require('zanner-logger')('replyManager');
var of = require('zanner-typeof').of;
var reply = require('./reply');

var replyManager = module.exports = function(_core, _log){
	var self = this;
	var items = self._items = [];

	var log = function(){
		(_log ? _log : logger.log).apply(self, arguments);
	};

	// core for replyManager
	if(!of(_core, 'object')){
		log('error', '[replyManager.constructor]: CORE is undefined');
		throw pf('Error [replyManager.constructor]: CORE is undefined');
	}
	this._core = _core;
	this.core = function(){
		return _core;
	};

	// count for replyManager
	this.count = function(){
		return items.length;
	};

	// build for replyManager
	this.build = function(id, execute, match, alias){
		if(of(id, 'object')){
			var _of = 'function';
			execute = of(execute, _of) ? execute : of(id.execute, _of) ? id.execute : of(id.e, _of) ? id.e : undefined;
			var _of = ['function', 'regexp', 'string', 'array', 'object'];
			match = of(match, _of) ? match : of(id.match, _of) ? id.match : of(id.m, _of) ? id.m : undefined;
			var _of = 'object';
			alias = of(alias, _of) ? alias : of(id.alias, _of) ? id.alias : of(id.a, _of) ? id.a : undefined;
			var _of = 'string';
			id = of(id.id, _of) ? id.id : undefined;
		}
		log('debug', 'build(id:"%s", match:"%s", alias:{%s})', id, match, of(alias, 'object') ? Object.keys(alias) : '');
		return new reply(_log, self, id, execute, match, alias);
	};

	// done for replyManager
	this.done = function(){
		log('debug', 'done');
	};

	// get for replyManager
	this.get = function(id){
		var result = replyManagerGet(items, id);
		log('debug', 'get("%s") -> %j', id, result ? 'ok' : 'undefined');
		return result;
	};

	// IDs for replyManager
	this.ids = function(){
		var result = replyManagerIds(items);
		log('debug', 'ids() -> %j', result);
		return result;
	};

	// index for replyManager
	this.index = function(id){
		var result = replyManagerIndex(items, id);
		log('debug', 'index("%s") -> %j', id, result);
		return result;
	};

	// run for replyManager
	this.run = function(error, z, request, response){
		if(error) log('notice', 'run() -> error:%j', uis(error, {depth: 1}));
		else{
			var done = replyManagerMatch(items, z, request, response);
			// console.log(done.id); // !!!
			if(done) done.execute(z, request, response);
			else{
				log('warning', 'no reply choosen');
				response.writeHead(404, {'content-type': 'text/plain'});
				response.end('Not found!.');
			}
		}
	};

	// set for replyManager
	this.set = function(replyItem){
		var result = replyManagerSet(items, replyItem);
		switch(of(result)){
			case 'number':
				log('debug', 'set(id:"%s")', replyItem.id());
				return result;
			case 'boolean':
				if(result!==false) break;
				log('warning', 'set(id:"%s"): reply already exists', replyItem.id());
				return false;
			case 'undefined':
				log('error', 'set(%j): not reply given', replyItem);
				return undefined;
		}
		log('error', 'set(%j): unknown', replyItem);
		return undefined;
	};

	// storeAlias for replyManager: alias register
	this.storeAlias = function(_id, _action){
		log('debug', 'storeAlias("%s")', _id);
		var item = replyManagerGet(items, _id);
		var aliases = item ? item.alias() : [];
		for(var index in aliases){
			_action({
				name: aliases[index],
				run: function(_arguments){
					return replyManagerAliasApply(items, _id, aliases[index], _arguments, log);
				},
				type: 'reply'
			});
		}
		log('info', 'storeAlias("%s"): done', _id);
	};

	// storeAliasUndo for replyManager: alias register undo
	this.storeAliasUndo = function(_id, _action){
		log('debug', 'storeAliasUndo("%s")', _id);
		var item = replyManagerGet(items, _id);
		var aliases = item ? item.alias() : [];
		for(var index in aliases){
			_action(aliases[index]);
		}
		log('info', 'storeAliasUndo("%s"): done', _id);
	};

	// unset for replyManager
	this.unset = function(id){
		log('debug', 'unset("%s")', id);
		return replyManagerUnset(items, id);
	};
};

replyManager.prototype.inspect = function(depth){
	return pf('replyManager(%j)', this.ids());
};



var replyManagerAliasApply = function(_items, _id, _name, _arguments, _log){
	try{
		var item = replyManagerGet(_items, _id);
		_log('debug', 'alias(id:"%s", name:"%s", args:%j)', _id, _name, _arguments);
		var result = item ? item.alias(_name).apply(item, _arguments) : 'id not found';
		_log('info', 'alias(id:"%s", name:"%s", args:%j) -> %j', _id, _name, _arguments, result);
		return result;
	}
	catch (e){
		_log('warning', 'alias(id:"%s", name:"%s", args:%j): unknown exception %j', _id, _name, _arguments, e);
		return undefined;
	}
};

var replyManagerGet = function(_items, _id){
	return _items.find(function(item){
		return item.id()==_id;
	});
};

var replyManagerIds = function(_items){
	return Object.keys(_items).map(function(index){
		return _items[index].id();
	});
};

var replyManagerIndex = function(_items, _id){
	return Object.keys(_items).find(function(index){
		return _items[index].id()==_id;
	});
};

var replyManagerMatch = function(_items, _z, _request, _response){ // !!!
	var compareItem = function(a, b){
		if(a.rate>b.rate) return a;
		if(a.rate<b.rate) return b;
		if(a.priority>b.priority) return a;
		if(a.priority<b.priority) return b;
		return a;
		//throw pf('Error [replyManagerMatch]: id:("%s", "%s") rate:(%s, %s) priority:(%s %s)', a.id, b.id, a.rate, b.rate, a.priority, b.priority);
	};
	return Object.keys(_items).map(function(index){
		var match = _items[index].match(_z, _request, _response);
		return of(match, 'object') ? Object.assign({}, match, {
			index: index,
			item: items[index],
			id: items[index].id(),
			execute: items[index].execute
		}) : false;
	}).filter(function(match){
		return match!==false;
	}).reduce(compareItem);
};

var replyManagerSet = function(_items, _value){
	if(!(_value instanceof reply)) return undefined;
	else if(_items.some(function(item){return item.id()==_value.id();})) return false;
	else return _items.push(_value);
};

var replyManagerUnset = function(_items, _id){
	var index = replyManagerIndex(_items, _id);
	if(index!=-1) delete _items[index];
};
