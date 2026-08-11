#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pinyin } = require("pinyin-pro");

const BIG_INTEGER_PREFIX = "__TOWNSQUARE_BIG_INTEGER__";
const ASSET_CONTAINER_KEYS = new Set([
  "image",
  "logo",
  "background",
  "playerAvatars",
  "phaseBackgrounds",
]);
const COMPACT_ROLE_KEYS = [
  "id",
  "name",
  "image",
  "ability",
  "edition",
  "firstNight",
  "firstNightReminder",
  "otherNight",
  "otherNightReminder",
  "reminders",
  "remindersGlobal",
  "setup",
  "team",
];
const COMMUNITY_FILE_PATTERN = /^community-[a-z0-9-]+-[a-f0-9]{8}\.json$/;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

function usage() {
  console.error(
    "Usage: node scripts/import-community-scripts.js <collection-directory> " +
      "[--download-assets|--reuse-assets] [--prune] [--concurrency=N]",
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cleanId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function protectLargeIntegers(text) {
  let result = "";
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < text.length) {
    const character = text[index];
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }

    if (character === "-" || /[0-9]/.test(character)) {
      const match = text
        .slice(index)
        .match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        const token = match[0];
        const digits = token.replace(/^-/, "");
        if (/^-?\d+$/.test(token) && digits.length > 15) {
          result += `"${BIG_INTEGER_PREFIX}${token}"`;
        } else {
          result += token;
        }
        index += token.length;
        continue;
      }
    }

    result += character;
    index += 1;
  }

  return result;
}

function parseJsonPreservingLargeIntegers(text) {
  return JSON.parse(protectLargeIntegers(text));
}

function stringifyJsonPreservingLargeIntegers(value) {
  return `${JSON.stringify(value, null, 2).replace(
    new RegExp(`"${BIG_INTEGER_PREFIX}(-?\\d+)"`, "g"),
    "$1",
  )}\n`;
}

function scriptSlug(name) {
  const phonetic = pinyin(String(name || "script"), {
    toneType: "none",
    type: "array",
  }).join("-");
  const slug = phonetic
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "script";
}

function isRemoteUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isAssetPath(keyPath) {
  return keyPath.some((key) => ASSET_CONTAINER_KEYS.has(String(key)));
}

function collectAssetUrls(value, urls, keyPath = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectAssetUrls(item, urls, keyPath.concat(String(index))),
    );
    return;
  }
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "0")) {
      collectAssetUrls(expandCompactRole(value), urls, keyPath);
      return;
    }
    Object.entries(value).forEach(([key, item]) =>
      collectAssetUrls(item, urls, keyPath.concat(key)),
    );
    return;
  }
  if (isRemoteUrl(value) && isAssetPath(keyPath)) urls.add(value.trim());
}

function expandCompactRole(role) {
  if (!role || typeof role !== "object" || Array.isArray(role)) return role;
  if (!Object.prototype.hasOwnProperty.call(role, "0")) return { ...role };
  const expanded = {};
  Object.entries(role).forEach(([key, value]) => {
    const numericKey = Number.parseInt(key, 10);
    if (String(numericKey) === key && COMPACT_ROLE_KEYS[numericKey]) {
      expanded[COMPACT_ROLE_KEYS[numericKey]] = value;
    } else {
      expanded[key] = value;
    }
  });
  return expanded;
}

function normalizeSetup(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["", "0", "false", "no", "off"].includes(normalized)) return false;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
  }
  return Boolean(value);
}

function hasRoleDefinition(role) {
  return Boolean(role && role.name && role.team && role.ability);
}

function roleSignature(role) {
  const comparable = { ...role };
  delete comparable.id;
  delete comparable.image;
  delete comparable.edition;
  delete comparable.isCustom;
  return JSON.stringify(comparable);
}

