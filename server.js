const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const ytdlp = require("yt-dlp-exec");

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// FFMPEG
// ======================================================

ffmpeg.setFfmpegPath(ffmpegPath);

// ======================================================
// TEMP FOLDERS
// ======================================================

// Railway/container-safe temporary storage
const convertedFolder = path.join(
    os.tmpdir(),
    "audio-converter-converted"
);

const uploadsFolder = path.join(
    os.tmpdir(),
    "audio-converter-uploads"
);

if (!fs.existsSync(convertedFolder)) {
    fs.mkdirSync(convertedFolder, {
        recursive: true
    });
}

if (!fs.existsSync(uploadsFolder)) {
    fs.mkdirSync(uploadsFolder, {
        recursive: true
    });
}

// ======================================================
// YOUTUBE COOKIES
// ======================================================

const railwayCookiesPath = path.join(
    os.tmpdir(),
    "youtube-cookies.txt"
);

const localCookiesPath = path.join(
    __dirname,
    "youtube-cookies.txt"
);

let cookiesPath = null;

console.log(
    "YT_COOKIES_BASE64 present:",
    Boolean(process.env.YT_COOKIES_BASE64)
);

console.log(
    "YT_COOKIES_BASE64 length:",
    process.env.YT_COOKIES_BASE64
        ? process.env.YT_COOKIES_BASE64.length
        : 0
);

// Railway cookies
if (process.env.YT_COOKIES_BASE64) {
    try {

        const cookiesData = Buffer.from(
            process.env.YT_COOKIES_BASE64,
            "base64"
        );

        fs.writeFileSync(
            railwayCookiesPath,
            cookiesData
        );

        cookiesPath = railwayCookiesPath;

        console.log(
            "Railway YouTube cookies loaded ✅"
        );

        console.log(
            "Cookie file size:",
            fs.statSync(cookiesPath).size
        );

    } catch (error) {

        console.error(
            "Unable to create Railway cookie file:",
            error.message
        );
    }
}

// Local Mac cookie file
else if (fs.existsSync(localCookiesPath)) {

    cookiesPath = localCookiesPath;

    console.log(
        "Local YouTube cookies loaded ✅"
    );
}

else {

    console.log(
        "YouTube cookies not available ❌"
    );
}

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());

