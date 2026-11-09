"use strict";

const execSync = require('child_process').execSync;
const spawnSync = require('child_process').spawnSync;
const spawn = require('child_process').spawn;
const puppeteer = require("puppeteer");
const term = require("terminal-kit").terminal;
const fs = require("fs");
const path = require("path");
const yargs = require("yargs");
const request = require('request');
const notifier = require('node-notifier');
var xml2js = require('xml2js');
var URL = require('url').URL; // for node.js version <= 8

const argv = yargs.options({
    v: { alias: 'videoUrls', type: 'array', demandOption: false },
    f: { alias: 'videoUrlsFile', type: 'string', demandOption: false, describe: 'Path to txt file containing the URLs (one URL for each line)' },
    u: { alias: 'SPIDusername', type: 'string', demandOption: false },
    e: { alias: 'polimiEmail', type: 'string', demandOption: false },
    p: { alias: 'SPIDpassword', type: 'string', demandOption: false },
    o: { alias: 'outputDirectory', type: 'string', default: 'videos' },
    k: { alias: 'noKeyring', type: 'boolean', default: false, demandOption: false, describe: 'Do not use system keyring' },
    t: { alias: 'noToastNotification', type: 'boolean', default: false, demandOption: false, describe: 'Disable toast notification' },
    i: { alias: 'timeout', type: 'number', demandOption: false, describe: 'Scale timeout by a factor X' },
    w: { alias: 'videoPwd', type: 'string', default: '', demandOption: false, describe: 'Default video password to use (you will be prompted to input the correct one if it\'s wrong or absent)' },
    x: { alias: 'extract', type: 'boolean', default: false, demandOption: false, describe: 'Just extract the links' },
    j: { alias: 'parallelDownloads', type: 'number', default: null, demandOption: false, describe: 'Number of parallel downloads (default: auto based on CPU, 0 = disable parallel downloads)' },
    c: { alias: 'maxCpu', type: 'number', default: 65, demandOption: false, describe: 'Maximum CPU usage percentage for parallel downloads (default: 65%)' },
    s: { alias: 'skipExisting', type: 'boolean', default: true, demandOption: false, describe: 'Skip already downloaded videos (default: true)' }
})
    .help('h')
    .alias('h', 'help')
    .example('node $0 -v "https://politecnicomilano.webex.com/recordingservice/sites/politecnicomilano/recording/playback/8de59dbf0a0345c6b525ed45a2c50607"\n', "Standard usage")
    .example('node $0 -f URLsList.txt\n', "Standard usage")
    .example('node $0 -v "URL1" "URL2"\n', "Multiple videos download")
    .example('node $0 -v "URL" -o "C:\\Lessons\\Videos"\n', "Define output directory")
    .example('node $0 -v "URL" -j 4\n', "Use 4 parallel downloads")
    .example('node $0 -v "URL" -j 0\n', "Disable parallel downloads")
    .example('node $0 -v "URL" -c 75\n', "Use up to 75% CPU for parallel downloads")
    .example('node $0 -v "URL" -s false\n', "Redownload existing videos (don't skip)")
    .example('node $0 -v "URL" -w PASSWORD\n', "Download password-protected video")
    .example('node $0 -v "URL" -i 2\n', "Double timeout value")
    .example('node $0 -v "URL" -k\n', "Do not save password in keyring")
    .example('node $0 -v "URL" -t\n', "Disable toast notifications")
    .argv;

function sanityChecks() {
    try {
        const aria2Ver = execSync('aria2c --version').toString().split('\n')[0];
        term.green(`  ✓ aria2c found: ${aria2Ver}\n`);
    } catch (e) {
        term.red('  ✗ aria2c not found!\n');
        term.yellow('    Please install aria2c and make sure it is in your $PATH\n');
        term.white('    Installation: https://aria2.github.io/\n');
        process.exit(22);
    }
    try {
        const ffmpegVer = execSync('ffmpeg -version').toString().split('\n')[0];
        term.green(`  ✓ ffmpeg found: ${ffmpegVer}\n`);
    } catch (e) {
        term.red('  ✗ ffmpeg not found!\n');
        term.yellow('    Please install ffmpeg and make sure it is in your $PATH\n');
        term.white('    Installation: https://ffmpeg.org/download.html\n');
        process.exit(23);
    }
    // Allow interactive mode if no URLs provided (will be handled later in main flow)
    if (argv.videoUrls !== undefined && argv.videoUrlsFile !== undefined) {
        term.red("Can't get URLs from both argument.\n");
        process.exit();
    }
    if (argv.videoUrlsFile !== undefined)
        argv.videoUrls = argv.videoUrlsFile; // merge argument

    if (argv.timeout !== undefined) {
        if (isNaN(argv.timeout) || argv.timeout < 0) {
            term.red("Incorrect timeout value. Insert a positive integer or float.\n");
            process.exit();
        } else {
            if (argv.timeout > 10) {
                term.red("This is a really big scale factor for the timeout value...\n");
                process.exit();
            } else {
                timeout = argv.timeout;
            }
        }
    }


    if (!fs.existsSync(argv.outputDirectory)) {
        if (path.isAbsolute(argv.outputDirectory) || argv.outputDirectory[0] == '~') console.log('Creating output directory: ' + argv.outputDirectory);
        else console.log('Creating output directory: ' + process.cwd() + path.sep + argv.outputDirectory);
        try {
            fs.mkdirSync(argv.outputDirectory, {
                recursive: true
            }); // use native API for nested directory. No recursive function needed, but compatible only with node v10 or later
        } catch (e) {
            term.red("Can not create nested directories. Node v10 or later is required\n");
            process.exit();
        }
    }

}

function readFileToArray(path) {
    // Remove surrounding quotes from JSON stringified path
    path = path.slice(1, -1);

    // Check if file exists
    if (!fs.existsSync(path)) {
        term.red(`\nError: File not found: ${path}\n`);
        term.yellow(`Please check that the file path is correct and the file exists.\n`);
        process.exit(1);
    }

    let lines;
    if (process.platform === "win32") //check OS
        lines = fs.readFileSync(path).toString('utf-8').split('\r\n'); //Windows procedure
    else
        lines = fs.readFileSync(path).toString('utf-8').split('\n'); //Bash procedure

    // Filter out empty lines and trim whitespace
    return lines.map(line => line.trim()).filter(line => line.length > 0);
}

function parseVideoUrls(videoUrls) {
    let stringVideoUrls = JSON.stringify(videoUrls);
    if (stringVideoUrls.substr(stringVideoUrls.length - 5) == ".txt\"") // is path?
        return readFileToArray(stringVideoUrls);
    return videoUrls;
}

const notDownloaded = []; // take trace of not downloaded videos
const allRecordingsMetadata = []; // Store metadata for all recordings
const webexUrlToFilename = {}; // Map WebEx URLs to local filenames
var timeout = 1;
var browser = null;

