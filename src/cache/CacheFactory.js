const RedisCache = require('./RedisCache');
const MemoryCache = require('./MemoryCache');
const logManager = require('../logging/LogManager');

class CacheFactory {
  /**
   * 创建缓存实例
   * @param {Object} config - 应用配置
   * @param {boolean} useRedis - 是否使用Redis缓存（可选，默认根据配置决定）
   * @returns {Promise<BaseCache>} 缓存实例
   */
  static async createCache(config, useRedis = null) {
    // 如果没有指定是否使用Redis，根据配置决定
    const shouldUseRedis = useRedis !== null ? useRedis : config.cache.enabled;
    
    let cache;
    
    if (shouldUseRedis) {
      try {
        cache = new RedisCache(config);
        await cache.initialize();
        logManager.info('Using Redis cache', { module: 'CACHE' });
      } catch (error) {
        logManager.error(`Failed to initialize Redis cache, falling back to memory cache: ${error.message}`, { module: 'CACHE' });
        // Redis初始化失败，回退到内存缓存
        cache = new MemoryCache(config);
        await cache.initialize();
        logManager.info('Falling back to memory cache', { module: 'CACHE' });
      }
    } else {
      cache = new MemoryCache(config);
      await cache.initialize();
      logManager.info('Using memory cache', { module: 'CACHE' });
    }
    
    return cache;
  }
}

module.exports = CacheFactory;
