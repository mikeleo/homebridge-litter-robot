const LitterRobot = require('./lib/litter-robot');

const pjson = require('./package.json');

let Service, Characteristic, Accessory, UUIDGen, HomebridgeAPI;

module.exports = (homebridge) => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.platformAccessory;
    UUIDGen = homebridge.hap.uuid;
    HomebridgeAPI = homebridge;


    homebridge.registerPlatform("homebridge-litter-robot", "LitterRobot", HomebridgeLitterRobot, true);
};


class HomebridgeLitterRobot {
    constructor(log, config, api) {
        this.log = log;
        this.debug = config.debug || false;
        this.config = config;
        this.cacheDirectory = config.cacheDirectory || HomebridgeAPI.user.persistPath();
        
        this.accessories = [];

        let platform = this;

        this.litterRobot = new LitterRobot({
            email: config.email,
            password: config.password,
            apiKey: config.apiKey
        }, `${this.cacheDirectory}/plugin-litter-robot`, {
            log: this.log,
            error: this.log
        }, this.debug);

        if (api) {
            // Save the API object as plugin needs to register new accessory via this object
            this.api = api;

            // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
            // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
            // Or start discover new accessories.
            this.api.on('didFinishLaunching', function() {
                platform.log("DidFinishLaunching");
                this.syncRobots();

                if (config.pollingInterval) {
                    let polling = parseInt(config.pollingInterval);
                    if (polling >= 5000) {
                        this.interval = setInterval(this.updateValues.bind(this), polling);
                    }
                }

            }.bind(this));
        }

    }

    configureAccessory(accessory) {
        this.log(accessory.displayName, "Configure Accessory");
        var platform = this;

        // Set the accessory to reachable if plugin can currently process the accessory,
        // otherwise set to false and update the reachability later by invoking
        // accessory.updateReachability()
        accessory.reachable = true;

        accessory.on('identify', function(paired, callback) {
            platform.log(accessory.displayName, "Identify!!!");
            callback();
        });

        this.accessories.push(accessory);
    }

    async syncRobots() {

        let robots = await this.litterRobot.getRobots(false);

        // Add any new Robots
        robots.forEach(robot => {

            let uuid = UUIDGen.generate(robot.litterRobotId);

            let existing = this.accessories.find(element => {
                return element.UUID === uuid
            });

            if (!existing) {
                let accessory = this.addAccessory(robot);
            } else {
                this.configureAccessoryServices(existing, robot);
            }
        });

        //Remove any old Robots
        this.accessories.forEach(accessory => {

            let existing = robots.find(robot => {
                let uuid = UUIDGen.generate(robot.litterRobotId);

                return accessory.UUID === uuid
            });

            if (!existing) {
                this.removeAccessory(accessory);
            }
        });

    }


    addAccessory(robot) {
        this.log("Add Accessory");
        let platform = this;

        let accessoryName = robot.litterRobotNickname;
        let uuid = UUIDGen.generate(robot.litterRobotId);

        let existing = this.accessories.find(element => {
            return element.UUID === uuid;
        });

        if (!existing) {
            let newAccessory = new Accessory(accessoryName, uuid);
            newAccessory.on('identify', function (paired, callback) {
                platform.log(newAccessory.displayName, "Identify!!!");
                callback();
            });

            // Plugin can save context on accessory to help restore accessory in configureAccessory()
            newAccessory.context.litterRobotId = robot.litterRobotId;
            this.configureAccessoryServices(newAccessory, robot);

            this.accessories.push(newAccessory);
            this.api.registerPlatformAccessories("homebridge-litter-robot", "LitterRobot", [newAccessory]);

            return newAccessory;
        }

        return existing;

    }

    configureAccessoryServices(accessory, robot) {


        //0. Add Service Information
        accessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, robot.litterRobotNickname)
            .setCharacteristic(Characteristic.Manufacturer, "Litter Robot")
            .setCharacteristic(Characteristic.Model, robot.litterRobotSerial.substring(0, 3))
            .setCharacteristic(Characteristic.SerialNumber, robot.litterRobotSerial)
            .setCharacteristic(Characteristic.FirmwareRevision, "1.0");


        //1. Add Power Service

        // Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps

        let powerService = accessory.getServiceByUUIDAndSubType(Service.Switch, "power");
        if (this.config.skipPowerSwitch && powerService) {

            accessory.removeService(powerService);

        } else if (!this.config.skipPowerSwitch) {

            if (!powerService) {
                powerService = accessory.addService(new Service.Switch(`${accessory.displayName} Power`, "power"));
            }
            powerService.getCharacteristic(Characteristic.On)
                .on('set', (value, callback) => this.setSwitchStatus(accessory, powerService, value, callback))
                .on('get', (callback) => this.getSwitchStatus(accessory, powerService, callback));

            const powerValue = robot.unitStatus !== "OFF" && robot.unitStatus !== "offline";
            powerService
                .getCharacteristic(Characteristic.On).updateValue(powerValue);
        }

