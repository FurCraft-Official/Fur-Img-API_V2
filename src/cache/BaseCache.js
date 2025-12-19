/**
 * @typedef {import('../types').CacheStats} CacheStats
 */

/**
 * 缓存抽象类，定义统一的缓存接口
 */
class BaseCache {
  constructor(config) {
    this.config = config;
    this.stats = {
      hits: 0,
      misses: 0,
      total: 0,
      hitRate: 0,
      keys: 0
    };
    this.ttl = config.cache.ttl;
    this.redisTtl = config.cache.redis_ttl;
  }

  /**
   * 初始化缓存
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @returns {Promise<any>} 缓存值或null
   */
  async get(key) {
    throw new Error('get() must be implemented by subclass');
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttl - 过期时间（秒，可选）
   * @returns {Promise<boolean>} 是否设置成功
   */
  async set(key, value, ttl = null) {
    throw new Error('set() must be implemented by subclass');
  }

  /**
   * 删除缓存值
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否删除成功
   */
  async del(key) {
    throw new Error('del() must be implemented by subclass');
  }

  /**
   * 清空缓存
   * @returns {Promise<boolean>} 是否清空成功
   */
  async clear() {
    throw new Error('clear() must be implemented by subclass');
  }

  /**
   * 获取缓存键的过期时间
   * @param {string} key - 缓存键
   * @returns {Promise<number>} 过期时间（秒）
   */
  async getTTL(key) {
    throw new Error('getTTL() must be implemented by subclass');
  }

  /**
   * 设置缓存键的过期时间
   * @param {string} key - 缓存键
   * @param {number} seconds - 过期时间（秒）
   * @returns {Promise<boolean>} 是否设置成功
   */
  async expire(key, seconds) {
    throw new Error('expire() must be implemented by subclass');
  }

  /**
   * 获取缓存统计信息
   * @returns {CacheStats} 缓存统计信息
   */
  getStats() {
    if (this.stats.total > 0) {
      this.stats.hitRate = Math.round((this.stats.hits / this.stats.total) * 100);
    }
    return this.stats;
  }

  /**
   * 更新缓存统计信息
   * @param {boolean} hit - 是否命中
   */
  updateStats(hit) {
    this.stats.total++;
    if (hit) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
  }

  /**
   * 关闭缓存连接
   * @returns {Promise<void>}
   */
  async close() {
    // 默认实现，子类可以覆盖
  }

  /**
   * 重置重试计数器（Redis缓存特有）
   */
  resetRetryCount() {
    // 默认实现，子类可以覆盖
  }

  /**
   * 手动重连（Redis缓存特有）
   * @returns {Promise<void>}
   */
  async manualReconnect() {
    // 默认实现，子类可以覆盖
  }
}

module.exports = BaseCache;
