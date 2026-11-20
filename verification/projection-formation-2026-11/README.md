# 投影框内成像验收

日期：2026-11-21（Asia/Shanghai）

范围：保留完整演化树，精修进入与返回过场中的框内成像、取景和文字进入。未改动私人内容仓库、节点坐标、主线、档案阵列波浪、实体抽取路径或实体材质。

## 构建身份

- 基线提交：`ae0458c668d6a9ed0cc5803720b9428c564c4ae5`
- 最终审片源码摘要：`682d6490a064128b4ab544ca8caa38d3e33dfec6307f33f5b0371782dc79085b`
- 公开审片提交：`98a7cc9bffa60083e90e16117d535ba5d65d4ecf`
- [可播放审片](https://htmlpreview.github.io/?https://github.com/milligence/RhineLabUI/blob/98a7cc9bffa60083e90e16117d535ba5d65d4ecf/reference/projection-formation-review.bundle.html)
- 每份输入文件的 SHA-256、字体来源和成品摘要见 `manifest.json`。

审片使用正式 `ProjectionViewer`、`ResearchProjection`、`CarrierFlight`、CSS 和 Canvas 光学层。公开合成样本包含 36 节点、39 条关系、23 步主线与长正文。样本的人物、事件和具体连接不是私人档案内容；不能以相同节点数量推断两者布局相同。

## 浏览器画面与交互

在最终公开链接上执行，页面报告源码摘要与 manifest 一致。

| 检查 | 观察结果 | 证据 |
|---|---|---|
| 900 × 614，2850ms | 连线与节点局部形成，文字未进入 | `screenshots/formation-2850.jpg` |
| 900 × 614，4100ms | 结构已全部形成；DOM 保留 36 节点和 39 条关系；36 个节点文字的计算透明度全部为 0 | `screenshots/held-4100.jpg`、`held-evidence.json` |
| 900 × 614，5500ms | 少量名称先进入，其他名称随接近逐渐清晰；阅读栏尚未整块出现 | `screenshots/approach-5500.jpg` |
| 900 × 614，6800ms | 状态为 open；地图回到原 `x=100.4285714, y=126, scale=.1795918367`；主干线宽回到 `1.7px`，两个线宽倍率均为 1 | `screenshots/reading-6800.jpg`、`reading-evidence.json` |
| 1280 × 800，连续播放 | 最终到达 open / open，呈现时间约 6809ms | `playback-evidence.json` |
| 1280 × 800，返回途中重新接入 | 返回时保持长记录的滚动位置；接入后仍选中 T13，正文 scrollTop 为 732 | `return-evidence.json`、`reopen-evidence.json` |
| 390 × 780，暗色，4100ms | 延续原窄屏局部取景；结构可见、节点文字透明度为 0，页面错误输出为空 | 浏览器现场检查 |
| 390 × 780，减少动态 | 直接进入 open，阅读通道与线宽倍率为 1 | `reduced-evidence.json` |

浏览器的逐帧捕获较慢，连续播放使用生产代码的停顿限幅；上述 6809ms 是呈现时钟时间，不是墙钟耗时或帧率测量。全页截图调用曾超时，改用正常视口捕获完成检查。最终页面应用错误输出为空。

## 自动检查

| 命令 | 结果 | 主要覆盖 |
|---|---|---|
| `npm run check:projection` | 通过 | 324 次运动反向案例；实际场景方法的投影几何；28 次文字通道反向/接入案例；拓扑依赖、闭环、孤立节点、同列节点、确定性重采样；原阵列进入与 schema |
| `npm run check:projection-ui-state` | 通过 | 完整树与状态保留；文字独立通道；暂停内部回放与地图飞行；恢复目标；关闭期间滚动位置冻结；resize 后目标归属；原 Cube 状态 |
| `npm run check:carrier-optics` | 通过 | 光源与实体束场归属、可逆回退、缓存、主题、DPR 与清理 |
| `npm run check:optical` | 通过 | 正文导出与实验数据、Cube 旋转/计数边界 |
| `npm run build` | 通过 | TypeScript、Vite 及离线构建；保留现有大 chunk 提示 |
| `git diff --check` | 通过 | 补丁空白检查 |

完整输出位于 `checks/`。状态检查与几何检查不能替代 GPU 像素验收。

## 验收边界

本次浏览器审片隔离验证框内的正式 DOM/SVG/Canvas 成像与交互。标有“合成光源标定”的平面不是档案实体。没有据此宣称完整 ArchiveScene 的 WebGL 像素、真实实体遮挡、Cube WebGL 画面或用户设备帧率已经验收。

设计决定、动效时间与代码入口见 `docs/PROJECTION-FORMATION-2026-11-21.md`。
