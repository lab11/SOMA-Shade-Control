#!/usr/bin/env node

var debug = require('debug')('SOMA-Shade-Control');
var fs     = require('fs');
var util   = require('util');
var noble = require('noble');
var AsyncLock = require('async-lock');

//battery
const BATTERY_SERVICE_UUID = "180f".toLowerCase();
const BATTERY_CHARACTERISTIC_UUID = "2a19".toLowerCase();

//motor control
const MOTOR_SERVICE_UUID = "00001861B87F490C92CB11BA5EA5167C".toLowerCase();
const MOTOR_STATE_CHARACTERISTIC_UUID = "00001525B87F490C92CB11BA5EA5167C".toLowerCase();
const MOTOR_CONTROL_CHARACTERISTIC_UUID = "00001530B87F490C92CB11BA5EA5167C".toLowerCase();
const MOTOR_TARGET_CHARACTERISTIC_UUID = "00001526B87F490C92CB11BA5EA5167C".toLowerCase();
const MOTOR_MOVE_UP = 0x69;
const MOTOR_STOP = 0x50;
const MOTOR_MOVE_DOWN = 0x96;

const DISCOVER_TIMEOUT = 1500;
const SCANNING_TIMEOUT = 5000;

var soma = function () {

  this._mac_addresses = {};
  this._current_address = null;
  this._discover_timeout = null;
  this._scanning_timeout = null;
  this._ready_callback = null;
  this._connection_lock = new AsyncLock();

  debug('Creating new SOMA shade object');

  noble.on('discover', this.on_discover.bind(this));
  //noble.on('scanChanged', this.on_scan_changed.bind(this));
  //noble.on('disconnect', this.on_disconnect.bind(this));
};

soma.prototype.connectDevice = function(mac, cb) {
  if (this._ready_callback == null) {
    this._ready_callback = cb;
    this._current_address = mac;
  }
  else {
    cb('Busy');
  }
  if (this._mac_addresses[mac] == null) {
    this._mac_addresses[mac] = {};
  }
  //if (typeof this._mac_addresses[mac].peripheral !== 'undefined') {
  //  debug('Already know it');
  //  this.connect(this._mac_addresses[mac].peripheral);
  //} else {
  this._scanning_timeout = setTimeout(this.scanning_timeout.bind(this), SCANNING_TIMEOUT);
  this.startScanningOnPowerOn();
  //}
};

soma.prototype.startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([], false);
    } else {
      noble.once('stateChange', this.startScanningOnPowerOn);
    }
};

soma.prototype.discover_timeout = function() {
  debug('Called discover timeout');
  if (this._current_address != undefined
    && this._mac_addresses[this._current_address].peripheral != null
    && this._mac_addresses[this._current_address].peripheral.state == 'connected')
  {
    this._mac_addresses[this._current_address].peripheral.disconnect();
  }
}

soma.prototype.scanning_timeout = function() {
  debug('Called scanning timeout');
  this._ready_callback('DeviceNotFound');
  this._ready_callback = null;
  this._current_address    = null;
}

soma.prototype.connect = function(peripheral, cb) {
  var that = this;
  if(peripheral.state == 'connected') {
    //peripheral.disconnect();
  }
  peripheral.connect(function (error) {

    if(error) {
      debug(error);
    }
    debug('connected');
    if(peripheral.state == 'connected') {
      peripheral.discoverServices([BATTERY_SERVICE_UUID, MOTOR_SERVICE_UUID], function(error, services) {
      debug('discover services');
        if(error) {
          debug(error);
        }

        if(services.length != 2) {
          debug('Wrong number of services');
        }

        if(peripheral.state == 'connected') {
          services[0].discoverCharacteristics([BATTERY_CHARACTERISTIC_UUID], function(error,chars) {
            debug('discover bat chars');
            if(error) {
              debug(error);
            }
            that._mac_addresses[peripheral.address].battery_char = chars[0];
          });

          if(peripheral.state == 'connected') {
            services[1].discoverCharacteristics([MOTOR_STATE_CHARACTERISTIC_UUID,MOTOR_CONTROL_CHARACTERISTIC_UUID,MOTOR_TARGET_CHARACTERISTIC_UUID], function(error,chars) {
            debug('discover motor chars');
              if(error) {
                debug(error);
              }

              that._mac_addresses[peripheral.address].motor_state_char = chars[0];
              that._mac_addresses[peripheral.address].motor_target_char = chars[1];
              that._mac_addresses[peripheral.address].motor_control_char = chars[2];

              if(that._ready_callback != null) {
                debug('Calling ready callback from discovery');
                //debug(that);
                that._ready_callback(null);
                that._ready_callback = null;
                that._current_address    = null;
              }
            });
          } else cb('UnexpectedDisconnectBeforeDiscoverMotorChars');
          debug('Finished service discovery for ' +  peripheral.address);
        } else cb('UnexpectedDisconnectBeforeDiscoverBatteryChars');
      });
    } else cb('UnexpectedDisconnectBeforeDiscoverServices');
  });
};

