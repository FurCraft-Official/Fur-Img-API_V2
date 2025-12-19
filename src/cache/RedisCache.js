const { createClient } = require('redis');
const BaseCache = require('./BaseCache');
const logManager = require('../logging/LogManager');

/**
 * Redis缓存实现
 */
class RedisCache extends BaseCache {
  constructor(config) {
    super(config);
    this.client = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = config.redis.reconnect.maxRetries;
    this.retryInterval = config.redis.reconnect.retryInterval;
    this.connectTimeout = config.redis.reconnect.connectTimeout;
    this.reconnectTimeout = null;
  }

  /**
   * 初始化Redis连接
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      await this.connect();
      this.setupEventListeners();
      logManager.info('Redis cache initialized', { module: 'CACHE' });
    } catch (error) {
      logManager.error(`Failed to initialize Redis cache: ${error.message}`, { module: 'CACHE' });
      throw error;
    }
  }

  /**
   * 连接到Redis服务器
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      const { host, port, password, db } = this.config.redis;
      
      this.client = createClient({
        socket: {
          host,
          port,
          connectTimeout: this.connectTimeout
        },
        password,
        database: db
      });

      await this.client.connect();
      this.isConnected = true;
      this.retryCount = 0;
      logManager.info(`Connected to Redis at ${host}:${port}`, { module: 'CACHE' });
    } catch (error) {
      this.isConnected = false;
      logManager.error(`Redis connection error: ${error.message}`, { module: 'CACHE' });
      throw error;
    }
  }

  /**
   * 设置Redis事件监听器
   */
  setupEventListeners() {
    // 错误事件
    this.client.on('error', (error) => {
      logManager.error(`Redis error: ${error.message}`, { module: 'CACHE' });
      this.isConnected = false;
      this.handleReconnect();
    });

    // 断开连接事件
    this.client.on('end', () => {
      logManager.warn('Redis connection ended', { module: 'CACHE' });
      this.isConnected = false;
    });

    // 重新连接事件
    this.client.on('reconnecting', (info) => {
      logManager.info(`Redis reconnecting: attempt ${info.attempt}`, { module: 'CACHE' });
    });

    // 连接事件
    this.client.on('connect', () => {
      logManager.info('Redis connected', { module: 'CACHE' });
    });
  }

  /**
   * 处理Redis重连逻辑
   */
  handleReconnect() {
    if (this.retryCount >= this.maxRetries) {
      logManager.error(`Max Redis reconnection attempts reached (${this.maxRetries})`, { module: 'CACHE' });
      return;
    }

    this.retryCount++;
    const delay = this.retryInterval * Math.pow(1.5, this.retryCount - 1); // 指数退避
    
    logManager.info(`Attempting to reconnect to Redis in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`, { module: 'CACHE' });
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logManager.error(`Reconnection attempt ${this.retryCount} failed: ${error.message}`, { module: 'CACHE' });
        this.handleReconnect();
      }
    }, delay);
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @returns {Promise<any>} 缓存值或null
   */
  async get(key) {
    try {
      if (!this.isConnected) {
        logManager.warn('Redis not connected, skipping cache get', { module: 'CACHE' });
        this.updateStats(false);
        return null;
      }

      const value = await this.client.get(key);
      this.updateStats(value !== null);
      
      if (value !== null) {
        logManager.debug(`Cache hit: ${key}`, { module: 'CACHE' });
        return JSON.parse(value);
      } else {
        logManager.debug(`Cache miss: ${key}`, { module: 'CACHE' });
        return null;
      }
    } catch (error) {
      logManager.error(`Failed to get cache: ${key} - ${error.message}`, { module: 'CACHE' });
      this.updateStats(false);
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
      if (!this.isConnected) {
        logManager.warn('Redis not connected, skipping cache set', { module: 'CACHE' });
        return false;
      }

      const actualTtl = ttl || this.redisTtl;
      const serializedValue = JSON.stringify(value);
      
      if (actualTtl > 0) {
        await this.client.set(key, serializedValue, { EX: actualTtl });
      } else {
        await this.client.set(key, serializedValue);
      }
      
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
      if (!this.isConnected) {
        logManager.warn('Redis not connected, skipping cache del', { module: 'CACHE' });
        return false;
      }

      await this.client.del(key);
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
      if (!this.isConnected) {
        logManager.warn('Redis not connected, skipping cache clear', { module: 'CACHE' });
        return false;
      }

      await this.client.flushDb();
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
    try {
      if (!this.isConnected) {
        logManager.warn('Redis not connected, skipping cache TTL', { module: 'CACHE' });
        return -2;
      }

      return await this.client.ttl(key);
    } catch (error) {
      logManager.error(`Failed to get TTL: ${key} - ${error.message}`, { module: 'CACHE' });
      return -2;
    }
  }

  /**
   * 设置缓存键的过期时间
   * @param {string} key - 缓存键
   * @param {number} seconds - 过期时间（秒）
   * @returns {Promise<boolean>} 是否设置成功
   */
  async expire(key, seconds) {
    try {
      if (!this.isConnected) {
        logManager.warn('Redis not connected, skipping cache expire', { module: 'CACHE' });
        return false;
      }

      const result = await this.client.expire(key, seconds);
      logManager.debug(`Set expire: ${key} (${seconds}s) - ${result ? 'success' : 'failed'}`, { module: 'CACHE' });
      return result;
    } catch (error) {
      logManager.error(`Failed to set expire: ${key} - ${error.message}`, { module: 'CACHE' });
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计信息
   */
  getStats() {
    return {
      ...super.getStats(),
      redisConnected: this.isConnected,
      retryCount: this.retryCount
    };
  }

  /**
   * 重置重试计数器
   */
  resetRetryCount() {
    this.retryCount = 0;
    logManager.info('Redis retry count reset', { module: 'CACHE' });
  }

  /**
   * 手动重连
   * @returns {Promise<void>}
   */
  async manualReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.retryCount = 0;
    await this.connect();
  }

  /**
   * 关闭Redis连接
   * @returns {Promise<void>}
   */
  async close() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      logManager.info('Redis connection closed', { module: 'CACHE' });
    }
  }
}

module.exports = RedisCache;
