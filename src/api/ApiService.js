const fs = require('fs-extra');
const path = require('path');
const FileUtils = require('../utils/FileUtils');
const logManager = require('../logging/LogManager');
const RequestLimiter = require('./RequestLimiter');

/**
 * @typedef {import('../types').ImageInfo} ImageInfo
 * @typedef {import('../types').ImageDetails} ImageDetails
 */

/**
 * API服务类，处理图片相关的API请求
 */
class ApiService {
  constructor(config, cacheManager) {
    this.config = config;
    this.cacheManager = cacheManager;
    this.imageList = {};
    this.imageDetails = [];
    this.fileExistsCache = new Map();
    this.FILE_CACHE_TTL = 300000; // 5分钟缓存
    this.MAX_FILE_CACHE_SIZE = 10000;
    this.reloadInterval = null;
    this.maintenanceInterval = null;
    this.limiter = new RequestLimiter(config);
    
    // 初始化工作进程ID
    process.env.WORKER_ID = process.env.WORKER_ID || 
      (require('cluster').worker ? require('cluster').worker.id : '1');
  }

  /**
   * 启动API服务
   * @returns {Promise<void>}
   */
  async start() {
    // 加载图片列表
    await this.loadImageList();
    
    // 启动定时任务
    this.startScheduledTasks();
    
    logManager.info(`API started with ${this.imageDetails.length} images`, { module: 'API' });
    logManager.info('Cache policy: random ⛔, specific ✅', { module: 'API' });
    logManager.info(`File exists cache TTL: ${this.FILE_CACHE_TTL/1000}s, Request limit: ${this.limiter.limit}/min`, { module: 'API' });
  }

  /**
   * 加载图片列表
   * @returns {Promise<void>}
   */
  async loadImageList() {
    try {
      logManager.debug('Starting to load image list...', { module: 'API' });
      
      const listPath = path.join(__dirname, '../../list.json');
      const detailsPath = path.join(__dirname, '../../images-details.json');
      
      const [listData, detailsData] = await Promise.all([
        FileUtils.safeReadJson(listPath, {}),
        FileUtils.safeReadJson(detailsPath, [])
      ]);

      // 如果details为空但list有数据，转换list为details格式
      if (detailsData.length === 0 && Object.keys(listData).length > 0) {
        const convertedDetails = this.convertListToDetails(listData);
        this.imageDetails = convertedDetails;
        logManager.warn(`Converted ${convertedDetails.length} images from list.json format`, { module: 'API' });
        // 保存转换后的details
        await FileUtils.safeWriteJson(detailsPath, convertedDetails);
      } else {
        this.imageDetails = detailsData;
      }
      
      this.imageList = listData;
      this.fileExistsCache.clear();
      
      logManager.info(`Image list loaded: ${Object.keys(this.imageList).length} directories, ${this.imageDetails.length} total images`, { module: 'API' });
      
    } catch (err) {
      logManager.error(`Failed to load image list: ${err.message}`, { module: 'API' });
      logManager.debug(`Error stack: ${err.stack}`, { module: 'API' });
    }
  }

  /**
   * 将旧格式的list转换为details格式
   * @param {Object} listData - 旧格式的图片列表
   * @returns {ImageDetails[]} 转换后的图片详情列表
   */
  convertListToDetails(listData) {
    const details = [];
    const baseImagePath = path.resolve(this.config.paths.images);
    
    for (const [directory, files] of Object.entries(listData)) {
      if (!files || typeof files !== 'object') continue;
      
      for (const [filename, uploadtime] of Object.entries(files)) {
        try {
          const dirPath = directory === '_root' ? '' : directory;
          const fullPath = path.join(baseImagePath, dirPath, filename);
          const relativePath = path.join(dirPath, filename).replace(/\\/g, '/');
          
          details.push({
            name: filename,
            size: 0,
            uploadtime,
            path: relativePath,
            _fullPath: fullPath,
            _directory: directory,
            _extension: path.extname(filename).toLowerCase(),
            _mimeType: FileUtils.getMimeType(fullPath)
          });
        } catch (itemErr) {
          logManager.warn(`Error processing item ${filename} in ${directory}: ${itemErr.message}`, { module: 'API' });
        }
      }
    }
    
    return details;
  }

