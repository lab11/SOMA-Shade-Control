#!/usr/bin/env node

var express = require('express');
var http = require('http');
var https = require('https');
var debug = require('debug')('SOMA-Shade-Control-http');
var soma = require('./soma');
var fs     = require('fs');
var bodyParser = require('body-parser');
var basicAuth = require('express-basic-auth');

mac_list = ['F4:21:20:D9:FA:CD',
          'DF:93:08:12:38:CF',
          'FD:97:B5:16:08:4F',
          'FE:AF:38:31:AC:C7',
          'F0:8A:FB:BC:E9:82'];

//var options = {
  //key: fs.readFileSync
//}

var operation_settings = {
  retries: 2,
  factor: 0,
  minTimeout: 1000,
  maxTimeout: 1000,
  randomize: false
}

var shades = new soma();

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(basicAuth({users: { 'admin': 'password' }}));
app.get('/shades', function (req, res) {
  var shade = parseInt(req.body.shade, 10);
  var action = req.body.action;
  if (action == 'battery') {
    shades.get_battery(mac_list[shade], function(error,data) {
      if (error || data == null) {
        res.status(500).send(JSON.stringify({ Result: error }));
      } else {
        res.status(200).send(JSON.stringify({ action: data }));
      }
    });
  }
  else if (action == 'position') {
    shades.get_position(mac_list[shade], function(error,data) {
      if (error || data == null) {
        res.status(500).send(JSON.stringify({ Result: error }));
      } else {
        res.status(200).send(JSON.stringify({ action: data}));
      }
    });
  }
});

app.post('/shades', function (req, res) {
  console.log(req.body);
  var shade = parseInt(req.body.shade, 10);
  var action = req.body.action;
  var value = parseInt(req.body.value, 10);
  res.setHeader('Content-Type', 'application/json');
  if (shade > mac_list.length) {
    res.status(400).send(JSON.stringify({ result: 'Bad shade number' }));
    return;
  }
  if (action == 'target') {
    shades.set_position(mac_list[shade], value, function(error) {
      if (error) {
        res.sendStatus(500);
        return;
      }
      res.status(200).send(JSON.stringify({ result: 'Success!' }));
    });
  }
});

http.createServer(app).listen(80);


