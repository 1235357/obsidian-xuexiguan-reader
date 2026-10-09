"use strict";

const { Plugin, ItemView, Component, MarkdownRenderer, Modal, Notice, normalizePath, parseYaml } = require("obsidian");
const VIEW_TYPE = "xuexiguan-reader-view";
// Book paths and optional figure audits belong to each local book manifest.
const TYPES = { d: "知识点", e: "例子", t: "类比／对比", c: "其他说明", h: "标题", v: "验证" };
const MATERIAL_TYPES = ["d", "e", "t", "c", "v"];
const DEFAULTS = { unitId: "", fontSize: 19, sidebarOpen: false, tab: "正文", namesOnly: false, selectedTypes: [], multiSelect: false, segmentSelections: {}, focus: true, positions: {} };

async function ensureVaultFolder(app, path) {
  let parent = "";
  for (const part of normalizePath(path).split("/")) {
    if (!part) continue;
    parent = parent ? `${parent}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(parent)) await app.vault.createFolder(parent);
  }
}
function drawingNoteLink(label, path, app) {
  const title = String(label).replace(/[\[\]\\\r\n]/g, " ");
  const target = /[()]/.test(path) ? `obsidian://open?vault=${encodeURIComponent(app.vault.getName())}&file=${encodeURIComponent(path)}` : path;
  return `[${title}](${target})`;
}
async function createBookIndex(ea, book) {
  if (!ea || !ea.plugin || !ea.plugin.app) throw new Error("原生 ExcalidrawAutomate 尚未就绪。");
  const app = ea.plugin.app, bookPath = book.bookPath;
  const mapPath = normalizePath(book.overviewPath || `${bookPath}/Excalidraw/全书目录.excalidraw.md`);
  const folder = mapPath.substring(0, mapPath.lastIndexOf("/")), name = mapPath.split("/").pop();
  const units = book.units.map(u => ({ id: u.id, title: u.title, path: u.path, pdfStart: u.pdfStart, pdfEnd: u.pdfEnd }));
  for (const unit of units) if (!app.vault.getAbstractFileByPath(unit.path)) throw Error(`正文不存在：${unit.title}`);
  if (app.vault.getAbstractFileByPath(mapPath)) throw Error("已有全书目录；请先检查原图，避免覆盖。");
  await ensureVaultFolder(app, folder);
  const INK = "#172b4d", LINE = "#a9bfd4", BLUE = "#eef6ff", GREEN = "#eef8f2";
  function style(size = 23, fill = "transparent", stroke = INK) {
    ea.setFontFamily(Number.isInteger(book.drawingFontFamily) ? book.drawingFontFamily : 2);
    Object.assign(ea.style, { fontSize: size, strokeColor: stroke, backgroundColor: fill, fillStyle: "solid", strokeWidth: 1.3, roughness: 0, opacity: 100, strokeStyle: "solid", textAlign: "left" });
  }
  function text(x, y, value, size, link) {
    style(size);
    const dim = ea.measureText(value), id = ea.addText(x, y, value, { width: dim.width, height: dim.height, autoResize: true });
    if (link) ea.getElement(id).link = drawingNoteLink(value, link, app);
    return { id, width: dim.width, height: dim.height };
  }
  function fitTitle(value, width, fontSize) {
    style(fontSize); const lines = []; let line = "";
    for (const character of String(value)) {
      if (character === "\n" || ea.measureText(line + character).width > width && line) { lines.push(line); line = character === "\n" ? "" : character; }
      else line += character;
    }
    if (line) lines.push(line);
    return lines.join("\n");
  }
  function card(unit, x, y, width, height, color, title = unit.title) {
    style(23, color, LINE);
    const id = ea.addRect(x, y, width, height);
    ea.getElement(id).link = drawingNoteLink(title, unit.path, app);
    const heading = text(x + 18, y + 14, title, 23, unit.path);
    if (heading.width > width - 36 || heading.height > height - 48) throw Error(`章节标题超出目录卡片：${unit.title}`);
    let metadata = "打开正文";
    if (Number.isInteger(unit.pdfStart) && unit.pdfStart > 0) {
      const end = unit.pdfEnd || unit.pdfStart, pages = unit.pdfStart === end ? String(end) : `${unit.pdfStart}—${end}`;
      metadata = `PDF 第${pages}页`;
      if (Number.isInteger(book.printPageOffset) && unit.pdfStart - book.printPageOffset > 0) {
        const startPrint = unit.pdfStart - book.printPageOffset, endPrint = end - book.printPageOffset;
        metadata += `　·　书页 ${startPrint === endPrint ? startPrint : `${startPrint}—${endPrint}`}`;
      }
    }
    const detail = text(x + 18, y + height - 28, metadata, 17, unit.path);
    ea.addToGroup([id, heading.id, detail.id]);
    ea.addAppendUpdateCustomData(id, { unitId: unit.id, sourceNote: unit.path, pdfStart: unit.pdfStart, pdfEnd: unit.pdfEnd, editorialNavigation: true });
    return { unitId: unit.id, title: unit.title, path: unit.path, elementIds: [id, heading.id, detail.id] };
  }
  ea.clear(); let result;
  try {
    ea.canvas.theme = "light"; ea.canvas.viewBackgroundColor = "#ffffff";
    text(0, 0, book.title, 40);
    if (book.author) text(0, 60, `${book.author} 著`, 23);
    const cards = []; let footerY;
    function rows(items, x, y, columns, width, color) {
      for (let index = 0; index < items.length; index += columns) {
        const row = items.slice(index, index + columns), titles = row.map(unit => fitTitle(unit.title, width - 36, 23));
        style(23); const height = Math.max(96, ...titles.map(title => ea.measureText(title).height + 62));
        row.forEach((unit, column) => cards.push(card(unit, x + column * (width + 30), y, width, height, color, titles[column])));
        y += height + 28;
      }
      return y;
    }
    if (book.overviewLayout) {
      const layout = book.overviewLayout, byId = new Map(units.map(unit => [unit.id, unit]));
      const sectionWidth = 830, sectionStep = 930, frontWidth = sectionWidth + (layout.sections.length - 1) * sectionStep;
      const sectionY = rows(layout.front.map(id => byId.get(id)), 0, 112, 1, frontWidth, BLUE);
      const headerTitles = layout.sections.map(section => fitTitle(byId.get(section.unitId).title, sectionWidth - 36, 23));
      style(23); const headerHeight = Math.max(96, ...headerTitles.map(title => ea.measureText(title).height + 62));
      const bottoms = layout.sections.map((section, column) => {
        const x = column * sectionStep, color = column % 2 ? GREEN : BLUE;
        cards.push(card(byId.get(section.unitId), x, sectionY, sectionWidth, headerHeight, color, headerTitles[column]));
        return rows(section.units.map(id => byId.get(id)), x, sectionY + headerHeight + 28, 2, 400, color);
      });
      footerY = Math.max(...bottoms) + 15;
    } else {
      footerY = rows(units, 0, 112, units.length > 2 ? 3 : Math.max(1, units.length), 560, BLUE) + 15;
    }
    text(0, footerY, "点击章节卡片，打开对应正文。", 23, book.startPath || units[0].path);
    const elements = ea.getElements();
    if (new Set(cards.map(c => c.unitId)).size !== units.length) throw Error("目录卡片与阅读章节不一致。");
    const path = await ea.create({ filename: name, foldername: folder, silent: true,
      frontmatterKeys: { "excalidraw-plugin": "parsed", "excalidraw-default-mode": "view", "excalidraw-export-internal-links": true, "类型": "书籍目录导航" },
      plaintext: `[开始阅读](obsidian://jiangou-reader?book=${encodeURIComponent(bookPath)})\n` });
    result = { path, createdThrough: "native ExcalidrawAutomate", units: units.length, chapters: book.overviewLayout ? book.overviewLayout.sections.reduce((sum, section) => sum + section.units.length, 0) : units.length, elements: elements.length,
      inputPath: `${bookPath}/Assets/Reader/book.json`, originalOrder: units.map(u => u.id), cards: units.map(u => cards.find(c => c.unitId === u.id)),
      geometry: elements.map(e => ({ id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height })), nativeVisualReviewPending: true };
    await ensureVaultFolder(app, `${bookPath}/Assets/Construction`);
    await app.vault.adapter.write(`${bookPath}/Assets/Construction/native-book-index-report.json`, JSON.stringify(result, null, 2));
  } finally { ea.clear(); }
  new ea.obsidian.Notice(`已创建全书目录：${units.length}个阅读单元。`);
  return result;
}

function cleanText(value) { return String(value || "").replace(/<[^>]*>/g, "").replace(/[*_`]/g, "").trim(); }
function keyText(value) { return cleanText(value).replace(/\s+/g, ""); }
function closestVisibleSegment(sectionMap, viewportTop) {
  let above = null, below = null;
  sectionMap.forEach((element, id) => {
    const top = element.getBoundingClientRect().top;
    if (!Number.isFinite(top)) return;
    const candidate = { id, element, top };
    if (top <= viewportTop && (!above || top > above.top)) above = candidate;
    else if (top > viewportTop && (!below || top < below.top)) below = candidate;
  });
  return above || below;
}
function hasReadingLayout(element) {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
function standaloneFigureCaption(value) {
  const match = /^图[ \t]*(\d+)[ \t]*[-‐‑–—][ \t]*(\d+)[ \t]*[。．.]?$/.exec(String(value || "").trim());
  return match ? `${match[1]}-${match[2]}` : null;
}
function auditedFigureImage(image, bookPath, audits = {}) {
  let source = image.getAttribute("src") || image.currentSrc || image.src || "";
  try { source = decodeURIComponent(source); } catch (_) { return null; }
  source = source.replace(/\\/g, "/").split(/[?#]/)[0];
  const marker = `/${bookPath}/Assets/Figures/`;
  const start = source.lastIndexOf(marker);
  if (start < 0) return null;
  const filename = source.slice(start + marker.length);
  const audit = audits[filename];
  return audit ? { filename, audit } : null;
}
async function binarySha256(binary) {
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", binary);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
  }
  // Electron exposes the Node builtin in desktop vaults. If unavailable, the
  // caller keeps the caption visible instead of assuming the crop is unchanged.
  return require("crypto").createHash("sha256").update(new Uint8Array(binary)).digest("hex");
}
function stripFrontmatter(markdown) { return String(markdown || "").replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ""); }
// This deliberately reserved, standalone Obsidian comment separates an appended
// compiler section from the author's source. Ordinary tags, similarly named
// comments, and literal code must never truncate an imported Markdown book.
function splitAnnotatedMarkdown(markdown, unitId) {
  const text = String(markdown || ""), marker = `%% xgr-annotation-start:${String(unitId || "")} %%`;
  const visible = maskMarkdownCode(text);
  let offset = 0, inComment = false;
  for (const line of text.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!line) continue;
    const plain = line.replace(/\r?\n$/, ""), masked = visible.slice(offset, offset + plain.length);
    if (!inComment && plain.trim() === marker && masked.trim() === marker) return { source: text.slice(0, offset), annotation: text.slice(offset), boundary: true };
    const comments = /%%/g; let comment;
    while ((comment = comments.exec(masked))) if (!escapedAt(masked, comment.index)) inComment = !inComment;
    offset += line.length;
  }
  return { source: text, annotation: "", boundary: false };
}
function maskMarkdownComments(markdown) {
  // Obsidian comments are invisible to readers, so headings inside them cannot
  // identify the section requested by guideHeading. Code is masked first.
  return maskMarkdownCode(markdown).replace(/%%[\s\S]*?%%/g, value => value.replace(/[^\r\n]/g, " "));
}
function readGuideSection(markdown, guideHeading = "") {
  const source = stripFrontmatter(markdown), wanted = String(guideHeading || "").trim();
  if (!wanted) return source; // Existing single-note guides remain compatible.
  const masked = maskMarkdownComments(source), headings = [];
  let offset = 0;
  for (const line of source.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!line) continue;
    const plain = line.replace(/\r?\n$/, ""), visible = masked.slice(offset, offset + plain.length);
    if (/^ {0,3}#{1,6}\s+/.test(visible)) {
      const match = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(plain);
      if (match) headings.push({ offset, level: match[1].length, title: match[2].trim() });
    }
    offset += line.length;
  }
  const matches = headings.filter(heading => heading.title === wanted);
  if (matches.length !== 1) throw new Error(matches.length ? `解说标题重复：${wanted}` : `找不到本章解说：${wanted}`);
  const first = matches[0], after = headings.find(heading => heading.offset > first.offset && heading.level <= first.level);
  return source.slice(first.offset, after ? after.offset : source.length).trimEnd();
}
function textId(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
function liveUnit(metadata, markdown) {
  const previous = metadata.segments || [];
  const used = new Set();
  const segments = [], outline = [];
  const source = stripFrontmatter(splitAnnotatedMarkdown(markdown, metadata.id).source), visibleLines = maskMarkdownCode(source).split(/\r?\n/);
  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    const visible = visibleLines[lineIndex];
    const label = parseModevolLine(visible) ? parseModevolLine(line) : null;
    const heading = /^\s{0,3}#{1,6}\s+/.test(visible) ? /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (!label && !heading) continue;
    const type = label ? label.type : "h", title = label ? label.title : cleanText(heading[2]);
    const index = previous.findIndex((segment, position) => !used.has(position) && segment.type === type && keyText(segment.title) === keyText(title));
    const known = index >= 0 ? previous[index] : {};
    if (index >= 0) used.add(index);
    const { markdown: cachedMarkdown, ...sourceMetadata } = known;
    segments.push({ ...sourceMetadata, ...(label || {}), type, title, id: known.id || `${metadata.id}-live-${textId(`${type}:${title}:${segments.length}`)}`, page: known.page || null });
    if (heading) outline.push({ title, level: heading[1].length, anchor: title });
  }
  return { ...metadata, markdown: String(markdown), segments, outline };
}
function conceptsFromUnit(unit, sourceConcepts = []) {
  // Only the author's actual concept summaries belong in this index. A later
  // worked example can contain similarly formatted lists, but is not a summary.
  const concepts = [];
  let inSummary = false;
  const source = stripFrontmatter(splitAnnotatedMarkdown(unit.markdown, unit.id).source), visible = maskMarkdownCode(source).split(/\r?\n/);
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!visible[index].trim()) continue;
    if (visible[index] !== line && /^#{1,6}\s+/.test(line)) continue;
    if (/^#{1,6}\s+概念提要\s*$/.test(line)) { inSummary = true; continue; }
    if (/^(?:#{1,6}\s|#[detcv]\s|---\s*$)/.test(line)) { inSummary = false; continue; }
    if (!inSummary) continue;
    const match = /^-[ \t]+([^：:\r\n]+)[：:][ \t]*(\S.*)$/.exec(line);
    if (!match) continue;
    const term = cleanText(match[1]), definition = match[2].trim();
    const known = sourceConcepts.find(concept => concept.unitId === unit.id && keyText(concept.term) === keyText(term));
    const segment = known && unit.segments.find(item => item.id === known.segmentId) || unit.segments.find(item => keyText(item.title) === keyText(term)) || unit.segments.find(item => item.type === "h" && item.title === "概念提要");
    concepts.push({ term, definition, unitId: unit.id, segmentId: segment ? segment.id : "", page: segment && segment.page || unit.pdfStart });
  }
  return concepts;
}

function escapedAt(text, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) slashes++;
  return slashes % 2 === 1;
}
function markdownCodeRanges(markdown) {
  const ranges = []; let offset = 0, fence = null;
  for (const line of markdown.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!line) continue;
    const plain = line.replace(/\r?\n$/, ""), marker = /^ {0,3}(?:>[ \t]?)*(`{3,}|~{3,})(.*)$/.exec(plain);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) {
        ranges.push([fence.start, offset + line.length]); fence = null;
      }
    } else if (marker && (marker[1][0] !== "`" || !marker[2].includes("`"))) {
      fence = { char: marker[1][0], length: marker[1].length, start: offset };
    } else if (/^(?: {4}|\t)/.test(plain)) ranges.push([offset, offset + line.length]);
    offset += line.length;
  }
  if (fence) ranges.push([fence.start, markdown.length]);
  const blocks = ranges.slice();
  const tokens = /`+/g; let token;
  while ((token = tokens.exec(markdown))) {
    const block = blocks.find(range => token.index >= range[0] && token.index < range[1]);
    if (block) { tokens.lastIndex = block[1]; continue; }
    if (escapedAt(markdown, token.index)) continue;
    const limit = blocks.find(range => range[0] > token.index)?.[0] ?? markdown.length;
    const closer = /`+/g; closer.lastIndex = tokens.lastIndex; let closing;
    while ((closing = closer.exec(markdown)) && closing.index < limit) {
      if (closing[0].length !== token[0].length) continue;
      ranges.push([token.index, closer.lastIndex]); tokens.lastIndex = closer.lastIndex; break;
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}
function maskMarkdownCode(markdown) {
  let cursor = 0, masked = "";
  for (const [start, end] of markdownCodeRanges(markdown)) {
    if (start < cursor) continue;
    masked += markdown.slice(cursor, start) + markdown.slice(start, end).replace(/[^\r\n]/g, " "); cursor = end;
  }
  return masked + markdown.slice(cursor);
}
function parseModevolLine(line) {
  const match = /^#([detcv])(?=\s)(.*)$/.exec(line);
  if (!match) return null;
  const type = match[1];
  const payload = match[2].trim();
  const words = type === "c" ? payload.split(/\s+/) : payload.split(" ");
  if (type === "c") return { type, tagName: words[0] || "说明", title: words[1] || "", relation: words[2] || "", displayTitle: words.slice(1).join(" ") };
  return { type, tagName: TYPES[type], title: words[0] || "", relation: words[1] || "", displayTitle: payload };
}
function explicitDescriptionRelation(unit, segment) {
  if (segment.type !== "e" || unit.segments.filter(candidate => candidate.id === segment.id).length !== 1) return null;
  if (segment.relation) {
    const descriptions = unit.segments.filter(candidate => candidate.type === "d" && candidate.title === segment.relation);
    return descriptions.length === 1 ? descriptions[0] : null;
  }
  const links = Array.isArray(unit.relations) ? unit.relations.filter(link => link && link.from === segment.id) : [];
  if (links.length !== 1) return null;
  const descriptions = unit.segments.filter(candidate => candidate.type === "d" && candidate.id === links[0].to);
  return descriptions.length === 1 ? descriptions[0] : null;
}
function relationFamily(unit, segment) {
  const description = segment.type === "d" ? segment : explicitDescriptionRelation(unit, segment);
  if (!description || unit.segments.filter(candidate => candidate.id === description.id).length !== 1) return [];
  return [description.id, ...unit.segments.filter(candidate => candidate.type === "e" && explicitDescriptionRelation(unit, candidate)?.id === description.id).map(candidate => candidate.id)];
}
function spotlightVisible(type, id, selectedTypes, selectedSegments) {
  return (!selectedTypes.length || selectedTypes.includes(type)) && (!selectedSegments.length || selectedSegments.includes(id));
}

