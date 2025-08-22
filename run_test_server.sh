#!/bin/bash
# 這個腳本會在背景啟動一個伺服器。

echo "正在背景啟動一個簡易的 HTTP 伺服器..."

if [ -f server.pid ]; then
    echo "伺服器似乎已在執行中。請先執行 ./stop_test_server.sh"
    exit 1
fi

# 在背景執行伺服器，並將其 Process ID (PID) 存檔
# 移除 &>/dev/null 來顯示所有輸出訊息
python3 -m http.server &
PID=$!
echo $PID > server.pid

echo ""
echo "伺服器已在背景啟動，PID 為 $PID。"
echo "您現在應該可以在終端機看到 'Serving HTTP on ...' 的訊息。"
echo "請根據該訊息中的埠號（port）在瀏覽器中開啟對應網址。"
echo "若要停止伺服器，請執行 ./stop_test_server.sh"
