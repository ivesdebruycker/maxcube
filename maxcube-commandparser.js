// Device types
var EQ3MAX_DEV_TYPE_CUBE = 0;
var EQ3MAX_DEV_TYPE_THERMOSTAT = 1;
var EQ3MAX_DEV_TYPE_THERMOSTAT_PLUS = 2;
var EQ3MAX_DEV_TYPE_WALLTHERMOSTAT = 3;
var EQ3MAX_DEV_TYPE_SHUTTER_CONTACT = 4;
var EQ3MAX_DEV_TYPE_PUSH_BUTTON = 5;
var EQ3MAX_DEV_TYPE_WINDOW_SWITCH = 6;
var EQ3MAX_DEV_TYPE_UNKNOWN = 99;

const StringDecoder = require('string_decoder').StringDecoder;
const stringDecoder = new StringDecoder('utf8');

function parse (commandType, payload) {
  switch (commandType) {
    case 'H':
      return parseCommandHello.call(this, payload);
      break;
    case 'M':
      return parseCommandMetadata.call(this, payload);
      break;
    case 'C':
      return parseCommandConfiguration.call(this, payload);
      break;
    case 'L':
      return parseCommandDeviceList.call(this, payload);
      break;
    case 'S':
      return parseCommandSendDevice.call(this, payload);
      break;
    case 'A':
      return parseCommandAcknowledge.call(this, payload);
      break;
    default:
      console.error('Unknown command type: ' + commandType);
  }
}

var decodeStringPayload = function (charArray) {
  return stringDecoder.write(Buffer.from(charArray));
};

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

  return dataObj;
}

function parseCommandMetadata (payload) {
  var payloadArr = payload.split(",");

  var decodedPayload = new Buffer(payloadArr[2], 'base64');
  var room_count = decodedPayload[2];
  var currentIndex = 3;

  var rooms = {};
  var devices = {};

  // parse rooms
  for (var i = 0; i < room_count; i++) {
    var room_id = decodedPayload[currentIndex];
    var room_name_length = decodedPayload[currentIndex + 1];
    var room_name = decodeStringPayload(decodedPayload.slice(currentIndex + 2, currentIndex + 2 + room_name_length));
    var group_rf_address = decodedPayload.slice(currentIndex + 2 + room_name_length, currentIndex + room_name_length + 5).toString('hex');

    var roomData = {
      room_id: room_id,
      room_name: room_name,
      group_rf_address: group_rf_address
    };
    rooms[room_id] = roomData;

    currentIndex = currentIndex + room_name_length + 5;
  };

  // parse devices
  if (currentIndex < decodedPayload.length) {
    var device_count = decodedPayload[currentIndex];
    for (var i = 0; i < device_count; i++) {
      var device_type = decodedPayload[currentIndex + 1];
      var rf_address = decodedPayload.slice(currentIndex + 2, currentIndex + 5).toString('hex');
      var serialnumber = decodedPayload.slice(currentIndex + 5, currentIndex + 15).toString();
      var device_name_length = decodedPayload[currentIndex + 15];
      var device_name = decodeStringPayload(decodedPayload.slice(currentIndex + 16, currentIndex + 16 + device_name_length));
      var room_id = decodedPayload[currentIndex + 16 + device_name_length];

      var deviceData = {
        device_type: device_type,
        rf_address: rf_address,
        serialnumber: serialnumber,
        device_name: device_name,
        room_id: room_id,
      };
      devices[rf_address] = deviceData;

      currentIndex = currentIndex + 16 + device_name_length;
    }
  }

  return { rooms: rooms, devices: devices };
}

