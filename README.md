# Fur-Img-API_V2

一个高性能的随机图片服务，支持多线程、Redis缓存、CORS支持和智能缓存管理，是Fur Image API的重构版本。

## 项目特点

- **高性能**：基于Node.js Cluster实现多线程架构，充分利用多核CPU
- **智能缓存**：支持Redis缓存和内存缓存，Redis连接失败时自动降级到内存缓存
- **LRU缓存**：内存缓存使用LRU算法，优化内存使用
- **CORS支持**：支持跨域请求，可配置允许的源、方法和头
- **请求限流**：支持IP级别的请求限流，防止恶意请求
- **模块化设计**：清晰的模块化架构，易于扩展和维护
- **完整的API文档**：提供OpenAPI 3.0规范，可导入到Apifox等工具
- **中文路径支持**：支持中文目录和文件名
- **健康检查**：提供健康检查端点，便于监控
- **统计信息**：提供详细的统计信息

## 技术栈

- Node.js
- Express.js
- Redis
- LRU Cache
- Node.js Cluster

## 快速开始

### 环境要求

- Node.js 16.x 或更高版本
- Redis（可选，用于缓存）

### 安装

1. 克隆项目

```bash
git clone https://github.com/FurCraft/Fur-Img-API_V2.git
cd Fur-Img-API_V2
```

2. 安装依赖

```bash
npm install
```

3. 配置

复制配置文件示例并修改：

```bash
cp config/config.json.example config/config.json
```

修改`config/config.json`文件，根据需要调整配置。

4. 运行

```bash
npm run dev
```

应用将在`http://localhost:3000`上运行。

## 配置说明

配置文件位于`config/config.json`，包含以下配置项：

### Redis配置

```json
{
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "",
    "db": 0,
    "reconnect": {
      "maxRetries": 5,
      "retryInterval": 8000,
      "connectTimeout": 10000
    }
  }
}
```

### 服务器配置

```json
{
  "server": {
    "http_port": 3000,
    "https_port": 3001,
    "ssl": {
      "enabled": false,
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
  }
}
```

### 路径配置

```json
{
  "paths": {
    "images": "./img",
    "html": "./public"
  }
}
```

### 更新配置

```json
{
  "update": {
    "hours": 24,
    "supportedExtensions": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]
  }
}
```

### 缓存配置

```json
{
  "cache": {
    "enabled": true,
    "ttl": 3600,
    "redis_ttl": 7200,
    "map_cleanup_interval": 60000
  }
}
```

### 限流配置

```json
{
  "rate_limit": {
    "enabled": true,
    "window_size": 60000,
    "requests_per_minute": 20,
    "max_clients": 100,
    "cleanup_interval": 60000,
    "ban_duration": 300000
  }
}
```

## API文档

### 基础URL

```
http://localhost:3000
```

### 端点列表

#### 获取随机图片

```
GET /api
```

从所有目录中随机返回一张图片。

**参数**：
- `json`：可选，设置为`1`返回JSON格式

**返回**：
- 图片文件或JSON信息

#### 从指定目录获取随机图片

```
GET /api/{directory}
```

从指定目录中随机返回一张图片。

**参数**：
- `directory`：目录名称
- `json`：可选，设置为`1`返回JSON格式

**返回**：
- 图片文件或JSON信息

#### 获取特定图片

```
GET /api/{directory}/{filename}
```

获取特定目录下的特定图片。

**参数**：
- `directory`：目录名称
- `filename`：图片文件名
- `json`：可选，设置为`1`返回JSON格式

**返回**：
- 图片文件或JSON信息

#### 获取所有图片列表

```
GET /list.json
```

获取所有图片的列表信息。

**返回**：
- 图片列表JSON

#### 获取统计信息

```
GET /stats
```

获取图片服务的详细统计信息。

**返回**：
- 统计信息JSON

#### 手动更新图片列表

```
GET /update
```

手动触发图片列表更新。

**参数**：
- `token`：可选，验证令牌

**返回**：
- 更新结果JSON

#### 健康检查

```
GET /health
```

检查服务健康状态。

**返回**：
- 健康状态JSON

#### 缓存状态

```
GET /cache/status
```

获取缓存状态信息。

**返回**：
- 缓存状态JSON

#### 清空缓存

```
POST /cache/clear
```

清空所有缓存。

**参数**：
- `token`：可选，验证令牌

**返回**：
- 清空结果JSON

#### 手动Redis重连

```
POST /cache/reconnect
```

手动触发Redis重连。

**返回**：
- 重连结果JSON

#### 重置Redis重试计数

```
POST /cache/reset
```

重置Redis重试计数。

**参数**：
- `token`：可选，验证令牌

**返回**：
- 重置结果JSON

#### 获取API文档

```
GET /doc
```

获取API文档信息。

**返回**：
- API文档JSON

## OpenAPI规范

项目提供OpenAPI 3.0规范文件，位于`openapi.yaml`，可导入到Apifox等工具中使用。

## 部署

### 生产环境部署

1. 构建生产版本

```bash
npm run build
```

2. 运行生产版本

```bash
npm start
```

### Docker部署

（待补充）

## 开发指南

### 目录结构

```
.
├── src/
│   ├── api/              # API相关代码
│   ├── cache/            # 缓存相关代码
│   ├── config/           # 配置管理
│   ├── logging/          # 日志管理
│   ├── services/         # 服务层
│   ├── types/            # 类型定义
│   ├── utils/            # 工具函数
│   ├── web/              # Web服务器相关代码
│   ├── app.js            # 主应用入口
│   └── init.js           # 初始化脚本
├── config/               # 配置文件
├── img/                  # 图片目录
├── public/               # 静态文件目录
├── openapi.yaml          # OpenAPI规范
├── package.json          # 项目配置
└── README.md             # 项目文档
```

### 开发流程

1. 安装依赖

```bash
npm install
```

2. 运行开发服务器

```bash
npm run dev
```

3. 运行测试

```bash
npm test
```

4. 运行lint

```bash
npm run lint
```

## 贡献指南

1. Fork项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 许可证

GPL-3.0

## 作者

[BeiChen](https://www.beichen.icu)
[BB0813](https://home.binbim.top)

## 联系方式

如有问题或建议，请通过以下方式联系：

- Email: [FurCraft](mailto:admin@furcraft.top) & [Binbim_ProMax](mailto:binbim_promax@163.com)
- GitHub: [FurCraft-Official](https://github.com/FurCraft-Official) & [棱镜-Prism](https://github.com/Prism-lengjing)
- QQ交流群：[点击进群](https://qm.qq.com/q/y6KkGE9rpe)

## 更新日志

### v2.1.0
- 重构项目结构，采用模块化设计
- 支持Redis缓存和内存缓存
- 实现Node.js Cluster多线程架构
- 提供OpenAPI 3.0规范
- 支持中文路径
- 优化请求处理逻辑
- 增加健康检查和统计信息端点
- 实现请求限流

### V1.0
- Fur-Img-API原始版本

## 致谢

感谢所有为项目做出贡献的人！
