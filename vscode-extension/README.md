# CodePet 码宠 · VSCode 插件

写一行，讲一行：为考研 408 手写代码场景打造的 C/C++ 教学注释插件。

- **自动注释**：写完整语句后自动在行尾插入中文教学注释
- **悬停讲解**：鼠标悬停代码行，弹出该行大白话解释
- **桌宠联动**：把识别结果推送给桌面桌宠（CodePet 码宠），弹出讲解气泡

纯本地规则引擎（29 类 C 语法规则），零依赖、不联网、秒级响应，预留大模型 API 结构可升级。

## 使用

1. 安装插件（见仓库 README）
2. 打开 `.c` / `.cpp` 文件写代码
3. 行尾自动出现中文注释；悬停看解释；命令面板可用：
   - `CodePet：解释当前行`
   - `CodePet：开关自动注释`

## 开发与测试

```powershell
npm test        # 44 个单元测试
npx @vscode/vsce package   # 打包 .vsix
```

## 配置

| 配置项 | 默认 | 说明 |
|---|---|---|
| `codePet.autoInsert.enabled` | true | 自动插入行尾注释 |
| `codePet.showHover` | true | 悬停解释 |
| `codePet.pushToPet.enabled` | true | 推送结果给桌宠 |
| `codePet.bridge.port` | 48672 | 本地桥接端口 |

MIT License
