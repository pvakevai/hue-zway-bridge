var os = require('os');
var strftime= require('strftime');
var express = require('express')
var app = express()

var address = address()
var port = 80

app.configure(function () {
  app.use(function(req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    next();
  });
  app.use(express.logger('short'))
  app.use(function(req, res, next) {
    var data = "";
    req.on('data', function(chunk) { data += chunk } )
    req.on('end', function() {
      if (data.length > 0) req.body = JSON.parse(data);
      next();
    });
  });
  app.use(express.methodOverride());
  app.use(app.router);
});


app.get('/api/:username', function(req, res) {
  var hueState = {
    "lights": {},
    "groups": {},
    "config": {
      "name": "Philips hue",
      "mac": "00:17:88:14:d2:81",
      "dhcp": true,
      "ipaddress": address,
      "netmask": "255.255.255.0",
      "gateway": "192.168.1.1",
      "proxyaddress": "none",
      "proxyport": 0,
      "UTC": nowUTC(),
      "whitelist": {
        "0f607264fc6318a92b9e13c65db7cd3c": {
          "last use date": "2014-01-31T18:16:41",
          "create date": "2014-01-31T17:40:20",
          "name": "Jakub's iPhone"
        },
        "newdeveloper": {
          "last use date": "2014-01-31T17:40:21",
          "create date": "2014-01-31T22:25:36",
          "name": "test user"
        }
      },
      "swversion": "01006390",
      "swupdate": {
        "updatestate": 0,
        "url": "",
        "text": "",
        "notify": false
      },
      "linkbutton": false,
      "portalservices": false
    },
    "schedules": {},
    "scenes": {
      "09e850cbd3-on-0": {
        "name": "New scene on 0",
        "lights": ["1", "2", "3"],
        "active": true
      }
    }
  }
  getLightStates(function(lightStates) {
    lightStates.forEach(function(lightState) {
      hueState["lights"][lightState.id] = { // Int as String
        "state": {
          "on": lightState.on, // Boolean
          "bri": lightState.bri, // Int
          "hue": 65292,
          "sat": 69,
          "xy": [0.4586, 0.3609],
          "ct": 365,
          "alert": "none",
          "effect": "none",
          "colormode": "xy",
          "reachable": true
        },
        "type": "Extended color light",
        "name": lightState.name, // String
        "modelid": "LCT001",
        "swversion": "66009663",
        "pointsymbol": {
          "1": "none",
          "2": "none",
          "3": "none",
          "4": "none",
          "5": "none",
          "6": "none",
          "7": "none",
          "8": "none"
        }
      }
    })
    res.json(hueState);
  })
});

app.get('/api/:username/config', function(req, res) {
  res.json( {"name": "Philips hue","swversion": "01006390" })
})

app.put('/api/:username/config', function(req, res) {
  res.json([{
    "error": {
      "type": 8,
      "address": "/config/UTC",
      "description": "parameter, UTC, is not modifiable"
  }}])
})

app.put('/api/:username/lights/:id/state', function(req, res) {
  setLightState({ id: req.params.id, on: req.body.on, bri: req.body.bri }, function (lightState) {
      var onM = {}
      onM["/lights/" + lightState.id + "/state/on"] = lightState.on // Boolean
      var ctM = {}
      ctM["/lights/" + lightState.id + "/state/ct"] = 365
      var briM = {}
      briM["/lights/" + lightState.id + "/state/bri"] = lightState.bri // Int
      res.json([{ "success": onM }, { "success": ctM }, { "success": briM }]);
  })
})

app.put('/api/:username/groups/:id/action', function(req, res) {
  var groupId = req.params.id
  setGroupState(groupId, req.body, function(groupState) {
    var array = []
    for (var k in groupState) {
      var v = {}
      v["/lights/" + groupId + "/state/" + k] = groupState[k]
      array.push({ "success": v })
    }
    res.json(array)
  })
})

app.get('/api/:username/lights/new', function(req, res) {
  res.json({ lastscan: nowUTC() })
})

function nowUTC() {
  return strftime.strftimeTZ('%Y-%m-%dT%H:%M:%S', new Date(), "+0000")
}

function address() {
  var interfaces = os.networkInterfaces();
  for (k in interfaces) {
    for (k2 in interfaces[k]) {
      var address = interfaces[k][k2];
      if (address.family == 'IPv4' && !address.internal) {
          return address.address
      }
    }
  }
}

function getLightStates(callback) {
  // TODO Function not implemented jackass!
  // Get actual light state and pass it to the callback
  callback([{ id: "1", on: true, bri: 255, name: "Kattovalo" },
            { id: "2", on: false, bri: 255, name: "Eteisen valo" },
            { id: "3", on: true, bri: 50, name: "Pöytälamppu" }])
}

function setLightState(lightState, callback) {
  // TODO Function not implemented jackass!
  // Example of lightState argument passed to this function { id: "1", on: true, bri: 124 }
  // Pass the new lightState to the callback
  callback(lightState)
}

function setGroupState(groupId, groupState, callback) {
  // TODO Function not implemented jackass!
  // Arguments to this function:
  // groupId: for all our purposes, it is "0", meaning all lights
  // data: Most primitive case: { "on": true/false }
  // Pass the new groupState to the callback
  callback(groupState)
}

app.listen(port);
console.log('Listening on port %s.', port);
