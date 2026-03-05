const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
// This line makes 'public/index.html' viewable at http://localhost:5000
app.use(express.static(path.join(__dirname, 'public')));

// 1. Fetch Video Metadata
app.post('/api/info', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    // Use yt-dlp to get JSON metadata
    exec(`yt-dlp -j --no-playlist "${url}"`, (error, stdout) => {
        if (error) {
            console.error(error);
            return res.status(500).json({ error: "Check if URL is valid or if yt-dlp is installed" });
        }
        const info = JSON.parse(stdout);
        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            formats: ['360', '720', '1080']
        });
    });
});

// 2. Stream Video to Browser
app.get('/api/download', (req, res) => {
    const { url, quality } = req.query;
    const filename = `video_${Date.now()}.mp4`;

    res.header('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream directly from yt-dlp to the user
    const downloader = spawn('yt-dlp', [
        '-f', `bestvideo[height<=${quality}]+bestaudio/best`,
        '--merge-output-format', 'mp4',
        '-o', '-', 
        url
    ]);

    downloader.stdout.pipe(res);
    
    downloader.stderr.on('data', (data) => console.log(`yt-dlp log: ${data}`));
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log(`🚀 Open your browser and go to http://localhost:${PORT}`);
});