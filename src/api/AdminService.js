const fs = require('fs-extra');
const path = require('path');
const logManager = require('../logging/LogManager');
const UpdateService = require('../services/UpdateService');
const FileUtils = require('../utils/FileUtils');

/**
 * 管理服务类，处理图片管理相关的API请求
 */
class AdminService {
  constructor(config, cacheManager) {
    this.config = config;
    this.cacheManager = cacheManager;
    this.imagesPath = path.resolve(config.paths.images);
    this.supportedExtensions = config.update.supportedExtensions;
  }

  /**
   * 初始化管理服务
   * @returns {Promise<void>}
   */
  async initialize() {
    // 确保图片目录存在
    await fs.ensureDir(this.imagesPath);
    logManager.info('AdminService initialized', { module: 'ADMIN' });
  }

  /**
   * 获取图片列表
   * @param {Object} query - 查询参数
   * @returns {Promise<{images: Array, total: number, page: number, limit: number}>}
   */
  async getImages(query = {}) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 20;
      const directory = query.directory || '';
      const keyword = query.keyword || '';
      const offset = (page - 1) * limit;

      // 读取图片列表
      const listPath = path.join(__dirname, '../../list.json');
      const detailsPath = path.join(__dirname, '../../images-details.json');

      const [imageList, imageDetails] = await Promise.all([
        FileUtils.safeReadJson(listPath, {}),
        FileUtils.safeReadJson(detailsPath, [])
      ]);

      // 过滤图片
      let filtered = imageDetails;
      
      // 目录过滤
      if (directory) {
        filtered = filtered.filter(img => 
          img._directory === directory || img.path.startsWith(directory + '/')
        );
      }
      
      // 关键词搜索
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        filtered = filtered.filter(img => 
          img.name.toLowerCase().includes(lowerKeyword) || 
          img.path.toLowerCase().includes(lowerKeyword)
        );
      }

      // 分页
      const paginated = filtered.slice(offset, offset + limit);

      return {
        images: paginated,
        total: filtered.length,
        page,
        limit
      };
    } catch (error) {
      logManager.error(`Error getting images: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 获取目录列表
   * @returns {Promise<Array>}
   */
  async getDirectories() {
    try {
      // 读取图片列表
      const listPath = path.join(__dirname, '../../list.json');
      const imageList = await FileUtils.safeReadJson(listPath, {});
      return Object.keys(imageList);
    } catch (error) {
      logManager.error(`Error getting directories: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 创建目录
   * @param {string} directory - 目录名称
   * @returns {Promise<boolean>}
   */
  async createDirectory(directory) {
    try {
      if (!directory || directory === '_root') {
        throw new Error('Invalid directory name');
      }

      const dirPath = path.join(this.imagesPath, directory);
      await fs.ensureDir(dirPath);
      logManager.info(`Created directory: ${directory}`, { module: 'ADMIN' });
      return true;
    } catch (error) {
      logManager.error(`Error creating directory: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 删除目录
   * @param {string} directory - 目录名称
   * @returns {Promise<boolean>}
   */
  async deleteDirectory(directory) {
    try {
      if (!directory || directory === '_root') {
        throw new Error('Cannot delete root directory');
      }

      const dirPath = path.join(this.imagesPath, directory);
      await fs.remove(dirPath);
      logManager.info(`Deleted directory: ${directory}`, { module: 'ADMIN' });
      return true;
    } catch (error) {
      logManager.error(`Error deleting directory: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 删除图片
   * @param {string} imagePath - 图片路径
   * @returns {Promise<boolean>}
   */
  async deleteImage(imagePath) {
    try {
      const fullPath = path.join(this.imagesPath, imagePath);
      await fs.remove(fullPath);
      logManager.info(`Deleted image: ${imagePath}`, { module: 'ADMIN' });
      return true;
    } catch (error) {
      logManager.error(`Error deleting image: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 上传图片
   * @param {Object} options - 上传选项
   * @param {Buffer} options.buffer - 图片二进制数据
   * @param {string} options.filename - 图片文件名
   * @param {string} options.directory - 目标目录
   * @returns {Promise<Object>}
   */
  async uploadImage({ buffer, filename, directory = '' }) {
    try {
      // 验证文件扩展名 - 确保文件名正确编码
      const originalFilename = filename;
      // 确保文件名是UTF-8编码
      const normalizedFilename = Buffer.from(filename, 'binary').toString('utf8');
      const ext = path.extname(normalizedFilename).toLowerCase();
      if (!this.supportedExtensions.includes(ext)) {
        throw new Error(`Unsupported file extension: ${ext}. Supported: ${this.supportedExtensions.join(', ')}`);
      }

      // 构建目标路径
      const targetDir = path.join(this.imagesPath, directory);
      await fs.ensureDir(targetDir);
      
      let finalFilename = normalizedFilename;
      let finalPath = path.join(targetDir, finalFilename);
      
      // 检查文件是否已存在，如果存在则添加时间戳
      if (await fs.pathExists(finalPath)) {
        // 提取原始文件名和扩展名，确保中文文件名正确处理
        const basename = path.basename(normalizedFilename, ext);
        const timestamp = Date.now();
        finalFilename = `${basename}_${timestamp}${ext}`;
        finalPath = path.join(targetDir, finalFilename);
      }
      
      // 写入文件，使用二进制模式确保文件内容正确
      await fs.writeFile(finalPath, buffer, { encoding: 'binary' });
      
      // 构建返回路径
      const relativePath = directory ? `${directory}/${finalFilename}` : finalFilename;
      
      logManager.info(`Uploaded image: ${relativePath}`, { module: 'ADMIN' });
      return {
        success: true,
        path: relativePath,
        filename: finalFilename,
        size: buffer.length,
        directory: directory
      };
    } catch (error) {
      logManager.error(`Error uploading image: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 获取系统统计信息
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      // 读取统计信息
      const statsPath = path.join(__dirname, '../../list.stats.json');
      const stats = await FileUtils.safeReadJson(statsPath, {});
      return {
        ...stats,
        cache: this.cacheManager.getStats()
      };
    } catch (error) {
      logManager.error(`Error getting stats: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 更新图片列表
   * @returns {Promise<Object>}
   */
  async updateImageList() {
    try {
      const updateService = new UpdateService(this.config);
      await updateService.updateImageList();
      logManager.info('Image list updated via admin', { module: 'ADMIN' });
      return { success: true };
    } catch (error) {
      logManager.error(`Error updating image list: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }

  /**
   * 清理缓存
   * @returns {Promise<Object>}
   */
  async clearCache() {
    try {
      await this.cacheManager.clear();
      logManager.info('Cache cleared via admin', { module: 'ADMIN' });
      return { success: true };
    } catch (error) {
      logManager.error(`Error clearing cache: ${error.message}`, { module: 'ADMIN' });
      throw error;
    }
  }
}

module.exports = AdminService;