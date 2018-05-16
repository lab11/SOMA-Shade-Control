#!/usr/bin/env node

var debug = require('debug')('SOMA-Shade-Control');
var fs     = require('fs');
var util   = require('util');
var noble = require('noble');

//battery
var BATTERY_SERVICE_UUID = "180f".toLowerCase()
var BATTERY_CHARACTERISTIC_UUID = "2a19".toLowerCase()

//motor control
var MOTOR_SERVICE_UUID = "00001861B87F490C92CB11BA5EA5167C".toLowerCase()
var MOTOR_STATE_CHARACTERISTIC_UUID = "00001525B87F490C92CB11BA5EA5167C".toLowerCase()
var MOTOR_CONTROL_CHARACTERISTIC_UUID = "00001530B87F490C92CB11BA5EA5167C".toLowerCase()
var MOTOR_TARGET_CHARACTERISTIC_UUID = "00001526B87F490C92CB11BA5EA5167C".toLowerCase()
var MOTOR_MOVE_UP = 0x69
var MOTOR_STOP = 0x50
var MOTOR_MOVE_DOWN = 0x96

var soma = function (MACList, ready_callback) {

  this._mac_addresses = {};
  this._current_peripheral = '';
  this._ready_callback = ready_callback;
  this._num_macs = MACList.length;

  for(var i = 0; i < MACList.length; i++) {
    this._mac_addresses[MACList[i].toLowerCase()] = {};
  }


  debug('Creating new SOMA shade object');

  noble.on('discover', this.on_discover.bind(this));
  noble.on('scanChanged', this.on_scan_changed.bind(this));
  noble.on('disconnect', this.on_disconnect.bind(this));

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([], false);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };

  startScanningOnPowerOn();
  setTimeout(this.readyTimeout.bind(this), 20000);
};

soma.prototype.readyTimeout = function() {
  debug('Called ready timeout');
  if(this._ready_callback != null) {
    debug('Has not occurred - throwing error');
    this._ready_callback('TimeoutError');
    this._ready_callback  = null;
  } else {
    return;
  }
}

// Handle the callback when scanning parameters change out from beneath us.
// This gives us the ability to set them back to how we want them.
soma.prototype.on_scan_changed = function (enable, filter_dups) {
  try {
    noble.startScanning([], false);
  } catch (e) { }
};

soma.prototype.on_discover = function (peripheral) {
  debug(peripheral.address);
  if(this._mac_addresses[peripheral.address]) {
    //connect to this peripheral
    debug('Connecting to ' + peripheral.address);
    this._mac_addresses[peripheral.address]['peripheral'] = peripheral;
    this._current_peripheral = peripheral.address;
    var that = this;

    peripheral.once('disconnect',this.on_disconnect.bind(this));
    peripheral.connect(function (error) {
      noble.startScanning([], false);

      if(error) {
        debug(error);
      }

      if(peripheral.state == 'connected') {
        peripheral.discoverServices([BATTERY_SERVICE_UUID, MOTOR_SERVICE_UUID], function(error, services) {
          if(error) {
            debug(error);
          }

          if(services.length != 2) {
            debug('Wrong number of services');
          }

          if(peripheral.state == 'connected') {
            services[0].discoverCharacteristics([BATTERY_CHARACTERISTIC_UUID], function(error,chars) {
              if(error) {
                noble.startScanning([], false);
                debug(error);
              }
              that._mac_addresses[peripheral.address].battery_char = chars[0];
            });

            services[1].discoverCharacteristics([MOTOR_STATE_CHARACTERISTIC_UUID,MOTOR_CONTROL_CHARACTERISTIC_UUID,MOTOR_TARGET_CHARACTERISTIC_UUID], function(error,chars) {
              if(error) {
                debug(error);
              }

              that._mac_addresses[peripheral.address].motor_state_char = chars[0];
              that._mac_addresses[peripheral.address].motor_target_char = chars[1];
              that._mac_addresses[peripheral.address].motor_control_char = chars[2];

              var discovered = 0;
              for(var periph in noble._peripherals) {
                if(noble._peripherals[periph].services != null) {
                  discovered += 1;
                }
              }
              if(discovered >= that._num_macs) {
                if(that._ready_callback != null) {
                  debug('Calling ready callback from discovery');
                  debug(that);
                  that._ready_callback();
                  that._ready_callback = null;
                }
              }
            });

            debug('Finished service discovery for ' +  peripheral.address);
          }

        });
      }
    });
  }
};

soma.prototype.on_disconnect = function(error) {
  debug('Disconnected');
};

