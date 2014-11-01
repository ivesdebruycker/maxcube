maxcube
=======

eQ-3 Max! Cube interface


## Example
```
var MaxCube = require('maxcube');

var myMaxCube = new MaxCube('192.168.1.123', '62910');

setTimeout(function() {
  console.log(myMaxCube.getDevices());
  console.log(myMaxCube.getRooms());
}, 20000);
```