// Transform only standalone author labels. Render the entire chapter once, so
// tables, equations and footnotes retain their original chapter-wide context.
function prepareMarkdown(unit) {
  const supplied = Array.isArray(unit.segments) ? unit.segments : [];
  const used = new Set();
  const markers = [];
  const separated = splitAnnotatedMarkdown(stripFrontmatter(unit.markdown), unit.id);
  const source = separated.source, visibleLines = maskMarkdownCode(source).split(/\r?\n/);
  const lines = source.split(/\r?\n/).map((line, lineIndex) => {
    if (!parseModevolLine(visibleLines[lineIndex])) return line;
    const label = parseModevolLine(line);
    if (!label) return line;
    let metadataIndex = supplied.findIndex((segment, index) => !used.has(index) && segment.type === label.type && keyText(segment.title) === keyText(label.title));
    const metadata = metadataIndex < 0 ? {} : supplied[metadataIndex];
    if (metadataIndex >= 0) used.add(metadataIndex);
    const index = markers.length;
    markers.push({ ...label, ...metadata, type: label.type, tagName: label.tagName, displayTitle: label.displayTitle, title: label.title || metadata.title || label.tagName, id: metadata.id || `${unit.id}-paragraph-${index + 1}`, page: metadata.page || null, marker: `XGRSEG${String(index).padStart(6, "0")}` });
    return `###### XGRSEG${String(index).padStart(6, "0")}`;
  });
  // The appended Markdown/embed is rendered continuously, without converting
  // compiler labels into source materials. The invisible structural boundary
  // also prevents the last author segment from swallowing/hiding annotations.
  const annotation = separated.boundary ? `\n<div class="xgr-annotation-boundary" role="separator" aria-label="编者解说与批注"></div>\n\n${separated.annotation}` : "";
  return { markdown: lines.join("\n") + annotation, markers, supplied, hasAnnotation: separated.boundary };
}