function normalizeRoles(items, officialIds, scriptHash, warnings) {
  const expanded = [];
  items.forEach((item, index) => {
    const role =
      typeof item === "string" ? { id: item } : expandCompactRole(item);
    if (!role || typeof role !== "object" || Array.isArray(role)) {
      warnings.push(`丢弃无法识别的第 ${index + 1} 个条目`);
      return;
    }
    if (role.id === "_meta") return;
    if (role.id === undefined || role.id === null || role.id === "") {
      if (!role.name && !role.team && !role.ability) {
        warnings.push(`丢弃没有 ID 的空条目（第 ${index + 1} 个）`);
        return;
      }
      role.id = `community${sha256(
        `${scriptHash}:${index}:${role.name || "role"}`,
      ).slice(0, 12)}`;
      warnings.push(
        `为“${role.name || `第 ${index + 1} 个角色`}”生成缺失的 ID`,
      );
    }
    if (Object.prototype.hasOwnProperty.call(role, "setup")) {
      role.setup = normalizeSetup(role.setup);
    }
    if (hasRoleDefinition(role)) role.edition = "custom";
    expanded.push({
      role,
      index,
      rawId: String(role.id),
      cleanId: cleanId(role.id),
    });
  });

  expanded.forEach((entry) => {
    if (entry.cleanId) return;
    entry.role.id = `community${sha256(
      `${scriptHash}:${entry.index}:${entry.rawId}:${
        entry.role.name || "role"
      }`,
    ).slice(0, 12)}`;
    entry.rawId = String(entry.role.id);
    entry.cleanId = cleanId(entry.role.id);
    warnings.push(`为“${entry.role.name || entry.rawId}”替换无法使用的 ID`);
  });

  const groups = new Map();
  expanded.forEach((entry) => {
    if (!groups.has(entry.cleanId)) groups.set(entry.cleanId, []);
    groups.get(entry.cleanId).push(entry);
  });

  const kept = new Set();
  const idMap = new Map();
  groups.forEach((group, originalCleanId) => {
    const definitions = group.filter(({ role }) => hasRoleDefinition(role));
    const candidates = definitions.length ? definitions : group;
    const signatures = new Set();
    let distinctIndex = 0;

    candidates.forEach((entry) => {
      const signature = hasRoleDefinition(entry.role)
        ? roleSignature(entry.role)
        : JSON.stringify(entry.role);
      if (signatures.has(signature)) {
        warnings.push(`移除重复角色“${entry.role.name || entry.rawId}”`);
        return;
      }
      signatures.add(signature);
      distinctIndex += 1;

      let outputId = entry.rawId;
      if (hasRoleDefinition(entry.role) && officialIds.has(originalCleanId)) {
        outputId = `${originalCleanId}c${scriptHash}`;
        entry.role.imageAlt = originalCleanId;
      }
      if (distinctIndex > 1) {
        outputId = `${cleanId(outputId) || originalCleanId}${distinctIndex}`;
        warnings.push(
          `为冲突角色“${entry.role.name || entry.rawId}”分配 ID ${outputId}`,
        );
      }

      entry.role.id = outputId;
      entry.outputCleanId = cleanId(outputId);
      kept.add(entry);
      if (!idMap.has(originalCleanId)) {
        idMap.set(originalCleanId, entry.outputCleanId);
      }
    });

    group
      .filter((entry) => !candidates.includes(entry))
      .forEach((entry) =>
        warnings.push(`移除被完整定义替代的 ID 引用“${entry.rawId}”`),
      );
  });

  const result = expanded
    .filter((entry) => kept.has(entry))
    .sort((left, right) => left.index - right.index)
    .map(({ role }) => role);

  result.forEach((role) => {
    if (!Array.isArray(role.jinxes)) return;
    role.jinxes.forEach((jinx) => {
      if (!jinx || typeof jinx !== "object" || !jinx.id) return;
      const replacement = idMap.get(cleanId(jinx.id));
      if (replacement) jinx.id = replacement;
    });
  });

  return { roles: result, idMap };
}

function updateMetaRoleOrder(meta, idMap) {
  ["firstNight", "otherNight"].forEach((key) => {
    if (!Array.isArray(meta[key])) return;
    meta[key] = meta[key].map((id) => {
      const replacement = idMap.get(cleanId(id));
      return replacement || id;
    });
  });
}

function localizeAssets(value, assetMap, failures, keyPath = []) {
  if (Array.isArray(value)) {
    return value
      .map((item, index) =>
        localizeAssets(item, assetMap, failures, keyPath.concat(String(index))),
      )
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "0")) {
      return localizeAssets(
        expandCompactRole(value),
        assetMap,
        failures,
        keyPath,
      );
    }
    const localized = {};
    Object.entries(value).forEach(([key, item]) => {
      const converted = localizeAssets(
        item,
        assetMap,
        failures,
        keyPath.concat(key),
      );
      if (converted !== undefined) localized[key] = converted;
    });
    return localized;
  }
  if (typeof value === "string" && isAssetPath(keyPath)) {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (isRemoteUrl(trimmed)) {
      const localPath = assetMap[trimmed];
      if (localPath) return localPath;
      failures.add(trimmed);
      return undefined;
    }
  }
  return value;
}

