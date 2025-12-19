const logManager = require('../logging/LogManager');

/**
 * @typedef {import('../types').RateLimitConfig} RateLimitConfig
 * @typedef {import('../types').RateLimitStatus} RateLimitStatus
 */

/**
 * 请求限流管理器
 */
class RequestLimiter {
  constructor(config) {
    this.config = config.rate_limit || this.getDefaultConfig();
    this.windows = new Map();        // 请求计数窗口
    this.banList = new Map();        // 封禁列表
    this.cleanupInterval = null;
    
    // 初始化配置
    this.initializeConfig(config);
    
    // 启动清理定时器
    this.startCleanupInterval();
  }

  /**
   * 获取默认配置
   * @returns {RateLimitConfig}
   */
  getDefaultConfig() {
    return {
      enabled: true,
      window_size: 60000,           // 1分钟窗口
      requests_per_minute: 60,      // 每分钟请求数
      max_clients: 100,             // 最大客户端数
      cleanup_interval: 60000,      // 清理间隔
      ban_duration: 10000           // 封禁时长
    };
  }

  /**
   * 初始化配置
   * @param {any} config - 应用配置
   */
  initializeConfig(config) {
    // 如果没有配置，使用默认值
    if (!config.rate_limit) {
      logManager.warn('Rate limit configuration missing, using defaults', { module: 'API' });
      config.rate_limit = this.getDefaultConfig();
    }

    // 合并配置，确保所有字段都有值
    const defaultConfig = this.getDefaultConfig();
    this.config = {
      ...defaultConfig,
      ...config.rate_limit
    };

    // 设置属性别名，确保向后兼容
    this.windowSize = this.config.window_size;
    this.limit = this.config.requests_per_minute;
    this.maxClients = this.config.max_clients;
    this.enabled = this.config.enabled;
    this.banDuration = this.config.ban_duration;

    logManager.info(`Rate limiter initialized: ${this.limit} req/min, window: ${this.windowSize}ms, max clients: ${this.maxClients}, ban duration: ${this.banDuration}ms`, { module: 'API' });
  }

