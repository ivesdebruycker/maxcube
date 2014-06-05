var net = require('net');
var schedule = require('node-schedule');
var moment = require('moment');

var updateIntervalMins = 15;
var heartbeatIntervalSecs = 20;

// Constructor
function MaxCube(ip, port) {
  this.ip = ip;
  this.port = port;

  this.isConnected = false;
  this.busy = false;

  this.callback;
  this.dutyCycle = 0;
  this.memorySlots = 0;

  this.rooms = [];
  this.devices = [];

  this.client = new net.Socket();

  var self = this;

  this.client.on('data', function(dataBuff) {
    var dataStr = dataBuff.toString('utf-8');
    var commandType = dataStr.substr(0, 1);
    var payload = dataStr.substring(2, dataStr.length - 2);
    log('Data received: ' + commandType);

    var dataObj = parseCommand.call(self, commandType, payload);

    if (self.callback != undefined && self.callback instanceof Function) {
      self.callback.call(self, dataObj);
      self.callback = undefined;
    }
    self.busy = false;
  });

  var ruleUpdateTrigger = new schedule.RecurrenceRule();
  ruleUpdateTrigger.minute = [new schedule.Range(8, 60, 15)];
  var updateTriggerJob = schedule.scheduleJob(ruleUpdateTrigger, function(){
    log('Update trigger');
    if (self.devices[0] !== undefined && self.devices[0].devicetype === 1) {
      setTemperature.call(self, self.devices[0].rf_address, 'manual', 11.5);
    }
  });

  var ruleUpdateTriggerReset = new schedule.RecurrenceRule();
  ruleUpdateTriggerReset.minute = [new schedule.Range(10, 60, 15)];
  var updateTriggerResetJob = schedule.scheduleJob(ruleUpdateTriggerReset, function(){
    log('Update trigger reset');
    if (self.devices[0] !== undefined && self.devices[0].devicetype === 1) {
      setTemperature.call(self, self.devices[0].rf_address, 'manual', 11);
    }
  });

  var ruleHeartbeat = new schedule.RecurrenceRule();
  ruleHeartbeat.second = [new schedule.Range(heartbeatIntervalSecs/2, 59, heartbeatIntervalSecs)];
  var heartbeatJob = schedule.scheduleJob(ruleHeartbeat, function(){
    log('Heartbeat');
    doHeartbeat.call(self, function (dataObj) {
      log('Status: ' + JSON.stringify(dataObj));
    });
  });

  log('MaxCube initialized');

}
// class methods
MaxCube.prototype.getDeviceStatus = function(rf_address) {
  return this.devices[rf_address];
};

function send (dataStr, callback) {
  if (!this.busy) {
    if (callback !== undefined  && callback instanceof Function) {
      busy = true;
      this.callback = callback;
    } else {
      this.callback = undefined;
    }

    this.client.write(dataStr);
    log('Data sent (' + this.dutyCycle + '%, ' + this.memorySlots + '): ' + dataStr.substr(0,1));
  }
}

function parseCommand (type, payload) {
  switch (type) {
    case 'H':
    return parseCommandHello.call(this, payload);
    break;
    case 'M':
    return parseCommandMetadata.call(this, payload);
    break;
    case 'C':
    break;
    case 'L':
    return parseCommandDeviceList.call(this, payload);
    break;
    case 'S':
    return parseCommandSendDevice.call(this, payload);
    break;
    default:
    log('Unknown command type: ' + type);
  }
}

function parseCommandHello (payload) {
  var payloadArr = payload.split(",");

  var dataObj = {
    serial_number: payloadArr[0],
    rf_address: payloadArr[1],
    firmware_version: payloadArr[2],
    //unknown: payloadArr[3],
    http_connection_id: payloadArr[4],
    duty_cycle: parseInt(payloadArr[5], 16),
    free_memory_slots: parseInt(payloadArr[6], 16),
    cube_date: 2000 + parseInt(payloadArr[7].substr(0, 2), 16) + '-' + parseInt(payloadArr[7].substr(2, 2), 16) + '-' + parseInt(payloadArr[7].substr(4, 2), 16),
    cube_time: parseInt(payloadArr[8].substr(0, 2), 16) + ':' + parseInt(payloadArr[8].substr(2, 2), 16) ,
    state_cube_time: payloadArr[9],
    ntp_counter: payloadArr[10],
  };

  this.dutyCycle = dataObj.duty_cycle;
  this.memorySlots = dataObj.free_memory_slots;

  return dataObj;
}

