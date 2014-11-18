var net = require('net');
var schedule = require('node-schedule');
var moment = require('moment');
var fs = require('fs');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var updateIntervalMins = 15;
var heartbeatIntervalSecs = 20;

function padLeft(nr, n, str){
  return Array(n-String(nr).length+1).join(str||'0')+nr;
}

/*  Device type:
0       Cube
1       Heating Thermostat
2       Heating Thermostat Plus
3       Wall mounted Thermostat
4       Shutter contact
5       Push Button   
*/
var EQ3MAX_DEV_TYPE_CUBE = 0;
var EQ3MAX_DEV_TYPE_THERMOSTAT = 1;
var EQ3MAX_DEV_TYPE_THERMOSTAT_PLUS = 2;
var EQ3MAX_DEV_TYPE_WALLTHERMOSTAT = 3;
var EQ3MAX_DEV_TYPE_SHUTTER_CONTACT = 4;
var EQ3MAX_DEV_TYPE_PUSH_BUTTON = 5;

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
  this.devices = {};
  this.devicesStatus = {};

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
    var offset = 0;
    Object.keys(self.devices).forEach(function(rf_address) {
      if (self.devices[rf_address] !== undefined && self.devices[rf_address].devicetype === 1) {
        // TODO: better not use anonymous function? (http://stackoverflow.com/a/5226333)
        (function(rf_address) {
          setTimeout(function() {
            var temp = self.devicesStatus[rf_address] ? self.devicesStatus[rf_address].setpoint_user + 0.5 : 1.5;
            log('Update trigger ' + rf_address);
            setTemperature.call(self, rf_address, 'MANUAL', temp);
          }, offset++ * 15000);
        })(rf_address);
      }
    });
  });

  var ruleUpdateTriggerReset = new schedule.RecurrenceRule();
  ruleUpdateTriggerReset.minute = [new schedule.Range(10, 60, 15)];
  var updateTriggerResetJob = schedule.scheduleJob(ruleUpdateTriggerReset, function(){
    var offset = 0;
    Object.keys(self.devices).forEach(function(rf_address) {
      if (self.devices[rf_address] !== undefined && self.devices[rf_address].devicetype === 1) {
        (function(rf_address) {
          setTimeout(function() {
            var temp = self.devicesStatus[rf_address] ? self.devicesStatus[rf_address].setpoint_user : 1;
            log('Update trigger reset ' + rf_address);
            setTemperature.call(self, rf_address, 'MANUAL', temp);
          }, offset * 15000);
        })(rf_address);
      }
    });
  });

  var ruleHeartbeat = new schedule.RecurrenceRule();
  ruleHeartbeat.second = [new schedule.Range(heartbeatIntervalSecs/2, 59, heartbeatIntervalSecs)];
  var heartbeatJob = schedule.scheduleJob(ruleHeartbeat, function(){
    log('Heartbeat');
    doHeartbeat.call(self, function (dataObj) {});
  });

  log('MaxCube initialized');

}

util.inherits(MaxCube, EventEmitter);

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
MaxCube.prototype.setTemperature = function(rf_address, temperature) {
  this.devicesStatus[rf_address].setpoint_user = temperature;
  return setTemperature.call(this, rf_address, 'MANUAL', temperature);
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

  this.emit('connected', dataObj);

  return dataObj;
}

function parseCommandMetadata (payload) {
  var payloadArr = payload.split(",");

  var decodedPayload = new Buffer(payloadArr[2], 'base64');
  var room_count = decodedPayload[2];
  var currentIndex = 3;

  // parse rooms
  for (var i = 0; i < room_count; i++) {
    var room_id = decodedPayload[currentIndex];
    var room_name_length = decodedPayload[currentIndex + 1];
    var room_name = String.fromCharCode.apply(null, decodedPayload.slice(currentIndex + 2, currentIndex + 2 + room_name_length));
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
    var device_count = decodedPayload[currentIndex];
    for (var i = 0; i < device_count; i++) {
      var devicetype = decodedPayload[currentIndex + 1];
      var rf_address = decodedPayload.slice(currentIndex + 2, currentIndex + 5).toString('hex');
      var serialnumber = decodedPayload.slice(currentIndex + 5, currentIndex + 15).toString();
      var device_name_length = decodedPayload[currentIndex + 15];
      var device_name = String.fromCharCode.apply(null, decodedPayload.slice(currentIndex + 16, currentIndex + 16 + device_name_length));
      var room_id = decodedPayload[currentIndex + 16 + device_name_length];

      var deviceData = {
        devicetype: devicetype,
        rf_address: rf_address,
        serialnumber: serialnumber,
        device_name: device_name,
        room_id: room_id,
      };
      this.devices[rf_address] = deviceData;

      currentIndex = currentIndex + 16 + device_name_length;
    }
  }

  this.emit('configurationUpdate', {rooms: this.rooms, devices: this.devices});
}

