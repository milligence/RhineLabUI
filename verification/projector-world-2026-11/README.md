# 实体投影、成像与连续镜头：本轮验证

日期：2026-11-20（Asia/Shanghai）。本轮承接用户对源口、投影边界、模糊成像及镜头割裂的反馈，先建立分镜，再修正空间、材料和内容形成。设计约束见 [空间与分镜稿](../../docs/PROJECTION-WORLD-STAGING-2026-11-20.md)。

**当前证据覆盖生产研究组件的 DOM／Canvas 审片、生产公式与状态检查、独立原生 EGL 着色器和光束像素诊断。完整 ArchiveScene 与 Cube 的浏览器 WebGL 画面尚未验收。** 实现提交为 [`b33b5ec`](https://github.com/milligence/RhineLabUI/commit/b33b5ec2659ea26942a15f56f2261e5b21577ba0)，固定预览提交为 `5cc7bfd`。源码、构建与观察身份见 [结构化记录](review.json)。

## 演出与实现

计时从实体口径可见、朝向正确且原详情镜头稳定之后开始。原档案只沿原轨道竖直抽取，背景阵列、基础材料与原景深不变。

| 时间 | 主要动作 | 镜头 |
| --- | --- | --- |
| 0–550 ms | 玻璃口内部蓄光 | 保持构图 |
| 550–1350 ms | 四面透明光束向接收位置延伸 | 保持源口与终点关系 |
| 1350–1850 ms | 有限矩形从接光角沿两路闭合 | 保持 |
| 1900–3600 ms | 实际研究边、节点、名称逐步形成；Cube 轮廓先于表面 | 保持 |
| 3600–4200 ms | 源口、光路、边框与可读内容共同停留 | 保持 |
| 4200–6800 ms | 同一图像放大、归正，进入完整阅读 | 一次 C2 推进 |

接收面依据真实 GLB 口径的四角和法向解算，并保持在出光方向前方。光束由四个侧面构成，不添加覆盖正文的接收端盖，不按整张档案的二维轮廓挖空。启用景深时，光束在 Bokeh 后、SMAA 与 Output 前绘制，采样当帧已有打包深度保持遮挡；关闭景深时沿用硬件深度。

形成过程直接作用于实际内容。研究边按路径弧长伸展，节点核心先于名称；Cube 轮廓、陶瓷表面与阴影使用一致的形成状态。删除整页逐帧 PNG 遮罩，成像使用独立线性时钟和单次局部缓动。返回及中途接续沿相同状态场反向运行。

## 实际审片推动的修正

这些截图使用真实 `ProjectionViewer`、`CarrierFlight`、`ResearchProjection` 与 `CarrierOptics`，内容为公开合成样本。左侧／上方标注的光源是二维标定平面，截图里的标定光束不能作为实体口径或最终世界光束材料的验收画面。每张图均保留原始字节，哈希在 [review.json](review.json) 中。

| 发现 | 失败对照 | 修正后的观察 |
| --- | --- | --- |
| R1 悬停时，完整界面缩成微型页面，阅读重点不足 | [3850 ms](screenshots/held-3850-r1.jpg) | [R5 同阶段](screenshots/held-3850-final.jpg)：阶段、少量行为与结果锚点、选中标题获得明确层级，图坐标保持原位 |
| R2 接近时，放大且半透明的普通名称叠成灰字层 | [5550 ms](screenshots/approach-5550-r2.jpg) | [R5 同时刻](screenshots/approach-5550-final.jpg)：普通名称仍隐藏；到 [6200 ms](screenshots/approach-6200-final.jpg) 以原生字号清晰揭开 |
| R2 手机悬停沿用全图锚点，画面右边只剩“第二…” | [390 × 780](screenshots/portrait-held-r2.jpg) | [R5 同视口](screenshots/portrait-held-final.jpg)：按实际文字边界选出完整的“保留疑问”“边界试验”，选中标题留在下方 |
| R5 手机阅读标题末行孤“案” | [CSS 修正前](screenshots/portrait-reading-final.jpg) | [最终 CSS 复看](screenshots/resumed-caption-390.jpg)：标题均衡成两行，读取动作保留自然宽度 |

最终 CSS 的手机阅读截图已由恢复后的浏览器实际复看，来源摘要为 `e8d9c2c05894`。此前原名含 `-final` 的截图均属于 R5、摘要为 `87a337ae8a52`，它们早于最后的标题均衡换行补丁；保留原名以维持证据对应，不能把它们误称为最终发布包截图。

### 其他关键帧

| 观察范围 | 截图 | 状态报告 |
| --- | --- | --- |
| 2600 ms：真实结构正在形成 | [形成](screenshots/formation-2600-final.jpg) | [JSON](screenshots/formation-2600-final.json) |
| 3850 ms：有限画幅与内容共同停留 | [悬停](screenshots/held-3850-final.jpg) | [JSON](screenshots/held-3850-final.json) |
| 6800 ms：桌面完整阅读 | [阅读](screenshots/reading-6800-final.jpg) | [JSON](screenshots/reading-6800-final.json) |
| 3850 ms：深色标定画面 | [深色](screenshots/dark-held-final.jpg) | [JSON](screenshots/dark-held-final.json) |
| 390 × 780：最终标题换行 | [手机阅读](screenshots/resumed-caption-390.jpg) | [JSON](screenshots/resumed-caption-390.json) |

还保留了 0.25 倍速下，光束抵达至边框初始形成的一组短连续观察：[首张](screenshots/continuous-0.jpg)、[末张](screenshots/continuous-4.jpg)、[五次状态采样](screenshots/continuous-final.json)。截图和报告先后采样，不保证同一原子帧；这组材料只支持所观察的短区间，不能外推为整段连续镜头或帧率验收。

R1 的 JSON 早于首次布局 RAF，出现 `x=0、y=0、scale=1`。保留该原始记录用于追溯，但不使用其中图布局坐标作数值结论；后续初始适配同步及报告时序已修正。

### 恢复后补完的交互观察

[返回中的画面](screenshots/resumed-closing.jpg) 与 [状态报告](screenshots/resumed-closing.json) 显示实际 `closing / returning`、进度约 0.708；同一轨迹保留了从 0.816 阶段发起返回的记录。[重新接入画面](screenshots/resumed-reentry.jpg) 与 [状态报告](screenshots/resumed-reentry.json) 显示 `reopen / opening`、进度约 0.473 及正向速度，选中节点仍是 T13，轨迹未被重新初始化。点击后立即读取的旧 RAF 报告没有用于证明返回发生。截图与报告按顺序采样，不能用作逐像素同步或帧率证据。

[减少动态开启状态](screenshots/resumed-reduced-open.json) 记录 `reduced=true`、`phase=open`，形成与显示比例均为 1。[关闭后的 DOM](screenshots/resumed-reduced-closed.json) 确认外壳已隐藏、光学画布数量为 0、实际内联遮罩为 `none`。该记录里残留的诊断 phase／beat／mask 字段不用于清理结论。

## 几何、状态与入口验证

[最终检查清单](checks/final-verification.json) 对应 TypeScript、投影与入口、光学层、组件状态、Cube、光束、后处理管线和 diff 检查。最终 caption CSS 后的补验与原核心检查分别记录，避免把不同源码身份合并成一次测试。

[空间与返回数值](checks/carrier-flight.json) 覆盖 22 个生产 Scene 阶段、324 组反向接续和 25 个缩放舞台组合；使用实际 GLB 口径，最小正向净空为 0.9 世界单位。这些数据检验计算与状态，不代表渲染质量。

[入口等待分析](checks/ENTRY-READINESS.md) 直接运行原生交互方程，解释默认阵列入口约 3.1–3.4 秒的收束时间以及旋转读取入口的准备过程。它是数值模型，不是浏览器延迟或设备性能测量。旧门槛在口径位于画外时过早接管、旧接收面光线穿回盖板等反例均保留在相应记录中。

## 独立 EGL 编译与像素诊断

[着色器说明及复现脚本](shaders/README.md) 包含真正通过本机 EGL／GLES 编译链接的六个程序：光束 composer 与 direct 路径、Cube 陶瓷、Cube 轮廓、形成阴影深度、Three OutputShader。[Pass 3 编译结果](shaders/pass3-compile-report.json) 保留空错误日志及源哈希。

生产光束几何和着色器在 RGBA16F 中进行实际混合，再经过 Three ACES／sRGB 输出。原始浅色结果几乎不可辨，而深色过亮；Pass 3 分离窄反射唇与轻吸收肩，并保持 DPR 1／2 的显示空间宽度。浅色射线中段约为 7–18/255 的亮度差，深色最大增亮约为 60/255。组件测量不能保证完整场景中的最终对比。

| 诊断 | 浅色 | 深色 | 截面／像素数据 |
| --- | --- | --- | --- |
| 原始失败基线 | [浅色](shaders/beam-current-light.png) | [深色](shaders/beam-current-dark.png) | [截面](shaders/beam-current-profiles.png) |
| Pass 3 | [浅色](shaders/beam-pass3-light.png) | [深色](shaders/beam-pass3-dark.png) | [数据](shaders/beam-pass3-pixels.json) |
| Pass 3，DPR 2 | [浅色](shaders/beam-pass3-dpr2-light.png) | [深色](shaders/beam-pass3-dpr2-dark.png) | [数据](shaders/beam-pass3-dpr2-pixels.json) |

实际执行的打包深度分支同时验证了前景遮挡完全剔除光束像素，远景区域逐像素保持原光束。以上 PNG 没有档案网格、AO／DOF／SMAA、DOM 或连续场景演出，不能冒充完整 ArchiveScene 截图。

## 发布、恢复与未验收范围

[构建收据](checks/build-receipts.json) 已核对公开构建 `18342937bf84e279` 和本次恢复后执行的私有隔离构建 `426a40604da6f252`。203 个复制到私有隔离目录的生产源文件逐一一致，公开输入和私有档案字节均未变化。公开构建是中断前成功的产物，恢复后重新计算了其完整资源身份；私有构建在恢复后执行。这些结论不扩展为私有内容视觉验收。

此前环境断开时，最终代码尚未推送；当时已将准确中断状态保存至 [恢复检查点](https://github.com/milligence/RhineLabUI/blob/8807384f74a1ee2622b50d9e700308aa52cccbe6/verification/projector-world-2026-11/RECOVERY-CHECKPOINT.md)。本次工作区已恢复，原有修改、构建与截图均在；实现、固定预览、补充审片和构建身份已经完成归档。该历史文档只描述中断时刻，不能代替当前发布记录。

当前 Cloud Chromium 返回 `GL_VENDOR=Disabled`、`GL_RENDERER=Disabled` 和 `Error creating WebGL context`。原生 Chromium 的尝试分别遇到证书警告和组织阻止的本地文件访问；没有绕过浏览器警告或组织策略。完整场景预览已尝试打开，但真实档案、最终合成光束、Cube 像素与整段镜头仍缺少浏览器实景验收。

本目录不声明私有内容视觉验收、真实触摸设备通过或实机帧率通过。急剧改变屏幕方向时，悬停构图仍可能裁掉保留原入口世界基准的源档案。历史角色叙事重构与数学检查沿用之前的记录，本轮没有重新进行正文冷读或数学实验。

最终固定版本已经打开：[光学演出预览](https://htmlpreview.github.io/?https://github.com/milligence/RhineLabUI/blob/5cc7bfd4bddebf55343d402ec3d8955c699a6b41/reference/projector-world-optical-review.bundle.html) 的生产组件源码摘要与最终包一致，3850 ms 为 `image-held`、清晰度 1、遮罩 `none`，见 [发布后截图](screenshots/published-held-3850.jpg) 与 [DOM 身份记录](screenshots/published-held-3850.json)。[完整场景预览](https://htmlpreview.github.io/?https://github.com/milligence/RhineLabUI/blob/5cc7bfd4bddebf55343d402ec3d8955c699a6b41/reference/projector-world-full-scene-review.bundle.html) 同样已打开，仍返回 WebGL Disabled；[浏览器记录](screenshots/published-full-scene-block.json) 保留了准确错误。完整场景视觉验收仍未通过，前述局部证据不替代它。
