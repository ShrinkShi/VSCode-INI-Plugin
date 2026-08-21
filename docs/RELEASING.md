# Release Process

本项目的 GitHub Release 由 `.github/workflows/release.yml` 自动生成。

## 发布步骤

1. 在功能分支完成开发与测试。
2. 更新 `package.json` 中的版本号，并同步 `CHANGELOG.md`。
3. 通过 Pull Request 合入 `main`。
4. PR 合并关闭后，`Build and Release VSIX` 工作流会从最新 `main`：
   - 运行 `npm test`；
   - 读取 `package.json` 版本；
   - 使用 `@vscode/vsce` 构建 `ra2-ini-support-<version>.vsix`；
   - 如果对应 Tag / Release 不存在，则创建 `v<version>`；
   - 如果 Release 已存在，则覆盖上传同名 VSIX。

原有的 `push` 和 `workflow_dispatch` 入口仍然保留，用于普通 CI 触发或人工重跑。

## 版本要求

正式发布前必须保证：

- `npm test` 全部通过；
- `package.json` 的版本号与 `CHANGELOG.md` 一致；
- 不在 Release 中发布与 `main` 不一致的手工 VSIX；
- 对同一版本重复运行发布流程时，只更新对应 Release 资产，不额外制造新版本号。
