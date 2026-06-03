const fs = require('fs').promises;
const path = require('path');

const SONGS_FILE = path.join(__dirname, 'songs.json');
const RAW_FILE = path.join(__dirname, 'raw_songs.txt');

const he = {
    decode: (str) => {
        if (!str) return '';
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, ' ');
    }
};

function parseDetails(detailsStr) {
    if (!detailsStr) return { number: '', note: '' };
    
    detailsStr = detailsStr.trim();
    // Case 1: Number first (e.g. 451608音圓**讚)
    let match = detailsStr.match(/^([\d\+\/]+)\s*([^\d\s\*\+]*)(.*)$/);
    if (match && match[2] && ['音圓','金嗓','弘音','金','弘','國語','家庭','投幣','新歌'].some(k => match[2].includes(k))) {
        return {
            number: (match[2] + match[1]).trim(),
            note: (match[3] || '').trim()
        };
    }
    
    // Case 2: Brand/Type first (e.g. 弘音96008**)
    match = detailsStr.match(/^([^\d\s]*)\s*([\d\+\/]+)\s*(.*)$/);
    if (match) {
        return {
            number: (match[1] + match[2]).trim(),
            note: (match[3] || '').trim()
        };
    }
    
    return { number: '', note: detailsStr };
}

function cleanTitle(htmlTitle) {
    if (!htmlTitle) return { title: '未知名歌曲', singer: '群星' };
    
    let title = he.decode(htmlTitle);
    
    // 移除 YouTube 結尾
    title = title.replace(/\s*-\s*YouTube$/, '');
    
    // 移除各式括號內容
    title = title.replace(/【[^】]*】/g, ' ');
    title = title.replace(/\[[^\]]*\]/g, ' ');
    title = title.replace(/\([^)]*\)/g, ' ');
    title = title.replace(/（[^）]*）/g, ' ');
    
    // 移除常見關鍵字
    const removeKeywords = [
        '卡拉OK', '伴唱', 'KTV', '原聲原影', '官方', 'HD', '1080P', '字幕', '左右聲道', 
        '導唱', '弘音', '金嗓', '音圓', '瑞影', 'MV', '高畫質', '經典老歌', '珍藏版',
        'L/R', '伴奏', '立體聲', '雙聲道', '原唱'
    ];
    removeKeywords.forEach(kw => {
        const regex = new RegExp(kw, 'gi');
        title = title.replace(regex, ' ');
    });
    
    title = title.replace(/\s+/g, ' ').trim();
    
    // 依據常見的 - 或 _ 拆分歌手與歌名
    const splitRegex = /\s*[-_]\s*/;
    const parts = title.split(splitRegex).map(p => p.trim()).filter(p => p.length > 0);
    
    let songTitle = '';
    let singer = '';
    
    if (parts.length >= 2) {
        // 標準格式：歌手 - 歌名
        singer = parts[0];
        songTitle = parts.slice(1).join(' - ');
        
        // 修正：有時上傳者會寫「歌名 - 歌手」，通常歌手名字長度較短 (一般為 2~4 字)
        // 若歌手長度大於 8 且歌名長度小於 5，可能是反過來了
        if (singer.length > 7 && songTitle.length > 0 && songTitle.length <= 4) {
            const temp = singer;
            singer = songTitle;
            songTitle = temp;
        }
    } else if (parts.length === 1) {
        songTitle = parts[0];
        singer = '群星';
    } else {
        songTitle = '未知名歌曲';
        singer = '群星';
    }
    
    return { title: songTitle, singer: singer };
}

// 取得 YouTube 網頁 Title
async function fetchYoutubeTitle(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超時
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return null;
        
        const html = await response.text();
        const match = html.match(/<title>(.*?)<\/title>/i);
        return match ? match[1] : null;
    } catch (err) {
        console.error(`無法獲取網址標題: ${url} - ${err.message}`);
        return null;
    }
}

