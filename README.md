# VSCode-INI-Plugin

[![Build and Release VSIX](https://github.com/ShrinkShi/VSCode-INI-Plugin/actions/workflows/release.yml/badge.svg)](https://github.com/ShrinkShi/VSCode-INI-Plugin/actions/workflows/release.yml)
[![GitHub Release](https://img.shields.io/github/v/release/ShrinkShi/VSCode-INI-Plugin)](https://github.com/ShrinkShi/VSCode-INI-Plugin/releases)

面向《命令与征服：红色警戒 2 / 尤里的复仇》MOD 开发的 VS Code INI 语言扩展。

项目重点不是做一个“通用 INI 美化器”，而是改善 `rules.ini`、`rulesmd.ini`、`art.ini`、`artmd.ini`、`ai.ini`、`aimd.ini` 等大型 Westwood INI 文件在 VS Code 中的编辑体验，并尽量避免格式化工具破坏原有条目顺序、重复键和人工注释布局。

## 功能

### Section 折叠与导航

以 `[Section]` 为边界提供折叠范围，并注册到 VS Code Outline / Go to Symbol。

```ini
[General]
BuildSpeed=.7
RepairPercent=15%

[VehicleTypes]
1=AMCV
2=HARV
```

大型 `rules.ini` / `art.ini` 中可以直接折叠整个 Section，或使用 `Ctrl+Shift+O` 快速跳转。

### RA2/YR 风格语法高亮

以下部分分别着色：

- `[Section]`
- `; comment`
- 等号左侧 Key
- `=`
- 等号右侧 Value

扩展默认使用专用颜色，也可以关闭覆盖，让当前 VS Code 主题完全接管。

### 一键整理与等号对齐

支持两种入口：

- 编辑器右键：`RA2 INI: 整理并对齐当前文件`
- VS Code 原生格式化：`Shift+Alt+F`

整理前：

```ini
[General]
BuildSpeed=.7
RepairPercent =15%
RefundPercent= 50%

; unit list
1=GACNST
20 = GAPOWR
```

整理后：

```ini
[General]
BuildSpeed    = .7
RepairPercent = 15%
RefundPercent = 50%

; unit list
1  = GACNST
20 = GAPOWR
```

默认采用 **连续键值块对齐**。空行、注释和新的 Section 会结束当前对齐组，避免一个超长 Key 把整个大型 Section 撑出大量无意义空格。

## 安全格式化原则

RA2/YR 的 INI 并不适合套用“自动排序 + 去重”的普通配置文件逻辑。本扩展当前坚持以下边界：

- 不排序 Section。
- 不排序 Key。
- 不重新编号数字列表。
- 不删除重复 Key。
- 不修改注释正文。
- 值中的第二个及后续 `=` 原样保留，仅第一个 `=` 作为键值分隔符。

例如：

```ini
[List]
1=GACNST
1=GAPOWR
; intentional duplicate
2=GAREFN
```

只会整理空格，不会“修复”重复键或重排条目。

## 支持的配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `ra2Ini.format.alignEquals` | `true` | 格式化时是否对齐等号 |
| `ra2Ini.format.alignmentScope` | `block` | `block` / `section` / `document` |
| `ra2Ini.format.minimumSpacesAroundEquals` | `1` | 等号左右至少保留的空格数 |
| `ra2Ini.format.normalizeInlineCommentSpacing` | `true` | 规范值与行内 `;` 注释之间的空格 |
| `ra2Ini.colors.overrideTheme` | `true` | 是否使用本扩展提供的专用颜色 |

### 对齐范围

`block`：默认模式，仅连续键值块对齐。适合大型 `rules.ini` / `art.ini`。

`section`：同一 `[Section]` 内统一对齐，空行和注释不打断。

`document`：整个文件统一对齐。

示例：

```json
{
  "ra2Ini.format.alignmentScope": "section"
}
```

### 自定义颜色

```json
{
  "workbench.colorCustomizations": {
    "ra2Ini.sectionForeground": "#DCDCAA",
    "ra2Ini.keyForeground": "#9CDCFE",
    "ra2Ini.equalsForeground": "#C586C0",
    "ra2Ini.valueForeground": "#CE9178",
    "ra2Ini.commentForeground": "#6A9955"
  }
}
```

## 安装

### 从 GitHub Release 安装

1. 打开仓库的 **Releases** 页面。
2. 下载对应版本的 `ra2-ini-support-<version>.vsix`。
3. 在 VS Code 打开扩展面板。
4. 点击右上角 `...`。
5. 选择“从 VSIX 安装...”。
6. 选择下载的 VSIX。

打开 `.ini` 文件后，右下角语言模式应显示 `RA2/YR INI`。

如果其他 INI 扩展抢占了 `.ini` 文件关联，点击右下角语言模式，手动选择 `RA2/YR INI`，并可将其设为 `.ini` 的默认关联。

## 开发

要求：

- Node.js 18+ 推荐。
- VS Code 1.85+。

运行测试：

```bash
npm test
```

本地打包：

```bash
npx @vscode/vsce package
```

当前格式化核心测试覆盖：

- 连续块等号对齐。
- Section 范围对齐。
- 重复键保留。
- 中文及普通注释保留。
- 值中存在额外 `=`。
- 行内 `;` 注释。
- Windows CRLF。

## 项目结构

```text
.
├─ extension.js                    # VS Code 扩展入口、折叠、Outline、颜色装饰与格式化命令
├─ formatter.js                    # INI 解析与安全格式化核心
├─ syntaxes/
│  └─ ra2ini.tmLanguage.json       # TextMate 语法规则
├─ language-configuration.json     # VS Code 语言配置
├─ test/
│  └─ formatter.test.js            # 格式化器单元测试
├─ package.json                    # 扩展清单与设置项
└─ .github/workflows/release.yml   # main 更新后自动构建并发布对应版本 VSIX
```

## 后续方向

下一阶段更值得做的是 RA2/YR 专项语言能力，而不是继续堆通用 INI 功能，例如：

- 工作区 INI Key / Value 补全。
- `Ctrl+左键` 跳转 `[Section]`，支持跨文件和同名 Section 选择。
- Section / 对象引用查找。
- 重复 ID、缺失引用等诊断。
- `rules.ini` / `art.ini` 常用字段悬停说明。
- 更适合 MOD 工程的大文件索引与缓存。

## 许可证

本项目使用 [GNU General Public License v3.0](LICENSE)。

本项目是社区工具，与 Electronic Arts、Westwood Studios 等权利方无隶属或官方关联；仓库不包含《红色警戒 2 / 尤里的复仇》的游戏素材。
