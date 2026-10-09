"use strict";
const fs = require("fs"), path = require("path"), Module = require("module"), assert = require("assert/strict");
const pluginPath = path.join(__dirname, "main.js");
const originalLoad = Module._load;
const renderedMarkdown = [];
let markdownRenderHook = null;
const parseYaml = text => Object.fromEntries(text.split(/\r?\n/).filter(line => /^[^:]+:/.test(line)).map(line => {
  const i = line.indexOf(":"), key = line.slice(0, i).trim(), raw = line.slice(i + 1).trim(), value = /^\d+$/.test(raw) ? Number(raw) : raw.replace(/^["']|["']$/g, ""); return [key, value];
}));
class MockComponent {
  constructor() { this.children = []; this.domEvents = []; }
  addChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); child.unload(); }
  registerDomEvent(element, type, callback, options) { element.addEventListener(type, callback, options); this.domEvents.push({ element, type, callback, options }); }
  unload() { this.domEvents.forEach(({ element, type, callback, options }) => element.removeEventListener(type, callback, options)); this.domEvents = []; this.children.forEach(child => child.unload()); this.children = []; }
}
class MockElement {
  constructor(document) { this.ownerDocument = document; this.children = []; this.listeners = new Map(); this.style = { setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} }; this.dataset = {}; this.attributes = new Map(); this.parentElement = null; }
  appendChild(child) { child.remove?.(); this.children.push(child); child.parentElement = this; return child; }
  replaceChildren() { this.children.forEach(child => child.parentElement = null); this.children = []; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, callback) { const callbacks = this.listeners.get(type) || []; callbacks.push(callback); this.listeners.set(type, callbacks); }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
  dispatch(type, event = {}) { [...this.listeners.get(type) || []].forEach(callback => callback(event)); }
}
Module._load = function (name, ...args) { if (name === "obsidian") return { Plugin: class {}, ItemView: class extends MockComponent { constructor(leaf) { super(); this.app = leaf.app; } }, Component: MockComponent, MarkdownRenderer: { render: async (app, markdown, article, sourcePath, component) => { renderedMarkdown.push({ markdown, article, sourcePath }); if (markdownRenderHook) await markdownRenderHook(app, markdown, article, sourcePath, component); } }, Modal: class {}, Notice: class {}, normalizePath: s => s.replace(/\\/g, "/"), parseYaml }; return originalLoad.call(this, name, ...args); };
const Reader = require(pluginPath), h = Reader._testing; Module._load = originalLoad;
const fixtureBookPath = "_ReaderRegression/既有书籍", genericPath = "_ReaderRegression/第二本书", content = new Map([
  [`${genericPath}/10 第二章.md`, '---\nbooktitle: 通用阅读测试\nauthor: 测试材料\norder: 2\n---\n# 第二章\n\n#v 检验\n\n这是一份验证材料。\n\n#s 普通标签\n保留自定义标签。\n'],
  [`${genericPath}/02 第一章.md`, '---\nbooktitle: 通用阅读测试\nauthor: 测试材料\norder: 1\n---\n# 第一章\n\n#d 规则\n正文规则。\n\n#e 例子 规则\n示例材料。\n\n### 概念提要\n- 规则：原文定义。\n'],
  [`${genericPath}/插图.excalidraw.md`, '---\nexcalidraw-plugin: parsed\n---\n# 不属于正文\n']
]);
const fixtureUnits = [
  { id: "01", title: "第一章", path: `${fixtureBookPath}/01 第一章.md`, segments: [{ id: "01-s0012", type: "d", title: "温度" }] },
  { id: "02", title: "第二章", path: `${fixtureBookPath}/02 第二章.md`, segments: [] }
];
content.set(fixtureUnits[0].path, "# 第一章\n\n#d 温度\n温度描述物体的冷热程度。\n\n#e 金属温度 温度\n用同一温度计比较两个金属块。\n\n#t 地图比喻\n简化模型与地图一样省去某些细节。\n\n### 概念提要\n- 温度：描述物体冷热程度的量。\n");
content.set(fixtureUnits[1].path, "# 第二章\n\n#d 变化\n一次观测不能代替多次比较。\n\n#c 作用\n保持测量方法一致，使结果可比较。\n\n#v 检验\n更换一个样本并记录预测与观测。\n\n### 概念提要\n- 变化：同一量在不同观测条件下的差异。\n");
const fixtureManifest = { title: "原创回归材料", author: "插件测试", bookPath: fixtureBookPath, units: fixtureUnits, concepts: [] };
content.set(`${fixtureBookPath}/Assets/Reader/book.json`, JSON.stringify(fixtureManifest));
function mockFile(p) { if (content.has(p)) return { path: p, extension: p.split(".").pop(), basename: p.split("/").pop().replace(/\.md$/, ""), stat: { mtime: 1, size: content.get(p).length } }; if ([...content.keys()].some(key => key.startsWith(p + "/"))) return { path: p, children: [] }; return null; }
const writes = [];
const vault = { getName: () => "回归知识库", getAbstractFileByPath: mockFile, getFiles: () => [...content.keys()].map(mockFile), getMarkdownFiles: () => [...content.keys()].filter(p => p.endsWith(".md")).map(mockFile), read: async file => content.get(file.path), createFolder: async p => writes.push({ kind: "folder", path: p }), create: async (p, text) => { writes.push({ kind: "file", path: p }); content.set(p, text); }, adapter: { read: async p => content.get(p), write: async (p, text) => { content.set(p, text); writes.push({ kind: "report", path: p }); }, getResourcePath: p => "app://local/" + p } };
const app = { vault, metadataCache: { getFileCache: () => ({}), getFirstLinkpathDest: () => null }, workspace: { getLeavesOfType: () => [] } };
function mockEA() {
  let elements = [], n = 0; const ea = { plugin: { app }, obsidian: { Notice: class {} }, style: {}, canvas: {}, fontFamilies: [], clear: () => { elements = []; }, setFontFamily: family => ea.fontFamilies.push(family),
    measureText: value => { const lines = String(value).split("\n"), size = ea.style.fontSize; return { width: Math.max(...lines.map(line => [...line].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? size : size * .55), 0))), height: lines.length * size * 1.2 }; },
    addText: (x, y, value, options) => { const id = "text" + ++n; elements.push({ id, type: "text", x, y, width: options.width, height: options.height, text: value }); return id; },
    addRect: (x, y, width, height) => { const id = "rect" + ++n; elements.push({ id, type: "rectangle", x, y, width, height }); return id; }, getElement: id => elements.find(e => e.id === id), getElements: () => elements,
    addToGroup: () => {}, addAppendUpdateCustomData: (id, data) => { ea.getElement(id).customData = data; }, create: async options => { const p = options.foldername + "/" + options.filename; content.set(p, JSON.stringify({ elements, options })); return p; } };
  return ea;
}
(async () => {
  const original = fixtureManifest, metadata = h.validBook(original);
  assert(metadata.units.every(unit => !("markdown" in unit) && unit.segments.every(segment => !("markdown" in segment))));
  const currentUnits = metadata.units.map(unit => h.liveUnit(unit, content.get(unit.path))), count = {};
  currentUnits.forEach(unit => unit.segments.forEach(segment => count[segment.type] = (count[segment.type] || 0) + 1));
  assert.equal(currentUnits.length, 2); assert.deepEqual(count, { h: 4, d: 2, e: 1, t: 1, c: 1, v: 1 });
  assert.equal(currentUnits.flatMap(unit => h.conceptsFromUnit(unit, original.concepts)).length, 2);
  const saved = h.migrateLibraryData({ unitId: "01", fontSize: 20, positions: { "01": { top: 2373, segmentId: "01-s0012", offset: -22 } } }, fixtureBookPath);
  assert.equal(saved.books[fixtureBookPath].positions["01"].segmentId, "01-s0012");
  assert.deepEqual(h.migrateLibraryData({}), { schema: 2, activeBook: "", books: {} }, "A fresh install has no machine-specific default book");
  assert.equal(h.migrateLibraryData({ schema: 2, activeBook: fixtureBookPath, books: { [fixtureBookPath]: saved.books[fixtureBookPath] } }, genericPath).activeBook, fixtureBookPath, "Upgrades preserve the prior active book even when shelf discovery order changes");
  const validState = h.migrateLibraryData({ schema: 2, activeBook: "../outside", books: { [fixtureBookPath]: saved.books[fixtureBookPath], "../outside": {} } });
  assert.equal(validState.activeBook, fixtureBookPath); assert.deepEqual(Object.keys(validState.books), [fixtureBookPath]);
  assert.throws(() => h.validBook({ title: "No path", units: [{ path: "Demo/chapter.md" }] }), /知识库内/);
  const emptyPlugin = new Reader(); emptyPlugin.libraryData = h.migrateLibraryData({}); let emptyShelfOpened = 0;
  emptyPlugin.discoverBooks = async () => []; emptyPlugin.openShelf = () => emptyShelfOpened++;
  await emptyPlugin.openReader(); assert.equal(emptyShelfOpened, 1, "No configured book opens the shelf without guessing a file path");
  const plugin = new Reader(); plugin.app = app; plugin.libraryData = saved; plugin.queueSave = () => {};
  const draft = await plugin.draftBook(genericPath);
  assert.equal(draft.title, "通用阅读测试"); assert.equal(draft.units.length, 2); assert(draft.units[0].path.endsWith("02 第一章.md"));
  await plugin.createBookManifest(draft);
  const manifest = JSON.parse(content.get(`${genericPath}/Assets/Reader/book.json`)); assert.equal(manifest.units.length, 2); assert(manifest.units.every(unit => !unit.markdown));
  manifest.units[0].guidePath = `${genericPath}/Assets/Reader/带读.md`;
  manifest.units[0].guideHeading = "第一章 解说";
  content.set(`${genericPath}/Assets/Reader/book.json`, JSON.stringify(manifest));
  const book = await plugin.readBook(genericPath); assert.equal(book.units.length, 2); assert.equal(book.units[0].segments.filter(segment => segment.type === "e").length, 1);
  assert.equal(book.units[0].guidePath, manifest.units[0].guidePath, "Rescan preserves optional guide metadata");
  assert.equal(book.units[0].guideHeading, manifest.units[0].guideHeading, "Rescan preserves the chapter heading of a shared guide");
  const example = book.units[0].segments.find(segment => segment.type === "e"), target = h.explicitDescriptionRelation(book.units[0], example); assert(target && target.title === "规则");
  assert.equal(h.explicitDescriptionRelation({ segments: [target, { ...target, id: "duplicate" }] }, example), null);
  const metadataExample = { ...example, relation: "" }, metadataUnit = { segments: [target, metadataExample], relations: [{ from: metadataExample.id, to: target.id }] };
  assert.equal(h.explicitDescriptionRelation(metadataUnit, metadataExample).id, target.id);
  assert.deepEqual(h.relationFamily(metadataUnit, target), [target.id, metadataExample.id]);
  assert.equal(h.explicitDescriptionRelation({ ...metadataUnit, relations: [{ from: metadataExample.id, to: "missing" }] }, metadataExample), null);
  assert.equal(h.explicitDescriptionRelation({ ...metadataUnit, relations: [...metadataUnit.relations, ...metadataUnit.relations] }, metadataExample), null);
  assert(!h.spotlightVisible("e", example.id, ["d"], []));
  assert(h.spotlightVisible("d", target.id, ["d"], [target.id]));
  assert(!h.spotlightVisible("d", "other", ["d"], [target.id]));
  const selection = { unit: metadataUnit, currentSegments: metadataUnit.segments, readState: h.normalizeReadState({}), applyAppearance() {}, renderSidebar() {}, persist() {} };
  selection.unit.id = "test-chapter";
  selection.selectedSegmentIds = h.ReaderView.prototype.selectedSegmentIds;
  h.ReaderView.prototype.toggleSegmentSelection.call(selection, target.id);
  h.ReaderView.prototype.toggleSegmentSelection.call(selection, metadataExample.id);
  assert.deepEqual(selection.selectedSegmentIds(), [target.id, metadataExample.id]);
  h.ReaderView.prototype.toggleSegmentSelection.call(selection, target.id); assert.deepEqual(selection.selectedSegmentIds(), [metadataExample.id]);
  h.ReaderView.prototype.selectFamily.call(selection, target); assert.deepEqual(selection.selectedSegmentIds(), [target.id, metadataExample.id]);
  h.ReaderView.prototype.clearSpotlight.call(selection); assert.deepEqual(selection.selectedSegmentIds(), []);
  const appearance = { unit: { id: "appearance" }, readState: h.normalizeReadState({}), clearSpotlightButton: { disabled: true },
    shell: { style: { setProperty() {} }, classList: { toggle() {} } }, containerEl: { classList: { toggle() {} } }, sectionMap: new Map(), selectedSegmentIds: h.ReaderView.prototype.selectedSegmentIds };
  appearance.readState.selectedTypes = ["d"];
  h.ReaderView.prototype.applyAppearance.call(appearance);
  assert.equal(appearance.clearSpotlightButton.disabled, false, "Changing a type filter enables the existing clear button");
  appearance.readState.selectedTypes = [];
  h.ReaderView.prototype.applyAppearance.call(appearance);
  assert.equal(appearance.clearSpotlightButton.disabled, true, "Clearing all filters disables the existing clear button");
  appearance.readState.segmentSelections.appearance = ["selected-paragraph"];
  h.ReaderView.prototype.applyAppearance.call(appearance);
  assert.equal(appearance.clearSpotlightButton.disabled, false, "Paragraph selection also keeps clear enabled");
  const codeConcepts = h.conceptsFromUnit({ id: "literal", segments: [], markdown: "```md\n### 概念提要\n- 伪概念：代码示例。\n```\n\n`code\n### 概念提要\n- 行内伪概念：代码示例。\nend`\n\n### 概念提要\n- 真概念：真实来源定义。\n" });
  assert.deepEqual(codeConcepts.map(concept => concept.term), ["真概念"]);
  for (const markdown of [
    "```md\nliteral\n``` still a code line\n#d 伪知识\n# 伪标题",
    "~~~~md\n~~~\n#e 伪例子\n~~~~",
    "`code\n#d 伪知识\nend`",
    "`code\n#d 伪知识` outside text",
    "``code\n#v 伪检验\nend``",
    "    #d 缩进代码\n    # 代码标题",
    "> ```md\n> #d 引用代码\n> ```"
  ]) {
    const literalUnit = h.liveUnit({ id: "literal-code", segments: [] }, markdown);
    assert.equal(literalUnit.segments.length, 0, "Literal code cannot become paragraph metadata");
    assert.equal(literalUnit.outline.length, 0, "Literal code cannot become an outline heading");
    assert.equal(h.prepareMarkdown(literalUnit).markdown, markdown, "Literal code labels must remain exact source text");
  }
  const mixedLabels = "```md\n#d 代码标签\n``` still a code line\n#e 仍是代码\n```\n\n#d 真实规则\n正文。\n\n# 标题 `代码片段`\n";
  const mixedLabelUnit = h.liveUnit({ id: "mixed-labels", segments: [] }, mixedLabels), preparedLabels = h.prepareMarkdown(mixedLabelUnit);
  assert.deepEqual(mixedLabelUnit.segments.map(segment => segment.type), ["d", "h"]);
  assert.equal(preparedLabels.markers.length, 1);
  assert(preparedLabels.markdown.startsWith("```md\n#d 代码标签\n``` still a code line\n#e 仍是代码\n```"));
  assert(preparedLabels.markdown.includes("# 标题 `代码片段`"), "Inline code inside a real heading stays intact");
  assert.equal(h.parseModevolLine("#s 普通标签"), null); assert.equal(h.parseModevolLine("#q 普通标签"), null); assert.equal(h.parseModevolLine("#v 检验").type, "v");
  assert.equal(book.units[1].pdfStart, null); assert.equal(book.author, "测试材料");
  plugin.stateFor(genericPath).positions[book.units[0].id] = { top: 100, segmentId: target.id, offset: 5 }; assert.equal(plugin.stateFor(fixtureBookPath).positions["01"].top, 2373);
  content.set(draft.units[0].path, content.get(draft.units[0].path) + "\n保存后新增正文。\n");
  assert((await plugin.readBook(genericPath)).units[0].markdown.includes("保存后新增正文。"));
  const oldPath = draft.units[1].path, changedPath = `${genericPath}/03 改名后的第二章.md`, oldUnit = book.units.find(unit => unit.path === oldPath), oldSegment = oldUnit.segments.find(segment => segment.type === "v");
  plugin.stateFor(genericPath).unitId = oldUnit.id;
  plugin.stateFor(genericPath).positions[oldUnit.id] = { top: 321, segmentId: oldSegment.id, offset: 17 };
  content.set(changedPath, content.get(oldPath)); content.delete(oldPath); plugin.sourceModified(mockFile(changedPath), oldPath);
  const renamed = await plugin.readBook(genericPath), renamedUnit = renamed.units.find(unit => unit.path === changedPath);
  assert(renamedUnit); assert(!renamed.units.some(unit => unit.path === oldPath)); assert.equal(renamedUnit.id, oldUnit.id);
  assert.equal(renamedUnit.segments.find(segment => segment.type === "v").id, oldSegment.id);
  assert.equal(plugin.stateFor(genericPath).positions[renamedUnit.id].offset, 17);
  const restoredPlugin = new Reader(); restoredPlugin.app = app; restoredPlugin.queueSave = () => {}; restoredPlugin.libraryData = h.migrateLibraryData(JSON.parse(JSON.stringify(plugin.libraryData)));
  const reloadUnit = (await restoredPlugin.readBook(genericPath)).units.find(unit => unit.path === changedPath);
  assert.equal(reloadUnit.id, oldUnit.id); assert.equal(restoredPlugin.stateFor(genericPath).positions[reloadUnit.id].segmentId, oldSegment.id);
  const staleView = { bookPath: genericPath, plugin, readState: h.normalizeReadState({ sourceUnitIds: { stale: "wrong" } }) };
  h.ReaderView.prototype.persist.call(staleView);
  assert.equal(plugin.stateFor(genericPath).sourceUnitIds[changedPath], oldUnit.id, "View saves preserve latest rename registry");
  const guideBook = h.validBook({ title: "Guide", units: [{ id: "01", path: `${genericPath}/章.md`, guidePath: `${genericPath}/Assets/Reader/带读.md` }] }, genericPath);
  assert.equal(guideBook.units[0].guidePath, `${genericPath}/Assets/Reader/带读.md`);
  assert.throws(() => h.validBook({ units: [{ path: `${genericPath}/章.md`, guidePath: "Other/解说.md" }] }, genericPath), /解说笔记路径/);
  assert.throws(() => h.validBook({ units: [{ path: `${genericPath}/章.md`, guideHeading: "第一章" }] }, genericPath), /解说笔记路径/);
  assert.throws(() => h.validBook({ units: [{ path: `${genericPath}/章.md`, guidePath: `${genericPath}/解说.md`, guideHeading: "第一章\n第二章" }] }, genericPath), /单行/);
  const guideSource = "---\ncssclasses: xuexiguan-annotation\n---\n# 全书解说\n\n## 第一章 解说\n本章编者说明。\n\n### 示例\n本章示例。\n\n```md\n## 第二章 解说\n这是代码。\n```\n\n%%\n## 第二章 解说\n这是隐藏注释。\n%%\n\n## 第二章 解说\n第二章编者说明。\n\n# 附录\n附录说明。\n";
  const firstGuide = h.readGuideSection(guideSource, "第一章 解说"), secondGuide = h.readGuideSection(guideSource, "第二章 解说");
  assert(firstGuide.startsWith("## 第一章 解说\n")); assert(firstGuide.includes("### 示例\n本章示例。")); assert(!firstGuide.includes("第二章编者说明。"));
  assert.equal(secondGuide, "## 第二章 解说\n第二章编者说明。");
  assert.equal(h.readGuideSection(guideSource), h.readGuideSection(guideSource, ""));
  assert(!h.readGuideSection(guideSource).startsWith("---"), "Whole-note legacy guides still strip properties");
  assert.throws(() => h.readGuideSection(guideSource, "不存在"), /找不到本章解说/);
  assert.throws(() => h.readGuideSection(guideSource + "\n## 第一章 解说\n重复节。\n", "第一章 解说"), /解说标题重复/);
  assert.equal(h.readGuideSection("## 第一章 解说 ###\r\n正文。\r\n## 第二章\r\n另章。\r\n", "第一章 解说"), "## 第一章 解说 ###\r\n正文。");
  const authorPrefix = "# 本章\n\n#d 原知识\n原文。\n\n### 概念提要\n- 原概念：原定义。\n\n";
  const appendix = "%% xgr-annotation-start:source-chapter %%\n\n## 解说与批注（编者）\n\n#d 编者例子\n新的示例。\n\n### 概念提要\n- 编者概念：编者定义。\n\n![[全书解说与批注#第一章 解说]]\n";
  const annotated = h.liveUnit({ id: "source-chapter", segments: [] }, authorPrefix + appendix), separated = h.splitAnnotatedMarkdown(annotated.markdown, annotated.id), annotatedPrepared = h.prepareMarkdown(annotated);
  assert.equal(separated.source, authorPrefix, "Splitting annotations preserves every original source character");
  assert.equal(separated.annotation, appendix); assert.equal(annotated.markdown, authorPrefix + appendix, "Read source keeps annotations for continuous Markdown rendering");
  assert.deepEqual(annotated.segments.map(segment => segment.title), ["本章", "原知识", "概念提要"]);
  assert.deepEqual(h.conceptsFromUnit(annotated).map(concept => concept.term), ["原概念"]);
  assert.equal(annotatedPrepared.markers.length, 1); assert(annotatedPrepared.hasAnnotation);
  assert(annotatedPrepared.markdown.includes('class="xgr-annotation-boundary"')); assert(annotatedPrepared.markdown.endsWith(appendix));
  for (const unmarked of ["#s 普通标签\n正文。", "这里包含 %% xgr-annotation-start:source-chapter %% 行内评论。", "%% xgr-annotation-start:another-chapter %%\n", "```md\n%% xgr-annotation-start:source-chapter %%\n```\n正文。", "    %% xgr-annotation-start:source-chapter %%\n", "%%\n%% xgr-annotation-start:source-chapter %%\n隐藏内容。\n%%\n"]) {
    const split = h.splitAnnotatedMarkdown(unmarked, "source-chapter"); assert(!split.boundary); assert.equal(split.source, unmarked, "Unrelated comments, code and ordinary tags cannot truncate a book");
  }
  const crlfPrefix = authorPrefix.replace(/\n/g, "\r\n"), crlfAppendix = appendix.replace(/\n/g, "\r\n");
  assert.equal(h.splitAnnotatedMarkdown(crlfPrefix + crlfAppendix, "source-chapter").source, crlfPrefix);
  const guidePath = `${genericPath}/Assets/Reader/集中解说.md`; content.set(guidePath, guideSource);
  const guideDocument = { createElement: () => new MockElement(guideDocument) }, guideView = new MockComponent();
  Object.assign(guideView, { app, unit: { id: "guide-01", path: `${genericPath}/02 第一章.md`, guidePath, guideHeading: "第一章 解说" }, bookPath: genericPath, guideOpen: true, closed: false, guideGeneration: 0, guidePanel: new MockElement(guideDocument), shell: new MockElement(guideDocument), guideButton: new MockElement(guideDocument), closeGuide() {}, handleReadingClick() {} });
  await h.ReaderView.prototype.renderGuide.call(guideView);
  assert.equal(renderedMarkdown.at(-1).markdown, firstGuide); assert.equal(renderedMarkdown.at(-1).sourcePath, guidePath);
  guideView.guideScroll.scrollTop = 417;
  await h.ReaderView.prototype.renderGuide.call(guideView); assert.equal(guideView.guideScroll.scrollTop, 417, "Refreshing the same guide keeps its scroll position");
  guideView.unit = { ...guideView.unit, id: "guide-02", guideHeading: "第二章 解说" };
  await h.ReaderView.prototype.renderGuide.call(guideView); assert.equal(guideView.guideScroll.scrollTop, 0, "Another chapter starts at its own guide heading"); assert.equal(renderedMarkdown.at(-1).markdown, secondGuide);
  // A tiny DOM double covers the actual grouping boundary. The last source
  // segment must stop even when MarkdownRenderer wraps the separator in el-div.
  class GroupNode {
    constructor(tag = "div", text = "", className = "") {
      this.tag = tag; this.textContent = text; this.className = className; this.children = []; this.parentElement = null; this.nodeType = 1; this.dataset = {}; this.ownerDocument = groupDocument; this.style = { setProperty() {} }; this.attributes = new Map();
      this.classList = { contains: name => this.className.split(/\s+/).includes(name), add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; }, remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(" "); }, toggle: (name, enabled) => { const add = enabled === undefined ? !this.classList.contains(name) : enabled; this.classList[add ? "add" : "remove"](name); } };
    }
    appendChild(child) { child.remove(); this.children.push(child); child.parentElement = this; return child; }
    insertBefore(child, reference) { child.remove(); this.children.splice(this.children.indexOf(reference), 0, child); child.parentElement = this; }
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
    get nextSibling() { return this.parentElement ? this.parentElement.children[this.parentElement.children.indexOf(this) + 1] || null : null; }
    matches(selector) { return selector.split(",").some(part => part.trim().startsWith(".") ? this.className.split(/\s+/).includes(part.trim().slice(1)) : part.trim() === this.tag || part.trim() === `${this.tag}.${this.className}`); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    replaceChildren() { this.children.forEach(child => child.parentElement = null); this.children = []; this.textContent = ""; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    addEventListener() {} removeEventListener() {}
    compareDocumentPosition() { return 4; }
  }
  const groupDocument = { createElement: tag => new GroupNode(tag) };
  for (const wrapped of [false, true]) {
    const groupArticle = new GroupNode("article"), markerNode = new GroupNode("h6", "XGRSEG000000"), sourceParagraph = new GroupNode("p", "最后的原文段落。"), divider = new GroupNode("div", "", "xgr-annotation-boundary"), annotationParagraph = new GroupNode("p", "编者批注正文。");
    groupArticle.appendChild(markerNode); groupArticle.appendChild(sourceParagraph);
    if (wrapped) { const wrapper = new GroupNode("div", "", "el-div"); wrapper.appendChild(divider); groupArticle.appendChild(wrapper); } else groupArticle.appendChild(divider);
    groupArticle.appendChild(annotationParagraph);
    const segment = { id: "last-source", type: "c", title: "原文说明", tagName: "说明", marker: "XGRSEG000000" };
    const groupView = { article: groupArticle, unit: { segments: [segment], pdfStart: null }, sectionMap: new Map(), originalPagePath: () => null, openOriginalPage() {}, readState: h.normalizeReadState({}), goToSegment() {}, toggleSegmentSelection() {} };
    h.ReaderView.prototype.groupSegments.call(groupView, { markers: [segment], supplied: [] });
    const groupedSource = groupView.sectionMap.get(segment.id);
    assert(groupedSource.querySelectorAll("p").includes(sourceParagraph));
    assert(!groupedSource.querySelectorAll("p").includes(annotationParagraph), "Compiler annotations remain outside source sections, including names-only/spotlight modes");
    assert.equal(annotationParagraph.parentElement, groupArticle);
  }
  // Native Markdown rendering is asynchronous and can write intermediate h6
  // markers before it finishes. Exercise the real chapter/guide lifecycle with
  // independently delayed file reads, renderer completions and caption checks.
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const settleTurns = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  const treeText = element => `${element.textContent || ""}${element.children.map(treeText).join("")}`;
  const loadingGuidePath = `${genericPath}/延迟测试解说.md`;
  const loadingUnits = ["load-a", "load-b"].map((id, index) => ({ id, title: index ? "第二测试章" : "第一测试章", path: `${genericPath}/${id}.md`, guidePath: loadingGuidePath, guideHeading: index ? "第二章 解说" : "第一章 解说" }));
  loadingUnits.forEach(unit => content.set(unit.path, `#d ${unit.title}规则\n${unit.title}的原文。\n`));
  content.set(loadingGuidePath, guideSource);
  const unitReadDelays = new Map(), renderDelays = new Map(), captionDelays = new Map(); let guideReadDelay = null;
  const loadingApp = { ...app, vault: { ...vault, read: async file => { const delay = guideReadDelay; if (file.path === loadingGuidePath && delay) await delay.promise; return content.get(file.path); } } };
  const makeLoadingView = () => {
    const state = h.normalizeReadState({});
    const loadingPlugin = { libraryData: { activeBook: genericPath }, stateFor: () => state, queueSave() {}, flushSave: async () => {}, readUnit: async metadata => { const delay = unitReadDelays.get(metadata.id); if (delay) await delay.promise; return h.liveUnit(metadata, content.get(metadata.path)); } };
    const view = new h.ReaderView({ app: loadingApp }, loadingPlugin);
    view.book = h.validBook({ title: "延迟渲染测试", units: loadingUnits }, genericPath); view.bookPath = genericPath;
    view.contentEl = new GroupNode(); view.shell = view.contentEl.appendChild(new GroupNode());
    view.applyAppearance = () => {}; view.renderSidebar = () => {}; view.persist = () => {}; view.capturePosition = () => {};
    view.buildInterface();
    view.suppressDuplicatedFigureCaptions = async function (...args) { const delay = captionDelays.get(this.unit.id); if (delay) await delay.promise; return h.ReaderView.prototype.suppressDuplicatedFigureCaptions.call(this, ...args); };
    const group = view.groupSegments;
    view.groupSegments = function (prepared) { assert.equal(this.article.style.visibility, "hidden", "Raw headings must remain concealed while actual source grouping runs"); return group.call(this, prepared); };
    return view;
  };
  markdownRenderHook = async (app, markdown, article, sourcePath) => {
    if (sourcePath === loadingGuidePath) article.textContent = markdown;
    else {
      for (const marker of markdown.matchAll(/^###### (XGRSEG\d{6})$/gm)) article.appendChild(new GroupNode("h6", marker[1]));
      article.appendChild(new GroupNode("p", "已写入但尚未完成的正文。"));
    }
    const delay = renderDelays.get(sourcePath); if (delay) await delay.promise;
  };
  try {
    const loadingView = makeLoadingView(); loadingView.guideOpen = true;
    loadingView.guidePanel.appendChild(new GroupNode("p", "旧章节解说"));
    const unitRead = deferred(), sourceRender = deferred(), captionCheck = deferred();
    unitReadDelays.set("load-a", unitRead); renderDelays.set(loadingUnits[0].path, sourceRender); captionDelays.set("load-a", captionCheck);
    const opening = loadingView.openUnit("load-a", false);
    assert.equal(loadingView.scrollEl.attributes.get("aria-busy"), "true");
    assert.equal(loadingView.article.style.visibility, "hidden");
    assert(!treeText(loadingView.guidePanel).includes("旧章节解说"), "Selecting a chapter immediately removes the previous chapter's guide, before its file read finishes");
    assert(treeText(loadingView.guidePanel).includes("正在载入本章解说"));
    unitRead.resolve(); await settleTurns();
    assert(treeText(loadingView.article).includes("XGRSEG000000"), "The delayed renderer really has written an intermediate raw segment heading");
    assert.equal(loadingView.article.style.visibility, "hidden", "Intermediate marker text cannot flash during MarkdownRenderer's pending promise");
    assert.equal(loadingView.article.attributes.get("aria-hidden"), "true");
    sourceRender.resolve(); await settleTurns();
    assert.equal(loadingView.article.style.visibility, "hidden", "Asynchronous source-caption validation also completes before source text is exposed");
    captionCheck.resolve(); await opening;
    assert.equal(loadingView.article.style.visibility, ""); assert.equal(loadingView.article.attributes.get("aria-hidden"), "false");
    assert.equal(loadingView.scrollEl.attributes.get("aria-busy"), "false"); assert.equal(loadingView.rendering, false);
    assert(!treeText(loadingView.article).includes("XGRSEG000000"), "Actual groupSegments replaces the temporary marker before revealing the article");
    assert(treeText(loadingView.guidePanel).includes("本章编者说明。"));
    unitReadDelays.clear(); renderDelays.clear(); captionDelays.clear();

    const staleRead = deferred(); guideReadDelay = staleRead;
    const olderGuide = loadingView.renderGuide(); const oldGuideComponent = loadingView.guideComponent;
    const nextRead = deferred(); unitReadDelays.set("load-b", nextRead);
    const nextOpening = loadingView.openUnit("load-b", false);
    const guideGeneration = loadingView.guideGeneration, renderedBefore = renderedMarkdown.length;
    staleRead.resolve(); await olderGuide;
    assert.equal(renderedMarkdown.length, renderedBefore, "A stale guide file read is cancelled before rendering or extracting a different chapter's heading");
    assert.equal(oldGuideComponent.domEvents.length, 0, "Replacing the guide also unloads its old click handler");
    assert.equal(loadingView.guideGeneration, guideGeneration); assert(treeText(loadingView.guidePanel).includes("第二测试章"));
    guideReadDelay = null; nextRead.resolve(); await nextOpening; unitReadDelays.clear();
    assert(treeText(loadingView.guidePanel).includes("第二章编者说明。")); assert(!treeText(loadingView.guidePanel).includes("本章编者说明。"));

    for (const lateFailure of [false, true]) {
      const oldRender = deferred(); renderDelays.set(loadingUnits[0].path, oldRender);
      const oldOpening = loadingView.openUnit("load-a", false); await settleTurns();
      const oldArticle = loadingView.article;
      const newestOpening = loadingView.openUnit("load-b", false); await newestOpening;
      const newestArticle = loadingView.article, newestGuide = loadingView.guideScroll;
      if (lateFailure) oldRender.reject(new Error("旧章延迟渲染失败")); else oldRender.resolve();
      await oldOpening;
      assert.equal(loadingView.article, newestArticle); assert.equal(loadingView.guideScroll, newestGuide);
      assert.equal(loadingView.unit.id, "load-b"); assert.equal(loadingView.rendering, false);
      assert.equal(oldArticle.style.visibility, "hidden", "A superseded renderer can finish or fail only in its detached, concealed article");
      assert.equal(newestArticle.style.visibility, ""); assert.equal(loadingView.scrollEl.attributes.get("aria-busy"), "false");
      assert(!treeText(newestArticle).includes("旧章延迟渲染失败")); renderDelays.clear();
    }

    // Late guide rendering likewise holds only its own article/component.
    const oldGuideRender = deferred(); renderDelays.set(loadingGuidePath, oldGuideRender);
    const olderRenderedGuide = loadingView.renderGuide(); await settleTurns();
    const oldGuideArticle = renderedMarkdown.at(-1).article;
    renderDelays.delete(loadingGuidePath);
    await loadingView.openUnit("load-a", false);
    const currentGuide = loadingView.guideScroll; oldGuideRender.resolve(); await olderRenderedGuide;
    assert.equal(loadingView.guideScroll, currentGuide); assert.equal(oldGuideArticle.style.visibility, "hidden");
    assert(treeText(loadingView.guidePanel).includes("本章编者说明。"));
    assert.equal(loadingView.guidePanel.attributes.get("aria-busy"), "false");

    loadingView.scrollEl.isConnected = true; loadingView.scrollEl.getBoundingClientRect = () => ({ top: 0, width: 500, height: 300 }); loadingView.nearestSegment = () => null;
    const errorBookmark = { top: 900, segmentId: "bookmarked-segment", offset: 13 };
    loadingView.plugin.stateFor(genericPath).positions["load-b"] = { ...errorBookmark };
    for (const stage of ["read", "render", "caption"]) {
      const failure = deferred();
      const delays = stage === "read" ? unitReadDelays : stage === "render" ? renderDelays : captionDelays;
      delays.set(stage === "render" ? loadingUnits[1].path : "load-b", failure);
      const failedOpening = loadingView.openUnit("load-b", false); await settleTurns(); failure.reject(new Error(`${stage}故障`)); await failedOpening;
      assert.equal(loadingView.article.style.visibility, ""); assert.equal(loadingView.scrollEl.attributes.get("aria-busy"), "false");
      assert.equal(loadingView.rendering, false); assert.equal(loadingView.pendingUnit, null);
      assert(treeText(loadingView.article).includes(`${stage}故障`)); assert(treeText(loadingView.article).includes("重试"));
      assert(!treeText(loadingView.article).includes("XGRSEG000000")); assert(!treeText(loadingView.guidePanel).includes("正在载入"));
      h.ReaderView.prototype.capturePosition.call(loadingView);
      assert.deepEqual(loadingView.plugin.stateFor(genericPath).positions["load-b"], errorBookmark, "An error page is not a readable chapter position and cannot overwrite its previous bookmark");
      assert.equal(loadingView.guidePanel.attributes.get("aria-busy"), "false"); delays.clear();
    }
    await loadingView.openUnit("load-a", false);
    loadingView.scrollEl.scrollTop = 241; h.ReaderView.prototype.capturePosition.call(loadingView);
    assert.equal(loadingView.plugin.stateFor(genericPath).positions["load-a"].top, 241, "A successful subsequent chapter clears the error guard and captures reading positions normally");
    const guideFailure = deferred(); renderDelays.set(loadingGuidePath, guideFailure);
    const failingGuide = loadingView.renderGuide(); await settleTurns(); guideFailure.reject(new Error("解说渲染故障")); await failingGuide;
    const errorGuide = renderedMarkdown.at(-1).article;
    assert.equal(errorGuide.style.visibility, ""); assert(treeText(errorGuide).includes("解说渲染故障"));
    assert.equal(loadingView.guidePanel.attributes.get("aria-busy"), "false"); renderDelays.clear();

    const closingGuideDelay = deferred(); renderDelays.set(loadingGuidePath, closingGuideDelay);
    const closingGuide = loadingView.renderGuide(); await settleTurns(); loadingView.closeGuide(); closingGuideDelay.resolve(); await closingGuide;
    assert.equal(loadingView.guidePanel.hidden, true); assert.equal(loadingView.guidePanel.children.length, 0);
    assert.equal(loadingView.guidePanel.attributes.get("aria-busy"), "false"); renderDelays.clear();
    const closingRender = deferred(); renderDelays.set(loadingUnits[1].path, closingRender);
    const closingChapter = loadingView.openUnit("load-b", false); await settleTurns(); const closingArticle = loadingView.article;
    await loadingView.onClose(); closingRender.resolve(); await closingChapter;
    assert.equal(loadingView.contentEl.children.length, 0); assert.equal(loadingView.closed, true); assert.equal(loadingView.rendering, false);
    assert.equal(closingArticle.style.visibility, "hidden", "Closing a native leaf cannot expose delayed renderer content afterwards");
  } finally { markdownRenderHook = null; guideReadDelay = null; unitReadDelays.clear(); renderDelays.clear(); captionDelays.clear(); }
  const imagePath = `${genericPath}/Assets/Figures/demo.png`; content.set(imagePath, "image");
  const sized = h.rewriteImageEmbeds(`![[${imagePath}|240x120]]`, app, renamed.units[0].path, genericPath); assert(sized.includes('width="240"') && sized.includes('height="120"'));
  const sizedWidth = h.rewriteImageEmbeds(`![[${imagePath}|240]]`, app, renamed.units[0].path, genericPath); assert(sizedWidth.includes('width="240"') && sizedWidth.includes("height:auto"));
  const literalImage = `![[${imagePath}|240x120]]`;
  for (const example of [
    "```markdown\n" + literalImage + "\n```",
    "~~~~ markdown\n" + literalImage + "\n~~~\n" + literalImage + "\n~~~~",
    "`" + literalImage + "`",
    "``some ` text " + literalImage + " more``",
    "`a\n" + literalImage + "\nb`",
    "    " + literalImage,
    "\\" + literalImage,
    "> ```md\n> " + literalImage + "\n> ```",
    "```md\n" + literalImage + "\n``` still a code line\n" + literalImage,
    "~~~md\n" + literalImage
  ]) assert.equal(h.rewriteImageEmbeds(example, app, renamed.units[0].path, genericPath), example, "Code/escaped image syntax must stay literal");
  const mixedImages = "```md\n" + literalImage + "\n```\n\n" + literalImage + " and `" + literalImage + "`";
  const rewrittenMixed = h.rewriteImageEmbeds(mixedImages, app, renamed.units[0].path, genericPath);
  assert(rewrittenMixed.startsWith("```md\n" + literalImage + "\n```"));
  assert(rewrittenMixed.endsWith(" and `" + literalImage + "`"));
  assert.equal((rewrittenMixed.match(/<img /g) || []).length, 1, "Only the prose embed becomes an image");
  const ea = mockEA(), map = await h.createBookIndex(ea, renamed); assert.equal(map.units, 2); assert.equal(map.cards.length, 2); assert(map.path.startsWith(genericPath));
  const scene = JSON.parse(content.get(map.path)); assert.equal(scene.elements.filter(e => e.type === "rectangle").length, 2); assert(scene.elements.filter(e => e.link).every(e => /^\[.*\]\(/.test(e.link)));
  await assert.rejects(() => h.createBookIndex(ea, renamed), /已有全书目录/);
  const layoutPath = "_ReaderRegression/分部布局", layoutIds = ["preface", "section-a", "alpha", "beta", "section-b", "gamma", "delta", "epsilon", "section-c", "zeta"];
  const layoutUnits = layoutIds.map(id => ({ id, path: `${layoutPath}/${id}.md`, title: id === "alpha" ? "用于检验长章节标题换行后卡片仍能容纳文字且不会覆盖下一行的原创章节标题" : id, pdfStart: id === "preface" ? 1 : 11, pdfEnd: id === "preface" ? 10 : 12 }));
  layoutUnits.forEach(unit => content.set(unit.path, `# ${unit.title}\n原创目录测试。`));
  const overviewLayout = { front: ["preface"], sections: [{ unitId: "section-a", units: ["alpha", "beta"] }, { unitId: "section-b", units: ["gamma", "delta", "epsilon"] }, { unitId: "section-c", units: ["zeta"] }] };
  const layoutManifest = { bookPath: layoutPath, title: "原创三分部目录", units: layoutUnits, printPageOffset: 10, overviewLayout, drawingFontFamily: 4 };
  const layoutBook = h.validBook(layoutManifest), layoutEA = mockEA(), layoutMap = await h.createBookIndex(layoutEA, layoutBook);
  assert.equal(layoutMap.units, 10); assert.equal(layoutMap.chapters, 6); assert.deepEqual(layoutMap.originalOrder, layoutIds);
  const layoutScene = JSON.parse(content.get(layoutMap.path)), rectangles = layoutScene.elements.filter(item => item.type === "rectangle");
  assert.equal(rectangles.length, 10); assert(layoutEA.fontFamilies.every(family => family === 4));
  assert(layoutScene.elements.some(item => item.text === "PDF 第11—12页　·　书页 1—2"));
  assert(layoutScene.elements.some(item => item.text === "PDF 第1—10页"));
  for (let index = 0; index < rectangles.length; index++) for (let next = index + 1; next < rectangles.length; next++) {
    const a = rectangles[index], b = rectangles[next];
    assert(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), "Configured section cards must not overlap");
  }
  for (const card of layoutMap.cards) {
    const [rect, heading] = card.elementIds.map(id => layoutScene.elements.find(item => item.id === id));
    assert(heading.width <= rect.width - 36 && heading.height <= rect.height - 48, "Wrapped headings must fit their original card");
  }
  assert.equal(h.validBook(fixtureManifest).printPageOffset, null); assert.equal(h.validBook(fixtureManifest).overviewLayout, null);
  assert.equal(h.validBook({ ...fixtureManifest, printPageOffset: 0 }).printPageOffset, 0);
  assert.throws(() => h.validBook({ ...layoutManifest, printPageOffset: 1.5 }), /偏移量应为整数/);
  assert.throws(() => h.validBook({ ...layoutManifest, printPageOffset: "10" }), /偏移量应为整数/);
  assert.throws(() => h.validBook({ ...layoutManifest, overviewLayout: { ...overviewLayout, front: ["unknown"] } }), /未知或重复/);
  assert.throws(() => h.validBook({ ...layoutManifest, overviewLayout: { ...overviewLayout, front: ["alpha", "preface"] } }), /未知或重复/);
  assert.throws(() => h.validBook({ ...layoutManifest, overviewLayout: { ...overviewLayout, front: [] } }), /每个阅读单元一次/);
  assert.throws(() => h.validBook({ ...layoutManifest, overviewLayout: { sections: [{ unitId: "section-a", units: [] }] } }), /至少一个正文单元/);
  assert.throws(() => h.validBook({ ...layoutManifest, overviewLayout: { sections: [] } }), /sections 数组/);
  const element = top => ({ getBoundingClientRect: () => ({ top }) }); const segments = new Map([["paragraph", element(122)], ["header-added-last", element(-2245)]]); assert.equal(h.closestVisibleSegment(segments, 142).id, "paragraph");
  assert.equal(h.standaloneFigureCaption("如图17-4"), null); assert.equal(h.standaloneFigureCaption("图1-1说明的是……"), null);
  const auditBytes = Buffer.from("original demo diagram"), auditHash = await h.binarySha256(auditBytes);
  const captionFilename = "demo.png", captionFilePath = `${genericPath}/Assets/Figures/${captionFilename}`;
  const auditedBook = h.validBook({ ...fixtureManifest, bookPath: genericPath, units: [{ id: "audit", path: `${genericPath}/章.md` }], figureCaptionAudits: { [captionFilename]: { sha256: auditHash.toUpperCase(), figures: ["1-1", "1-1"] } } });
  assert.deepEqual(auditedBook.figureCaptionAudits[captionFilename], { sha256: auditHash, figures: ["1-1"] });
  const getAuditImage = source => ({ getAttribute: () => source });
  assert.equal(h.auditedFigureImage(getAuditImage(`app://local/${captionFilePath}`), genericPath, auditedBook.figureCaptionAudits).filename, captionFilename);
  assert.equal(h.auditedFigureImage(getAuditImage(`app://local/${captionFilePath}`), genericPath), null, "There is no embedded book-specific figure audit");
  assert.equal(h.auditedFigureImage(getAuditImage(`app://local/Other/Assets/Figures/${captionFilename}`), genericPath, auditedBook.figureCaptionAudits), null);
  for (const record of [{ sha256: "invalid", figures: ["1-1"] }, { sha256: auditHash, figures: [] }, { sha256: auditHash, figures: ["a caption sentence"] }]) {
    assert.throws(() => h.validBook({ ...auditedBook, figureCaptionAudits: { [captionFilename]: record } }), /图注审核记录无效/);
  }
  assert.throws(() => h.validBook({ ...auditedBook, figureCaptionAudits: { "../demo.png": { sha256: auditHash, figures: ["1-1"] } } }), /图注审核记录无效/);
  assert.throws(() => h.validBook({ ...auditedBook, figureCaptionAudits: [] }), /图注审核配置/);
  let binaryReads = 0, sourceBytes = auditBytes, sourceMtime = 1;
  const cropPlugin = new Reader(); cropPlugin.captionCropChecks = new Map();
  cropPlugin.app = { vault: { getAbstractFileByPath: requested => requested === captionFilePath ? { path: requested, stat: { mtime: sourceMtime, size: sourceBytes.length } } : null, readBinary: async () => { binaryReads++; return sourceBytes; } } };
  assert(await cropPlugin.matchesAuditedCaptionCrop(genericPath, captionFilename, auditHash));
  assert(await cropPlugin.matchesAuditedCaptionCrop(genericPath, captionFilename, auditHash)); assert.equal(binaryReads, 1, "Unchanged audited crop bytes can share one verification");
  sourceBytes = Buffer.from("modified demo diagram"); sourceMtime++;
  assert(!await cropPlugin.matchesAuditedCaptionCrop(genericPath, captionFilename, auditHash), "Changed crop bytes keep the original Markdown caption visible");
  assert(!await cropPlugin.matchesAuditedCaptionCrop(genericPath, "missing.png", auditHash));
  let captionHidden = false;
  const captionParagraph = { textContent: "图1-1", matches: selector => selector === "p", querySelector: () => null, classList: { add: name => { if (name === "xgr-duplicate-caption") captionHidden = true; } } };
  const captionArticle = { dataset: {}, querySelectorAll: () => [captionImage] };
  const imageBlock = { textContent: "", parentElement: captionArticle, querySelectorAll: () => [captionImage], nextElementSibling: captionParagraph };
  const captionImage = { getAttribute: () => `app://local/${captionFilePath}`, closest: selector => selector === "p" ? imageBlock : null };
  const captionView = { bookPath: genericPath, book: auditedBook, article: captionArticle, plugin: cropPlugin };
  await h.ReaderView.prototype.suppressDuplicatedFigureCaptions.call(captionView); assert(!captionHidden); assert.equal(captionArticle.dataset.suppressedFigureCaptions, "0");
  sourceBytes = auditBytes; sourceMtime++;
  await h.ReaderView.prototype.suppressDuplicatedFigureCaptions.call(captionView); assert(captionHidden); assert.equal(captionArticle.dataset.suppressedFigureCaptions, "1", "Only an exact standalone audited image caption is visually suppressed");
  const bookmark = { top: 2279, segmentId: "image-segment", offset: -21.6 };
  const positionState = { positions: { chapter: { ...bookmark } } };
  const positionView = { unit: { id: "chapter" }, bookPath: "example", plugin: { stateFor: () => positionState },
    scrollEl: { isConnected: false, scrollTop: 0, getBoundingClientRect: () => ({ top: 0, width: 0, height: 0 }) },
    nearestSegment: () => ({ id: "first-rule", element: { getBoundingClientRect: () => ({ top: 0 }) } }) };
  h.ReaderView.prototype.capturePosition.call(positionView);
  assert.deepEqual(positionState.positions.chapter, bookmark, "Closing a detached reader must not replace a real bookmark with zero geometry");
  positionView.scrollEl.isConnected = true;
  h.ReaderView.prototype.capturePosition.call(positionView);
  assert.deepEqual(positionState.positions.chapter, bookmark, "Hidden zero-size readers must preserve bookmarks during source changes");
  h.ReaderView.prototype.restoreReadingPosition.call(positionView, bookmark);
  assert.deepEqual(positionView.pendingRestorePosition, bookmark, "Restoration waits until the native leaf has usable layout");
  positionView.scrollEl.getBoundingClientRect = () => ({ top: 20, width: 464, height: 300 });
  positionView.scrollEl.scrollTop = 2279; positionView.pendingRestorePosition = null;
  positionView.nearestSegment = () => ({ id: "image-segment", element: { getBoundingClientRect: () => ({ top: 41.6 }) } });
  h.ReaderView.prototype.capturePosition.call(positionView);
  assert.equal(positionState.positions.chapter.segmentId, "image-segment");
  assert.equal(positionState.positions.chapter.top, 2279);
  const oldBookmark = { top: 900, segmentId: "old-bookmark", offset: 0 };
  const explicitState = { positions: { chapter: { ...oldBookmark } } };
  let readerVisible = false;
  const explicitScroll = { isConnected: true, scrollTop: 0, getBoundingClientRect: () => ({ top: 0, width: readerVisible ? 464 : 0, height: readerVisible ? 300 : 0 }) };
  const explicitTarget = { getBoundingClientRect: () => ({ top: readerVisible ? 500 - explicitScroll.scrollTop : 0 }), classList: { add() {}, remove() {} } };
  const explicitView = { unit: { id: "chapter" }, bookPath: "example", plugin: { stateFor: () => explicitState }, scrollEl: explicitScroll,
    sectionMap: new Map([["requested-paragraph", explicitTarget]]), applyAppearance() {}, persist() {}, highlightCurrentSegment() {},
    nearestSegment: () => ({ id: "requested-paragraph", element: explicitTarget }),
    capturePosition: h.ReaderView.prototype.capturePosition, restoreReadingPosition: h.ReaderView.prototype.restoreReadingPosition, goToSegment: h.ReaderView.prototype.goToSegment };
  h.ReaderView.prototype.goToSegment.call(explicitView, "requested-paragraph");
  assert.equal(explicitScroll.scrollTop, 0, "An explicit link must wait for native layout rather than use hidden geometry");
  assert.deepEqual(explicitState.positions.chapter, oldBookmark, "A hidden explicit link preserves the prior bookmark until the destination can be positioned");
  readerVisible = true;
  h.ReaderView.prototype.resumeReading.call(explicitView);
  assert.equal(explicitScroll.scrollTop, 478, "Activating a hidden reader follows the requested paragraph instead of the prior bookmark");
  assert.equal(explicitState.positions.chapter.segmentId, "requested-paragraph");
  h.ReaderView.prototype.resumeReading.call(explicitView);
  assert.equal(explicitScroll.scrollTop, 478, "Repeated native activation must not undo an explicit destination");
  clearTimeout(explicitView.restoreTimer);
  explicitView.restoreReadingPosition(oldBookmark);
  explicitScroll.scrollTop = 10;
  explicitView.goToSegment("requested-paragraph");
  assert.equal(explicitScroll.scrollTop, 478, "An explicit destination supersedes an in-flight bookmark restore");
  assert.equal(explicitView.restoring, false, "The older restore timer cannot later capture over the explicit destination");
  clearTimeout(explicitView.restoreTimer);
  const document = { createElement: () => new MockElement(document) };
  const lifecycleView = new h.ReaderView({ app }, plugin); lifecycleView.book = book; lifecycleView.bookPath = genericPath; lifecycleView.shell = new MockElement(document);
  lifecycleView.applyAppearance = () => {}; let capturesFromInterface = 0; lifecycleView.capturePosition = () => { capturesFromInterface++; }; lifecycleView.persist = () => {}; lifecycleView.highlightCurrentSegment = () => {};
  lifecycleView.buildInterface(); const detachedScroll = lifecycleView.scrollEl;
  detachedScroll.dispatch("scroll");
  lifecycleView.shell.replaceChildren(); lifecycleView.buildInterface();
  detachedScroll.dispatch("scroll");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(capturesFromInterface, 0, "Replacing the book interface releases old scroll handlers so detached content cannot mutate current reading state");
  lifecycleView.scrollEl.dispatch("scroll");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(capturesFromInterface, 1, "The replacement interface retains exactly one functioning scroll handler");
  lifecycleView.unload();
  for (const switchingBook of [false, true]) {
    const activationOrder = []; let visibleForRender = false, releaseVisibility;
    const visibility = new Promise(resolve => { releaseVisibility = resolve; });
    const activationView = new h.ReaderView({ app }, plugin);
    activationView.book = book; activationView.bookPath = switchingBook ? "Other/旧书" : genericPath; activationView.resumeReading = () => {};
    const renderWhenVisible = async (method, args) => {
      activationOrder.push(method);
      if (!visibleForRender) await visibility;
      assert.deepEqual(args, switchingBook ? [genericPath, "requested-chapter", "requested-segment"] : ["requested-chapter", true, "requested-segment"]);
      activationOrder.push("renderDone");
    };
    activationView.openUnit = (...args) => renderWhenVisible("openUnit", args);
    activationView.switchBook = (...args) => renderWhenVisible("switchBook", args);
    const activationLeaf = { view: activationView };
    const activationPlugin = new Reader(); activationPlugin.libraryData = h.migrateLibraryData({}); activationPlugin.queueSave = () => {};
    activationPlugin.app = { ...app, workspace: { getLeavesOfType: () => [activationLeaf], revealLeaf: async leaf => { assert.equal(leaf, activationLeaf); activationOrder.push("reveal"); visibleForRender = true; releaseVisibility(); } } };
    const activation = activationPlugin.openReader("requested-chapter", "requested-segment", genericPath);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    try { assert.equal(activationOrder[0], "reveal", "Existing hidden reader leaves must become visible before chapter or book rendering starts"); }
    finally { releaseVisibility(); }
    await activation;
    assert.deepEqual(activationOrder, ["reveal", switchingBook ? "switchBook" : "openUnit", "renderDone"], "Rendering can finish without the user manually clicking the reader tab");
  }
  const readerCSS = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert(!/xgr-leaf-focus|body:has|\.workspace:has/.test(readerCSS), "Reader CSS must not hide native workspace chrome");
  assert(readerCSS.includes("@container xgr-reader"), "Narrow native leaves need content-width layout rather than viewport-only layout");
  assert(readerCSS.includes('"KaiTi", "STKaiti", "楷体", serif'), "Reader and marked notes use the requested installed regular-script font");
  assert(!/Microsoft YaHei|Segoe UI|PingFang SC|Noto Sans/.test(readerCSS), "No prior sans-serif font overrides remain on book content");
  assert(readerCSS.includes(".markdown-preview-view.xuexiguan-book") && readerCSS.includes(".markdown-source-view.xuexiguan-book .cm-content"), "Regular-script note typography is opt-in on both native reading and editing surfaces");
  assert(!fs.readFileSync(pluginPath, "utf8").includes("xgr-leaf-focus"), "Reader lifecycle must not manipulate global focus chrome");
  assert(!fs.readFileSync(pluginPath, "utf8").includes('require("./create-map")'));
  const bootPlugin = new Reader(), commands = [], protocols = new Map();
  bootPlugin.app = { ...app, vault: { ...vault, on: () => ({}) }, workspace: { ...app.workspace, on: () => ({}) } };
  bootPlugin.loadData = async () => ({ schema: 2, activeBook: fixtureBookPath, books: { [fixtureBookPath]: saved.books[fixtureBookPath] } });
  bootPlugin.registerView = () => {}; bootPlugin.addRibbonIcon = () => {}; bootPlugin.addCommand = command => commands.push(command); bootPlugin.registerEvent = () => {}; bootPlugin.registerObsidianProtocolHandler = (name, callback) => protocols.set(name, callback);
  await bootPlugin.onload(); assert.equal(bootPlugin.libraryData.activeBook, fixtureBookPath);
  let protocolArgs = null; bootPlugin.openReader = (...args) => protocolArgs = args;
  protocols.get("xuexiguan-reader")({ unit: "01", segment: "01-s0012" }); assert.deepEqual(protocolArgs, ["01", "01-s0012", fixtureBookPath]);
  protocols.get("jiangou-reader")({ book: genericPath, unitId: "custom", segmentId: "paragraph" }); assert.deepEqual(protocolArgs, ["custom", "paragraph", genericPath]);
  protocols.get("jiangou-reader")({ vault: "different vault", book: fixtureBookPath }); assert.deepEqual(protocolArgs, ["custom", "paragraph", genericPath]);
  const runtimeText = fs.readFileSync(pluginPath, "utf8");
  assert(!/Northwestern|README_FIRST_|figure-page-\d{4}|AUDITED_FIGURE_CAPTIONS|BOOK_PATH/.test(runtimeText), "Public and deployed source contain no embedded private book path or audit table");
  assert.equal(commands.find(command => command.id === "open-book").name, "阅读当前书籍");
  console.log(JSON.stringify({ fixtureUnits: currentUnits.length, fixtureConcepts: 2, fixtureMaterialCounts: count, legacyBookmarkMigration: "pass", emptyLibraryShelf: "pass", priorActiveBookRetained: "pass", protocolAliasesAndVaultScope: "pass", manifestFigureAuditSafety: "pass", exactUnchangedCropCaptionOnly: "pass", genericUnits: 2, naturalAndFrontmatterOrder: "pass", metadataOnlyManifest: "pass", noPDFRequired: "pass", liveSavedEdit: "pass", liveSourceRename: "pass", renameBookmarkContinuityAfterReload: "pass", perBookStateIsolation: "pass", explicitUniqueRelation: "pass", exactRelationMetadata: "pass", ambiguousRelationNotLinked: "pass", paragraphMultiselectAndFamily: "pass", typeAndParagraphSpotlightIndependent: "pass", safeOptionalGuidePath: "pass", guideHeadingPathAndSingleLineValidation: "pass", exactSharedGuideHeadingAndNestedSection: "pass", guideMissingOrDuplicateHeadingReported: "pass", guideCodeAndCommentHeadingsIgnored: "pass", guideRenderSectionAndPerChapterScroll: "pass", continuousAnnotationsExcludedFromSourceIndexes: "pass", originalPrefixAndCRLFPreserved: "pass", ordinaryMarkdownNeverTruncated: "pass", annotationOutsideSourceDOMGroups: "pass", delayedSourceMarkersConcealedUntilGrouped: "pass", guideClearedAtChapterSelection: "pass", staleSourceAndGuideGenerationsCancelled: "pass", sourceReadRenderAndCaptionErrorsReleased: "pass", failedChapterBookmarkPreserved: "pass", guideErrorAndCloseDuringRender: "pass", nativeLeafCloseDuringRender: "pass", scopedRegularScriptTypography: "pass", actualVSupported: "pass", customSQPreserved: "pass", imageDimensions: "pass", codeLiteralImageSyntax: "pass", codeConceptsExcluded: "pass", genericNativeEAScript: "pass", existingMapNotOverwritten: "pass", bookmarkGeometry: "pass", hiddenExplicitSegmentPriority: "pass", interfaceListenerLifecycle: "pass", visibleBeforeChapterAndBookRender: "pass", publicSourceGeneric: "pass", testWrites: "in-memory mock only", nativeUI: "pending" }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
