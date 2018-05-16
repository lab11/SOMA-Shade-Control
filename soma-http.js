#!/usr/bin/env node

var express = require('express');
var http = require('http');
var https = require('https');
var debug = require('debug')('SOMA-Shade-Control-http');
var soma = require('./soma');
var fs     = require('fs');
var retry  = require('retry');

mac_list = ['F4:21:20:D9:FA:CD',
          'DF:93:08:12:38:CF',
          'FD:97:B5:16:08:4F',
          'FE:AF:38:31:AC:C7',
          'F0:8A:FB:BC:E9:82'];

//var options = {
  //key: fs.readFileSync
//}

var app = express();
app.get('/shades/:which/:param', function (req, res) {
  console.log('get request');
  var i = parseInt(req.params['which'], 10);
  var parameter = req.params['param'];
  if (parameter == 'battery') {
    var operation = retry.operation();
    operation.attempt(function(currentAttempt) {
      console.log('retry #' + currentAttempt);
      var shades = new soma([mac_list[i]], function() {
        shades.get_battery(mac_list[i], function(error,data) {
          console.log(error)
          console.log(data)
          if (operation.retry(error)) {
            return;
          }
          if (error || data == null) {
            res.sendStatus(500);
          } else {
            res.status(200).send('Battery: ' + data.toString());
          }
        });
      });
    });
  }
  else if (parameter == 'position') {
    var shades = new soma([mac_list[i]], function() {
      shades.get_position(mac_list[i], function(error,data) {
        res.status(200).send('Position: ' + data.toString())
      });
    });
  }
});
app.post('/shades/:which/:param/:value', function (req, res) {
  var i = parseInt(req.params['which'], 10);
  var parameter = req.params['param'];
  var value = parseInt(req.params['value'], 10);
  if (parameter == 'target') {
    var shades = new soma([mac_list[i]], function() {
      shades.set_position(mac_list[i], value, function(error) {
        if (error) {
          res.sendStatus(500);
          return;
        }
        res.status(200).send('Success!');
      });
    });
  }
});

http.createServer(app).listen(80);