function parseCommandConfiguration (payload) {
  /*
  Start Length  Value       Description
  ==================================================================
  00         1  D2          Length of data: D2 = 210(decimal) = 210 bytes
  01         3  003508      RF address
  04         1  01          Device Type
  05         3  0114FF      ?
  08        10  IEQ0109125  Serial Number
  18         1  28          Comfort Temperature
  19         1  28          Eco Temperature
  20         1  3D          MaxSetPointTemperature
  21         1  09          MinSetPointTemperature
  22         1  07          Temperature Offset * 2
                            The default value is 3,5, which means the offset = 0 degrees.
                            The offset is adjustable between -3,5 and +3,5 degrees,
                            which results in a value in this response between 0 and 7 (decoded already)
  23         1  28          Window Open Temperature
  24         1  03          Window  Open Duration
  25         1  30          Boost Duration and Boost Valve Value
                            The 3 MSB bits gives the duration, the 5 LSB bits the Valve Value%.
                            Duration: With 3 bits, the possible values (Dec) are 0 to 7, 0 is not used.
                            The duration in Minutes is: if Dec value = 7, then 30 minutes, else Dec value * 5 minutes
                            Valve Value: dec value 5 LSB bits * 5 gives Valve Value in %
  26         1  0C          Decalcification: Day of week and Time
                            In bits: DDDHHHHH
                            The three most significant bits (MSB) are presenting the day, Saturday = 1, Friday = 7
                            The five least significant bits (LSB) are presenting the time (in hours)
  27         1  FF          Maximum Valve setting; *(100/255) to get in %
  1C         1  00          Valve Offset ; *(100/255) to get in %
  1D         ?  44 48 ...   Weekly program (see The weekly program)
  */

  var payloadArr = payload.split(",");
  var rf_address = payloadArr[0].slice(0, 6).toString('hex');

  var decodedPayload = new Buffer(payloadArr[1], 'base64');
  var length = decodedPayload[0];

  var dataObj = {
    rf_address: decodedPayload.slice(1, 4).toString('hex'),
    device_type: decodedPayload[4],
    serial_number: String.fromCharCode.apply(null, decodedPayload.slice(8, 18)),
    comfort_temp: decodedPayload[18] / 2,
    eco_temp: decodedPayload[19] / 2,
    max_setpoint_temp: decodedPayload[20] / 2,
    min_setpoint_temp: decodedPayload[21] / 2,
    temp_offset: (decodedPayload[22] / 2) - 3.5,
    max_valve: decodedPayload[27] * (100/255)
  };

  return dataObj;
}

function parseCommandDeviceList (payload) {
  var dataObj = [];
  var decodedPayload = new Buffer(payload, 'base64');

  while (decodedPayload.length > 0) {
    if (decodedPayload.length >= decodedPayload[0]) {
      var rf_address = decodedPayload.slice(1, 4).toString('hex');

      var deviceStatus = decodeDevice.call(this, decodedPayload);
      dataObj.push(deviceStatus);

      decodedPayload = decodedPayload.slice(decodedPayload[0] + 1);
    }
  };

  return dataObj;
}

function parseCommandSendDevice (payload) {
  var payloadArr = payload.split(",");

  var dataObj = {
    accepted: payloadArr[1] === '0',
    duty_cycle: parseInt(payloadArr[0], 16),
    free_memory_slots: parseInt(payloadArr[2], 16)
  };

  return dataObj;
}

function parseCommandAcknowledge () {
  return true;
}

function decodeDevice (payload) {
  var deviceStatus = {};
  var deviceType = undefined;
  switch (payload[0]) {
    case 6: deviceType = EQ3MAX_DEV_TYPE_WINDOW_SWITCH; deviceStatus = decodeDeviceWindowSwitch (payload); break;
    case 8: deviceType = EQ3MAX_DEV_TYPE_PUSH_BUTTON; break;
    case 11: deviceType = EQ3MAX_DEV_TYPE_THERMOSTAT; deviceStatus = decodeDeviceThermostat (payload); break;
    case 12: deviceType = EQ3MAX_DEV_TYPE_WALLTHERMOSTAT; deviceStatus = decodeDeviceWallThermostat (payload); break;
    default: deviceType = EQ3MAX_DEV_TYPE_UNKNOWN; break;
  }

  deviceStatus.rf_address = payload.slice(1, 4).toString('hex');

  return deviceStatus;
}

function decodeDeviceWindowSwitch (payload) {
  /*
    According to https://github.com/Bouni/max-cube-protocol/blob/master/L-Message.md the information about
    the window status is mapped in the lowest two bits in the flag word.
  */
  var open = false;

  if ((payload[6] & (1 << 1)) > 0) {
    open = true;
  }

  var deviceStatus = {
    rf_address: payload.slice(1, 4).toString('hex'),
    open: open,
  };
  return deviceStatus;
}