function roleImageFallbackKey(role) {
  if (!role || typeof role !== "object") return "";
  if (!role.name || !role.team || !role.ability) return "";
  return JSON.stringify([role.name, role.team, role.ability]);
}

function firstLocalImage(image) {
  if (typeof image === "string" && image.startsWith("/scripts/assets/")) {
    return image;
  }
  if (Array.isArray(image)) {
    return image.find(
      (item) => typeof item === "string" && item.startsWith("/scripts/assets/"),
    );
  }
  return "";
}

function imageExtension(buffer, contentType, url) {
  const leadingText = buffer.subarray(0, 256).toString("utf8").trimStart();
  if (/^<(?:!doctype\s+html|html)\b/i.test(leadingText)) return "";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  ) {
    return "jpg";
  }
  if (buffer.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "gif";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 12).toString("ascii").includes("ftyp")
  ) {
    return "avif";
  }

  const normalizedType = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const types = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  if (types[normalizedType]) return types[normalizedType];
  if (normalizedType.startsWith("text/")) return "";

  try {
    const extension = path
      .extname(new URL(url).pathname)
      .slice(1)
      .toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch (error) {
    return "";
  }
  return "";
}

async function fetchAsset(url) {
  let lastError;
  const candidates = [url];
  try {
    const alternate = new URL(url);
    if (["www.helloimg.com", "vip.helloimg.com"].includes(alternate.hostname)) {
      alternate.hostname = "helloimg.com";
      candidates.push(alternate.href);
    }
  } catch (error) {
    // The original URL will provide the useful validation error.
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const candidate = candidates[Math.min(attempt - 1, candidates.length - 1)];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept:
            "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 Chrome/127 Safari/537.36",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_ASSET_BYTES) {
        throw new Error(`资源超过 ${MAX_ASSET_BYTES} 字节`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_ASSET_BYTES) {
        throw new Error(`无效资源大小 ${buffer.length}`);
      }
      const extension = imageExtension(
        buffer,
        response.headers.get("content-type"),
        response.url || candidate,
      );
      if (!extension) throw new Error("响应不是可识别的图片");
      return { buffer, extension };
    } catch (error) {
      const causeCode = error && error.cause && error.cause.code;
      lastError = causeCode
        ? new Error(`${error.message}: ${causeCode}`)
        : error;
      const permanentHttpError = /^HTTP (?:404|410)$/.test(error.message || "");
      const permanentNetworkError = ["ENOTFOUND", "EAI_AGAIN"].includes(
        causeCode,
      );
      const hasUnusedAlternate = attempt < candidates.length;
      if (
        (permanentHttpError || permanentNetworkError) &&
        !hasUnusedAlternate
      ) {
        break;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function downloadAssets(urls, options) {
  const { assetDirectory, assetMapPath, concurrency } = options;
  fs.mkdirSync(assetDirectory, { recursive: true });
  let assetMap = {};
  if (fs.existsSync(assetMapPath)) {
    assetMap = JSON.parse(fs.readFileSync(assetMapPath, "utf8"));
  }

  Object.entries(assetMap).forEach(([url, publicPath]) => {
    const filename = path.basename(publicPath);
    if (!fs.existsSync(path.join(assetDirectory, filename)))
      delete assetMap[url];
  });

  const pending = Array.from(urls).filter((url) => !assetMap[url]);
  const totalPending = pending.length;
  const failed = [];
  let completed = 0;
  console.log(
    `资源共 ${urls.size} 个，已缓存 ${urls.size - pending.length} 个，待下载 ${
      pending.length
    } 个。`,
  );

  async function worker() {
    while (pending.length) {
      const url = pending.shift();
      try {
        const { buffer, extension } = await fetchAsset(url);
        const contentHash = sha256(buffer);
        const filename = `${contentHash}.${extension}`;
        const destination = path.join(assetDirectory, filename);
        if (!fs.existsSync(destination)) {
          const temporary = `${destination}.tmp-${process.pid}-${crypto
            .randomBytes(4)
            .toString("hex")}`;
          fs.writeFileSync(temporary, buffer);
          fs.renameSync(temporary, destination);
        }
        assetMap[url] = `/scripts/assets/community/${filename}`;
      } catch (error) {
        failed.push({
          url,
          error: String(error && error.message ? error.message : error),
        });
      }
      completed += 1;
      if (completed % 100 === 0 || completed === totalPending) {
        console.log(
          `资源进度 ${completed}/${totalPending}，失败 ${failed.length}`,
        );
        fs.writeFileSync(
          assetMapPath,
          `${JSON.stringify(assetMap, null, 2)}\n`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
  fs.writeFileSync(assetMapPath, `${JSON.stringify(assetMap, null, 2)}\n`);
  return { assetMap, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const sourceArgument = args.find((argument) => !argument.startsWith("--"));
  if (!sourceArgument) {
    usage();
    process.exitCode = 1;
    return;
  }

  const downloadAssetsEnabled = args.includes("--download-assets");
  const reuseAssets = args.includes("--reuse-assets");
  const localizeAssetsEnabled = downloadAssetsEnabled || reuseAssets;
  const prune = args.includes("--prune");
  const concurrencyArgument = args.find((argument) =>
    argument.startsWith("--concurrency="),
  );
  const concurrency = concurrencyArgument
    ? Number.parseInt(concurrencyArgument.split("=", 2)[1], 10)
    : 16;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new Error("concurrency 必须是 1 到 64 之间的整数");
  }

  const repoRoot = path.resolve(__dirname, "..");
  const sourceDirectory = path.resolve(sourceArgument);
  const scriptsDirectory = path.join(repoRoot, "public", "scripts");
  const assetDirectory = path.join(scriptsDirectory, "assets", "community");
  const assetMapPath = path.join(
    repoRoot,
    "scripts",
    "community-asset-map.json",
  );
  const reportPath = path.join(
    repoRoot,
    "scripts",
    "community-import-report.json",
  );

  const sourceStats = fs.statSync(sourceDirectory);
  if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) {
    throw new Error("合集路径必须是普通目录，不能是符号链接");
  }
  if (!fs.statSync(scriptsDirectory).isDirectory()) {
    throw new Error("public/scripts 不存在");
  }

  const officialIds = new Set();
  ["roles.json", "fabled.json"].forEach((filename) => {
    JSON.parse(
      fs.readFileSync(path.join(repoRoot, "src", filename), "utf8"),
    ).forEach(({ id }) => officialIds.add(cleanId(id)));
  });

  const existingNames = new Set();
  fs.readdirSync(scriptsDirectory)
    .filter(
      (filename) =>
        filename.endsWith(".json") && !COMMUNITY_FILE_PATTERN.test(filename),
    )
    .forEach((filename) => {
      const script = parseJsonPreservingLargeIntegers(
        fs.readFileSync(path.join(scriptsDirectory, filename), "utf8"),
      );
      const meta = script.find((item) => item && item.id === "_meta");
      if (meta && meta.name) existingNames.add(meta.name);
    });

  const sourceFiles = fs
    .readdirSync(sourceDirectory)
    .filter((filename) => filename.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const records = [];
  const assetUrls = new Set();
  sourceFiles.forEach((filename) => {
    const sourcePath = path.join(sourceDirectory, filename);
    const stats = fs.lstatSync(sourcePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`合集包含非普通 JSON 文件：${filename}`);
    }
    const script = parseJsonPreservingLargeIntegers(
      fs.readFileSync(sourcePath, "utf8"),
    );
    if (!Array.isArray(script)) throw new Error(`${filename} 不是 JSON 数组`);
    const meta = script.find((item) => item && item.id === "_meta");
    if (!meta || !meta.name) throw new Error(`${filename} 缺少 _meta.name`);
    if (existingNames.has(meta.name)) {
      throw new Error(`${filename} 与现有内置剧本“${meta.name}”重名`);
    }
    collectAssetUrls(script, assetUrls);
    records.push({ filename, script, meta });
  });

  let assetMap = {};
  let downloadFailures = [];
  if (downloadAssetsEnabled) {
    const result = await downloadAssets(assetUrls, {
      assetDirectory,
      assetMapPath,
      concurrency,
    });
    assetMap = result.assetMap;
    downloadFailures = result.failed;
  } else if (reuseAssets) {
    if (!fs.existsSync(assetMapPath)) {
      throw new Error("--reuse-assets 需要已有的 community-asset-map.json");
    }
    assetMap = JSON.parse(fs.readFileSync(assetMapPath, "utf8"));
    if (fs.existsSync(reportPath)) {
      const previousReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      downloadFailures = previousReport.downloadFailures || [];
    }
  }

  const expectedFiles = new Set();
  const reportScripts = [];
  const unresolvedAssets = new Set();
  const localizedRecords = records.map(({ filename, script }) => ({
    filename,
    script: localizeAssetsEnabled
      ? localizeAssets(script, assetMap, unresolvedAssets)
      : script,
  }));
  const roleImageFallbacks = new Map();
  if (localizeAssetsEnabled) {
    localizedRecords.forEach(({ script }) => {
      script.forEach((role) => {
        const key = roleImageFallbackKey(role);
        const image = firstLocalImage(role && role.image);
        if (key && image && !roleImageFallbacks.has(key)) {
          roleImageFallbacks.set(key, image);
        }
      });
    });
  }

  localizedRecords.forEach(({ filename, script }) => {
    const meta = script.find(
      (item) => item && typeof item === "object" && item.id === "_meta",
    );
    const scriptHash = sha256(meta.name).slice(0, 8);
    const outputFilename = `community-${scriptSlug(
      meta.name,
    )}-${scriptHash}.json`;
    const warnings = [];
    let fallbackImages = 0;
    if (localizeAssetsEnabled) {
      script.forEach((role) => {
        const key = roleImageFallbackKey(role);
        if (!key || firstLocalImage(role.image)) return;
        const fallback = roleImageFallbacks.get(key);
        if (!fallback) return;
        role.image = fallback;
        fallbackImages += 1;
      });
    }
    const { roles, idMap } = normalizeRoles(
      script.filter(
        (item) => !(item && typeof item === "object" && item.id === "_meta"),
      ),
      officialIds,
      scriptHash,
      warnings,
    );
    updateMetaRoleOrder(meta, idMap);
    const output = [meta, ...roles];
    const outputPath = path.join(scriptsDirectory, outputFilename);
    if (fs.existsSync(outputPath)) {
      const outputStats = fs.lstatSync(outputPath);
      if (!outputStats.isFile() || outputStats.isSymbolicLink()) {
        throw new Error(`拒绝覆盖非普通文件：${outputPath}`);
      }
    }
    fs.writeFileSync(outputPath, stringifyJsonPreservingLargeIntegers(output));
    expectedFiles.add(outputFilename);
    reportScripts.push({
      source: filename,
      output: outputFilename,
      name: meta.name,
      roles: roles.length,
      fallbackImages,
      warnings,
    });
  });

  const pruned = [];
  if (prune) {
    fs.readdirSync(scriptsDirectory)
      .filter(
        (filename) =>
          COMMUNITY_FILE_PATTERN.test(filename) && !expectedFiles.has(filename),
      )
      .forEach((filename) => {
        const target = path.join(scriptsDirectory, filename);
        const stats = fs.lstatSync(target);
        if (!stats.isFile() || stats.isSymbolicLink()) {
          throw new Error(`拒绝清理非普通文件：${target}`);
        }
        fs.unlinkSync(target);
        pruned.push(filename);
      });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceDirectory: path.basename(sourceDirectory),
    sourceScripts: sourceFiles.length,
    importedScripts: reportScripts.length,
    referencedAssets: assetUrls.size,
    localizedAssets: Object.keys(assetMap).filter((url) => assetUrls.has(url))
      .length,
    unresolvedAssets: Array.from(unresolvedAssets).sort(),
    downloadFailures: Array.from(
      new Map(
        Array.from(unresolvedAssets)
          .map((url) => ({
            url,
            error: "源图片不可用或尚未本地化",
          }))
          .concat(downloadFailures)
          .map((failure) => [failure.url, failure]),
      ).values(),
    ),
    pruned,
    scripts: reportScripts,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`已导入 ${report.importedScripts} 个剧本。`);
  console.log(
    `资源引用 ${report.referencedAssets} 个，本地化 ${report.localizedAssets} 个，未解决 ${report.unresolvedAssets.length} 个。`,
  );
  console.log(`报告：${path.relative(repoRoot, reportPath)}`);
  if (localizeAssetsEnabled && report.unresolvedAssets.length)
    process.exitCode = 2;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