        //2. Add Nightlight Service
        let nightlightService = accessory.getServiceByUUIDAndSubType(Service.Switch, "nightlight");
        if (this.config.skipNightlightSwitch && nightlightService) {

            accessory.removeService(nightlightService);

        } else if (!this.config.skipNightlightSwitch) {

            if (!nightlightService) {
                nightlightService = accessory.addService(new Service.Switch(`${accessory.displayName} Night Light`, "nightlight"));
            }

            nightlightService.getCharacteristic(Characteristic.On)
                .on('set', (value, callback) => this.setSwitchStatus(accessory, nightlightService, value, callback))
                .on('get', (callback) => this.getSwitchStatus(accessory, nightlightService, callback));

            const nightlightValue = robot.nightLightActive === "1";
            nightlightService.getCharacteristic(Characteristic.On).updateValue(nightlightValue);
        }

        //3. Fudge an Occupancy Sensor
        let occupancyService = accessory.getService(Service.OccupancySensor);
        if (this.config.skipOccupancySensor && occupancyService) {

            accessory.removeService(occupancyService);

        } else if (!this.config.skipOccupancySensor) {

            if (!occupancyService) {
                occupancyService = accessory.addService(Service.OccupancySensor, `${accessory.displayName} Capacity Sensor`);
            }
            occupancyService.getCharacteristic(Characteristic.OccupancyDetected)
                .on('get', (callback) => this.getCapacitySensor(accessory, callback));

            occupancyService.getCharacteristic(Characteristic.StatusActive)
                .on('get', (callback) => this.getStatusActive(accessory, callback));

            occupancyService.getCharacteristic(Characteristic.StatusFault)
                .on('get', (callback) => this.getStatusFault(accessory, callback));


            occupancyService.getCharacteristic(Characteristic.Name)
                .on('get', callback => callback(null, `${accessory.displayName} CS Name`));

            const occupancy = robot.unitStatus.startsWith("DF");
            const active = this.isStatusActive(robot.unitStatus);
            const fault = this.isStatusFault(robot.unitStatus);
            occupancyService.getCharacteristic(Characteristic.OccupancyDetected).updateValue(occupancy);
            occupancyService.getCharacteristic(Characteristic.StatusActive).updateValue(active);
            occupancyService.getCharacteristic(Characteristic.StatusFault).updateValue(fault);
        }

