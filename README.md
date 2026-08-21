# VSCode-INI-Plugin

[![Build and Release VSIX](https://github.com/ShrinkShi/VSCode-INI-Plugin/actions/workflows/release.yml/badge.svg)](https://github.com/ShrinkShi/VSCode-INI-Plugin/actions/workflows/release.yml)
[![GitHub Release](https://img.shields.io/github/v/release/ShrinkShi/VSCode-INI-Plugin)](https://github.com/ShrinkShi/VSCode-INI-Plugin/releases)

面向《命令与征服：红色警戒 2 / 尤里的复仇》MOD 开发的 VS Code INI 语言扩展。

它不是通用 INI 美化器，而是针对 `rules.ini`、`rulesmd.ini`、`art.ini`、`artmd.ini`、`ai.ini`、`aimd.ini` 等大型 Westwood INI 的编辑习惯进行适配：保留顺序与重复键，同时提供 Section 折叠、独立语法着色、等号/注释对齐、工作区补全和跨文件 Section 跳转。

## 主要功能

### 1. `[Section]` 折叠与 Outline 导航

以 `[Section]` 为边界提供折叠范围，并注册到 VS Code Outline / Go to Symbol。

```ini
[General]
BuildSpeed=.7
RepairPercent=15%

[VehicleTypes]
1=AMCV
2=HARV
```

大型 INI 中可以直接折叠整个 Section，或使用 `Ctrl+Shift+O` 按名称导航。

### 2. RA2/YR INI 独立语法高亮

以下部分分别着色：

- `[Section]`
- `; Comment`
- 等号左侧 Key
- `=`
- 等号右侧 Value

默认颜色会根据 VS Code 深色 / 浅色 / 高对比主题自动选择。

从 v0.2.0 开始，也可以直接在插件设置中分别指定颜色，例如：

```json
{
  "ra2Ini.colors.sectionForeground": "#DCDCAA",
  "ra2Ini.colors.keyForeground": "#9CDCFE",
  "ra2Ini.colors.equalsForeground": "#C586C0",
  "ra2Ini.colors.valueForeground": "#CE9178",
  "ra2Ini.colors.commentForeground": "#6A9955"
}
```

留空则使用主题自适应颜色。

仍然兼容 VS Code 原生 `workbench.colorCustomizations`：

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

### 3. 一键整理：等号 + 行内注释对齐

入口：

- 编辑器右键：`RA2 INI: 整理并对齐当前文件`
- VS Code 原生格式化：`Shift+Alt+F`

整理前：

```ini
[General]
BuildSpeed=.7 ; build speed
RepairPercent =15%      ; repair
RefundPercent= 50% ; refund
```

整理后：

```ini
[General]
BuildSpeed    = .7  ; build speed
RepairPercent = 15% ; repair
RefundPercent = 50% ; refund
```

默认采用 **连续键值块对齐**：空行、独立注释和新的 Section 会结束当前对齐组，避免一个超长 Key / Value 把整个大型 Section 撑出几十列空格。

可关闭行内注释对齐：

```json
{
  "ra2Ini.format.alignInlineComments": false
}
```

### 4. Tab / IntelliSense 工作区代码补全

插件会建立一个工作区级 INI 索引，学习当前工作目录下的 `.ini` 文件，而不是使用固定词典。

索引内容包括：

- 所有 `[Section]` 名称；
- 所有等号左侧 Key；
- 每个 Key 历史出现过的 Value；
- 逗号列表中的单个 Value token。

例如工作区中已经存在：

```ini
[E1]
Primary=M60
Armor=none

[E2]
Primary=M60
Armor=flak
```

在其他 INI 中输入：

```ini
Pri
```

会出现 `Primary` 补全；输入：

```ini
Primary = M
```

会优先提示这个 Key 在工作区中使用过的 `M60`；在 Value 位置还会同时提示工作区 Section 名，方便填写对象引用。

VS Code 在 RA2/YR INI 模式下默认开启 quick suggestions 与 Tab completion。补全列表出现后可按 `Tab` 接受。

工作区索引不是每次补全时重新全盘扫描：首次打开工作区时扫描一次，之后通过文件监听和编辑事件对单个 INI 做增量更新。

### 5. `Ctrl + 左键` 跨文件跳转 `[Section]`

插件注册了 VS Code Definition Provider，因此以下操作都可以跳转：

- `Ctrl + 左键`
- `F12` / Go to Definition

例如：

```ini
[E1]
Primary=M60
```

对 `M60` 使用 `Ctrl + 左键`，如果工作区中存在：

```ini
[M60]
Damage=15
```

则直接跳转到 `[M60]`。

逗号列表也支持逐项识别：

```ini
Owner=Americans,Russians,Alliance
```

点击 `Russians` 时只查找 `[Russians]`。

如果多个文件都定义了同名 Section，例如 `rules.ini` 和 `rulesmd.ini` 都有 `[E1]`，扩展会把所有定义位置返回给 VS Code，由 VS Code 的 Peek / Definition 选择界面让你选择目标，而不是擅自挑一个。

## 安全格式化原则

RA2/YR INI 不适合套用“自动排序 + 去重”的普通配置文件逻辑。本扩展坚持以下边界：

- 不排序 Section；
- 不排序 Key；
- 不重新编号数字列表；
- 不删除重复 Key；
- 不修改独立注释正文；
- 值中的第二个及后续 `=` 原样保留，仅第一个 `=` 作为键值分隔符；
- 行内注释只调整前导空格和对齐列，不修改 `;` 后面的正文。

例如：

```ini
[List]
1=GACNST
1=GAPOWR
; intentional duplicate
2=GAREFN
```

只会整理空格，不会“修复”重复键或重排条目。

## 配置项

### 格式化

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `ra2Ini.format.alignEquals` | `true` | 对齐等号 |
| `ra2Ini.format.alignInlineComments` | `true` | 对齐键值行末尾的 `;` 注释 |
| `ra2Ini.format.alignmentScope` | `block` | `block` / `section` / `document` |
| `ra2Ini.format.minimumSpacesAroundEquals` | `1` | 等号左右至少保留的空格数 |
| `ra2Ini.format.minimumSpacesBeforeInlineComment` | `1` | Value 与行内注释之间至少保留的空格数 |
| `ra2Ini.format.normalizeInlineCommentSpacing` | `true` | 未启用注释对齐时是否规范注释间距 |

`alignmentScope` 同时控制等号和行内注释的对齐组：

- `block`：仅连续键值块对齐，推荐用于大型 RA2/YR INI；
- `section`：同一 `[Section]` 内统一对齐；
- `document`：整个文件统一对齐。

### 颜色

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `ra2Ini.colors.overrideTheme` | `true` | 启用扩展专用颜色装饰 |
| `ra2Ini.colors.sectionForeground` | 空 | `[Section]` 自定义色 |
| `ra2Ini.colors.keyForeground` | 空 | Key 自定义色 |
| `ra2Ini.colors.equalsForeground` | 空 | `=` 自定义色 |
| `ra2Ini.colors.valueForeground` | 空 | Value 自定义色 |
| `ra2Ini.colors.commentForeground` | 空 | 注释自定义色 |

颜色格式支持 `#RRGGBB` / `#RRGGBBAA`。

### 补全与工作区索引

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `ra2Ini.completion.enabled` | `true` | 启用工作区记忆补全 |
| `ra2Ini.completion.includeSectionsInValues` | `true` | Value 补全中加入 Section 名 |
| `ra2Ini.completion.maxItems` | `200` | 单次最多返回的补全候选数 |
| `ra2Ini.index.maxFiles` | `5000` | 初始索引最多扫描的 INI 文件数 |
| `ra2Ini.index.excludeGlob` | 见默认设置 | 初始索引排除目录 |

默认只排除 `.git` 与 `node_modules`；其余工作区目录中的 `.ini` / `.INI` 都会进入索引。

## 安装

### 从 GitHub Release 安装

1. 打开仓库的 **Releases** 页面；
2. 下载 `ra2-ini-support-<version>.vsix`；
3. 在 VS Code 打开扩展面板；
4. 点击右上角 `...`；
5. 选择“从 VSIX 安装...”并选择下载的 VSIX。

打开 `.ini` 后，右下角语言模式应显示 `RA2/YR INI`。

如果其他 INI 扩展抢占了 `.ini` 文件关联，点击右下角语言模式，手动选择 `RA2/YR INI`，并可将其设为 `.ini` 默认关联。

## 开发

要求：

- Node.js 18+；
- VS Code 1.85+。

运行测试：

```bash
npm test
```

本地打包：

```bash
npx @vscode/vsce package
```

v0.2.0 的自动测试覆盖格式化和工作区索引核心，包括：

- block / section 等号对齐；
- 行内注释对齐与关闭行为；
- 重复键、中文注释、额外 `=`、CRLF 保留；
- Section / Key / Value 索引；
- 同名 Section 多定义；
- Key / Value / 逗号列表补全上下文；
- 跨文件 Section 引用定位。

## 项目结构

```text
.
├─ extension.js                    # VS Code 扩展入口与 Providers
├─ formatter.js                    # 安全格式化、等号与注释对齐
├─ ini-index.js                    # 工作区 INI 索引、补全与引用解析核心
├─ syntaxes/
│  └─ ra2ini.tmLanguage.json       # TextMate 语法规则
├─ language-configuration.json     # VS Code 语言配置
├─ test/
│  ├─ formatter.test.js
│  └─ index.test.js
├─ package.json                    # 扩展清单与设置项
└─ .github/workflows/release.yml   # VSIX 构建 / Release
```

## 后续方向

后续可以继续做真正的 RA2/YR 语言服务能力：

- Find References / Section 引用反查；
- 重复 ID、缺失引用诊断；
- `rules.ini` / `art.ini` 字段词典与中文 Hover；
- `Primary` / `Image` / `Warhead` 等字段的类型化补全；
- rules / art 对象关联导航；
- 更大 MOD 工程的持久化索引。

## 许可证

本项目使用 [GNU General Public License v3.0](LICENSE)。

本项目是社区工具，与 Electronic Arts、Westwood Studios 等权利方无隶属或官方关联；仓库不包含《红色警戒 2 / 尤里的复仇》的游戏素材。
