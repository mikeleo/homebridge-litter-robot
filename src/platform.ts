import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { LitterRobotPlatformAccessory } from './platformAccessory';
import {LitterRobot} from './litterRobot';
import {RobotData} from "./lib/litter-robot";
import Timeout = NodeJS.Timeout;

export interface LitterRobotPlatformConfig extends PlatformConfig {
  email?: string;
  password?: string;
  cacheDirectory?: string;
  debug?: boolean;
  pollingInterval?: number;
  hidePowerSwitch?: boolean;
  hideNightlightSwitch?: boolean;
  hideFilter?: boolean;
  hideOccupancySensor?: boolean;
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LitterRobotPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  // Local variables
  public readonly litterRobot: LitterRobot;
  protected interval?: Timeout;
  protected litterRobotAccessories: LitterRobotPlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: LitterRobotPlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.litterRobot = new LitterRobot({
      email: config.email,
      password: config.password,
      apiKey: config.apiKey,
      cacheDirectory: config.cacheDirectory || api.user.persistPath(),
      log: this.log,
      debug: config.debug || false,
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices().then(() => {

        if (config.pollingInterval) {
          const polling = config.pollingInterval;
          if (polling >= 5000) {
            this.interval = setInterval(this.updateValues.bind(this), polling);
          }
        }

      });


    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {

    const robots : RobotData[] = await this.litterRobot.getRobots(false);

    // loop over the discovered devices and register each one if it has not already been registered
    for (const robot of robots) {

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(robot.litterRobotId);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.robot = robot;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        this.litterRobotAccessories.push(new LitterRobotPlatformAccessory(this, existingAccessory));

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        this.addAccessory(robot, uuid);
      }
    }
  }

  addAccessory(robot: any, uuid: string) {

    // the accessory does not yet exist, so we need to create it
    this.log.info("Adding new accessory: " + robot.litterRobotNickname);

    const log = this.log;

    // create a new accessory
    const accessory = new this.api.platformAccessory(robot.litterRobotNickname, uuid);

    accessory.on('identify', () => {
      log.info(accessory.displayName, "Identify!!!");
    });

    // store a copy of the device object in the `accessory.context`
    // the `context` property can be used to store any data about the accessory you may need
    accessory.context.robot = robot;

    // create the accessory handler for the newly create accessory
    // this is imported from `platformAccessory.ts`
    this.litterRobotAccessories.push(new LitterRobotPlatformAccessory(this, accessory));

    // link the accessory to your platform
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

  }

  async updateValues() {
    const robots = await this.litterRobot.getRobots(false);

    // loop over the discovered devices and register each one if it has not already been registered
    for (const robot of robots) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(robot.litterRobotId);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingLitterRobotAccessory = this.litterRobotAccessories.find(lra => lra.accessory.UUID === uuid);

      if (existingLitterRobotAccessory) {
        await existingLitterRobotAccessory.updateValues(robot);
      }
    }
  }
}
