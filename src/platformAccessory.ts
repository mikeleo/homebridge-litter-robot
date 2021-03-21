import { PlatformAccessory } from 'homebridge';

import { LitterRobotPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LitterRobotPlatformAccessory {

  constructor(
    private readonly platform: LitterRobotPlatform,
    public readonly accessory: PlatformAccessory,
  ) {

    const robot = accessory.context.robot;

    //// -----------------------------
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Name, robot.litterRobotNickname)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Litter Robot')
      .setCharacteristic(this.platform.Characteristic.Model, robot.litterRobotSerial.substring(0, 3))
      .setCharacteristic(this.platform.Characteristic.SerialNumber, robot.litterRobotSerial)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, '1.0');


    //1. Add Power Service

    // Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps

    let powerService = accessory.getServiceById(this.platform.Service.Switch, 'power');
    if (this.platform.config.hidePowerSwitch && powerService) {

      accessory.removeService(powerService);

    } else if (!this.platform.config.hidePowerSwitch) {

      if (!powerService) {
        powerService = accessory.addService(new this.platform.Service.Switch(`${accessory.displayName} Power`, 'power'));
      }
      powerService.getCharacteristic(this.platform.Characteristic.On)
        .on('set', (value, callback) => this.setSwitchStatus(accessory, powerService, value, callback))
        .on('get', (callback) => this.getSwitchStatus(accessory, powerService, callback));
    }

    //2. Add Nightlight Service
    let nightlightService = accessory.getServiceById(this.platform.Service.Switch, 'nightlight');
    if (this.platform.config.hideNightlightSwitch && nightlightService) {

      accessory.removeService(nightlightService);

    } else if (!this.platform.config.hideNightlightSwitch) {

      if (!nightlightService) {
        nightlightService = accessory.addService(new this.platform.Service.Switch(`${accessory.displayName} Night Light`, 'nightlight'));
      }

      nightlightService.getCharacteristic(this.platform.Characteristic.On)
        .on('set', (value, callback) => this.setSwitchStatus(accessory, nightlightService, value, callback))
        .on('get', (callback) => this.getSwitchStatus(accessory, nightlightService, callback));

    }

    //3. Fudge an Occupancy Sensor
    let occupancyService = accessory.getService(this.platform.Service.OccupancySensor);
    if (this.platform.config.hideOccupancySensor && occupancyService) {

      accessory.removeService(occupancyService);

    } else if (!this.platform.config.hideOccupancySensor) {

      if (!occupancyService) {
        occupancyService = accessory.addService(this.platform.Service.OccupancySensor, `${accessory.displayName} Capacity Sensor`);
      }
      occupancyService.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
        .on('get', (callback) => this.getCapacitySensor(accessory, callback));

      occupancyService.getCharacteristic(this.platform.Characteristic.StatusActive)
        .on('get', (callback) => this.getStatusActive(accessory, callback));

      occupancyService.getCharacteristic(this.platform.Characteristic.StatusFault)
        .on('get', (callback) => this.getStatusFault(accessory, callback));


      occupancyService.getCharacteristic(this.platform.Characteristic.Name)
        .on('get', callback => callback(null, `${accessory.displayName} CS Name`));

    }

    //4. Add Filter Details
    let filterService = accessory.getService(this.platform.Service.FilterMaintenance);
    if (this.platform.config.hideFilter && filterService) {

      accessory.removeService(filterService);

    } else if (!this.platform.config.hideFilter) {

      if (!filterService) {
        filterService = accessory.addService(this.platform.Service.FilterMaintenance, `${accessory.displayName} Capacity`);
      }
      filterService.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
        .on('get', (callback) => this.getCapacity(accessory, callback));
      filterService.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
        .on('get', (callback) => this.getCapacityChange(accessory, callback));
    }

    this.updateValues(robot);
  }


  updateValues(robot) {

    const accessory = this.accessory;
    accessory.context.robot = robot;

    const powerService = accessory.getServiceById(this.platform.Service.Switch, 'power');
    if (powerService) {
      const powerValue = robot.unitStatus !== 'OFF' && robot.unitStatus !== 'offline';
      powerService.updateCharacteristic(this.platform.Characteristic.On, powerValue);

    }

    const nightLightService = accessory.getServiceById(this.platform.Service.Switch, 'nightlight');
    if (nightLightService) {
      const nightlightValue = robot.nightLightActive === '1';
      nightLightService.updateCharacteristic(this.platform.Characteristic.On, nightlightValue);
    }


    //3. Fudge an Occupancy Sensor
    const occupancyService = accessory.getService(this.platform.Service.OccupancySensor);
    if (occupancyService) {
      const occupancy = robot.unitStatus.startsWith('DF');
      this.platform.log.debug(JSON.stringify(robot, null, 2));

      const active = this.isStatusActive(robot.unitStatus);
      const fault = this.isStatusFault(robot.unitStatus);

      occupancyService.updateCharacteristic(this.platform.Characteristic.OccupancyDetected, occupancy);
      occupancyService.updateCharacteristic(this.platform.Characteristic.StatusActive, active);
      occupancyService.updateCharacteristic(this.platform.Characteristic.StatusFault, fault);
    }

    //4. Add Filter Details
    const filterService = accessory.getService(this.platform.Service.FilterMaintenance);
    if (filterService) {
      const lifeLevel = Math.max(0.0, Math.floor(100.0 * (1.0 - (parseFloat(robot.cycleCount) / parseFloat(robot.cycleCapacity)))));
      filterService.updateCharacteristic(this.platform.Characteristic.FilterLifeLevel, lifeLevel);
      filterService.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, lifeLevel === 0.0);
    }
  }


  async getSwitchStatus(accessory, service, callback) {
    this.platform.log.debug(accessory.displayName, 'get Switch Value');

    const robots = await this.platform.litterRobot.getRobots(true);

    const robot = robots.find(element => {

      const uuid = this.platform.api.hap.uuid.generate(element.litterRobotId);

      return (accessory.UUID === uuid);
    });

    let value = false;
    if (robot) {
      if (service.subtype === 'power') {
        value = robot.unitStatus !== 'OFF' && robot.unitStatus !== 'offline';
      } else if (service.subtype === 'nightlight') {
        value = robot.nightLightActive === '1';
      }
    }
    callback(null, value);
  }

  async setSwitchStatus(accessory, service, value, callback) {
    this.platform.log.debug(accessory.displayName, `set ${service.subtype} -> ${value}`);

    const robots = await this.platform.litterRobot.getRobots(true);

    const robot = robots.find(element => {

      const uuid = this.platform.api.hap.uuid.generate(element.litterRobotId);

      return (accessory.UUID === uuid);
    });

    if (robot) {
      if (service.subtype === 'power') {
        await this.platform.litterRobot.setPower(robot, value);
      } else if (service.subtype === 'nightlight') {
        await this.platform.litterRobot.setNightLight(robot, value);
      }
    }
    callback();
  }

  async getCapacity(accessory, callback) {
    this.platform.log.debug(accessory.displayName, 'get Capacity');
    
    const robots = await this.platform.litterRobot.getRobots(true);

    const robot = robots.find(element => {

      const uuid = this.platform.api.hap.uuid.generate(element.litterRobotId);

      return (accessory.UUID === uuid);
    });

    let value = 1.0;
    if (robot) {
      value = Math.max(0.0, Math.floor(100.0 * (1.0 - (robot.cycleCount / robot.cycleCapacity))));
    }
    callback(null, value);
  }

  async getCapacityChange(accessory, callback) {

    this.getCapacity(accessory, (error, value) => {

      callback(null, value === 0.0);
    });
  }


  async getCapacitySensor(accessory, callback) {
    this.platform.log.debug(accessory.displayName, 'get getCapacitySensor');

    const robots = await this.platform.litterRobot.getRobots(true);

    const robot = robots.find(element => {

      const uuid = this.platform.api.hap.uuid.generate(element.litterRobotId);

      return (accessory.UUID === uuid);
    });


    let occupancy = false;
    if (robot) {
      occupancy = robot.unitStatus.startsWith('DF');
    }
    callback(null, occupancy);

  }

  isStatusActive(unitStatus) {
    let status = true;
    switch(unitStatus) {
      case 'offline':
      case 'OFF':
      case 'P':
      case 'BR':
        status = false;
        break;
      default:
        break;
    }

    return status;
  }

  async getStatusActive(accessory, callback) {
    this.platform.log.debug(accessory.displayName, 'get Status Active');

    const robots = await this.platform.litterRobot.getRobots(true);

    const robot = robots.find(element => {

      const uuid = this.platform.api.hap.uuid.generate(element.litterRobotId);

      return (accessory.UUID === uuid);
    });


    let active = false;
    if (robot) {
      active = this.isStatusActive(robot.unitStatus);
    }
    callback(null, active);

  }

  isStatusFault(unitStatus) {
    let status = false;
    switch(unitStatus) {
      case 'DF1':
      case 'DF2':
      case 'DFS':
        status = true;
        break;
      default:
        break;
    }

    return status;
  }

  async getStatusFault(accessory, callback) {
    this.platform.log.debug(accessory.displayName, 'get Status Fault');

    const robots = await this.platform.litterRobot.getRobots(true);

    const robot = robots.find(element => {

      const uuid = this.platform.api.hap.uuid.generate(element.litterRobotId);

      return (accessory.UUID === uuid);
    });
    
    let fault = false;
    if (robot) {
      fault = this.isStatusFault(robot.unitStatus);
    }

    callback(null, fault);

  }
  
}
