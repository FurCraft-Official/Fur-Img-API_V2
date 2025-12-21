const http = require('http');

// 触发图片列表更新
function triggerUpdate() {
    console.log('触发图片列表更新...');
    
    const options = {
        hostname: 'localhost',
        port: 13000,
        path: '/admin/api/update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('✅ 更新请求完成');
            try {
                const result = JSON.parse(data);
                console.log('更新结果:', result);
            } catch (e) {
                console.log('返回数据:', data);
            }
        });
    });
    
    req.on('error', (error) => {
        console.error('❌ 更新请求失败:', error.message);
    });
    
    req.write(JSON.stringify({}));
    req.end();
}

triggerUpdate();