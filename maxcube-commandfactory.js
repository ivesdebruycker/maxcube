var moment = require('moment');

function generateSetTemperatureCommand (rfAdress, room_id, mode, temperature, untilDate) {
  var date_until = '0000';
  var time_until = '00';

  // 00 = Auto weekprog (no temp is needed, just make the whole byte 00)
  // 01 = Permanent
  // 10 = Temporarily
  var modeBin;
  switch (mode) {
    case 'AUTO': {
      modeBin = '00';
      break;
    }
    case 'MANUAL': {
      modeBin = '01';
      break;
    }
    case 'VACATION': {
      modeBin = '10';
      var momentDate = moment(untilDate);
      var year_until = padLeft((momentDate.get('year') - 2000).toString(2), 7);
      var month_until = padLeft((momentDate.get('month')).toString(2), 4);
      var day_until = padLeft(momentDate.get('date').toString(2), 5);
      date_until = padLeft(parseInt((month_until.substr(0,3) + day_until + month_until.substr(-1) + year_until), 2).toString(16), 4);
      time_until = padLeft(Math.round((momentDate.get('hour') + (momentDate.get('minute') / 60)) * 2).toString(16), 2);
      break;
    }
    case 'BOOST': {
      modeBin = '11';
      break;
    }
    default: {
      console.error('Unknown mode: ' + mode);
      return false;
    }
  }

  // leading zero padding
  var reqTempBinary = modeBin + padLeft(((temperature || 0) * 2).toString(2), 6);
  // to hex string
  var reqTempHex = padLeft(parseInt(reqTempBinary, 2).toString(16), 2);

  // '00' sets all temperature for all devices
  var room_id_padded = padLeft(room_id, 2);
  var hexString = '000440000000' + rfAdress + room_id_padded + reqTempHex + date_until + time_until;

  var payload = new Buffer(hexString, 'hex').toString('base64');
  var data = 's:' + payload + '\r\n';

  return data;
}

// Source: https://github.com/Bouni/max-cube-protocol/blob/master/S-Message.md

// Description        Length      Example Value
// =====================================================================
// Base String        6           000410000000
// RF Address         3           0FC380
// Room Nr            1           01
// Day of week        1           02
// Temp and Time      2           4049
// Temp and Time (2)  2           4c6e
// Temp and Time (3)  2           40cb
// Temp and Time (4)  2           4d20
// Temp and Time (5)  2           4d20
// Temp and Time (6)  2           4d20
// Temp and Time (7)  2           4d02

// Day of week
// =====================================================================
// hex:  |    02     |
// dual: | 0000 0010 |
//              ||||
//              |+++-- day: 000: saturday
//              |           001: sunday
//              |           010: monday
//              |           011: tuesday
//              |           100: wednesday
//              |           101: thursday
//              |           110: friday
//              |
//              +----- telegram: 1: set
//                               0: not set
// The meaning of telegram is unclear at the moment.

// Temperature and Time
// =====================================================================
// hex:  |    40     |    49     |
// dual: | 0100 0000 | 0100 1001 |
//         |||| ||||   |||| |||| 
//         |||| |||+---++++-++++-- Time: 0 0100 1001: 06:05
//         |||| |||
//         |||| |||+-------------- Temperature: 0100 000: 16
// This 16 bit word contains the temperature on the 7 MSB and Time until that temperature is set on the 9 LSB. Temperature value has to be divided by 2.
// 20 (hex) =  32 (decimal) -> 32/2 = 16
//
// Time is the value * 5 minutes since midnight.
// 49 (hex)   = 73 (decimal) -> 73*5 = 365 -> 6:05
// 4d02 (hex) = 21:00, 19 deg

function generateSetDayProgramCommand (rfAdress, room_id, weekday, temperaturesArray, timesArray) {

  // weekday:     0=mo,1=tu,..,6=su
  // tempertures: [19.5,21,..] degrees Celsius (max 7)
  // times:       ['HH:mm',..] 24h format (max 7, same amount as temperatures)
  
  var dayArr = ['010','011','100','101','110','000','001']; // mo - su
  var dayBin = dayArr[weekday];
  var reqDayBin = padLeft(dayBin, 8);
  var reqDayHex = parseInt(reqDayBin, 2).toString(16);
  
  var hexTempTimeArr = [];
  for (var i = 0; i < temperaturesArray.length; i++) 
  {
    if (i < 6 || i == temperaturesArray.length-1) // max: 7, take 6 first and last
    {
      var temp = temperaturesArray[i];
      if (i < temperaturesArray.length-1 && temp == temperaturesArray[i+1])
      {
        // temperature is the same as in the next time, so only set change @ the next time
      }
      else
      {
        var time = timesArray[i].split(':');
        var mins = ( parseInt(time[0]) * 60 + parseInt(time[1]) );
        var temB = padLeft(((temp || 0) * 2).toString(2), 7);
        var timB = padLeft(Math.round(mins / 5).toString(2), 9);
        var bin  = temB + timB;
        var hex  = parseInt(bin, 2).toString(16);

        hexTempTimeArr.push(hex);
      }
    }
  }
  // to hex string
  var reqTempTimeHex = hexTempTimeArr.join('');
  var room_id_padded = padLeft(room_id.toString(16), 2);
  var req_day_padded = padLeft(reqDayHex, 2);
  var hexString      = '000410000000' + rfAdress + room_id_padded + req_day_padded + reqTempTimeHex;
  var payload        = new Buffer(hexString, 'hex').toString('base64');
  var data           = 's:' + payload + '\r\n';

  return data;
}

function padLeft(data, totalLength){
  return Array(totalLength - String(data).length + 1).join('0') + data;
}

module.exports = {
  generateSetTemperatureCommand: generateSetTemperatureCommand,
  generateSetDayProgramCommand: generateSetDayProgramCommand
};
