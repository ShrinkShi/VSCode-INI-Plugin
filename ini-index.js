'use strict';

const { parseAssignment } = require('./formatter');

const SECTION_CAPTURE_RE = /^\s*\[([^\]\r\n]+)\]\s*(?:;.*)?$/;
const FULL_COMMENT_RE = /^\s*;/;

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function addCount(map, label, amount = 1) {
  const normalized = normalizeName(label);
  if (!normalized) return;
  const current = map.get(normalized);
  if (current) {
    current.count += amount;
    return;
  }
  map.set(normalized, { label: String(label).trim(), count: amount });
}

function decrementCount(map, label, amount = 1) {
  const normalized = normalizeName(label);
  if (!normalized) return;
  const current = map.get(normalized);
  if (!current) return;
  current.count -= amount;
  if (current.count <= 0) map.delete(normalized);
}

function textFingerprint(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

function splitValueCandidates(value) {
  const text = String(value || '').trim();
  if (!text) return [];

  const candidates = new Set([text]);
  for (const piece of text.split(',')) {
    const token = piece.trim();
    if (token) candidates.add(token);
  }
  return [...candidates];
}

function parseIniIndexText(text) {
  const sections = [];
  const entries = [];
  const lines = String(text || '').split(/\r?\n/);
  let currentSection = '';

  for (let line = 0; line < lines.length; line += 1) {
    const raw = lines[line];
    const sectionMatch = raw.match(SECTION_CAPTURE_RE);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      const open = raw.indexOf('[');
      const startCharacter = Math.max(0, open + 1);
      sections.push({
        name,
        line,
        startCharacter,
        endCharacter: startCharacter + sectionMatch[1].length
      });
      currentSection = name;
      continue;
    }

    const parsed = parseAssignment(raw);
    if (!parsed) continue;
    entries.push({
      key: parsed.key,
      value: parsed.value,
      section: currentSection,
      line
    });
  }

  return { sections, entries };
}

class IniWorkspaceIndex {
  constructor() {
    this.files = new Map();
    this.sectionsByName = new Map();
    this.keys = new Map();
    this.valuesByKey = new Map();
  }

  replaceFile(uri, text) {
    const key = String(uri);
    const source = String(text || '');
    const fingerprint = textFingerprint(source);
    const previous = this.files.get(key);
    if (previous && previous.fingerprint === fingerprint) return false;

    if (previous) this.removeRecord(key, previous);
    const parsed = parseIniIndexText(source);
    const record = { ...parsed, fingerprint };
    this.files.set(key, record);
    this.addRecord(key, record);
    return true;
  }

  replaceFiles(records) {
    this.files.clear();
    this.sectionsByName.clear();
    this.keys.clear();
    this.valuesByKey.clear();

    for (const record of records) {
      const uri = String(record.uri);
      const source = String(record.text || '');
      const parsed = parseIniIndexText(source);
      const indexed = { ...parsed, fingerprint: textFingerprint(source) };
      this.files.set(uri, indexed);
      this.addRecord(uri, indexed);
    }
  }

  removeFile(uri) {
    const key = String(uri);
    const previous = this.files.get(key);
    if (!previous) return false;
    this.removeRecord(key, previous);
    this.files.delete(key);
    return true;
  }

  clear() {
    this.files.clear();
    this.sectionsByName.clear();
    this.keys.clear();
    this.valuesByKey.clear();
  }

  addRecord(uri, record) {
    for (const section of record.sections) {
      const normalized = normalizeName(section.name);
      if (!normalized) continue;
      const definitions = this.sectionsByName.get(normalized) || [];
      definitions.push({ uri, ...section });
      this.sectionsByName.set(normalized, definitions);
    }

    for (const entry of record.entries) {
      addCount(this.keys, entry.key);
      const keyName = normalizeName(entry.key);
      if (!keyName) continue;
      let values = this.valuesByKey.get(keyName);
      if (!values) {
        values = new Map();
        this.valuesByKey.set(keyName, values);
      }
      for (const candidate of splitValueCandidates(entry.value)) {
        if (candidate.length <= 256) addCount(values, candidate);
      }
    }
  }

  removeRecord(uri, record) {
    for (const section of record.sections) {
      const normalized = normalizeName(section.name);
      const definitions = this.sectionsByName.get(normalized);
      if (!definitions) continue;
      const remaining = definitions.filter(definition => definition.uri !== uri);
      if (remaining.length) this.sectionsByName.set(normalized, remaining);
      else this.sectionsByName.delete(normalized);
    }

    for (const entry of record.entries) {
      decrementCount(this.keys, entry.key);
      const keyName = normalizeName(entry.key);
      const values = this.valuesByKey.get(keyName);
      if (!values) continue;
      for (const candidate of splitValueCandidates(entry.value)) {
        if (candidate.length <= 256) decrementCount(values, candidate);
      }
      if (!values.size) this.valuesByKey.delete(keyName);
    }
  }

