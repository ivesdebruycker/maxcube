maxcube
=======

eQ-3 Max! Cube interface


## Example
```
var MaxCube = require('maxcube');
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
### setTemperature(rf_address, degrees)
Set setpoint temperature for specified device and returns a promise.
```
myMaxCube.setTemperature('0dd6b5', 18).then(function (success) {
  if (success) {
    console.log('Temperature set');
  } else {
    console.log('Error setting temperature');
  }
});
```