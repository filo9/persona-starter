# Persona Starter 快速版

可分享的本地互动模拟工具。所有人自行提供聊天记录、人物身份、人格资料、长期记忆和 API Key。项目只附虚构示例，没有作者的聊天记录、人物资料、数据库或密钥。

## 启动

1. 安装 Python 3.10 或更新版本，不需要 pip 依赖。
2. 将 `.env.example` 复制为 `.env`，填写 `API_KEY`、`BASE_URL`、`MODEL`。模型名以你使用的服务商为准。
3. Windows 双击 `start.cmd`。或在项目目录执行 `python app.py`。
4. 打开 <http://127.0.0.1:8787>。保持启动窗口运行；Ctrl+C 停止。
5. 在“人物配置”填写双方 ID、名称、会话 ID、人格和关系。也可载入 `examples/profile.json` 体验虚构人物。
6. 在“聊天与证据”导入自己的标准化 JSON/JSONL。虚构测试记录在 `examples/messages.jsonl`。
7. 手工添加记忆，选择证据等级并填写证据消息 ID。
8. 对话时先预览，再确认发送。只把预览中显示的上下文发送至所配置的 API。

API Key 由 Python 从本地 `.env` 或环境变量读取，不传给网页。配置随请求重新读取，无需重启。程序只监听本机 127.0.0.1；不要通过反向代理公开此服务。

## 导入格式

接受 JSON 数组、`{"messages": [...]}` 或逐行 JSONL。不是任意 QQ 导出文件的自动适配器：请将已有导出映射到以下格式。

```json
{
  "message_id": "unique-id-1",
  "timestamp": "2026-01-01T10:00:00+08:00",
  "speaker_id": "your-target-id",
  "speaker_name": "对方显示名",
  "role": "target",
  "text": "消息正文",
  "message_type": "text",
  "reply_to_message_id": null,
  "quoted_text": null,
  "conversation_id": "your-conversation-id",
  "source": "my-export"
}
```

`user` 是使用者，`target` 是模拟对象。ID 和会话 ID 必须匹配人物配置。日期必须带时区。时间统一转为 UTC；正文不删除空白。`message_type`、`source`、`text` 可省略，其他核心字段必须提供。`import_batch`、`created_at` 由本次导入生成。message_id 由用户的数据源提供，不用“时间+文本”猜 ID。

去重使用会话 ID + 消息 ID。重复 ID 但正文、时间、角色或引用发生变化时，整批回滚。引用目标缺失会报告 unresolved_replies，不猜测补全。网页单文件上限 32 MB，可拆分增量导入。图片、表情和文件只保留类型与正文占位，不分析资源。原始未标准化字段不会存入快速版。

## 记忆和身份

六类记忆：Semantic / Episodic / Relationship / Behavior / Preference / Conversation。

证据等级：明确事实、高置信推断、低置信推测、用户提供。前三类必须引用已导入的消息；资料真实性仍由使用者核查，程序只校验引用存在。每条记忆保存置信度、时间范围、反证和阶段说明。reinforce/update/weaken/contradict/supersede 会保存新版本；移除是软删除，旧版本保留在 SQLite 的 memory_history 表。

人物配置是独立的身份锚点，优先于昵称、历史中的其他人物和角色扮演。模型仍可能出错，请核对。模拟对话保存于 chat 表，标记为 generated_content，不会自动写入消息证据库或长期记忆。

切换模拟对象使用独立目录：

```shell
python app.py --data-dir data/another-person --port 8788
```

## 上下文和思考模式

每次请求最多选取 6 条记忆、4 条相似 target 原话和最近 12 条模拟消息，加入人物、关系资料及当前输入。长原话会从上下文中省略，数据库不改动。请求总量上限为 24000 字符；它是字符预算，不是精确 token 预算。使用中文双字匹配检索，没有向量依赖。

DeepSeek URL 默认使用 `thinking.type=enabled`、`reasoning_effort=high`，可在 `.env` 关闭。其他 OpenAI 格式 Chat Completions 服务不附加这两个特定参数。模型返回的思考正文不显示、不保存。参数依据：[DeepSeek 官方说明](https://api-docs.deepseek.com/guides/thinking_mode/)。实际 API 调用需你的账户权限，快速版没有使用真实 Key 做付费验证。

网页显示的预览不含 Authorization/Key。发送前重新构造请求并对比 SHA-256；资料或输入变化必须重新预览。

## 当前边界

这是可运行的快速版，不包含自动人格提取、自动关系时间线、自动记忆演化、隐藏验证集、向量检索、QQ Bot 或 QQ .bak 解密。人格阶段信息和关系描述由使用者手工填写。SQLCipher/进程扫描不属于此发布包。

导入和管理只在本地进行；确认发送后，请求会含用户选择的资料和检索到的聊天片段，发给你配置的模型服务。不会上传完整聊天库。供模拟与资料整理使用，不代表真实人物本人或可靠的心理评估。

## 文件与分享

`app.py` 后端；`web/` 网页；`examples/` 虚构示例；`tests/` 合成数据测试；`start.cmd` Windows 启动；`.env.example` 配置模板。首次启动自动创建 `data/local.sqlite3`。

只分享原始发布 ZIP。实际使用后不要把整个文件夹重新压缩：`.env`、`data/`、日志及会话都含个人资料，`.gitignore` 不能替代 ZIP 排除规则。

运行验证：`python -m unittest discover -s tests -v`。
