const fs = require('fs-extra');
const path = require('path');

/**
 * 初始化应用文件
 */
async function initializeFiles() {
    console.log('Initializing application files...');
    
    const configPath = path.join(__dirname, '../config/config.json');
    
    // 检查配置文件是否存在
    if (!(await fs.pathExists(configPath))) {
        console.log('Creating default config.json...');
        const defaultConfig = {
            redis: {
                host: 'localhost',
                port: 6379,
                password: '',
                db: 0,
                reconnect: {
                    maxRetries: 5,
                    retryInterval: 8000,
                    connectTimeout: 10000
                }
            },
            server: {
                http_port: 3000,
                https_port: 3001,
                ssl: {
                    enabled: false,
                    cert: './ssl/fullchain.pem',
                    key: './ssl/privkey.pem'
                },
                workers: require('os').cpus().length,
                cors: {
                    enabled: true,
                    origins: '*',
                    methods: 'GET, POST, PUT, DELETE, OPTIONS',
                    headers: 'Content-Type, Authorization'
                }
            },
            paths: {
                images: './img',
                html: './public'
            },
            update: {
                hours: 24,
                supportedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
            },
            cache: {
                enabled: true,
                ttl: 3600,
                redis_ttl: 7200,
                map_cleanup_interval: 60000
            },
            rate_limit: {
                enabled: true,
                window_size: 60000,
                requests_per_minute: 20,
                max_clients: 100,
                cleanup_interval: 60000,
                ban_duration: 300000
            },
            timezone: 'Asia/Shanghai',
            logging: {
                enabled: true,
                level: 'INFO',
                levels: {
                    ERROR: 0,
                    WARN: 1,
                    INFO: 2,
                    DEBUG: 3
                }
            }
        };
        await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
        console.log('Created default config.json');
    }
    
    // 确保必要的目录存在
    await fs.ensureDir('./img');
    await fs.ensureDir('./public');
    await fs.ensureDir('./ssl');
    
    // 初始化空的JSON文件
    const files = [
        { path: './list.json', content: {} },
        { path: './images-details.json', content: [] },
        { path: './list.stats.json', content: { generated: new Date().toISOString(), stats: { totalImages: 0 } } }
    ];
    
    for (const file of files) {
        if (!await fs.pathExists(file.path)) {
            await fs.writeJson(file.path, file.content, { spaces: 2 });
            console.log(`Created ${file.path}`);
        } else {
            // 检查文件是否损坏
            try {
                await fs.readJson(file.path);
                console.log(`${file.path} is valid`);
            } catch (error) {
                console.log(`${file.path} is corrupted, recreating...`);
                await fs.writeJson(file.path, file.content, { spaces: 2 });
            }
        }
    }
    
    console.log('Initialization complete!');
}

initializeFiles().catch(console.error);
