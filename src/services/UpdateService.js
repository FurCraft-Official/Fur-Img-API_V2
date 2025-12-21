const fs = require('fs-extra');
const path = require('path');
const FileUtils = require('../utils/FileUtils');
const logManager = require('../logging/LogManager');

/**
 * 更新服务类，负责扫描图片目录并更新图片列表
 */
class UpdateService {
  constructor(config) {
    this.config = config;
    this.imagesPath = path.resolve(config.paths.images);
    this.updateInterval = null;
  }

  /**
   * 启动更新服务
   * @returns {Promise<void>}
   */
  async start() {
    logManager.info('Update service started', { module: 'UPDATE' });
    
    // 立即执行一次图片列表更新
    try {
      await this.updateImageList();
    } catch (error) {
      logManager.error(`Failed to update image list on startup: ${error.message}`, { module: 'UPDATE' });
    }
    
    // 如果配置了自动更新，启动定时任务
    if (this.config.update.hours > 0) {
      this.startAutoUpdate();
    }
  }

  /**
   * 启动自动更新定时任务
   */
  startAutoUpdate() {
    const interval = this.config.update.hours * 60 * 60 * 1000; // 转换为毫秒
    this.updateInterval = setInterval(async () => {
      try {
        logManager.info('Running scheduled update', { module: 'UPDATE' });
        await this.updateImageList();
      } catch (error) {
        logManager.error(`Scheduled update failed: ${error.message}`, { module: 'UPDATE' });
      }
    }, interval);
    
    logManager.info(`Auto update scheduled every ${this.config.update.hours} hours`, { module: 'UPDATE' });
  }

  /**
   * 手动更新图片列表
   * @param {any} req - Express请求对象
   * @param {any} res - Express响应对象
   * @returns {Promise<void>}
   */
  async handleManualUpdate(req, res) {
    try {
      logManager.info('Manual update triggered', { module: 'UPDATE', request: req });
      await this.updateImageList();
      
      res.json({
        success: true,
        message: 'Image list updated successfully',
        timestamp: logManager.getCurrentTimestamp()
      });
    } catch (error) {
      logManager.error(`Manual update failed: ${error.message}`, { module: 'UPDATE', request: req });
      
      res.status(500).json({
        success: false,
        error: 'Update failed',
        message: error.message,
        timestamp: logManager.getCurrentTimestamp()
      });
    }
  }

  /**
   * 更新图片列表
   * @returns {Promise<void>}
   */
  async updateImageList() {
    const startTime = Date.now();
    logManager.info('Starting image list update...', { module: 'UPDATE' });
    
    try {
      // 扫描图片目录
      const { imageList, imageDetails } = await this.scanImages();
      
      // 保存图片列表
      await this.saveImageList(imageList, imageDetails);
      
      // 保存统计信息
      await this.saveStats(imageList, imageDetails);
      
      const duration = Date.now() - startTime;
      logManager.info(`Image list updated successfully in ${duration}ms - ${imageDetails.length} images in ${Object.keys(imageList).length} directories`, { module: 'UPDATE' });
    } catch (error) {
      logManager.error(`Failed to update image list: ${error.message}`, { module: 'UPDATE' });
      throw error;
    }
  }

  /**
   * 扫描图片目录
   * @returns {Promise<{imageList: Object, imageDetails: Array}>}
   */
  async scanImages() {
    const imageList = {};
    const imageDetails = [];
    const supportedExtensions = this.config.update.supportedExtensions;
    
    logManager.info(`Scanning images from: ${this.imagesPath}`, { module: 'UPDATE' });
    logManager.info(`Supported extensions: ${supportedExtensions.join(', ')}`, { module: 'UPDATE' });
    
    // 递归扫描目录
    await this.scanDirectory(this.imagesPath, '', imageList, imageDetails, supportedExtensions);
    
    // 处理根目录（_root）
    if (!imageList._root) {
      imageList._root = {};
    }
    
    return { imageList, imageDetails };
  }

