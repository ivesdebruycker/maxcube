var net = require('net');
var schedule = require('node-schedule');
var moment = require('moment');
var fs = require('fs');

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
  this.devicesStatus = [];

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

  this.client.on('close', function() {
    log('Connection closed');
  });

  var ruleUpdateTrigger = new schedule.RecurrenceRule();
  // run every 15 mins, first time 8 min after hour
  ruleUpdateTrigger.minute = [new schedule.Range(8, 60, 15)];
  var updateTriggerJob = schedule.scheduleJob(ruleUpdateTrigger, function(){
    for (var i = 0; i < self.devices.length; i++) {
      if (self.devices[i] !== undefined && self.devices[i].devicetype === 1) {
        // TODO: better not use anonymous function? (http://stackoverflow.com/a/5226333)
        (function(i) {
          setTimeout(function() {
            log('Update trigger ' + self.devices[i].rf_address);
            setTemperature.call(self, self.devices[i].rf_address, 'MANUAL', 11.5);
          }, i * 15000);
        })(i);
      }
    };
  });

  var ruleUpdateTriggerReset = new schedule.RecurrenceRule();
  ruleUpdateTriggerReset.minute = [new schedule.Range(10, 60, 15)];
  var updateTriggerResetJob = schedule.scheduleJob(ruleUpdateTriggerReset, function(){
    for (var i = 0; i < self.devices.length; i++) {
      if (self.devices[i] !== undefined && self.devices[i].devicetype === 1) {
        (function(i) {
          setTimeout(function() {
            log('Update trigger reset ' + self.devices[i].rf_address);
            setTemperature.call(self, self.devices[i].rf_address, 'MANUAL', 11);
          }, i * 15000);
        })(i);
      }
    };
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
  return this.devicesStatus[rf_address];
};
MaxCube.prototype.getDevices = function() {
  return this.devices;
};
MaxCube.prototype.getRooms = function() {
  return this.rooms;
};
MaxCube.prototype.close = function() {
  this.client.destroy();
};
MaxCube.prototype.doBoost = function(rf_address, temperature) {
  return setTemperature.call(this, rf_address, 'BOOST', temperature);
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
        device_name: device_name,
        room_id: room_id,
      };
      this.devices.push(deviceData);

      currentIndex = currentIndex + 16 + device_name_length;
    }
  }
}

function parseCommandDeviceList (payload) {
  var dataObj = [];
  var decodedPayload = new Buffer(payload, 'base64');
  for (var i = 0; i < this.devices.length; i++) {
    var devicePos = i * 12;

    // get mode
    var mode = 'AUTO';
    if ((decodedPayload[6 + devicePos] & 3) === 3) {
      mode = 'BOOST';
    } else if (decodedPayload[6 + devicePos] & 1) {
      mode = 'MANUAL';
    } else if (decodedPayload[6 + devicePos] & 2) {
      mode = 'VACATION';
    }

    var deviceStatus = {
      rf_address: decodedPayload.slice(1 + devicePos, 4 + devicePos).toString('hex'),
      valve: decodedPayload[7 + devicePos],
      setpoint: (decodedPayload[8 + devicePos] / 2),
      mode: mode,
      dst_active: !!(decodedPayload[6 + devicePos] & 8),
      gateway_known: !!(decodedPayload[6 + devicePos] & 16),
      panel_locked: !!(decodedPayload[6 + devicePos] & 32),
      link_error: !!(decodedPayload[6 + devicePos] & 64),
      battery_low: !!(decodedPayload[6 + devicePos] & 128)
    };

    if (mode === 'VACATION') {
      var hours = parseInt(decodedPayload[11 + devicePos].toString(10)) / 2;
      deviceStatus.time_until = ('00' + Math.floor(hours)).substr(-2) + ':' + ('00' + (hours % 1)).substr(-2);
    } else {
      deviceStatus.temp = parseInt(decodedPayload[9 + devicePos].toString(2) + decodedPayload[10].toString(2), 2) / 10;
    }

    // cache status
    if (deviceStatus.temp !== undefined && deviceStatus.temp !== 0) {
      this.devicesStatus[deviceStatus.rf_address] = deviceStatus;
      this.devicesStatus[deviceStatus.rf_address].lastUpdate = moment().format();
    }
    dataObj.push(deviceStatus);
  };

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

function setTemperature (rfAdress, mode, temperature, untilDate) {
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

  var date_until = '0000';
  var time_until = '00';

  // 00 = Auto weekprog (no temp is needed, just make the whole byte 00)
  // 01 = Permanent
  // 10 = Temporarily
  var modeBin;
  switch (mode) {
    case 'AUTO':
    modeBin = '00';
    break;
    case 'MANUAL':
    modeBin = '01';
    break;
    case 'VACATION':
    modeBin = '10';
    var momentDate = moment(untilDate);
    var year_until = ('0000000' + (momentDate.get('year') - 2000).toString(2)).substr(-7);
    var month_until = ('0000' + momentDate.get('month').toString(2)).substr(-4);
    var day_until = ('00000' + momentDate.get('day').toString(2)).substr(-5);
    date_until = ('0000' + (month_until.substr(0,3) + day_until + month_until.substr(-1) + year_until).toString(16)).substr(-4);
    time_until = ('00' + Math.round((momentDate.get('hour') + (momentDate.get('minute') / 60)) * 2).toString(16)).substr(-2);
    break;
    case 'BOOST':
    modeBin = '11';
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

  var payload = new Buffer('000440000000' + rfAdress + '00' + reqTempHex + date_until + time_until, 'hex').toString('base64');
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