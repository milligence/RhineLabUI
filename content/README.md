# 编辑 Archive 内容

## 故事档案与投影

`chapters` 可保存连续的故事正文：每章包含稳定 `id`、`title`、可选 `date`、`paragraphs` 文字数组。页面与 TXT 导出共用正文。以真实问题、尝试、结果与转向推进叙事；不补写未经记录的心理、对话或实验结论。

`projection.kind` 支持 `research` 和 `cube`。研究图的节点包含阶段、分支、证据性质、问题、尝试、结果、当时判断、事后复盘与来源；连线只能指向后续阶段。Cube 的每项构造包含实验状态、说明、复盘与来源。详细类型见 `src/projection-types.ts`。未收录复盘时保留空数组，界面如实标记。

少量真实档案可使用顶层 `"layout": "collection"`：支持一至十二个分类，每类一至20份档案；编号仍按 `X-001` 起连续排列。默认模板维持原有五列、四十份规则。

### 接入私有内容

界面代码可以保留在公开仓库，真实研究正文与复盘保留在自己的私有仓库。安装本项目依赖后运行：

```sh
npm run archive:private -- /absolute/path/to/private-repository/site/archives.json
```

命令先校验内容，再在被 Git 忽略的 `.private-build/` 内生成隔离检出与完整 `dist`；不会修改公开模板或它的 TXT 导出。加入 `--dev` 可在端口5178预览。私有构建包含研究全文，只交付到具有相应访问范围的位置。

`archives.json` 是界面、搜索与文本导出的共同数据源。初版保留五个分类、每类八份共 40 个占位档案，编号 `X-001` 至 `X-040` 保持稳定；修改数量需同时调整阵列和校验逻辑。

每条记录可填写：

- `title`、`en`：中英文标题。
- `category`、`department`：分类和归档单元。分类必须出现在 `categories` 和 `columns` 中。
- `date`、`lead`、`clearance`：编目范围、记录人和状态。
- `abstract`、`findings`：摘要和文字记录，`findings` 为非空文本数组。
- `source`：可选的 HTTP 或 HTTPS 来源链接；不使用时填空字符串。
- `image`：可选图片路径；不使用时填空字符串，界面省略图片区域。

例如，将 `sample.jpg` 放在 `public/archive-images/`，在对应记录中填写 `"image": "archive-images/sample.jpg"`。支持 PNG、JPEG、WebP 和 SVG；图片会随正式构建和离线缓存一起发布。图片保持静态阅读；可交互数据通过投影展示。

修改后执行 `npm run export:archives` 更新文本导出，再执行 `npm run check:content` 和 `npm run build` 验证。运行 `npm run dev` 和 `npm run build` 时也会自动更新导出。所有文字按纯文本处理，不支持 Markdown 或 HTML。
