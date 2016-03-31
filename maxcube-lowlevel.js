var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Promise = require('bluebird');

function MaxCubeLowLevel(ip, port){
  this.ip = ip;
  this.port = port;

  this.socket = new net.Socket();
  this.isConnected = false;

	initSocket.call(this);
}

util.inherits(MaxCubeLowLevel, EventEmitter);

function initSocket () {
  var self = this;

	this.socket.on('data', function(dataBuff) {
    var dataStr = dataBuff.toString('utf-8');
    
    // multiple commands possible
    var commandArr = dataStr.split("\r\n");
    commandArr.forEach(function (command) {
      if (command) {
        var commandType = command.substr(0, 1);
        var payload = command.substring(2) + "\r\n"; // reappend delimiter
        self.emit('command', { type: commandType, payload: payload });
      }
    });
  });

  this.socket.on('close', function() {
    self.isConnected = false;
    self.emit('closed');
  });

  this.socket.on('error', function(err) {
    console.error(err);
    self.emit('error');
  });
}

function connect () {
  var self = this;

  return new Promise(function(resolve, reject) {
    if (!self.isConnected) {
      self.socket.connect(self.port, self.ip, function() {
        self.isConnected = true;
        self.emit('connected');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function close () {
  this.socket.destroy();
}

function send (dataStr) {
  this.socket.write(dataStr);
}

function isConnected () {
  return this.isConnected;
}

MaxCubeLowLevel.prototype.connect = connect;
MaxCubeLowLevel.prototype.close = close;
MaxCubeLowLevel.prototype.send = send;
MaxCubeLowLevel.prototype.isConnected = isConnected;

module.exports = MaxCubeLowLevel;