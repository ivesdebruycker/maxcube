# MaxCube2 [![NPM Version](https://img.shields.io/npm/v/maxcube2.svg)](https://www.npmjs.com/package/maxcube2)

eQ-3 Max! Cube interface library for Node.js v2

This is a continuation of the work first started by https://github.com/ivesdebruycker/maxcube

It includes support for window sensors, wall thermostats and schedules in addition to the basic features of the previous version of this library. The API didn't change so it's a drop-in replacement.

## Example
```
var MaxCube = require('maxcube2');
var myMaxCube = new MaxCube('192.168.1.123', 62910);

myMaxCube.on('connected', function () {
  console.log('Connected');

  myMaxCube.getDeviceStatus().then(function (payload) {
    console.log(payload);
    myMaxCube.close();
  });
});

myMaxCube.on('closed', function () {
  console.log('Connection closed');
});
```

## Events
* connected
* closed

## API
### getConnection()
Returns a promise for an active connection.
```
myMaxCube.getConnection().then(function () {
  ..
});
```
### close()
Closes the connection to the Max! Cube immediately (when active).
### getCommStatus()
Returns the last known communication status (duty cycle & free memory slots).
### getDevices()
Returns devices (from cache).
### getDeviceInfo()
Returns device info (from cache).
### getRooms()
Returns room info (from cache).
### getDeviceStatus([rf_address])
Returns a promise with device status of all or specified devices.
```
myMaxCube.getDeviceStatus().then(function (devices) {
  devices.forEach(function (device) {
    var deviceInfo = myMaxCube.getDeviceInfo(device.rf_address);
    console.log(deviceInfo.device_name + ', ' + deviceInfo.room_name);
    console.log(' temperature: ' + device.temp);
    console.log(' setpoint: ' + device.setpoint);
    console.log(' valve: ' + device.valve);
    console.log(' mode: ' + device.mode);
  });
});
```
### setTemperature(rf_address, degrees, (optional) mode, (only for vacation mode) untilDate)
Set setpoint temperature for specified device and returns a promise.

Possible modes are: 'AUTO', 'MANUAL', 'BOOST' and 'VACATION'. If no mode is given, 'MANUAL' is presumed.

Format untilDate as ISO 8601, e.g. 2019-06-20T10:00:00Z.
```
myMaxCube.setTemperature('0dd6b5', 18).then(function (success) {
  if (success) {
    console.log('Temperature set');
  } else {
    console.log('Error setting temperature');
  }
});
```

### setSchedule(rf_address, room_id, weekday, temperaturesArray, timesArray)
Set a schedule for a device.

- weekday:           0=mo,1=tu,..,6=su
- temperaturesArray: [19.5,21,..] degrees Celsius (max 7)
- timesArray:        ['HH:mm',..] 24h format (max 7, same amount as temperatures)
- the first time will be the time (from 00:00 to timesArray[0]) that the first temperature is active. Last possibe time of the day: 00:00
