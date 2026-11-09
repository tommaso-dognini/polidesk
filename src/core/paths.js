'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');

const APP_DIR = process.env.POLIREC_HOME || path.join(os.homedir(), '.polirec');
fs.mkdirSync(APP_DIR, { recursive: true });

module.exports = {
    APP_DIR,
    PROFILE_DIR: path.join(APP_DIR, 'chrome-profile'),
    COOKIES_FILE: path.join(APP_DIR, 'cookies.json'),
    CONFIG_FILE: path.join(APP_DIR, 'config.json'),
    DEBUG_DIR: path.join(APP_DIR, 'debug'),
};
