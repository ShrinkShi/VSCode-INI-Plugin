'use strict';

const vscode = require('vscode');
const { formatIniText, parseAssignment, isSection } = require('./formatter');

const LANGUAGE_ID = 'ra2ini';

function getFormatSettings(document) {
  const cfg = vscode.workspace.getConfiguration('ra2Ini.format', document.uri);
  return {
    alignEquals: cfg.get('alignEquals', true),
    alignmentScope: cfg.get('alignmentScope', 'block'),
    minimumSpacesAroundEquals: cfg.get('minimumSpacesAroundEquals', 1),
    normalizeInlineCommentSpacing: cfg.get('normalizeInlineCommentSpacing', true)
  };
}

function fullDocumentRange(document) {
  const lastLine = Math.max(0, document.lineCount - 1);
  return new vscode.Range(
    new vscode.Position(0, 0),
    document.lineAt(lastLine).rangeIncludingLineBreak.end
  );
}

function formatDocument(document, tabSize = 4) {
  const text = document.getText();
  const formatted = formatIniText(text, {
    ...getFormatSettings(document),
    tabSize: Number(tabSize) || 4,
    eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  });

  if (formatted === text) return [];
  return [vscode.TextEdit.replace(fullDocumentRange(document), formatted)];
}

function createColorDecorations() {
  return {
    section: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('ra2Ini.sectionForeground'),
      fontWeight: 'bold'
    }),
    key: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('ra2Ini.keyForeground')
    }),
    equals: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('ra2Ini.equalsForeground'),
      fontWeight: 'bold'
    }),
    value: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('ra2Ini.valueForeground')
    }),
    comment: vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('ra2Ini.commentForeground'),
      fontStyle: 'italic'
    })
  };
}

function findInlineCommentStart(text, valueStart) {
  for (let i = valueStart + 1; i < text.length; i += 1) {
    if (text[i] === ';' && /[ \t]/.test(text[i - 1])) {
      return i;
    }
  }
  return -1;
}

function computeDecorationsForLine(document, lineNumber, buckets) {
  const line = document.lineAt(lineNumber);
  const text = line.text;
  if (!text) return;

  const firstNonSpace = text.search(/\S/);
  if (firstNonSpace < 0) return;

  if (text[firstNonSpace] === ';') {
    buckets.comment.push(new vscode.Range(lineNumber, firstNonSpace, lineNumber, text.length));
    return;
  }

  if (isSection(text)) {
    const open = text.indexOf('[', firstNonSpace);
    const close = text.indexOf(']', open + 1);
    if (open >= 0 && close > open) {
      buckets.section.push(new vscode.Range(lineNumber, open, lineNumber, close + 1));
      const tail = text.indexOf(';', close + 1);
      if (tail >= 0) {
        buckets.comment.push(new vscode.Range(lineNumber, tail, lineNumber, text.length));
      }
    }
    return;
  }

  const parsed = parseAssignment(text);
  if (!parsed) return;

  const eq = text.indexOf('=');
  if (eq < 0) return;

  let keyStart = 0;
  while (keyStart < eq && /[ \t]/.test(text[keyStart])) keyStart += 1;
  let keyEnd = eq;
  while (keyEnd > keyStart && /[ \t]/.test(text[keyEnd - 1])) keyEnd -= 1;

  let valueStart = eq + 1;
  while (valueStart < text.length && /[ \t]/.test(text[valueStart])) valueStart += 1;

  const commentStart = findInlineCommentStart(text, valueStart);
  let valueEnd = commentStart >= 0 ? commentStart : text.length;
  while (valueEnd > valueStart && /[ \t]/.test(text[valueEnd - 1])) valueEnd -= 1;

  if (keyEnd > keyStart) {
    buckets.key.push(new vscode.Range(lineNumber, keyStart, lineNumber, keyEnd));
  }
  buckets.equals.push(new vscode.Range(lineNumber, eq, lineNumber, eq + 1));
  if (valueEnd > valueStart) {
    buckets.value.push(new vscode.Range(lineNumber, valueStart, lineNumber, valueEnd));
  }
  if (commentStart >= 0) {
    buckets.comment.push(new vscode.Range(lineNumber, commentStart, lineNumber, text.length));
  }
}

