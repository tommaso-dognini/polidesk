# PoliWebex V2.0

**Advanced lecture recording downloader for Politecnico di Milano**

If you are not familiar with terminal, you can use this browser extension to download WebEx videos directly from the webpage: https://github.com/jacopo-j/WebXDownloader

If you need to download multiple videos at once and/or prefer a faster download through aria2c, go ahead with this project 😉

GUI Version: https://github.com/yuyu-19/PoliDL-GUI

---

## 🚀 What's New in V2.0

### Major Features
- **🔥 Parallel Downloads**: Download multiple videos simultaneously with automatic CPU-based optimization
- **📊 RecMan Metadata Extraction**: Automatically extracts and organizes metadata from RecMan recordings, creating a detailed markdown index
- **🎯 Interactive Mode**: New fully interactive mode when no CLI arguments are provided
- **⏭️ Smart Skip**: Skip already downloaded videos to avoid re-downloading (configurable)
- **🔗 URL-Only Extraction**: Extract WebEx URLs from RecMan/WeBeep courses without downloading
- **🌐 Automatic RCID Resolution**: Automatically resolves RCID redirect links using browser automation (NEW!)

### Improvements
- Better file parsing from txt files (handles empty lines and whitespace)
- Enhanced UI with colored output and progress indicators
- Configurable CPU usage for parallel downloads
- Automatic markdown index generation for course recordings
- Support for batch processing with detailed progress tracking

---

## Saves WebEx videos uploaded by Politecnico di Milano

