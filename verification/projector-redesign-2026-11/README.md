# 投影演出重构：2026-11 公开审片记录

本轮重构档案抽出后的投影演出，已完成公开样本上的生产 DOM / Canvas 实际审片、返回与重新接入观察、功能检查和公开／私有隔离构建。**完整 ArchiveScene 的实时材质、原 GLB 遮挡、GPU / Cube 像素及浏览器帧率仍未验收。**当前浏览器的 `GL_VENDOR` / `GL_RENDERER` 为 `Disabled`，完整场景预览实际打开后报告 `Error creating WebGL context`；本记录保留这一结果，不以标定页或离线图替代。[证据范围与状态](review.json)

## 版本与公开入口

| 项目 | 身份 |
| --- | --- |
| 实现提交 | `2816c09aa292069589d09a24de9b487120dfc057` |
| 实现父提交 | `2a68fb4137e52b0f836f7e6b726186b647c875bb` |
| 最终预览提交 | `f621f5724732f5c33aeaf39a1be37c86dafa0535` |
| 预览分支 | `review/projector-redesign-final-2026-11-20` |
| 生产 DOM / Canvas 审片 sourceDigest | `ef49b0aeb81ddd0ef88740c64687a256edb32a9f494442f8fef2f8ad7454555c` |
| 完整 ArchiveScene bundle sourceDigest | `802f8271ca46fc38d7dd9c684c4860aad4813e4450c3b17f77edbb70708c85f8` |