function safeBookPath(value) {
  const path = normalizePath(String(value || "").replace(/\\/g, "/")).replace(/\/$/, "");
  if (!path || /^(?:\/|[a-zA-Z]:)/.test(path) || path.split("/").some(part => part === ".." || part === ".")) throw new Error("请选择当前知识库内的书籍文件夹。");
  return path;
}
function normalizeReadState(value) {
  const state = { ...DEFAULTS, ...(value || {}) };
  state.fontSize = Math.max(15, Math.min(30, Number(state.fontSize) || 19));
  state.selectedTypes = Array.isArray(state.selectedTypes) ? state.selectedTypes.filter(type => MATERIAL_TYPES.includes(type)) : [];
  state.multiSelect = !!state.multiSelect;
  state.segmentSelections = Object.fromEntries(Object.entries(state.segmentSelections && typeof state.segmentSelections === "object" ? state.segmentSelections : {}).filter(([, ids]) => Array.isArray(ids)).map(([unitId, ids]) => [unitId, [...new Set(ids.filter(id => typeof id === "string"))]]));
  state.sourceUnitIds = Object.fromEntries(Object.entries(state.sourceUnitIds && typeof state.sourceUnitIds === "object" ? state.sourceUnitIds : {}).filter(([path, id]) => typeof path === "string" && typeof id === "string" && id));
  state.positions = value && typeof value.positions === "object" && value.positions ? value.positions : {};
  state.tab = ["目录", "正文", "段落脉络", "概念"].includes(state.tab) ? state.tab : "正文";
  return state;
}
function migrateLibraryData(value, fallbackBookPath = "") {
  const loaded = value || {};
  if (loaded.schema === 2 && loaded.books && typeof loaded.books === "object") {
    const books = {};
    Object.entries(loaded.books).forEach(([path, state]) => { try { books[safeBookPath(path)] = normalizeReadState(state); } catch (_) {} });
    let activeBook = Object.keys(books)[0] || fallbackBookPath || "";
    try { if (loaded.activeBook) activeBook = safeBookPath(loaded.activeBook); } catch (_) {}
    return { schema: 2, activeBook, books };
  }
  const activeBook = fallbackBookPath ? safeBookPath(fallbackBookPath) : "";
  return { schema: 2, activeBook, books: activeBook ? { [activeBook]: normalizeReadState(loaded) } : {} };
}
function validBook(data, suppliedBookPath = "") {
  if (!data || !Array.isArray(data.units) || !data.units.length) throw new Error("本地书籍尚未准备好。");
  const bookPath = safeBookPath(suppliedBookPath || data.bookPath || "");
  const seen = new Set();
  const units = data.units.map((unit, index) => {
    if (!unit || typeof unit.path !== "string") throw new Error(`第 ${index + 1} 个阅读单元缺少书稿路径。`);
    const path = safeBookPath(unit.path);
    if (!path.startsWith(`${bookPath}/`) || !path.endsWith(".md") || path.endsWith(".excalidraw.md")) throw new Error(`第 ${index + 1} 个阅读单元缺少有效的 Markdown 书稿路径。`);
    const id = String(unit.id || `unit-${index + 1}`);
    if (seen.has(id)) throw new Error("阅读单元编号重复。");
    seen.add(id);
    const { markdown: cachedMarkdown, ...metadata } = unit;
    let guidePath = "";
    if (unit.guidePath) { guidePath = safeBookPath(unit.guidePath); if (!guidePath.startsWith(`${bookPath}/`) || !guidePath.endsWith(".md") || guidePath.endsWith(".excalidraw.md")) throw new Error("解说笔记路径应位于这本书的文件夹内。"); }
    const guideHeading = String(unit.guideHeading || "").trim();
    if (/[\r\n]/.test(guideHeading)) throw new Error("解说标题应为单行 Markdown 标题文字。");
    if (guideHeading && !guidePath) throw new Error("指定本章解说标题时也需要解说笔记路径。");
    return { ...metadata, path, id, guidePath, guideHeading, title: String(unit.title || id), segments: Array.isArray(unit.segments) ? unit.segments.map(({ markdown: cachedSegment, ...segment }) => segment) : [], outline: Array.isArray(unit.outline) ? unit.outline : [] };
  });
  let overviewPath = `${bookPath}/Excalidraw/全书目录.excalidraw.md`;
  if (data.overviewPath) { overviewPath = safeBookPath(data.overviewPath); if (!overviewPath.startsWith(`${bookPath}/`) || !overviewPath.endsWith(".excalidraw.md")) throw new Error("书籍图谱路径应位于书籍文件夹内。"); }
  let printPageOffset = null;
  if (data.printPageOffset !== undefined && data.printPageOffset !== null) {
    if (!Number.isSafeInteger(data.printPageOffset)) throw new Error("书页偏移量应为整数。");
    printPageOffset = data.printPageOffset;
  }
  let overviewLayout = null;
  if (data.overviewLayout !== undefined && data.overviewLayout !== null) {
    const layout = data.overviewLayout;
    if (!layout || typeof layout !== "object" || !Array.isArray(layout.sections) || !layout.sections.length || (layout.front !== undefined && !Array.isArray(layout.front))) throw new Error("目录分部布局应提供 sections 数组和可选的 front 数组。");
    const included = new Set();
    const include = id => {
      if (typeof id !== "string" || !seen.has(id) || included.has(id)) throw new Error("目录分部布局包含未知或重复的阅读单元。");
      included.add(id); return id;
    };
    const front = (layout.front || []).map(include);
    const sections = layout.sections.map(section => {
      if (!section || !Array.isArray(section.units) || !section.units.length) throw new Error("每个目录分部应包含单元标题和至少一个正文单元。");
      return { unitId: include(section.unitId), units: section.units.map(include) };
    });
    if (included.size !== units.length) throw new Error("目录分部布局应恰好包含每个阅读单元一次。");
    overviewLayout = { front, sections };
  }
  const figureCaptionAudits = {};
  if (data.figureCaptionAudits !== undefined) {
    if (!data.figureCaptionAudits || typeof data.figureCaptionAudits !== "object" || Array.isArray(data.figureCaptionAudits)) throw new Error("图注审核配置应为对象。");
    for (const [filename, audit] of Object.entries(data.figureCaptionAudits)) {
      if (!/^[^/\\]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(filename) || filename === "." || !audit || !/^[a-f0-9]{64}$/i.test(audit.sha256 || "") || !Array.isArray(audit.figures) || !audit.figures.length || audit.figures.some(figure => typeof figure !== "string" || !/^\d+-\d+$/.test(figure))) throw new Error(`图注审核记录无效：${filename}`);
      figureCaptionAudits[filename] = { sha256: audit.sha256.toLowerCase(), figures: [...new Set(audit.figures)] };
    }
  }
  return { ...data, bookPath, overviewPath, overviewLayout, printPageOffset, figureCaptionAudits, title: String(data.title || bookPath.split("/").pop()), author: String(data.author || ""), units, concepts: Array.isArray(data.concepts) ? data.concepts : [] };
}
function sourceFrontmatter(markdown, cached = null) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (match && typeof parseYaml === "function") { try { return parseYaml(match[1]) || {}; } catch (_) {} }
  return cached || {};
}
function unitMetadata(file, markdown, frontmatter) {
  const orderValue = frontmatter.order ?? frontmatter["book-order"] ?? frontmatter["阅读顺序"];
  const order = orderValue === undefined || orderValue === "" ? null : Number(orderValue);
  const firstHeading = /^#{1,6}\s+(.+)$/m.exec(stripFrontmatter(markdown));
  const title = String(frontmatter.title || frontmatter["标题"] || (firstHeading && cleanText(firstHeading[1])) || file.basename);
  const start = Number(frontmatter["PDF页起"] ?? frontmatter.pdfStart), end = Number(frontmatter["PDF页止"] ?? frontmatter.pdfEnd);
  return { id: `note-${textId(file.path)}`, title, path: file.path, order: Number.isFinite(order) ? order : null,
    pdfStart: Number.isInteger(start) && start > 0 ? start : null, pdfEnd: Number.isInteger(end) && end > 0 ? end : null, segments: [], outline: [] };
}
function orderUnits(units) {
  const compare = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  return units.slice().sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || compare.compare(a.path, b.path));
}

function searchConcepts(book, query) {
  const needle = keyText(query).toLocaleLowerCase();
  return book.concepts.filter(concept => {
    const unit = book.units.find(item => item.id === concept.unitId);
    return !needle || keyText(`${concept.term} ${concept.definition} ${unit ? unit.title : ""}`).toLocaleLowerCase().includes(needle);
  });
}

function resolveAsset(app, target, sourcePath, bookPath) {
  const path = target.split("#")[0].trim();
  const exact = app.vault.getAbstractFileByPath(normalizePath(path));
  const local = app.vault.getAbstractFileByPath(normalizePath(`${bookPath}/${path}`));
  const linked = app.metadataCache.getFirstLinkpathDest(path, sourcePath);
  const file = exact || linked || local;
  return file && typeof file.path === "string" && !Array.isArray(file.children) ? app.vault.adapter.getResourcePath(file.path) : null;
}