  /**
   * 递归扫描目录
   * @param {string} dirPath - 当前目录路径
   * @param {string} relativePath - 相对路径
   * @param {Object} imageList - 图片列表
   * @param {Array} imageDetails - 图片详情列表
   * @param {Array} supportedExtensions - 支持的扩展名列表
   * @returns {Promise<void>}
   */
  async scanDirectory(dirPath, relativePath, imageList, imageDetails, supportedExtensions) {
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        const fileRelativePath = relativePath ? path.join(relativePath, file.name) : file.name;
        
        if (file.isDirectory()) {
          // 递归扫描子目录
          await this.scanDirectory(fullPath, fileRelativePath, imageList, imageDetails, supportedExtensions);
        } else if (file.isFile()) {
          // 检查文件扩展名
          const ext = path.extname(file.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            await this.processImageFile(fullPath, file.name, relativePath, imageList, imageDetails);
          }
        }
      }
    } catch (error) {
      logManager.error(`Error scanning directory ${dirPath}: ${error.message}`, { module: 'UPDATE' });
    }
  }

  /**
   * 处理图片文件
   * @param {string} fullPath - 文件完整路径
   * @param {string} filename - 文件名
   * @param {string} directory - 目录名
   * @param {Object} imageList - 图片列表
   * @param {Array} imageDetails - 图片详情列表
   * @returns {Promise<void>}
   */
  async processImageFile(fullPath, filename, directory, imageList, imageDetails) {
    try {
      const stats = await fs.stat(fullPath);
      const uploadtime = stats.mtime.toISOString();
      const directoryKey = directory || '_root';
      
      // 添加到图片列表
      if (!imageList[directoryKey]) {
        imageList[directoryKey] = {};
      }
      imageList[directoryKey][filename] = uploadtime;
      
      // 添加到图片详情
      const relativePath = directory ? path.join(directory, filename) : filename;
      const mimeType = FileUtils.getMimeType(fullPath);
      
      imageDetails.push({
        name: filename,
        size: stats.size,
        uploadtime,
        path: relativePath.replace(/\\/g, '/'),
        _fullPath: fullPath,
        _directory: directoryKey,
        _extension: path.extname(filename).toLowerCase(),
        _mimeType: mimeType
      });
    } catch (error) {
      logManager.error(`Error processing file ${fullPath}: ${error.message}`, { module: 'UPDATE' });
    }
  }

  /**
   * 保存图片列表
   * @param {Object} imageList - 图片列表
   * @param {Array} imageDetails - 图片详情列表
   * @returns {Promise<void>}
   */
  async saveImageList(imageList, imageDetails) {
    try {
      const listPath = path.join(__dirname, '../../list.json');
      const detailsPath = path.join(__dirname, '../../images-details.json');
      
      // 保存图片列表
      await FileUtils.safeWriteJson(listPath, imageList);
      logManager.info(`Saved image list to ${listPath}`, { module: 'UPDATE' });
      
      // 保存图片详情
      await FileUtils.safeWriteJson(detailsPath, imageDetails);
      logManager.info(`Saved image details to ${detailsPath}`, { module: 'UPDATE' });
    } catch (error) {
      logManager.error(`Failed to save image list: ${error.message}`, { module: 'UPDATE' });
      throw error;
    }
  }

  /**
   * 保存统计信息
   * @param {Object} imageList - 图片列表
   * @param {Array} imageDetails - 图片详情列表
   * @returns {Promise<void>}
   */
  async saveStats(imageList, imageDetails) {
    try {
      const statsPath = path.join(__dirname, '../../list.stats.json');
      const stats = {
        generated: new Date().toISOString(),
        stats: {
          totalImages: imageDetails.length,
          totalDirectories: Object.keys(imageList).length,
          directories: Object.keys(imageList).reduce((acc, dir) => {
            acc[dir] = Object.keys(imageList[dir]).length;
            return acc;
          }, {})
        },
        timezone: this.config.timezone
      };
      
      await FileUtils.safeWriteJson(statsPath, stats);
      logManager.info(`Saved stats to ${statsPath}`, { module: 'UPDATE' });
    } catch (error) {
      logManager.error(`Failed to save stats: ${error.message}`, { module: 'UPDATE' });
      throw error;
    }
  }

  /**
   * 停止更新服务
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logManager.info('Update service stopped', { module: 'UPDATE' });
    }
  }
}

module.exports = UpdateService;
