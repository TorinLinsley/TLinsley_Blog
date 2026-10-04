"""读取 data/*.ts 里「控制台自动生成」的那几个数组（albums / projects / friends）。

为什么需要它：
    这些 `data/*.ts` 是**构建时打进前端 bundle** 的。后端把新数据写进文件之后，
    已经在跑的页面加载的仍然是旧 bundle —— 表现就是那个很迷惑的 bug：
    「照片墙加了个相册 → 点【更新本地】（后端写盘成功）→ 页面自动刷新后，新相册没了」。

    所以这里提供读取接口，让页面启动时**按请求问后端要真实数据**，
    而不是相信编译进 bundle 的那份快照。文件永远是唯一真相。

用法：
    from .data_ts import read_ts_array
    albums = read_ts_array(ALBUMS_TS_PATH, "albums")
"""

import json
import os
import re
from typing import List


def read_ts_array(path: str, export_name: str) -> List[dict]:
    """从 `export const <名字>[: 类型] = [ ... ];` 里把数组抠出来。

    读不到 / 格式不对 / 不是数组 → 一律返回空列表（调用方自己决定要不要兜底）。
    """
    if not os.path.isfile(path):
        return []

    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return []

    pattern = re.compile(
        r"export\s+const\s+" + re.escape(export_name) + r"\s*(?::[^=]*)?=\s*(\[[\s\S]*\])\s*;?"
    )
    match = pattern.search(text)
    if not match:
        return []

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    return data if isinstance(data, list) else []
