const { LRUCache } = require('lru-cache');
const BaseCache = require('./BaseCache');
const logManager = require('../logging/LogManager');

/**
 * 内存缓存实现，基于LRU缓存
 */
class MemoryCache extends BaseCache {
  constructor(config) {
    super(config);
    this.cache = null;
    this.cleanupInterval = null;
  }

  /**
   * 初始化缓存
   * @returns {Promise<void>}
   */
  async initialize() {
    // 创建LRU缓存实例 - 使用正确的API语法
    this.cache = new LRUCache({
      max: 1000,
      ttl: this.ttl * 1000, // 转换为毫秒
      updateAgeOnGet: false,
      updateAgeOnHas: false
    });

    // 设置定期清理任务
    if (this.config.cache.map_cleanup_interval > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, this.config.cache.map_cleanup_interval);
    }

    logManager.info('Memory cache initialized', { module: 'CACHE' });
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @returns {Promise<any>} 缓存值或null
   */
  async get(key) {
    const value = this.cache.get(key);
    this.updateStats(value !== undefined);
    
    if (value !== undefined) {
      logManager.debug(`Cache hit: ${key}`, { module: 'CACHE' });
      return value;
    } else {
      logManager.debug(`Cache miss: ${key}`, { module: 'CACHE' });
      return null;
    }
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttl - 过期时间（秒，可选）
   * @returns {Promise<boolean>} 是否设置成功
   */
  async set(key, value, ttl = null) {
    try {
      const actualTtl = ttl || this.ttl;
      this.cache.set(key, value, actualTtl * 1000); // 转换为毫秒
      this.stats.keys = this.cache.size;
      logManager.debug(`Cache set: ${key} (TTL: ${actualTtl}s)`, { module: 'CACHE' });
      return true;
    } catch (error) {
      logManager.error(`Failed to set cache: ${key} - ${error.message}`, { module: 'CACHE' });
      return false;
    }
  }

  /**
   * 删除缓存值
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否删除成功
   */
  async del(key) {
    try {
      this.cache.del(key);
      this.stats.keys = this.cache.size;
      logManager.debug(`Cache deleted: ${key}`, { module: 'CACHE' });
      return true;
    } catch (error) {
      logManager.error(`Failed to delete cache: ${key} - ${error.message}`, { module: 'CACHE' });
      return false;
    }
  }

  /**
   * 清空缓存
   * @returns {Promise<boolean>} 是否清空成功
   */
  async clear() {
    try {
      this.cache.reset();
      this.stats.keys = 0;
      logManager.info('Cache cleared', { module: 'CACHE' });
      return true;
    } catch (error) {
      logManager.error(`Failed to clear cache: ${error.message}`, { module: 'CACHE' });
      return false;
    }
  }

  /**
   * 获取缓存键的过期时间
   * @param {string} key - 缓存键
   * @returns {Promise<number>} 过期时间（秒）
   */
  async getTTL(key) {
    // LRU缓存不支持直接获取TTL，返回默认值
    if (this.cache.has(key)) {
      return this.ttl;
    }
    return -2; // 键不存在
  }

  /**
   * 设置缓存键的过期时间
   * @param {string} key - 缓存键
   * @param {number} seconds - 过期时间（秒）
   * @returns {Promise<boolean>} 是否设置成功
   */
  async expire(key, seconds) {
    try {
      const value = this.cache.get(key);
      if (value !== undefined) {
        // 重新设置值，使用新的TTL
        this.cache.set(key, value, seconds * 1000);
        return true;
      }
      return false;
    } catch (error) {
      logManager.error(`Failed to set expire: ${key} - ${error.message}`, { module: 'CACHE' });
      return false;
    }
  }

  /**
   * 定期清理缓存
   */
  cleanup() {
    // LRU缓存会自动清理过期项，这里主要更新统计信息
    this.stats.keys = this.cache.size;
    logManager.debug(`Cache cleanup - current size: ${this.cache.size}`, { module: 'CACHE' });
  }

  /**
   * 关闭缓存连接
   * @returns {Promise<void>}
   */
  async close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logManager.info('Memory cache closed', { module: 'CACHE' });
  }
}

module.exports = MemoryCache;
