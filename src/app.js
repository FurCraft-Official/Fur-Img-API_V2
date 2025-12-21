const cluster = require('cluster');
const os = require('os');
const configManager = require('./config/ConfigManager');
const logManager = require('./logging/LogManager');
const CacheFactory = require('./cache/CacheFactory');
const WebServer = require('./web/WebServer');
const UpdateService = require('./services/UpdateService');

// 全局状态管理
let isShuttingDown = false;
let workerRestartCount = new Map();
const MAX_WORKER_RESTARTS = 3;
const RESTART_WINDOW = 60000;

/**
 * 初始化应用
 */
async function initializeApp() {
  console.log('[DEBUG] Starting initializeApp');
  try {
    // 加载配置
    console.log('[DEBUG] Loading configuration...');
    const config = await configManager.load();
    console.log('[DEBUG] Configuration loaded successfully');
    
    // 初始化日志管理器
    console.log('[DEBUG] Initializing log manager...');
    logManager.initialize(config);
    console.log('[DEBUG] Log manager initialized');
    
    console.log('[DEBUG] Application initialization started');
    logManager.info('Application initialization started', { module: 'APP' });
    
    // 暂时禁用多线程，便于调试
    console.log('[DEBUG] Calling startWorker...');
    await startWorker(config);
    console.log('[DEBUG] startWorker completed successfully');
    // // 如果是主进程，启动多进程管理
    // if (cluster.isMaster || cluster.isPrimary) {
    //   await startMaster(config);
    // } else {
    //   // 如果是工作进程，启动Web服务
    //   await startWorker(config);
    // }
  } catch (error) {
    console.error(`[ERROR] Application initialization failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
  console.log('[DEBUG] initializeApp completed');
}

/**
 * 启动主进程
 * @param {any} config - 应用配置
 */
async function startMaster(config) {
  logManager.info(`Master process started (PID: ${process.pid})`, { module: 'APP' });
  logManager.info(`Creating ${config.server.workers} workers`, { module: 'APP' });
  logManager.info(`Timezone: ${config.timezone}`, { module: 'APP' });
  logManager.info(`Logging: ${config.logging.enabled ? 'enabled' : 'disabled'} (level: ${config.logging.level})`, { module: 'APP' });
  logManager.info(`Cache enabled: ${config.cache.enabled}`, { module: 'APP' });
  logManager.info(`Redis reconnection: max ${config.redis.reconnect.maxRetries} attempts, ${config.redis.reconnect.retryInterval/1000}s interval`, { module: 'APP' });
  logManager.info(`Auto update: ${config.update.hours > 0 ? config.update.hours + ' hours' : 'disabled'}`, { module: 'APP' });
  logManager.info(`HTTPS: ${config.server.ssl.enabled === true || config.server.ssl.enabled === 1 ? 'enabled' : 'disabled'}`, { module: 'APP' });
  logManager.info(`CORS: ${config.server.cors.enabled ? 'enabled' : 'disabled'}`, { module: 'APP' });
  
  // 创建工作进程
  for (let i = 0; i < config.server.workers; i++) {
    forkWorker();
  }
  
  // 设置事件监听器
  setupMasterEventListeners(config);
  
  // 设置关闭处理
  setupShutdownHandlers();
}

/**
 * 创建工作进程
 */
function forkWorker() {
  const worker = cluster.fork();
  logManager.info(`Worker ${worker.process.pid} started (ID: ${worker.id})`, { module: 'APP' });
}

/**
 * 设置主进程事件监听器
 * @param {any} config - 应用配置
 */
function setupMasterEventListeners(config) {
  // 监听工作进程退出
  cluster.on('exit', (worker, code, signal) => {
    if (isShuttingDown) {
      logManager.info(`Worker ${worker.process.pid} (ID: ${worker.id}) exited during shutdown`, { module: 'APP' });
      return;
    }
    
    logManager.error(`Worker ${worker.process.pid} (ID: ${worker.id}) died with code ${code} and signal ${signal}`, { module: 'APP' });
    
    // 检查是否应该重启
    if (shouldRestartWorker(worker.id)) {
      recordWorkerRestart(worker.id);
      
      // 延迟重启，避免快速重启循环
      setTimeout(() => {
        if (!isShuttingDown) {
          const newWorker = cluster.fork();
          logManager.info(`New worker ${newWorker.process.pid} (ID: ${newWorker.id}) started to replace ${worker.id}`, { module: 'APP' });
        }
      }, 2000);
    } else {
      logManager.warn(`Worker ${worker.id} will not be restarted due to restart limits or shutdown`, { module: 'APP' });
    }
  });
  
  // 监听工作进程在线
  cluster.on('online', (worker) => {
    logManager.debug(`Worker ${worker.id} is online`, { module: 'APP' });
  });
  
  // 监听工作进程断开连接
  cluster.on('disconnect', (worker) => {
    logManager.debug(`Worker ${worker.id} disconnected`, { module: 'APP' });
  });
}

/**
 * 检查工作进程是否应该重启
 * @param {number} workerId - 工作进程ID
 * @returns {boolean} 是否应该重启
 */
function shouldRestartWorker(workerId) {
  if (isShuttingDown) {
    return false;
  }
  
  const now = Date.now();
  const restarts = workerRestartCount.get(workerId) || [];
  
  // 清理超出时间窗口的重启记录
  const recentRestarts = restarts.filter(time => now - time < RESTART_WINDOW);
  workerRestartCount.set(workerId, recentRestarts);
  
  // 检查是否超过最大重启次数
  if (recentRestarts.length >= MAX_WORKER_RESTARTS) {
    logManager.error(`Worker ${workerId} has restarted ${recentRestarts.length} times in the last minute, not restarting`, { module: 'APP' });
    return false;
  }
  
  return true;
}

/**
 * 记录工作进程重启
 * @param {number} workerId - 工作进程ID
 */
function recordWorkerRestart(workerId) {
  const restarts = workerRestartCount.get(workerId) || [];
  restarts.push(Date.now());
  workerRestartCount.set(workerId, restarts);
}

/**
 * 启动工作进程
 * @param {any} config - 应用配置
 */
async function startWorker(config) {
  console.log('[DEBUG] startWorker: Starting...');
  try {
    console.log('[DEBUG] startWorker: Getting workerId...');
    const workerId = cluster.worker ? cluster.worker.id : 1;
    console.log(`[DEBUG] startWorker: WorkerId is ${workerId}`);
    
    console.log(`[DEBUG] startWorker: Loading CacheFactory...`);
    
    // 创建缓存管理器
    console.log(`[DEBUG] startWorker: Creating cache manager, useRedis=false...`);
    const useRedis = false; // 默认不使用Redis，可通过配置修改
    const cacheManager = await CacheFactory.createCache(config, useRedis);
    console.log('[DEBUG] startWorker: Cache manager created successfully');
    
    // 只有第一个工作进程初始化更新服务
    if (workerId === 1) {
      console.log('[DEBUG] startWorker: Initializing UpdateService...');
      const UpdateService = require('./services/UpdateService');
      const updateService = new UpdateService(config);
      await updateService.start();
      console.log('[DEBUG] startWorker: UpdateService initialized successfully');
    }
    
    // 启动Web服务器
    console.log('[DEBUG] startWorker: Initializing WebServer...');
    const WebServer = require('./web/WebServer');
    const webServer = new WebServer(config, cacheManager);
    await webServer.start();
    console.log('[DEBUG] startWorker: WebServer started successfully');
    
    console.log('[DEBUG] startWorker: Registering shutdown handlers...');
    // 注册关闭处理
    registerWorkerShutdownHandlers(webServer, cacheManager);
    console.log('[DEBUG] startWorker: Shutdown handlers registered');
    
    console.log('[DEBUG] startWorker: Completed successfully');
  } catch (error) {
    console.error(`[ERROR] startWorker failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 注册工作进程关闭处理
 * @param {WebServer} webServer - Web服务器实例
 * @param {any} cacheManager - 缓存管理器实例
 */
function registerWorkerShutdownHandlers(webServer, cacheManager) {
  // 优雅关闭
  const shutdown = async (signal) => {
    logManager.info(`Received ${signal}, shutting down worker...`, { module: 'APP' });
    try {
      if (webServer && typeof webServer.stop === 'function') {
        await webServer.stop();
      }
      
      if (cacheManager && typeof cacheManager.close === 'function') {
        await cacheManager.close();
      }
      
      process.exit(0);
    } catch (error) {
      logManager.error(`Error during shutdown: ${error.message}`, { module: 'APP' });
      process.exit(1);
    }
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      shutdown('MESSAGE');
    }
  });
  
  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    logManager.error(`Uncaught exception in worker: ${error.message}`, { module: 'APP' });
    logManager.debug(`Stack: ${error.stack}`, { module: 'APP' });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logManager.error(`Unhandled rejection in worker: ${reason}`, { module: 'APP' });
    process.exit(1);
  });
}

