"use strict";
const fs = require("fs"), path = require("path"), Module = require("module"), assert = require("assert/strict");
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "obsidian") return { Plugin: class {}, ItemView: class {}, Component: class {}, MarkdownRenderer: {}, Modal: class {}, Notice: class {}, normalizePath: value => value.replace(/\\/g, "/") };
  return originalLoad.call(this, name, ...args);
};
const h = require("./main.js")._testing;
Module._load = originalLoad;
const demoRoot = path.join(__dirname, "examples"), bookPath = "Demo/Temperature";
const manifest = JSON.parse(fs.readFileSync(path.join(demoRoot, bookPath, "Assets/Reader/book.json"), "utf8"));
const book = h.validBook(manifest, bookPath), sourcePrefixHashes = [];
assert.equal(book.units.length, 2);
assert.equal(book.title, "温度比较演示");
const concepts = [];
for (const unit of book.units) {
  const markdown = fs.readFileSync(path.join(demoRoot, unit.path), "utf8"), live = h.liveUnit(unit, markdown);
  const split = h.splitAnnotatedMarkdown(markdown, unit.id), prepared = h.prepareMarkdown(live);
  assert(split.boundary); assert(split.annotation.startsWith(`%% xgr-annotation-start:${unit.id} %%`));
  assert(prepared.hasAnnotation && prepared.markdown.endsWith(split.annotation));
  assert(!live.outline.some(heading => heading.title === "解说与批注（编者）"));
  const guide = fs.readFileSync(path.join(demoRoot, unit.guidePath), "utf8"), section = h.readGuideSection(guide, unit.guideHeading);
  assert(section.startsWith(`## ${unit.guideHeading}\n`));
  assert.equal((section.match(/^## /gm) || []).length, 1);
  const embeds = [...split.annotation.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)];
  assert.equal(embeds.length, 1);
  const [target, heading] = embeds[0][1].split("#");
  assert.equal(target + ".md", unit.guidePath); assert.equal(heading, unit.guideHeading);
  assert(fs.existsSync(path.join(demoRoot, target + ".md")));
  concepts.push(...h.conceptsFromUnit(live));
  sourcePrefixHashes.push({ id: unit.id, sha256: require("crypto").createHash("sha256").update(split.source).digest("hex") });
  if (unit.id === "demo-01") {
    assert(live.segments.some(segment => segment.id === "demo-temperature"));
    const example = live.segments.find(segment => segment.id === "demo-blocks");
    assert(example); assert.equal(h.explicitDescriptionRelation(live, example).id, "demo-temperature");
  }
}
assert.deepEqual(concepts.map(concept => concept.term), ["温度", "可比较的观测"]);
const packageMetadata = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const versions = JSON.parse(fs.readFileSync(path.join(__dirname, "versions.json"), "utf8"));
const pluginMetadata = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
assert.equal(packageMetadata.version, pluginMetadata.version); assert.equal(versions[pluginMetadata.version], pluginMetadata.minAppVersion);
console.log(JSON.stringify({ demoUnits: book.units.length, sharedGuideSections: 2, continuousSourceBoundaries: "pass", nativeEmbedTargets: "pass", stableParagraphIds: "pass", concepts: concepts.length, packageVersions: "pass", sourcePrefixHashes, writes: 0, nativeUI: "pending" }));