  /**
   * 启动清理定时器
   */
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanup_interval);
  }

  /**
   * 检查客户端是否被封禁
   * @param {string} clientIP - 客户端IP
   * @returns {boolean} 是否被封禁
   */
  isBanned(clientIP) {
    const banInfo = this.banList.get(clientIP);
    if (!banInfo) return false;

    const now = Date.now();
    if (now >= banInfo.endTime) {
      this.banList.delete(clientIP);
      // 解封时清除该IP的请求记录
      this.windows.delete(clientIP);
      logManager.info(`Ban expired for client: ${clientIP}, clearing request history`, { module: 'API' });
      return false;
    }

    return true;
  }

  /**
   * 获取客户端封禁状态
   * @param {string} clientIP - 客户端IP
   * @returns {RateLimitStatus|null} 封禁状态或null
   */
  getBanStatus(clientIP) {
    const banInfo = this.banList.get(clientIP);
    if (!banInfo) return null;

    const now = Date.now();
    if (now >= banInfo.endTime) {
      this.banList.delete(clientIP);
      this.windows.delete(clientIP);
      return null;
    }

    return {
      banned: true,
      remainingTime: Math.ceil((banInfo.endTime - now) / 1000), // 剩余秒数
      banEndTime: new Date(banInfo.endTime).toISOString(),
      reason: banInfo.reason
    };
  }

  /**
   * 封禁客户端
   * @param {string} clientIP - 客户端IP
   * @param {string} reason - 封禁原因
   */
  banClient(clientIP, reason = 'Rate limit exceeded') {
    // 如果已经被封禁，不要更新封禁时间
    if (this.banList.has(clientIP)) {
      logManager.debug(`Client ${clientIP} is already banned, skipping new ban`, { module: 'API' });
      return;
    }

    const now = Date.now();
    this.banList.set(clientIP, {
      startTime: now,
      endTime: now + this.banDuration,
      reason: reason
    });
    logManager.warn(`Client banned: ${clientIP} (${reason}) for ${this.banDuration/1000} seconds`, { module: 'API' });
  }

  /**
   * 检查请求是否允许
   * @param {string} clientIP - 客户端IP
   * @returns {boolean} 是否允许请求
   */
  isAllowed(clientIP) {
    // 如果限流未启用，直接允许
    if (!this.enabled) return true;

    // 首先检查是否被封禁
    if (this.isBanned(clientIP)) {
      const banStatus = this.getBanStatus(clientIP);
      logManager.debug(`Request rejected - client is banned: ${clientIP}, remaining time: ${banStatus.remainingTime}s`, { module: 'API' });
      return false;
    }

    const now = Date.now();
    
    // 清理过期记录
    this.cleanupOldRequests();

    let requests = this.windows.get(clientIP);
    if (!requests) {
      if (this.windows.size >= this.maxClients) {
        logManager.warn(`Max clients limit reached (${this.maxClients}), rejecting new client: ${clientIP}`, { module: 'API' });
        return false;
      }
      requests = [];
    }

    const windowStart = now - this.windowSize;
    requests = requests.filter(time => time > windowStart);

    // 记录调试信息
    logManager.debug(`Rate limit check for ${clientIP}: ${requests.length}/${this.limit} requests in current window`, { module: 'API' });

    if (requests.length >= this.limit) {
      // 在封禁前清除该IP的请求记录，这样解封后从0开始计数
      this.windows.delete(clientIP);
      // 触发临时封禁
      this.banClient(clientIP);
      return false;
    }

    requests.push(now);
    this.windows.set(clientIP, requests);
    return true;
  }

  /**
   * 清理过期请求记录
   */
  cleanupOldRequests() {
    const now = Date.now();
    const windowStart = now - this.windowSize;
    
    for (const [ip, requests] of this.windows.entries()) {
      const validRequests = requests.filter(time => time > windowStart);
      
      if (validRequests.length === 0) {
        this.windows.delete(ip);
      } else {
        this.windows.set(ip, validRequests);
      }
    }
  }

  /**
   * 清理过期记录和超出限制的客户端
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    // 清理请求记录
    this.cleanupOldRequests();

    // 清理过期的封禁记录
    for (const [ip, banInfo] of this.banList.entries()) {
      if (now >= banInfo.endTime) {
        this.banList.delete(ip);
        this.windows.delete(ip);
        cleaned++;
        logManager.debug(`Ban expired and removed for client: ${ip}`, { module: 'API' });
      }
    }

    // 如果超出最大客户端数，移除最老的客户端
    if (this.windows.size > this.maxClients) {
      const entries = [...this.windows.entries()]
        .sort((a, b) => Math.max(...a[1]) - Math.max(...b[1]));
      
      const toDelete = entries.slice(0, entries.length - this.maxClients);
      toDelete.forEach(([ip]) => this.windows.delete(ip));
      cleaned += toDelete.length;
    }

    if (cleaned > 0) {
      logManager.debug(`Cleaned up ${cleaned} rate limit and ban records (current clients: ${this.windows.size})`, { module: 'API' });
    }
  }

  /**
   * 获取客户端状态
   * @param {string} clientIP - 客户端IP
   * @returns {RateLimitStatus|null} 客户端状态
   */
  getStatus(clientIP) {
    // 先检查是否被封禁
    const banStatus = this.getBanStatus(clientIP);
    if (banStatus) {
      return banStatus;
    }

    const requests = this.windows.get(clientIP);
    if (!requests) return null;

    const now = Date.now();
    const windowStart = now - this.windowSize;
    const activeRequests = requests.filter(time => time > windowStart);

    return {
      banned: false,
      requests: activeRequests.length,
      window: this.windowSize,
      limit: this.limit,
      remaining: Math.max(0, this.limit - activeRequests.length),
      reset: Math.ceil((Math.max(...activeRequests || [now]) + this.windowSize - now) / 1000)
    };
  }

  /**
   * 启动清理定时器
   */
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanup_interval);
    
    logManager.debug(`Started cleanup interval: ${this.config.cleanup_interval}ms`, { module: 'API' });
  }

  /**
   * 关闭清理定时器
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logManager.debug('Stopped cleanup interval', { module: 'API' });
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      enabled: this.enabled,
      windowSize: this.windowSize,
      limit: this.limit,
      maxClients: this.maxClients,
      currentClients: this.windows.size,
      bannedClients: this.banList.size
    };
  }
}

module.exports = RequestLimiter;
