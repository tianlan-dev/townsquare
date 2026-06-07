# 钟楼谜团魔典

这是一个非官方的线上工具，用来辅助在语音软件中体验染·钟楼谜团。
这个工具可以帮助说书人和玩家有创建房间、记录进程、投票等，有更好的游戏体验。

## 运行

首次运行先安装依赖：

```bash
npm install
```

本地启动配置放在两个 Git 忽略的环境文件里：

- `.env.production.local`: production Docker 启动配置。
- `.env.development.local`: local development 启动配置。

两个文件都需要定义 `APP_HOST` 和 `APP_PORT`。

### Production in Docker

先创建本地 production 环境文件。这个文件会被 Git 忽略：

```bash
cat > .env.production.local <<'EOF'
APP_HOST=0.0.0.0
APP_PORT=<production-port>
EOF
```

然后用 Docker 构建并启动 production container：

```bash
./production-docker.sh
```

### Local Development

先创建本地 development 环境文件。这个文件会被 Git 忽略：

```bash
cat > .env.development.local <<'EOF'
APP_HOST=0.0.0.0
APP_PORT=<local-dev-port>
EOF
```

```bash
./development-server.sh
```

development 启动脚本会读取 `.env.development.local`，停止占用同一端口的旧进程，执行 `npm run build`，然后在后台启动本地服务端。具体监听地址和端口由本地环境文件提供。

本地服务端提供页面、静态资源、头像上传、房间 WebSocket 和大厅 WebSocket。

玩家上传的头像会保存到本机 `local-data/avatars`，该目录不会提交到仓库。`public/avatars` 只用于内置默认头像。

## Package scripts

```bash
npm run build
npm run start
npm run postbuild
```

- `npm run build`: 构建前端到 `dist/`。构建完成后 npm 会自动触发 `npm run postbuild`。
- `npm run postbuild`: `npm run build` 完成后由 npm 自动触发，执行 `generate-sitemap.js` 生成站点地图。不需要手动运行。
- `npm run start`: 启动 `server/local-server.js`。需要通过环境变量提供 `APP_PORT`，可选提供 `APP_HOST`。

## Startup scripts

- `./production-docker.sh [start|stop|restart]`: 读取 `.env.production.local`，构建 Docker image，并替换同名 production container。
- `./development-server.sh [start|stop|restart]`: 读取 `.env.development.local`，停止占用 development 端口的旧进程，执行 `npm run build`，然后在后台运行 `npm run start`。

脚本日志写入 `.server-logs/`，该目录不会提交到 Git。

## 特点

- 免费的城镇广场/魔典！
- 支持自定义JSON！可以上传本地 JSON 文件、从剪切板粘贴，或加载本地/互联网 JSON URL。
- 实时共享的魔典，可供玩家投票使用！
- 夜间行动顺序和提醒可以帮助说书人和玩家。
- 支持所有自定义原创角色和剧本。

### 自定义剧本支持

任何符合剧本格式的JSON剧本文件都被支持，可以上传完整JSON文件、从剪切板粘贴，或加载本地/互联网 JSON URL。URL 可以是当前服务的相对路径，例如 `/scripts/your-script.json`，也可以是允许浏览器跨域读取的 `https://...` 地址。如果你想继续自定义剧本，可以加入以下`"_meta"`对象对剧本整体做出调整。


```json
[
  {
    "id": "_meta",
    "name": "无上愉悦",
    "author": "作者",
    "logo": "/scripts/assets/your-logo.png",
    "firstNight": ["dusk","minioninfo","demoninfo","marionette","poisoner","amnesiac","dawn"],
    "otherNight": ["dusk","dawn"],
    "bootlegger": ["私货商人1", "私货商人2"]
  }
]
```

