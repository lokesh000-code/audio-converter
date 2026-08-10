const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ytdlp = require("yt-dlp-exec");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// FFMPEG SETUP
// ======================================================

ffmpeg.setFfmpegPath(ffmpegPath);

// ======================================================
// YOUTUBE COOKIES SETUP
// ======================================================

const cookiesPath = path.join(
    __dirname,
    "youtube-cookies.txt"
);

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

if (process.env.YT_COOKIES_BASE64) {
    try {
        const cookiesData = Buffer.from(
            process.env.YT_COOKIES_BASE64,
            "base64"
        );

        fs.writeFileSync(
            cookiesPath,
            cookiesData
        );

        console.log(
            "YouTube cookies loaded ✅"
        );

        console.log(
            "Cookie file size:",
            fs.statSync(cookiesPath).size
        );

    } catch (error) {
        console.error(
            "Unable to load YouTube cookies:",
            error.message
        );
    }
} else {
    console.log(
        "YT_COOKIES_BASE64 not found ❌"
    );
}

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ======================================================
// FOLDERS
// ======================================================



if (!fs.existsSync(uploadsFolder)) {
    fs.mkdirSync(
        uploadsFolder,
        {
            recursive: true
        }
    );
}

// Serve converted files
app.use(
    "/converted",
    express.static(convertedFolder)
);

// ======================================================
// FILE SIZE LIMIT
// ======================================================

const MAX_FILE_SIZE =
    200 * 1024 * 1024;

// ======================================================
// MULTER SETUP
// ======================================================

const upload = multer({
    dest: uploadsFolder,

    limits: {
        fileSize: MAX_FILE_SIZE
    },

    fileFilter: (req, file, cb) => {
        if (
            !file.mimetype.startsWith(
                "video/"
            )
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
// CHECK YOUTUBE URL
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

    } catch (error) {
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
            req.body.url;

        if (!videoUrl) {
            return res
                .status(400)
                .json({
                    error:
                        "YouTube URL is required"
                });
        }

        if (
            !isValidYouTubeURL(
                videoUrl
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Please enter a valid YouTube URL"
                });
        }

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
                "Downloading YouTube video..."
            );

            console.log(
                videoUrl
            );

            const ytDlpOptions = {
                extractAudio: true,
                audioFormat: "mp3",
                audioQuality: "192K",
                output: outputTemplate,
                noPlaylist: true,
                ffmpegLocation: ffmpegPath,
                noWarnings: true
            };

           const os = require("os");

const cookiesPath = path.join(os.tmpdir(), "youtube-cookies.txt");
const convertedFolder = path.join(os.tmpdir(), "converted");
const uploadsFolder = path.join(os.tmpdir(), "uploads");
           

            await ytdlp(
                videoUrl,
                ytDlpOptions
            );

            if (
                !fs.existsSync(
                    finalMP3
                )
            ) {
                throw new Error(
                    "MP3 file was not created"
                );
            }

            console.log(
                "YouTube → MP3 complete ✅"
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
                fs.existsSync(
                    finalMP3
                )
            ) {
                fs.unlinkSync(
                    finalMP3
                );
            }

            return res
                .status(500)
                .json({
                    error:
                        "Unable to download or convert this YouTube video"
                });
        }
    }
);

// ======================================================
// UPLOAD VIDEO → MP3
// ======================================================

app.post(
    "/upload-convert",

    (req, res, next) => {
        upload.single("video")(
            req,
            res,
            (error) => {

                if (error) {
                    return res
                        .status(400)
                        .json({
                            error:
                                error.message
                        });
                }

                next();
            }
        );
    },

    (req, res) => {

        if (!req.file) {
            return res
                .status(400)
                .json({
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
// API STATUS
// ======================================================

app.get(
    "/api/status",
    (req, res) => {

        res.json({
            success: true,

            message:
                "Audio converter server is running",

            cookieVariablePresent:
                Boolean(
                    process.env
                        .YT_COOKIES_BASE64
                ),

            cookieFileExists:
                fs.existsSync(
                    cookiesPath
                )
        });
    }
);

// ======================================================
// SERVER
// ======================================================

app.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `YouTube cookies: ${
                fs.existsSync(
                    cookiesPath
                )
                    ? "LOADED ✅"
                    : "NOT LOADED ❌"
            }`
        );

        console.log(
            "================================="
        );
    }
);