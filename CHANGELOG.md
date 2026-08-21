# Changelog

## 0.2.0

- 一键格式化增加行内 `;` 注释列对齐，可单独关闭并配置最小间距。
- 增加 Section / Key / Equals / Value / Comment 五部分的直接自定义颜色设置。
- 增加工作区级 INI 记忆索引，学习所有已索引 `.ini` 的 Section、Key 与 Value。
- 增加 IntelliSense / Tab 补全，并按历史出现频率排序候选。
- 增加 `Ctrl + 左键` / Go to Definition 跳转对应 `[Section]`。
- Section 定义支持跨文件查找；存在多个同名定义时向 VS Code 返回全部目标供用户选择。
- 工作区索引使用文件监听与单文件增量更新，避免每次补全重新扫描整个目录。
- 新增索引、补全、跳转和注释对齐测试。

## 0.1.0

- 初始版本。
- 增加 RA2/YR INI 语言模式与 TextMate 语法高亮。
- 增加主题自适应的 Section / Key / Equals / Value / Comment 专用颜色。
- 增加 `[Section]` 折叠和 Outline 导航。
- 增加安全的一键格式整理与 VS Code Document Formatter。
- 增加 block / section / document 三种等号对齐范围。
- 增加格式化核心单元测试。