这些设置可以让剧本的主题更加明确，使用更方便。
- `"firstNight"`、`"otherNight`和`"bootlegger"`是剧本工具常用关键词。
- 包含`"firstNight"`会改写魔典内置角色的首夜行动顺序。
- 包含`"otherNight`会改写魔典内置角色的除首夜外其他夜的行动顺序。
- 其中`"dusk"`、`"dawn"`、`"minioninfo"`和`"demoninfo"`为魔典内置的关键词，请避免和角色`"id"`重复。
- `"firstNight"`和`"otherNight`必须正确包括所有当晚行动的角色才能正常生效，如需修改请在使用前核对夜间顺序表。

### 原创角色支持

自制的原创角色也可以被导入魔典，以下是一个完整的例子。

```json
[
  {
    "id": "balloonist",
    "firstNightReminder": "每个夜晚，唤醒气球驾驶员，并指向一名玩家（存活或死亡皆可），并将“得知”提示标记放置在对应的那名玩家的角色标记旁，以确保不会让气球驾驶员得知与上一晚同一角色类型的玩家。",
    "otherNightReminder": "每个夜晚，唤醒气球驾驶员，并指向一名玩家（存活或死亡皆可），并将“得知”提示标记放置在对应的那名玩家的角色标记旁，以确保不会让气球驾驶员得知与上一晚同一角色类型的玩家。",
    "reminders": ["得知"],
    "remindersGlobal": [],
    "setup": true,
    "name": "气球驾驶员",
    "team": "townsfolk",
    "ability": "每个夜晚，你会得知一名与上个夜晚得知的玩家角色类型不同的玩家。[+0~1外来者]",
    "firstNight": 72,
    "otherNight": 111
  },
  { 
    "id": "investigator" 
  },
  { 
    "id": "imp" 
  }
]
```

这段 JSON 定义包含了一个自定义角色“气球驾驶员”（Acrobat），以及两个基础游戏角色“调查员”（Investigator）和“小恶魔”（Imp）。
对于基础游戏角色，只需提供 ID 即可，这与你在剧本工具中获得的内容类似。

**必要属性：** `id`, `name`, `team`, `ability`

- **id**: 该角色的内部 ID，不含空格或特殊字符（仅英文和数字）。<br>
  _注意_：该 ID 必须是唯一的，不能与现有角色的 ID 重复，否则自定义角色将被现有角色覆盖！
- **image**: 角色标记图标的 PNG 链接（应具有透明背景！）。<br>
  _注意_：只有在“魔典”菜单中开启自定义图像后，这些图像才会显示！
- **edition**: 该角色的版本 ID。可以留空或填写 "custom"。
- **firstNight** / **otherNight**: 该角色在首夜 / 其他夜晚与其他角色相比的行动顺序。<br>
  _注意_：必须为正数或零，零表示“不在夜晚行动”。
- **firstNightReminder** / **otherNightReminder**: 首夜 / 其他夜晚的提示文本。
- **reminders**: 提示标记，如果没有，应为空数组 `[]`。
- **remindersGlobal**: 全局提示标记，无论该角色是否分配给玩家，这些标记始终可用。
- **setup**: 该标记是否影响设置（橙色叶子图标），例如“酒鬼”或“男爵”。
- **name**: 该角色的显示名称。
- **team**: 角色所属阵营，必须是以下之一：`townsfolk`（村民）、`outsider`（外来者）、`minion`（爪牙）、`demon`（恶魔）、`traveler`或`traveller`（旅行者）、 `fabled`（传奇角色）、`loric`（奇遇角色）。<br>
  _注意_：如果你创建了一个自定义的“传奇角色”（Fabled）或“奇遇角色”(Loric)，它将在加载自定义剧本时自动添加到游戏中。
- **ability**: 该角色的显示能力文本。
- **jinxes**: 自定义角色与其他角色的相克，会在角色技能表中出现，每个id代表跟一个角色的相克。具体如下：
```json
"jinxes":[{"id":"example1_id","reason":"相克1。", "id":"example2_id", "reason":"相克2。"}]
```

本项目及其网站免费提供，不以任何方式隶属于 The Pandemonium Institute。
