import axios from 'axios';
import storage from 'node-persist';
import fs from 'fs';
import {Logger} from 'homebridge';
import {LitterRobot as LitterRobotAPI, LitterRobotCommand, RobotData} from "./lib/litter-robot";

export class LitterRobot {

  private readonly api : LitterRobotAPI;
  private readonly cacheDirectory: string;
  private readonly log: Logger;
  private storageInit: boolean;
  private callingService: boolean;

  constructor({email, password, apiKey, cacheDirectory, log, debug}) {
    this.api = new LitterRobotAPI({
      credentials: {
        username: email,
        password: password,
      },
      log: log,
    });

    this.cacheDirectory = cacheDirectory + '/../litter';
    this.log = log;
    this.storageInit = false;
    this.callingService = false;

    if (debug) {
      this.addDebugging(log);
    }
  }

  addDebugging(log) {
    axios.interceptors.request.use(request => {
      log.info('Starting Request', request);
      return request;
    });

    axios.interceptors.response.use(response => {
      log.info('Response:', response);
      return response;
    });
  }

  async getRobots(useCache) : Promise<RobotData[]> {

    useCache = useCache || false;

    if (!this.storageInit) {
      if (!fs.existsSync(this.cacheDirectory)) {
        fs.mkdirSync(this.cacheDirectory);
      }
      await storage.init({
        dir: this.cacheDirectory,
      });
      this.storageInit = true;
    }

    if (useCache) {
      const robots : RobotData[] = await storage.getItem('robots');
      if (robots) {
        return robots;
      }
    }

    if (this.callingService) {
      //Another loop is calling service so wait and get it's results
      while (this.callingService) {
        await this.sleep(20);
      }
      // Ignore useCache in this case
      const robots : RobotData[] = await storage.getItem('robots');
      if (robots) {
        return robots;
      }
    }

    try {
      this.callingService = true;

      const robots = await this.api.fetchRobots();

      await storage.setItem('robots', robots, {ttl: 5 * 1000});

      return robots;

    } finally {
      this.callingService = false;
    }
  }

  async setPower(robot : RobotData, value : boolean) : Promise<void> {
    const command = value ? LitterRobotCommand.PowerOn : LitterRobotCommand.PowerOff;

    this.log.info(`Setting Litter Robot Power to ${value ? 'On' : 'Off'}`);

    return await this.api.sendCommand({
      litterRobotId: robot.litterRobotId,
      command,
    });
  }

  async setNightLight(robot : RobotData, value : boolean) : Promise<void> {
    const command = value ? LitterRobotCommand.NightLightOn : LitterRobotCommand.NightLightOff;

    this.log.info(`Setting Litter Robot Night Light to ${value ? 'On' : 'Off'}`);

    return await this.api.sendCommand({
      litterRobotId: robot.litterRobotId,
      command,
    });
  }

  async sendCycleCommand(robot) {
    return await this.api.sendCommand({
      litterRobotId: robot.litterRobotId,
      command: LitterRobotCommand.StartCleaning,
    });
  }

  async sleep(ms) : Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}