- [固定提交的光学审片页](https://htmlpreview.github.io/?https://github.com/milligence/RhineLabUI/blob/f621f5724732f5c33aeaf39a1be37c86dafa0535/reference/projector-redesign-review.bundle.html)：生产 `ProjectionViewer`、`CarrierFlight`、`CarrierOptics` 和真实研究图组件；光源是明确标注的合成标定板，不是原始档案 GLB。最终 URL 已实际打开，完整 sourceDigest 匹配；3200ms 为 `image-held`、`clarity=1`、`mask=none`。[发布页截图](screenshots/projector-final-published-held.jpg) · [发布页状态](screenshots/projector-final-published-state.json)
- [固定提交的完整场景页](https://htmlpreview.github.io/?https://github.com/milligence/RhineLabUI/blob/f621f5724732f5c33aeaf39a1be37c86dafa0535/reference/projector-full-scene-review.bundle.html)：包含实际 `ArchiveScene`、原公开 GLB 与生产投影入口，最终 URL 也已打开；本环境停在 WebGL context 创建失败。[失败现场](screenshots/projector-final-webgl-unavailable.jpg)

公开包只使用合成档案样本：36 个节点、39 条连接、23 个主线步骤。节点名、日期和叙述不构成真实研究历史的验收。本轮验收记录投影演出，私有既有内容输入哈希保持不变。[光学构建清单](preview/optical-manifest.json) · [完整场景构建清单](preview/full-scene-manifest.json)

## 用户反馈对应的三个因果问题

| 原问题 | 本轮设计与实现 | 需要观察的关系 |
| --- | --- | --- |
| 光源朦胧，没有明确的投影框概念 | 在载体右上角安装矩形玻璃口；以实际四角展开四棱体积，再建立四边闭合的薄片 | 发射口、光束与接收框在同一画面里具有可追溯的几何关系 |
| 画面突然出现，生成过程不成立 | 标题与主体成为同一投影平面；确定性遮罩作用于真实 DOM，身份先显现、主图随后形成；删除依赖镜头靠近才开放文字的 gate | 镜头推进前已经有可识别的标题和信息，推进只改变观察距离 |
| 抽出后的镜头割裂 | 相机、源口与 DOM 使用同一已呈现状态；固定入口空间基准，保留有限的入口惯性接续和中途反向连续性 | 镜头持续接近刚才已经形成的同一张画面，不再通过第二次整页淡入完成交接 |

原档案只竖直抽取，构图由摄像机承担；原 GLB 没有被替换。矩形口复用原资产的闭合倒角基板，包含框体、暗腔、玻璃和内部发光面。代码采样返回真实口径四角及载体轮廓；光束可受载体轮廓遮挡。实体安装比例已有离线参考，实际 Three.js 材质与遮挡尚待可用 WebGL 环境验证。[设计定稿](../../docs/PROJECTION-DIRECTION-2026-11-20.md) · [实体口参考说明](port/offline-notes.md)

## 演出顺序

**以下时间从档案抽取取得净空后开始，入口全长 6100ms；不包含此前的阵列选档和实体抽出过程。**返回时长为 2400ms，中途返回／重新接入沿当前状态接续。

| 时段 | 动作与用途 |
| --- | --- |
| 0–400ms | 承接抽出姿态，实体玻璃口内部积蓄光；外壳和暗腔已存在 |
| 400–1100ms | 整个矩形口径向接收面展开，光束先抵达，再开始写框 |
| 1100–1750ms | 近角出发的两路边缘沿真实周长闭合，四边共同界定接收面 |
| 1800–3000ms | 真实信息逐次生成；身份带在约 2050–2150ms 先建立，主体随后形成 |
| 3000–3650ms | 发射口、光束、闭合框与已形成的信息共同呈现；镜头保持低速连续漂移 |
| 3650–6100ms | 同一镜头归正并接近阅读；光束先减弱，玻璃微小外沿移至画幅外，工具最后进入 |
| 最后约 500ms | DOM 达到最终位置，瞬态遮罩与光效清除，进入稳定阅读 |

光源、光束、薄片、框边和内容使用独立通道。光束退出不能清除仍需存在的框边。薄片中心保持接近透明；清晰度来自有限厚度的边缘、单侧反射和暖灰吸收，不通过整面白幕制造存在感。框的光学外沿比最终 DOM 四边各外扩 4px，并沿同一平面投影，因此最后可被视口裁出，真实内容尺寸不变。

## 三轮具体修订

**第一轮：重新建立对象。**增加四角口径、有限四棱体积和从近角闭合的完整矩形框；标题与主体纳入同一平面，取消相机驱动的文字隐藏。实际浅色标定图显示，框已能识别，但上侧光束几何仍弱，源口面填充过亮，标题在悬停尺度过小。

**第二轮：校准可见的投射关系。**只在体积两条纵向外侧面加入窄反射内唇与暖灰吸收肩；上侧负责主要方向，下侧较轻。降低源口整面填充，缩窄局部热亮；扩大标题的阅读尺度。没有提高整片雾的强度。后续 2150ms 实际截图又暴露出闭合框内仍空白：旧曝光阈值尚未走到标题位置。

**第三轮：让身份先形成，并完成边缘交接。**降低上方身份带的曝光阈值，主体继续经过同一连续前沿；光束抵达时点统一为 1100ms；框边保留至最后接近视口，并增加 4px 光学外沿。真实 mask 采样中，标题区域平均曝光在 2050 / 2100 / 2150ms 分别为 8.1% / 91.6% / 100%，同一时刻主体区域仍为 0；主体在 2400 / 2500 / 2600ms 为 26.0% / 65.9% / 98.8%。这些是局部遮罩值，不是浏览器帧率或整场景成像质量指标。

## 本版实际观察

以下截图来自生产 DOM / Canvas 与合成光源标定页。控件和标定文字保留在画面中，便于辨认观察环境；它们不是产品正式界面。

| 场景 | 时间与视口 | 已观察内容 | 证据 |
| --- | --- | --- | --- |
| 浅色身份生成 | 2150ms，1320×726 | 标题已经出现，主体尚未完整生成；光束与闭合框可同时辨认 | [身份帧](screenshots/projector-final-identity.jpg) |
| 浅色悬停 | 3200ms，1320×726 | 标题、主图、源口和闭合框共同存在；状态为完整成像 | [悬停帧](screenshots/projector-final-held-light.jpg) · [状态](screenshots/projector-final-held-light-state.json) |
| 浅色接近 | 4750ms / 5800ms，1320×726 | 同一标题和主图随平面扩大；后段外沿接近视口边缘 | [推进帧](screenshots/projector-final-approach.jpg) · [末段帧](screenshots/projector-final-late-approach.jpg) |
| 暗色悬停 | 3200ms，1320×726 | 检查暗背景下的光束侧面、完整边框与已形成信息 | [暗色帧](screenshots/projector-final-held-dark.jpg) |
| 暗色连续播放 | 约 1667 → 2190 → 3083ms | 连续播放过程中分别观察写框、身份生成和悬停 | [a](screenshots/projector-final-playback-a.jpg) · [b](screenshots/projector-final-playback-b.jpg) · [c](screenshots/projector-final-playback-c.jpg) |
| 播放中返回／重新接入 | 约 3806 → 4112ms | 进入 returning 后重新接入；已形成内容仍为 `contentResolve=1`，没有重建空白起点 | [返回状态](screenshots/projector-final-return-state.json) · [重新接入帧](screenshots/projector-final-reentry.jpg) · [重新接入状态](screenshots/projector-final-reentry-state.json) |
| 浅色竖屏 | 3200ms / 6100ms，390×780 | 观察上下空间安排与最终阅读；阅读终态为 `open`、`clarity=1`、`mask=none` | [悬停](screenshots/projector-final-portrait-held.jpg) · [阅读](screenshots/projector-final-portrait-reading.jpg) · [阅读状态](screenshots/projector-final-portrait-reading-state.json) |
| 减少动态的 Cube | 390×780 | 直接到达 open；此项只核查 DOM 与状态，不验收 Cube WebGL 像素 | [进入状态](screenshots/projector-final-reduced-cube-state.json) |
| 减少动态后返回 | 390×780 | 真实 DOM 读数为 `hidden=true`、`canvasCount=0`、`mask='none'` | [直接 DOM 观察](screenshots/direct-dom-observation.json) · [关闭状态](screenshots/projector-final-reduced-closed-state.json) |

关闭后的 flight 调试快照仍保留上一呈现帧，`opticalMask` 字段不能代替当前 DOM；关闭清理结论只依据上表的直接 DOM 读数。没有记录到的 `inert` 或其它字段不在本次结论中。

## 性能复核

新镜头的低速漂移使光束纹理不能长期复用。因此对真实 `CarrierOptics.render` 做 CPU 复核，优化了颜色查表、行坐标复用、保守扫描行剔除与完整内部像素的快速路径。前后使用冻结的同一组几何，材质参数与光场分辨率不变。[完整方法、源码哈希和结果](optics-performance.json)

| 视口 | 重建帧平均线程 CPU：慢版 → 快版 | 快版 p95 | 快版峰值 | 全段快版平均 |
| --- | --- | --- | --- | --- |
| 1320×726 | 9.84 → 3.86ms | 7.99ms | 23.80ms | 2.70ms |
| 1440×900 | 12.09 → 4.47ms | 8.00ms | 12.27ms | 3.04ms |

每个视口测量 366 帧，其中 248 帧发生光束重建；各 336 个有效光束缓冲区逐字节比较，差异为 0。计时包含生产计算、fixture 断言与缓冲复制，不包含真实 Canvas 光栅化、PNG 编码、DOM 合成、浏览器 RPC 或 GPU。它说明 CPU 热点已减少，**不能换算为浏览器帧率验收**。等价比较覆盖光束缓冲区，不把之后有意修改的身份曝光／4px 外沿说成未变化。

## 实体投影口的离线参考

`port/` 保存原 GLB 与最终运行时几何的 Blender 4.3.2 / Cycles 参考图。第一轮复用原外盖的带孔几何，观察到螺丝孔／凹口和过厚边框；第二轮改用同一原 GLB 中无孔的 `Optical_Diffuser` 闭合倒角基板，并收细边框和前沿。最终导出的运行时几何与参考渲染输入哈希一致。[输入、脚本与图片清单](port/manifest.json) · [两轮观察记录](port/offline-notes.md)

- [关灯近景](port/port-v2-off-oblique.png)：安装边、玻璃厚度和暗腔。
- [点亮近景](port/port-v2-on-oblique.png)：玻璃后的内部光芯与留白。
- [整卡比例](port/card-v2-on-proportion.png)：右上口径与原标签、内部结构的尺度关系。

公开副本 `export_runtime.mjs`、`render_reference.py`、`geometry.json` 保持原字节与 SHA。复现时将这三个文件复制回仓库的 `.tools/projector-port-reference/`，用 Node 运行导出脚本，再用 Blender 4.3.2 运行渲染脚本。原 manifest 保留当时的 `.tools` 路径，不作追改。离线灯光、Cycles 折射／阴影和 AgX 与 Three.js 实时管线不同，也没有阵列、解密着色器、DOM、光锥和完整镜头；这些图片只证明静态几何参考范围内的观察。

## 功能检查、构建与保留的历史

冻结源码后，`npm run check:projection`、`npm run check:carrier-optics`、公开 `npm run build` 及私有隔离构建全部通过。检查记录的前后 sourceDigest 一致。[检查汇总](checks/checks-summary.json)

| 构建 | 结果 |
| --- | --- |
| 公开发行 | `c0aaf775a99d57fd` |
| 私有隔离发行 | `684e9e7b8524ed5e` |
| 私有既有内容输入 SHA256 | `72bf1ed12ab6555e63be9523ed1b746e4f42bf24a7ef6bcf899ecd99a434589b`，前后不变 |

公开证据只记录私有构建状态与密码学身份，不包含私有正文或原始私有构建输出。此次构建通过也不等同于真实历史叙事已经重写。[私有构建概要](checks/private-build-summary.log)

两次早期 gate 失败日志仍在：一次旧断言仍按 1400ms 光束抵达采样，一次把浮点 `0.9999999999999993` 与 `1` 作严格比较。最终调整为符合 1100ms 设计的采样及既有容差；没有为通过测试改回生产时序。原日志、原因与最终通过日志均保留在 `checks/`。

更早的 [投影演出记录](../projection-cinematic-2026-11/README.md)、[投影 UI 记录](../projection-ui-2026-11/README.md) 和 [完整流程记录](../strict-flow-2026-11/README.md) 继续保留。本包追加当前证据，不覆盖此前判断。

尚待可用 WebGL 环境完成的项目：实际档案 GLB 与投影口的实时材质和遮挡、从阵列抽出到镜头接管的完整 ArchiveScene 演出、Cube 三维像素、真实 GPU 开销及浏览器帧率。公开预览已打开这一事实，与这些尚未完成的验收分别记录于 `review.json`。
