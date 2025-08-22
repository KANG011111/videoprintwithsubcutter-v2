// 全域變數宣告
/* global JSZip, html2canvas */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const videoFileInput = document.getElementById('video-file-input');
    const videoUrlInput = document.getElementById('video-url-input');
    const loadVideoUrlBtn = document.getElementById('load-video-url-btn');
    const videoPlayer = document.getElementById('video-player');

    const subtitleFileInput = document.getElementById('subtitle-file-input');
    const subtitleInfo = document.getElementById('subtitle-info');

    const startTimeInput = document.getElementById('start-time-input');
    // const durationInput = document.getElementById('duration-input'); // 這個元素不存在
    const intervalInput = document.getElementById('interval-input');
    const mode1Radio = document.getElementById('mode1');

    const captureBtn = document.getElementById('capture-btn');
    const batchProgress = document.getElementById('batch-progress');
    const outputPreview = document.getElementById('output-preview');
    const downloadBtn = document.getElementById('download-btn');

    // --- Global State ---
    let subtitles = [];
    let videoFileName = '';

    // --- Event Listeners ---
    videoFileInput.addEventListener('change', handleVideoFile);
    loadVideoUrlBtn.addEventListener('click', handleVideoUrl);
    subtitleFileInput.addEventListener('change', handleSubtitleFile);
    captureBtn.addEventListener('click', handleCapture);
    downloadBtn.addEventListener('click', handleDownload);
    outputPreview.addEventListener('click', handleThumbnailSelection);

    // 預設起始時間與長度
    videoPlayer.addEventListener('loadedmetadata', () => {
        startTimeInput.value = '00:00:00';
        // 不再設定 durationInput，直接用 videoPlayer.duration
    });

    function handleVideoFile(event) {
        const file = event.target.files[0];
        if (file) {
            videoFileName = file.name.split('.').slice(0, -1).join('.') || 'video';
            videoPlayer.src = URL.createObjectURL(file);
        }
    }

    function handleVideoUrl() {
        const url = videoUrlInput.value.trim();
        if (url) {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                videoFileName = url.split('/').pop().split('.').slice(0, -1).join('.') || 'video';
                videoPlayer.src = url;
            } else {
                alert('Please enter a valid video URL.');
            }
        }
    }

    function handleSubtitleFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const subtitleFileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                console.log('字幕檔內容前100字:', content.substring(0, 100));
                if (subtitleFileName.toLowerCase().endsWith('.srt')) {
                    subtitles = parseSrt(content);
                } else if (subtitleFileName.toLowerCase().endsWith('.vtt')) {
                    subtitles = parseVtt(content);
                } else {
                    throw new Error('Unsupported format');
                }
                console.log('解析後的字幕:', subtitles.slice(0, 3));
                subtitleInfo.textContent = `已載入: ${subtitleFileName} (${subtitles.length} 條字幕)`;
            } catch (error) {
                console.error('字幕解析錯誤:', error);
                alert(`Error parsing subtitle file: ${error.message}`);
                subtitles = [];
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    function timeToSeconds(timeString) {
        const parts = timeString.split(/[:,.]/);
        return (parseInt(parts[0],10)*3600)+(parseInt(parts[1],10)*60)+parseInt(parts[2],10)+(parseInt(parts[3],10)/1000||0);
    }

    function parseSrt(data) {
        return data.trim().split('\n\n').map(block => {
            const lines = block.split('\n');
            const time = lines[1].split(' --> ');
            return {
                start: timeToSeconds(time[0].replace(',', '.')), 
                end: timeToSeconds(time[1].replace(',', '.')), 
                text: lines.slice(2).join('\n')
            };
        });
    }

    function parseVtt(data) {
        return data.replace(/^WEBVTT[\s\S]*?\n\n/, '').trim().split('\n\n').map(block => {
            const lines = block.split('\n');
            const timeMatch = lines[0].match(/([\d:.]+) --> ([\d:.]+)/);
            return {
                start: timeToSeconds(timeMatch[1]),
                end: timeToSeconds(timeMatch[2]),
                text: lines.slice(1).join('\n')
            };
        });
    }
    
    function secondsToTimeCode(seconds, withBrackets = false) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return withBrackets ? `[${h}:${m}:${s}]` : `${h}-${m}-${s}`;
    }

    /**
     * Captures a single frame at a specific time.
     */
    function captureSingleFrame(time) {
        return new Promise((resolve) => {
            videoPlayer.onseeked = () => {
                videoPlayer.onseeked = null;
                const canvas = document.createElement('canvas');
                canvas.width = videoPlayer.videoWidth;
                canvas.height = videoPlayer.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
                resolve(canvas);
            };
            videoPlayer.currentTime = time;
        });
    }

    /**
     * Main batch capture logic.
     */
    async function handleCapture() {
        console.log('開始擷取，影片狀態:', videoPlayer.readyState, '字幕數量:', subtitles.length);
        if (!videoPlayer.src || videoPlayer.readyState < 1 || subtitles.length === 0) {
            alert('請先載入影片與字幕檔');
            return;
        }

        captureBtn.disabled = true;
        outputPreview.innerHTML = '';
        downloadBtn.style.display = 'none';

        const startTime = timeToSeconds(startTimeInput.value);
        const totalDuration = Math.floor(videoPlayer.duration); // 直接用影片長度
        const interval = parseFloat(intervalInput.value);

        if (isNaN(startTime) || isNaN(totalDuration) || isNaN(interval) || totalDuration <= 0 || interval <= 0) {
            alert('請輸入正確的時間與間隔');
            captureBtn.disabled = false;
            return;
        }

        const endTime = startTime + totalDuration;
        const images = [];
        let current = startTime;
        let index = 0;

        batchProgress.textContent = '擷取中...';

        while (current < endTime) {
            // 找出這段 interval 內的所有字幕
            const segEnd = Math.min(current + interval, endTime);
            const selectedSubs = subtitles.filter(sub => 
                sub.start >= current && sub.start < segEnd
            );
            const mergedText = selectedSubs.map(sub => sub.text).join('\n');

            // 擷取截圖
            const canvas = await captureSingleFrame(current);

            // 疊加字幕（多行自動換行）
            if (mode1Radio.checked) {
                renderMode1MultiLine(canvas, mergedText);
                images.push({canvas, time: current});
            } else {
                images.push({canvas, time: current, text: mergedText});
            }
            current += interval;
            index++;
        }

        // 預覽
        outputPreview.innerHTML = '';
        images.forEach(({canvas, time, text}) => {
            createThumbnail(canvas, time, text);
        });

        batchProgress.textContent = `擷取完成，共 ${images.length} 張圖片。`;
        downloadBtn.style.display = '';
        captureBtn.disabled = false;
    }

    // 多行字幕疊加
    function renderMode1MultiLine(canvas, text) {
        if (!text) return;
        const ctx = canvas.getContext('2d');
        const fontSize = Math.max(20, Math.round(canvas.width / 35));
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';

        // 分行處理
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const lineHeight = fontSize * 1.3;
        const totalHeight = lineHeight * lines.length + 20;
        const bgY = canvas.height - totalHeight - (canvas.height * 0.05);

        // 黑底半透明背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, bgY, canvas.width, totalHeight);

        // 字幕文字
        ctx.fillStyle = 'white';
        lines.forEach((line, i) => {
            ctx.fillText(line, canvas.width / 2, bgY + lineHeight * (i + 1));
        });
    }

    async function renderMode2(canvas, text, time) {
        const container = document.createElement('div');
        container.className = 'mode2-container';

        // 上方放截圖
        const imageSection = document.createElement('div');
        imageSection.className = 'image-section';
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        imageSection.appendChild(img);

        // 下方放字幕
        const subtitleSection = document.createElement('div');
        subtitleSection.className = 'subtitle-section';
        subtitleSection.textContent = text;

        container.appendChild(imageSection);
        container.appendChild(subtitleSection);

        return container;
    }

    function createThumbnail(canvas, time, text = '') {
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'thumbnail-container';
        thumbContainer.style.position = 'relative';

        // 勾勾圖示
        const checkIcon = document.createElement('div');
        checkIcon.className = 'check-icon';
        checkIcon.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="13" fill="#2196f3" stroke="#fff" stroke-width="2"/>
                <polyline points="8,15 13,20 20,10" fill="none" stroke="#fff" stroke-width="3" />
            </svg>
        `;
        checkIcon.style.position = 'absolute';
        checkIcon.style.top = '8px';
        checkIcon.style.left = '8px';
        checkIcon.style.display = 'none';
        thumbContainer.appendChild(checkIcon);

        // 圖片
        const img = document.createElement('img');
        const dataUrl = canvas.toDataURL('image/png');
        img.src = dataUrl;
        thumbContainer.dataset.imageData = dataUrl;
        thumbContainer.dataset.timestamp = secondsToTimeCode(time);

        thumbContainer.appendChild(img);

        // 模式 2：字幕顯示在下方
        if (!mode1Radio.checked && text) {
            const subtitleDiv = document.createElement('div');
            subtitleDiv.className = 'subtitle-under-image';
            subtitleDiv.textContent = text;
            thumbContainer.appendChild(subtitleDiv);
            thumbContainer.dataset.subtitleText = text;
        }

        outputPreview.appendChild(thumbContainer);

        // 多選
        thumbContainer.addEventListener('click', function(e) {
            thumbContainer.classList.toggle('selected');
            checkIcon.style.display = thumbContainer.classList.contains('selected') ? 'block' : 'none';
            e.stopPropagation();
        });
    }

    function handleThumbnailSelection(event) {
        const target = event.target.closest('.thumbnail-container');
        if (!target) return;

        outputPreview.querySelectorAll('.thumbnail-container').forEach(t => t.classList.remove('selected'));
        target.classList.add('selected');
    }

    function handleDownload() {
        const selected = outputPreview.querySelectorAll('.thumbnail-container.selected');
        if (!selected.length) {
            alert('請先選擇要下載的圖片');
            return;
        }
        if (typeof JSZip === 'undefined') {
            alert('JSZip 程式庫載入失敗，請重新整理頁面');
            return;
        }
        const zip = new JSZip();
        let processed = 0;

        selected.forEach((thumb, idx) => {
            const fileName = (mode1Radio.checked ? '[Mode1]' : '[Mode2]') +
                `${videoFileName}_${thumb.dataset.timestamp}-${String(idx+1).padStart(2,'0')}.jpg`;

            const img = new Image();
            img.src = thumb.dataset.imageData;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                if (mode1Radio.checked) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                } else {
                    const fontSize = Math.max(20, Math.round(img.width / 35));
                    const subtitleText = thumb.dataset.subtitleText || '';
                    const lines = subtitleText.split('\n').filter(line => line.trim() !== '');
                    const lineHeight = fontSize * 1.3;
                    const subtitleHeight = lineHeight * lines.length + 30;
                    canvas.width = img.width;
                    canvas.height = img.height + subtitleHeight;
                    ctx.drawImage(img, 0, 0, img.width, img.height);
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    ctx.fillRect(0, img.height, img.width, subtitleHeight);
                    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'center';
                    lines.forEach((line, i) => {
                        ctx.fillText(line, img.width / 2, img.height + lineHeight * (i + 1));
                    });
                }
                // 轉成 jpg 並加進 zip
                canvas.toBlob(blob => {
                    zip.file(fileName, blob);
                    processed++;
                    if (processed === selected.length) {
                        zip.generateAsync({type:"blob"}).then(content => {
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(content);
                            link.download = `${videoFileName}_images.zip`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        });
                    }
                }, 'image/jpeg', 0.92);
            };
        });
    }
});
