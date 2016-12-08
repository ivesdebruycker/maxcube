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

  var payload = new Buffer('000440000000' + rfAdress + room_id_padded + reqTempHex + date_until + time_until, 'hex').toString('base64');
  var data = 's:' + payload + '\r\n';

  return data;
}

function padLeft(data, totalLength){
  return Array(totalLength - String(data).length + 1).join('0') + data;
}

module.exports = {
  generateSetTemperatureCommand: generateSetTemperatureCommand
};