soma.prototype.on_discover = function (peripheral) {
  var that = this;
  //debug('discovered ' + peripheral.address);
  //debug('looking for ' + this._current_address);
  if(this._current_address === peripheral.address) {
    clearTimeout(that._scanning_timeout);
    this._connection_lock.acquire(this._current_address, function(cb) {
      debug('crit section');
        noble.stopScanning();
        that._discover_timeout = setTimeout(that.discover_timeout.bind(that), DISCOVER_TIMEOUT);
        that._lock_free_cb = cb;
        that._current_address = peripheral.address;
        that._mac_addresses[peripheral.address].peripheral  = peripheral;

        peripheral.once('disconnect',that.on_disconnect.bind(that));

        //connect to this peripheral
        debug('Connecting to ' + peripheral.address);
        that.connect(peripheral, cb);
    }, function (err, ret) {
      debug('exit crit section');
      if (err) {
        debug(err);
      }
    });
  }
};

//// Handle the callback when scanning parameters change out from beneath us.
//// This gives us the ability to set them back to how we want them.
//soma.prototype.on_scan_changed = function (enable, filter_dups) {
//  try {
//    noble.startScanning([], false);
//  } catch (e) { }
//};

soma.prototype.on_disconnect = function(error) {
  debug('Disconnected');
  if (this._lock_free_cb !== null) this._lock_free_cb();
  debug('Clear timeout');
  clearTimeout(this._discover_timeout);
  var delay = setTimeout(function() {
    noble.startScanning([], false);
  }, DISCOVER_TIMEOUT);
  //if (this._current_address != null && this._ready_callback != null) {
  //  this._ready_callback('UnexpectedDisconnect');
  //  this._ready_callback = null;
  //}
};

soma.prototype.get_battery = function(mac, callback) {
  var that = this;
  that.connectDevice(mac.toLowerCase(), function(error) {
    if(error) {
      debug(error);
      callback(error, null);
      return;
    }
    else if(!that._mac_addresses[mac.toLowerCase()].battery_char) {
      error = 'DoesNotExist';
      if(error) {
        debug(error);
        callback(error, null);
        return;
      }
    }
    that._mac_addresses[mac.toLowerCase()].battery_char.read(function(error, data) {
      if(error) {
        debug(error);
      }

      callback(error, data[0]);
      that._mac_addresses[mac.toLowerCase()].peripheral.disconnect();
    });
  });
};

soma.prototype.get_position = function(mac, callback) {
  var that = this;
  this.connectDevice(mac.toLowerCase(), function(error) {
    if(error) {
      debug(error);
      callback(error, null);
      return;
    }
    else if(!that._mac_addresses[mac.toLowerCase()].motor_state_char) {
      error = 'DoesNotExist'
      if(error) {
        debug(error);
        callback(error, null);
        return;
      }
    }

    that._mac_addresses[mac.toLowerCase()].motor_state_char.read(function(error, data) {
      if(error) {
        debug(error);
      }

      callback(error, data[0]);
      that._mac_addresses[mac.toLowerCase()].peripheral.disconnect();
    });
  });
};

