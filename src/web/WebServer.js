const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const multer = require('multer');
const iconv = require('iconv-lite');
const logManager = require('../logging/LogManager');
const ApiService = require('../api/ApiService');
const AdminService = require('../api/AdminService');
const FileUtils = require('../utils/FileUtils');

/**
 * Web服务器类，处理HTTP/HTTPS请求
 */
class WebServer {
  constructor(config, cacheManager) {
    this.config = config;
    this.cacheManager = cacheManager;
    this.app = express();
    this.httpServer = null;
    this.httpsServer = null;
    this.apiService = null;
    this.adminService = null;
    this.isRunning = false;
    
    // 初始化multer
    this.initMulter();
    
    // 初始化工作进程ID
    process.env.WORKER_ID = process.env.WORKER_ID || 
      (require('cluster').worker ? require('cluster').worker.id : '1');
  }
  
  /**
   * 初始化multer配置
   */
  initMulter() {
    // 内存存储配置 - memoryStorage不支持filename选项
    this.multer = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB文件大小限制
        files: 1 // 单次只允许上传1个文件
      },
      fileFilter: (req, file, cb) => {
        // 允许的图片格式
        const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('只允许上传图片文件'));
        }
      }
    });
  }

  /**
   * 启动Web服务器
   * @returns {Promise<void>}
   */
  async start() {
    // 初始化API服务
    await this.initializeApiService();
    
    // 配置应用
    this.configureApp();
    
    // 注册路由
    this.registerRoutes();
    
    // 启动服务器
    await this.startServers();
    
    this.isRunning = true;
    logManager.info(`Web service started successfully (Worker ${process.env.WORKER_ID})`, { module: 'WEB' });
  }

  /**
   * 初始化API服务
   * @returns {Promise<void>}
   */
  async initializeApiService() {
    this.apiService = new ApiService(this.config, this.cacheManager);
    await this.apiService.start();
    
    // 初始化管理服务
    this.adminService = new AdminService(this.config, this.cacheManager);
    await this.adminService.initialize();
  }

  /**
   * 配置Express应用
   */
  configureApp() {
    // 信任代理（用于正确获取客户端IP）
    this.app.set('trust proxy', true);
    
    // 中间件
    this.app.use(this.requestLogger.bind(this));
    this.app.use(this.corsMiddleware.bind(this));
    this.app.use(this.securityMiddleware.bind(this));
    
    // JSON解析中间件
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    
    // 静态文件服务
    this.app.use(express.static(this.config.paths.html, {
      maxAge: '1h',
      etag: true,
      lastModified: true
    }));
  }

  /**
   * 设置静态文件服务
   */
  async setupStaticFiles() {
    if (await fs.pathExists(this.config.paths.html)) {
      this.app.use(express.static(this.config.paths.html, {
        maxAge: '1h',
        etag: true,
        lastModified: true
      }));
      logManager.info(`Static files served from: ${this.config.paths.html}`, { module: 'WEB' });
    }
  }

  /**
   * 请求日志中间件
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   * @param {Function} next - 下一个中间件
   */
  requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const size = res.get('Content-Length') || 0;
      logManager.info(`${req.method} ${res.statusCode} ${duration}ms ${size}bytes`, { module: 'WEB', request: req });
    });
    
    next();
  }

  /**
   * CORS中间件
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   * @param {Function} next - 下一个中间件
   */
  corsMiddleware(req, res, next) {
    if (this.config.server.cors.enabled) {
      res.setHeader('Access-Control-Allow-Origin', this.config.server.cors.origins);
      res.setHeader('Access-Control-Allow-Methods', this.config.server.cors.methods);
      res.setHeader('Access-Control-Allow-Headers', this.config.server.cors.headers);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
    }
    next();
  }

  /**
   * 安全头中间件
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   * @param {Function} next - 下一个中间件
   */
  securityMiddleware(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  }

  /**
   * 验证令牌中间件
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   * @param {Function} next - 下一个中间件
   */
  validateToken(req, res, next) {
    const UPDATE_TOKEN = process.env.UPDATE_TOKEN;
    
    // 如果没有设置环境变量，跳过验证
    if (!UPDATE_TOKEN) {
      logManager.debug('UPDATE_TOKEN not set, skipping token validation', { module: 'WEB', request: req });
      return next();
    }
    
    const providedToken = req.query.token;
    
    if (!providedToken || providedToken !== UPDATE_TOKEN) {
      logManager.warn(`Token validation failed. Provided: ${providedToken ? '[REDACTED]' : 'none'}`, { module: 'WEB', request: req });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid token required',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
    
    logManager.debug('Token validation successful', { module: 'WEB', request: req });
    next();
  }

  /**
   * 注册路由
   */
  registerRoutes() {
    // 根路径API文档
    this.app.get('/doc', this.getApiDoc.bind(this));
    
    // 图片列表
    this.app.get('/list.json', this.getImageList.bind(this));
    
    // 统计信息
    this.app.get('/stats', this.getStats.bind(this));
    
    // 手动更新
    this.app.get('/update', this.validateToken.bind(this), this.handleUpdate.bind(this));
    
    // 缓存状态
    this.app.get('/cache/status', this.getCacheStatus.bind(this));
    
    // 缓存重连
    this.app.post('/cache/reconnect', this.handleCacheReconnect.bind(this));
    
    // 重置重试计数器
    this.app.post('/cache/reset', this.validateToken.bind(this), this.handleResetRetryCount.bind(this));
    
    // 缓存TTL查询
    this.app.get('/cache/ttl/:key', this.getCacheTTL.bind(this));
    
    // 设置缓存过期时间
    this.app.post('/cache/expire/:key', this.setCacheExpire.bind(this));
    
    // 清空缓存
    this.app.post('/cache/clear', this.validateToken.bind(this), this.clearCache.bind(this));
    
    // API路由
    this.app.get('/api', this.handleApiRoute.bind(this));
    this.app.get('/api/*', this.handleApiRoute.bind(this));
    this.app.post('/api', this.handleApiRoute.bind(this));
    this.app.post('/api/*', this.handleApiRoute.bind(this));
    
    // 健康检查
    this.app.get('/health', this.getHealthCheck.bind(this));
    
    // 管理路由
    this.registerAdminRoutes();
    
    // 404处理
    this.app.use('*', this.handle404.bind(this));
    
    // 错误处理
    this.app.use(this.errorHandler.bind(this));
  }
  
  /**
   * 注册管理路由
   */
  registerAdminRoutes() {
    // 管理页面路由
    this.app.get('/admin', this.getAdminPage.bind(this));
    
    // 图片管理
    this.app.get('/admin/api/images', this.getAdminImages.bind(this));
    this.app.delete('/admin/api/images/:path', this.validateToken.bind(this), this.deleteAdminImage.bind(this));
    
    // 目录管理
    this.app.get('/admin/api/directories', this.getAdminDirectories.bind(this));
    this.app.post('/admin/api/directories', this.validateToken.bind(this), this.createAdminDirectory.bind(this));
    this.app.delete('/admin/api/directories/:name', this.validateToken.bind(this), this.deleteAdminDirectory.bind(this));
    
    // 系统管理
    this.app.get('/admin/api/stats', this.getAdminStats.bind(this));
    this.app.post('/admin/api/update', this.validateToken.bind(this), this.updateAdminImageList.bind(this));
    this.app.post('/admin/api/cache/clear', this.validateToken.bind(this), this.clearAdminCache.bind(this));
    
    // 图片上传
    this.app.post('/admin/api/upload', this.validateToken.bind(this), this.multer.single('file'), this.handleImageUpload.bind(this));
  }
  
  /**
   * 返回管理页面
   */
  async getAdminPage(req, res) {
    try {
      const adminPath = path.join(__dirname, '../../public/admin/index.html');
      if (await fs.pathExists(adminPath)) {
        res.sendFile(path.resolve(adminPath));
      } else {
        res.status(404).json({
          error: 'Admin page not found',
          message: 'Admin page has not been created yet.'
        });
      }
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 获取管理图片列表
   */
  async getAdminImages(req, res) {
    try {
      const result = await this.adminService.getImages(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 删除管理图片
   */
  async deleteAdminImage(req, res) {
    try {
      const imagePath = decodeURIComponent(req.params.path);
      await this.adminService.deleteImage(imagePath);
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 获取管理目录列表
   */
  async getAdminDirectories(req, res) {
    try {
      const directories = await this.adminService.getDirectories();
      res.json(directories);
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 创建管理目录
   */
  async createAdminDirectory(req, res) {
    try {
      const { name } = req.body;
      await this.adminService.createDirectory(name);
      res.json({
        success: true,
        message: 'Directory created successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 删除管理目录
   */
  async deleteAdminDirectory(req, res) {
    try {
      const directoryName = req.params.name;
      await this.adminService.deleteDirectory(directoryName);
      res.json({
        success: true,
        message: 'Directory deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 获取管理统计信息
   */
  async getAdminStats(req, res) {
    try {
      const stats = await this.adminService.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 更新管理图片列表
   */
  async updateAdminImageList(req, res) {
    try {
      const result = await this.adminService.updateImageList();
      res.json({
        success: true,
        message: 'Image list updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 清理管理缓存
   */
  async clearAdminCache(req, res) {
    try {
      const result = await this.adminService.clearCache();
      res.json({
        success: true,
        message: 'Cache cleared successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
  
  /**
   * 处理图片上传
   */
  async handleImageUpload(req, res) {
    try {
      // 检查是否有文件上传
      if (!req.file) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'No file uploaded'
        });
      }
      
      // 获取上传的文件信息
      const file = req.file;
      
      // 关键修复：直接使用multer返回的originalname
      // 现代浏览器在FormData上传时会正确处理UTF-8编码
      // 避免过多的编码转换，这是解决中文文件名乱码的关键
      let filename = file.originalname;
      
      try {
        // 只进行必要的URL解码
        filename = decodeURIComponent(filename);
        logManager.debug(`文件名处理: ${file.originalname} -> ${filename}`, { module: 'WEB' });
      } catch (e) {
        // 如果URL解码失败，使用原始文件名
        logManager.warn(`文件名URL解码失败: ${e.message}，使用原始文件名`, { module: 'WEB' });
      }
      
      const directory = req.body.directory || '';
      const buffer = file.buffer;
      
      // 调用AdminService上传图片
      const result = await this.adminService.uploadImage({
        buffer: buffer,
        filename: filename,
        directory: directory
      });
      
      res.status(200).json(result);
    } catch (error) {
      logManager.error(`Error handling file upload: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * 获取API文档
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  getApiDoc(req, res) {
    res.json({
      name: 'Random Image API',
      version: '2.1.0',
      description: 'Random Image API with Redis caching, multi-threading and CORS support',
      endpoints: {
        'GET /api': 'Get random image from all directories',
        'GET /api/{directory}': 'Get random image from specific directory', 
        'GET /api/{directory}/{filename}': 'Get specific image',
        'GET /api?json=1': 'Get image info in JSON format',
        'GET /list.json': 'Get all images list',
        'GET /stats': 'Get detailed statistics',
        'GET /update?token={TOKEN}': 'Manual update trigger',
        'GET /health': 'Health check',
        'GET /cache/status': 'Cache status',
        'POST /cache/clear?token={TOKEN}': 'Clear cache (requires token)',
        'POST /cache/reconnect': 'Manual Redis reconnect',
        'POST /cache/reset?token={TOKEN}': 'Reset Redis retry count (requires token)'
      },
      timezone: this.config.timezone,
      timestamp: logManager.getCurrentTimestamp()
    });
  }

  /**
   * 获取图片列表
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async getImageList(req, res) {
    try {
      const listPath = path.join(__dirname, '../../list.json');
      if (await fs.pathExists(listPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.sendFile(path.resolve(listPath));
        logManager.debug('Served list.json', { module: 'WEB', request: req });
      } else {
        res.status(404).json({
          error: 'List not found',
          message: 'Image list has not been generated yet. Try triggering an update first.',
          timestamp: logManager.getCurrentTimestamp()
        });
        logManager.warn('list.json not found', { module: 'WEB', request: req });
      }
    } catch (error) {
      logManager.error(`Error serving list.json: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        error: 'Internal server error',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 获取统计信息
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async getStats(req, res) {
    try {
      const statsPath = path.join(__dirname, '../../list.stats.json');
      if (await fs.pathExists(statsPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.sendFile(path.resolve(statsPath));
        logManager.debug('Served stats', { module: 'WEB', request: req });
      } else {
        res.status(404).json({
          error: 'Stats not found',
          message: 'Statistics have not been generated yet.',
          timestamp: logManager.getCurrentTimestamp()
        });
      }
    } catch (error) {
      logManager.error(`Error serving stats: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        error: 'Internal server error',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 处理手动更新
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async handleUpdate(req, res) {
    try {
      const updateService = require('../services/UpdateService');
      const service = new updateService(this.config);
      await service.start();
      await service.handleManualUpdate(req, res);
    } catch (error) {
      logManager.error(`Update service error: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        error: 'Update service error',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 获取缓存状态
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async getCacheStatus(req, res) {
    try {
      const status = await this.cacheManager.getStats();
      res.json({
        ...status,
        timestamp: logManager.getCurrentTimestamp()
      });
      logManager.debug('Cache status requested', { module: 'WEB', request: req });
    } catch (error) {
      logManager.error(`Cache status error: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        error: 'Failed to get cache status',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 处理缓存重连
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async handleCacheReconnect(req, res) {
    try {
      logManager.info('Manual Redis reconnection requested', { module: 'WEB', request: req });
      if (typeof this.cacheManager.manualReconnect === 'function') {
        await this.cacheManager.manualReconnect();
      }
      res.json({
        success: true,
        message: 'Redis reconnection triggered',
        timestamp: logManager.getCurrentTimestamp()
      });
    } catch (error) {
      logManager.error(`Manual reconnect error: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        success: false,
        error: 'Failed to trigger reconnection',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 重置重试计数器
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async handleResetRetryCount(req, res) {
    try {
      logManager.info('Redis retry count reset requested', { module: 'WEB', request: req });
      if (typeof this.cacheManager.resetRetryCount === 'function') {
        this.cacheManager.resetRetryCount();
      }
      res.json({
        success: true,
        message: 'Redis retry count reset successfully',
        timestamp: logManager.getCurrentTimestamp()
      });
    } catch (error) {
      logManager.error(`Reset retry count error: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        success: false,
        error: 'Failed to reset retry count',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 获取缓存TTL
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async getCacheTTL(req, res) {
    try {
      const key = req.params.key;
      const ttl = await this.cacheManager.getTTL(key);
      res.json({
        key: key,
        ttl: ttl,
        message: ttl === -1 ? 'Key does not exist or has no expiration' : 
                ttl === -2 ? 'Key does not exist' : 
                `Key expires in ${ttl} seconds`,
        timestamp: logManager.getCurrentTimestamp()
      });
      logManager.debug(`TTL requested for key: ${key} (TTL: ${ttl})`, { module: 'WEB', request: req });
    } catch (error) {
      logManager.error(`TTL query error: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        error: 'Failed to get TTL',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 设置缓存过期时间
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async setCacheExpire(req, res) {
    try {
      const key = req.params.key;
      const seconds = parseInt(req.body.seconds) || 3600;
      
      const result = await this.cacheManager.expire(key, seconds);
      res.json({
        success: result,
        key: key,
        seconds: seconds,
        message: result ? `Expiration set for ${seconds} seconds` : 'Failed to set expiration or key does not exist',
        timestamp: logManager.getCurrentTimestamp()
      });
      logManager.debug(`Expire set for key: ${key} (${seconds}s) - ${result ? 'success' : 'failed'}`, { module: 'WEB', request: req });
    } catch (error) {
      logManager.error(`Expire set error: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        error: 'Failed to set expiration',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 清空缓存
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async clearCache(req, res) {
    try {
      await this.cacheManager.clear();
      res.json({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: logManager.getCurrentTimestamp()
      });
      logManager.info('Cache cleared via API', { module: 'WEB', request: req });
    } catch (error) {
      logManager.error(`Cache clear error: ${error.message}`, { module: 'WEB', request: req });
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 处理API路由
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async handleApiRoute(req, res) {
    try {
      await this.apiService.handleApiRequest(req, res);
    } catch (error) {
      logManager.error(`API service error on ${req.path}: ${error.message}`, { module: 'WEB', request: req });
      logManager.debug(`Error stack: ${error.stack}`, { module: 'WEB' });
      res.status(500).json({
        error: 'API service error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 获取健康检查
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  async getHealthCheck(req, res) {
    try {
      const cacheStatus = await this.cacheManager.getStats();
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      
      res.json({
        status: 'OK',
        uptime: {
          seconds: Math.floor(uptime),
          human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
        },
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        },
        cache: cacheStatus,
        config: {
          autoUpdate: this.config.update.hours > 0 ? `${this.config.update.hours} hours` : 'disabled',
          https: this.config.server.ssl.enabled === true || this.config.server.ssl.enabled === 1 ? 'enabled' : 'disabled',
          cors: this.config.server.cors.enabled ? 'enabled' : 'disabled',
          workers: this.config.server.workers
        },
        timestamp: logManager.getCurrentTimestamp()
      });
    } catch (error) {
      logManager.error(`Health check error: ${error.message}`, { module: 'WEB', request: req });
      res.status(503).json({
        status: 'ERROR',
        error: 'Health check failed',
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 处理404错误
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   */
  handle404(req, res) {
    logManager.warn('404 Not Found', { module: 'WEB', request: req });
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found on this server',
      path: req.path,
      timestamp: logManager.getCurrentTimestamp()
    });
  }

  /**
   * 处理错误
   * @param {any} error - 错误对象
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   * @param {Function} next - 下一个中间件
   */
  errorHandler(error, req, res, next) {
    logManager.error(`Server error: ${error.message}`, { module: 'WEB', request: req });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      timestamp: logManager.getCurrentTimestamp()
    });
  }

  /**
   * 启动HTTP和HTTPS服务器
   * @returns {Promise<void>}
   */
  async startServers() {
    // 启动HTTP服务器
    const httpPort = this.config.server.http_port || 3000;
    await this.startHttpServer(httpPort);
    
    // 启动HTTPS服务器（如果启用）
    if (this.config.server.ssl.enabled === true || this.config.server.ssl.enabled === 1) {
      await this.startHttpsServer();
    } else {
      logManager.info('HTTPS server disabled by configuration', { module: 'WEB' });
    }
  }

  /**
   * 启动HTTP服务器
   * @param {number} port - 端口号
   * @returns {Promise<void>}
   */
  startHttpServer(port) {
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(port, () => {
        logManager.info(`HTTP Server running on port ${port}`, { module: 'WEB' });
        resolve();
      });
      
      this.httpServer.on('error', (error) => {
        logManager.error(`HTTP Server error: ${error.message}`, { module: 'WEB' });
      });
    });
  }

  /**
   * 启动HTTPS服务器
   * @returns {Promise<void>}
   */
  async startHttpsServer() {
    try {
      const httpsPort = this.config.server.https_port || 3443;
      const certPath = this.config.server.ssl.cert;
      const keyPath = this.config.server.ssl.key;
      
      if (await fs.pathExists(certPath) && await fs.pathExists(keyPath)) {
        const sslOptions = {
          key: await fs.readFile(keyPath),
          cert: await fs.readFile(certPath)
        };
        
        return new Promise((resolve) => {
          this.httpsServer = https.createServer(sslOptions, this.app);
          this.httpsServer.listen(httpsPort, () => {
            logManager.info(`HTTPS Server running on port ${httpsPort}`, { module: 'WEB' });
            resolve();
          });
          
          this.httpsServer.on('error', (error) => {
            logManager.error(`HTTPS Server error: ${error.message}`, { module: 'WEB' });
          });
        });
      } else {
        logManager.warn('SSL certificate or key file not found, HTTPS disabled', { module: 'WEB' });
        logManager.debug(`Cert path: ${certPath}`, { module: 'WEB' });
        logManager.debug(`Key path: ${keyPath}`, { module: 'WEB' });
      }
    } catch (error) {
      logManager.error(`Failed to start HTTPS server: ${error.message}`, { module: 'WEB' });
    }
  }

  /**
   * 停止Web服务器
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    await new Promise((resolve) => {
      let pending = 0;
      
      if (this.httpServer) {
        pending++;
        this.httpServer.close(() => {
          logManager.info('HTTP Server stopped', { module: 'WEB' });
          pending--;
          if (pending === 0) resolve();
        });
      }
      
      if (this.httpsServer) {
        pending++;
        this.httpsServer.close(() => {
          logManager.info('HTTPS Server stopped', { module: 'WEB' });
          pending--;
          if (pending === 0) resolve();
        });
      }
      
      if (pending === 0) {
        resolve();
      }
    });
    
    // 清理API服务
    if (this.apiService) {
      this.apiService.cleanup();
    }
    
    this.isRunning = false;
    logManager.info('Web server stopped', { module: 'WEB' });
  }
}

module.exports = WebServer;
