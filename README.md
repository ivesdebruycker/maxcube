# MaxCube2 [![NPM Version](https://img.shields.io/npm/v/maxcube2.svg)](https://www.npmjs.com/package/maxcube2)

eQ-3 Max! Cube interface library for homebridge-platform-maxcube

This is a fork of the work first started by https://github.com/ivesdebruycker/maxcube

## Introduction
### History
Why this library is called maxcube_2_? Because the maxcube project seemed to be dead without response to issues or PRs for over half a year and I needed it fixed for my homebridge plugin. So I finally decided to continue its legacy as "maxcube2" but then it suddenly got revived. Now I won't change the name of this library anymore and keep this fork for the homebridge-platform-maxcube project - still as a proper merge-able fork of maxcube however.

### Changes from maxcube
- More events (error, device_list etc.)
- Getting device configurations (min/max/eco/comfort temperatures etc.)

The old API didn't change currently so it's a drop-in replacement.

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
* error
* hello (arg = hello object)
* meta_data (arg = meta data object)
* device_list (arg = list of devices)
* configuration (arg = configuration object for a single device)

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
