function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptional(value) {
  const text = cleanText(value);
  return text || undefined;
}

function clampInteger(value, fallback, min, max) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeTimestamp(value) {
  const text = cleanText(value);
  if (!text) {
    return undefined;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function toEpoch(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeFingerprint(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function trimToChars(text, limit) {
  if (text.length <= limit) {
    return text;
  }
  if (limit <= 1) {
    return text.slice(0, Math.max(0, limit));
  }
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export const DEFAULT_SOURCE_ORDER = [
  "system",
  "user",
  "task",
  "file",
  "memory",
  "worker",
  "tool",
  "session",
  "other"
];

function normalizeSourceOrder(sourceOrder) {
  const order = Array.isArray(sourceOrder)
    ? sourceOrder.map((entry) => cleanText(entry).toLowerCase()).filter(Boolean)
    : [];

  const merged = [...order, ...DEFAULT_SOURCE_ORDER];
  return [...new Set(merged)];
}

function getSourceRank(sourceOrder, sourceType) {
  const index = sourceOrder.indexOf(sourceType);
  return index >= 0 ? index : sourceOrder.length;
}

function getStaleReason(item) {
  if (item.stale === true) {
    return "stale_flag";
  }

  const version = normalizeOptional(item.version);
  const currentVersion = normalizeOptional(item.currentVersion);
  if (version && currentVersion && version !== currentVersion) {
    return "version_mismatch";
  }

  const hash = normalizeOptional(item.hash);
  const currentHash = normalizeOptional(item.currentHash);
  if (hash && currentHash && hash !== currentHash) {
    return "hash_mismatch";
  }

  return undefined;
}

export function normalizePackItems(items, options = {}) {
  const sourceOrder = normalizeSourceOrder(options.sourceOrder);

  return (Array.isArray(items) ? items : [])
    .map((rawItem, index) => {
      const item = rawItem && typeof rawItem === "object" && !Array.isArray(rawItem) ? rawItem : {};
      const text = cleanText(item.text);
      const sourceType = cleanText(item.sourceType || item.kind || item.scope).toLowerCase() || "other";
      const staleReason = getStaleReason(item);

      return {
        id: normalizeOptional(item.id) || `item-${index + 1}`,
        title: normalizeOptional(item.title),
        source: normalizeOptional(item.source),
        sourceType,
        text,
        priority: Number.isFinite(item.priority) ? Number(item.priority) : 0,
        pinned: Boolean(item.pinned),
        updatedAt: normalizeTimestamp(item.updatedAt),
        staleReason,
        sourceRank: getSourceRank(sourceOrder, sourceType),
        fingerprint: normalizeFingerprint(text),
        originalIndex: index,
        metadata: {
          version: normalizeOptional(item.version),
          currentVersion: normalizeOptional(item.currentVersion),
          hash: normalizeOptional(item.hash),
          currentHash: normalizeOptional(item.currentHash)
        }
      };
    })
    .filter((item) => item.text);
}

function compareItems(left, right) {
  if (left.sourceRank !== right.sourceRank) {
    return left.sourceRank - right.sourceRank;
  }
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  const updatedDelta = toEpoch(right.updatedAt) - toEpoch(left.updatedAt);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  return left.originalIndex - right.originalIndex;
}

function renderBlock(item, maxItemChars) {
  const labelBits = [`[${item.sourceType}]`];
  if (item.title) {
    labelBits.push(item.title);
  } else {
    labelBits.push(item.id);
  }

  const lines = [labelBits.join(" ")];

  if (item.source) {
    lines.push(`Source: ${item.source}`);
  }
  if (item.updatedAt) {
    lines.push(`Updated: ${item.updatedAt}`);
  }

  const trimmedText = trimToChars(item.text, maxItemChars);
  lines.push(trimmedText);

  return {
    text: lines.join("\n"),
    truncated: trimmedText.length < item.text.length
  };
}

export function packContext(input = {}) {
  const maxChars = clampInteger(input.maxChars, 12000, 500, 50000);
  const maxItems = clampInteger(input.maxItems, 12, 1, 100);
  const maxItemChars = clampInteger(
    input.maxItemChars,
    Math.min(2500, maxChars),
    100,
    Math.max(100, maxChars)
  );
  const includeStale = Boolean(input.includeStale);
  const sourceOrder = normalizeSourceOrder(input.sourceOrder);

  const candidates = normalizePackItems(input.items, { sourceOrder }).sort(compareItems);
  const selected = [];
  const dropped = [];
  const seenFingerprints = new Map();
  let usedChars = 0;

  for (const item of candidates) {
    if (item.staleReason && !includeStale) {
      dropped.push({ id: item.id, reason: item.staleReason });
      continue;
    }

    if (item.fingerprint && seenFingerprints.has(item.fingerprint)) {
      dropped.push({
        id: item.id,
        reason: "duplicate",
        duplicateOf: seenFingerprints.get(item.fingerprint)
      });
      continue;
    }

    const baseRendered = renderBlock(item, maxItemChars);
    const separator = selected.length ? "\n\n" : "";
    const projectedChars = usedChars + separator.length + baseRendered.text.length;

    if (selected.length >= maxItems) {
      dropped.push({ id: item.id, reason: "item_budget" });
      continue;
    }

    if (projectedChars > maxChars) {
      const remaining = maxChars - usedChars - separator.length;
      if (selected.length === 0 && remaining > 0) {
        const truncated = trimToChars(baseRendered.text, remaining);
        selected.push({ ...item, rendered: truncated, truncated: true });
        usedChars += separator.length + truncated.length;
        if (item.fingerprint) {
          seenFingerprints.set(item.fingerprint, item.id);
        }
      } else {
        dropped.push({ id: item.id, reason: "char_budget" });
      }
      continue;
    }

    selected.push({ ...item, rendered: baseRendered.text, truncated: baseRendered.truncated });
    usedChars = projectedChars;
    if (item.fingerprint) {
      seenFingerprints.set(item.fingerprint, item.id);
    }
  }

  const text = selected.map((item) => item.rendered).join("\n\n");

  return {
    text,
    selected,
    dropped,
    config: {
      maxChars,
      maxItems,
      maxItemChars,
      includeStale,
      sourceOrder
    },
    stats: {
      inputItems: candidates.length,
      selectedItems: selected.length,
      droppedItems: dropped.length,
      outputChars: text.length,
      truncatedItems: selected.filter((item) => item.truncated).length
    }
  };
}