function parseCommandMetadata (payload) {
  var payloadArr = payload.split(",");

  var decodedPayload = new Buffer(payloadArr[2], 'base64');
  var room_count = parseInt(decodedPayload[2].toString(10));
  var currentIndex = 3;

  // parse rooms
  for (var i = 0; i < room_count; i++) {
    var room_id = parseInt(decodedPayload[currentIndex].toString(10));
    var room_name_length = parseInt(decodedPayload[currentIndex + 1].toString(10));
    var room_name = decodedPayload.slice(currentIndex + 2, currentIndex + 2 + room_name_length).toString('utf-8');
    var group_rf_address = decodedPayload.slice(currentIndex + 2 + room_name_length, currentIndex + room_name_length + 5).toString('hex');

    var roomData = {
      room_id: room_id,
      room_name: room_name,
      group_rf_address: group_rf_address
    };
    this.rooms.push(roomData);

    currentIndex = currentIndex + room_name_length + 5;
  };

  // parse devices
  if (currentIndex < decodedPayload.length) {
    var device_count = parseInt(decodedPayload[currentIndex].toString(10));
    for (var i = 0; i < device_count; i++) {
      var devicetype = parseInt(decodedPayload[currentIndex + 1].toString(10));
      var rf_address = decodedPayload.slice(currentIndex + 2, currentIndex + 5).toString('hex');
      var serialnumber = decodedPayload.slice(currentIndex + 5, currentIndex + 15).toString();
      var device_name_length = parseInt(decodedPayload[currentIndex + 15].toString(10));
      var device_name = decodedPayload.slice(currentIndex + 16, currentIndex + 16 + device_name_length).toString('utf-8');
      var room_id = parseInt(decodedPayload[currentIndex + 16 + device_name_length].toString(10));

      var deviceData = {
        devicetype: devicetype,
        rf_address: rf_address,
        serialnumber: serialnumber,
        device_name_length: device_name_length,
        device_name: device_name,
        room_id: room_id,
      };
      this.devices.push(deviceData);

      currentIndex = currentIndex + 17 + device_name_length;
    }
  }
}

function parseCommandDeviceList (payload) {
  var decodedPayload = new Buffer(payload, 'base64');

  var dataObj = {
    rf_address: decodedPayload.slice(1, 4).toString('hex'),
    valve: decodedPayload[7],
    temp: parseInt(decodedPayload[9].toString(2) + decodedPayload[10].toString(2), 2) / 10,
    setpoint: (decodedPayload[8] / 2)
  };

  // cache status
  if (dataObj.temp !== 0) {
    this.devices[dataObj.rf_address] = dataObj;
    this.devices[dataObj.rf_address].lastUpdate = new Date();
  }

  return dataObj;
}

function parseCommandSendDevice (payload) {
  var payloadArr = payload.split(",");

  var dataObj = {
    accepted: payloadArr[1] == '1',
    duty_cycle: parseInt(payloadArr[0], 16),
    free_memory_slots: parseInt(payloadArr[2], 16)
  };

  return dataObj;
}

function setTemperature (rfAdress, mode, temperature) {
  if (!this.isConnected) {
    log('Not connected');
    return;
  }

  var self = this;
  var callback = function (dataObj) {
    self.dutyCycle = dataObj.duty_cycle;
    self.memorySlots = dataObj.free_memory_slots;
    log('Duty cycle %: ' + this.dutyCycle + ', Free memory slots: ' + this.memorySlots);
  }

  // 00 = Auto weekprog (no temp is needed, just make the whole byte 00)
  // 01 = Permanent
  // 10 = Temporarily
  var modeBin;
  switch (mode) {
    case 'auto':
    modeBin = '00';
    break;
    case 'manual':
    modeBin = '01';
    break;
    case 'boost':
    modeBin = '10';
    break;
    default:
    log('Unknown mode: ' + mode);
    return false;
  }

  if (modeBin == '00') {
    var reqTempHex = (0).toString(16);
  } else {
    // leading zero padding
    var reqTempBinary = modeBin + ("000000" + (temperature * 2).toString(2)).substr(-6);
    // to hex string
    var reqTempHex = parseInt(reqTempBinary, 2).toString(16);
  }

  var payload = new Buffer('000440000000' + rfAdress + '01' + reqTempHex, 'hex').toString('base64');
  var data = 's:' + payload + '\r\n';
  send.call(this, data, callback);

  log('Data sent: ' + data);
};

function doHeartbeat (callback) {
  var self = this;
  if (!this.isConnected) {
    this.client.connect(this.port, this.ip, function() {
      log('Connected');
      self.isConnected = true;
    });
  } else {
    send.call(self, 'l:\r\n', callback);
  }
}

function log (message) {
  fs.appendFile('log_maxcube.txt', '[' + moment().format() + '] ' + message + "\n");
}


module.exports = MaxCube;