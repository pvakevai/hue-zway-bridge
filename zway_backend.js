var http = require('http')
var _ = require('underscore')
var fs = require('fs')
var jsonPath = require('JSONPath');

// TODO Lookup configuration for multilevel switches to see if they are configured to behave as binary switches
// TODO Move naming of devices to hue
// TODO Refactor ALL OFF command to use z-wave all off command
// TODO Fix a bug with state update sometimes brings in old values if an operation is made at the same time
// TODO Detect controller node nicer

var naming = { 4: 'Livingroom', 5: 'Wallplug', 7: 'Hallway', 8: 'Kitchen worklights', 9: 'Kitchen Ceiling', 10: 'Diningroom' }
var multilevelNodesConfiguredAsBinary = { 10: true }

var options = {
	hostname: 'localhost',
	port: 8083,
	method: 'POST',
	headers: [ { 'Connection' : 'keep-alive'} ]
}

var state = {}

function initializeState() {
	fetchState(0, function(update) {
		state = update
		logFailedDevices(update)
		setInterval(updateState, 2 * 1000)
		dumpStateForDebugging(update)
	})
}

function updateState() {
	fetchState(state.updateTime, function(update) {
		updateStateFrom(update)
		logUpdateToConsole(update)
		logFailedDevices(update)
		state.updateTime = update.updateTime
	})
}

function fetchState(updateTime, callback) {
	call(_.extend(options, { path: '/ZWaveAPI/Data/' + updateTime}), callback)
}

function updateStateFrom(update) {
	for (var pathToSubstate in update) {
		var substate = jsonPath.eval(state, pathToSubstate)[0]
		var updatedstate = update[pathToSubstate]

		for (key in updatedstate) {
			substate[key] = updatedstate[key]
		}
	}
}

function dumpStateForDebugging(update) {
	fs.writeFile('z-way-dump.json', JSON.stringify(update, null, "\t"))
	console.log(exports.getLightStates(function(lightState) {console.log(lightState)}))
}

function logUpdateToConsole(update) {
	if (Object.keys(update).length > 1) {
		console.log("Updated z-wave configuration")
		exports.getLightStates(function(lightState) { console.log(lightState) })
	}
}

exports.getLightStates = function (callback) {
	var response = []

	for (d in state.devices) {
		for (i in state.devices[d].instances) {
			if (shouldInstanceBeExcluded(d, i)) {
				continue
			}
			response.push(lightState(d, i))
		}
	}

    callback(response)
}

function shouldInstanceBeExcluded(d, i) {
	if (d == 1) return true // controller node

	if (state.devices[d].instances[0].commandClasses[114] != null &&
		state.devices[d].instances[0].commandClasses[114].data.vendorId.value == 271 &&     // Fibaro
		state.devices[d].instances[0].commandClasses[114].data.productId.value == 4106 &&   // RelaySwitch
		state.devices[d].instances[0].commandClasses[114].data.productType.value == 1024 && // FGS-211 (with one root node + one phantom)
		i != 1) {
		return true
	}

	if (state.devices[d].instances[0].commandClasses[114] != null &&
		state.devices[d].instances[0].commandClasses[114].data.vendorId.value == 271 &&    // Fibaro
		state.devices[d].instances[0].commandClasses[114].data.productId.value == 4106 &&  // RelaySwitch
		state.devices[d].instances[0].commandClasses[114].data.productType.value == 512 && // FGS-221 (with one root node)
		i == 0) {
		return true
	}

	if (state.devices[d].data.isFailed.value)
		return true

	return false
}

function lightState(d, i) {
	var on, bri

	if (state.devices[d].instances[i].commandClasses[38] != null) { // MultilevelSwitch
		bri = Math.round(state.devices[d].instances[i].commandClasses[38].data.level.value * 255 / 99 ) // Scale to hue scale
		on = bri != 0
		if (multilevelNodesConfiguredAsBinary[d]) { // Treat multilevel switch as binary due to the load connected to it. TODO its configured to the dimmer, so get the value from there.
			bri = on * 255
		}
	} else if (state.devices[d].instances[i].commandClasses[37] != null) { // BinarySwitch
		on = state.devices[d].instances[i].commandClasses[37].data.level.value != 0
		bri = on * 255
	}
	return { id: d + "_" + i, on: on, bri: bri, name: naming[d]}
}

exports.setLightState = function (lightState, callback) {
	console.log("Set: " + JSON.stringify(lightState))

	var d = lightState.id.split("_")[0]
	var i = lightState.id.split("_")[1]
	var level

	if (! lightState.on || ! isNumber(lightState.bri) || lightState.bri == 0) {
		lightState.on = false
		lightState.bri = 0
		level = 0
	} else {
		level = Math.round(lightState.bri * 99 / 255) // Scale from hue scale
	}

	if (multilevelNodesConfiguredAsBinary[d]) { // Treat multilevel switch as binary due to the load connected to it. TODO its configured to the dimmer, so get the value from there.
		level = level == 0 ? 0 : 255
		lightState.bri = level
		lightState.on = level != 0
	}

	setLevel(d, i, level)

	console.log("Actual: " + JSON.stringify(lightState))
	callback(lightState)
}

exports.setGroupState = function (groupId, groupState, callback) {
	if (groupId == 0 && ! groupState.on) {
		for (d in state.devices) {
			for (i in state.devices[d].instances) {
				if (!shouldInstanceBeExcluded(d, i))
					setTimeout(function(d, i) { setLevel(d, i, 0) }, 1, d, i)
			}
		}
	}
	callback(groupState)
}

function setLevel(d, i, level) {
	var commandClass

	if (state.devices[d].instances[i].commandClasses[37] != null) { // BinarySwitch
		commandClass = 37
		if (level != 0)
			level = 255
	} else if (state.devices[d].instances[i].commandClasses[38] != null) { // MultilevelSwitch
		commandClass = 38
	} else {
		console.log("Unknown type")
		return
	}

	state.devices[d].instances[i].commandClasses[commandClass].data.level.value = level
	call(_.extend(options, { path: '/ZWaveAPI/Run/devices[' + d + '].instances[' + i + '].commandClasses[' + commandClass + '].Set(' + level + ')'}))
}

function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n)
}

function call(options, callback) {
	console.log(options.method + " " + "http://" + options.hostname + ":" + options.port + options.path)
	var req = http.request(options, function(res) {
		res.setEncoding('utf8')
		var content = ""
		res.on('data', function (chunk) {
			content += chunk
		})

		res.on('end', function() {
			if (callback != null)
				callback(JSON.parse(content))
		})
	})

	req.on('error', function(e) {
		console.log('problem with request: ' + e.message)
	})
	req.end()
}

function logFailedDevices(update) {
	for (var d in update.devices) {
		if (update.devices[d].data.isFailed.value) {
			console.log("Device %d has failed", d)
		}
	}
}

initializeState()

