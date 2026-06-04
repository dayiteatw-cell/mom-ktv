const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. 修改 parseAndPreviewLineInput 初始化狀態
const target1 = `                    // 如果沒有歌手，或者解析出的標題只是垃圾字元，預設為待獲取狀態\\r?\\n                    if \\(title === "" \\|\\| title === "弘"\\) \\{\\r?\\n                        title = "正在自動抓取標題...";\\r?\\n                    \\}\\r?\\n\\r?\\n                    tempParsedSongs\\.push\\(\\{\\r?\\n                        title: title,\\r?\\n                        singer: singer,\\r?\\n                        number: number,\\r?\\n                        youtubeUrl: songUrl\\r?\\n                    \\}\\);`;

const replacement1 = `                    // 如果沒有歌手，或者解析出的標題只是垃圾字元，預設為待獲取狀態
                    if (title === "" || title === "弘") {
                        title = "正在自動抓取標題...";
                    }

                    const isSongKing = songUrl.includes('song.corp.com.tw') || songUrl.includes('song.tw-net.com') || songUrl.includes('/mv.aspx?id=');
                    if (isSongKing) {
                        singer = '正在自動抓取...';
                        title = '正在自動抓取標題...';
                    }

                    tempParsedSongs.push({
                        title: title,
                        singer: singer,
                        number: number,
                        youtubeUrl: songUrl
                    });`;

const regex1 = new RegExp(target1);
if (!regex1.test(content)) {
    console.error("Error: Target 1 not found in index.html!");
    process.exit(1);
}
content = content.replace(regex1, replacement1);
console.log("Success: Target 1 replaced!");

// 2. 修改 fetchSongYoutubeMetadata 函式
const target2 = `async function fetchSongYoutubeMetadata\\(idx\\) \\{[\\s\\S]*?\\}\\r?\\n\\r?\\n\\s*(\\/\\/ 智能 YouTube)`;
const regex2 = new RegExp(target2);

