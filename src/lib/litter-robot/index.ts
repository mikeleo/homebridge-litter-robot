import {
  ResourceOwnerPassword,
  PasswordTokenConfig,
  ModuleOptions, AccessToken,
} from 'simple-oauth2';
import axios from 'axios';
import Debug from 'debug';

export interface LitterRobotConfig<ClientIdName extends string = 'client_id'> {
    options?: ModuleOptions<ClientIdName>;
    credentials: PasswordTokenConfig;
    log?: Logger;
}

export interface Logger {
    debug(...any) : void;
    error(...any) : void;
}

export interface LitterRobotUser {
    user: {
        lastName: string;
        userEmail: string;
        userId: string;
        firstName: string;
    };
    litterRobots: [{
        litterRobotSerial: string;
        litterRobotNickName: string;
        userId: string;
        litterRobotId: string;
    }];
    mobileDevices: [{
        oneSignalPlayerId: string;
        version: string;
        userId: string;
        deviceId: string;
    }];
}

export interface RobotData {
    DFICycleCount: number;
    autoOfflineDisabled: boolean;
    cleanCycleWaitTimeMinutes: number;
    cycleCapacity: number;
    cycleCount: number;
    cyclesAfterDrawerFull: number;
    deviceType: string;
    didNotifyOffline: boolean;
    isDFITriggered: '0' | '1';
    isOnboarded: boolean;
    lastSeen: Date;
    litterRobotId: string;
    litterRobotNickname: string;
    litterRobotSerial: string;
    nightLightActive: '0' | '1';
    panelLockActive: '0' | '1'; //Maybe number
    powerStatus: string;
    setupDate: Date;
    sleepModeActive: string;
    sleepModeEndTime: string; //Maybe date
    sleepModeStartTime: string;
    sleepModeTime: any;
    unitStatus: string;
}

export enum LitterRobotCommand {
    StartCleaning = '<C',
    SetWaitTimeTo7Minutes = '<W7',
    SetWaitTimeTo3Minutes = '<W3',
    SetWaitTimeTo15Minutes = '<WF',
    PowerOff = '<P0',
    PowerOn = '<P1',
    NightLightOff = '<N0',
    NightLightOn = '<N1',
    SleepModeOff = '<S0',
    PanelLockOff = '<L0',
    PanelLockOn = '<L1',

}

export interface LitterRobotCommandRequest {
    litterRobotId: string;
    command: LitterRobotCommand;
}

export class LitterRobot<ClientIdName extends string = 'client_id'> {

    private LR_PARAMS = {
      endpoint: 'https://v2.api.whisker.iothings.site',
      token_endpoint: 'https://autopets.sso.iothings.site/oauth/token',
      client_id: 'IYXzWN908psOm7sNpe4G.ios.whisker.robots',
      client_secret: 'C63CLXOmwNaqLTB2xXo6QIWGwwBamcPuaul',
      x_api_key: 'p7ndMoj61npRZP5CVz9v4Uj0bG769xy6758QRBPb',
      user_agent: 'Litter-Robot/1.3.4 (com.autopets.whisker.ios; build:59; iOS 14.5.0) Alamofire/4.9.0',
    };

    private readonly options : ModuleOptions<ClientIdName>;
    private readonly credentials : PasswordTokenConfig;
    private readonly log : Logger;

    private accessToken? : AccessToken;
    private user? : LitterRobotUser;

    constructor(config : LitterRobotConfig<ClientIdName>) {
      this.options = {
        client: config.options?.client || {
          id: this.LR_PARAMS.client_id,
          secret: this.LR_PARAMS.client_secret,
        },
        auth: config.options?.auth || {
          tokenHost: this.LR_PARAMS.token_endpoint,
        },
        options: config.options?.options || {
          authorizationMethod: 'body',
        },
        http: config.options?.http || {
          user_agent: this.LR_PARAMS.user_agent,
        },
      };

      this.credentials = config.credentials;

      this.log = config.log ||
            {
              debug: Debug('litter-robot:debug'),
              error : Debug('litter-robot:error'),
            };
    }

    public async fetchToken() {

      const client = new ResourceOwnerPassword(this.options);

      try {
        const accessToken = await client.getToken(this.credentials);

        return accessToken;
      } catch (error) {
        this.log.error('Access Token Error', error.message);
      }
    }

    private async checkAccessToken() : Promise<boolean> {
      if (!this.accessToken) {
        this.accessToken = await this.fetchToken();
        return true;
      } else if (this.accessToken.expired(120)){
        this.accessToken = await this.accessToken.refresh();
        return true;
      }
      return false;
    }

    public async fetchUsers() : Promise<LitterRobotUser> {
      await this.checkAccessToken();

      const response = await axios({
        method: 'get',
        url: `${this.LR_PARAMS.endpoint}/users`,
        headers: {
          'User-Agent': this.LR_PARAMS.user_agent,
          'x-api-key': this.LR_PARAMS.x_api_key,
          'Authorization': this.accessToken?.token.access_token,
        },
      });

      return response.data as LitterRobotUser;
    }

    public async fetchRobots() : Promise<RobotData[]> {

      const refreshed = await this.checkAccessToken();

      if (refreshed || !this.user) {
        this.user = await this.fetchUsers();
      }

      const response = await axios({
        method: 'get',
        url: `${this.LR_PARAMS.endpoint}/users/${this.user?.user.userId}/robots`,
        headers: {
          'User-Agent': this.LR_PARAMS.user_agent,
          'x-api-key': this.LR_PARAMS.x_api_key,
          'Authorization': this.accessToken?.token.access_token,
        },
      });

      let robots : RobotData[] = [];
      if (response.data) {
        const dataRobots = response.data;

        robots = dataRobots.map(r =>
          Object.assign({}, r, {
            DFICycleCount: +r.DFICycleCount,
            cleanCycleWaitTimeMinutes: +r.cleanCycleWaitTimeMinutes,
            cycleCapacity: +r.cycleCapacity,
            cycleCount: +r.cycleCount,
            cyclesAfterDrawerFull: +r.cyclesAfterDrawerFull,
            lastSeen: this.parseISOString(r.lastSeen),
            setupDate: this.parseISOString(r.setupDate),
          }),
        );
      }

      return robots;
    }

    public async sendCommand( command: LitterRobotCommandRequest ) : Promise<any> {

      const refreshed = await this.checkAccessToken();

      if (refreshed || !this.user) {
        this.user = await this.fetchUsers();
      }

      let response = await axios({
        method: 'post',
        url: `${this.LR_PARAMS.endpoint}/users/${this.user?.user.userId}/robots/${command.litterRobotId}/dispatch-commands`,
        headers: {
          'User-Agent': this.LR_PARAMS.user_agent,
          'x-api-key': this.LR_PARAMS.x_api_key,
          'Authorization': this.accessToken?.token.access_token,
        },
        data: {
          command: command.command,
          litterRobotId: command.litterRobotId,
        },
      });

      if (!response ||
            !(response.status === 200 || response.status === 201) ||
            !response.data) {
        response = response || {};
        this.log.error(`Update Power Failed: Status: ${response.status}`, response.data);
      }

      return response.data;
    }

    private parseISOString(s) {
      const b = s.split(/\D+/);
      if (b.length >= 6) {
        return new Date(Date.UTC(b[0], --b[1], b[2], b[3], b[4], b[5]));
      } else {
        return Date.now();
      }
    }
}
