# Random Image API 项目文档

## 1. 项目概述

### 1.1 项目简介
Random Image API 是一个高性能的随机图片服务，支持多线程、Redis缓存、CORS支持和智能缓存管理。该服务可以从指定目录中随机返回图片，支持多种图片格式，并提供详细的统计信息和API文档。

### 1.2 技术栈
- **后端框架**: Express.js
- **缓存**: Redis + LRU Cache
- **多线程**: Node.js Cluster
- **HTTP/HTTPS**: 内置支持
- **日志**: 自定义日志系统
- **工具库**: fs-extra, mime-types, lru-cache

### 1.3 主要功能
- ✅ 随机图片返回（全局或指定目录）
- ✅ 特定图片请求
- ✅ 图片列表和统计信息
- ✅ Redis缓存支持
- ✅ 多线程处理
- ✅ CORS支持
- ✅ HTTPS支持
- ✅ 请求限流
- ✅ 健康检查
- ✅ 缓存管理API

## 2. 项目结构

```
Fur-node-imgapi/
├── config/              # 配置文件
│   ├── config.json      # 主配置文件
│   └── config.json.bak  # 配置备份
├── img/                 # 图片存储目录
├── public/              # 静态文件（HTML, CSS等）
├── ssl/                 # SSL证书目录
├── app.js               # 应用入口
├── api.js               # API服务
├── web.js               # Web服务
├── cache-manager.js     # Redis缓存管理器
├── simple-cache-manager.js # 简单缓存管理器
├── update.js            # 图片更新服务
├── utils.js             # 工具函数
├── package.json         # 项目依赖
├── list.json            # 图片列表
├── images-details.json  # 图片详细信息
└── list.stats.json      # 图片统计信息
```

## 3. 配置说明

### 3.1 主配置文件（config/config.json）

```json
{
  "redis": {              "host": "localhost",
    "port": 6379,
    "password": "",
    "db": 0,
    "reconnect": {
      "maxRetries": 5,
      "retryInterval": 8000,
      "connectTimeout": 10000
    }
  },
  "server": {
    "http_port": 3000,
    "https_port": 3001,
    "ssl": {
      "enabled": true,
      "cert": "./ssl/fullchain.pem",
      "key": "./ssl/privkey.pem"
    },
    "workers": 4,
    "cors": {
      "enabled": true,
      "origins": "*",
      "methods": "GET, POST, PUT, DELETE, OPTIONS",
      "headers": "Content-Type, Authorization"
    }
  },
  "paths": {
    "images": "./img",
    "html": "./public"
  },
  "update": {
    "hours": 24,
    "supportedExtensions": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]
  },
  "cache": {
    "enabled": true,
    "ttl": 3600,
    "redis_ttl": 7200,
    "map_cleanup_interval": 60000
  },
  "rate_limit": {
    "enabled": true,
    "window_size": 60000,
    "requests_per_minute": 20,
    "max_clients": 100,
    "cleanup_interval": 60000,
    "ban_duration": 300000
  },
  "timezone": "Asia/Shanghai",
  "logging": {
    "enabled": true,
    "level": "INFO"
  }
}
```

### 3.2 配置项说明

| 配置项 | 类型 | 描述 |
|--------|------|------|
| `redis.host` | string | Redis服务器地址 |
| `redis.port` | number | Redis服务器端口 |
| `server.http_port` | number | HTTP服务端口 |
| `server.https_port` | number | HTTPS服务端口 |
| `server.ssl.enabled` | boolean | 是否启用HTTPS |
| `server.workers` | number | 工作进程数量 |
| `paths.images` | string | 图片存储目录 |
| `update.hours` | number | 图片自动更新间隔（小时） |
| `cache.enabled` | boolean | 是否启用缓存 |
| `cache.ttl` | number | 缓存过期时间（秒） |
| `rate_limit.enabled` | boolean | 是否启用限流 |
| `rate_limit.requests_per_minute` | number | 每分钟最大请求数 |

## 4. API 文档

### 4.1 基础信息

- **API版本**: 2.1.0
- **Base URL**: `http://localhost:3000` 或 `https://localhost:3001`
- **认证**: 部分API需要 `UPDATE_TOKEN` 环境变量验证

### 4.2 主要端点

#### 4.2.1 获取随机图片
```
GET /api
```
- **描述**: 从所有目录中随机返回一张图片
- **参数**: 
  - `json=1` (可选): 返回JSON格式的图片信息
