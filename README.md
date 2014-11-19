maxcube
=======

eQ-3 Max! Cube interface


## Example
```
var MaxCube = require('maxcube');

var myMaxCube = new MaxCube('192.168.1.123', '62910');

myMaxCube.once('connected', function (cubeStatus) {
  console.log(cubeStatus);
});

myMaxCube.once('metadataUpdate', function (metadata) {
  console.log(metadata);
});

myMaxCube.on('configurationUpdate', function (configuration) {
  console.log(configuration);
});

myMaxCube.on('statusUpdate', function (devicesStatus) {
  console.log(devicesStatus);
});
```
