const fs = require('fs-extra');
const path = require('path');
const logManager = require('../logging/LogManager');

class FileUtils {
  /**
   * 安全读取JSON文件
   * @param {string} filePath - 文件路径
   * @param {any} defaultValue - 默认值
   * @returns {Promise<any>} 文件内容或默认值
   */
  static async safeReadJson(filePath, defaultValue = null) {
    try {
      if (!(await fs.pathExists(filePath))) {
        logManager.debug(`JSON file does not exist: ${filePath}`, { module: 'UTILS' });
        return defaultValue;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      if (!content || content.trim().length === 0) {
        logManager.warn(`JSON file is empty: ${filePath}`, { module: 'UTILS' });
        return defaultValue;
      }
      
      const data = JSON.parse(content);
      logManager.debug(`Successfully read JSON file: ${filePath}`, { module: 'UTILS' });
      return data;
      
    } catch (error) {
      logManager.error(`Error reading JSON file ${filePath}: ${error.message}`, { module: 'UTILS' });
      return defaultValue;
    }
  }

  /**
   * 安全写入JSON文件
   * @param {string} filePath - 文件路径
   * @param {any} data - 要写入的数据
   * @param {Object} options - 写入选项
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async safeWriteJson(filePath, data, options = {}) {
    const lockFile = `${filePath}.lock`;
    const tempFile = `${filePath}.tmp`;
    const maxRetries = 5;
    const retryDelay = 100;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        if (await fs.pathExists(lockFile)) {
          logManager.debug(`JSON file is locked, waiting... (attempt ${i + 1})`, { module: 'UTILS' });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        await fs.writeFile(lockFile, process.pid.toString());
        
        await fs.writeJson(tempFile, data, { spaces: 2, ...options });
        
        await fs.move(tempFile, filePath, { overwrite: true });
        
        await fs.unlink(lockFile);
        
        logManager.debug(`Successfully wrote JSON file: ${filePath}`, { module: 'UTILS' });
        return true;
        
      } catch (error) {
        logManager.error(`Error writing JSON file ${filePath} (attempt ${i + 1}): ${error.message}`, { module: 'UTILS' });
        
        try {
          if (await fs.pathExists(tempFile)) {
            await fs.unlink(tempFile);
          }
          if (await fs.pathExists(lockFile)) {
            await fs.unlink(lockFile);
          }
        } catch (cleanupError) {
          // 忽略清理错误
        }
        
        if (i === maxRetries - 1) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    return false;
  }

  /**
   * 获取文件的MIME类型
   * @param {string} filePath - 文件路径
   * @returns {string} MIME类型
   */
  static getMimeType(filePath) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript'
    };
    
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 确保目录存在
   * @param {string} dirPath - 目录路径
   * @returns {Promise<void>}
   */
  static async ensureDir(dirPath) {
    try {
      await fs.ensureDir(dirPath);
    } catch (error) {
      logManager.error(`Error ensuring directory ${dirPath}: ${error.message}`, { module: 'UTILS' });
      throw error;
    }
  }

  /**
   * 获取文件大小
   * @param {string} filePath - 文件路径
   * @returns {Promise<number>} 文件大小（字节）
   */
  static async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      logManager.error(`Error getting file size for ${filePath}: ${error.message}`, { module: 'UTILS' });
      return 0;
    }
  }
}

module.exports = FileUtils;
