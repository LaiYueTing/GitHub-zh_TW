# [GitHub 繁體中文化插件][project-url]

> 本項目開源自：[maboloshi/github-chinese](https://github.com/maboloshi/github-chinese)

  [![GitHub stars][stars-image]][stars-url]
  [![GitHub forks][forks-image]][forks-url]
  [![GitHub issues][issues-image]][issues-url]
  [![license GPL-3.0][license-image]][license-url]

## 🚩 功能特性

- [x] 全面繁體中文化 GitHub 界面元素（選單欄、標題、按鈕 等 ...）
- [x] 智慧正規表達式匹配功能
- [x] 支援專案描述的人機翻譯
- [x] 自動在地化時間元素

## 🌐 相容環境

瀏覽器類型                          | 支援的腳本管理器
:---------------------------------: | :---------: 
Chrome / Chromium 內核 | [Tampermonkey][Tampermonkey], [Violentmonkey][Violentmonkey]
Safari（全平台）     | [Tampermonkey][Tampermonkey], [Macaque][Macaque], [Stay][Stay]
Firefox / Gecko 內核   | [Tampermonkey][Tampermonkey], [Violentmonkey][Violentmonkey]
Via（Android）       | 內建管理器

## 💽 安裝指南

1. 安裝使用者腳本管理器：
    - 推薦：[Tampermonkey][Tampermonkey]
2. **基於 Chrome / Chromium 內核瀏覽器：**
    1. 務必開啟 “擴充功能” 管理中的 **“開發者模式”**
    1. 務必開啟 “擴充功能” 管理中腳本管理器擴展的 **“允許使用者指令碼”**
    1. 具體可參考 [Tampermonkey 官方指引](https://www.tampermonkey.net/faq.php#Q209)
3. 選擇安裝源：
    - [GitHub 繁體中文化插件 - Github 託管【開發版】][main.user.js]
4. 重新整理 GitHub 頁面，即可發現網站已經繁體中文化。
5. 必要時，重新啟動瀏覽器

[project-url]: https://github.com/LaiYueTing/Github-zh_TW "GitHub 繁體中文化插件"

[issues-url]: https://github.com/LaiYueTing/Github-zh_TW/issues "議題"
[issues-image]: https://img.shields.io/github/issues/LaiYueTing/Github-zh_TW?style=flat-square&logo=github&label=Issue

[stars-url]: https://github.com/LaiYueTing/Github-zh_TW/stargazers "星標"
[stars-image]: https://img.shields.io/github/stars/LaiYueTing/Github-zh_TW?style=flat-square&logo=github&label=Star

[forks-url]: https://github.com/LaiYueTing/Github-zh_TW/network "復刻"
[forks-image]: https://img.shields.io/github/forks/LaiYueTing/Github-zh_TW?style=flat-square&logo=github&label=Fork

[license-url]: https://opensource.org/licenses/GPL-3.0  "許可證"
[license-image]: https://img.shields.io/github/license/LaiYueTing/Github-zh_TW?style=flat-square&logo=github&label=License

[Tampermonkey]: https://tampermonkey.net/ "篡改猴"
[Violentmonkey]: https://violentmonkey.github.io/ "暴力猴"
[Macaque]: https://macaque.app/ "獼猴"
[Stay]: https://apps.apple.com/tw/app/stay-for-safari-%E7%80%8F%E8%A6%BD%E5%99%A8%E4%BC%B4%E4%BE%B6/id1591620171 "Stay"

[main.user.js]: https://github.com/LaiYueTing/GitHub-zh_TW/raw/main/main.user.js "GitHub 繁體中文化插件 - GitHub 託管"