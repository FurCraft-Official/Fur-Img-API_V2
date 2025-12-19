const fs = require('fs-extra');
const path = require('path');

/**
 * @typedef {import('../types').AppConfig} AppConfig
 */

class ConfigManager {
  constructor() {
    this.config = null;
    this.configPath = path.join(__dirname, '../../config/config.json');
  }

  /**
   * 加载配置文件
   * @returns {Promise<AppConfig>}
   */
  async load() {
    try {
      if (!await fs.pathExists(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const configData = await fs.readJson(this.configPath);
      this.config = this.validateConfig(configData);
      return this.config;
    } catch (error) {
      console.error(`[ERROR] Failed to load configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * 验证配置文件格式
   * @param {any} configData - 原始配置数据
   * @returns {AppConfig}
   */
  validateConfig(configData) {
    // 定义默认配置
    const defaultConfig = {
      redis: {
        host: 'localhost',
        port: 6379,
        password: '',
        db: 0,
        reconnect: {
          maxRetries: 5,
          retryInterval: 8000,
          connectTimeout: 10000
        }
      },
      server: {
        http_port: 3000,
        https_port: 3001,
        ssl: {
          enabled: false,
          cert: './ssl/fullchain.pem',
          key: './ssl/privkey.pem'
        },
        workers: require('os').cpus().length,
        cors: {
          enabled: true,
          origins: '*',
          methods: 'GET, POST, PUT, DELETE, OPTIONS',
          headers: 'Content-Type, Authorization'
        }
      },
      paths: {
        images: './img',
        html: './public'
      },
      update: {
        hours: 24,
        supportedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
      },
      cache: {
        enabled: true,
        ttl: 3600,
        redis_ttl: 7200,
        map_cleanup_interval: 60000
      },
      rate_limit: {
        enabled: true,
        window_size: 60000,
        requests_per_minute: 20,
        max_clients: 100,
        cleanup_interval: 60000,
        ban_duration: 300000
      },
      timezone: 'Asia/Shanghai',
      logging: {
        enabled: true,
        level: 'INFO',
        levels: {
          ERROR: 0,
          WARN: 1,
          INFO: 2,
          DEBUG: 3
        }
      }
    };

    // 递归合并配置
    const mergeConfigs = (target, source) => {
      // 处理数组情况
      if (Array.isArray(target) && Array.isArray(source)) {
        return source;
      }
      
      if (typeof target !== 'object' || typeof source !== 'object') {
        return source !== undefined ? source : target;
      }

      const merged = { ...target };
      for (const key in source) {
        if (source.hasOwnProperty(key)) {
          merged[key] = mergeConfigs(target[key], source[key]);
        }
      }
      return merged;
    };

    return mergeConfigs(defaultConfig, configData);
  }

  /**
   * 获取配置
   * @returns {AppConfig}
   */
  getConfig() {
    if (!this.config) {
      throw new Error('Configuration not loaded yet');
    }
    return this.config;
  }

  /**
   * 重新加载配置
   * @returns {Promise<AppConfig>}
   */
  async reload() {
    return this.load();
  }

  /**
   * 保存配置
   * @param {AppConfig} newConfig - 新配置
   * @returns {Promise<void>}
   */
  async save(newConfig) {
    try {
      this.config = this.validateConfig(newConfig);
      await fs.writeJson(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      console.error(`[ERROR] Failed to save configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取特定模块的配置
   * @param {string} module - 模块名称
   * @returns {any}
   */
  getModuleConfig(module) {
    if (!this.config) {
      throw new Error('Configuration not loaded yet');
    }
    return this.config[module] || null;
  }
}

// 导出单例实例
const configManager = new ConfigManager();
module.exports = configManager;