function decodeDeviceThermostat (payload) {
  /*
    source: http://www.domoticaforum.eu/viewtopic.php?f=66&t=6654
    Start Length  Value       Description
    ==================================================================
    0        1    0B          Length of data: 0B = 11(decimal) = 11 bytes
    1        3    003508      RF address
    4        1    00          ?
    5        1    12          bit 4     Valid              0=invalid;1=information provided is valid
                              bit 3     Error              0=no; 1=Error occurred
                              bit 2     Answer             0=an answer to a command,1=not an answer to a command
                              bit 1     Status initialized 0=not initialized, 1=yes

                              12  = 00010010b
                                  = Valid, Initialized

    6       1     1A          bit 7     Battery       1=Low
                              bit 6     Linkstatus    0=OK,1=error
                              bit 5     Panel         0=unlocked,1=locked
                              bit 4     Gateway       0=unknown,1=known
                              bit 3     DST setting   0=inactive,1=active
                              bit 2     Not used
                              bit 1,0   Mode         00=auto/week schedule
                                                     01=Manual
                                                     10=Vacation
                                                     11=Boost
                              1A  = 00011010b
                                  = Battery OK, Linkstatus OK, Panel unlocked, Gateway known, DST active, Mode Vacation.

    7       1     20          Valve position in %
    8       1     2C          Temperature setpoint, 2Ch = 44d; 44/2=22 deg. C
    9       2     858B        Date until (05-09-2011) (see Encoding/Decoding date/time)
    B       1     2E          Time until (23:00) (see Encoding/Decoding date/time)
    */

    var mode = 'AUTO';
    if ((payload[6] & 3) === 3) {
      mode = 'BOOST';
    } else if (payload[6] & (1 << 0)) {
      mode = 'MANUAL';
    } else if (payload[6] & (1 << 1)) {
      mode = 'VACATION';
    }

    var deviceStatus = {
      rf_address: payload.slice(1, 4).toString('hex'),
      initialized: !!(payload[5] & (1 << 1)),
      fromCmd: !!(payload[5] & (1 << 2)),
      error: !!(payload[5] & (1 << 3)),
      valid: !!(payload[5] & (1 << 4)),
      mode: mode,
      dst_active: !!(payload[6] & (1 << 3)),
      gateway_known: !!(payload[6] & (1 << 4)),
      panel_locked: !!(payload[6] & (1 << 5)),
      link_error: !!(payload[6] & (1 << 6)),
      battery_low: !!(payload[6] & (1 << 7)),
      valve: payload[7],
      setpoint: (payload[8] / 2)
    };

    if (mode === 'VACATION') {
    // from http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/10_MAX.pm#l573
      deviceStatus.date_until = 2000 + (payload[10] & 0x3F) + "-" + ("00" + (((payload[9] & 0xE0) >> 4) | (payload[10] >> 7))).substr(-2) + "-" + ("00" + (payload[9] & 0x1F)).substr(-2);
      var hours = (payload[11] & 0x3F) / 2;
      deviceStatus.time_until = ('00' + Math.floor(hours)).substr(-2) + ':' + ((hours % 1) ? "30" : "00");
    } else {
      deviceStatus.temp = (payload[9]?25.5:0) + payload[10] / 10;
    }

    return deviceStatus;
}

function decodeDeviceWallThermostat (payload) {

  //regular device parsing
  var deviceStatus = decodeDeviceThermostat (payload);

  //wall thermostat has different temp and setpoint parsing:
  //https://github.com/Bouni/max-cube-protocol/blob/master/L-Message.md#actual-temperature-wallmountedthermostat

  /*
  Actual Temperature (WallMountedThermostat)

  11      Actual Temperature  1           219
  Room temperature measured by the wall mounted thermostat in °C * 10. For example 0xDB = 219 = 21.9°C The temperature is represented by 9 bits; the 9th bit is available as the top bit at offset 8

  offset|      8    | ... |     12    |
  hex   |     B2    |     |     24    |
  binary| 1011 0010 | ... | 0010 0100 |
          | || ||||         |||| ||||
          | ++-++++--------------------- temperature (°C*2):            110010 = 25.0°C
          |                 |||| ||||
          +-----------------++++-++++--- actual temperature (°C*10): 100100100 = 29.2°C

  */

  //offset 8 binary to extract only needed bit
  var off8Bin= (payload[8] >>> 0).toString(2);

  //offset8 without top bit (it is used by actual temperature and will corrupt the setpoint value)
  var setPoint = parseInt(((off8Bin + '').substring(1)).replace(/[^01]/gi, ''), 2);
  //C/2
  deviceStatus.setpoint = setPoint / 2;

  //get the TopBit and zero fill right to use it as 9 bit of offset 12
  var off8TopBit =  parseInt(off8Bin.substring(0,1)) << 8;
  //Bitwise OR offset 8/offset 12 and finally C/10 to read the actual temperature
  deviceStatus.temp = (parseInt(off8TopBit) | parseInt(payload[12])) / 10;

  return deviceStatus;
}

exports.parse = parse;