  getSectionDefinitions(name) {
    return [...(this.sectionsByName.get(normalizeName(name)) || [])];
  }

  getSections(prefix = '', limit = 200) {
    return this.rank(this.sectionLabels(), prefix, limit);
  }

  getKeys(prefix = '', limit = 200) {
    return this.rank([...this.keys.values()], prefix, limit);
  }

  getValuesForKey(key, prefix = '', limit = 200) {
    const values = this.valuesByKey.get(normalizeName(key));
    return this.rank(values ? [...values.values()] : [], prefix, limit);
  }

  sectionLabels() {
    const labels = [];
    for (const definitions of this.sectionsByName.values()) {
      if (!definitions.length) continue;
      labels.push({ label: definitions[0].name, count: definitions.length });
    }
    return labels;
  }

  rank(items, prefix, limit) {
    const normalizedPrefix = normalizeName(prefix);
    return items
      .filter(item => !normalizedPrefix || normalizeName(item.label).startsWith(normalizedPrefix))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, Math.max(1, limit));
  }
}

function getCompletionContext(lineText, character) {
  const text = String(lineText || '');
  const position = Math.max(0, Math.min(character, text.length));
  if (FULL_COMMENT_RE.test(text)) return null;

  const firstNonSpace = text.search(/\S/);
  if (firstNonSpace >= 0 && text[firstNonSpace] === '[') {
    const open = firstNonSpace;
    const close = text.indexOf(']', open + 1);
    if (position > open && (close < 0 || position <= close)) {
      return {
        type: 'section',
        prefix: text.slice(open + 1, position),
        replaceStart: open + 1,
        replaceEnd: close >= 0 ? close : position,
        appendBracket: close < 0
      };
    }
    return null;
  }

  const eq = text.indexOf('=');
  if (eq < 0 || position <= eq) {
    const indent = (text.match(/^[ \t]*/) || [''])[0].length;
    let keyEnd = eq >= 0 ? eq : text.length;
    while (keyEnd > indent && /[ \t]/.test(text[keyEnd - 1])) keyEnd -= 1;
    if (position < indent || (eq >= 0 && position > eq)) return null;
    return {
      type: 'key',
      prefix: text.slice(indent, Math.min(position, keyEnd)),
      replaceStart: indent,
      replaceEnd: keyEnd,
      appendEquals: eq < 0
    };
  }

  const key = text.slice(0, eq).trim();
  if (!key) return null;

  const commentStart = findInlineCommentStart(text, eq + 1);
  if (commentStart >= 0 && position >= commentStart) return null;
  const valueEnd = commentStart >= 0 ? commentStart : text.length;

  let start = eq + 1;
  for (let i = eq + 1; i < position; i += 1) {
    if (text[i] === ',') start = i + 1;
  }

  let end = valueEnd;
  for (let i = position; i < valueEnd; i += 1) {
    if (text[i] === ',') {
      end = i;
      break;
    }
  }

  while (start < end && /[ \t]/.test(text[start])) start += 1;
  while (end > start && /[ \t]/.test(text[end - 1])) end -= 1;

  return {
    type: 'value',
    key,
    prefix: text.slice(start, Math.max(start, position)),
    replaceStart: start,
    replaceEnd: end
  };
}

function findInlineCommentStart(text, valueStart) {
  for (let i = valueStart + 1; i < text.length; i += 1) {
    if (text[i] === ';' && /[ \t]/.test(text[i - 1])) return i;
  }
  return -1;
}

function getSectionReferenceAtLine(lineText, character) {
  const text = String(lineText || '');
  const position = Math.max(0, Math.min(character, text.length));

  const sectionMatch = text.match(SECTION_CAPTURE_RE);
  if (sectionMatch) {
    const open = text.indexOf('[');
    const close = text.indexOf(']', open + 1);
    if (position > open && position <= close) {
      return {
        name: sectionMatch[1].trim(),
        start: open + 1,
        end: close
      };
    }
    return null;
  }

  if (FULL_COMMENT_RE.test(text)) return null;
  const eq = text.indexOf('=');
  if (eq < 0 || position <= eq) return null;

  let valueEnd = text.length;
  const commentStart = findInlineCommentStart(text, eq + 1);
  if (commentStart >= 0) valueEnd = commentStart;
  if (position >= valueEnd) return null;

  let start = eq + 1;
  let end = valueEnd;
  for (let i = eq + 1; i < valueEnd; i += 1) {
    if (text[i] !== ',') continue;
    if (position <= i) {
      end = i;
      break;
    }
    start = i + 1;
  }

  while (start < end && /[ \t]/.test(text[start])) start += 1;
  while (end > start && /[ \t]/.test(text[end - 1])) end -= 1;
  if (position < start || position > end || end <= start) return null;

  return {
    name: text.slice(start, end),
    start,
    end
  };
}

module.exports = {
  IniWorkspaceIndex,
  parseIniIndexText,
  splitValueCandidates,
  getCompletionContext,
  getSectionReferenceAtLine,
  normalizeName
};
