# Changelog

## 0.2.1

- 修复在 VS Code 设置页修改扩展颜色后，已打开的 INI 编辑器可能继续显示旧颜色的问题。
- 颜色配置改为从 `ra2Ini` 根配置读取嵌套键，避免直接颜色设置未被正确解析。
- 颜色变化后刷新所有当前可见的 RA2/YR INI 编辑器，并在 VS Code 主题变化时同步重建颜色装饰。
- 默认 `[Section]` 颜色改为 `#8B00BD`。
- 默认等号 `=` 颜色改为 `#FF0000`。

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
