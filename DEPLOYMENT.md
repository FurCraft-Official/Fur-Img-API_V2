# Fur-Img-API_V2 部署指南

## 项目概述

这是一个基于 Node.js 的高性能随机图片服务，支持多线程、Redis 缓存、CORS 支持和智能缓存管理。

## 环境要求

- Docker 20.04 或更高版本
- Docker Compose（可选）

## 部署方式

### 1. 直接使用 Docker 部署

#### 步骤 1：获取 Docker 镜像

```bash
# 方式 1：从 Docker Hub 拉取（推荐）
docker pull furcraft/fur-img-api:latest

# 方式 2：本地构建
git clone https://github.com/FurCraft/Fur-Img-API_V2.git
cd Fur-Img-API_V2
docker build -t fur-img-api:latest .
```

#### 步骤 2：运行 Docker 容器

**完整运行命令**（带目录挂载）：
```bash
docker run -d \
  -p 13000:13000 \
  -p 13001:13001 \
  -v /opt/fur-img-api/img:/app/img \
  -v /opt/fur-img-api/config:/app/config \
  -v /opt/fur-img-api/ssl:/app/ssl \
  --name fur-img-api \
  --restart unless-stopped \
  fur-img-api:latest
```

**简化运行命令**（不带目录挂载）：
```bash
docker run -d \
  -p 13000:13000 \
  -p 13001:13001 \
  --name fur-img-api \
  --restart unless-stopped \
  fur-img-api:latest
```

### 2. 使用 Docker Compose 部署

#### 步骤 1：创建 docker-compose.yml 文件

```yaml
version: '3.8'

services:
  fur-img-api:
    image: fur-img-api:latest
    container_name: fur-img-api
    ports:
      - "13000:13000"
      - "13001:13001"
    volumes:
      - ./img:/app/img
      - ./config:/app/config
      - ./ssl:/app/ssl
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

#### 步骤 2：运行 Docker Compose

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 3. Nginx 反向代理配置

#### 步骤 1：安装 Nginx

```bash
# Ubuntu/Debian
apt-get update && apt-get install -y nginx

# CentOS/RHEL
yum install -y nginx
```

#### 步骤 2：创建 Nginx 配置文件

**配置文件路径**：`/etc/nginx/conf.d/fur-img-api.conf`

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 重定向到 HTTPS（可选）
    # return 301 https://$server_name$request_uri;
    
    location / {
        proxy_pass http://127.0.0.1:13000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 增加超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态文件缓存设置
    location ~* \.(jpg|jpeg|png|gif|webp|bmp|svg)$ {
        proxy_pass http://127.0.0.1:13000;
        proxy_cache_valid 200 30d;
        proxy_cache_bypass $http_pragma;
        proxy_cache_revalidate on;
    }
}

# HTTPS 配置（如果启用 SSL）
# server {
#     listen 443 ssl;
#     server_name your-domain.com;
#     
#     ssl_certificate /path/to/ssl/fullchain.pem;
#     ssl_certificate_key /path/to/ssl/privkey.pem;
#     
#     location / {
#         proxy_pass http://127.0.0.1:13000;
#         # 其他 proxy 设置...
#     }
# }
```

#### 步骤 3：测试并重启 Nginx

```bash
# 测试 Nginx 配置
nginx -t

# 重启 Nginx
systemctl restart nginx
```

## 配置说明

### 主要配置文件

配置文件路径：`config/config.json`

**核心配置项**：

```json
{
  "server": {
    "http_port": 13000,         # HTTP 端口
    "https_port": 13001,        # HTTPS 端口
    "ssl": {
      "enabled": false          # 是否启用 SSL
    },
    "workers": 4                 # 工作线程数量
  },
  "cache": {
    "enabled": true             # 是否启用缓存
  }
}
```

### 图片目录结构

```
img/
├── category1/
│   ├── image1.jpg
│   └── image2.png
└── category2/
    ├── image3.gif
    └── image4.webp
```

## 访问服务

### 基本访问地址

- HTTP: `http://your-server-ip:13000`
- HTTPS: `https://your-server-ip:13001`（如果启用 SSL）