app.use(
    express.json({
        limit: "2mb"
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ======================================================
// SERVE CONVERTED MP3
// ======================================================

app.use(
    "/converted",
    express.static(convertedFolder)
);

// ======================================================
// UPLOAD LIMIT
// ======================================================

const MAX_FILE_SIZE =
    200 * 1024 * 1024;

// ======================================================
// MULTER
// ======================================================

const upload = multer({

    dest: uploadsFolder,

    limits: {
        fileSize: MAX_FILE_SIZE
    },

    fileFilter: (req, file, cb) => {

        if (
            !file.mimetype ||
            !file.mimetype.startsWith("video/")
        ) {

            return cb(
                new Error(
                    "Only video files are allowed"
                )
            );
        }

        cb(null, true);
    }
});

// ======================================================
// VALIDATE YOUTUBE URL
// ======================================================

function isValidYouTubeURL(videoUrl) {

    try {

        const parsedURL =
            new URL(videoUrl);

        const hostname =
            parsedURL.hostname
                .toLowerCase()
                .replace(/^www\./, "");

        const allowedHosts = [
            "youtube.com",
            "youtu.be",
            "m.youtube.com",
            "music.youtube.com"
        ];

        return allowedHosts.includes(
            hostname
        );

    } catch {

        return false;
    }
}

// ======================================================
// YOUTUBE → MP3
// ======================================================

app.post(
    "/convert",
    async (req, res) => {

        const videoUrl =
            req.body.url?.trim();

        // ----------------------------------------------
        // Check URL
        // ----------------------------------------------

        if (!videoUrl) {

            return res.status(400).json({
                error:
                    "YouTube URL is required"
            });
        }

        if (
            !isValidYouTubeURL(videoUrl)
        ) {

            return res.status(400).json({
                error:
                    "Please enter a valid YouTube URL"
            });
        }

        // ----------------------------------------------
        // Unique file
        // ----------------------------------------------

        const id =
            crypto.randomUUID();

        const outputTemplate =
            path.join(
                convertedFolder,
                `${id}.%(ext)s`
            );

        const finalMP3 =
            path.join(
                convertedFolder,
                `${id}.mp3`
            );

        try {

            console.log(
                "================================="
            );

            console.log(
                "Downloading YouTube video..."
            );

            console.log(
                "URL:",
                videoUrl
            );

            // ------------------------------------------
            // yt-dlp options
            // ------------------------------------------

            const ytDlpOptions = {

                extractAudio: true,

                audioFormat: "mp3",

                audioQuality: "192K",

                output: outputTemplate,

                noPlaylist: true,

                ffmpegLocation:
                    ffmpegPath,

                noWarnings: true
            };

            // ------------------------------------------
            // Add cookies
            // ------------------------------------------

            if (
                cookiesPath &&
                fs.existsSync(cookiesPath)
            ) {

                ytDlpOptions.cookies =
                    cookiesPath;

                console.log(
                    "Using YouTube cookies ✅"
                );

                console.log(
                    "Cookie file:",
                    cookiesPath
                );

            } else {

                console.log(
                    "YouTube cookies not available ❌"
                );
            }

            // ------------------------------------------
            // Run yt-dlp
            // ------------------------------------------

            await ytdlp(
                videoUrl,
                ytDlpOptions
            );

            // ------------------------------------------
            // Verify MP3
            // ------------------------------------------

            if (
                !fs.existsSync(finalMP3)
            ) {

                throw new Error(
                    "MP3 file was not created"
                );
            }

            console.log(
                "YouTube → MP3 complete ✅"
            );

            console.log(
                "================================="
            );

            return res.json({

                success: true,

                audioUrl:
                    `/converted/${id}.mp3`
            });

        } catch (error) {

            console.error(
                "yt-dlp error:"
            );

            console.error(
                error.message
            );

            if (
                fs.existsSync(finalMP3)
            ) {

                fs.unlinkSync(
                    finalMP3
                );
            }

            return res.status(500).json({

                success: false,

                error:
                    "Unable to download or convert this YouTube video",

                details:
                    process.env.NODE_ENV ===
                    "development"
                        ? error.message
                        : undefined
            });
        }
    }
);

// ======================================================
// UPLOAD VIDEO → MP3
// ======================================================

app.post(
    "/upload-convert",

    // ----------------------------------------------
    // Upload
    // ----------------------------------------------

    (req, res, next) => {

        upload.single("video")(
            req,
            res,
            (error) => {

                if (error) {

                    return res
                        .status(400)
                        .json({

                            success: false,

                            error:
                                error.message
                        });
                }

                next();
            }
        );
    },

    // ----------------------------------------------
    // Convert
    // ----------------------------------------------

    (req, res) => {

        if (!req.file) {

            return res
                .status(400)
                .json({

                    success: false,

                    error:
                        "Please select a video"
                });
        }

        const id =
            crypto.randomUUID();

        const inputPath =
            req.file.path;

        const outputPath =
            path.join(
                convertedFolder,
                `${id}.mp3`
            );

        console.log(
            "Uploaded video received ✅"
        );

        console.log(
            "Converting uploaded video..."
        );

        ffmpeg(inputPath)

            .noVideo()

            .audioCodec(
                "libmp3lame"
            )

            .audioBitrate(
                "192k"
            )

            .format(
                "mp3"
            )

            // ------------------------------------------
            // Success
            // ------------------------------------------

            .on(
                "end",
                () => {

                    console.log(
                        "Upload conversion complete ✅"
                    );

                    if (
                        fs.existsSync(
                            inputPath
                        )
                    ) {

                        fs.unlinkSync(
                            inputPath
                        );
                    }

                    return res.json({

                        success: true,

                        audioUrl:
                            `/converted/${id}.mp3`
                    });
                }
            )

            // ------------------------------------------
            // Error
            // ------------------------------------------

            .on(
                "error",
                (error) => {

                    console.error(
                        "FFmpeg error:",
                        error.message
                    );

                    if (
                        fs.existsSync(
                            inputPath
                        )
                    ) {

                        fs.unlinkSync(
                            inputPath
                        );
                    }

                    if (
                        !res.headersSent
                    ) {

                        return res
                            .status(500)
                            .json({

                                success: false,

                                error:
                                    "Unable to convert uploaded video"
                            });
                    }
                }
            )

            .save(
                outputPath
            );
    }
);

// ======================================================
// STATUS
// ======================================================

app.get(
    "/api/status",
    (req, res) => {

        res.json({

            success: true,

            message:
                "Audio converter server is running",

            port:
                PORT,

            cookieVariablePresent:
                Boolean(
                    process.env
                        .YT_COOKIES_BASE64
                ),

            cookieFileExists:
                Boolean(
                    cookiesPath &&
                    fs.existsSync(
                        cookiesPath
                    )
                ),

            convertedFolder:
                convertedFolder,

            uploadsFolder:
                uploadsFolder
        });
    }
);

// ======================================================
// HOME FALLBACK
// ======================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

// ======================================================
// SERVER
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================="
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `YouTube cookies: ${
                cookiesPath &&
                fs.existsSync(cookiesPath)
                    ? "LOADED ✅"
                    : "NOT LOADED ❌"
            }`
        );

        console.log(
            `Converted folder: ${convertedFolder}`
        );

        console.log(
            `Uploads folder: ${uploadsFolder}`
        );

        console.log(
            "================================="
        );
    }
);