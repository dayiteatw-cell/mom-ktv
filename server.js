const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 靜態檔案服務 (直接對應 mom-ktv 目錄)
app.use(express.static(__dirname));

const SONGS_FILE = path.join(__dirname, 'songs.json');
const INDEX_HTML_FILE = path.join(__dirname, 'index.html');

// 預設歌單備份 (與 index.html 初始預設相同)
const DEFAULT_SONGS = [
    {
        title: "老歌要練",
        singer: "王林碧霞",
        number: "金29763",
        youtubeUrl: "https://youtu.be/3qOJapy7ujw?si=0MkfXS8pE4elXSI9"
    },
    {
        title: "家後",
        singer: "江蕙",
        number: "金12345",
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ"
    },
    {
        title: "愛拼才會贏",
        singer: "葉啟田",
        number: "音33221",
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ"
    },
    {
        title: "雙人枕頭",
        singer: "陳雷/陳盈潔",
        number: "金54321",
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ"
    }
];

// 讀取歌曲
async function getSongs() {
    try {
        const data = await fs.readFile(SONGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        // 檔案不存在，寫入預設歌單並回傳
        await fs.writeFile(SONGS_FILE, JSON.stringify(DEFAULT_SONGS, null, 4), 'utf8');
        return DEFAULT_SONGS;
    }
}

// 取得所有歌曲
app.get('/api/songs', async (req, res) => {
    try {
        const songs = await getSongs();
        res.json(songs);
    } catch (err) {
        res.status(500).json({ error: '無法讀取歌單', details: err.message });
    }
});

// 儲存所有歌曲
app.post('/api/songs', async (req, res) => {
    try {
        const songs = req.body;
        if (!Array.isArray(songs)) {
            return res.status(400).json({ error: '歌單必須是陣列格式' });
        }
        await fs.writeFile(SONGS_FILE, JSON.stringify(songs, null, 4), 'utf8');
        res.json({ success: true, count: songs.length });
    } catch (err) {
        res.status(500).json({ error: '儲存歌單失敗', details: err.message });
    }
});

// 重設歌單
app.post('/api/songs/reset', async (req, res) => {
    try {
        await fs.writeFile(SONGS_FILE, JSON.stringify(DEFAULT_SONGS, null, 4), 'utf8');
        res.json({ success: true, songs: DEFAULT_SONGS });
    } catch (err) {
        res.status(500).json({ error: '重設歌單失敗', details: err.message });
    }
});

// 一鍵同步推送到 GitHub Pages
app.post('/api/git-push', async (req, res) => {
    try {
        const songs = await getSongs();
        const indexContent = await fs.readFile(INDEX_HTML_FILE, 'utf8');

        // 定位並取代 index.html 中的標記區間
        const startMarker = '// BEGIN_DEFAULT_SONGS';
        const endMarker = '// END_DEFAULT_SONGS';
        
        const startIndex = indexContent.indexOf(startMarker);
        const endIndex = indexContent.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            return res.status(500).json({ error: '在 index.html 中找不到 DEFAULT_SONGS 標記區塊，請確認代碼標記是否正確。' });
        }

        const songsCodeString = `const DEFAULT_SONGS = ${JSON.stringify(songs, null, 8)};`;
        const updatedContent = 
            indexContent.substring(0, startIndex + startMarker.length) + 
            '\n        ' + songsCodeString + '\n        ' +
            indexContent.substring(endIndex);

        // 寫入更新後的 index.html
        await fs.writeFile(INDEX_HTML_FILE, updatedContent, 'utf8');

        // 執行 Git 推送 (先 staging 變更並 commit，以避免 pull rebase 時因未提交變更而失敗，再拉取並推送)
        const gitCmds = 'git add -A && (git diff-index --quiet HEAD || git commit -m "Update songs database and code [automated]") && git pull origin main --rebase && git push origin main';
        
        exec(gitCmds, { cwd: __dirname }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Git 執行錯誤: ${error}`);
                return res.status(500).json({ 
                    error: 'Git 推送失敗，請確認本地 Git 已登入且具備推送權限。', 
                    details: stderr || error.message 
                });
            }
            res.json({ success: true, log: stdout });
        });
    } catch (err) {
        res.status(500).json({ error: '同步作業失敗', details: err.message });
    }
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const localIps = [];

    for (const name in networkInterfaces) {
        for (const iface of networkInterfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIps.push(iface.address);
            }
        }
    }

    console.log(`\n==========================================`);
    console.log(`🎤 [Mom-KTV] 後台伺服器已啟動！`);
    console.log(`------------------------------------------`);
    console.log(`👉 電腦本機存取：http://localhost:${PORT}`);
    
    localIps.forEach(ip => {
        console.log(`👉 手機/平板同 Wi-Fi 存取：http://${ip}:${PORT}`);
    });
    console.log(`==========================================\n`);
});