function parseCommandDeviceList (payload) {
  var dataObj = [];
  var decodedPayload = new Buffer(payload, 'base64');

  while(decodedPayload.length > 0) {
	var pllen = decodedPayload[0];

    // get mode
    var mode = 'AUTO';
    if ((decodedPayload[6] & 3) === 3) {
      mode = 'BOOST';
    } else if (decodedPayload[6] & 1) {
      mode = 'MANUAL';
    } else if (decodedPayload[6] & 2) {
      mode = 'VACATION';
    }

    var deviceStatus = {
      rf_address: decodedPayload.slice(1, 4).toString('hex'),
      valve: decodedPayload[7],
      setpoint: (decodedPayload[8] / 2),
      mode: mode,
      /* byte 5 from http://www.domoticaforum.eu/viewtopic.php?f=66&t=6654
5          1  12          bit 4     Valid              0=invalid;1=information provided is valid
                          bit 3     Error              0=no; 1=Error occurred
                          bit 2     Answer             0=an answer to a command,1=not an answer to a command
                          bit 1     Status initialized 0=not initialized, 1=yes
                               
                          12  = 00010010b
                              = Valid, Initialized
*/
      initialized: !!(decodedPayload[5] & (1 << 1)),
      fromCmd: !!(decodedPayload[5] & (1 << 2)),
      error: !!(decodedPayload[5] & (1 << 3)),
      valid: !!(decodedPayload[5] & (1 << 4)),
      dst_active: !!(decodedPayload[6] & 8),
      gateway_known: !!(decodedPayload[6] & 16),
      panel_locked: !!(decodedPayload[6] & 32),
      link_error: !!(decodedPayload[6] & 64),
      battery_low: !!(decodedPayload[6] & 128)
    };

    if (mode === 'VACATION') {
    // from http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/10_MAX.pm#l573
      deviceStatus.date_until = 2000 + (decodedPayload[10] & 0x3F) + "-" + padLeft(((decodedPayload[9] & 0xE0) >> 4) | (decodedPayload[10] >> 7), 2) + "-" + padLeft(decodedPayload[9] & 0x1F, 2);
      var hours = (decodedPayload[11] & 0x3F) / 2;
      deviceStatus.time_until = ('00' + Math.floor(hours)).substr(-2) + ':' + ((hours % 1) ? "30" : "00");
    } else {
      deviceStatus.temp = (decodedPayload[9]?25.5:0) + decodedPayload[10] / 10;
    }

    // set user setpoint
    if (!this.devicesStatus[deviceStatus.rf_address] || !this.devicesStatus[deviceStatus.rf_address].setpoint_user || Math.abs(this.devicesStatus[deviceStatus.rf_address].setpoint_user - deviceStatus.setpoint) >= 1) {
      deviceStatus.setpoint_user = deviceStatus.setpoint;
      log('new user setpoint for device ' + deviceStatus.rf_address + ' is ' + deviceStatus.setpoint);
    } else {
      // copy old value
      deviceStatus.setpoint_user = this.devicesStatus[deviceStatus.rf_address].setpoint_user;
    }

    // overwrite lastUpdate-timestamp only when temperature received
    if (deviceStatus.temp !== undefined && deviceStatus.temp !== 0) {
      deviceStatus.lastUpdate = moment().format();
    } else if (this.devicesStatus[deviceStatus.rf_address]) {
      deviceStatus.lastUpdate = this.devicesStatus[deviceStatus.rf_address].lastUpdate;
      deviceStatus.temp = this.devicesStatus[deviceStatus.rf_address].temp;
    }

    // cache status
    this.devicesStatus[deviceStatus.rf_address] = deviceStatus;

    dataObj.push(deviceStatus);
    decodedPayload = decodedPayload.slice(pllen+1);
  };

  this.emit('statusUpdate', this.devicesStatus);

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

  log('Set temperature on ' + rfAdress + ' to ' + temperature + ' and mode ' + mode);

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

  var room_id = ("00" + this.devices[rfAdress].room_id).substr(-2);

  var payload = new Buffer('000440000000' + rfAdress + room_id + reqTempHex + date_until + time_until, 'hex').toString('base64');
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
