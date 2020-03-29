# Homebridge Litter Robot Plugin
[![mit license](https://badgen.net/badge/license/MIT/red)](http://doge.mit-license.org)
[![npm](https://badgen.net/npm/v/homebridge-litter-robot)](https://www.npmjs.com/package/homebridge-litter-robot)
[![npm](https://badgen.net/npm/dt/homebridge-litter-robot)](https://www.npmjs.com/package/homebridge-litter-robot)

This is an accessory plugin for [Homebridge](https://github.com/homebridge/homebridge) allowing limited control and event 
notifications of [Litter Robot](https://www.litter-robot.com) devices.

## What does this plugin do?

This plugin makes calls to the unpublished Litter Robot API to get status of litter robot(s) associated with the account.
It creates four devices for each Litter Robot it finds, Power Switch, Night Light Switch, Occupancy Sensor and Filter Maintenance. 

The Power Switch will turn activate the power of the Litter Robot.

The Nightlight Switch will turn on/off the nightlight.

The Occupancy Sensor will trigger when the Drawer Full status is indicated.

The Filter Maintenance is not supported in Home App as of iOS 12.1 and has not been tested. 

The Cycle Switch will initiate a cycle and then set state to off.

## Install

**Important: This plugin is using ES6/ES2015. Please use an appropriate environment like NodeJS v4 or higher.**

If you have already installed homebridge globally, just install

```npm install -g homebridge-litter-robot```

Alternativly, add the dependency into your local project with

```npm install -S homebridge-litter-robot```

## Configuration

This easiest way to use this plugin is to use [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x).  
To configure manually, add to the `platforms` section of homebridge's `config.json` after installing the plugin.  
The plugin registers itself as `LitterRobot`. You have the following options:

| Option               | Default                                      |
| -------------------- | -------------------------------------------- |
| email                | <none>                                       |
| password             | <none>                                       |
| apiKey               | <none>                                       |
| pollingInterval      | 0 - No Polling. Must be at least 5000 ms     |
| skipNightlightSwitch | false                                        |
| skipPowerSwitch      | false                                        |
| skipOccupancySensor  | false                                        |
| skipFilter           | false                                        |
| skipCycleSwitch      | false                                        |


The *email* and *password* are the values you use to login to the app.  
The apiKey is not currently published, but look around web for "x-api-key litter robot".  
The *skip** settings will configure the plugin to not create the associated device type.

### Example config.json


```json
{
    "platform" : "LitterRobot",
    "name" : "Litter Robot",
    "email": "<email@example.com>",
    "password": "<password>",
    "apiKey": "<apiKey>",
    "pollingInterval": 0,
    "skipNightlightSwitch": false,
    "skipPowerSwitch": false,
    "skipOccupancySensor": false,
    "skipFilter": false,
    "skipCycleSwitch": false
}
```

## License

Copyright 2020 by Michael Leo. Licensed under MIT.