### Core Features:
- ✅ Interactive SPID login (username and password saved securely in keyring)
- ✅ Download entire courses with webeep url (https://webeep.polimi.it/course/view.php?id=XXX)
- ✅ Download from RecMan/Aunica URLs with automatic WebEx URL extraction
- ✅ Parallel downloads with intelligent CPU management
- ✅ Password-protected video support
- ✅ Automatic metadata extraction and indexing

---

## PREREQUISITES

* [**Node.js**](https://nodejs.org/it/download/): above v14.0
* [**aria2**](https://github.com/aria2/aria2/releases): this needs to be in your `$PATH` (for example, copy aria2c.exe to c:\windows). PoliWebex calls `aria2c` with a bunch of arguments to improve download speed
* [**ffmpeg**](https://www.ffmpeg.org/download.html): a recent version (year 2019 or above), in [`$PATH`](https://www.thewindowsclub.com/how-to-install-ffmpeg-on-windows-10)

---

## Windows Installation Instructions

(On other OS it's pretty much the same)

**N.B:** ffmpeg.zeranoe.com closed since Sep 18, 2020. If you are following the video tutorial, download ffmpeg from another source available on [ffmpeg site](https://www.ffmpeg.org/download.html) (nightly build is no longer required)

This tutorial comes from my other project [PoliDown](https://github.com/sup3rgiu/PoliDown). The installation process is the same, just clone this repo (not PoliDown repo) and write "poliwebex" where in the video appears "polidown"

[![Installation Video](https://user-images.githubusercontent.com/7725068/76635345-a1cef600-6547-11ea-991b-d115946ed556.png)](http://www.youtube.com/watch?v=iZgea4t5YW4 "PoliDown Windows Installation Instructions")

---

## USAGE

* Clone this repo
* `cd` into the cloned folder
* `npm install` to install dependencies

### INTERACTIVE MODE (NEW in V2.0)

Simply run without arguments to enter interactive mode:
```bash
$ node poliwebex
```

You will be prompted to:
1. Choose how to provide URLs (single URL, multiple URLs, file path, or RecMan/WeBeep URL)
2. Configure output directory
3. Set parallel download options
4. Choose whether to skip existing files
5. Enable extract-only mode (if needed)

This is the easiest way to use PoliWebex if you're not familiar with command-line arguments!

---

### COMMAND LINE USAGE

#### Basic Usage

Download a single video:
```bash
$ node poliwebex -v "https://politecnicomilano.webex.com/webappng/sites/politecnicomilano/recording/play/VIDEO-ID"
```

Download from a text file (one URL per line):
```bash
$ node poliwebex -f "/path/to/links.txt"
```

Download entire course from WeBeep/RecMan:
```bash
$ node poliwebex -v "https://webeep.polimi.it/course/view.php?id=XXXXX"
```

#### Advanced Options

**Parallel Downloads (NEW)**

Use 4 parallel downloads:
```bash
$ node poliwebex -v "URL" -j 4
```

Disable parallel downloads (sequential mode):
```bash
$ node poliwebex -v "URL" -j 0
```

Auto mode with custom CPU limit:
```bash
$ node poliwebex -v "URL" -c 75  # Use up to 75% of CPU cores
```

**Extract URLs Only (NEW)**

Extract WebEx URLs from RecMan without downloading:
```bash
$ node poliwebex -v "https://webeep.polimi.it/course/view.php?id=XXXXX" -x
```

**Skip/Redownload Existing Files (NEW)**

Skip already downloaded videos (default behavior):
```bash
$ node poliwebex -v "URL" -s true
```

Force redownload even if file exists:
```bash
$ node poliwebex -v "URL" -s false
```

**Multiple Videos**

Download multiple specific videos:
```bash
$ node poliwebex -v "URL1" "URL2" "URL3"
```

**Custom Output Directory**

Specify where to save videos:
```bash
$ node poliwebex -v "URL" -o "/my/custom/path"
```

**Password-Protected Videos**

Provide password via command line:
```bash
$ node poliwebex -v "URL" -w "VIDEO_PASSWORD"
```

Or omit `-w` to be prompted interactively.

**Timeout Scaling**

For slow connections, scale timeout by factor X:
```bash
$ node poliwebex -v "URL" -i 2  # Double all timeout values
```

**Credentials**

Provide credentials via command line (will be saved in keyring):
```bash
$ node poliwebex -v "URL" -u "SPID_USERNAME" -p "SPID_PASSWORD" -e "name.surname@mail.polimi.it"
```

Disable keyring (don't save password):
```bash
$ node poliwebex -v "URL" -k
```

**Notifications**

Disable desktop notifications:
```bash
$ node poliwebex -v "URL" -t
```

---

### ALL COMMAND LINE OPTIONS

```
Options:
  --version                  Show version number                                      [boolean]
  -v, --videoUrls            Video URL(s) to download                                 [array]
  -f, --videoUrlsFile        Path to txt file containing URLs (one URL per line)      [string]
  -u, --SPIDusername         SPID username for authentication                         [string]
  -p, --SPIDpassword         SPID password for authentication                         [string]
  -e, --polimiEmail          PoliMi email (name.surname@mail.polimi.it)               [string]
  -o, --outputDirectory      Where to save downloaded videos          [string] [default: "videos"]
  -k, --noKeyring            Do not use system keyring                [boolean] [default: false]
  -t, --noToastNotification  Disable toast notification               [boolean] [default: false]
  -i, --timeout              Scale timeout by a factor X                              [number]
  -w, --videoPwd             Default video password                   [string] [default: ""]
  -x, --extract              Extract URLs only (no download)          [boolean] [default: false]
  -j, --parallelDownloads    Number of parallel downloads
                             (default: auto, 0 = disable)             [number] [default: null]
  -c, --maxCpu               Max CPU % for parallel downloads         [number] [default: 65]
  -s, --skipExisting         Skip already downloaded videos           [boolean] [default: true]
  -h, --help                 Show help                                                [boolean]
```

---

## USAGE EXAMPLES

### Example 1: Simple download
```bash
$ node poliwebex -v "https://politecnicomilano.webex.com/recordingservice/sites/politecnicomilano/recording/playback/abc123..."
```

### Example 2: Download from file with parallel downloads
```bash
$ node poliwebex -f "videos.txt" -j 6 -o "~/Lectures/Math"
```

### Example 3: Extract URLs from RecMan course
```bash
$ node poliwebex -v "https://webeep.polimi.it/course/view.php?id=12345" -x
```

### Example 4: Download with custom settings
```bash
$ node poliwebex -f "urls.txt" -j 4 -c 80 -s false -o "downloads"
```

### Example 5: Interactive mode (easiest!)
```bash
$ node poliwebex
# Then follow the prompts!
```

---

## TEXT FILE FORMAT

When using `-f` option, create a text file with one URL per line:

**Example `videos.txt`:**
```
https://politecnicomilano.webex.com/recordingservice/sites/politecnicomilano/recording/playback/abc123
https://politecnicomilano.webex.com/recordingservice/sites/politecnicomilano/recording/playback/def456
https://politecnicomilano.webex.com/recordingservice/sites/politecnicomilano/recording/playback/ghi789
```

**Notes:**
- Empty lines are automatically skipped
- Leading/trailing whitespace is trimmed
- Comments are not supported (every non-empty line is treated as a URL)

---

## RECMAN METADATA EXTRACTION (NEW in V2.0)

When downloading from RecMan/WeBeep course URLs, PoliWebex V2.0 automatically:
1. Extracts all recording metadata (date, course name, type, description, duration, size)
2. Generates **both** a Markdown and HTML index file
3. Creates links between metadata and downloaded files
4. Sorts recordings by date (newest first)

### Generated Index Files

**Three files are created:**
- `recordings_index.md` - Markdown format for text editors
- `recordings_index.html` - Beautiful HTML page with styling
- `recordings_metadata.json` - Metadata storage (auto-managed, do not edit manually)

### Features of Index Files

Each recording entry includes:
- Recording title and description
- Date and time of recording
- Course name
- Recording type (Lecture, Exam, etc.)
- Duration and file size
- **Two types of links:**
  - 🌐 **Online Link**: Opens the recording on WebEx (requires internet)
  - 💾 **Offline Link**: Opens the local file directly in Finder (Mac) or Explorer (Windows)

### HTML Index Features

The HTML file includes:
- Beautiful gradient design with card-based layout
- Hover effects on recordings
- Color-coded buttons (blue for online, green for offline)
- Responsive design for mobile and desktop
- Disabled state for files not yet downloaded

### How Offline Links Work

When you click "Open Local File":
- **Mac**: Opens the video in Finder and plays with QuickTime/VLC
- **Windows**: Opens the video in File Explorer and plays with default player
- **Direct playback**: No need to navigate through folders!

### Metadata Persistence & Merging (NEW!)

✅ **Index files now automatically merge with previous data**
- First run: Downloads 10 videos → Index shows 10 recordings
- Second run: Downloads 5 more videos → Index shows all 15 recordings!
- The system automatically merges new and existing metadata

**How it works:**
1. Metadata is saved to `recordings_metadata.json`
2. On each run, existing metadata is loaded
3. New recordings are added, existing ones are updated
4. MD and HTML files are regenerated with complete data

**Benefits:**
- ✅ Run the tool multiple times without losing data
- ✅ Add new recordings incrementally
- ✅ Update metadata for existing recordings
- ✅ Even if all videos are skipped (already downloaded), index files are still generated/updated

**Important:**
- If you delete a video file, the index will show "File Moved/Deleted"
- To rebuild from scratch, delete `recordings_metadata.json`
- The JSON file is the source of truth for the index

This makes it easy to organize and navigate your downloaded course materials!

---

## PARALLEL DOWNLOADS (NEW in V2.0)

### How It Works

PoliWebex V2.0 introduces intelligent parallel downloading:

**Auto Mode (default):**
- Automatically calculates optimal parallel downloads based on your CPU
- Default: uses 65% of available CPU cores
- Example: On an 8-core CPU with 65% limit = 5 parallel downloads

**Manual Mode:**
- Specify exact number: `-j 4` = 4 parallel downloads
- Disable parallel: `-j 0` = sequential downloads (one at a time)

**Custom CPU Limit:**
- Adjust auto calculation: `-c 80` = use up to 80% of CPU cores

### Performance Benefits

- **3-5x faster** for courses with multiple videos
- Intelligent error handling per video
- Non-blocking downloads (continue even if one fails)
- Progress tracking for each video

### Examples

Conservative (good for slow connections):
```bash
$ node poliwebex -f "videos.txt" -j 2
```

Aggressive (fast connection, powerful PC):
```bash
$ node poliwebex -f "videos.txt" -j 8 -c 90
```

Maximum safety (one at a time):
```bash
$ node poliwebex -f "videos.txt" -j 0
```

---

## EXPECTED OUTPUT

```
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

👨‍💻 Project powered by @sup3rgiu & @tommasodognini
🔧 Checking system requirements...

  ✓ aria2c found: aria2 version 1.36.0
  ✓ ffmpeg found: ffmpeg version 5.1.2

📋 Configuration:
  • Video URLs: 3 URL(s)
  • Output directory: videos
  • Parallel downloads: Auto (based on CPU: 65%)
  • Skip existing files: Yes

⚙️  Download configuration:
  • Parallel mode: Auto (5 downloads, 65% of 8 CPUs)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Starting download process: 3 video(s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Batch 1/1 — Processing 3 video(s) simultaneously

  ⬇  [1/3] Downloading: Lesson 2024_11_15 - Advanced Algorithms
      Starting aria2c download...
      ✓ Download completed: Lesson 2024_11_15 - Advanced Algorithms.mp4

  ⬇  [2/3] Downloading: Lesson 2024_11_20 - Data Structures
      Starting aria2c download...
      ✓ Download completed: Lesson 2024_11_20 - Data Structures.mp4

  ⬇  [3/3] Downloading: Lesson 2024_11_25 - Graph Theory
      Starting aria2c download...
      ✓ Download completed: Lesson 2024_11_25 - Graph Theory.mp4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Success! All 3 video(s) downloaded successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Done!
```

The videos are now saved under `videos/`, or whatever the `outputDirectory` argument points to.

---

## RCID LINK RESOLUTION (NEW in V2.0)

### What are RCID links?

RCID links are WebEx redirect URLs that look like this:
```
https://politecnicomilano.webex.com/politecnicomilano/ldr.php?RCID=abc123...
```

These links don't contain the actual video ID and need to be resolved to get the real recording URL.

### How V2.0 Handles RCID Links

**Automatic Resolution:**
1. First tries HTTP-based redirect extraction (fast)
2. If that fails, automatically opens browser to follow the JavaScript redirect
3. Extracts the final recording URL
4. Proceeds with download using the resolved URL

**You don't need to do anything!** Just include RCID links in your txt file alongside regular WebEx links, and V2.0 will handle them automatically.

### Example

Your `links.txt` can contain mixed URL types:
```
https://politecnicomilano.webex.com/recordingservice/sites/politecnicomilano/recording/playback/abc123...
https://politecnicomilano.webex.com/politecnicomilano/ldr.php?RCID=xyz789...
https://politecnicomilano.webex.com/webappng/sites/politecnicomilano/recording/play/def456...
```

All will be processed correctly!

---

## TROUBLESHOOTING

### Videos download too slowly
Try increasing parallel downloads:
```bash
$ node poliwebex -f "videos.txt" -j 8
```

### System feels sluggish during download
Reduce CPU usage or parallel downloads:
```bash
$ node poliwebex -f "videos.txt" -c 50  # Use only 50% of CPU
```
or
```bash
$ node poliwebex -f "videos.txt" -j 2  # Only 2 parallel downloads
```

### Download keeps failing
Try sequential mode:
```bash
$ node poliwebex -f "videos.txt" -j 0
```

### Login timeout issues
Scale up the timeout factor:
```bash
$ node poliwebex -v "URL" -i 3  # Triple timeout values
```

### Can't extract RecMan URLs
Make sure you're providing the correct WeBeep course URL format:
```
https://webeep.polimi.it/course/view.php?id=XXXXX
```

---

## CREDITS

- Original project: [@sup3rgiu](https://github.com/sup3rgiu)
- V2.0 enhancements: [@tommasodognini](https://github.com/tommasodognini)

Based on the excellent work from the PoliDown project.

---

## LICENSE

MIT License - See LICENSE file for details
