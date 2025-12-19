// 配置类型
export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
  reconnect: {
    maxRetries: number;
    retryInterval: number;
    connectTimeout: number;
  };
}

export interface ServerConfig {
  http_port: number;
  https_port: number;
  ssl: {
    enabled: boolean;
    cert: string;
    key: string;
  };
  workers: number;
  cors: {
    enabled: boolean;
    origins: string;
    methods: string;
    headers: string;
  };
}

export interface PathsConfig {
  images: string;
  html: string;
}

export interface UpdateConfig {
  hours: number;
  supportedExtensions: string[];
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  redis_ttl: number;
  map_cleanup_interval: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  window_size: number;
  requests_per_minute: number;
  max_clients: number;
  cleanup_interval: number;
  ban_duration: number;
}

export interface LoggingConfig {
  enabled: boolean;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  levels: {
    ERROR: number;
    WARN: number;
    INFO: number;
    DEBUG: number;
  };
  buffer?: {
    size: number;
    flush_interval: number;
  };
}

export interface AppConfig {
  redis: RedisConfig;
  server: ServerConfig;
  paths: PathsConfig;
  update: UpdateConfig;
  cache: CacheConfig;
  rate_limit: RateLimitConfig;
  timezone: string;
  logging: LoggingConfig;
}

// 图片类型
export interface ImageInfo {
  name: string;
  size: number;
  uploadtime: string;
  path: string;
  _fullPath?: string;
  _directory?: string;
  _extension?: string;
  _mimeType?: string;
  cached_at?: string;
  processingTime?: number;
}

export interface ImageList {
  [directory: string]: {
    [filename: string]: string;
  };
}

export interface ImageDetails {
  name: string;
  size: number;
  uploadtime: string;
  path: string;
  _fullPath: string;
  _directory: string;
  _extension: string;
  _mimeType: string;
}

// 缓存类型
export interface CacheStats {
  hits: number;
  misses: number;
  total: number;
  hitRate: number;
  keys: number;
  redisConnected?: boolean;
}

// 日志类型
export interface LogOptions {
  module?: string;
  request?: any;
  workerId?: string;
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

// 健康检查类型
export interface HealthCheck {
  status: 'OK' | 'ERROR';
  uptime: {
    seconds: number;
    human: string;
  };
  memory: {
    rss: string;
    heapTotal: string;
    heapUsed: string;
    external: string;
  };
  cache: CacheStats;
  config: {
    autoUpdate: string;
    https: string;
    cors: string;
    workers: number;
  };
  timestamp: string;
}

// 限流类型
export interface RateLimitStatus {
  banned: boolean;
  requests?: number;
  window?: number;
  limit?: number;
  remaining?: number;
  reset?: number;
  remainingTime?: number;
  banEndTime?: string;
  reason?: string;
}