soma.prototype.get_battery = function(mac, callback) {
  if(!this._mac_addresses[mac.toLowerCase()].battery_char) {
    callback('DoesNotExist', null);
  }

  this._mac_addresses[mac.toLowerCase()].battery_char.read(function(error, data) {
    if(error) {
      debug(error)
    }

    callback(error, data[0]);
  });

}

soma.prototype.get_position = function(mac, callback) {
  if(!this._mac_addresses[mac.toLowerCase()].motor_state_char) {
    callback('DoesNotExist', null);
  }

  this._mac_addresses[mac.toLowerCase()].motor_state_char.read(function(error, data) {
    if(error) {
      debug(error)
    }

    callback(error, data[0]);
  });
}

soma.prototype.set_position = function(mac, position, callback) {
  if(!this._mac_addresses[mac.toLowerCase()].motor_target_char) {
    callback('DoesNotExist');
  }

  this._mac_addresses[mac.toLowerCase()].motor_target_char.write(new Buffer([position]), false, function(error) {
    if(error) {
      debug(error)
    }

    callback(error);
  });
}

soma.prototype.move_up = function(mac, callback) {
  if(!this._mac_addresses[mac.toLowerCase()].motor_control_char) {
    callback('DoesNotExist');
  }

  this._mac_addresses[mac.toLowerCase()].motor_control_char.write(new Buffer([MOTOR_MOVE_UP]), false, function(error) {
    if(error) {
      debug(error)
    }

    callback(error);
  });
}

soma.prototype.move_down = function(mac, callback) {
  if(!this._mac_addresses[mac.toLowerCase()].motor_control_char) {
    callback('DoesNotExist');
  }

  this._mac_addresses[mac.toLowerCase()].motor_control_char.write(new Buffer([MOTOR_MOVE_DOWN]), false, function(error) {
    if(error) {
      debug(error)
    }

    callback(error);
  });
}

soma.prototype.stop = function(mac, callback) {
  if(!this._mac_addresses[mac.toLowerCase()].motor_control_char) {
    callback('DoesNotExist');
  }

  this._mac_addresses[mac.toLowerCase()].motor_control_char.write(new Buffer([MOTOR_STOP]), false, function(error) {
    if(error) {
      debug(error)
    }

    callback(error);
  });
}

if (require.main === module) {
  //If run as main, take arguments of mac, command and arg1, execute the command and return
  var argv   = require('yargs')
    .demandOption(['m'])
    .demandCommand(1)
    .option('mac-address', {
      alias: 'm',
    })
    .command('battery', 'Get battery level')
    .command('position', 'Get shade position')
    .command('target', 'Set the shade position target')
    .nargs('target',1)
    .command('up', 'Move the shade up')
    .command('down', 'Move the shade down')
    .command('stop', 'Stop the shade')
    .argv;

  var mac = argv.m;
  shades = new soma([mac], function(error) {
    debug('Returned');
    if(error) {
      console.log('Error: ' + error);
      process.exit(1)
    }

    if(argv._[0] == 'battery') {
      shades.get_battery(mac, function(error, data) {
        if(error) {
          console.log('Error: ' + error);
          process.exit(1)
        }

        console.log('Battery level: ' + data);
        process.exit(0)
      });
    } else if(argv._[0] == 'position') {
      shades.get_position(mac, function(error, data) {
        if(error) {
          console.log('Error: ' + error);
          process.exit(1)
        }

        console.log('Position: ' + data);
        process.exit(0)
      });
    } else if(argv._[0] == 'target') {
      if(argv._.length < 2) {
        console.log('Error: must provide position argument with target');
        process.exit(1)
      }

      shades.set_position(mac, argv._[1], function(error) {
        if(error) {
          console.log('Error: ' + error);
          process.exit(1)
        } else {
          console.log('Successfully set target');
          process.exit(0)
        }
      });
    } else if(argv._[0] == 'up') {
      shades.move_up(mac, function(error) {
        if(error) {
          console.log('Error: ' + error);
          process.exit(1)
        } else {
          console.log('Moving up');
          process.exit(0)
        }
      });
    } else if(argv._[0] == 'down') {
      shades.move_down(mac, function(error) {
        if(error) {
          console.log('Error: ' + error);
          process.exit(1)
        } else {
          console.log('Moving down');
          process.exit(0)
        }
      });
    } else if(argv._[0] == 'stop') {
      shades.stop(mac, function(error) {
        if(error) {
          console.log('Error: ' + error);
          process.exit(1)
        } else {
          console.log('Stopping');
          process.exit(0)
        }
      });
    }
  });
} else {
  module.exports = soma;
}
