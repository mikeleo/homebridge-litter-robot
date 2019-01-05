# Homebridge Litter Robot Plugin

[![npm version](https://img.shields.io/npm/v/homebridge-litter-robot.svg)](https://www.npmjs.com/package/homebridge-pilight)  [![License](http://img.shields.io/:license-mit-blue.svg)](http://doge.mit-license.org)

This is an accessory plugin for [Homebridge](https://github.com/nfarina/homebridge) allowing limited control and event 
notifications of [Litter Robot](https://www.litter-robot.com) devices.

## What does this plugin do?

This plugin makes calls to the unpublished Litter Robot API to get status of litter robot(s) associated with the account.
It creates four devices for each Litter Robot it finds, Power Switch, Night Light Switch, Occupancy Sensor and Filter Maintenance. 

The Power Switch will turn activate the power of the Litter Robot.

The Nightlight Switch will turn on/off the nightlight.

The Occupancy Sensor will trigger when the Drawer Full status is indicated.

The Filter Maintenance is not supported in Home App as of iOS 12.1 and has not been tested. 

TBD:
- Add Cycle Stateless Switch to trigger the Cycle 

## Install

**Important: This plugin is using ES6/ES2015. Please use an appropriate environment like NodeJS v4 or higher.**

If you have already installed homebridge globally, just install

```npm install -g homebridge-litter-robot```

Alternativly, add the dependency into your local project with

```npm install -S homebridge-litter-robot```

## Configuration

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


The *email* and *password* are the values you use to login to the app.

The apiKey is not currently published, but look around web for "x-api-key litter robot".

The *skip** settings will configure the plugin to not create the associated device type.


### Example config.json


```json
{
  "bridge": {
    "name": "Homebridge",
    "username": "CC:22:3D:E3:CE:30",
    "port": 51826,
    "pin": "031-45-154"
  },
  "description": "This is an example configuration file with Litter Robot plugin.",

  "platforms": [
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

            "skipFilter": false

        }
    ]
}
```

## License

Copyright 2019 by Michael Leo. Licensed under MIT.