function rewriteImageEmbeds(markdown, app, sourcePath, bookPath) {
  // Other embeds are left for Obsidian and the native Excalidraw renderer.
  const rewrite = prose => prose.replace(/!\[\[([^\n]+?)\]\]/g, (original, inner, offset) => {
    if (escapedAt(prose, offset)) return original;
    const [target, sizing] = inner.split("|");
    if (!/\.(?:png|jpe?g|webp|gif|svg)(?:#.*)?$/i.test(target)) return original;
    const resource = resolveAsset(app, target, sourcePath, bookPath);
    if (!resource) return original;
    const alt = /^\d+(?:x\d+)?$/.test(sizing || "") ? target.split("/").pop() : sizing || target.split("/").pop();
    const dimensions = /^(\d+)(?:x(\d+))?$/.exec(sizing || "");
    if (dimensions && Number(dimensions[1]) > 0 && (!dimensions[2] || Number(dimensions[2]) > 0)) {
      const escape = value => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const height = dimensions[2] ? `height:${Number(dimensions[2])}px` : "height:auto";
      return `<img src="${escape(resource)}" alt="${escape(alt)}" width="${Number(dimensions[1])}"${dimensions[2] ? ` height="${Number(dimensions[2])}"` : ""} style="width:${Number(dimensions[1])}px;${height}" />`;
    }
    return `![${String(alt).replace(/[\\\[\]]/g, "\\$&")}](${"<" + resource.replace(/>/g, "%3E").replace(/</g, "%3C") + ">"})`;
  });
  let cursor = 0, result = "";
  for (const [start, end] of markdownCodeRanges(markdown)) {
    if (start < cursor) continue;
    result += rewrite(markdown.slice(cursor, start)) + markdown.slice(start, end); cursor = end;
  }
  return result + rewrite(markdown.slice(cursor));
}

function node(parent, tag, className, text) {
  const element = parent.ownerDocument.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.appendChild(element);
  return element;
}
function button(parent, text, title, callback, className = "") {
  const element = node(parent, "button", `xgr-button ${className}`, text);
  element.type = "button";
  element.title = title || text;
  element.setAttribute("aria-label", title || text);
  element.addEventListener("click", callback);
  return element;
}

class OriginalImageModal extends Modal {
  constructor(app, source, title) { super(app); this.source = source; this.imageTitle = title || "原图"; this.zoom = 1; }
  onOpen() {
    this.modalEl.classList.add("xgr-image-modal");
    this.titleEl.textContent = this.imageTitle;
    const controls = node(this.contentEl, "div", "xgr-image-controls");
    button(controls, "适合窗口", "适合窗口", () => { this.zoom = 1; this.updateZoom(); });
    button(controls, "−", "缩小原图", () => { this.zoom = Math.max(0.5, this.zoom - 0.25); this.updateZoom(); });
    button(controls, "+", "放大原图", () => { this.zoom = Math.min(4, this.zoom + 0.25); this.updateZoom(); });
    const viewport = node(this.contentEl, "div", "xgr-image-viewport");
    this.image = node(viewport, "img", "xgr-large-image");
    this.image.src = this.source; this.image.alt = this.imageTitle;
    this.updateZoom();
  }
  updateZoom() {
    this.image.style.width = `${this.zoom * 100}%`;
    this.image.style.maxWidth = this.zoom === 1 ? "100%" : "none";
    this.image.style.maxHeight = this.zoom === 1 ? "75vh" : "none";
    this.image.style.objectFit = "contain";
  }
  onClose() { this.contentEl.replaceChildren(); }
}

class ReaderView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf); this.plugin = plugin; this.book = null; this.unit = null; this.renderGeneration = 0; this.closed = false;
    this.bookPath = plugin.libraryData.activeBook || "";
    const state = this.bookPath ? plugin.stateFor(this.bookPath) : normalizeReadState({});
    this.readState = { ...state, selectedTypes: [...state.selectedTypes] };
    this.sectionMap = new Map(); this.scrollTimer = null; this.restoreTimer = null; this.rendering = false;
    this.refreshGeneration = 0; this.chapterLoadFailed = false;
    this.guideOpen = false; this.guideGeneration = 0;
    this.pendingSegmentId = ""; this.pendingUnit = null;
    this.interfaceComponent = null;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.book ? this.book.title : "电子书阅读器"; }
  getIcon() { return "book-open"; }
  getState() { return { bookPath: this.bookPath, unitId: this.unit ? this.unit.id : this.readState.unitId }; }
  async setState(state, result) {
    if (state && state.bookPath && state.bookPath !== this.bookPath) {
      if (this.book) await this.switchBook(state.bookPath);
      else { this.bookPath = safeBookPath(state.bookPath); const saved = this.plugin.stateFor(this.bookPath); this.readState = { ...saved, selectedTypes: [...saved.selectedTypes] }; }
    }
    if (state && state.unitId) this.readState.unitId = state.unitId;
    await super.setState(state, result);
    if (this.book && state && state.unitId && (!this.unit || this.unit.id !== state.unitId)) await this.openUnit(state.unitId);
  }
  async onOpen() {
    this.closed = false;
    this.contentEl.classList.add("xgr-view"); this.contentEl.replaceChildren();
    this.shell = node(this.contentEl, "div", "xgr-shell");
    const loading = node(this.shell, "p", "xgr-load-message", "正在打开书籍…");
    try {
      this.book = await this.plugin.readBook(this.bookPath);
      if (this.closed) return;
      loading.remove(); this.buildInterface();
      await this.openUnit(this.readState.unitId || this.book.units[0].id, true);
    } catch (error) {
      loading.textContent = error.message || "无法打开本地书籍。";
      button(this.shell, "重试", "重新读取本地书籍", () => this.onOpen());
      button(this.shell, "打开书架", "选择另一本书或从文件夹加入书籍", () => this.plugin.openShelf());
    }
  }
  async switchBook(bookPath, unitId = "", segmentId = "") {
    const path = safeBookPath(bookPath);
    if (path === this.bookPath && this.book) { if (unitId) await this.openUnit(unitId, true, segmentId); return; }
    const nextBook = await this.plugin.readBook(path);
    this.capturePosition(); this.persist(); ++this.renderGeneration; ++this.refreshGeneration;
    clearTimeout(this.scrollTimer); clearTimeout(this.restoreTimer); this.restoring = false; this.rendering = false; this.pendingRestorePosition = null; this.pendingSegmentId = "";
    if (this.renderComponent) { this.removeChild(this.renderComponent); this.renderComponent = null; }
    this.closeGuide();
    this.bookPath = path; this.book = nextBook; this.unit = null; this.sectionMap.clear();
    const state = this.plugin.stateFor(path); this.readState = { ...state, selectedTypes: [...state.selectedTypes] };
    this.plugin.libraryData.activeBook = path;
    this.shell.replaceChildren(); this.buildInterface();
    await this.openUnit(unitId || this.readState.unitId || nextBook.units[0].id, true, segmentId);
    this.plugin.queueSave();
  }
  buildInterface() {
    clearTimeout(this.scrollTimer); this.scrollTimer = null;
    if (this.interfaceComponent) this.removeChild(this.interfaceComponent);
    this.interfaceComponent = this.addChild(new Component());
    const header = node(this.shell, "header", "xgr-header");
    const identity = node(header, "div", "xgr-identity");
    node(identity, "strong", "xgr-book-title", this.book.title);
    node(identity, "span", "xgr-author", this.book.author);
    const tools = node(header, "div", "xgr-tools");
    button(tools, "书架", "选择书籍或从文件夹加入书籍", () => this.plugin.openShelf());
    button(tools, "A−", "缩小正文字号", () => this.setFont(-1));
    button(tools, "A＋", "增大正文字号", () => this.setFont(1));
    this.refreshButton = button(tools, "刷新", "重新读取已保存的 Markdown 书稿", () => this.refreshSources(true));
    this.homeButton = button(tools, "首页", "返回本书的原生 Markdown 阅读入口", () => this.openHome());
    this.homeButton.hidden = !this.app.vault.getAbstractFileByPath(`${this.bookPath}/00 开始阅读.md`);
    this.sidebarButton = button(tools, "侧栏", "展开或收起读书侧栏", () => { this.readState.sidebarOpen = !this.readState.sidebarOpen; if (this.readState.sidebarOpen && this.readState.tab === "正文") this.readState.tab = "目录"; this.applyAppearance(); this.renderSidebar(); this.persist(); });
    const navigation = node(this.shell, "nav", "xgr-navigation");
    this.previousButton = button(navigation, "‹ 上一章", "上一章", () => this.moveChapter(-1));
    this.chapterSelect = node(navigation, "select", "xgr-chapter-select");
    this.chapterSelect.setAttribute("aria-label", "选择章节");
    this.book.units.forEach(unit => { const option = node(this.chapterSelect, "option", "", unit.title); option.value = unit.id; });
    this.chapterSelect.addEventListener("change", () => this.openUnit(this.chapterSelect.value));
    this.nextButton = button(navigation, "下一章 ›", "下一章", () => this.moveChapter(1));
    this.sourceButton = button(navigation, "原页", "打开当前位置的原扫描页", () => this.openOriginalPage());
    button(navigation, "笔记", "在原生笔记中打开本章", () => this.openSourceNote());
    button(navigation, "图谱", "打开可编辑的 Excalidraw 全书目录", () => this.openOverview());
    this.guideButton = button(navigation, "解说", "打开或关闭本章的并行解说笔记", () => this.toggleGuide());
    this.guideButton.hidden = true;
    const paragraphNavigation = node(this.shell, "nav", "xgr-paragraph-navigation");
    this.previousParagraphButton = button(paragraphNavigation, "↑ 上一段", "跳到上一段材料", () => this.moveParagraph(-1));
    this.nextParagraphButton = button(paragraphNavigation, "下一段 ↓", "跳到下一段材料", () => this.moveParagraph(1));
    const tabs = node(this.shell, "nav", "xgr-tabs"); tabs.setAttribute("aria-label", "阅读导航");
    this.tabButtons = new Map();
    ["目录", "正文", "段落脉络", "概念"].forEach(tab => this.tabButtons.set(tab, button(tabs, tab, tab, () => this.switchTab(tab))));
    this.frame = node(this.shell, "div", "xgr-frame");
    this.sidebar = node(this.frame, "aside", "xgr-sidebar");
    this.scrollEl = node(this.frame, "main", "xgr-scroll"); this.scrollEl.setAttribute("aria-label", "书籍正文"); this.scrollEl.tabIndex = 0;
    this.guidePanel = node(this.frame, "aside", "xgr-guide-panel"); this.guidePanel.hidden = true;
    this.interfaceComponent.registerDomEvent(this.shell, "keydown", event => {
      if (event.key === "Escape" && (this.readState.selectedTypes.length || this.selectedSegmentIds().length)) { this.clearSpotlight(); event.preventDefault(); event.stopPropagation(); }
    });
    this.interfaceComponent.registerDomEvent(this.scrollEl, "scroll", () => {
      if (this.restoring || this.rendering) return;
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => { this.capturePosition(); this.persist(); this.highlightCurrentSegment(); }, 250);
    }, { passive: true });
    this.interfaceComponent.registerDomEvent(this.scrollEl, "click", event => this.handleReadingClick(event), true);
    this.interfaceComponent.registerDomEvent(this.scrollEl, "load", event => {
      if (event.target && event.target.tagName === "IMG" && this.restoring && this.restorePosition) this.restoreReadingPosition(this.restorePosition);
    }, true);
    this.applyAppearance();
  }
  async openUnit(unitId, restore = true, segmentId = "") {
    if (!this.book || this.closed) return;
    const metadata = this.book.units.find(unit => unit.id === unitId) || this.book.units[0];
    if (this.unit) this.capturePosition();
    const generation = ++this.renderGeneration;
    const bookPath = this.bookPath;
    const saved = this.plugin.stateFor(bookPath).positions[metadata.id] ? { ...this.plugin.stateFor(bookPath).positions[metadata.id] } : null;
    clearTimeout(this.scrollTimer); this.rendering = true; this.chapterLoadFailed = false;
    this.pendingUnit = metadata; this.unit = metadata; this.readState.unitId = metadata.id;
    this.sourceButton.hidden = !this.originalPagePath(metadata.pdfStart);
    this.guideButton.hidden = !metadata.guidePath || !this.app.vault.getAbstractFileByPath(metadata.guidePath);
    this.restoring = false; this.restorePosition = null; this.pendingRestorePosition = null; this.pendingSegmentId = ""; clearTimeout(this.restoreTimer);
    if (this.renderComponent) this.removeChild(this.renderComponent);
    const component = this.addChild(new Component()); this.renderComponent = component;
    this.scrollEl.replaceChildren(); this.scrollEl.scrollTop = 0; this.sectionMap.clear(); this.currentSegments = [];
    this.chapterSelect.value = metadata.id;
    const chapterIndex = this.book.units.indexOf(metadata);
    this.previousButton.disabled = chapterIndex === 0; this.nextButton.disabled = chapterIndex === this.book.units.length - 1;
    this.previousParagraphButton.disabled = true; this.nextParagraphButton.disabled = true;
    this.scrollEl.setAttribute("aria-busy", "true");
    const loading = node(this.scrollEl, "p", "xgr-load-message", "正在载入本章正文…"); loading.setAttribute("role", "status");
    const article = node(this.scrollEl, "article", "xgr-article markdown-rendered"); this.article = article;
    article.setAttribute("aria-label", metadata.title); article.setAttribute("aria-hidden", "true"); article.style.visibility = "hidden";
    // Keep Markdown connected and measurable, but do not expose temporary
    // segment headings before grouping and source-caption processing finish.
    const isCurrent = () => !this.closed && generation === this.renderGeneration;
    const reveal = () => {
      loading.remove(); article.style.visibility = ""; article.setAttribute("aria-hidden", "false");
      this.scrollEl.setAttribute("aria-busy", "false"); this.rendering = false; this.pendingUnit = null;
    };
    if (this.guideOpen && !this.guideButton.hidden) this.showGuideLoading(metadata);
    else this.closeGuide();
    let stage = "read";
    try {
      const nextUnit = await this.plugin.readUnit(metadata);
      if (!isCurrent()) return;
      const metadataIndex = this.book.units.findIndex(item => item.id === nextUnit.id);
      this.book.units[metadataIndex] = nextUnit;
      this.book.concepts = this.book.concepts.filter(concept => concept.unitId !== nextUnit.id).concat(conceptsFromUnit(nextUnit, this.book.sourceConcepts));
      this.book.concepts.sort((a, b) => this.book.units.findIndex(unit => unit.id === a.unitId) - this.book.units.findIndex(unit => unit.id === b.unitId));
      this.unit = nextUnit;
      const prepared = prepareMarkdown(nextUnit);
      const markdown = rewriteImageEmbeds(prepared.markdown, this.app, nextUnit.path, bookPath);
      stage = "render";
      if (typeof MarkdownRenderer.render === "function") await MarkdownRenderer.render(this.app, markdown, article, nextUnit.path, component);
      else await MarkdownRenderer.renderMarkdown(markdown, article, nextUnit.path, component);
      if (!isCurrent()) return;
      await this.suppressDuplicatedFigureCaptions(article, bookPath, this.book);
      if (!isCurrent()) return;
      this.groupSegments(prepared);
      const hasMaterials = this.currentSegments.some(segment => segment.type !== "h" && this.sectionMap.has(segment.id));
      this.previousParagraphButton.disabled = !hasMaterials; this.nextParagraphButton.disabled = !hasMaterials;
      this.applyAppearance(); this.renderSidebar();
      reveal();
    } catch (error) {
      if (!isCurrent()) return;
      article.replaceChildren();
      node(article, "p", "", stage === "read" ? "无法读取本章 Markdown 书稿。" : "本章暂时无法渲染。").setAttribute("role", "alert");
      if (error.message) node(article, "p", "xgr-load-message", error.message);
      button(article, "重试", "重新载入本章", () => this.openUnit(metadata.id, restore, segmentId));
      button(article, "打开原文", "在原生笔记中打开本章", () => this.app.workspace.openLinkText(metadata.path, metadata.path, "tab"));
      this.chapterLoadFailed = true;
      reveal();
      if (this.guideOpen) {
        this.guidePanel.replaceChildren(); this.guidePanel.setAttribute("aria-busy", "false");
        node(this.guidePanel, "p", "xgr-load-message", "本章正文未能加载，请重试后查看解说。").setAttribute("role", "alert");
        button(this.guidePanel, "×", "关闭解说栏", () => this.closeGuide());
      }
      return;
    }
    if (segmentId) this.goToSegment(segmentId);
    else if (restore && saved) this.restoreReadingPosition(saved);
    else this.scrollEl.scrollTop = 0;
    this.persist();
    if (this.guideOpen && !this.guideButton.hidden) await this.renderGuide();
    else if (this.guideButton.hidden) this.closeGuide();
  }
  async refreshSources(showNotice = false) {
    if (!this.book || this.closed) return;
    const generation = ++this.refreshGeneration;
    this.capturePosition();
    const unitId = this.unit ? this.unit.id : this.readState.unitId;
    if (this.refreshButton) this.refreshButton.disabled = true;
    try {
      const book = await this.plugin.readBook(this.bookPath);
      if (this.closed || generation !== this.refreshGeneration) return;
      this.book = book;
      this.chapterSelect.replaceChildren();
      book.units.forEach(unit => { const option = node(this.chapterSelect, "option", "", unit.title); option.value = unit.id; });
      await this.openUnit(this.unit ? this.unit.id : unitId, true);
      if (showNotice) new Notice("已读取最新保存的 Markdown 书稿。");
    } catch (error) { if (!this.closed) new Notice(error.message || "无法刷新本地书稿。"); }
    finally { if (this.refreshButton && generation === this.refreshGeneration) this.refreshButton.disabled = false; }
  }
  async suppressDuplicatedFigureCaptions(article = this.article, bookPath = this.bookPath, book = this.book) {
    const audits = book?.figureCaptionAudits || {};
    let suppressed = 0;
    for (const image of Array.from(article.querySelectorAll("img"))) {
      const audited = auditedFigureImage(image, bookPath, audits);
      if (!audited || !Array.isArray(audited.audit.figures) || !audited.audit.figures.length || image.closest("table, blockquote, li")) continue;
      let imageBlock = image.closest("p") || image;
      while (imageBlock.parentElement && imageBlock.parentElement !== article) imageBlock = imageBlock.parentElement;
      // Only a standalone image followed by one standalone caption paragraph.
      if (imageBlock.textContent.trim() || imageBlock.querySelectorAll("img").length !== 1) continue;
      const nextBlock = imageBlock.nextElementSibling;
      if (!nextBlock) continue;
      const paragraph = nextBlock.matches("p") ? nextBlock : nextBlock.querySelector("p");
      if (!paragraph || nextBlock.textContent.trim() !== paragraph.textContent.trim() || paragraph.querySelector("a, img, code, .math, .math-inline")) continue;
      const figure = standaloneFigureCaption(paragraph.textContent);
      if (!figure || !audited.audit.figures.includes(figure)) continue;
      if (!await this.plugin.matchesAuditedCaptionCrop(bookPath, audited.filename, audited.audit.sha256)) continue;
      paragraph.classList.add("xgr-duplicate-caption");
      suppressed++;
    }
    article.dataset.suppressedFigureCaptions = String(suppressed);
  }
  groupSegments(prepared) {
    this.currentSegments = prepared.markers;
    const headings = Array.from(this.article.querySelectorAll("h6"));
    prepared.markers.forEach(segment => {
      const heading = headings.find(item => item.textContent.trim() === segment.marker);
      if (!heading) return;
      // Renderer versions may wrap each Markdown block in an el-* div.
      let block = heading;
      while (block.parentElement !== this.article && block.parentElement && block.parentElement.children.length === 1) block = block.parentElement;
      const parent = block.parentElement;
      if (!parent) return;
      const section = parent.ownerDocument.createElement("section"); section.className = `xgr-segment xgr-type-${segment.type}`;
      section.dataset.segmentId = segment.id; section.dataset.type = segment.type;
      section.id = `xgr-${segment.marker.toLowerCase()}`;
      parent.insertBefore(section, block);
      const label = node(section, "div", "xgr-segment-label");
      node(label, "span", "xgr-type-label", segment.tagName);
      button(label, segment.displayTitle || segment.title, "定位段落；Ctrl 点击可聚光多选", event => {
        if (event.ctrlKey || event.metaKey || this.readState.multiSelect) this.toggleSegmentSelection(segment.id);
        else this.goToSegment(segment.id);
      }, "xgr-paragraph-title");
      const related = explicitDescriptionRelation(this.unit, segment);
      if (related) button(label, `→ ${related.title}`, `返回对应知识点：${related.title}`, () => this.goToSegment(related.id), "xgr-relation-link");
      if (segment.type === "d") {
        const family = relationFamily(this.unit, segment);
        if (family.length > 1) button(label, `关联${family.length - 1}例`, "聚光这个知识点及明确关联的例子", () => this.selectFamily(segment), "xgr-relation-link");
      }
      const pageLabel = segment.page ? "原页" : "本章原页";
      const source = button(label, pageLabel, `查看“${segment.title}”${segment.page ? "的原页" : "所在章的首页"}`, () => this.openOriginalPage(segment.page || this.unit.pdfStart), "xgr-paragraph-source");
      source.setAttribute("aria-label", `${pageLabel} · ${segment.title}`);
      source.hidden = !this.originalPagePath(segment.page || this.unit.pdfStart);
      const body = node(section, "div", "xgr-segment-body");
      let sibling = block.nextSibling;
      block.remove();
      while (sibling) {
        const next = sibling.nextSibling;
        if (sibling.nodeType === 1 && (sibling.matches(".xgr-annotation-boundary") || sibling.querySelector(".xgr-annotation-boundary"))) break;
        const nextHeading = sibling.nodeType === 1 ? (sibling.matches("h6") ? sibling : sibling.querySelector("h6")) : null;
        if (nextHeading && /^XGRSEG\d{6}$/.test(nextHeading.textContent.trim())) break;
        // Genuine headings, including 主干提要 and 概念提要, are separate
        // navigation targets and remain visible in names-only mode.
        const realHeading = sibling.nodeType === 1 ? (sibling.matches("h1,h2,h3,h4,h5,h6") ? sibling : sibling.querySelector("h1,h2,h3,h4,h5,h6")) : null;
        if (realHeading) break;
        // Chapter-wide footnotes remain visible even in names-only mode.
        if (sibling.nodeType === 1 && (sibling.classList.contains("footnotes") || sibling.matches("section.footnotes") || sibling.querySelector(".footnotes, section[data-footnotes]"))) break;
        body.appendChild(sibling); sibling = next;
      }
      this.sectionMap.set(segment.id, section);
    });
    prepared.supplied.filter(segment => segment.type === "h").forEach(segment => {
      const heading = Array.from(this.article.querySelectorAll("h1,h2,h3,h4,h5,h6")).find(item => keyText(item.textContent) === keyText(segment.title));
      if (heading) { this.sectionMap.set(segment.id, heading); if (!this.currentSegments.some(item => item.id === segment.id)) this.currentSegments.push(segment); }
    });
    if (!this.currentSegments.length && prepared.supplied.length) {
      this.currentSegments = prepared.supplied;
      prepared.supplied.forEach(segment => this.sectionMap.set(segment.id, this.article));
    }
    this.currentSegments.sort((a, b) => {
      const left = this.sectionMap.get(a.id), right = this.sectionMap.get(b.id);
      return left && right && left !== right ? (left.compareDocumentPosition(right) & 4 ? -1 : 1) : 0;
    });
  }
  switchTab(tab) { this.readState.tab = tab; this.readState.sidebarOpen = tab !== "正文"; this.applyAppearance(); this.renderSidebar(); this.persist(); }
  renderSidebar() {
    if (!this.sidebar || !this.unit) return;
    const query = this.conceptInput ? this.conceptInput.value : this.conceptQuery || "";
    this.sidebar.replaceChildren(); this.conceptInput = null; this.clearSpotlightButton = null;
    if (this.readState.tab === "目录" || this.readState.tab === "正文") {
      node(this.sidebar, "h2", "xgr-panel-heading", "目录");
      this.book.units.forEach(unit => {
        const row = button(this.sidebar, unit.title, unit.title, () => this.openUnit(unit.id), "xgr-directory-row");
        row.classList.toggle("is-current", unit.id === this.unit.id);
        row.setAttribute("aria-current", unit.id === this.unit.id ? "page" : "false");
      });
      if (this.unit.outline.length) {
        node(this.sidebar, "h3", "xgr-panel-heading", "本章");
        this.unit.outline.forEach(entry => button(this.sidebar, entry.title, entry.title, () => this.goToHeading(entry.title, entry.anchor), "xgr-outline-row"));
      }
    } else if (this.readState.tab === "段落脉络") {
      node(this.sidebar, "h2", "xgr-panel-heading", this.unit.title);
      const toggle = node(this.sidebar, "label", "xgr-toggle");
      const checkbox = node(toggle, "input"); checkbox.type = "checkbox"; checkbox.checked = this.readState.namesOnly;
      node(toggle, "span", "", "只看段落名");
      checkbox.addEventListener("change", () => { this.readState.namesOnly = checkbox.checked; this.applyAppearance(); this.persist(); });
      const multiToggle = node(this.sidebar, "label", "xgr-toggle"), multi = node(multiToggle, "input");
      multi.type = "checkbox"; multi.checked = this.readState.multiSelect; node(multiToggle, "span", "", "聚光多选");
      multi.addEventListener("change", () => { this.readState.multiSelect = multi.checked; this.persist(); });
      const types = MATERIAL_TYPES.filter(type => this.currentSegments.some(segment => segment.type === type));
      const filters = node(this.sidebar, "div", "xgr-type-filters"); filters.setAttribute("aria-label", "材料类型聚光");
      types.forEach(type => {
        const label = node(filters, "label", `xgr-type-choice xgr-type-${type}`);
        const input = node(label, "input"); input.type = "checkbox"; input.checked = this.readState.selectedTypes.includes(type);
        node(label, "span", "", TYPES[type] || type);
        input.addEventListener("change", () => { this.readState.selectedTypes = input.checked ? [...new Set([...this.readState.selectedTypes, type])] : this.readState.selectedTypes.filter(value => value !== type); this.applyAppearance(); this.persist(); });
      });
      button(filters, "全部", "恢复显示所有材料类型", () => { this.readState.selectedTypes = []; this.applyAppearance(); this.renderSidebar(); this.persist(); }, "xgr-reset-filter");
      const clear = this.clearSpotlightButton = button(this.sidebar, "清除聚光", "清除材料类型和段落聚光；Escape 也可清除", () => this.clearSpotlight(), "xgr-reset-filter");
      clear.disabled = !this.readState.selectedTypes.length && !this.selectedSegmentIds().length;
      const list = node(this.sidebar, "div", "xgr-paragraph-list");
      this.currentSegments.forEach(segment => {
        const row = button(list, "", segment.title, event => {
          if (segment.type !== "h" && (event.ctrlKey || event.metaKey || this.readState.multiSelect)) this.toggleSegmentSelection(segment.id);
          else this.goToSegment(segment.id);
        }, `xgr-paragraph-row xgr-type-${segment.type}`);
        row.dataset.segmentId = segment.id;
        row.setAttribute("aria-pressed", String(this.selectedSegmentIds().includes(segment.id)));
        const typeDot = node(row, "span", "xgr-type-dot", "●");
        typeDot.title = TYPES[segment.type] || segment.type;
        typeDot.setAttribute("aria-label", TYPES[segment.type] || segment.type);
        node(row, "span", "xgr-row-title", segment.displayTitle || segment.title);
      });
      this.highlightCurrentSegment();
    } else if (this.readState.tab === "概念") {
      node(this.sidebar, "h2", "xgr-panel-heading", "概念");
      this.conceptInput = node(this.sidebar, "input", "xgr-concept-search"); this.conceptInput.type = "search";
      this.conceptInput.placeholder = "查概念、定义或来源章节"; this.conceptInput.setAttribute("aria-label", "搜索本地概念索引"); this.conceptInput.value = query; this.conceptQuery = query;
      this.conceptResults = node(this.sidebar, "div", "xgr-concept-results");
      this.conceptInput.addEventListener("input", () => { this.conceptQuery = this.conceptInput.value; this.renderConcepts(); });
      this.renderConcepts();
    }
  }
  renderConcepts() {
    if (!this.conceptResults) return;
    this.conceptResults.replaceChildren();
    const results = searchConcepts(this.book, this.conceptQuery || "");
    if (!results.length) { node(this.conceptResults, "p", "xgr-empty", "未找到匹配概念。"); return; }
    results.forEach(concept => {
      const unit = this.book.units.find(item => item.id === concept.unitId);
      const card = node(this.conceptResults, "div", "xgr-concept-card");
      button(card, concept.term, `返回“${concept.term}”的正文`, async () => {
        if (!unit) return;
        if (this.unit.id === unit.id) this.goToSegment(concept.segmentId);
        else await this.openUnit(unit.id, false, concept.segmentId);
      }, "xgr-concept-term");
      node(card, "p", "xgr-concept-definition", cleanText(concept.definition));
      if (unit) button(card, unit.title, "打开概念的来源章节", () => this.openUnit(unit.id, false, concept.segmentId), "xgr-concept-source");
    });
  }
  applyAppearance() {
    if (!this.shell) return;
    this.shell.style.setProperty("--xgr-font-size", `${this.readState.fontSize}px`);
    this.shell.classList.toggle("xgr-sidebar-open", this.readState.sidebarOpen);
    this.shell.classList.toggle("xgr-names-only", this.readState.namesOnly);
    if (this.sidebarButton) this.sidebarButton.setAttribute("aria-pressed", String(this.readState.sidebarOpen));
    if (this.clearSpotlightButton) this.clearSpotlightButton.disabled = !this.readState.selectedTypes.length && !this.selectedSegmentIds().length;
    if (this.tabButtons) this.tabButtons.forEach((element, tab) => { element.classList.toggle("is-active", tab === this.readState.tab); element.setAttribute("aria-pressed", String(tab === this.readState.tab)); });
    this.sectionMap.forEach((section, id) => {
      const type = section.dataset.type;
      const ids = this.selectedSegmentIds();
      section.classList.toggle("xgr-muted", !!type && !spotlightVisible(type, id, this.readState.selectedTypes, ids));
      section.classList.toggle("xgr-segment-selected", !!type && ids.includes(id));
    });
  }
  selectedSegmentIds() { return this.unit ? this.readState.segmentSelections[this.unit.id] || [] : []; }
  toggleSegmentSelection(id) {
    const segment = this.currentSegments.find(item => item.id === id && item.type !== "h");
    if (!segment) return;
    const ids = this.selectedSegmentIds();
    this.readState.segmentSelections = { ...this.readState.segmentSelections, [this.unit.id]: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] };
    this.applyAppearance(); this.renderSidebar(); this.persist();
  }
  selectFamily(segment) {
    const family = relationFamily(this.unit, segment); if (!family.length) return;
    this.readState.selectedTypes = [];
    this.readState.segmentSelections = { ...this.readState.segmentSelections, [this.unit.id]: family };
    this.applyAppearance(); this.renderSidebar(); this.persist();
  }
  clearSpotlight() {
    this.readState.selectedTypes = [];
    if (this.unit) this.readState.segmentSelections = { ...this.readState.segmentSelections, [this.unit.id]: [] };
    this.applyAppearance(); this.renderSidebar(); this.persist();
  }
  async toggleGuide() {
    if (this.guideOpen) { this.closeGuide(); return; }
    if (!this.unit?.guidePath || this.guideButton.hidden) return;
    this.guideOpen = true;
    if (this.pendingUnit) { this.showGuideLoading(this.pendingUnit); return; }
    await this.renderGuide();
  }
  showGuideLoading(unit) {
    ++this.guideGeneration;
    if (this.guideComponent) { this.removeChild(this.guideComponent); this.guideComponent = null; }
    this.guidePanel.replaceChildren(); this.guidePanel.hidden = false; this.guidePanel.setAttribute("aria-busy", "true");
    this.shell.classList.add("xgr-guide-open"); this.guideButton.setAttribute("aria-pressed", "true");
    const tools = node(this.guidePanel, "div", "xgr-guide-tools");
    node(tools, "strong", "", "解说"); button(tools, "×", "关闭解说栏", () => this.closeGuide());
    const scroll = node(this.guidePanel, "div", "xgr-guide-scroll");
    const loading = node(scroll, "p", "xgr-load-message", "正在载入本章解说…"); loading.setAttribute("role", "status");
    node(scroll, "p", "xgr-load-message", unit.title);
    // Retain the detached prior scroll only to restore a same-chapter refresh;
    // its component is unloaded and its generation cannot update this panel.
  }
  closeGuide() {
    this.guideOpen = false; ++this.guideGeneration;
    if (this.guideComponent) { this.removeChild(this.guideComponent); this.guideComponent = null; }
    if (this.guidePanel) { this.guidePanel.hidden = true; this.guidePanel.replaceChildren(); this.guidePanel.setAttribute("aria-busy", "false"); }
    if (this.shell) this.shell.classList.remove("xgr-guide-open");
    if (this.guideButton) this.guideButton.setAttribute("aria-pressed", "false");
  }
  async renderGuide() {
    if (this.pendingUnit && this.guideOpen && !this.closed) { this.showGuideLoading(this.pendingUnit); return; }
    const unit = this.unit, bookPath = this.bookPath;
    const path = unit?.guidePath, file = path && this.app.vault.getAbstractFileByPath(path);
    if (!this.guideOpen || !file || this.closed) { this.closeGuide(); return; }
    const sectionKey = `${unit.id}\n${path}\n${unit.guideHeading || ""}`;
    const generation = ++this.guideGeneration, offset = this.guideSectionKey === sectionKey ? this.guideScroll?.scrollTop || 0 : 0;
    this.guideSectionKey = sectionKey;
    if (this.guideComponent) this.removeChild(this.guideComponent);
    const component = this.addChild(new Component()); this.guideComponent = component;
    this.guidePanel.replaceChildren(); this.guidePanel.hidden = false; this.guidePanel.setAttribute("aria-busy", "true");
    this.shell.classList.add("xgr-guide-open"); this.guideButton.setAttribute("aria-pressed", "true");
    const tools = node(this.guidePanel, "div", "xgr-guide-tools");
    node(tools, "strong", "", "解说");
    button(tools, "笔记", "在原生笔记中编辑本章解说", () => this.app.workspace.openLinkText(`${path}${unit.guideHeading ? `#${unit.guideHeading}` : ""}`, unit.path, "tab"));
    button(tools, "×", "关闭解说栏", () => this.closeGuide());
    const scroll = node(this.guidePanel, "div", "xgr-guide-scroll"); scroll.setAttribute("aria-label", "本章解说"); scroll.tabIndex = 0; this.guideScroll = scroll;
    const loading = node(scroll, "p", "xgr-load-message", "正在载入本章解说…"); loading.setAttribute("role", "status");
    const article = node(scroll, "article", "xgr-article markdown-rendered");
    article.style.visibility = "hidden"; article.setAttribute("aria-hidden", "true");
    component.registerDomEvent(scroll, "click", event => this.handleReadingClick(event, article, scroll, path), true);
    const isCurrent = () => !this.closed && this.guideOpen && generation === this.guideGeneration;
    const reveal = () => {
      loading.remove(); article.style.visibility = ""; article.setAttribute("aria-hidden", "false");
      this.guidePanel.setAttribute("aria-busy", "false");
    };
    try {
      const source = await this.app.vault.read(file);
      if (!isCurrent()) return;
      const markdown = rewriteImageEmbeds(readGuideSection(source, unit.guideHeading), this.app, path, bookPath);
      if (typeof MarkdownRenderer.render === "function") await MarkdownRenderer.render(this.app, markdown, article, path, component);
      else await MarkdownRenderer.renderMarkdown(markdown, article, path, component);
      if (!isCurrent()) return;
      reveal(); scroll.scrollTop = offset;
    } catch (error) {
      if (!isCurrent()) return;
      article.replaceChildren(); node(article, "p", "", error.message || "暂时无法读取解说笔记。").setAttribute("role", "alert");
      reveal();
    }
  }
  setFont(delta) {
    this.capturePosition();
    const position = this.unit && this.plugin.stateFor(this.bookPath).positions[this.unit.id] ? { ...this.plugin.stateFor(this.bookPath).positions[this.unit.id] } : null;
    this.readState.fontSize = Math.max(15, Math.min(30, this.readState.fontSize + delta));
    this.applyAppearance();
    if (position && !this.rendering) this.restoreReadingPosition(position);
    this.persist();
  }
  moveChapter(delta) { const index = this.book.units.indexOf(this.unit) + delta; if (index >= 0 && index < this.book.units.length) this.openUnit(this.book.units[index].id); }
  moveParagraph(delta) {
    const materials = this.currentSegments.filter(segment => segment.type !== "h" && this.sectionMap.has(segment.id));
    if (!materials.length) return;
    const nearest = this.nearestSegment();
    const current = materials.findIndex(segment => nearest && segment.id === nearest.id);
    const index = current < 0 ? (delta > 0 ? 0 : materials.length - 1) : Math.max(0, Math.min(materials.length - 1, current + delta));
    this.goToSegment(materials[index].id);
  }
  goToSegment(id) {
    const section = this.sectionMap.get(id);
    if (!section) { this.scrollEl.scrollTop = 0; return; }
    clearTimeout(this.restoreTimer); this.restoring = false; this.restorePosition = null; this.pendingRestorePosition = null;
    if (!hasReadingLayout(this.scrollEl) || this.rendering) { this.pendingSegmentId = id; return; }
    this.pendingSegmentId = "";
    this.scrollEl.scrollTop = Math.max(0, this.scrollEl.scrollTop + section.getBoundingClientRect().top - this.scrollEl.getBoundingClientRect().top - 22);
    section.classList.add("xgr-arrival"); setTimeout(() => section.classList.remove("xgr-arrival"), 1000);
    this.capturePosition(); this.persist(); this.highlightCurrentSegment();
  }
  goToHeading(title, anchor) {
    const heading = Array.from(this.article.querySelectorAll("h1,h2,h3,h4,h5,h6")).find(item => keyText(item.textContent) === keyText(title) || (anchor && item.id === anchor));
    if (heading) this.scrollEl.scrollTop = Math.max(0, this.scrollEl.scrollTop + heading.getBoundingClientRect().top - this.scrollEl.getBoundingClientRect().top - 22);
  }
  nearestSegment() {
    if (!this.scrollEl) return null;
    return closestVisibleSegment(this.sectionMap, this.scrollEl.getBoundingClientRect().top + 42);
  }
  capturePosition() {
    if (!this.unit || !hasReadingLayout(this.scrollEl) || this.restoring || this.rendering || this.chapterLoadFailed || this.pendingRestorePosition || this.pendingSegmentId) return;
    const nearest = this.nearestSegment();
    this.plugin.stateFor(this.bookPath).positions[this.unit.id] = { top: this.scrollEl.scrollTop, segmentId: nearest ? nearest.id : "", offset: nearest ? this.scrollEl.getBoundingClientRect().top - nearest.element.getBoundingClientRect().top : 0 };
  }
  restoreReadingPosition(position) {
    if (!hasReadingLayout(this.scrollEl)) {
      this.pendingRestorePosition = { ...position };
      this.restoring = false; this.restorePosition = null; clearTimeout(this.restoreTimer);
      return;
    }
    this.pendingRestorePosition = null;
    this.restoring = true; this.restorePosition = position;
    const section = this.sectionMap.get(position.segmentId);
    this.scrollEl.scrollTop = section ? Math.max(0, this.scrollEl.scrollTop + section.getBoundingClientRect().top - this.scrollEl.getBoundingClientRect().top + (position.offset || 0)) : Math.max(0, position.top || 0);
    clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => { this.restoring = false; this.restorePosition = null; this.capturePosition(); this.persist(); this.highlightCurrentSegment(); }, 700);
  }
  resumeReading() {
    if (this.closed || !hasReadingLayout(this.scrollEl)) return;
    this.applyAppearance();
    if (this.pendingSegmentId && !this.rendering) { this.goToSegment(this.pendingSegmentId); return; }
    const saved = this.pendingRestorePosition || (this.unit && this.plugin.stateFor(this.bookPath).positions[this.unit.id]);
    if (saved && !this.rendering) this.restoreReadingPosition({ ...saved });
  }
  highlightCurrentSegment() {
    const nearest = this.nearestSegment();
    if (this.sidebar) this.sidebar.querySelectorAll(".xgr-paragraph-row").forEach(row => row.classList.toggle("is-current", !!nearest && row.dataset.segmentId === nearest.id));
  }
  async openSourceNote() {
    if (!this.unit) return;
    this.capturePosition(); this.persist(); await this.plugin.flushSave();
    await this.app.workspace.openLinkText(this.unit.path, this.unit.path, "tab");
  }
  async openHome() {
    const path = `${this.bookPath}/00 开始阅读.md`;
    if (!this.app.vault.getAbstractFileByPath(path)) return;
    this.capturePosition(); this.persist(); await this.plugin.flushSave();
    await this.app.workspace.openLinkText(path, this.unit?.path || path, "tab");
  }
  async openOverview() {
    const path = normalizePath(this.book.overviewPath || `${this.bookPath}/Excalidraw/全书目录.excalidraw.md`);
    if (!this.app.vault.getAbstractFileByPath(path)) {
      if (path !== `${this.bookPath}/Excalidraw/全书目录.excalidraw.md`) { new Notice("指定的全书目录图不存在，请检查本地路径。"); return; }
      try {
        if (!this.plugin.mapBuildPromise) {
          const ea = typeof window !== "undefined" ? window.ExcalidrawAutomate : null;
          if (!ea) { new Notice("请先启用当前知识库的 Excalidraw 插件，再打开全书目录图。"); return; }
          this.plugin.mapBuildPromise = createBookIndex(ea, this.book).finally(() => { this.plugin.mapBuildPromise = null; });
        }
        await this.plugin.mapBuildPromise;
      } catch (error) { new Notice(`全书目录图未能生成：${error.message || error}`); return; }
    }
    if (!this.app.vault.getAbstractFileByPath(path)) { new Notice("全书目录图暂不可用，请使用目录继续阅读。"); return; }
    await this.app.workspace.openLinkText(path, this.unit ? this.unit.path : `${this.bookPath}/00 开始阅读.md`, "tab");
  }
  openOriginalPage(page) {
    if (!this.unit) return;
    const nearest = this.nearestSegment();
    const segment = nearest && this.currentSegments.find(item => item.id === nearest.id);
    const number = Number(page || (segment && segment.page) || this.unit.pdfStart);
    if (!Number.isInteger(number) || number < 1) return;
    const path = this.originalPagePath(number);
    if (!path) { new Notice("这本书没有对应的原扫描页，请在笔记中查看原文。"); return; }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) { new Notice("此页的原扫描图片暂不可用。"); return; }
    new OriginalImageModal(this.app, this.app.vault.adapter.getResourcePath(path), `原扫描 · PDF ${number}`).open();
  }
  originalPagePath(number) {
    if (!Number.isInteger(Number(number)) || Number(number) < 1) return null;
    const template = this.book && this.book.pageImageTemplate || `${this.bookPath}/Assets/Pages/page-{page:04}.png`;
    const path = normalizePath(template.replace("{page:04}", String(number).padStart(4, "0")).replace("{page}", String(number)));
    return path.startsWith(`${this.bookPath}/`) && this.app.vault.getAbstractFileByPath(path) ? path : null;
  }
  handleReadingClick(event, article = this.article, scroll = this.scrollEl, sourcePath = this.unit.path) {
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    if (article === this.article && (event.ctrlKey || event.metaKey) && !target.closest("a, button, input, img")) {
      const section = target.closest(".xgr-segment");
      if (section && article.contains(section)) { event.preventDefault(); event.stopPropagation(); this.toggleSegmentSelection(section.dataset.segmentId); return; }
    }
    const image = target.closest("img");
    if (image && article.contains(image)) {
      const embed = image.closest(".internal-embed");
      const source = embed && (embed.getAttribute("src") || embed.dataset.href);
      event.preventDefault(); event.stopPropagation();
      if (source && /\.excalidraw(?:\.md)?(?:#|$)/i.test(source)) this.app.workspace.openLinkText(source, sourcePath, "tab");
      else new OriginalImageModal(this.app, image.currentSrc || image.src, image.alt || "原图").open();
      return;
    }
    const anchor = target.closest("a");
    if (!anchor || !article.contains(anchor)) return;
    const href = anchor.getAttribute("data-href") || anchor.getAttribute("href") || "";
    if (href.startsWith("#") && (anchor.classList.contains("footnote-link") || anchor.classList.contains("footnote-backref") || anchor.classList.contains("footnote-ref") || /#(?:fn|fnref)/.test(href))) {
      let id; try { id = decodeURIComponent(href.slice(1)); } catch (_) { id = href.slice(1); }
      const destination = Array.from(article.querySelectorAll("[id]")).find(element => element.id === id);
      if (destination) { event.preventDefault(); event.stopPropagation(); scroll.scrollTop += destination.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 20; }
    } else if (anchor.classList.contains("internal-link")) {
      event.preventDefault(); event.stopPropagation();
      this.app.workspace.openLinkText(href, sourcePath, "tab");
    }
  }
  persist() {
    const latest = this.plugin.stateFor(this.bookPath);
    this.plugin.libraryData.books[this.bookPath] = { ...this.readState, positions: latest.positions, sourceUnitIds: latest.sourceUnitIds };
    this.plugin.queueSave();
  }
  async onClose() {
    this.capturePosition(); this.persist(); this.closed = true; ++this.renderGeneration; ++this.refreshGeneration;
    this.pendingSegmentId = ""; this.pendingUnit = null; this.rendering = false;
    clearTimeout(this.scrollTimer); clearTimeout(this.restoreTimer);
    if (this.interfaceComponent) { this.removeChild(this.interfaceComponent); this.interfaceComponent = null; }
    this.contentEl.classList.remove("xgr-view");
    if (this.renderComponent) { this.removeChild(this.renderComponent); this.renderComponent = null; }
    this.closeGuide();
    this.contentEl.replaceChildren();
    await this.plugin.flushSave();
  }
}

class BookShelfModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.books = []; }
  async onOpen() {
    this.modalEl.classList.add("xgr-library-modal"); this.titleEl.textContent = "书架";
    const search = node(this.contentEl, "input", "xgr-library-search"); search.type = "search"; search.placeholder = "查找书名或作者"; search.setAttribute("aria-label", "查找本地书籍");
    const list = node(this.contentEl, "div", "xgr-library-list");
    const render = () => {
      list.replaceChildren(); const query = keyText(search.value).toLocaleLowerCase();
      const matches = this.books.filter(book => !query || keyText(`${book.title} ${book.author} ${book.bookPath}`).toLocaleLowerCase().includes(query));
      if (!matches.length) node(list, "p", "xgr-library-empty", this.books.length ? "未找到匹配书籍。" : "从一个章节文件夹加入第一本书。");
      matches.forEach(book => {
        const row = button(list, "", `阅读${book.title}`, async () => {
          this.close(); try { await this.plugin.openReader("", "", book.bookPath); } catch (error) { new Notice(error.message || "无法打开书籍。"); }
        }, "xgr-library-row");
        node(row, "strong", "", book.title); node(row, "span", "", `${book.author ? `${book.author} · ` : ""}${book.units}个阅读单元`);
        node(row, "small", "", book.bookPath);
      });
    };
    search.addEventListener("input", render);
    const footer = node(this.contentEl, "div", "xgr-library-footer");
    button(footer, "从文件夹加入书籍", "选择已存在的 Markdown 章节文件夹", () => { this.close(); this.plugin.openFolderPicker(); });
    this.books = await this.plugin.discoverBooks(); render(); search.focus();
  }
  onClose() { this.contentEl.replaceChildren(); }
}
class BookFolderModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    this.modalEl.classList.add("xgr-library-modal"); this.titleEl.textContent = "选择章节文件夹";
    node(this.contentEl, "p", "xgr-library-help", "选择存放章节笔记的文件夹。可编辑的 Markdown 是书籍正文；Excalidraw 绘图继续作为插图和图谱。");
    const search = node(this.contentEl, "input", "xgr-library-search"); search.type = "search"; search.placeholder = "查找文件夹"; search.setAttribute("aria-label", "查找章节文件夹");
    const list = node(this.contentEl, "div", "xgr-library-list"), folders = this.plugin.chapterFolders();
    const render = () => {
      list.replaceChildren(); const query = search.value.trim().toLocaleLowerCase(), matches = folders.filter(folder => !query || folder.toLocaleLowerCase().includes(query));
      if (!matches.length) node(list, "p", "xgr-library-empty", "未找到包含 Markdown 章节的文件夹。");
      matches.forEach(folder => button(list, folder, `选择${folder}`, async () => {
        try { const draft = await this.plugin.draftBook(folder); this.close(); new BookSetupModal(this.app, this.plugin, draft).open(); }
        catch (error) { new Notice(error.message || "无法读取这个章节文件夹。"); }
      }, "xgr-library-folder"));
    };
    search.addEventListener("input", render); render(); search.focus();
  }
  onClose() { this.contentEl.replaceChildren(); }
}
class BookSetupModal extends Modal {
  constructor(app, plugin, draft) { super(app); this.plugin = plugin; this.draft = draft; }
  onOpen() {
    this.modalEl.classList.add("xgr-library-modal"); this.titleEl.textContent = "加入书籍";
    const titleLabel = node(this.contentEl, "label", "xgr-book-field", "书名"), title = node(titleLabel, "input"); title.type = "text"; title.value = this.draft.title;
    const authorLabel = node(this.contentEl, "label", "xgr-book-field", "作者"), author = node(authorLabel, "input"); author.type = "text"; author.value = this.draft.author; author.placeholder = "可留空";
    node(this.contentEl, "p", "xgr-library-help", `${this.draft.units.length}个章节，按笔记中的阅读顺序和文件名排列。`);
    const preview = node(this.contentEl, "ol", "xgr-book-preview");
    this.draft.units.forEach(unit => node(preview, "li", "", unit.title));
    const footer = node(this.contentEl, "div", "xgr-library-footer");
    const submit = button(footer, "加入并开始阅读", "加入这本书并打开阅读器", async () => {
      if (!title.value.trim()) { title.focus(); return; }
      submit.disabled = true;
      try { await this.plugin.createBookManifest({ ...this.draft, title: title.value.trim(), author: author.value.trim() }); this.close(); await this.plugin.openReader("", "", this.draft.bookPath); }
      catch (error) { new Notice(error.message || "书籍未能加入。"); submit.disabled = false; }
    });
    button(footer, "返回", "重新选择章节文件夹", () => { this.close(); this.plugin.openFolderPicker(); });
  }
  onClose() { this.contentEl.replaceChildren(); }
}
class XuexiguanReader extends Plugin {
  async onload() {
    const loaded = await this.loadData(), discovered = await this.discoverBooks();
    this.libraryData = migrateLibraryData(loaded, discovered[0]?.bookPath || "");
    this.saveChain = Promise.resolve(); this.saveTimer = null; this.sourceTimer = null; this.captionCropChecks = new Map(); this.pendingSourceViews = new Set();
    this.registerView(VIEW_TYPE, leaf => new ReaderView(leaf, this));
    this.addRibbonIcon("book-open", "打开电子书阅读器", () => this.openReader());
    this.addCommand({ id: "open-reader", name: "打开电子书阅读器", callback: () => this.openReader() });
    this.addCommand({ id: "choose-book", name: "打开书架", callback: () => this.openShelf() });
    this.addCommand({ id: "add-book-folder", name: "从章节文件夹加入书籍", callback: () => this.openFolderPicker() });
    this.addCommand({ id: "open-book", name: "阅读当前书籍", callback: () => this.openReader() });
    this.addCommand({ id: "reload-book", name: "刷新当前书籍", callback: async () => { await Promise.all(this.app.workspace.getLeavesOfType(VIEW_TYPE).map(leaf => leaf.view.refreshSources(true))); } });
    const handleProtocol = params => {
      if (params.vault && params.vault !== this.app.vault.getName()) return;
      this.openReader(params.unit || params.unitId || "", params.segment || params.segmentId || "", params.book || this.libraryData.activeBook);
    };
    this.registerObsidianProtocolHandler("xuexiguan-reader", params => handleProtocol(params));
    this.registerObsidianProtocolHandler("jiangou-reader", params => handleProtocol(params));
    this.registerEvent(this.app.vault.on("modify", file => this.sourceModified(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.sourceModified(file, oldPath)));
    this.registerEvent(this.app.vault.on("delete", file => this.sourceModified(file)));
    this.registerEvent(this.app.vault.on("create", file => this.sourceModified(file)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
      if (leaf && leaf.view instanceof ReaderView) setTimeout(() => leaf.view.resumeReading(), 0);
    }));
  }
  stateFor(bookPath) {
    const path = safeBookPath(bookPath);
    if (!this.libraryData.books[path]) this.libraryData.books[path] = normalizeReadState({});
    return this.libraryData.books[path];
  }
  openShelf() { new BookShelfModal(this.app, this).open(); }
  openFolderPicker() { new BookFolderModal(this.app, this).open(); }
  chapterFolders() {
    const folders = new Set();
    this.app.vault.getMarkdownFiles().filter(file => !file.path.endsWith(".excalidraw.md") && !this.app.metadataCache.getFileCache(file)?.frontmatter?.["excalidraw-plugin"]).forEach(file => {
      const parts = file.path.split("/"); parts.pop();
      while (parts.length) { const folder = parts.join("/"); if (!parts.some(part => part.startsWith("."))) folders.add(folder); parts.pop(); }
    });
    return [...folders].sort(new Intl.Collator("zh-CN", { numeric: true }).compare);
  }
  async discoverBooks() {
    const files = this.app.vault.getFiles().filter(file => file.path.endsWith("/Assets/Reader/book.json"));
    const books = await Promise.all(files.map(async file => {
      try {
        const bookPath = file.path.slice(0, -"/Assets/Reader/book.json".length), book = validBook(JSON.parse(await this.app.vault.read(file)), bookPath);
        return { bookPath, title: book.title, author: book.author, units: book.units.length };
      } catch (_) { return null; }
    }));
    return books.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  }
  async scanFolder(folder) {
    const sourceFolder = safeBookPath(folder);
    const files = this.app.vault.getMarkdownFiles().filter(file => {
      if (!file.path.startsWith(`${sourceFolder}/`) || file.path.endsWith(".excalidraw.md")) return false;
      const relative = file.path.slice(sourceFolder.length + 1), parts = relative.split("/").slice(0, -1);
      return !parts.some(part => part.startsWith(".") || ["Assets", "Excalidraw", "知识网络", "附录"].includes(part)) && !this.app.metadataCache.getFileCache(file)?.frontmatter?.["excalidraw-plugin"];
    });
    const metadata = await Promise.all(files.map(async file => {
      const markdown = await this.app.vault.read(file), frontmatter = sourceFrontmatter(markdown, this.app.metadataCache.getFileCache(file)?.frontmatter);
      return { unit: unitMetadata(file, markdown, frontmatter), frontmatter };
    }));
    if (!metadata.length) throw new Error("这个文件夹没有可加入的 Markdown 章节。");
    return { units: orderUnits(metadata.map(item => item.unit)), frontmatter: metadata.map(item => item.frontmatter) };
  }
  async draftBook(folder) {
    const bookPath = safeBookPath(folder), manifestPath = `${bookPath}/Assets/Reader/book.json`;
    if (this.app.vault.getAbstractFileByPath(manifestPath)) throw new Error("这本书已在书架中，请从书架直接打开。");
    const sourceFolder = this.app.vault.getAbstractFileByPath(`${bookPath}/正文`) ? `${bookPath}/正文` : bookPath;
    const scan = await this.scanFolder(sourceFolder), first = scan.frontmatter.find(fm => fm.booktitle || fm["book-title"] || fm["书名"]) || scan.frontmatter[0] || {};
    const author = scan.frontmatter.find(fm => fm.author || fm["作者"]) || {};
    return { schema: 1, bookPath, sourceFolder, generatedFromFolder: true, title: String(first.booktitle || first["book-title"] || first["书名"] || bookPath.split("/").pop()),
      author: String(author.author || author["作者"] || ""), units: scan.units, concepts: [], overviewPath: `${bookPath}/Excalidraw/全书目录.excalidraw.md` };
  }
  async createBookManifest(draft) {
    const data = validBook(draft, draft.bookPath), path = `${data.bookPath}/Assets/Reader/book.json`;
    if (this.app.vault.getAbstractFileByPath(path)) throw new Error("这本书已经加入，请直接从书架打开。");
    await ensureVaultFolder(this.app, `${data.bookPath}/Assets/Reader`);
    await this.app.vault.create(path, JSON.stringify(data, null, 2));
    this.libraryData.books[data.bookPath] = normalizeReadState({ sourceUnitIds: Object.fromEntries(data.units.map(unit => [unit.path, unit.id])) }); this.libraryData.activeBook = data.bookPath; this.queueSave();
  }
  sourceModified(file, oldPath = "") {
    if (!file) return;
    if (oldPath && file.path.endsWith(".md") && !file.path.endsWith(".excalidraw.md")) {
      let changed = false;
      Object.entries(this.libraryData.books).forEach(([bookPath, state]) => {
        if (!file.path.startsWith(`${bookPath}/`)) return;
        const registry = state.sourceUnitIds || {}, oldId = registry[oldPath];
        if (!oldId) return;
        const updated = { ...registry, [file.path]: oldId }; delete updated[oldPath];
        state.sourceUnitIds = updated; changed = true;
      });
      if (changed) this.queueSave();
    }
    const affected = this.app.workspace.getLeavesOfType(VIEW_TYPE).filter(leaf => {
      const book = leaf.view.book;
      return book && [file.path, oldPath].some(path => path === `${book.bookPath}/Assets/Reader/book.json` || book.units.some(unit => unit.path === path || unit.guidePath === path) || book.generatedFromFolder && path && path.startsWith(`${book.sourceFolder}/`) && path.endsWith(".md") && !path.endsWith(".excalidraw.md"));
    });
    if (!affected.length) return;
    affected.forEach(leaf => this.pendingSourceViews.add(leaf));
    clearTimeout(this.sourceTimer);
    this.sourceTimer = setTimeout(() => { const pending = [...this.pendingSourceViews]; this.pendingSourceViews.clear(); pending.forEach(leaf => { if (!leaf.view.closed) leaf.view.refreshSources(); }); }, 350);
  }
  async readUnit(metadata) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(metadata.path));
    if (!file || file.extension !== "md") throw new Error(`找不到本章 Markdown 书稿：${metadata.title}`);
    return liveUnit(metadata, await this.app.vault.read(file));
  }
  async matchesAuditedCaptionCrop(bookPath, filename, expectedHash) {
    const path = normalizePath(`${bookPath}/Assets/Figures/${filename}`), file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !file.stat) return false;
    const key = `${path}:${file.stat.mtime}:${file.stat.size}:${expectedHash}`;
    if (!this.captionCropChecks.has(key)) this.captionCropChecks.set(key, this.app.vault.readBinary(file).then(binarySha256).then(hash => hash === expectedHash).catch(() => false));
    return await this.captionCropChecks.get(key);
  }
  async readBook(bookPath = this.libraryData.activeBook) {
    const path = safeBookPath(bookPath), manifest = JSON.parse(await this.app.vault.adapter.read(`${path}/Assets/Reader/book.json`));
    if (manifest.generatedFromFolder) {
      const sourceFolder = safeBookPath(manifest.sourceFolder || path);
      if (sourceFolder !== path && !sourceFolder.startsWith(`${path}/`)) throw new Error("章节文件夹应位于这本书的文件夹内。");
      const state = this.stateFor(path), sourceUnits = manifest.units || [], fallback = Object.fromEntries(sourceUnits.map(unit => [unit.path, unit.id])), reserved = new Set(Object.values(state.sourceUnitIds));
      manifest.units = (await this.scanFolder(sourceFolder)).units.map(unit => {
        const id = state.sourceUnitIds[unit.path] || (!reserved.has(fallback[unit.path]) && fallback[unit.path]) || unit.id;
        const previous = sourceUnits.find(source => source.path === unit.path || source.id === id) || {};
        return { ...previous, ...unit, id, guidePath: previous.guidePath || "", guideHeading: previous.guideHeading || "", relations: previous.relations || [], segments: previous.segments || [] };
      });
      const currentIds = { ...state.sourceUnitIds, ...Object.fromEntries(manifest.units.map(unit => [unit.path, unit.id])) };
      if (JSON.stringify(currentIds) !== JSON.stringify(state.sourceUnitIds)) { state.sourceUnitIds = currentIds; this.queueSave(); }
    }
    const book = validBook(manifest, path), sourceConcepts = book.concepts;
    const units = await Promise.all(book.units.map(unit => this.readUnit(unit)));
    return { ...book, units, sourceConcepts, concepts: units.flatMap(unit => conceptsFromUnit(unit, sourceConcepts)) };
  }
  async openReader(unitId = "", segmentId = "", bookPath = this.libraryData.activeBook) {
    const requested = bookPath || this.libraryData.activeBook || (await this.discoverBooks())[0]?.bookPath;
    if (!requested) { this.openShelf(); return; }
    const path = safeBookPath(requested);
    if (!this.app.vault.getAbstractFileByPath(`${path}/Assets/Reader/book.json`)) { this.openShelf(); return; }
    this.libraryData.activeBook = path; this.queueSave();
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = this.app.workspace.getLeaf("tab"); await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { bookPath: path, unitId: unitId || this.stateFor(path).unitId } }); }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view.bookPath !== path || !leaf.view.book) await leaf.view.switchBook(path, unitId, segmentId);
    else if (unitId) await leaf.view.openUnit(unitId, true, segmentId);
    setTimeout(() => { if (!leaf.view.closed && leaf.view instanceof ReaderView) leaf.view.resumeReading(); }, 0);
  }
  queueSave() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flushSave(), 250); }
  async flushSave() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    const snapshot = JSON.parse(JSON.stringify(this.libraryData));
    this.saveChain = this.saveChain.catch(() => {}).then(() => this.saveData(snapshot));
    try { await this.saveChain; } catch (_) { new Notice("阅读位置未能保存，请检查知识库文件权限。"); }
  }
  onunload() {
    clearTimeout(this.saveTimer); clearTimeout(this.sourceTimer);
    this.flushSave();
  }
}

module.exports = XuexiguanReader;
module.exports._testing = { parseModevolLine, prepareMarkdown, validBook, liveUnit, conceptsFromUnit, splitAnnotatedMarkdown, readGuideSection, searchConcepts, rewriteImageEmbeds, resolveAsset, closestVisibleSegment, hasReadingLayout, standaloneFigureCaption, auditedFigureImage, binarySha256, explicitDescriptionRelation, relationFamily, spotlightVisible, ReaderView, markdownCodeRanges, safeBookPath, normalizeReadState, migrateLibraryData, sourceFrontmatter, unitMetadata, orderUnits, createBookIndex, VIEW_TYPE };
