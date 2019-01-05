const axios = require('axios');
const storage = require('node-persist');

const userAgent = "Litter-Robot/1.0.5 (com.autopets.whisker.ios; build:29; iOS 12.1.2) Alamofire/4.5.1";

function addDebugging() {
    axios.interceptors.request.use(request => {
        console.log('Starting Request', request)
        return request
    });

    axios.interceptors.response.use(response => {
        console.log('Response:', response)
        return response
    });
}

class LitterRobot {
    constructor({email, password, apiKey}, cacheDirectory, logger, debug) {
        this.email = email;
        this.apiKey = apiKey;
        this.password = password;
        this.cacheDirectory = cacheDirectory;
        this.logger = logger || console;
        this.storageInit = false;
        this.callingService = false;

        if (debug) {
            addDebugging();
        }
    }

    async getRobots (useCache) {

        useCache = useCache || false;

        if (!this.storageInit) {
            await storage.init({
                dir: this.cacheDirectory,
            });
        }

        if (useCache) {
            let robots = await
                storage.getItem('robots');
            if (robots) {
                return robots;
            }
        }

        let auth = await this.getAuth();
        if (!auth) {
            return [];
        }

        if (this.callingService) {
            //Another loop is calling service so wait and get it's results
            while (this.callingService) {
                await this.sleep(20);
            }
            // Ignore useCache in this case
            let robots = await storage.getItem('robots');
            if (robots) {
                return robots;
            }
        }

        try {
            this.callingService = true;

            let response = await axios({
                method: 'get',
                url: `https://muvnkjeut7.execute-api.us-east-1.amazonaws.com/staging/users/${auth.user.userId}/litter-robots`,
                headers: {
                    "User-Agent": userAgent,
                    "x-api-key": this.apiKey,
                }
            });

            if (response.status !== 200) {
                this.logger.error(`Failed to retrieve status: ${response.status}`, response.data);
                return [];
            }

            await storage.setItem("robots", response.data, {ttl: 5 * 1000});

            return response.data;

        } finally {
            this.callingService = false;
        }
    };

    async getAuth() {
        let auth = await storage.getItem('auth');

        if (!auth || auth.status !== '200') {
            auth = await this.login();

            if (!auth) {
                this.logger.error("Unable to retrieve auth object");
                return null;
            }

            if (auth.status !== '200') {
                this.logger.error("Authorization failed: ", auth);
                return null;
            }

            await storage.setItem('auth', auth);
        }

        return auth;
    }

    async login() {

        let response = await axios({
            method: 'post',
            url: `https://muvnkjeut7.execute-api.us-east-1.amazonaws.com/staging/login`,
            headers: {
                "User-Agent": userAgent,
                "x-api-key": this.apiKey,
            },
            data: {
                oneSignalPlayerId: "0",
                password: this.password,
                email: this.email
            }
        });

        if (!response || response.status !== 200 || !response.data ) {
            response = response ||  {};
            this.logger.error(`Login failed: Status: ${response.status}`, response.data);
        }

        return response.data;
    }

    async setPower(robot, value) {
        let command = value ? "<P1" : "<P0";

        return await this.sendCommand(robot, command);
    }

    async setNightLight(robot, value) {
        let command = value ? "<N1" : "<N0";

        return await this.sendCommand(robot, command);
    }

    async sendCommand(robot, command) {
        let auth = await this.getAuth();
        if (!auth) {
            return [];
        }

        let response = await axios({
            method: 'post',
            url: `https://muvnkjeut7.execute-api.us-east-1.amazonaws.com/staging/users/${auth.user.userId}/litter-robots/${robot.litterRobotId}/dispatch-commands`,
            headers: {
                "User-Agent": userAgent,
                "x-api-key": this.apiKey,
            },
            data: {
                command: command,
                litterRobotId: robot.litterRobotId
            }
        });

        if (!response ||
            !(response.status == 200 || response.status == 201) ||
            !response.data ) {
            response = response ||  {};
            this.logger.error(`Update Power Failed: Status: ${response.status}`, response.data);
        }

        return response.data;
    }

    async sleep(ms){
        return new Promise(resolve=>{
            setTimeout(resolve,ms)
        })
    }
};

module.exports = LitterRobot;