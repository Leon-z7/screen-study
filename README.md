# ScreenStudy

在 Windows 打开个人练习题的同时，用 iPhone 或 Android 的浏览器实时拍屏查题。手机上的取景和查题结果同屏。题库未命中时，显示相关资料和来源供核对。

## 安装

在 [GitHub Releases](https://github.com/Leon-z7/screen-study/releases) 下载 Windows x64 安装包。支持 Windows 10 / 11 x64，安装包内置 Node.js。安装后自动用默认浏览器打开仅本机可访问的控制台。后续可从「开始」菜单打开 ScreenStudy。

## 连接手机

1. Windows 和手机连接同一 Wi-Fi。在控制台选择 iPhone / iPad 或 Android，扫描控制台显示的二维码，或复制配对链接，在 iPhone 的 Safari 或 Android 的 Chrome 中打开。
2. 用电脑控制台显示的 SHA-256 指纹核对首次下载的本机证书。
   - **iPhone / iPad** 在「设置」打开已下载的描述文件，安装后前往「设置 → 通用 → 关于本机 → 证书信任设置」，为 ScreenStudy Local CA 开启完全信任。
   - **Android** 下载 `.cer` 文件。在系统设置搜索「安装证书」或「加密与凭据」，选择「CA 证书」并导入。品牌和系统版本的菜单名称会有变化。
3. 回配对页点「打开拍屏查题」，选择「开始实时扫描」并允许摄像头。需要更换网络时，退出 ScreenStudy 再重新打开并使用新链接。

首次识别需联网加载 OCR 组件和语言模型，摄像头图像在手机浏览器内处理。需要手机信任 HTTPS 才能实时取景。只在你信任的局域网使用配对链接，链接能访问启用的资料。Windows 弹出防火墙提示时，仅为专用网络放行。受组织管理的手机可能限制安装用户 CA。

## 导入资料和题库

桌面控制台可一次选择多个文件。每份文件单独勾选，手机页面会在几秒内更新。关闭或重新启动应用后会保留之前的勾选状态。安装附带一道示例题，可以停用或移除。

- **题库 JSON** 使用 `question`、`answer` 字段。可选 `aliases`（题干别名数组）、`source` 和 `page`。
- **知识库 JSON** 使用 `page`、`text` 字段。也可导入 UTF-8 TXT，以空行分段。
- 每份文件上限 8 MiB。示例见 [sample-answers.json](sample-answers.json) 与 [sample-reference.txt](sample-reference.txt)。

题库和配对配置保存在 `%LOCALAPPDATA%\ScreenStudy\data`。应用分开安装于 `%LOCALAPPDATA%\Programs\ScreenStudy`。退出程序请使用控制台的「退出程序」。停用后可在手机系统设置中移除 ScreenStudy Local CA。

## 构建

使用 Windows 10 / 11 x64、Windows PowerShell 和 Node.js 24.19.0 x64 运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

输出在 `dist`。用 `-NodeExe` 可指定所用的 Node.js 可执行文件路径。Node.js 发行组件和二维码生成库分别随附上游许可文本。