const replacement2 = `async function fetchSongYoutubeMetadata(idx) {
            const song = tempParsedSongs[idx];
            if (!song || !song.youtubeUrl) return;

            const statusEl = document.getElementById(\`ip-status-\${idx}\`);
            const singerInput = document.getElementById(\`ip-singer-\${idx}\`);
            const titleInput = document.getElementById(\`ip-title-\${idx}\`);
            const numberInput = document.getElementById(\`ip-num-\${idx}\`);
            const urlInput = document.getElementById(\`ip-url-\${idx}\`);

            if (statusEl) {
                statusEl.innerText = "⏳ 抓取網址中...";
                statusEl.style.color = "var(--info)";
            }

            let urlToFetch = song.youtubeUrl;
            const isSongKing = urlToFetch.includes('song.corp.com.tw') || urlToFetch.includes('song.tw-net.com') || urlToFetch.includes('/mv.aspx?id=');

            if (isSongKing) {
                let fetchedTitle = "";
                let fetchedYoutubeUrl = "";
                let fetchedNumber = "";

                // 管道 1：本機伺服器模式，呼叫我們的後台 API
                if (isServerMode) {
                    try {
                        const res = await fetch(\`/api/parse-song-king?url=\${encodeURIComponent(urlToFetch)}\`);
                        if (res.ok) {
                            const data = await res.json();
                            fetchedTitle = data.rawTitle;
                            fetchedYoutubeUrl = data.youtubeUrl;
                            fetchedNumber = data.songNumber;
                        }
                    } catch (e) {
                        console.warn("後台點歌王解析失敗，嘗試靜態 CORS 代理...", e);
                    }
                }

                // 管道 2：靜態模式/ fallback，呼叫 allorigins.win CORS 代理
                if (!fetchedTitle) {
                    try {
                        const allOriginsUrl = \`https://api.allorigins.win/get?url=\${encodeURIComponent(urlToFetch)}\`;
                        const res = await fetch(allOriginsUrl);
                        if (res.ok) {
                            const data = await res.json();
                            const html = data.contents;
                            
                            // 1) 解析標題
                            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                            fetchedTitle = titleMatch ? titleMatch[1] : '';

                            // 2) 解析 YouTube URL
                            const ytIdMatch = html.match(/(?:youtube\\.com|youtu\\.be)\\/(?:watch\\?v=|embed\\/|v\\/)?([a-zA-Z0-9_-]{11})/i);
                            const youtubeId = ytIdMatch ? ytIdMatch[1] : null;
                            if (youtubeId) {
                                fetchedYoutubeUrl = \`https://www.youtube.com/watch?v=\${youtubeId}\`;
                            }

                            // 3) 解析歌號
                            const songIdMatch = urlToFetch.match(/[?&]id=(\\d+)/);
                            if (songIdMatch && songIdMatch[1]) {
                                const songId = songIdMatch[1];
                                const codeApiUrl = \`https://song.corp.com.tw/api/song.aspx?s=getCodeListByID&songDetailID=\${songId}\`;
                                const codeProxyUrl = \`https://api.allorigins.win/get?url=\${encodeURIComponent(codeApiUrl)}\`;
                                try {
                                    const codeRes = await fetch(codeProxyUrl);
                                    if (codeRes.ok) {
                                        const codeData = await codeRes.json();
                                        const codes = JSON.parse(codeData.contents);
                                        if (Array.isArray(codes) && codes.length > 0) {
                                            const formatNum = (item) => {
                                                let prefix = item.company || '';
                                                if (prefix.startsWith('弘音')) prefix = '弘音';
                                                else if (prefix.startsWith('金嗓')) prefix = '金嗓';
                                                else if (prefix.startsWith('音圓')) prefix = '音圓';
                                                return \`\${prefix}\${item.code}\`;
                                            };
                                            const hongYin = codes.find(c => c.company && c.company.startsWith('弘音'));
                                            if (hongYin) {
                                                fetchedNumber = formatNum(hongYin);
                                            } else {
                                                const jinSang = codes.find(c => c.company && c.company.startsWith('金嗓'));
                                                if (jinSang) {
                                                    fetchedNumber = formatNum(jinSang);
                                                } else {
                                                    const yinYuan = codes.find(c => c.company && c.company.startsWith('音圓'));
                                                    if (yinYuan) {
                                                        fetchedNumber = formatNum(yinYuan);
                                                    } else {
                                                        fetchedNumber = formatNum(codes[0]);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error("AllOrigins 抓取歌號失敗:", e);
                                }
                            }
                        }
                    } catch (e) {
                        console.error("CORS proxy fetch failed:", e);
                    }
                }

                if (fetchedTitle) {
                    // 解析點歌王格式: "歌手-歌名 線上聽@台灣點歌王."
                    // 1. 去除 \`線上聽@\` 及其後面的所有字串
                    let cleanedTitle = fetchedTitle.replace(/\\s*線上聽@.*$/, '').trim();
                    let singer = '未知歌手';
                    let songTitle = cleanedTitle;
                    
                    const parts = cleanedTitle.split('-');
                    if (parts.length >= 2) {
                        singer = parts[0].trim();
                        const rest = parts.slice(1).join('-').trim();
                        const spaceIdx = rest.indexOf(' ');
                        if (spaceIdx !== -1) {
                            songTitle = rest.substring(0, spaceIdx).trim();
                        } else {
                            songTitle = rest;
                        }
                    }

                    // 更新暫存資料庫與介面
                    tempParsedSongs[idx].title = songTitle;
                    tempParsedSongs[idx].singer = singer;
                    if (fetchedYoutubeUrl) {
                        tempParsedSongs[idx].youtubeUrl = fetchedYoutubeUrl;
                    }
                    if (fetchedNumber && (song.number === '無編號' || !song.number)) {
                        tempParsedSongs[idx].number = fetchedNumber;
                    }

                    if (singerInput) singerInput.value = singer;
                    if (titleInput) titleInput.value = songTitle;
                    if (fetchedYoutubeUrl && urlInput) urlInput.value = fetchedYoutubeUrl;
                    if (fetchedNumber && numberInput && (song.number === '無編號' || !song.number)) {
                        numberInput.value = fetchedNumber;
                    }

                    if (statusEl) {
                        statusEl.innerText = "⚡ 解析成功";
                        statusEl.style.color = "var(--success)";
                    }
                } else {
                    if (statusEl) {
                        statusEl.innerText = "❌ 抓取失敗";
                        statusEl.style.color = "var(--primary)";
                    }
                    if (tempParsedSongs[idx].title === "正在自動抓取標題...") {
                        tempParsedSongs[idx].title = "未知歌曲 (請手動輸入)";
                        if (titleInput) titleInput.value = tempParsedSongs[idx].title;
                    }
                    if (tempParsedSongs[idx].singer === "正在自動抓取...") {
                        tempParsedSongs[idx].singer = "未知歌手";
                        if (singerInput) singerInput.value = tempParsedSongs[idx].singer;
                    }
                }
                return;
            }

            // 轉化為標準 YouTube 播放網址
            if (song.youtubeUrl.includes('youtu.be/')) {
                const idMatch = song.youtubeUrl.match(/youtu\\.be\\/([^?#/]+)/);
                if (idMatch && idMatch[1]) {
                    urlToFetch = \`https://www.youtube.com/watch?v=\${idMatch[1]}\`;
                }
            }

            let fetchedTitle = "";

            // 管道 A：嘗試 YouTube 官方 oEmbed API (已開啟 CORS 支援瀏覽器直連)
            try {
                const oembedUrl = \`https://www.youtube.com/oembed?url=\${encodeURIComponent(urlToFetch)}&format=json\`;
                const response = await fetch(oembedUrl);
                if (response.ok) {
                    const data = await response.json();
                    fetchedTitle = data.title;
                }
            } catch (e) {
                console.warn("oEmbed failed, trying noembed fallback...", e);
            }

            // 管道 B：若官方 oEmbed 失敗，嘗試第三方 noembed (CORS 友善)
            if (!fetchedTitle) {
                try {
                    const noembedUrl = \`https://noembed.com/embed?url=\${encodeURIComponent(urlToFetch)}\`;
                    const response = await fetch(noembedUrl);
                    if (response.ok) {
                        const data = await response.json();
                        fetchedTitle = data.title;
                    }
                } catch (e) {
                    console.error("NoEmbed fetch failed...", e);
                }
            }

            if (fetchedTitle) {
                // 使用智能演算法分析影片標題
                const parsed = cleanAndParseYoutubeTitle(fetchedTitle);

                // 更新暫存資料庫
                tempParsedSongs[idx].title = parsed.title;
                tempParsedSongs[idx].singer = parsed.singer;

                // 即時渲染至輸入框（保留使用者游標，不重新 render 清單）
                if (singerInput) singerInput.value = parsed.singer;
                if (titleInput) titleInput.value = parsed.title;
                if (statusEl) {
                    statusEl.innerText = "⚡ 解析成功";
                    statusEl.style.color = "var(--success)";
                }
            } else {
                if (statusEl) {
                    statusEl.innerText = "❌ 抓取失敗";
                    statusEl.style.color = "var(--primary)";
                }
                // 恢復為預設或保留解析結果
                if (tempParsedSongs[idx].title === "正在自動抓取標題...") {
                    tempParsedSongs[idx].title = "未知歌曲 (請手動輸入)";
                    if (titleInput) titleInput.value = tempParsedSongs[idx].title;
                }
            }
        }

        $1`;

if (!regex2.test(content)) {
    console.error("Error: Target 2 not found in index.html!");
    process.exit(1);
}
content = content.replace(regex2, replacement2);
console.log("Success: Target 2 replaced!");

// 3. 修改 renderPreviewList 裡面的 urlInput 屬性
const target3 = /<input type="text" class="ip-url" value="\\\$\{song\\.youtubeUrl\}" placeholder="網址" onchange="updateTempSong\\\(\\\$\{idx\}, 'youtubeUrl', this\\.value\\\)">/g;
if (!target3.test(content)) {
    console.error("Error: Target 3 not found in index.html!");
    process.exit(1);
}
content = content.replace(target3, `<input type="text" class="ip-url" id="ip-url-\${idx}" value="\${song.youtubeUrl}" placeholder="網址" onchange="updateTempSong(\${idx}, 'youtubeUrl', this.value)">`);
console.log("Success: Target 3 replaced!");

fs.writeFileSync(filePath, content, 'utf8');
console.log("Success: index.html written successfully!");