function applyVisibleColorDecorations(editor, decorations) {
  if (!editor || editor.document.languageId !== LANGUAGE_ID) return;
  const enabled = vscode.workspace.getConfiguration('ra2Ini.colors', editor.document.uri).get('overrideTheme', true);

  if (!enabled) {
    for (const decoration of Object.values(decorations)) {
      editor.setDecorations(decoration, []);
    }
    return;
  }

  const buckets = {
    section: [],
    key: [],
    equals: [],
    value: [],
    comment: []
  };

  const seen = new Set();
  for (const visible of editor.visibleRanges) {
    const start = Math.max(0, visible.start.line - 30);
    const end = Math.min(editor.document.lineCount - 1, visible.end.line + 30);
    for (let line = start; line <= end; line += 1) {
      if (seen.has(line)) continue;
      seen.add(line);
      computeDecorationsForLine(editor.document, line, buckets);
    }
  }

  editor.setDecorations(decorations.section, buckets.section);
  editor.setDecorations(decorations.key, buckets.key);
  editor.setDecorations(decorations.equals, buckets.equals);
  editor.setDecorations(decorations.value, buckets.value);
  editor.setDecorations(decorations.comment, buckets.comment);
}

function activate(context) {
  const selector = { language: LANGUAGE_ID, scheme: 'file' };
  const decorations = createColorDecorations();
  for (const item of Object.values(decorations)) context.subscriptions.push(item);

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document, options) {
        return formatDocument(document, options.tabSize);
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges(document) {
        const headers = [];
        for (let line = 0; line < document.lineCount; line += 1) {
          if (isSection(document.lineAt(line).text)) headers.push(line);
        }

        const ranges = [];
        for (let i = 0; i < headers.length; i += 1) {
          const start = headers[i];
          const end = (i + 1 < headers.length ? headers[i + 1] : document.lineCount) - 1;
          if (end > start) ranges.push(new vscode.FoldingRange(start, end));
        }
        return ranges;
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(document) {
        const headers = [];
        for (let line = 0; line < document.lineCount; line += 1) {
          const text = document.lineAt(line).text;
          const match = text.match(/^\s*\[([^\]]+)\]/);
          if (match) headers.push({ line, name: match[1].trim() });
        }

        return headers.map((header, index) => {
          const endLine = (index + 1 < headers.length ? headers[index + 1].line : document.lineCount) - 1;
          const range = new vscode.Range(
            header.line,
            0,
            Math.max(header.line, endLine),
            document.lineAt(Math.max(header.line, endLine)).text.length
          );
          const selection = document.lineAt(header.line).range;
          return new vscode.DocumentSymbol(
            `[${header.name}]`,
            'INI Section',
            vscode.SymbolKind.Namespace,
            range,
            selection
          );
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ra2Ini.formatDocument', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== LANGUAGE_ID) {
        vscode.window.showWarningMessage('当前文件不是 RA2/YR INI 语言模式。');
        return;
      }

      const edits = formatDocument(editor.document, editor.options.tabSize || 4);
      if (!edits.length) {
        vscode.window.setStatusBarMessage('RA2 INI：当前文件格式已经整齐。', 2500);
        return;
      }

      const workspaceEdit = new vscode.WorkspaceEdit();
      for (const edit of edits) {
        workspaceEdit.replace(editor.document.uri, edit.range, edit.newText);
      }
      await vscode.workspace.applyEdit(workspaceEdit);
      vscode.window.setStatusBarMessage('RA2 INI：已整理并对齐等号。', 2500);
    })
  );

  let decorationTimer;
  const scheduleDecorationRefresh = (editor = vscode.window.activeTextEditor) => {
    clearTimeout(decorationTimer);
    decorationTimer = setTimeout(() => applyVisibleColorDecorations(editor, decorations), 40);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => scheduleDecorationRefresh(editor)),
    vscode.window.onDidChangeTextEditorVisibleRanges(event => scheduleDecorationRefresh(event.textEditor)),
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) scheduleDecorationRefresh(editor);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('ra2Ini.colors')) scheduleDecorationRefresh();
    }),
    { dispose: () => clearTimeout(decorationTimer) }
  );

  scheduleDecorationRefresh();
}

function deactivate() {}

module.exports = { activate, deactivate };