soma.prototype.set_position = function(mac, position, callback) {
  var that = this;
  this.connectDevice(mac.toLowerCase(), function(error) {
    if(error) {
      debug(error);
      callback(error, null);
      return;
    }
    else if(!that._mac_addresses[mac.toLowerCase()].motor_target_char) {
      error = 'DoesNotExist'
      if(error) {
        debug(error);
        callback(error, null);
        return;
      }
    }

    that._mac_addresses[mac.toLowerCase()].motor_target_char.write(new Buffer([position]), false, function(error) {
      if(error) {
        debug(error);
      }

      callback(error);
      that._mac_addresses[mac.toLowerCase()].peripheral.disconnect();
    });
  });
};

soma.prototype.move_up = function(mac, callback) {
  var that = this;
  this.connectDevice(mac.toLowerCase(), function(error) {
      if(error) {
        debug(error);
        callback(error, null);
        return;
      }
    else if(!that._mac_addresses[mac.toLowerCase()].motor_control_char) {
      error = 'DoesNotExist'
      if(error) {
        debug(error);
        callback(error, null);
        return;
      }
    }

    that._mac_addresses[mac.toLowerCase()].motor_control_char.write(new Buffer([MOTOR_MOVE_UP]), false, function(error) {
      if(error) {
        debug(error);
      }

      callback(error);
      that._mac_addresses[mac.toLowerCase()].peripheral.disconnect();
    });
  });
};

soma.prototype.move_down = function(mac, callback) {
  var that = this;
  this.connectDevice(mac.toLowerCase(), function(error) {
    if(error) {
      debug(error);
      callback(error, null);
      return;
    }
    else if(!that._mac_addresses[mac.toLowerCase()].motor_control_char) {
      error = 'DoesNotExist'
      if(error) {
        debug(error);
        callback(error, null);
        return;
      }
    }

    that._mac_addresses[mac.toLowerCase()].motor_control_char.write(new Buffer([MOTOR_MOVE_DOWN]), false, function(error) {
      if(error) {
        debug(error);
      }

      callback(error);
      that._mac_addresses[mac.toLowerCase()].peripheral.disconnect();
    });
  });
};

soma.prototype.stop = function(mac, callback) {
  var that = this;
  this.connectDevice(mac.toLowerCase(), function(error) {
    if(error) {
      debug(error);
      callback(error, null);
      return;
    }
    else if(!that._mac_addresses[mac.toLowerCase()].motor_control_char) {
      error = 'DoesNotExist'
      if(error) {
        debug(error);
        callback(error, null);
        return;
      }
    }

    that._mac_addresses[mac.toLowerCase()].motor_control_char.write(new Buffer([MOTOR_STOP]), false, function(error) {
      if(error) {
        debug(error);
      }

      callback(error);
      that._mac_addresses[mac.toLowerCase()].peripheral.disconnect();
    });
  });
};

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
  shades = new soma();
  if(argv._[0] == 'battery') {
    shades.get_battery(mac, function(error, data) {
      if(error) {
        console.log('Error: ' + error);
        process.exit(1);
      }

      console.log('Battery level: ' + data);
      process.exit(0);
    });
  } else if(argv._[0] == 'position') {
    shades.get_position(mac, function(error, data) {
      if(error) {
        console.log('Error: ' + error);
        process.exit(1);
      }

      console.log('Position: ' + data);
      process.exit(0);
    });
  } else if(argv._[0] == 'target') {
    if(argv._.length < 2) {
      console.log('Error: must provide position argument with target');
      process.exit(1);
    }

    shades.set_position(mac, argv._[1], function(error) {
      if(error) {
        console.log('Error: ' + error);
        process.exit(1);
      } else {
        console.log('Successfully set target');
        process.exit(0);
      }
    });
  } else if(argv._[0] == 'up') {
    shades.move_up(mac, function(error) {
      if(error) {
        console.log('Error: ' + error);
        process.exit(1);
      } else {
        console.log('Moving up');
        process.exit(0);
      }
    });
  } else if(argv._[0] == 'down') {
    shades.move_down(mac, function(error) {
      if(error) {
        console.log('Error: ' + error);
        process.exit(1);
      } else {
        console.log('Moving down');
        process.exit(0);
      }
    });
  } else if(argv._[0] == 'stop') {
    shades.stop(mac, function(error) {
      if(error) {
        console.log('Error: ' + error);
        process.exit(1);
      } else {
        console.log('Stopping');
        process.exit(0);
      }
    });
  }
} else {
  module.exports = soma;
}
