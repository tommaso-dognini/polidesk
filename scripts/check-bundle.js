// electron-builder afterPack hook: refuse to ship an app without its Rust backend.
// (A missing resources/bin/polideskd makes the installed app fail at launch with "spawn … ENOENT".)
'use strict';
const fs = require('fs');
const path = require('path');

exports.default = async function checkBundle(ctx) {
    const win = ctx.electronPlatformName === 'win32';
    const res = ctx.electronPlatformName === 'darwin'
        ? path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(ctx.appOutDir, 'resources');
    for (const b of ['polideskd', 'polidesk']) {
        const p = path.join(res, 'bin', b + (win ? '.exe' : ''));
        if (!fs.existsSync(p)) throw new Error(`${p} mancante: esegui «node scripts/build-rust.js» (o «npm run dist:mac», che lo fa da solo)`);
    }
};
