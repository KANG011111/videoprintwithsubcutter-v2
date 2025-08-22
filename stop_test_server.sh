#!/bin/bash
# 這個腳本會讀取 server.pid 檔案並停止對應的伺服器進程。

echo "正在停止本地測試伺服器..."

if [ -f server.pid ]; then
    PID=$(cat server.pid)
    # 使用 kill 指令來停止進程
    kill $PID
    # 移除 pid 檔案
    rm server.pid
    echo "伺服器 (PID: $PID) 已停止。"
else
    echo "找不到 server.pid 檔案，無法確定要停止哪個伺服器。"
    echo "您也可以嘗試手動尋找並停止 python http.server 進程。"
fi