// Load existing metadata from JSON file
function loadExistingMetadata(outputDirectory) {
    const metadataPath = path.join(outputDirectory, 'recordings_metadata.json');
    if (fs.existsSync(metadataPath)) {
        try {
            const data = fs.readFileSync(metadataPath, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            term.yellow(`⚠️  Could not parse existing metadata file: ${e.message}\n`);
            return [];
        }
    }
    return [];
}

// Save metadata to JSON file
function saveMetadata(outputDirectory, metadata) {
    const metadataPath = path.join(outputDirectory, 'recordings_metadata.json');
    try {
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
        term.gray(`  ℹ  Metadata saved to: ${metadataPath}\n`);
    } catch (e) {
        term.red(`Error saving metadata: ${e.message}\n`);
    }
}

// Merge new metadata with existing ones (using webexUrl as unique key)
function mergeMetadata(existingMetadata, newMetadata) {
    const metadataMap = new Map();

    // Add existing metadata to map
    existingMetadata.forEach(item => {
        if (item.webexUrl) {
            metadataMap.set(item.webexUrl, item);
        }
    });

    // Add or update with new metadata
    newMetadata.forEach(item => {
        if (item.webexUrl) {
            // Update if exists, or add new
            metadataMap.set(item.webexUrl, {
                ...metadataMap.get(item.webexUrl),
                ...item
            });
        }
    });

    return Array.from(metadataMap.values());
}

async function interactiveMode() {
    term.brightCyan('\n🎯 Interactive Mode\n');
    term.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');

    term.white('How do you want to provide the video URLs?\n\n');
    term.cyan('  1) Enter a single URL\n');
    term.cyan('  2) Enter multiple URLs (separated by spaces)\n');
    term.cyan('  3) Provide a path to a text file (one URL per line)\n');
    term.cyan('  4) Enter a RecMan/WeBeep course URL\n\n');

    const choice = await promptChoice('Select an option (0-3): ', 4);
    let videoUrls = [];

    if (choice === 0) {
        const url = await promptQuestion('Enter the video URL: ');
        videoUrls = [url.trim()];
    } else if (choice === 1) {
        const urls = await promptQuestion('Enter video URLs (separated by spaces): ');
        videoUrls = urls.trim().split(/\s+/).filter(url => url.length > 0);
    } else if (choice === 2) {
        const filePath = await promptQuestion('Enter the path to the text file: ');
        videoUrls = readFileToArray(JSON.stringify(filePath.trim()));
    } else if (choice === 3) {
        const url = await promptQuestion('Enter the RecMan/WeBeep course URL: ');
        videoUrls = [url.trim()];
    }

    term.white('\n⚙️  Additional Options\n\n');

    // Ask for output directory
    const useDefaultOutput = await promptQuestion('Use default output directory (videos)? [Y/n]: ');
    if (useDefaultOutput.toLowerCase() === 'n') {
        argv.outputDirectory = await promptQuestion('Enter output directory path: ');
    }

    // Ask for parallel downloads
    const configParallel = await promptQuestion('Configure parallel downloads? [y/N]: ');
    if (configParallel.toLowerCase() === 'y') {
        const parallelChoice = await promptQuestion('Enter number of parallel downloads (or press Enter for auto): ');
        if (parallelChoice.trim() !== '') {
            argv.parallelDownloads = parseInt(parallelChoice);
            if (argv.parallelDownloads === 0) {
                term.yellow('  ℹ  Parallel downloads disabled - using sequential mode\n');
            }
        }

        if (argv.parallelDownloads === null || argv.parallelDownloads > 0) {
            const maxCpuChoice = await promptQuestion('Max CPU usage percentage (default: 65): ');
            if (maxCpuChoice.trim() !== '') {
                argv.maxCpu = parseInt(maxCpuChoice);
            }
        }
    }

    // Ask for skip existing
    const skipChoice = await promptQuestion('Skip already downloaded videos? [Y/n]: ');
    if (skipChoice.toLowerCase() === 'n') {
        argv.skipExisting = false;
    }

    // Ask for extract only mode
    const extractChoice = await promptQuestion('Only extract URLs without downloading? [y/N]: ');
    if (extractChoice.toLowerCase() === 'y') {
        argv.extract = true;
    }

    term.white('\n');

    return videoUrls;
}

async function resolveRCIDWithBrowser(rcidUrl) {
    try {
        term.cyan(`      🌐 Opening browser to resolve RCID redirect...\n`);

        // Open browser if not already open
        if (browser == null) {
            await openBrowser();
            // Need to login first
            var credentials = await askForCredentials(argv.SPIDpassword);
            await login(credentials, browser);
            await sleep(2000);
        }

        // Get or create a page
        let pages = await browser.pages();
        let page = pages.length > 0 ? pages[0] : await browser.newPage();

        term.gray(`      Navigating to RCID URL...\n`);
        // Navigate to RCID URL
        await page.goto(rcidUrl, { waitUntil: 'networkidle2', timeout: 15000 * timeout });

        // Wait for redirect to complete (check for recording URL)
        term.gray(`      Waiting for redirect...\n`);
        await page.waitForFunction(() => {
            return window.location.href.includes('/recordingservice/') ||
                   window.location.href.includes('/recording/playback/') ||
                   window.location.href.includes('/recording/play/') ||
                   window.location.href.includes('/webappng/sites/');
        }, { timeout: 15000 * timeout });

        await sleep(1000);

        // Get final URL
        const finalUrl = await page.url();

        if (finalUrl && finalUrl !== rcidUrl) {
            return finalUrl;
        }

        return null;
    } catch (e) {
        term.gray(`      Error resolving RCID: ${e.message}\n`);
        return null;
    }
}

async function downloadVideo(videoUrls, password, outputDirectory, videoPwd) {

    // Resolve all RCID links at the beginning
    term.white('\n🔍 Checking for RCID redirect links...\n');
    const rcidLinks = [];
    for (let i = 0; i < videoUrls.length; i++) {
        if (extractRCID(videoUrls[i]) != null) {
            rcidLinks.push({ index: i, url: videoUrls[i] });
        }
    }

    if (rcidLinks.length > 0) {
        term.cyan(`  ℹ  Found ${rcidLinks.length} RCID link(s) to resolve\n`);
        term.white('  🌐 Opening browser to resolve all RCID redirects...\n\n');

        // Open browser once for all RCID links
        if (browser == null) {
            await openBrowser();
            var credentials = await askForCredentials(password);
            await login(credentials, browser);
            await sleep(2000);
        }

        let page = (await browser.pages())[0];
        if (!page) {
            page = await browser.newPage();
        }

        // Resolve each RCID link using the same browser window
        for (let rcidLink of rcidLinks) {
            term.brightCyan(`  [${rcidLinks.indexOf(rcidLink) + 1}/${rcidLinks.length}] Resolving RCID: ${rcidLink.url.substring(0, 80)}...\n`);

            try {
                await page.goto(rcidLink.url, { waitUntil: 'networkidle2', timeout: 15000 * timeout });

                // Wait for redirect
                await page.waitForFunction(() => {
                    return window.location.href.includes('/recordingservice/') ||
                           window.location.href.includes('/recording/playback/') ||
                           window.location.href.includes('/recording/play/') ||
                           window.location.href.includes('/webappng/sites/');
                }, { timeout: 15000 * timeout });

                await sleep(500);

                const finalUrl = await page.url();
                if (finalUrl && finalUrl !== rcidLink.url) {
                    videoUrls[rcidLink.index] = finalUrl;
                    term.green(`      ✓ Resolved successfully\n`);
                } else {
                    term.red(`      ✗ Could not resolve, will skip this video\n`);
                    notDownloaded.push(rcidLink.url);
                }
            } catch (e) {
                term.red(`      ✗ Error: ${e.message}\n`);
                notDownloaded.push(rcidLink.url);
            }
        }

        term.green(`\n  ✓ RCID resolution complete!\n`);
    } else {
        term.gray('  ℹ  No RCID links found\n');
    }

    const recmanUrls = await extractRecmanUrls(videoUrls)
    if (recmanUrls.length > 0) {
        term.white('\n🎓 RecMan recordings detected\n');
        term.yellow(`  ℹ  Found ${recmanUrls.length} RecMan URL(s) - authentication required\n\n`);

        for (let recmanUrl of recmanUrls) {
            const result = await extractRecordingsUrl(recmanUrl)
            videoUrls = videoUrls.concat(result.webexUrls)
            allRecordingsMetadata.push(...result.recordingsWithUrls)
        }

        term.green("\n  ✓ Extraction complete!\n");
        term.white("  🌐 Closing browser and freeing resources...\n");
        if (browser != null) { await browser.close(); } // browser is no more required. Free up RAM!

        videoUrls = videoUrls.filter(url => !recmanUrls.includes(url)) // remove recman links not that we extracted the WebEx urls
        if (argv.extract === true) {
            term.white("\n📝 Extracted WebEx URLs:\n");
            videoUrls.forEach((url, idx) => {
                term.cyan(`  ${idx + 1}. ${url}\n`);
            });
            //The following line should be return if running as part of Poli-DL or process.exit(0) if standalone
            //process.exit(0)
            return
        }
        term.cyan(`\n  ℹ  Total videos to process: ${videoUrls.length}\n`);
    }

    // Calculate parallel downloads based on CPU
    term.white('\n⚙️  Download configuration:\n');
    const os = require('os');
    const numCPUs = os.cpus().length;
    let maxParallelDownloads;

    if (argv.parallelDownloads === 0) {
        // User explicitly disabled parallel downloads
        maxParallelDownloads = 1;
        term.yellow('  • Parallel mode: Disabled (sequential downloads)\n');
    } else if (argv.parallelDownloads !== null) {
        // User specified a number
        maxParallelDownloads = argv.parallelDownloads;
        term.green(`  • Parallel mode: Enabled (${maxParallelDownloads} simultaneous downloads)\n`);
    } else {
        // Auto-calculate based on CPU and maxCpu percentage
        maxParallelDownloads = Math.max(1, Math.floor(numCPUs * (argv.maxCpu / 100)));
        term.green(`  • Parallel mode: Auto (${maxParallelDownloads} downloads, ${argv.maxCpu}% of ${numCPUs} CPUs)\n`);
    }

    const cookie = await getCookies(password)


    var headers = {
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Safari/537.36",
        'Cookie': cookie,
        'accessPwd': videoPwd
    };

    var headers_json = { // copy headers and add 'Accept'
        ...headers,
        'Accept': "application/json, text/plain, */*"
    };


    // Function to process a single video
    const processVideo = async (videoUrl) => {
        if (videoUrl == "") return; // jump empty url

        if (!('accessPwd' in headers_json))
            headers_json['accessPwd'] = '';

        // RCID links should already be resolved at this point
        var videoID = extractVideoID(videoUrl);
        if (videoID === null) {
            term.red('\nCan\'t find video ID. Going to the next one.\n');
            notDownloaded.push(videoUrl);
            return;
        }

        var options = {
            url: 'https://politecnicomilano.webex.com/webappng/api/v1/recordings/' + videoID + '/stream?siteurl=politecnicomilano',
            headers: headers_json
        };

        try {
            var obj = JSON.parse(await doRequestAccept404(options));
        } catch (e) {
            term.red('\nError downloading this video. Going to the next one.\n');
            notDownloaded.push(videoUrl);
            return;
        }

        if (obj.code == 54001) {
            term.yellow('\nThis video does not exist. Going to the next one...\n');
            notDownloaded.push(videoUrl);
            return;
        }

        while (obj.code == 53005) {
            if (options.headers['accessPwd'] === '') {
                term.yellow('\nThis video is password protected:/' + (obj.recordName).trim() + '\n');
            }
            else {
                term.yellow('\nWrong password!/' + (obj.recordName).trim() + '\n');
            }

            var pwd = await promptQuestion("Please insert the password (or 0 to skip this video): ");
            options.headers['accessPwd'] = pwd;

            if (pwd == 0) {
                term.red('\nSkipped. Going to the next one.\n');
                notDownloaded.push(videoUrl);
                return;
            }

            try {
                obj = JSON.parse(await doRequestAccept404(options));
            } catch (e) {
                if (e.statusCode = 429)
                    term.red('\nToo many incorrect password attempts, please wait some time before trying again. Going to the next one.\n');
                else
                    term.red('\nError downloading this video. Going to the next one.\n');
                notDownloaded.push(videoUrl);
                return;
            }
        }

        if (notDownloaded.includes(videoUrl)) {
            return;
        }

        var title = (obj.recordName).trim();
        title = title.replace(/[/\\?%*:;|"<>]/g, '-');
        var isoDate = obj.createTime;
        if (isoDate !== null && isoDate !== '') {
            let date = new Date(isoDate);
            let year = date.getFullYear();
            let month = date.getMonth() + 1;
            let dt = date.getDate();

            if (dt < 10) {
                dt = '0' + dt;
            }
            if (month < 10) {
                month = '0' + month;
            }
            let uploadDate = year + '_' + month + '_' + dt;
            title = 'Lesson ' + uploadDate + ' - ' + title;
        }

        const fullTitle = title + '.mp4';
        const outputPath = path.join(argv.outputDirectory, fullTitle);

        // Check if file already exists
        if (argv.skipExisting && fs.existsSync(outputPath)) {
            term.yellow(`  ⊘ [${videoUrls.indexOf(videoUrl) + 1}/${videoUrls.length}] Skipped: "${fullTitle}" (already exists)\n`);
            return;
        }

        term.brightCyan(`\n  ⬇  [${videoUrls.indexOf(videoUrl) + 1}/${videoUrls.length}] Downloading: ${title}\n`);
        term.gray(`      Starting aria2c download...\n`);

        var newAPI = false;
        var xmlResponse = null;

        // Check if old API structure exists
        if (obj.mp4StreamOption && obj.mp4StreamOption.recordingDir) {
            const recordingDir = obj.mp4StreamOption.recordingDir
            const timestamp = obj.mp4StreamOption.timestamp
            const token = obj.mp4StreamOption.token
            const html5ApiUrl = 'https://nfg1vss.webex.com/apis/html5-pipeline.do?recordingDir=' + recordingDir + '&timestamp=' + timestamp + '&token=' + token + '&xmlName=recording.xml'

            try {
                var options = {
                    url: html5ApiUrl,
                };
                xmlResponse = await doRequest(options);
            } catch (e) {
                // Old API failed, try new API
                if ((obj.downloadRecordingInfo && obj.downloadRecordingInfo.downloadInfo && "mp4URL" in obj.downloadRecordingInfo.downloadInfo) || "fallbackPlaySrc" in obj) {
                    newAPI = true;
                } else {
                    term.red('\nCan\'t get current video XML-URL. Going to the next one.\n');
                    notDownloaded.push(videoUrl);
                    return;
                }
            }
        } else {
            // No mp4StreamOption, check if new API is available
            if ((obj.downloadRecordingInfo && obj.downloadRecordingInfo.downloadInfo && "mp4URL" in obj.downloadRecordingInfo.downloadInfo) || "fallbackPlaySrc" in obj) {
                newAPI = true;
            } else {
                term.red('\nCan\'t find download URL in response. Going to the next one.\n');
                term.gray(`      Response structure: ${JSON.stringify(Object.keys(obj))}\n`);
                notDownloaded.push(videoUrl);
                return;
            }
        }

        var filename = "";
        if (!newAPI) {
            const jsonObj = await xmlToJSON(xmlResponse, {})
            filename = jsonObj.HTML5Pipeline.RecordingXML[0].Screen[0].Sequence[0]._;

            if (!filename.endsWith(".mp4")) {
                term.red('\nCan\'t parse XML correctly. Going to the next one.\n');
                notDownloaded.push(videoUrl);
                return;
            }
        }

        var mp4DirectDownloadUrl_slow;
        if (newAPI) {
            if ("mp4URL" in obj.downloadRecordingInfo.downloadInfo)
                mp4DirectDownloadUrl_slow = obj.downloadRecordingInfo.downloadInfo.mp4URL;
            else
                mp4DirectDownloadUrl_slow = obj.fallbackPlaySrc;
        }
        else {
            mp4DirectDownloadUrl_slow = 'https://nfg1vss.webex.com/apis/download.do?recordingDir=' + recordingDir + '&timestamp=' + timestamp + '&token=' + token + '&fileName=' + filename;
        }

        const mp4DirectDownloadUrl_fast = obj.fallbackPlaySrc;
        var params = {
            mp4DirectDownloadUrl_slow: mp4DirectDownloadUrl_slow,
            mp4DirectDownloadUrl_fast: mp4DirectDownloadUrl_fast,
            title: title,
            videoUrl: videoUrl,
        }
        await directDownload(params);

        // Map WebEx URL to local filename for markdown generation
        webexUrlToFilename[videoUrl] = fullTitle;
    };

    // Download videos in parallel batches
    term.white(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    term.brightWhite(`📥 Starting download process: ${videoUrls.length} video(s)\n`);
    term.white(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (let i = 0; i < videoUrls.length; i += maxParallelDownloads) {
        const batch = videoUrls.slice(i, i + maxParallelDownloads);
        const batchNum = Math.floor(i / maxParallelDownloads) + 1;
        const totalBatches = Math.ceil(videoUrls.length / maxParallelDownloads);
        term.brightMagenta(`\n📦 Batch ${batchNum}/${totalBatches} — Processing ${batch.length} video(s) simultaneously\n`);

        await Promise.all(batch.map(url => processVideo(url)));
    }

    term.white(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    if (notDownloaded.length > 0) {
        term.yellow(`⚠️  Warning: ${notDownloaded.length} video(s) could not be downloaded:\n`);
        notDownloaded.forEach((url, idx) => {
            term.red(`  ${idx + 1}. ${url}\n`);
        });
    } else {
        term.brightGreen(`✓ Success! All ${videoUrls.length} video(s) downloaded successfully!\n`);
    }
    term.white(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Load existing metadata and merge with new ones
    term.brightWhite('\n📝 Processing recordings metadata...\n');
    const existingMetadata = loadExistingMetadata(argv.outputDirectory);

    if (existingMetadata.length > 0) {
        term.cyan(`  ℹ  Found ${existingMetadata.length} existing recording(s) in metadata\n`);

        // Populate webexUrlToFilename from existing metadata for files that already exist
        existingMetadata.forEach(recording => {
            if (recording.webexUrl && recording.localFilename) {
                const filePath = path.join(argv.outputDirectory, recording.localFilename);
                if (fs.existsSync(filePath)) {
                    webexUrlToFilename[recording.webexUrl] = recording.localFilename;
                }
            }
        });
    }

    // Add localFilename to new metadata
    allRecordingsMetadata.forEach(recording => {
        if (recording.webexUrl && webexUrlToFilename[recording.webexUrl]) {
            recording.localFilename = webexUrlToFilename[recording.webexUrl];
        }
    });

    // Merge metadata
    const mergedMetadata = mergeMetadata(existingMetadata, allRecordingsMetadata);

    if (allRecordingsMetadata.length > 0) {
        term.green(`  ✓ Added/updated ${allRecordingsMetadata.length} recording(s)\n`);
    }
    term.cyan(`  ℹ  Total recordings in index: ${mergedMetadata.length}\n`);

    // Save merged metadata to JSON
    saveMetadata(argv.outputDirectory, mergedMetadata);

    // Generate markdown and HTML index files if we have any metadata
    if (mergedMetadata.length > 0) {
        term.brightWhite('\n📝 Generating index files...\n');
        try {
            const markdownPath = path.join(argv.outputDirectory, 'recordings_index.md');
            const htmlPath = path.join(argv.outputDirectory, 'recordings_index.html');

            // Group recordings by date (newest first)
            const sortedRecordings = mergedMetadata.sort((a, b) => {
                // Parse dates in format DD/MM/YYYY HH:MM
                const parseDate = (dateStr) => {
                    const [datePart, timePart] = dateStr.split(' ');
                    const [day, month, year] = datePart.split('/');
                    return new Date(`${year}-${month}-${day} ${timePart || '00:00'}`);
                };
                return parseDate(b.date) - parseDate(a.date);
            });

            // Generate Markdown
            let markdownContent = '# Recordings Index\n\n';
            markdownContent += `Generated on: ${new Date().toLocaleString()}\n\n`;
            markdownContent += `Total recordings: ${mergedMetadata.length}\n\n`;
            markdownContent += '---\n\n';

            // Generate HTML
            let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recordings Index</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #2d3748;
            border-bottom: 3px solid #667eea;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .metadata {
            background: #f7fafc;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 4px solid #667eea;
        }
        .recording {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .recording:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .recording h2 {
            color: #667eea;
            margin-top: 0;
            margin-bottom: 15px;
            font-size: 1.5em;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-bottom: 15px;
        }
        .info-item {
            padding: 8px;
            background: #f7fafc;
            border-radius: 4px;
        }
        .info-label {
            font-weight: 600;
            color: #4a5568;
            font-size: 0.85em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .info-value {
            color: #2d3748;
            margin-top: 4px;
        }
        .links {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 15px;
        }
        .btn {
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
            border: none;
            cursor: pointer;
        }
        .btn-online {
            background: #667eea;
            color: white;
        }
        .btn-online:hover {
            background: #5568d3;
        }
        .btn-offline {
            background: #48bb78;
            color: white;
        }
        .btn-offline:hover {
            background: #38a169;
        }
        .btn-disabled {
            background: #cbd5e0;
            color: #718096;
            cursor: not-allowed;
        }
        .icon {
            width: 16px;
            height: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📚 Recordings Index</h1>
        <div class="metadata">
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total recordings:</strong> ${mergedMetadata.length}</p>
        </div>
`;

            for (const recording of sortedRecordings) {
                // Markdown
                markdownContent += `## ${recording.description || recording.type}\n\n`;
                markdownContent += `**Date:** ${recording.date}\n\n`;
                markdownContent += `**Course:** ${recording.course}\n\n`;
                markdownContent += `**Type:** ${recording.type}\n\n`;
                if (recording.description) {
                    markdownContent += `**Topic:** ${recording.description}\n\n`;
                }
                markdownContent += `**Duration:** ${recording.duration}\n\n`;
                markdownContent += `**Size:** ${recording.size}\n\n`;

                // HTML
                htmlContent += `        <div class="recording">
            <h2>${recording.description || recording.type}</h2>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Date</div>
                    <div class="info-value">${recording.date}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Course</div>
                    <div class="info-value">${recording.course}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Type</div>
                    <div class="info-value">${recording.type}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Duration</div>
                    <div class="info-value">${recording.duration}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Size</div>
                    <div class="info-value">${recording.size}</div>
                </div>
            </div>
`;

                // Check if local file exists (use localFilename from metadata or webexUrlToFilename mapping)
                const localFilename = recording.localFilename || webexUrlToFilename[recording.webexUrl];
                if (localFilename) {
                    const filePath = path.join(argv.outputDirectory, localFilename);
                    if (fs.existsSync(filePath)) {
                        const absolutePath = path.resolve(filePath);
                        const fileUrl = 'file://' + absolutePath;

                        // Markdown
                        markdownContent += `**Links:**\n`;
                        markdownContent += `- 🌐 [Online (WebEx)](${recording.webexUrl})\n`;
                        markdownContent += `- 💾 [Offline (Local File)](${fileUrl})\n\n`;

                        // HTML
                        htmlContent += `            <div class="links">
                <a href="${recording.webexUrl}" class="btn btn-online" target="_blank">
                    🌐 Watch Online (WebEx)
                </a>
                <a href="${fileUrl}" class="btn btn-offline">
                    💾 Open Local File
                </a>
            </div>
`;
                    } else {
                        // File in metadata but doesn't exist anymore
                        // Markdown
                        markdownContent += `**Links:**\n`;
                        markdownContent += `- 🌐 [Online (WebEx)](${recording.webexUrl})\n`;
                        markdownContent += `- 💾 Offline: File moved or deleted\n\n`;

                        // HTML
                        htmlContent += `            <div class="links">
                <a href="${recording.webexUrl}" class="btn btn-online" target="_blank">
                    🌐 Watch Online (WebEx)
                </a>
                <span class="btn btn-disabled">
                    💾 File Moved/Deleted
                </span>
            </div>
`;
                    }
                } else {
                    // Markdown
                    markdownContent += `**Links:**\n`;
                    markdownContent += `- 🌐 [Online (WebEx)](${recording.webexUrl})\n`;
                    markdownContent += `- 💾 Offline: File not downloaded\n\n`;

                    // HTML
                    htmlContent += `            <div class="links">
                <a href="${recording.webexUrl}" class="btn btn-online" target="_blank">
                    🌐 Watch Online (WebEx)
                </a>
                <span class="btn btn-disabled">
                    💾 Local File Not Available
                </span>
            </div>
`;
                }

                markdownContent += '---\n\n';
                htmlContent += '        </div>\n\n';
            }

            htmlContent += `    </div>
</body>
</html>`;

            fs.writeFileSync(markdownPath, markdownContent, 'utf8');
            fs.writeFileSync(htmlPath, htmlContent, 'utf8');
            term.green(`✓ Index files created:\n`);
            term.cyan(`  - Markdown: ${markdownPath}\n`);
            term.cyan(`  - HTML: ${htmlPath}\n`);
        } catch (error) {
            term.red(`Error creating index files: ${error.message}\n`);
        }
    }

    term.green(`Done!\n`);
    if (argv.noToastNotification === false) {
        require('node-notifier').notify({
            title: 'PoliWebex',
            message: 'DONE! See logs on terminal.',
            appID: "https://nodejs.org/", // Such a smart assignment to avoid SnoreToast start menu link. Don't say to my mother.
        }, function (error, response) { /*console.log(response);*/ });
    }

}

async function login(credentials, browser) {
    let page;

    page = (await browser.pages())[0]; // in non-headless mode, there is already a blank page. Reuse it
    if (page == null) { page = await browser.newPage(); } // safe check

    await page.setViewport({ width: 1366, height: 768 }); //set viewport size to enable QR code login on posteID
    console.log('Navigating to WebEx login page...');
    await page.goto('https://politecnicomilano.webex.com/mw3300/mywebex/login/login.do?siteurl=politecnicomilano-it&viewFrom=modern', {
        waitUntil: 'networkidle2'
    });

    await page.waitForSelector('input[type="email"]');
    await page.keyboard.type(credentials.email);
    await page.click('button[name="btnOK"]');

    console.log('Filling in Servizi Online login form...');
    try {
        await page.waitForSelector('input[id="login"]');
    } catch (error) {
        term.red("Timeout from attempting to login. We're already in non-headless mode, so we're kinda screwed.");
        process.exit(4);
    }
    await page.waitForSelector('#spid-idp-button-medium-post');
    await page.click('a[class="italia-it-button ingresso-federato-button-size-m button-spid"]');



    //const button = await page.$('button[name="evn_conferma"]');
    //await button.evaluate(b => b.click()); // clicca sul tasto "Accedi"
    var loginHandling = { "unInput": "username", "pwInput": "password" };
    await browser.waitForTarget(target => {
        var result = isSPIDPage(target.url());
        if (result === true) {
            console.log("No overrides.");
            return true;
        }
        else if (result.hasOwnProperty("pwInput")) {
            loginHandling = result;
            console.log("Overrides.");
            return true;
        }
    }, {
        timeout: 900000
    });

    var handler = page;
    if (loginHandling.hasOwnProperty("iframe")) {
        await page.waitForSelector(loginHandling.iframe);
        const elementHandle = await page.$('div#content iframe');
        handler = await elementHandle.contentFrame();
    }

    await handler.waitForSelector('input[id="' + loginHandling.unInput + '"]');

    await handler.type('input[id="' + loginHandling.unInput + '"]', credentials.SPIDusername)
    await handler.type('input[id="' + loginHandling.pwInput + '"]', credentials.password)

    console.log("input username&pw successfully");


    try {
        await page.waitForSelector('div[class="poli-messages"] > div[class="alert alert-danger"]', {
            timeout: 1000 * timeout
        });
        term.red('Must\'ve clicked on the polimi login button. Error.');
        process.exit(401);
    } catch (error) {
        // tutto ok
    }

    await browser.waitForTarget(target => target.url().includes("polimi.it"), {	//Wait until the user hands control back to polimi
        timeout: 9000000
    });

    try {
        await page.waitForSelector('button[name="evn_continua"]', {
            timeout: 1000 * timeout
        }); // password is expiring
        const button = await page.$('button[name="evn_continua"]');
        await button.evaluate(b => b.click()); // clicca sul tasto "Continua"
    } catch (error) {
        // password is not expiring
    }

    try {
        await page.waitForSelector('#dati_applicativi_autorizzazioniXSceltaMatricolaColl', {
            timeout: 2000 * timeout
        });
        await page.click('#dati_applicativi_autorizzazioniXSceltaMatricolaColl > tbody > tr:nth-child(1) > td:nth-child(1) > a'); // clicca sulla prima matricola
    } catch (error) {
        // scelta della matricola non apparsa, ok...
    }

    var currentIndex = 0;

    await browser.waitForTarget(target => target.url().includes('politecnicomilano.webex.com/'), {
        timeout: 90000
    });
    console.log('We are logged in. ');
    return page;
}

function isSPIDPage(targetSite) {
    console.log("Checking target...")
    console.log(targetSite)
    const targets = [
        "infocert.it",
        "poste.it",
        "tim.it",
        "sieltecloud.it",
        "aruba.it",
        "namirialtsp.com",
        "register.it",
        "intesa.it",
        "lepida.it",
    ];

    const overrides = [
        {
            "site": "tim.it",
            "unInput": "userid",
            "pwInput": "PASSWORD",
            "iframe": "iframe"
        },
        {
            "site": "namirialtsp.com",
            "unInput": "input_username",
            "pwInput": "input_password"
        },
        {
            "site": "intesa.it",
            "unInput": "MainContent_LoginForm_nome_utente",
            "pwInput": "MainContent_LoginForm_password"
        },
    ];

    for (const site of targets) {
        if (targetSite.includes(site) && !targetSite.includes("spid.polimi.it/spidlogin")) {
            console.log("Match found");
            var override = overrides.filter(o => o.site === site)
            if (override.length > 0) {
                return override[0];
            }
            else
                return true;
        }
    }
    return false;
}

async function directDownload(params) {
    let times = 5;
    var count = 0;
    while (count < times) { // make aria2 multithreading download more consistent and reliable
        try {
            // download async. I'm Speed
            const fullTitle = params.title + '.mp4';
            let mp4DirectDownloadUrl
            if (count < 2) {
                mp4DirectDownloadUrl = params.mp4DirectDownloadUrl_fast
            } else {
                term.yellow('Switching to fallback download URL, slower...\n\n');
                mp4DirectDownloadUrl = params.mp4DirectDownloadUrl_slow // fallback on slow url if the fast one doesn't work multiple times
            }

            // Use spawn instead of execSync for true parallel execution
            await new Promise((resolve, reject) => {
                // Cross-platform: Node.js automatically looks for .exe on Windows
                const aria2c = spawn('aria2c', [
                    '-j', '16',
                    '-x', '16',
                    '-d', argv.outputDirectory,
                    '-c',
                    '-o', fullTitle,
                    '--console-log-level=warn',  // Reduce aria2c output
                    '--summary-interval=0',       // Disable summary
                    '--max-tries=3',              // Limit retries
                    '--retry-wait=2',             // Wait between retries
                    mp4DirectDownloadUrl
                ], {
                    stdio: ['ignore', 'pipe', 'pipe'],  // Don't inherit stdio to avoid conflicts in parallel
                    shell: false // Use shell: false for better cross-platform compatibility
                });

                // Timeout for stalled downloads (30 minutes)
                const downloadTimeout = setTimeout(() => {
                    aria2c.kill('SIGTERM');
                    reject(new Error('Download timeout (30 minutes exceeded)'));
                }, 30 * 60 * 1000);

                // Capture output for error reporting
                let errorOutput = '';
                if (aria2c.stderr) {
                    aria2c.stderr.on('data', (data) => {
                        errorOutput += data.toString();
                    });
                }

                aria2c.on('close', (code) => {
                    clearTimeout(downloadTimeout);
                    if (code === 0) {
                        term.green(`      ✓ Download completed: ${fullTitle}\n`);
                        resolve();
                    } else {
                        reject(new Error(`aria2c exited with code ${code}${errorOutput ? ': ' + errorOutput : ''}`));
                    }
                });

                aria2c.on('error', (err) => {
                    clearTimeout(downloadTimeout);
                    reject(err);
                });
            });
        } catch (e) {
            term.yellow('\n\nOops! We lost some video fragment! Trying one more time...\n\n');
            count++;
            continue;
        }
        break;
    }
    if (count == times) {
        term.red('\nPersistent errors during the download of the current video. Going to the next one.\n');
        notDownloaded.push(params.videoUrl);
        return;
    }
    return;
}

async function extractRecmanUrls(videoUrls) {
    let videoUrlObj;
    const aunicaUrls = [];
    for (let videoUrl of videoUrls) {
        if (videoUrl == "") continue; // jump empty url

        videoUrlObj = new URL(videoUrl)
        if (videoUrlObj.host == 'aunicalogin.polimi.it' || videoUrlObj.host == 'webeep.polimi.it') {       // https://aunicalogin.polimi.it/aunicalogin/getservizio.xml?id_servizio=2294&c_classe_webeep=768632-STD || https://webeep.polimi.it/course/view.php?id=1322&section=3
            aunicaUrls.push(videoUrl)
        }
    }

    return aunicaUrls
}

async function extractRecordingsUrl(aunicalogin_url) {
    var page;
    const webexUrls = []
    if (browser == null) {
        var credentials = await askForCredentials(argv.SPIDpassword);
        await openBrowser()
        page = await login(credentials, browser);
        await sleep(3000 * timeout)
        const cookie = await extractCookies(page) // update WebEx cookies while we're at it.
        await saveCookies(cookie)
    } else {
        page = (await browser.pages())[0];
    }

    term.yellow('\nExtracting WebEx recordings from ' + aunicalogin_url + '\nThis could take a while...\n');

    if ((new URL(aunicalogin_url)).host == 'webeep.polimi.it') {
        aunicalogin_url = await getAunicaUrlFromWebeep(page, aunicalogin_url)
        if (aunicalogin_url == null) { return { webexUrls: [], recordingsWithUrls: [] }; }
    }

    await page.goto(aunicalogin_url, { waitUntil: 'networkidle2' });

    try { await page.waitForNavigation({ timeout: 7000 * timeout }) } catch (e) { };
    //await page.waitForNavigation();

    const extractedText = await page.$eval('*', (el) => el.innerText);
    //console.log(extractedText)
    await sleep(1000)

    const showAllRecordingsUrl = await page.evaluate(() => {
        const urlArray = Array.from(document.links).map((link) => link.href);
        console.log(urlArray + "\n");
        return urlArray.find((link) => link.includes("action=plen_0"))
    });

    //term.red("Here's the URL: " + showAllRecordingsUrl)

    // NEW: If no "show all" link found, check if we're already on the recordings page
    if (!showAllRecordingsUrl) {
        term.yellow("No 'show all recordings' link found. Checking if already on recordings page...\n");
        const currentUrl = page.url();
        if (currentUrl.includes('recman_frontend')) {
            term.green("Already on RecMan frontend page, proceeding with extraction...\n");
        } else {
            term.red("Cannot find recordings page. Aborting.\n");
            await page.screenshot({ path: 'recman_error.png', fullPage: true });
            return { webexUrls: [], recordingsWithUrls: [] };
        }
    } else {
        await page.goto(showAllRecordingsUrl, { waitUntil: 'networkidle2' });
    }

    //await page.waitForNavigation();

    await browser.waitForTarget(target => target.url().includes('recman_frontend'), {
        timeout: 90000
    });

    await page.screenshot({ path: 'recman_before_extract.png', fullPage: true });

    // Extract all evn_preview_link URLs and metadata from the table
    let recordingsData = await page.evaluate(() => {
        let tbody = document.getElementsByClassName('TableDati-tbody')[0];
        if (!tbody) {
            console.log("TableDati-tbody not found, trying alternative selectors...");
            tbody = document.querySelector('.TableDati tbody') ||
                    document.querySelector('table tbody') ||
                    document.querySelector('.TableDati');
        }

        if (!tbody) {
            console.log("No table body found!");
            return [];
        }

        // Extract all rows with their metadata
        const rows = tbody.getElementsByTagName('tr');
        const dataArray = [];

        for (let row of rows) {
            const cells = row.getElementsByTagName('td');
            if (cells.length < 6) continue; // Skip if row doesn't have enough cells

            // Find the preview link in the first cell
            const link = cells[0].getElementsByTagName('a')[0];
            if (!link || !link.href || !link.href.includes('evn_preview_link')) continue;

            // Extract metadata from cells
            const date = cells[1] ? cells[1].textContent.trim() : '';
            const course = cells[2] ? cells[2].textContent.trim() : '';
            const type = cells[3] ? cells[3].textContent.trim() : '';
            const description = cells[4] ? cells[4].textContent.trim() : '';
            const duration = cells[6] ? cells[6].textContent.trim() : '';
            const size = cells[7] ? cells[7].textContent.trim() : '';

            dataArray.push({
                url: link.href,
                date: date,
                course: course,
                type: type,
                description: description,
                duration: duration,
                size: size
            });

            console.log(`Found recording: ${date} - ${description || type}`);
        }

        console.log(`Total recordings found: ${dataArray.length}`);
        return dataArray;
    });

    term.brightGreen(`\n  ✓ Found ${recordingsData.length} recording(s) in RecMan table\n`);
    term.cyan('  🔗 Extracting WebEx URLs from preview links...\n');

    // Get all cookies from the browser (includes RecMan and WebEx auth)
    const allCookies = await page.cookies();

    // Build cookie string for HTTP requests
    const cookieString = allCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

    // Use request library to follow redirects
    const requestLib = require('request');

    // Array to store recordings with their WebEx URLs and metadata
    const recordingsWithUrls = [];

    for (let i = 0; i < recordingsData.length; i++) {
        const recording = recordingsData[i];
        term.white(`    [${i + 1}/${recordingsData.length}] Processing: ${recording.description || recording.type}...`);

        try {
            // Follow redirects and get final URL
            const finalUrl = await new Promise((resolve, reject) => {
                requestLib({
                    url: recording.url,
                    headers: {
                        'Cookie': cookieString,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    followRedirect: true,
                    followAllRedirects: true,
                    maxRedirects: 10
                }, (error, response, body) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    // Check if we got redirected to WebEx
                    const finalUrl = response.request.uri.href;

                    if (finalUrl.includes('politecnicomilano.webex.com/recordingservice') ||
                        finalUrl.includes('politecnicomilano.webex.com/webappng/sites')) {
                        resolve(finalUrl);
                    } else {
                        // Try to extract from body
                        let match = body.match(/(https?:\/\/politecnicomilano\.webex\.com\/recordingservice\/[^\s"'<>]+)/);
                        if (match) {
                            resolve(match[1].replace(/&amp;/g, '&'));
                        } else {
                            match = body.match(/location\.href\s*=\s*['"]([^'"]+webex[^'"]+)['"]/);
                            if (match) {
                                resolve(match[1].replace(/&amp;/g, '&'));
                            } else {
                                resolve(null);
                            }
                        }
                    }
                });
            });

            if (finalUrl) {
                term.green(` ✓\n`);
                webexUrls.push(finalUrl);
                recordingsWithUrls.push({
                    webexUrl: finalUrl,
                    ...recording
                });
            } else {
                term.red(` ✗ (URL not found)\n`);
            }

        } catch (e) {
            term.red(` ✗ (${e.message})\n`);
        }
    }

    term.brightGreen(`\n  ✓ Successfully extracted ${webexUrls.length}/${recordingsData.length} WebEx URL(s)\n`);

    // Store recordings with metadata for later use in markdown generation
    return { webexUrls, recordingsWithUrls }
}


async function getAunicaUrlFromWebeep(page, aunicalogin_url) {
    const recordings_xpath = "//a[contains(., 'Archivio registrazioni') or contains(., 'Recordings archive') or contains(., 'Registrazioni') or contains(., 'Recordings')]"
    const courseId = new URL(aunicalogin_url).searchParams.get('id');
    const origin = new URL(aunicalogin_url).origin;

    async function handleLogin() {
        try {
            await browser.waitForTarget(target => target.url().includes('login/index.php'), {
                timeout: 1000 * timeout
            });
            const xpath_expr = "//a[contains(@href, 'auth')]"
            await page.waitForXPath(xpath_expr);
            const button = (await page.$x(xpath_expr))[0];
            await button.evaluate(b => b.click());
        } catch (e) { }
        try { await page.waitForNavigation({ timeout: 2000 * timeout }) } catch (e) { };
        try { await page.waitForNavigation({ timeout: 2000 * timeout }) } catch (e) { };
    }

    async function hasError() {
        const title = await page.title().catch(() => '');
        return /errore|error/i.test(title);
    }

    // Search all links on the page for the aunica recordings URL.
    // Prefer URLs with c_classe_webeep (specific to recording archives).
    // Falls back to any getservizio.xml URL if none found with that param.
    async function extractAunicaUrl() {
        return page.evaluate(() => {
            const links = Array.from(document.getElementsByTagName('a')).map(a => a.href);
            const aunicaLinks = links.filter(h => h.includes("aunicalogin.polimi.it/aunicalogin/getservizio.xml"));
            return aunicaLinks.find(h => h.includes("c_classe_webeep")) || aunicaLinks[0] || null;
        });
    }

    // Navigate and look for the "Archivio registrazioni" text link
    async function tryPageForRecordingsLink(url) {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await handleLogin();
        if (await hasError()) return null;
        try {
            await page.waitForXPath(recordings_xpath, { timeout: 3000 * timeout });
            const anchors = await page.$x(recordings_xpath);
            return anchors.length > 0 ? anchors[0] : null;
        } catch (e) {
            return null;
        }
    }

    // Navigate and look for the aunica URL directly on the page (for section.php pages)
    async function tryPageForAunica(url) {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await handleLogin();
        if (await hasError()) return null;
        return extractAunicaUrl();
    }

    let anchor = null;

    // 1. Base course URL (no section param) — shows all sections on most courses
    term.yellow('  Trying base course URL...\n');
    anchor = await tryPageForRecordingsLink(aunicalogin_url);
    if (anchor) term.green('  Found recordings link on base page.\n');

    // 2. view.php&section=N for N in 0–9
    if (!anchor) {
        for (let s = 0; s <= 9; s++) {
            term.yellow('  Trying &section=' + s + '...\n');
            anchor = await tryPageForRecordingsLink(aunicalogin_url + '&section=' + s);
            if (anchor) { term.green('  Found recordings link in section ' + s + '.\n'); break; }
        }
    }

    // 3. section.php?id=<courseId> — try to find aunica URL directly, or a recordings link
    if (!anchor) {
        const sectionUrl = origin + '/course/section.php?id=' + courseId;
        term.yellow('  Trying section.php?id=' + courseId + '...\n');
        const directAunica = await tryPageForAunica(sectionUrl);
        if (directAunica) {
            term.green('  Found aunica URL directly on section.php page.\n');
            return directAunica;
        }
        anchor = await tryPageForRecordingsLink(sectionUrl);
        if (anchor) term.green('  Found recordings link on section.php page.\n');
    }

    // 4. Scan course page for all section.php links and probe each one
    if (!anchor) {
        term.yellow('  Scanning course page for section.php links...\n');
        await page.goto(aunicalogin_url, { waitUntil: 'networkidle2' });
        await handleLogin();
        const sectionLinks = await page.evaluate((origin) => {
            return Array.from(document.querySelectorAll('a[href*="section.php"]'))
                .map(a => a.href)
                .filter(h => h.startsWith(origin));
        }, origin);

        for (const slink of sectionLinks) {
            term.yellow('  Trying section link: ' + slink + '\n');
            const directAunica = await tryPageForAunica(slink);
            if (directAunica) {
                term.green('  Found aunica URL on section page: ' + slink + '\n');
                return directAunica;
            }
            if (!anchor) {
                anchor = await tryPageForRecordingsLink(slink);
                if (anchor) { term.green('  Found recordings link on: ' + slink + '\n'); break; }
            }
        }
    }

    if (!anchor) {
        term.red("\nCan't get the RecMan url. Did you submit the correct WeBeep link?\n");
        return null;
    }

    // Navigate to the recordings link destination and extract aunica URL
    const href = await page.evaluate(a => a.getAttribute('href'), anchor);
    await page.goto(href, { waitUntil: 'networkidle2' });
    return extractAunicaUrl();
}

async function getCookies(password) {
    let cookie = await getSavedCookies()
    let isValidCookie = await checkCookieValidity(cookie)
    if (cookie != null && isValidCookie) {
        term.brightBlue('Reusing saved cookies. No login required this time :)\n');
    } else {
        cookie = getNewCookies(password)
    }
    return cookie;
}

async function getSavedCookies() {
    return await getConfig('cookie')
}

async function checkCookieValidity(cookie) {
    const checkUrl = 'https://politecnicomilano.webex.com/webappng/api/v1/pmrs/recent' // use an endpoint that requires valid cookies
    var options = {
        url: checkUrl,
        headers: { 'Cookie': cookie, }
    };
    try {
        var response = await doRequest(options)
        try {
            var obj = JSON.parse(response)
            term.yellow("Cookie is valid\n");
            return true //Must be a valid json entry.
        } catch (e) {
            term.red("Cookie is not valid\n");
        }

    } catch (e) {
        //console.log(e.statusCode)
    }
    return false
}

async function getNewCookies(password) {
    var credentials = await askForCredentials(password);
    await openBrowser()

    if (argv.timeout !== undefined) {
        timeout = argv.timeout;
    }

    var page = await login(credentials, browser);
    await sleep(3000 * timeout)
    const cookie = await extractCookies(page)
    //console.log(cookie);
    await saveCookies(cookie)
    console.log('Got required authentication cookies.');
    console.log("\nAt this point Chrome's job is done, shutting it down...");
    await browser.close(); // browser is no more required. Free up RAM!
    return cookie;
}

async function saveCookies(cookies) {
    await addConfig('cookie', cookies)
}

async function extractCookies(page) {
    var jar = await page.cookies("https://.webex.com");
    var ticketCookie = jar.filter(c => c.name === 'ticket')[0];
    if (ticketCookie == null) {
        await sleep(5000);
        var jar = await page.cookies("https://.webex.com");
        var tiketCookie = jar.filter(c => c.name === 'ticket')[0];
    }
    if (ticketCookie == null) {
        console.error('Unable to read cookies. Try launching one more time, this is not an exact science.');
        process.exit(88);
    }
    return `ticket=${ticketCookie.value}`;
}

async function extractJSESSIONCookie(page) {
    var jar = await page.cookies("https://www11.ceda.polimi.it");
    var sessionCookie = jar.filter(c => c.name === 'SSL_JSESSIONID')[0];
    if (sessionCookie == null) {
        await sleep(5000);
        var jar = await page.cookies("https://www11.ceda.polimi.it");
        var sessionCookie = jar.filter(c => c.name === 'SSL_JSESSIONID')[0];
    }
    if (sessionCookie == null) {
        console.error('Unable to read session cookie. Try launching one more time, this is not an exact science.');
        process.exit(88);
    }
    return `SSL_JSESSIONID=${sessionCookie.value}`;
}




async function askForCredentials(password) {

    var SPIDusername = (argv.SPIDusername === undefined) ? '' : argv.SPIDusername;
    var email = (argv.polimiEmail === undefined) ? '' : argv.polimiEmail;
    var changed = false;
    var info = {}

    if (fs.existsSync('config.json')) {
        let rawdata = fs.readFileSync('config.json');
        info = JSON.parse(rawdata);

        if (SPIDusername !== '') {
            info.SPIDusername = SPIDusername;
            changed = true;
        } else if (info.hasOwnProperty('SPIDusername')) {
            SPIDusername = info.SPIDusername;
        } else {
            SPIDusername = await promptQuestion("SPID username/e-mail not saved. Please enter your SPID username/e-mail, PoliWebex will not ask for it next time: ");
            info.SPIDusername = SPIDusername;
            changed = true;
        }

        if (email !== '') {
            info.email = email;
            changed = true;
        } else if (info.hasOwnProperty('email')) {
            email = info.email;
        } else {
            email = await promptQuestion("PoliMi email not saved. Please enter your PoliMi email, in format \"name.surname@mail.polimi.it\", PoliWebex will not ask for it next time: ");
            info.email = email;
            changed = true;
        }
    } else {
        if (SPIDusername === '') {
            SPIDusername = await promptQuestion("SPID username/e-mail not saved. Please enter your SPID username/e-mail, PoliWebex will not ask for it next time: ");
        }
        info.SPIDusername = SPIDusername;

        if (email === '') {
            email = await promptQuestion("Email not saved. Please enter your PoliMi email, in format \"name.surname@mail.polimi.it\", PoliWebex will not ask for it next time: ");
        }
        info.email = email;

        changed = true;
    }

    // handle password
    const keytar = require('keytar');
    //keytar.deletePassword('PoliWebex', username);
    if (password === undefined) { // password not passed as argument
        var password = {};
        if (argv.noKeyring === false) {
            try {
                await keytar.getPassword("PoliWebexSPID", info.SPIDusername).then(function (result) {
                    password = result;
                });
                if (password === null) { // no previous password saved
                    password = await promptQuestion("Password not saved. Please enter your SPID password, PoliWebex will not ask for it next time: ");
                    await keytar.setPassword("PoliWebexSPID", info.SPIDusername, password);
                    info.passwordSaved = true;
                    changed = true;
                } else {
                    console.log("Reusing password saved in system's keychain!")
                }
            } catch (e) {
                console.log("X11 is not installed on this system. PoliWebex can't use keytar to save the password.")
                password = await promptQuestion("No problem, please manually enter your password: ");
            }
        } else {
            password = await promptQuestion("Please enter your password: ");
        }
    } else {
        if (argv.noKeyring === false) {
            try {
                await keytar.setPassword("PoliWebexSPID", info.SPIDusername, password);
                console.log("Your password has been saved. Next time, you can avoid entering it!");
                info.passwordSaved = true;
                changed = true;
            } catch (e) {
                // X11 is missing. Can't use keytar
            }
        }
    }

    if (changed) {
        info.SPID = true;
        var json = JSON.stringify(info, null, 4);
        fs.writeFileSync('config.json', json);
    }

    info.password = password;
    return info;
}


async function addConfig(key, value) {
    var info = {}

    if (fs.existsSync('config.json')) {
        let rawdata = fs.readFileSync('config.json');
        info = JSON.parse(rawdata)
    }

    info[key] = value
    var json = JSON.stringify(info, null, 4);
    fs.writeFileSync('config.json', json);
}

async function getConfig(key) {
    if (fs.existsSync('config.json')) {
        let rawdata = fs.readFileSync('config.json');
        var info = JSON.parse(rawdata);

        if (info.hasOwnProperty(key)) {
            return info[key]
        }
    }
    return null;
}

async function openBrowser() {
    if (browser !== null) { return; } // browser already running
    console.log('\nLaunching Chrome to perform the OpenID Connect dance...');

    var executablePath =
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        (process.pkg
            ? path.join(
                path.dirname(process.execPath),
                'puppeteer',
                ...puppeteer
                    .executablePath()
                    .split(path.sep)
                    .slice(puppeteer.executablePath().split(path.sep).indexOf('.local-chromium') + 1), // /snapshot/project/node_modules/puppeteer/.local-chromium
            )
            : puppeteer.executablePath());

    browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: false,
        args: ['--disable-dev-shm-usage', '--lang=it-IT']
    });
}


function doRequest(options) {
    return doRequestMain(options, false)
}

function doRequestAccept404(options) {
    return doRequestMain(options, true)
}

function doRequestMain(options, accept404) {
    return new Promise(function (resolve, reject) {
        request(options, function (error, res, body) {
            if (!error && (res.statusCode == 200 || res.statusCode == 403 || (accept404 && res.statusCode == 404))) {
                resolve(body);
            } else {
                if (!error) { // not an error but statusCode is not in the accepted ones
                    reject({ statusCode: res.statusCode });
                } else {
                    reject(error);
                }

            }
        });
    });
}

function xmlToJSON(str, options) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(str, options, (err, jsonObj) => {
            if (err) {
                return reject(err);
            }
            resolve(jsonObj);
        });
    });
}

function extractVideoID(videoUrl) {
    var url = new URL(videoUrl);
    var pathnameArray = url.pathname.split('/');
    for (let part of pathnameArray) {
        if (part.length == 32) {
            return part;
        }
        else if (part.length > 32) {
            var char32 = part.slice(0, 32)
            if (char32.match(/^[a-z0-9]+$/i)) // first 32 char are alphanumeric
                return char32;
        }
    }
    return null;
}

function extractRCID(videoUrl) {
    var url = new URL(videoUrl);
    return url.searchParams.get("RCID") || url.searchParams.get("rcid");
}

async function getRedirectUrl(options) {
    try {
        var body = await doRequest(options);
        const match = body.match(/location\.href='(.*?)';/);
        if (match && match[1]) {
            return match[1];
        }
        // Try alternative patterns
        const match2 = body.match(/location\.href="(.*?)";/);
        if (match2 && match2[1]) {
            return match2[1];
        }
        // Try window.location pattern
        const match3 = body.match(/window\.location\s*=\s*['"](.*?)['"]/);
        if (match3 && match3[1]) {
            return match3[1];
        }
        return null;
    } catch (e) {
        return null;
    }
}
function promptChoice(question, count) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(function (resolve, reject) {
        var ask = function () {
            rl.question(question, function (answer) {
                if (!isNaN(answer) && parseInt(answer) < count && parseInt(answer) >= 0) {
                    resolve(parseInt(answer), reject);
                    rl.close();
                } else {
                    console.log("\n* Wrong * - Please enter a number between 0 and " + (count - 1) + "\n");
                    ask();
                }
            });
        };
        ask();
    });
}

function promptQuestion(question) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(function (resolve, reject) {
        var ask = function () {
            rl.question(question, function (answer) {
                resolve(answer, reject);
                rl.close();
            });
        };
        ask();
    });
}


function rmDir(dir, rmSelf) {
    var files;
    rmSelf = (rmSelf === undefined) ? true : rmSelf;
    dir = dir + "/";
    try {
        files = fs.readdirSync(dir);
    } catch (e) {
        console.log("!Oops, directory not exist.");
        return;
    }
    if (files.length > 0) {
        files.forEach(function (x, i) {
            if (fs.statSync(dir + x).isDirectory()) {
                rmDir(dir + x);
            } else {
                fs.unlinkSync(dir + x);
            }
        });
    }
    if (rmSelf) {
        // check if caller wants to delete the directory or just the files in this directory
        fs.rmdirSync(dir);
    }
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// Display ASCII logo in orange
term.color256(208)(`
═══════════════════════════════════════════════════════════════════════

   ██████╗  ██████╗ ██╗     ██╗██╗    ██╗███████╗██████╗ ███████╗██╗  ██╗
   ██╔══██╗██╔═══██╗██║     ██║██║    ██║██╔════╝██╔══██╗██╔════╝╚██╗██╔╝
   ██████╔╝██║   ██║██║     ██║██║ █╗ ██║█████╗  ██████╔╝█████╗   ╚███╔╝
   ██╔═══╝ ██║   ██║██║     ██║██║███╗██║██╔══╝  ██╔══██╗██╔══╝   ██╔██╗
   ██║     ╚██████╔╝███████╗██║╚███╔███╔╝███████╗██████╔╝███████╗██╔╝ ██╗
   ╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚══╝╚══╝ ╚══════╝╚═════╝ ╚══════╝╚═╝  ╚═╝

                             VERSION 2.0

        Advanced lecture recording downloader for Politecnico Milano
        Features: SPID Login • Parallel Downloads • RecMan Support

═══════════════════════════════════════════════════════════════════════
`);
term.brightBlue(`\n👨‍💻 Project powered by @sup3rgiu & @tommasodognini\n`);
term.white(`🔧 Checking system requirements...\n\n`);
sanityChecks();

// Main async function to handle interactive mode
(async function() {
    let videoUrls;

    // Check if we need interactive mode
    if (argv.videoUrls === undefined) {
        videoUrls = await interactiveMode();
    } else {
        videoUrls = parseVideoUrls(argv.videoUrls);
    }

    term.white('\n📋 Configuration:\n');
    term.cyan(`  • Video URLs: ${videoUrls.length} URL(s)\n`);
    term.cyan(`  • Output directory: ${argv.outputDirectory}\n`);
    if (argv.parallelDownloads !== null) {
        term.cyan(`  • Parallel downloads: ${argv.parallelDownloads}\n`);
    } else {
        term.cyan(`  • Parallel downloads: Auto (based on CPU: ${argv.maxCpu}%)\n`);
    }
    term.cyan(`  • Skip existing files: ${argv.skipExisting ? 'Yes' : 'No'}\n`);
    if (argv.extract) {
        term.cyan(`  • Mode: Extract URLs only (no download)\n`);
    }
    term.white('\n');

    await downloadVideo(videoUrls, argv.SPIDpassword, argv.outputDirectory, argv.videoPwd);
})();
