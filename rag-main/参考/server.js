const http = require('http');
const https = require('https');

const PORT = 3000;

const API_HOST = 'api.minimaxi.com';
const API_KEY = 'sk-cp-uXyH8XcysGbMU6yrv6j4iiUO1yJQ4mN1CyHBHD7PgYNCQHyQUdXIsrcgD5V1DvAKSXepaRvt0oWxxFgWBCrTLz70BoXs4Y62kv6FSmwjSzwTmaQidsu2HXY';

// 判断音色名称是否包含中文
function hasChinese(text) {
    if (!text) return false;
    // 匹配中文字符（包括汉字和中文标点）
    return /[\u4e00-\u9fa5]/.test(text);
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 获取音色列表（仅中文音色）
    if (req.method === 'GET' && req.url === '/voices') {
        const postData = JSON.stringify({ voice_type: "all" });

        const options = {
            hostname: API_HOST,
            port: 443,
            path: '/v1/get_voice',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => { data += chunk; });
            proxyRes.on('end', () => {
                console.log('voices响应:', data);
                try {
                    const parsed = JSON.parse(data);
                    let voiceArray = null;
                    
                    if (parsed.system_voice && Array.isArray(parsed.system_voice)) {
                        voiceArray = parsed.system_voice;
                    } else if (parsed.voice_list && Array.isArray(parsed.voice_list)) {
                        voiceArray = parsed.voice_list;
                    } else if (parsed.data && Array.isArray(parsed.data)) {
                        voiceArray = parsed.data;
                    } else if (Array.isArray(parsed)) {
                        voiceArray = parsed;
                    }
                    
                    // 过滤掉英文名称的音色，只保留中文名称的音色
                    if (voiceArray) {
                        const filteredVoices = voiceArray.filter(v => {
                            const name = v.voice_name || v.name || v.voice_id || '';
                            return hasChinese(name);
                        });
                        parsed.system_voice = filteredVoices;
                    }
                    
                    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(parsed));
                } catch (e) {
                    console.error('处理音色列表失败:', e);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        });

        proxyReq.on('error', (e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        });

        proxyReq.write(postData);
        proxyReq.end();
        return;
    }

    // TTS生成
    if (req.method === 'POST' && req.url === '/tts') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const params = JSON.parse(body);
                const { text, voice_id, language } = params;

                const postData = JSON.stringify({
                    model: "speech-2.8-hd",
                    text: text,
                    stream: false,
                    voice_setting: {
                        voice_id: voice_id
                    },
                    language: language || "Chinese"
                });

                console.log('TTS请求:', postData);

                const options = {
                    hostname: API_HOST,
                    port: 443,
                    path: '/v1/t2a_v2',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const proxyReq = https.request(options, (proxyRes) => {
                    let data = '';
                    proxyRes.on('data', chunk => { data += chunk; });
                    proxyRes.on('end', () => {
                        console.log('TTS响应:', data);
                        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                        res.end(data);
                    });
                });

                proxyReq.on('error', (e) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                });

                proxyReq.write(postData);
                proxyReq.end();
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`TTS代理服务已启动: http://localhost:${PORT}`);
});