async function start() {
    try {
        // 1. 讀取現有 songs.json
        let existingSongs = [];
        try {
            const existingData = await fs.readFile(SONGS_FILE, 'utf8');
            existingSongs = JSON.parse(existingData);
            console.log(`讀取到現有歌曲 ${existingSongs.length} 首。`);
        } catch (e) {
            console.log(`未找到 existing songs.json，將建立新檔。`);
        }
        
        // 2. 讀取 raw_songs.txt
        const rawContent = await fs.readFile(RAW_FILE, 'utf8');
        const lines = rawContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // 解析連結與詳情
        const rawItems = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('http')) {
                const url = line;
                let details = '';
                if (i + 1 < lines.length && !lines[i + 1].startsWith('http')) {
                    details = lines[i + 1];
                    i++;
                }
                rawItems.push({ url, details });
            }
        }
        
        console.log(`共解析出 ${rawItems.length} 筆歌曲待匯入資料。`);
        
        // 3. 逐一獲取與處理
        const importedSongs = [];
        let successCount = 0;
        
        for (let idx = 0; idx < rawItems.length; idx++) {
            const item = rawItems[idx];
            console.log(`[${idx + 1}/${rawItems.length}] 正在處理: ${item.url}`);
            
            // 檢查是否已存在（相同 YouTube 網址）
            const isDuplicate = existingSongs.some(s => s.youtubeUrl === item.url);
            if (isDuplicate) {
                console.log(`  -> 網址重複，跳過。`);
                continue;
            }
            
            // 獲取網頁標題
            let ytTitle = null;
            if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) {
                ytTitle = await fetchYoutubeTitle(item.url);
            }
            
            // 智慧解析歌手與歌名
            let parsed = cleanTitle(ytTitle);
            
            // 解析編號與備註
            const details = parseDetails(item.details);
            
            // 組合新歌曲
            let songNumber = details.number || "無編號";
            if (songNumber.startsWith("金弘")) {
                songNumber = songNumber.replace("金弘", "金嗓弘音");
            } else {
                if (songNumber.startsWith("弘") && !songNumber.startsWith("弘音")) {
                    songNumber = songNumber.replace("弘", "弘音");
                }
                if (songNumber.startsWith("金") && !songNumber.startsWith("金嗓")) {
                    songNumber = songNumber.replace("金", "金嗓");
                }
            }
            
            const newSong = {
                title: parsed.title,
                singer: parsed.singer,
                number: songNumber,
                youtubeUrl: item.url
            };
            
            // 檢查備註內是否有指明歌手 (例如 "七郎的")
            if (details.note) {
                // 如果備註有 "xx的"，代表歌手是 xx
                const deMatch = details.note.match(/(.*?)[的唱]/);
                if (deMatch && deMatch[1]) {
                    newSong.singer = deMatch[1].trim();
                }
                // 保留備註在歌手或另外處理？因為原資料庫結構無 note 欄位，我們將備註加在歌名後面或編號後面
                // 這裡我們直接加在編號後方括弧，例如 "弘88044 (七郎的)"
                if (details.note !== '**') {
                    newSong.number = `${newSong.number} (${details.note})`;
                }
            }
            
            existingSongs.push(newSong);
            successCount++;
            
            // 避免被 YouTube 封鎖，間隔 300 毫秒
            await new Promise(r => setTimeout(r, 300));
        }
        
        // 4. 寫回 songs.json
        await fs.writeFile(SONGS_FILE, JSON.stringify(existingSongs, null, 4), 'utf8');
        console.log(`\n==========================================`);
        console.log(`🎉 匯入完成！`);
        console.log(`成功新增: ${successCount} 首歌曲`);
        console.log(`目前歌單總數: ${existingSongs.length} 首`);
        console.log(`==========================================`);
        
    } catch (err) {
        console.error("執行匯入出錯:", err);
    }
}

start();
