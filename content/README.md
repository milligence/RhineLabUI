# 编辑 Archive 内容

`archives.json` 是界面、搜索与文本导出的共同数据源。初版保留五个分类、每类八份共 40 个占位档案，编号 `X-001` 至 `X-040` 保持稳定；修改数量需同时调整阵列和校验逻辑。

每条记录可填写：

- `title`、`en`：中英文标题。
- `category`、`department`：分类和归档单元。分类必须出现在 `categories` 和 `columns` 中。
- `date`、`lead`、`clearance`：编目范围、记录人和状态。
- `abstract`、`findings`：摘要和文字记录，`findings` 为非空文本数组。
- `source`：可选的 HTTP 或 HTTPS 来源链接；不使用时填空字符串。
- `image`：可选图片路径；不使用时填空字符串，界面显示默认占位图。

例如，将 `sample.jpg` 放在 `public/archive-images/`，在对应记录中填写 `"image": "archive-images/sample.jpg"`。支持 PNG、JPEG、WebP 和 SVG；图片会随正式构建和离线缓存一起发布。请使用你有权使用的素材。图片在阅读页可拖动或使用按钮旋转。

修改后执行 `npm run export:archives` 更新文本导出，再执行 `npm run check:content` 和 `npm run build` 验证。运行 `npm run dev` 和 `npm run build` 时也会自动更新导出。所有文字按纯文本处理，不支持 Markdown 或 HTML。