  /**
   * 启动定时任务
   */
  startScheduledTasks() {
    // 定时重新加载图片列表（5分钟）
    this.reloadInterval = setInterval(async () => {
      try {
        await this.loadImageList();
      } catch (err) {
        logManager.error(`Scheduled reload failed: ${err.message}`, { module: 'API' });
      }
    }, 300000);
    
    // 定时维护清理（10分钟）
    this.maintenanceInterval = setInterval(() => {
      this.cleanupFileCache();
    }, 600000);
    
    // 注册退出事件清理
    this.registerShutdownHandlers();
  }

  /**
   * 注册退出事件处理
   */
  registerShutdownHandlers() {
    const originalExit = process.exit;
    process.exit = (code) => {
      this.cleanup();
      originalExit.call(process, code);
    };
    
    // 监听信号事件
    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
      process.on(signal, () => {
        logManager.info(`Received ${signal}, shutting down API service...`, { module: 'API' });
        this.cleanup();
        process.exit(0);
      });
    });
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.reloadInterval) {
      clearInterval(this.reloadInterval);
      this.reloadInterval = null;
    }
    
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
    
    this.limiter.stop();
    this.fileExistsCache.clear();
    
    logManager.info('API service cleanup completed', { module: 'API' });
  }

  /**
   * 缓存的文件存在性检查
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 文件是否存在
   */
  async cachedPathExists(filePath) {
    const now = Date.now();
    const cached = this.fileExistsCache.get(filePath);
    
    if (cached && (now - cached.timestamp) < this.FILE_CACHE_TTL) {
      return cached.exists;
    }
    
    const exists = await fs.pathExists(filePath);
    this.fileExistsCache.set(filePath, { exists, timestamp: now });
    
    if (this.fileExistsCache.size > this.MAX_FILE_CACHE_SIZE) {
      this.cleanupFileCache();
    }
    
    return exists;
  }

  /**
   * 清理文件存在性缓存
   */
  cleanupFileCache() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [filePath, data] of this.fileExistsCache.entries()) {
      if (now - data.timestamp > this.FILE_CACHE_TTL) {
        this.fileExistsCache.delete(filePath);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logManager.debug(`Cleaned up ${cleanedCount} expired file cache entries`, { module: 'API' });
    }
  }

  /**
   * 获取客户端IP地址
   * @param {any} req - Express请求对象
   * @returns {string} 客户端IP地址
   */
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.ip ||
           'unknown';
  }

  /**
   * 检查请求是否是随机请求
   * @param {string[]} parts - 请求路径部分
   * @returns {boolean} 是否是随机请求
   */
  isRandomRequest(parts) {
    return parts.length < 2;
  }

  /**
   * 生成缓存键
   * @param {any} req - Express请求对象
   * @param {string[]} parts - 请求路径部分
   * @returns {string|null} 缓存键或null
   */
  generateCacheKey(req, parts) {
    if (this.isRandomRequest(parts)) {
      return null;
    }
    
    const base = `api:${req.path}`;
    const suffix = req.query.json === '1' ? ':json' : ':file';
    return base + suffix;
  }

  /**
   * 获取随机图片
   * @param {string|null} directory - 目录名称
   * @returns {ImageDetails|null} 随机图片详情或null
   */
  getRandomImage(directory = null) {
    if (this.imageDetails.length === 0) {
      logManager.error('No images available in imageDetails array', { module: 'API' });
      return null;
    }
    
    let filtered = this.imageDetails;
    
    if (directory) {
      filtered = this.imageDetails.filter(img => {
        if (directory === '_root') {
          return img._directory === '_root';
        } else {
          return img._directory === directory || img.path.startsWith(directory + '/');
        }
      });
      
      if (filtered.length === 0) {
        logManager.debug(`No images found in directory: ${directory}`, { module: 'API' });
        return null;
      }
    }
    
    const randomIndex = Math.floor(Math.random() * filtered.length);
    const selectedImage = filtered[randomIndex];
    
    logManager.debug(`Random image selected: ${selectedImage.name} from ${filtered.length} candidates`, { module: 'API' });
    return selectedImage;
  }

  /**
   * 查找特定图片
   * @param {string} directory - 目录名称
   * @param {string} filename - 文件名
   * @returns {ImageDetails|null} 图片详情或null
   */
  findSpecificImage(directory, filename) {
    const targetPath = path.join(directory, filename).replace(/\\/g, '/');
    
    const found = this.imageDetails.find(img => {
      if (directory === '_root') {
        return img._directory === '_root' && img.name === filename;
      } else {
        return img.path === targetPath;
      }
    });
    
    if (found) {
      logManager.debug(`Specific image found: ${found.name} at ${found.path}`, { module: 'API' });
    } else {
      logManager.debug(`Specific image not found: ${targetPath}`, { module: 'API' });
    }
    
    return found;
  }

  /**
   * 设置CORS头
   * @param {any} res - Express响应对象
   */
  setCorsHeaders(res) {
    if (this.config.server.cors.enabled) {
      res.setHeader('Access-Control-Allow-Origin', this.config.server.cors.origins);
      res.setHeader('Access-Control-Allow-Methods', this.config.server.cors.methods);
      res.setHeader('Access-Control-Allow-Headers', this.config.server.cors.headers);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  /**
   * 获取404错误消息
   * @param {string[]} parts - 请求路径部分
   * @returns {string} 错误消息
   */
  getNotFoundMessage(parts) {
    if (parts.length === 0) {
      return 'No images available';
    } else if (parts.length === 1) {
      return `No images found in directory: ${parts[0]}`;
    } else {
      return `Image not found: ${parts.join('/')}`;
    }
  }

  /**
   * 处理API请求
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   * @returns {Promise<void>}
   */
  async handleApiRequest(req, res) {
    const startTime = Date.now();
    
    this.setCorsHeaders(res);
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const clientIP = this.getClientIP(req);
    if (!this.limiter.isAllowed(clientIP)) {
      const status = this.limiter.getStatus(clientIP);
      logManager.warn(`Rate limit exceeded or banned client: ${clientIP}`, { module: 'API', request: req });
      
      const responseData = {
        error: status.banned ? 'Temporarily Banned' : 'Too Many Requests',
        message: status.banned 
          ? `You have been temporarily banned. Please try again later.` 
          : 'Rate limit exceeded. Please slow down your requests.',
        clientIP: clientIP,
        limit: this.limiter.limit,
        window: this.limiter.windowSize / 1000,  // 转换为秒
        ...status
      };

      return res.status(status.banned ? 403 : 429).json(responseData);
    }

    const isJson = req.query.json === '1';
    const parts = req.path.split('/').filter(p => p && p.trim());
    parts.shift(); // 移除 'api'
    
    // 解码所有路径部分
    const decodedParts = parts.map(part => decodeURIComponent(part));
    
    const isRandom = this.isRandomRequest(decodedParts);
    const cacheKey = this.generateCacheKey(req, decodedParts);
    const cleanPath = req.originalUrl.split('?')[0];
    
    try {
      // 检查缓存
      if (!isRandom && cacheKey) {
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
          logManager.debug(`Cache hit: ${cacheKey} (${Date.now() - startTime}ms)`, { module: 'API', request: req });
          
          if (isJson) {
            return res.json(cached);
          }
          
          const filePath = cached._fullPath || cached.fullPath || path.resolve(cached.path);
          if (await this.cachedPathExists(filePath)) {
            res.setHeader('Content-Type', FileUtils.getMimeType(filePath));
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('X-Cache', 'HIT');
            return res.sendFile(filePath);
          } else {
            await this.cacheManager.del(cacheKey);
            logManager.warn(`Cleared stale cache for missing file: ${cacheKey}`, { module: 'API', request: req });
          }
        }
      }
      
      // 处理请求
      let selectedImage;
      let retryCount = 0;
      const maxRetries = 1;
      
      while (!selectedImage && retryCount <= maxRetries) {
        if (retryCount > 0) {
          logManager.debug(`Retrying after reload (attempt ${retryCount})`, { module: 'API', request: req });
        }
        
        if (decodedParts.length === 0) {
          selectedImage = this.getRandomImage();
          logManager.debug(`Random selection from all images (${Date.now() - startTime}ms)`, { module: 'API', request: req });
        } else if (decodedParts.length === 1) {
          selectedImage = this.getRandomImage(decodedParts[0]);
          logManager.debug(`Random selection from directory: ${decodedParts[0]} (${Date.now() - startTime}ms)`, { module: 'API', request: req });
        } else {
          selectedImage = this.findSpecificImage(decodedParts[0], decodedParts.slice(1).join('/'));
          if (selectedImage) {
            const exists = await this.cachedPathExists(selectedImage._fullPath);
            if (!exists) {
              logManager.warn(`Specific image file not found: ${selectedImage._fullPath}`, { module: 'API', request: req });
              selectedImage = null;
            } else {
              logManager.debug(`Specific image found: ${decodedParts.join('/')} (${Date.now() - startTime}ms)`, { module: 'API', request: req });
            }
          }
        }
        
        // 如果找不到图片且是第一次尝试，重新加载图片列表
        if (!selectedImage && retryCount < maxRetries) {
          logManager.info(`No image found, reloading image list...`, { module: 'API', request: req });
          await this.loadImageList();
          retryCount++;
        } else {
          break;
        }
      }
      
      if (!selectedImage) {
        const processingTime = Date.now() - startTime;
        logManager.warn(`Image not found after ${retryCount + 1} attempts (${processingTime}ms)`, { module: 'API', request: req });
        
        return res.status(404).json({
          error: 'Image not found',
          path: cleanPath,
          message: this.getNotFoundMessage(decodedParts),
          processingTime
        });
      }
      
      // 修复点1：确保selectedImage有完整路径
      const imagePath = selectedImage._fullPath || selectedImage.fullPath;
      if (!imagePath) {
        logManager.error(`No full path available for image: ${selectedImage.name}`, { module: 'API', request: req });
        return res.status(500).json({
          error: 'Internal server error',
          message: 'Image path is invalid',
          processingTime: Date.now() - startTime
        });
      }
      
      // 修复点2：确保文件路径存在
      if (!(await this.cachedPathExists(imagePath))) {
        logManager.error(`Image file not found: ${imagePath}`, { module: 'API', request: req });
        return res.status(404).json({
          error: 'Image not found',
          message: `File not found: ${selectedImage.name}`,
          processingTime: Date.now() - startTime
        });
      }
      
      // 修复点3：确保web路径正确构建
      const webPath = '/api/' + (selectedImage.path || selectedImage.name);
      
      const imageInfo = {
        name: selectedImage.name,
        size: selectedImage.size,
        uploadtime: selectedImage.uploadtime,
        path: webPath,
        processingTime: Date.now() - startTime
      };
      
      // 设置缓存
      if (!isRandom && cacheKey) {
        const cacheData = {
          ...imageInfo,
          _fullPath: imagePath,
          cached_at: logManager.getCurrentTimestamp()
        };
        
        try {
          await this.cacheManager.set(cacheKey, cacheData);
          logManager.debug(`Cached: ${cacheKey}`, { module: 'API', request: req });
        } catch (cacheErr) {
          logManager.warn(`Failed to cache ${cacheKey}: ${cacheErr.message}`, { module: 'API', request: req });
        }
      }
      
      // 返回JSON响应
      if (isJson) {
        logManager.debug(`JSON response returned (${imageInfo.processingTime}ms)`, { module: 'API', request: req });
        return res.json(imageInfo);
      }
      
      // 返回文件响应
      try {
        const mimeType = selectedImage._mimeType || FileUtils.getMimeType(imagePath) || 'image/jpeg';
        
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', isRandom ? 
          'no-cache, no-store, must-revalidate' : 
          'public, max-age=3600'
        );
        res.setHeader('X-Is-Random', isRandom.toString());
        res.setHeader('X-Processing-Time', imageInfo.processingTime.toString());
        res.setHeader('X-Cache', 'MISS');
        
        logManager.debug(`File response sent: ${selectedImage.name} (${imageInfo.processingTime}ms)`, { module: 'API', request: req });
        return res.sendFile(path.resolve(imagePath));
      } catch (fileErr) {
        logManager.error(`Error sending file: ${fileErr.message}`, { module: 'API', request: req });
        return res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to send image file',
          processingTime: Date.now() - startTime
        });
      }
      
    } catch (err) {
      const processingTime = Date.now() - startTime;
      logManager.error(`API error: ${err.message} (${processingTime}ms)`, { module: 'API', request: req });
      logManager.debug(`Error stack: ${err.stack}`, { module: 'API' });
      
      return res.status(500).json({
        error: 'Internal server error',
        path: cleanPath,
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        processingTime
      });
    }
  }

  /**
   * 获取API统计信息
   * @returns {Object} 统计信息
   */
  getApiStats() {
    return {
      images: {
        total: this.imageDetails.length,
        directories: Object.keys(this.imageList).length
      },
      cache: this.cacheManager.getStats(),
      rateLimiter: this.limiter.getStats(),
      fileCache: {
        size: this.fileExistsCache.size,
        ttl: this.FILE_CACHE_TTL / 1000 + 's'
      }
    };
  }
}

module.exports = ApiService;