/**
 * 设置主进程关闭处理
 */
function setupShutdownHandlers() {
  // 优雅关闭
  const shutdown = (signal) => {
    if (isShuttingDown) {
      logManager.warn('Shutdown already in progress', { module: 'APP' });
      return;
    }
    
    isShuttingDown = true;
    logManager.info(`Master received ${signal}, shutting down all workers...`, { module: 'APP' });
    
    const workers = Object.values(cluster.workers);
    let workersAlive = workers.length;
    
    if (workersAlive === 0) {
      logManager.info('No workers to shut down, master exiting', { module: 'APP' });
      process.exit(0);
      return;
    }
    
    // 发送关闭信号给所有工作进程
    workers.forEach(worker => {
      if (worker && !worker.isDead()) {
        worker.send('shutdown');
        worker.disconnect();
      }
    });
    
    // 监听工作进程退出
    const exitHandler = () => {
      workersAlive--;
      logManager.debug(`Workers remaining: ${workersAlive}`, { module: 'APP' });
      if (workersAlive === 0) {
        logManager.info('All workers shut down, master exiting', { module: 'APP' });
        process.exit(0);
      }
    };
    
    cluster.on('exit', exitHandler);
    
    // 强制退出超时
    setTimeout(() => {
      logManager.warn('Force killing remaining workers after timeout', { module: 'APP' });
      workers.forEach(worker => {
        if (worker && !worker.isDead()) {
          worker.kill('SIGKILL');
        }
      });
      
      setTimeout(() => {
        logManager.warn('Force exit after timeout', { module: 'APP' });
        process.exit(1);
      }, 2000);
    }, 10000);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    logManager.error(`Uncaught exception in master: ${error.message}`, { module: 'APP' });
    logManager.debug(`Stack: ${error.stack}`, { module: 'APP' });
    shutdown('UNCAUGHT_EXCEPTION');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logManager.error(`Unhandled rejection in master: ${reason}`, { module: 'APP' });
    shutdown('UNHANDLED_REJECTION');
  });
}

// 启动应用
initializeApp().catch(error => {
  console.error(`[ERROR] Application startup failed: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
