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

const convertedFolder = path.join(
    __dirname,
    "converted"
);

const uploadsFolder = path.join(
    __dirname,
    "uploads"
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

// Serve converted files
app.use(
    "/converted",
    express.static(convertedFolder)
);

// ======================================================
// FILE SIZE LIMIT
// ======================================================

const MAX_FILE_SIZE =
    200 * 1024 * 1024; // 200MB

// ======================================================
// MULTER UPLOAD SETUP
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
            !isValidYouTubeURL(videoUrl)
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

            console.log(videoUrl);

            await ytdlp(
                videoUrl,
                {
                    extractAudio: true,

                    audioFormat:
                        "mp3",

                    audioQuality:
                        "192K",

                    output:
                        outputTemplate,

                    noPlaylist:
                        true,

                    ffmpegLocation:
                        ffmpegPath,

                    noWarnings:
                        true
                }
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

            // Delete incomplete file
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
// UPLOADED VIDEO → MP3
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
                        success:
                            true,

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
// HOME TEST ROUTE
// ======================================================

app.get(
    "/api/status",
    (req, res) => {

        res.json({
            success: true,
            message:
                "Audio converter server is running"
        });
    }
);

// ======================================================
// SERVER
// ======================================================

// ======================================================
// SERVER
// ======================================================

app.listen(PORT, () => {
    console.log("=================================");
    console.log(`Server running on port ${PORT}`);
    console.log("=================================");
});