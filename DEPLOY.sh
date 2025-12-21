#!/bin/bash

echo "=== Fur-Img-API_V2 一键部署脚本 ==="

# 设置变量
IMAGE_NAME="fur-img-api:latest"
CONTAINER_NAME="fur-img-api"
HTTP_PORT=13000
HTTPS_PORT=13001

# 停止并删除旧容器
echo "1. 停止并删除旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 构建新镜像
echo "2. 构建Docker镜像..."
docker build -t $IMAGE_NAME .

# 运行新容器
echo "3. 运行新容器..."
docker run -d \
  -p $HTTP_PORT:$HTTP_PORT \
  -p $HTTPS_PORT:$HTTPS_PORT \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  $IMAGE_NAME

# 显示结果
echo "4. 部署完成！"
echo "---------------------------------"
echo "服务访问地址："
echo "HTTP:  http://$(curl -s ifconfig.me):$HTTP_PORT"
echo "HTTPS: https://$(curl -s ifconfig.me):$HTTPS_PORT (如果启用SSL)"
echo "---------------------------------"
echo "容器状态："
docker ps -f name=$CONTAINER_NAME
echo "---------------------------------"
echo "查看日志命令：docker logs -f $CONTAINER_NAME"
echo "重启容器命令：docker restart $CONTAINER_NAME"