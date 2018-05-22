#!/usr/bin/env node

var express = require('express');
var http = require('http');
var debug = require('debug')('SOMA-Shade-Control-http');
var soma = require('./soma');
var fs     = require('fs');
var bodyParser = require('body-parser');
var basicAuth = require('express-basic-auth');
var helmet = require('helmet');

var shades = new soma();

var app = express();
app.use(helmet());
app.use(basicAuth({users: { 'admin': 'password' }}));
app.use(bodyParser.json());

process_request = function(req, res) {
  var shade = req.body.shade;
  debug('Shade address: ' + shade);
  var shade_split;
  try {
    shade_split = shade.split(':');
  } catch(error) {
    res.status(400).send(JSON.stringify({ "result": "Invalid shade address, must be a string of the form XX:XX:XX:XX:XX:XX" }));
    return;
  }
  if (shade.length != "XX:XX:XX:XX:XX:XX".length && shade_split.length != 6) {
    res.status(400).send(JSON.stringify({ "result": "Invalid shade address, invalid length" }));
    return;
  }
  for(var i = 0; i < shade_split.length; i++) {
    var test = parseInt(shade_split[i], 16);
    if (isNaN(test)) {
      res.status(400).send(JSON.stringify({ "result": "Invalid shade address, non-hex digits found" }));
      return;
    }
  }
  var action = req.body.action;
  debug('Action: ' + action);
  if (req.method == 'GET') {
    if (action === 'battery') {
      shades.get_battery(shade, function(error,data) {
        if (error || data == null) {
          res.status(500).send(JSON.stringify({ "Result": error }));
        } else {
          var obj = {};
          obj[action] = data;
          res.status(200).send(JSON.stringify(obj));
          return;
        }
      });
    }
    else if (action === 'position') {
      shades.get_position(shade, function(error,data) {
        if (error || data == null) {
          res.status(500).send(JSON.stringify({ "result": error }));
          return;
        } else {
          var obj = {};
          obj[action] = data;
          res.status(200).send(JSON.stringify(obj));
          return;
        }
      });
    }
    else {
      res.sendStatus(400);
      return;
    }
  }
  else if (req.method == 'POST') {
    if (action === 'target') {
      var value = parseInt(req.body.value, 10);
      debug('Value: ' + value);
      if (isNaN(value)) {
        res.status(400).send(JSON.stringify({ "result": "Invalid value for shade target, must be an integer" }));
        return;
      }
      else if (value < 0 || value > 100) {
        res.status(400).send(JSON.stringify({ "result": "Invalid value for shade target, must be between [0, 100]" }));
        return;
      }
      shades.set_position(shade, value, function(error) {
        if (error) {
          res.sendStatus(500);
          return;
        }
        res.status(200).send(JSON.stringify({ result: 'Success!' }));
        return;
      });
    }
    else if (action === 'down') {
      shades.move_down(shade, function(error) {
        if (error) {
          res.sendStatus(500);
          return;
        }
        res.status(200).send(JSON.stringify({ result: 'Success!' }));
        return;
      });
    }
    else if (action === 'up') {
      shades.move_up(shade, function(error) {
        if (error) {
          res.sendStatus(500);
          return;
        }
        res.status(200).send(JSON.stringify({ result: 'Success!' }));
        return;
      });
    }
    else if (action === 'stop') {
      shades.stop(shade, function(error) {
        if (error) {
          res.sendStatus(500);
          return;
        }
        res.status(200).send(JSON.stringify({ result: 'Success!' }));
        return;
      });
    }
    else {
      res.sendStatus(400);
      return;
    }
  }
  else {
    res.sendStatus(400);
    return;
  }
};

app.get('/health-check', (req, res) => res.sendStatus(200));
app.get('/shades', process_request);
app.post('/shades', process_request);

http.createServer(app).listen(80);

