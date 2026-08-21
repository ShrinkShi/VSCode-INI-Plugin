'use strict';

const SECTION_RE = /^\s*\[[^\]\r\n]+\]\s*(?:;.*)?$/;
const FULL_COMMENT_RE = /^\s*;/;

function isSection(line) {
  return SECTION_RE.test(line);
}

function isFullComment(line) {
  return FULL_COMMENT_RE.test(line);
}

/**
 * Parse one RA2/YR INI assignment.
 * Only the first '=' is structural; additional '=' characters remain part of the value.
 * A semicolon starts an inline comment only when it is preceded by whitespace.
 */
function parseAssignment(line) {
  if (!line || isSection(line) || isFullComment(line)) {
    return null;
  }

  const eqIndex = line.indexOf('=');
  if (eqIndex < 0) {
    return null;
  }

  const leftRaw = line.slice(0, eqIndex);
  const rightRaw = line.slice(eqIndex + 1);
  const indentMatch = leftRaw.match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const key = leftRaw.slice(indent.length).trim();

  if (!key) {
    return null;
  }

  const rightWithoutLeading = rightRaw.replace(/^[ \t]*/, '');
  const commentMatch = rightWithoutLeading.match(/^(.*?)([ \t]+)(;.*)$/);

  let value;
  let comment = '';
  let commentSpacing = '';

  if (commentMatch) {
    value = commentMatch[1].replace(/[ \t]+$/, '');
    commentSpacing = commentMatch[2];
    comment = commentMatch[3];
  } else {
    value = rightWithoutLeading.replace(/[ \t]+$/, '');
  }

  return {
    indent,
    key,
    value,
    comment,
    commentSpacing
  };
}

function visualWidth(text, tabSize) {
  let column = 0;
  for (const ch of text) {
    if (ch === '\t') {
      column += tabSize - (column % tabSize);
    } else {
      column += 1;
    }
  }
  return column;
}

function collectAlignmentGroups(lines, parsed, scope) {
  const groups = [];

  if (scope === 'document') {
    const group = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (parsed[i]) group.push(i);
    }
    if (group.length) groups.push(group);
    return groups;
  }

  if (scope === 'section') {
    let group = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (isSection(lines[i])) {
        if (group.length) groups.push(group);
        group = [];
        continue;
      }
      if (parsed[i]) group.push(i);
    }
    if (group.length) groups.push(group);
    return groups;
  }

  // block: any non-assignment breaks a group.
  let group = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (parsed[i]) {
      group.push(i);
    } else {
      if (group.length) groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);
  return groups;
}

function formatIniText(text, options = {}) {
  const eol = options.eol || (text.includes('\r\n') ? '\r\n' : '\n');
  const tabSize = Number.isInteger(options.tabSize) && options.tabSize > 0 ? options.tabSize : 4;
  const alignEquals = options.alignEquals !== false;
  const alignmentScope = ['block', 'section', 'document'].includes(options.alignmentScope)
    ? options.alignmentScope
    : 'block';
  const minimumSpaces = Math.max(1, Math.min(8, Number(options.minimumSpacesAroundEquals) || 1));
  const normalizeInlineCommentSpacing = options.normalizeInlineCommentSpacing !== false;

  const lines = text.split(/\r?\n/);
  const parsed = lines.map(parseAssignment);
  const leftPadding = new Array(lines.length).fill(minimumSpaces);

  if (alignEquals) {
    const groups = collectAlignmentGroups(lines, parsed, alignmentScope);
    for (const group of groups) {
      let maxWidth = 0;
      for (const index of group) {
        const item = parsed[index];
        maxWidth = Math.max(maxWidth, visualWidth(item.indent + item.key, tabSize));
      }
      for (const index of group) {
        const item = parsed[index];
        const width = visualWidth(item.indent + item.key, tabSize);
        leftPadding[index] = Math.max(minimumSpaces, maxWidth - width + minimumSpaces);
      }
    }
  }

  const formatted = lines.map((line, index) => {
    const item = parsed[index];
    if (!item) return line;

    const leftSpaces = ' '.repeat(leftPadding[index]);
    const rightSpaces = ' '.repeat(minimumSpaces);
    let result = `${item.indent}${item.key}${leftSpaces}=${rightSpaces}${item.value}`;

    if (item.comment) {
      const gap = normalizeInlineCommentSpacing
        ? ' '.repeat(minimumSpaces)
        : (item.commentSpacing || ' '.repeat(minimumSpaces));
      result += `${gap}${item.comment}`;
    }

    return result.replace(/[ \t]+$/, item.value === '' && !item.comment ? '' : '$&');
  });

  return formatted.join(eol);
}

module.exports = {
  formatIniText,
  parseAssignment,
  isSection,
  isFullComment,
  visualWidth
};