- **响应**: 图片文件或JSON对象

#### 4.2.2 从指定目录获取随机图片
```
GET /api/{directory}
```
- **描述**: 从指定目录中随机返回一张图片
- **参数**: 
  - `directory`: 目录名称
  - `json=1` (可选): 返回JSON格式

#### 4.2.3 获取特定图片
```
GET /api/{directory}/{filename}
```
- **描述**: 获取特定目录下的特定图片
- **参数**: 
  - `directory`: 目录名称
  - `filename`: 图片文件名
  - `json=1` (可选): 返回JSON格式

#### 4.2.4 获取图片列表
```
GET /list.json
```
- **描述**: 获取所有图片的列表信息
- **响应**: JSON数组，包含所有图片信息

#### 4.2.5 获取统计信息
```
GET /stats
```
- **描述**: 获取图片服务的详细统计信息
- **响应**: JSON对象，包含生成时间、图片总数等

#### 4.2.6 手动更新图片列表
```
GET /update?token={TOKEN}
```
- **描述**: 手动触发图片列表更新
- **参数**: 
  - `token`: 验证令牌（来自环境变量 `UPDATE_TOKEN`）

#### 4.2.7 健康检查
```
GET /health
```
- **描述**: 检查服务健康状态
- **响应**: JSON对象，包含服务状态、内存使用、缓存状态等

#### 4.2.8 缓存状态
```
GET /cache/status
```
- **描述**: 获取缓存状态信息
- **响应**: JSON对象，包含缓存命中、未命中、Redis连接状态等

#### 4.2.9 清空缓存
```
POST /cache/clear?token={TOKEN}
```
- **描述**: 清空所有缓存
- **参数**: 
  - `token`: 验证令牌

## 5. 部署与运行

### 5.1 安装依赖
```bash
npm install
```

### 5.2 启动服务

#### 5.2.1 开发模式
```bash
npm run dev
```

#### 5.2.2 生产模式
```bash
npm run prod
```

#### 5.2.3 自定义启动
```bash
node app.js
```

### 5.3 环境变量

| 环境变量 | 描述 | 默认值 |
|----------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `UPDATE_TOKEN` | 更新API的验证令牌 | 无 |
| `WORKER_ID` | 工作进程ID | 自动分配 |

## 6. 缓存机制

### 6.1 缓存策略

1. **Redis缓存**: 用于持久化缓存和多进程共享
2. **LRU缓存**: 用于进程内快速缓存
3. **文件存在性缓存**: 减少磁盘I/O操作

### 6.2 缓存键格式

```
api:/api/{directory}/{filename}:{json|file}
```

例如:
- `api:/api/cats/kitty.jpg:file` - 图片文件缓存
- `api:/api/dogs/puppy.png:json` - JSON信息缓存

### 6.3 缓存过期时间

| 缓存类型 | 过期时间 | 配置项 |
|----------|----------|--------|
| 图片文件 | 3600秒 | `cache.ttl` |
| Redis缓存 | 7200秒 | `cache.redis_ttl` |
| 文件存在性 | 300秒 | 硬编码 |

## 7. 日志系统

### 7.1 日志格式

```
[2025-12-20 14:30:00] [INFO] [WEB] [W1] 127.0.0.1 GET /api 200 15ms 12345bytes
```

### 7.2 日志级别

| 级别 | 描述 |
|------|------|
| ERROR | 错误信息 |
| WARN | 警告信息 |
| INFO | 普通信息 |
| DEBUG | 调试信息 |

### 7.3 日志配置

在 `config.json` 中配置:

```json
{
  "logging": {
    "enabled": true,
    "level": "INFO"
  }
}
```

## 8. 多线程架构

### 8.1 主进程 (Master)

- 负责创建和管理工作进程
- 监控工作进程状态
- 处理工作进程重启

### 8.2 工作进程 (Worker)

- 处理HTTP请求
- 管理缓存
- 服务静态文件
- 第一个工作进程负责缓存初始化和Redis连接

### 8.3 进程间通信

- 使用Node.js Cluster内置通信机制
- 工作进程状态共享通过Redis

## 9. 限流机制

### 9.1 限流策略

- **窗口大小**: 1分钟
- **请求限制**: 每分钟60次（可配置）
- **封禁机制**: 超过限制会被临时封禁
- **最大客户端数**: 100个（可配置）

