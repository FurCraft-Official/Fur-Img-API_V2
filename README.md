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
- **WebUI管理界面**：提供直观的Web管理界面，支持图片上传、删除、目录管理等功能
- **图片管理**：支持图片列表查看、搜索、筛选和分页
- **目录管理**：支持目录的创建、删除和切换
- **响应式设计**：适配不同屏幕尺寸，支持移动端访问

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

应用将在`http://localhost:13000`上运行。

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

## Redis开关说明

### 默认行为
- 项目默认**不开启Redis**，使用内存缓存（LRU Cache）
- 即使配置了Redis，默认也不会自动启用
- Redis连接失败时，系统会自动回退到内存缓存

### 启用Redis的方法

#### 方法1：修改代码（推荐）

在使用缓存的地方，显式指定使用Redis：

```javascript
const CacheFactory = require('./src/cache/CacheFactory');

// 创建Redis缓存实例
const cache = await CacheFactory.createCache(config, true);
```

#### 方法2：修改缓存工厂默认行为

编辑`src/cache/CacheFactory.js`文件，修改默认Redis使用逻辑：

```javascript
// 找到这行代码
const shouldUseRedis = useRedis !== null ? useRedis : false;

// 修改为
const shouldUseRedis = useRedis !== null ? useRedis : true;
```

### Redis配置说明

确保在`config/config.json`中正确配置Redis连接信息：

```json
{
  "redis": {
    "host": "localhost",      // Redis主机地址
    "port": 6379,             // Redis端口
    "password": "",          // Redis密码（如果有）
    "db": 0,                  // Redis数据库索引
    "reconnect": {
      "maxRetries": 5,        // 最大重试次数
      "retryInterval": 8000,  // 重试间隔（毫秒）
      "connectTimeout": 10000 // 连接超时（毫秒）
    }
  }
}
```

### 验证Redis是否启用

1. 启动应用后，查看日志输出
2. 如果看到"Using Redis cache"，表示Redis已成功启用
3. 如果看到"Using memory cache"或"Falling back to memory cache"，表示使用的是内存缓存
4. 访问`/cache/status`端点，查看缓存状态信息

### Redis与内存缓存的区别

| 特性 | Redis缓存 | 内存缓存 |
|------|-----------|----------|
| 存储位置 | 外部Redis服务器 | 应用进程内存 |
| 缓存容量 | 取决于Redis配置 | 取决于应用内存 |
| 持久化 | 支持 | 不支持 |
| 多实例共享 | 支持 | 不支持 |
| 启动速度 | 较慢（需建立连接） | 较快 |
| 依赖 | 需要Redis服务 | 无外部依赖 |

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

## WebUI管理界面

### 访问方式

WebUI管理界面可以通过以下URL访问：

```
http://localhost:13000/admin
```

### 功能介绍

#### 1. 图片管理
- 查看图片列表，支持分页浏览
- 搜索和筛选图片
- 上传新图片
- 删除图片
- 查看图片详细信息

#### 2. 目录管理
- 创建新目录
- 删除现有目录
- 切换不同目录查看图片

#### 3. 系统操作
- 手动更新图片列表
- 清空缓存
- 查看系统统计信息

### 使用说明

1. **访问WebUI**：在浏览器中输入`http://localhost:13000/admin`
2. **浏览图片**：在左侧选择目录，右侧会显示对应目录下的图片
3. **上传图片**：点击"上传图片"按钮，选择文件并点击"上传"
4. **搜索图片**：在搜索框中输入关键词，点击"搜索"按钮
5. **删除图片**：点击图片卡片上的"删除"按钮，确认后删除
6. **创建目录**：点击"创建目录"按钮，输入目录名并确认
7. **更新图片列表**：点击"更新图片列表"按钮，手动触发图片列表更新
8. **清空缓存**：点击"清空缓存"按钮，清空系统缓存

## API文档

### 基础URL

```
http://localhost:13000
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

## 管理API

### 基础URL

```
http://localhost:13000/admin/api
```

### 管理页面

```
GET /admin
```

访问WebUI管理页面。

**返回**：
- 管理页面HTML

### 图片管理

#### 获取图片列表

```
GET /admin/api/images
```

获取图片列表，支持分页和筛选。

**参数**：
- `page`：页码，默认1
- `limit`：每页数量，默认24
- `directory`：目录名称，可选
- `keyword`：搜索关键词，可选
- `sort`：排序选项，可选

**返回**：
- 图片列表JSON，包含分页信息

#### 删除图片

```
DELETE /admin/api/images/:path
```

删除指定路径的图片。

**参数**：
- `path`：图片路径
- `token`：验证令牌，可选

**返回**：
- 删除结果JSON

### 目录管理

#### 获取目录列表

```
GET /admin/api/directories
```

获取所有目录列表。

**返回**：
- 目录列表JSON

#### 创建目录

```
POST /admin/api/directories
```

创建新目录。

**参数**：
- `name`：目录名称
- `token`：验证令牌，可选

**返回**：
- 创建结果JSON

#### 删除目录

```
DELETE /admin/api/directories/:name
```

删除指定目录。

**参数**：
- `name`：目录名称
- `token`：验证令牌，可选

**返回**：
- 删除结果JSON

### 系统管理

#### 获取系统统计信息

```
GET /admin/api/stats
```

获取系统统计信息。

**返回**：
- 统计信息JSON

#### 更新图片列表

```
POST /admin/api/update
```

手动触发图片列表更新。

**参数**：
- `token`：验证令牌，可选

**返回**：
- 更新结果JSON

#### 清空缓存

```
POST /admin/api/cache/clear
```

清空系统缓存。

**参数**：
- `token`：验证令牌，可选

**返回**：
- 清空结果JSON

### 图片上传

```
POST /admin/api/upload
```

上传图片。

**参数**：
- `file`：图片文件（multipart/form-data）
- `directory`：目标目录，可选
- `token`：验证令牌，可选

**返回**：
- 上传结果JSON

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

#### 从Docker Hub直接运行（推荐）

```bash
docker run -d -p 13000:13000 -p 13001:13001 --name fur-img-api --restart unless-stopped binbim/fur-img-api:latest
```

#### 本地构建并运行

```bash
docker build -t fur-img-api:latest .
docker run -d -p 13000:13000 -p 13001:13001 --name fur-img-api --restart unless-stopped fur-img-api:latest
```

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

### v2.2.0
- 添加WebUI管理界面，支持以下功能：
  - 图片列表查看和管理
  - 图片上传功能
  - 图片删除功能
  - 目录管理
  - 图片搜索和筛选
  - 分页支持
  - 响应式设计
- 修复中文文件名上传乱码问题
- 优化图片扫描和列表更新逻辑
- 改进请求限流配置，调整默认参数
- 增强日志记录功能
- 优化错误处理

### v2.1.0
- 重构项目结构，采用模块化设计
- 支持Redis缓存和内存缓存
- 实现Node.js Cluster多线程架构
- 提供OpenAPI 3.0规范
- 支持中文路径
- 优化请求处理逻辑
- 增加健康检查和统计信息端点
- 实现请求限流

### v1.2
- Fur-Img-API原始版本

## 致谢

感谢所有为项目做出贡献的人！
