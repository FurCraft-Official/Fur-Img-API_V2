const configManager = require('../config/ConfigManager');

/**
 * @typedef {import('../types').LogOptions} LogOptions
 */

class LogManager {
  constructor() {
    this.config = null;
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    this.buffer = [];
  }

  /**
   * 初始化日志管理器
   * @param {any} config - 应用配置
   */
  initialize(config) {
    this.config = config;
    
    // 如果配置了缓冲区，设置自动刷新
    if (this.config.logging.buffer) {
      const { flush_interval } = this.config.logging.buffer;
      setInterval(() => this.flushBuffer(), flush_interval);
    }
  }

  /**
   * 格式化时间
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(date = new Date()) {
    try {
      const targetTimezone = this.config?.timezone || 'Asia/Shanghai';
      const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: targetTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(date);
      const year = parts.find(part => part.type === 'year').value;
      const month = parts.find(part => part.type === 'month').value;
      const day = parts.find(part => part.type === 'day').value;
      const hour = parts.find(part => part.type === 'hour').value;
      const minute = parts.find(part => part.type === 'minute').value;
      const second = parts.find(part => part.type === 'second').value;
      
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch (error) {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
  }

  /**
   * 检查日志级别是否应该输出
   * @param {string} level - 日志级别
   * @returns {boolean} 是否应该输出
   */
  shouldLog(level) {
    if (!this.config || !this.config.logging.enabled) {
      return false;
    }
    
    const currentLevel = this.config.logging.levels[this.config.logging.level] || this.logLevels.INFO;
    const messageLevel = this.logLevels[level] || this.logLevels.INFO;
    
    return messageLevel <= currentLevel;
  }

  /**
   * 记录日志
   * @param {string} message - 日志消息
   * @param {string} level - 日志级别
   * @param {LogOptions} options - 日志选项
   */
  log(message, level = 'INFO', options = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    const { module = 'APP', request = null, workerId = null } = options;
    const timestamp = this.formatTime();
    const processWorkerId = process.env.WORKER_ID || workerId || (require('cluster').worker ? require('cluster').worker.id : 'master');
    
    let logMessage = `[${timestamp}] [${level}] [${module}] [W${processWorkerId}]`;
    
    if (request) {
      const ip = request.headers['x-forwarded-for'] || request.connection.remoteAddress || request.ip || 'unknown';
      const url = request.url || '';
      logMessage += ` ${ip} ${request.method || 'GET'} ${url}`;
    }
    
    logMessage += ` ${message}`;

    // 如果配置了缓冲区，先存入缓冲区
    if (this.config.logging.buffer) {
      this.buffer.push(logMessage);
      if (this.buffer.length >= this.config.logging.buffer.size) {
        this.flushBuffer();
      }
    } else {
      // 否则直接输出
      this.outputLog(logMessage, level);
    }
  }

  /**
   * 输出日志到控制台
   * @param {string} logMessage - 格式化后的日志消息
   * @param {string} level - 日志级别
   */
  outputLog(logMessage, level) {
    switch (level) {
      case 'ERROR':
        console.error(logMessage);
        break;
      case 'WARN':
        console.warn(logMessage);
        break;
      case 'INFO':
      case 'DEBUG':
      default:
        console.log(logMessage);
        break;
    }
  }

  /**
   * 刷新日志缓冲区
   */
  flushBuffer() {
    if (this.buffer.length === 0) {
      return;
    }

    const bufferCopy = [...this.buffer];
    this.buffer = [];
    
    bufferCopy.forEach(logMessage => {
      // 从日志消息中提取级别
      const levelMatch = logMessage.match(/\[(ERROR|WARN|INFO|DEBUG)\]/);
      const level = levelMatch ? levelMatch[1] : 'INFO';
      this.outputLog(logMessage, level);
    });
  }

  /**
   * 错误日志
   * @param {string} message - 日志消息
   * @param {LogOptions} options - 日志选项
   */
  error(message, options = {}) {
    this.log(message, 'ERROR', options);
  }

  /**
   * 警告日志
   * @param {string} message - 日志消息
   * @param {LogOptions} options - 日志选项
   */
  warn(message, options = {}) {
    this.log(message, 'WARN', options);
  }

  /**
   * 信息日志
   * @param {string} message - 日志消息
   * @param {LogOptions} options - 日志选项
   */
  info(message, options = {}) {
    this.log(message, 'INFO', options);
  }

  /**
   * 调试日志
   * @param {string} message - 日志消息
   * @param {LogOptions} options - 日志选项
   */
  debug(message, options = {}) {
    this.log(message, 'DEBUG', options);
  }

  /**
   * 获取当前时间戳
   * @returns {string} 格式化后的时间字符串
   */
  getCurrentTimestamp() {
    return this.formatTime();
  }

  /**
   * 将ISO时间转换为本地时间
   * @param {string} isoString - ISO时间字符串
   * @returns {string} 本地时间字符串
   */
  isoToLocal(isoString) {
    return this.formatTime(new Date(isoString));
  }
}

// 导出单例实例
const logManager = new LogManager();
module.exports = logManager;
