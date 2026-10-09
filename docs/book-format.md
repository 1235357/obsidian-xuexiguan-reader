# 本地书籍索引格式

索引保存为 `书籍文件夹/Assets/Reader/book.json`。读书时读取实时保存的 Markdown，索引无需复制正文。

## 顶层字段

| 字段 | 类型 | 行为 |
| --- | --- | --- |
| `schema` | number | 当前索引惯例为 `1`。 |
| `bookPath` | string | 当前知识库内的书籍目录；插件从索引文件位置确认这个范围。 |
| `title` | string | 书名；省略时采用目录名。 |
| `author` | string | 作者；可以省略。 |
| `units` | array | 按阅读顺序列出的单元；至少一个。 |
| `overviewPath` | string | 可选的书内 `.excalidraw.md` 全书目录；默认 `书籍目录/Excalidraw/全书目录.excalidraw.md`。 |
| `pageImageTemplate` | string | 可选扫描页路径模板，支持 `{page:04}` 和 `{page}`；默认 `书籍目录/Assets/Pages/page-{page:04}.png`。 |
| `generatedFromFolder` | boolean | 自动扫描索引使用 `true`；手写固定索引省略。 |
| `sourceFolder` | string | 自动扫描的书内 Markdown 目录。 |
| `concepts` | array | 可选概念定位元数据。定义仍从原文的 `概念提要` 读取。 |
| `figureCaptionAudits` | object | 可选图注审核；详见下节。 |
| `drawingFontFamily` | integer | 可选传给 ExcalidrawAutomate 的字体编号；默认 `2`。须使用当前 Excalidraw 实际支持并已配置的字体。 |
| `printPageOffset` | integer | 可选 PDF 页与印刷书页的偏移量；目录卡片显示的书页为 PDF 页减去此值，仅显示大于零的结果。没有这一字段时只显示 PDF 页。 |
| `overviewLayout` | object | 可选分部目录布局：`front` 是前置单元 ID 数组，`sections` 是 `{unitId, units}` 数组；分部标题和正文也均引用索引中的单元 ID。必须恰好覆盖每个单元一次。 |

分部布局不依赖书名、路径、固定章节数或固定分部数。例如三分部书籍也可以使用同一配置机制。`overviewLayout` 仅影响新建的可编辑 Excalidraw 目录；插件会拒绝覆盖已有目录。

## 单元字段

| 字段 | 类型 | 行为 |
| --- | --- | --- |
| `id` | string | 书内唯一的稳定单元 ID；连续解说的边界使用此值。 |
| `title` | string | 显示名称。 |
| `path` | string | 书内普通 `.md` 章节，不能是 `.excalidraw.md`。 |
| `pdfStart` / `pdfEnd` | number | 可选 PDF 起止页码，从 1 开始；没有 PDF 也能阅读。 |
| `guidePath` | string | 可选书内解说 `.md`。 |
| `guideHeading` | string | 可选唯一的解说标题文字；指定时必须也提供 `guidePath`。 |
| `segments` | array | 可选稳定段落 ID、类型、名称和页码元数据。实时 Markdown 标签与标题仍是来源。 |
| `relations` | array | 可选 `{ "from": "段落ID", "to": "知识点ID" }`；歧义或无效目标不会猜测关联。 |

`guideHeading` 不能为空多行文字。缺失或重复的标题在解说栏中显示错误。截取范围包含这个标题以及它的下级标题，到下一个同级或更高级标题之前结束。

## 审核过的重复图注

如果图片自身已经包含图号，Markdown 中又保留了独立图号，可以选择只在阅读器中隐藏重复的独立图注。原 Markdown 不会删除。

```json
{
  "figureCaptionAudits": {
    "demo.png": {
      "sha256": "实际图片文件的64位SHA256十六进制值",
      "figures": ["1-1"]
    }
  }
}
```

这一示意值需要替换为真实哈希，才能通过配置校验。图片应位于该书的 `Assets/Figures/`。插件同时检查文件名、实际图片字节、独立图片块和紧跟图片的独立 `图1-1` 段落；只有全部匹配才在阅读视图中隐藏图注。任何图片字节变化都会使旧审核失效。内联图号、解释句、表格内容、引用和列表不自动隐藏。没有审核配置时全部图注保留显示。

## 原文和编者边界

```markdown
%% xgr-annotation-start:本单元ID %%
```

只识别单独一行、位于代码和隐藏注释之外、ID 精确匹配的边界。之前的内容进入原文索引；之后的内容连续显示但作为编者内容，不再进入原文索引。边界是本插件的保留语法，普通 `#s`、`#q` 和行内评论不会截断正文。

## 路径和移动

所有路径为当前知识库的相对路径。绝对路径和 `.` / `..` 路径段不接受。章节、解说和图谱须在对应书籍目录下。

书籍整体移动到知识库内的新目录后，需要更新索引里的 `bookPath` 及其明确的章节、解说和资源路径。Obsidian 可以更新双链，但 JSON 里的路径不属于原生双链自动重命名功能。自动扫描书籍的章节改名会延续插件保存的单元身份；固定索引的路径则需要由维护者更新。
