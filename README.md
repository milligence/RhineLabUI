# The Archive · 初版模板

以三维循环档案阵列为入口的 Archive 初版模板。选择档案后，可查看并旋转上方图片，向下阅读摘要和文字记录；支持检索、收藏、文本导出、亮暗主题和离线安装。

## 本地运行

需要 Node.js 22.12 或更新版本，以及支持 WebGL 2 的浏览器。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。生产构建与内容检查：

```sh
npm run build
npm run check:content
```

## 填写档案

编辑 `content/archives.json`。初版保留五个分类、每类八份共 40 个占位档案；新增或减少档案需要修改阵列与数据校验逻辑。字段和图片替换方式见 [内容说明](content/README.md)。

目前是静态模板：内容随项目一起构建，没有后台、在线编辑或账号系统；收藏和偏好只保存在当前浏览器。

## 来源与许可

基于 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) fork 改造。原作者有权授权的代码及原创素材采用 MIT 许可，保留 [LICENSE](LICENSE) 与相关第三方许可。原项目还包含对《明日方舟》视觉设计的复刻及其他第三方素材；本次已替换界面品牌、演示档案和原片打字音，但三维造型和部分视觉设计仍源自该复刻。公开或商业使用前，请自行确认相关素材和设计的权利。原项目背景音乐暂时保留，来源见 [音频说明](public/audio/README.md)。