        //4. Add Filter Details
        let filterService = accessory.getService(Service.FilterMaintenance);
        if (this.config.skipFilter && filterService) {

            accessory.removeService(filterService);

        } else if (!this.config.skipFilter) {

            if (!filterService) {
                filterService = accessory.addService(Service.FilterMaintenance, `${accessory.displayName} Capacity`);
            }
            filterService.getCharacteristic(Characteristic.FilterLifeLevel)
                .on('get', (callback) => this.getCapacity(accessory, callback));

            const lifeLevel = Math.floor(100.0 * (1.0 - (parseFloat(robot.cycleCount) / parseFloat(robot.cycleCapacity))));
            filterService.getCharacteristic(Characteristic.FilterLifeLevel).updateValue(lifeLevel);
        }
    }

    async updateValues() {
        let robots = await this.litterRobot.getRobots();

        // Add any new Robots
        robots.forEach(robot => {

            let uuid = UUIDGen.generate(robot.litterRobotId);

            let accessory = this.accessories.find(element => {
                return element.UUID === uuid
            });

            if (accessory) {
                let powerService = accessory.getServiceByUUIDAndSubType(Service.Switch, "power");
                if (powerService) {
                    let powerValue = robot.unitStatus !== "OFF" && robot.unitStatus !== "offline";
                    powerService
                        .getCharacteristic(Characteristic.On).updateValue(powerValue);

                }

                let nightLightService = accessory.getServiceByUUIDAndSubType(Service.Switch, "nightlight");
                if (nightLightService) {
                    let nightlightValue = robot.nightLightActive === "1";
                    nightLightService.getCharacteristic(Characteristic.On).updateValue(nightlightValue);
                }


                //3. Fudge an Occupancy Sensor
                let occupancyService = accessory.getService(Service.OccupancySensor);
                if (occupancyService) {
                    const occupancy = robot.unitStatus.startsWith("DF");
                    const active = this.isStatusActive(robot.unitStatus);
                    const fault = this.isStatusFault(robot.unitStatus);

                    occupancyService.getCharacteristic(Characteristic.OccupancyDetected).updateValue(occupancy);
                    occupancyService.getCharacteristic(Characteristic.StatusActive).updateValue(active);
                    occupancyService.getCharacteristic(Characteristic.StatusFault).updateValue(fault);
                }

                //4. Add Filter Details
                let filterService = accessory.getService(Service.FilterMaintenance);
                if (filterService) {
                    const lifeLevel = Math.floor(100.0 * (1.0 - (parseFloat(robot.cycleCount) / parseFloat(robot.cycleCapacity))));
                    filterService.getCharacteristic(Characteristic.FilterLifeLevel).updateValue(lifeLevel);
                }
            }
        });

    }

    async updateAccessoriesReachability() {
        this.log("Update Reachability");
        let robots = await this.litterRobot.getRobots(false);

        this.accessories.forEach(accessory => {
            let existing = robots.find(robot => {
                let uuid = UUIDGen.generate(robot.litterRobotId);

                return accessory.UUID === uuid
            });

            let reachability = (existing && existing.unitStatus !== 'offline');
            accessory.updateReachability(reachability);
        });
    }

    removeAccessory(accessory) {
        this.log("Remove Accessory");
        this.api.unregisterPlatformAccessories("homebridge-litter-robot", "LitterRobot", [accessory]);

        this.accessories = [];
    }

    async getSwitchStatus(accessory, service, callback) {
        this.log(accessory.displayName, "get Switch Value");

        let robots = await this.litterRobot.getRobots(true);

        let robot = robots.find(element => {

            let uuid = UUIDGen.generate(element.litterRobotId);

            return (accessory.UUID === uuid);
        });

        let value = false;
        if (robot) {
            if (service.subtype === "power") {
                value = robot.unitStatus !== "OFF" && robot.unitStatus !== "offline";
            } else if (service.subtype === "nightlight") {
                value = robot.nightLightActive === "1";
            }
        }
        callback(null, value);

    }

    async setSwitchStatus(accessory, service, value, callback) {
        this.log(accessory.displayName, `set ${service.subtype} -> ${value}`);

        let robots = await this.litterRobot.getRobots(true);

        let robot = robots.find(element => {

            let uuid = UUIDGen.generate(element.litterRobotId);

            return (accessory.UUID === uuid);
        });

        if (robot) {
            if (service.subtype === "power") {
                await this.litterRobot.setPower(robot, value);
            } else if (service.subtype == "nightlight") {
                await this.litterRobot.setNightLight(robot, value);
            }
        }
        callback();
    }

    async getCapacity(accessory, callback) {
        this.log(accessory.displayName, "get Capacity");

        let robots = await this.litterRobot.getRobots(true);

        let robot = robots.find(element => {

            let uuid = UUIDGen.generate(element.litterRobotId);

            return (accessory.UUID === uuid);
        });

        let value = 1.0;
        if (robot) {
            value = Math.floor(100.0 * (1.0 - (parseFloat(robot.cycleCount) / parseFloat(robot.cycleCapacity))));
        }
        callback(null, value);
    }


    async getCapacitySensor(accessory, callback) {
        this.log(accessory.displayName, "get Capacity");

        let robots = await this.litterRobot.getRobots(true);

        let robot = robots.find(element => {

            let uuid = UUIDGen.generate(element.litterRobotId);

            return (accessory.UUID === uuid);
        });


        let occupancy = false;
        if (robot) {
            occupancy = robot.unitStatus.startsWith("DF")
        }
        callback(null, occupancy);

    }

    isStatusActive(unitStatus) {
        let status = true;
        switch(unitStatus) {
            case "offline":
            case "OFF":
            case "P":
            case "BR":
                status = false;
                break;
            default:
                break;
        }

        return status;
    }

    async getStatusActive(accessory, callback) {
        this.log(accessory.displayName, "get Status Active");

        let robots = await this.litterRobot.getRobots(true);

        let robot = robots.find(element => {

            let uuid = UUIDGen.generate(element.litterRobotId);

            return (accessory.UUID === uuid);
        });


        let active = false;
        if (robot) {
            active = this.isStatusActive(robot.unitStatus);
        }
        callback(null, active);

    }

    isStatusFault(unitStatus) {
        let status = 1;
        switch(unitStatus) {
            case "DF1":
            case "DF2":
            case "DFS":
                status = 0;
                break;
            default:
                break;
        }

        return status;
    }

    async getStatusFault(accessory, callback) {
        this.log(accessory.displayName, "get Status Fault");

        let robots = await this.litterRobot.getRobots(true);

        let robot = robots.find(element => {

            let uuid = UUIDGen.generate(element.litterRobotId);

            return (accessory.UUID === uuid);
        });


        let fault = false;
        if (robot) {
            fault = this.isStatusFault(robot.unitStatus);
        }

        callback(null, fault);

    }

}