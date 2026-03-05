const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 5500; 

app.use(cors());
app.use(express.json());
// Serves your frontend from the Public folder
app.use(express.static(path.join(__dirname, 'Public')));

const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

// 🧹 Background Cleanup: Deletes files older than 1 hour
setInterval(() => {
    fs.readdir(downloadDir, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(downloadDir, file);
            const stats = fs.statSync(filePath);
            if ((Date.now() - stats.mtimeMs) > 3600000) {
                fs.unlink(filePath, () => {});
            }
        });
    });
}, 1800000);

// 1. Fetch Video Details
app.post('/api/info', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    exec(`yt-dlp -j --no-playlist "${url}"`, (error, stdout) => {
        if (error) return res.status(500).json({ error: "Failed to fetch video. Check URL." });
        try {
            const info = JSON.parse(stdout);
            res.json({
                title: info.title,
                thumbnail: info.thumbnail,
                formats: ['360', '720', '1080']
            });
        } catch (e) {
            res.status(500).json({ error: "Parsing error" });
        }
    });
});

// 2. High-Speed Download with Real-time Progress (SSE)
app.get('/api/download', (req, res) => {
    const { url, quality } = req.query;
    const tempFile = path.join(downloadDir, `video_${Date.now()}.mp4`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const downloader = spawn('yt-dlp', [
        '-f', `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`,
        '--merge-output-format', 'mp4',
        '--newline',
        '-o', tempFile, 
        url
    ]);

    downloader.stdout.on('data', (data) => {
        const line = data.toString();
        const progressMatch = line.match(/(\d+\.\d+)%/);
        const speedMatch = line.match(/at\s+([\d.]+\w+\/s)/);

        if (progressMatch || speedMatch) {
            res.write(`data: ${JSON.stringify({ 
                progress: progressMatch ? progressMatch[1] : null,
                speed: speedMatch ? speedMatch[1] : null
            })}\n\n`);
        }
    });

    downloader.on('close', (code) => {
        if (code === 0) {
            res.write(`data: ${JSON.stringify({ complete: true, file: path.basename(tempFile) })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ error: true })}\n\n`);
        }
    });
});

// 3. File Transfer to IDM
app.get('/api/get-file/:name', (req, res) => {
    const filePath = path.join(downloadDir, req.params.name);
    res.download(filePath, (err) => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));