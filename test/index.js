var reply = require('../reply');

var m = {};
var r = new reply(null, m, 'r1', function(z, req, res){}, '*', {});

console.log(r);

var replyManager = require('../');
var core = {};
var rm = new replyManager(core, null);
var r1 = rm.build('r1', function(z, req, res){}, '*', {});
var r2 = rm.build('r2', function(z, req, res){}, '*', {});

console.log(rm.set(r));
console.log(rm.set(r1));
console.log(rm.set(r2));
console.log(rm);