### 9.2 限流实现

使用滑动窗口算法实现限流，主要功能:
- IP识别和计数
- 自动清理过期记录
- 封禁和解封机制
- 状态查询API

## 10. 图片管理

### 10.1 图片格式支持

- JPG/JPEG
- PNG
- GIF
- WebP
- BMP
- SVG

### 10.2 图片更新机制

1. **自动更新**: 每24小时自动扫描图片目录
2. **手动更新**: 通过 `/update` API触发
3. **更新流程**:
   - 扫描图片目录
   - 生成图片列表
   - 更新统计信息
   - 清理无效缓存

### 10.3 图片信息文件

- **list.json**: 按目录存储图片列表
- **images-details.json**: 详细的图片信息（大小、路径等）
- **list.stats.json**: 统计信息（总数、生成时间等）

## 11. 监控与维护

### 11.1 健康检查

```
GET /health
```

返回服务状态、内存使用、缓存状态等信息

### 11.2 缓存监控

```
GET /cache/status
```

返回缓存命中率、Redis连接状态等

### 11.3 日志监控

- 实时查看控制台输出
- 可配置日志级别
- 支持按模块过滤

## 12. 安全措施

### 12.1 HTTPS支持

- 内置HTTPS服务器
- 支持自定义SSL证书
- 可配置HTTP到HTTPS重定向

### 12.2 CORS配置

- 支持跨域资源共享
- 可配置允许的来源、方法和头部
- 支持凭证传递

### 12.3 请求验证

- 部分API需要令牌验证
- 环境变量存储敏感信息
- 请求限流防止DDoS攻击

## 13. 故障排除

### 13.1 常见问题

#### 13.1.1 Redis连接失败
- 检查Redis服务是否运行
- 验证Redis配置（host, port, password）
- 查看防火墙设置

#### 13.1.2 图片无法访问
- 检查图片目录权限
- 验证图片格式是否支持
- 查看日志中的错误信息

#### 13.1.3 服务启动失败
- 检查端口是否被占用
- 验证配置文件格式
- 查看依赖是否安装完整

### 13.2 日志分析

- 查看控制台输出的日志信息
- 根据日志级别过滤相关信息
- 检查错误堆栈跟踪

## 14. 开发与扩展

### 14.1 代码结构

- **模块化设计**: 各功能模块独立
- **清晰的接口**: 模块间通过明确的API通信
- **可扩展性**: 易于添加新功能

### 14.2 扩展建议

- 添加图片上传功能
- 实现图片压缩和格式转换
- 添加用户认证和权限管理
- 实现图片分类和标签系统
- 添加监控仪表盘

## 15. 性能优化

### 15.1 缓存优化

- 合理设置缓存过期时间
- 使用多级缓存策略
- 定期清理无效缓存

### 15.2 资源优化

- 压缩静态资源
- 优化图片加载速度
- 合理设置响应头

### 15.3 代码优化

- 使用异步操作减少阻塞
- 优化数据库查询
- 减少不必要的计算

## 16. 版本历史

| 版本 | 日期 | 主要变化 |
|------|------|----------|
| 2.1.0 | 2025-12-20 | 优化缓存机制，添加限流功能 |
| 2.0.0 | 2025-11-15 | 重构代码结构，支持多线程 |
| 1.5.0 | 2025-10-01 | 添加HTTPS支持，优化API |
| 1.0.0 | 2025-09-01 | 初始版本发布 |

## 17. 贡献指南

### 17.1 开发流程

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 运行测试
5. 提交Pull Request

### 17.2 代码规范

- 使用ESLint进行代码检查
- 遵循JavaScript Standard Style
- 添加适当的注释
- 编写测试用例

### 17.3 提交规范

- 提交信息清晰明了
- 使用语义化提交信息
- 包含相关Issue编号

## 18. 许可证

本项目采用 GNU General Public License v3.0 许可证

## 19. 联系方式

- 项目地址: [GitHub](https://github.com/yourusername/Fur-node-imgapi)
- 问题反馈: [Issues](https://github.com/yourusername/Fur-node-imgapi/issues)
- 文档更新: [Wiki](https://github.com/yourusername/Fur-node-imgapi/wiki)

---

**文档生成时间**: 2025-12-20
**文档版本**: 1.0.0
**项目版本**: 2.1.0