### 主要 API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api` | GET | 获取随机图片 |
| `/api/{category}` | GET | 从指定分类获取随机图片 |
| `/api/{category}/{filename}` | GET | 获取特定图片 |
| `/list.json` | GET | 获取所有图片列表 |
| `/stats` | GET | 获取统计信息 |
| `/health` | GET | 健康检查 |
| `/cache/status` | GET | 缓存状态 |

## 常用命令

### Docker 容器管理

```bash
# 查看容器状态
docker ps

# 查看容器日志
docker logs -f fur-img-api

# 进入容器
docker exec -it fur-img-api sh

# 重启容器
docker restart fur-img-api

# 停止并删除容器
docker stop fur-img-api && docker rm fur-img-api
```

### 应用管理

```bash
# 手动更新图片列表
docker exec -it fur-img-api npm run init

# 查看应用状态
curl http://localhost:13000/health

# 查看统计信息
curl http://localhost:13000/stats
```

## 常见问题

### 1. 无法访问服务

**排查步骤**：
- 检查容器是否正在运行：`docker ps`
- 检查端口映射是否正确：`docker port fur-img-api`
- 检查防火墙是否开放端口：`ufw status`（Ubuntu）或 `firewall-cmd --list-ports`（CentOS）
- 检查 Nginx 配置是否正确：`nginx -t`

### 2. 502 Bad Gateway 错误

**可能原因**：
- Nginx 无法连接到后端服务
- 后端服务没有正常运行
- 端口映射配置错误

**解决方案**：
- 检查后端服务是否正在运行：`curl http://localhost:13000/health`
- 检查 Nginx 反向代理配置是否指向正确的端口（13000）
- 重启后端服务：`docker restart fur-img-api`

### 3. Redis 连接错误

**可能原因**：
- Redis 服务未运行
- Redis 配置错误

**解决方案**：
- 默认情况下，应用不使用 Redis，会自动使用内存缓存
- 如果需要使用 Redis，请确保 Redis 服务正在运行，并且配置正确

### 4. 图片无法加载

**可能原因**：
- 图片目录权限问题
- 图片文件格式不支持
- 图片路径配置错误

**解决方案**：
- 检查图片目录权限：`docker exec -it fur-img-api ls -la /app/img`
- 确保图片格式为支持的格式（jpg, jpeg, png, gif, webp, bmp, svg）
- 检查配置文件中的图片路径：`config/config.json` 中的 `paths.images`

## 维护指南

### 1. 定期更新镜像

```bash
# 拉取最新镜像
docker pull fur-img-api:latest

# 重启容器
docker stop fur-img-api && docker rm fur-img-api
docker run -d -p 13000:13000 -p 13001:13001 --name fur-img-api fur-img-api:latest
```

### 2. 备份数据

```bash
# 备份图片目录
tar -czvf fur-img-api-backup.tar.gz /opt/fur-img-api/img

# 备份配置文件
cp /opt/fur-img-api/config/config.json /opt/fur-img-api/config/config.json.backup
```

### 3. 监控服务

**使用 Prometheus + Grafana**（可选）：
- 安装 Prometheus 和 Grafana
- 配置 Prometheus 监控 Nginx 和 Node.js 应用
- 创建 Grafana 仪表板监控服务状态

## 安全建议

1. **定期更新依赖**：定期更新 Node.js 依赖，修复安全漏洞
2. **使用 HTTPS**：配置 SSL 证书，启用 HTTPS
3. **设置合理的限流**：在 `config/config.json` 中配置 `rate_limit` 选项
4. **保护敏感端点**：对 `/update`、`/cache/clear` 等端点设置 token 验证
5. **使用非 root 用户运行容器**：容器内部已使用非 root 用户 `nodeuser`
6. **限制容器资源**：在 Docker 运行命令中添加 `--memory` 和 `--cpus` 选项限制资源使用

## 联系方式

如果您在使用过程中遇到问题，欢迎通过以下方式联系：

- GitHub Issues: [https://github.com/FurCraft/Fur-Img-API_V2/issues](https://github.com/FurCraft/Fur-Img-API_V2/issues)
- Email: admin@furcraft.top

## 许可证

GPL-3.0 License
