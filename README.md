# 渐构 · Obsidian 电子书阅读器

将本地 Markdown 章节组织成可继续编辑的书籍，在 Obsidian 原生标签页中阅读正文、段落脉络、概念和编者解说。阅读器使用现有知识库，不创建另一个应用窗口，也不改动 Obsidian 的顶部工具栏、左右侧栏或工作区布局。

这是独立开发的插件。界面研究参考了 [渐构](https://www.modevol.com/) 的材料分类与章节导航，以及 [《学习观》第一章交互解说页](https://www.modevol.com/p/c1e) 的并行解说方式。本仓库提供原创插件代码和原创演示，不包含书籍正文、扫描页、作者网站 HTML 或其他课程内容。

## 功能

- 从当前知识库的 Markdown 文件夹加入书籍；多个书籍分别保存阅读位置、字号和筛选状态。
- 按知识点、例子、类比、其他说明和验证材料显示段落；可以只看段落名称，或聚光选定的段落与明确关联的材料。
- 阅读连续的“原文 → 明显分隔 → 编者解说”，也可以打开本章的并行解说栏。
- 多章共用一份解说笔记；通过精确的标题指定本章范围，标题缺失或重复会显示错误，不会误读其他章节。
- 从 `概念提要` 读取概念索引。原文边界后的编者材料不进入原文段落、标题或概念索引。
- 保存 Markdown 后自动刷新；章节改名时尽量延续章节身份与阅读位置。
- 使用正楷字体族 `KaiTi / STKaiti / 楷体`，并在狭窄标签页中调整阅读器内部布局。
- 使用 Obsidian 的 Markdown、双链和嵌入；可选使用原生 Excalidraw 目录图。原图和扫描页可以在插件内放大查看。

## 安装

需要 Obsidian **1.5.0 或更新版本**。插件的最低版本声明表示 API 基线；具体主题和第三方插件的视觉兼容性仍需要在你的知识库中检查。

1. 下载发布包，或者从仓库取得 `main.js`、`manifest.json`、`styles.css`。
2. 将这三个文件放入当前知识库的 `.obsidian/plugins/xuexiguan-reader/`。
3. 在 Obsidian 的社区插件设置中启用“渐构 · 电子书阅读器”。
4. 通过命令面板执行“打开书架”或“从章节文件夹加入书籍”。也可以点击阅读器的书籍图标。

本插件没有运行时 npm 依赖，不需要联网读取书稿。不会自动下载字体或更改知识库的全局字体设置。没有安装正楷字体的系统会使用本地 serif 回退字体；本仓库不附带字体文件。

Excalidraw 是可选依赖。启用 [Obsidian Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) 后，阅读器可以通过其公开的 ExcalidrawAutomate 接口创建全书目录；现有目录图不会被覆盖。Excalidraw 的图中文字由该插件自己的字体系统管理，和 Markdown 的 CSS 字体是两个设置面。

## 快速演示

将 `examples/Demo` 文件夹复制到知识库根目录，再从书架打开“温度比较演示”。这里的两章正文和编者解说均为本项目原创，展示共享解说笔记和连续阅读的使用方式。演示不依赖 PDF、图片、字体文件或 Excalidraw。

可在 Obsidian 中使用以下链接打开第一章：

```text
obsidian://jiangou-reader?book=Demo%2FTemperature&unit=demo-01
```

## 普通章节文件夹

书籍可以采用以下结构：

```text
Books/MyBook/
  正文/
    01 第一章.md
    02 第二章.md
  附录/
    全书解说.md
  Assets/
    Reader/book.json
    Figures/
    Pages/
  Excalidraw/
    全书目录.excalidraw.md
```

从文件夹加入书籍时，如果存在 `正文/`，插件扫描该目录；否则扫描选择的书籍目录。`.excalidraw.md`、隐藏目录以及 `Assets`、`Excalidraw`、`知识网络`、`附录` 目录不作为普通章节。目录索引只记录元数据，正文始终从保存的 `.md` 文件读取。

章节顺序优先采用 frontmatter 中的 `order`，然后采用含数字的自然文件名排序。`book-order`、`阅读顺序` 也可以指定顺序。书名支持 `booktitle`、`book-title`、`书名`；作者支持 `author`、`作者`。例如：

```yaml
---
booktitle: 我的书籍
author: 作者名称
title: 第一章
order: 1
cssclasses:
  - xgr-book
---
```

`xgr-book` 使这篇笔记的原生阅读视图和编辑内容也使用正楷字体，不影响其他笔记和工作区栏位。

## 材料标签与关联

只有正文中独立行的以下标签会成为材料段落。代码块、行内代码和转义示例中的同样字符保持原样。

| 标签 | 用途 |
| --- | --- |
| `#d 名称` | 知识点 |
| `#e 名称` | 例子 |
| `#t 名称` | 类比或对比 |
| `#c 名称` | 其他说明 |
| `#v 名称` | 验证材料 |

例如 `#e 金属比较 温度` 会尝试关联唯一名称为“温度”的知识点。如果名称有歧义，插件保留材料而不猜测对应关系。也可以在 `book.json` 的单元 `relations` 中明确指定 `{ "from": "example-id", "to": "knowledge-id" }`。普通标签，例如 `#s`、`#q`，不属于阅读器材料分类。

概念索引从 `概念提要` 标题下的 `- 术语：定义` 列表读取；它不会把任意位置的列表自动当成概念定义。

## 共享解说与连续阅读

在一个共享解说笔记中为每章使用唯一标题：

```markdown
# 全书解说

## 第01章 温度比较
本章解说。

### 一个检验
这仍属于第一章。

## 第02章 测量条件
第二章解说。
```

在 `book.json` 的单元中设置 `guidePath` 和 `guideHeading`。`guideHeading` 是 Markdown 标题文字，不包含开头的 `##`；匹配区分字符并要求唯一。插件截取该标题到下一个同级或更高级标题之间的内容。代码和 Obsidian 注释中的标题不会参与匹配。省略 `guideHeading` 时，解说栏兼容原有的整篇解说笔记。

如果希望读者向下读完原文后自然进入解说，在原文结束后加入这个专用边界。`demo-01` 必须与对应单元的 `id` 完全相同：

```markdown
%% xgr-annotation-start:demo-01 %%

## 解说与批注（编者）

> [!note] 编者解说
> 以下内容为编者的理解与检验材料。

![[Demo/Temperature/附录/全书解说#第01章 温度比较]]
```

边界是独立一行的 Obsidian 注释，放在代码块之外。它不会修改之前的原文字符；边界后的内容仍按普通 Markdown 连续渲染，但不会加入原文索引，也不会随着原文材料的筛选或名称模式一起隐藏。

## `book.json` 格式

查看 [配置格式与完整字段](docs/book-format.md)。演示中提供了可直接使用的 [完整索引](examples/Demo/Temperature/Assets/Reader/book.json)。所有文件路径均为当前知识库的相对路径，且章节与解说必须位于该书籍文件夹内。

```json
{
  "schema": 1,
  "bookPath": "Demo/Temperature",
  "title": "温度比较演示",
  "author": "原创演示",
  "units": [
    {
      "id": "demo-01",
      "title": "第一章 温度比较",
      "path": "Demo/Temperature/正文/01 温度比较.md",
      "guidePath": "Demo/Temperature/附录/全书解说.md",
      "guideHeading": "第01章 温度比较"
    }
  ]
}
```

自动从目录生成的索引包含 `generatedFromFolder: true` 和 `sourceFolder`，保存或重命名章节时会重新扫描。手写索引省略该开关，采用明确列出的章节顺序。

`obsidian://jiangou-reader` 是通用协议；`obsidian://xuexiguan-reader` 保留为兼容入口。两者均支持 `book`、`unit`、`segment`，也可用 `vault` 限定知识库名称。段落的阅读器 ID 不会凭空创建原生 Obsidian block ID；需要原生块双链时，应在 Markdown 中实际写入 `^block-id`。

## 开发与验证

`main.js` 就是可阅读、未压缩的完整源码，无需构建。需要 Node.js 18 或更新版本运行测试：

```sh
npm test
npm run check
```

测试使用内存中的原创 Markdown、仓库内的原创演示和 Obsidian API/DOM 替身，覆盖索引、章节排序、改名后的阅读位置、共享解说范围、原文边界、字面代码、图片尺寸、图注审核、段落关联和监听器释放。测试不读取本机书籍，不写知识库，不依赖当前工作目录或字体文件。

这些测试证明解析和调用逻辑，不替代原生 Obsidian 的视觉检查。发布前仍应在实际知识库检查宽窄标签页、主题、公式、嵌入和并行解说。桌面 Obsidian 的实际验收由项目维护者完成；本版本未宣称已完成所有移动设备的验收。

## 许可与依赖

原创代码、测试、说明和演示采用 [MIT](LICENSE) 许可。Obsidian 运行时与可选的 Excalidraw 插件各自适用其许可；它们的源码不包含在本仓库中。插件只读取你主动加入的本地材料，不附带任何书籍或课程的使用许可。
