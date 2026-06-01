const fs = require("node:fs");
const path = require("node:path");

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function directoryExists(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function readTextIfExists(filePath) {
  if (!fileExists(filePath)) {
    return undefined;
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJsonIfExists(filePath) {
  const text = readTextIfExists(filePath);
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function listFilesRecursive(root, predicate) {
  if (!directoryExists(root)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(absolute, predicate));
    } else if (!predicate || predicate(absolute)) {
      results.push(absolute);
    }
  }
  return results;
}

function writeFileIfAllowed({ root, relativePath, content, force, dryRun }) {
  const absolutePath = path.join(root, relativePath);
  const exists = fileExists(absolutePath);

  if (dryRun) {
    return { status: "dry-run", relativePath, content };
  }

  if (exists && !force) {
    return { status: "skipped", relativePath };
  }

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
  return { status: exists ? "overwritten" : "written", relativePath };
}

module.exports = {
  directoryExists,
  fileExists,
  listFilesRecursive,
  readJsonIfExists,
  readTextIfExists,
  writeFileIfAllowed,
};

