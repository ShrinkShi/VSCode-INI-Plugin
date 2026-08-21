'use strict';

const vscode = require('vscode');
const { formatIniText, parseAssignment, isSection } = require('./formatter');
const {
  IniWorkspaceIndex,
  getCompletionContext,
  getSectionReferenceAtLine
} = require('./ini-index');

const LANGUAGE_ID = 'ra2ini';
const INI_GLOB = '**/*.[iI][nN][iI]';
const DEFAULT_INDEX_EXCLUDE = '**/{.git,node_modules}/**';

function getFormatSettings(document) {
  const cfg = vscode.workspace.getConfiguration('ra2Ini.format', document.uri);
  return {
    alignEquals: cfg.get('alignEquals', true),
    alignInlineComments: cfg.get('alignInlineComments', true),
    alignmentScope: cfg.get('alignmentScope', 'block'),
    minimumSpacesAroundEquals: cfg.get('minimumSpacesAroundEquals', 1),
    minimumSpacesBeforeInlineComment: cfg.get('minimumSpacesBeforeInlineComment', 1),
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

function colorSetting(name, themeColorId) {
  // Read from the extension root so nested settings such as
  // ra2Ini.colors.sectionForeground are resolved consistently.
  const cfg = vscode.workspace.getConfiguration('ra2Ini');
  const custom = String(cfg.get(`colors.${name}`, '') || '').trim();
  return custom || new vscode.ThemeColor(themeColorId);
}

function createColorDecorations() {
  return {
    section: vscode.window.createTextEditorDecorationType({
      color: colorSetting('sectionForeground', 'ra2Ini.sectionForeground'),
      fontWeight: 'bold'
    }),
    key: vscode.window.createTextEditorDecorationType({
      color: colorSetting('keyForeground', 'ra2Ini.keyForeground')
    }),
    equals: vscode.window.createTextEditorDecorationType({
      color: colorSetting('equalsForeground', 'ra2Ini.equalsForeground'),
      fontWeight: 'bold'
    }),
    value: vscode.window.createTextEditorDecorationType({
      color: colorSetting('valueForeground', 'ra2Ini.valueForeground')
    }),
    comment: vscode.window.createTextEditorDecorationType({
      color: colorSetting('commentForeground', 'ra2Ini.commentForeground'),
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
  const enabled = vscode.workspace.getConfiguration('ra2Ini').get('colors.overrideTheme', true);

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

class WorkspaceIndexController {
  constructor(context) {
    this.context = context;
    this.index = new IniWorkspaceIndex();
    this.changeTimers = new Map();
    this.rebuildPromise = Promise.resolve();
    this.rebuildGeneration = 0;
    this.disposed = false;
  }

  start() {
    this.rebuildPromise = this.rebuildWorkspace();
    const watcher = vscode.workspace.createFileSystemWatcher(INI_GLOB);
    this.context.subscriptions.push(
      watcher,
      watcher.onDidCreate(uri => this.scheduleUriRefresh(uri)),
      watcher.onDidChange(uri => this.scheduleUriRefresh(uri)),
      watcher.onDidDelete(uri => this.index.removeFile(uri.toString())),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.scheme !== 'file' || !event.document.fileName.toLowerCase().endsWith('.ini')) return;
        this.scheduleDocumentRefresh(event.document);
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        if (document.uri.scheme === 'file' && document.fileName.toLowerCase().endsWith('.ini')) {
          this.index.replaceFile(document.uri.toString(), document.getText());
        }
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('ra2Ini.index')) {
          this.rebuildPromise = this.rebuildWorkspace();
        }
      }),
      { dispose: () => this.dispose() }
    );
  }

  dispose() {
    this.disposed = true;
    for (const timer of this.changeTimers.values()) clearTimeout(timer);
    this.changeTimers.clear();
  }

  async rebuildWorkspace() {
    if (this.disposed) return;
    const generation = ++this.rebuildGeneration;
    const cfg = vscode.workspace.getConfiguration('ra2Ini.index');
    const maxFiles = Math.max(1, Math.min(20000, Number(cfg.get('maxFiles', 5000)) || 5000));
    const excludeGlob = String(cfg.get('excludeGlob', DEFAULT_INDEX_EXCLUDE) || DEFAULT_INDEX_EXCLUDE);
    const found = await vscode.workspace.findFiles(INI_GLOB, excludeGlob, maxFiles + 1);
    const uris = found.slice(0, maxFiles);
    const openDocuments = new Map(
      vscode.workspace.textDocuments
        .filter(document => document.uri.scheme === 'file')
        .map(document => [document.uri.toString(), document])
    );

    const records = new Array(uris.length);
    let nextIndex = 0;
    const workerCount = Math.min(32, Math.max(1, uris.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= uris.length) return;
        const uri = uris[current];
        try {
          const openDocument = openDocuments.get(uri.toString());
          if (openDocument) {
            records[current] = { uri: uri.toString(), text: openDocument.getText() };
          } else {
            const bytes = await vscode.workspace.fs.readFile(uri);
            records[current] = { uri: uri.toString(), text: Buffer.from(bytes).toString('utf8') };
          }
        } catch {
          records[current] = null;
        }
      }
    });
    await Promise.all(workers);

    if (this.disposed || generation !== this.rebuildGeneration) return;
    this.index.replaceFiles(records.filter(Boolean));

    if (found.length > maxFiles) {
      vscode.window.setStatusBarMessage(
        `RA2 INI：工作区 INI 索引已达到 ${maxFiles} 个文件上限，可在 ra2Ini.index.maxFiles 调整。`,
        6000
      );
    }
  }

  scheduleDocumentRefresh(document) {
    const key = document.uri.toString();
    const previous = this.changeTimers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.changeTimers.delete(key);
      this.index.replaceFile(key, document.getText());
    }, 120);
    this.changeTimers.set(key, timer);
  }

  scheduleUriRefresh(uri) {
    const key = uri.toString();
    const previous = this.changeTimers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(async () => {
      this.changeTimers.delete(key);
      await this.refreshUri(uri);
    }, 180);
    this.changeTimers.set(key, timer);
  }

  async refreshUri(uri) {
    try {
      const openDocument = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
      if (openDocument) {
        this.index.replaceFile(uri.toString(), openDocument.getText());
        return;
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      this.index.replaceFile(uri.toString(), Buffer.from(bytes).toString('utf8'));
    } catch {
      this.index.removeFile(uri.toString());
    }
  }

  refreshCurrentDocument(document) {
    if (document.uri.scheme === 'file' && document.fileName.toLowerCase().endsWith('.ini')) {
      this.index.replaceFile(document.uri.toString(), document.getText());
    }
  }
}

function completionRange(document, position, context) {
  return new vscode.Range(
    new vscode.Position(position.line, context.replaceStart),
    new vscode.Position(position.line, context.replaceEnd)
  );
}

function completionSortText(count, label) {
  const capped = Math.max(0, Math.min(999999, Number(count) || 0));
  return `${String(999999 - capped).padStart(6, '0')}:${label.toLowerCase()}`;
}

function makeCompletionItem(label, kind, count, range, detail, insertText = label) {
  const item = new vscode.CompletionItem(label, kind);
  item.insertText = insertText;
  item.range = range;
  item.detail = detail;
  item.sortText = completionSortText(count, label);
  return item;
}

function provideWorkspaceCompletions(indexController, document, position) {
  indexController.refreshCurrentDocument(document);
  const line = document.lineAt(position.line).text;
  const context = getCompletionContext(line, position.character);
  if (!context) return [];

  const cfg = vscode.workspace.getConfiguration('ra2Ini.completion', document.uri);
  if (!cfg.get('enabled', true)) return [];
  const limit = Math.max(20, Math.min(1000, Number(cfg.get('maxItems', 200)) || 200));
  const range = completionRange(document, position, context);

  if (context.type === 'section') {
    return indexController.index.getSections(context.prefix, limit).map(entry =>
      makeCompletionItem(
        entry.label,
        vscode.CompletionItemKind.Module,
        entry.count,
        range,
        `工作区 Section · ${entry.count} 个定义`,
        `${entry.label}]`
      )
    );
  }

  if (context.type === 'key') {
    return indexController.index.getKeys(context.prefix, limit).map(entry =>
      makeCompletionItem(
        entry.label,
        vscode.CompletionItemKind.Property,
        entry.count,
        range,
        `工作区 INI Key · 出现 ${entry.count} 次`,
        context.appendEquals ? `${entry.label} = ` : entry.label
      )
    );
  }

  const items = [];
  const seen = new Set();
  for (const entry of indexController.index.getValuesForKey(context.key, context.prefix, limit)) {
    const normalized = entry.label.toLowerCase();
    seen.add(normalized);
    items.push(makeCompletionItem(
      entry.label,
      vscode.CompletionItemKind.Value,
      entry.count + 100000,
      range,
      `工作区同名 Key「${context.key}」曾使用的 Value · ${entry.count} 次`
    ));
  }

  if (cfg.get('includeSectionsInValues', true)) {
    for (const entry of indexController.index.getSections(context.prefix, limit)) {
      const normalized = entry.label.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      items.push(makeCompletionItem(
        entry.label,
        vscode.CompletionItemKind.Reference,
        entry.count,
        range,
        `工作区 Section 引用 · ${entry.count} 个定义`
      ));
      if (items.length >= limit) break;
    }
  }

  return items.slice(0, limit);
}

function provideSectionDefinitions(indexController, document, position) {
  indexController.refreshCurrentDocument(document);
  const line = document.lineAt(position.line).text;
  const reference = getSectionReferenceAtLine(line, position.character);
  if (!reference) return null;

  const definitions = indexController.index.getSectionDefinitions(reference.name);
  if (!definitions.length) return null;

  return definitions.map(definition => {
    const uri = vscode.Uri.parse(definition.uri);
    const start = new vscode.Position(definition.line, definition.startCharacter);
    const end = new vscode.Position(definition.line, definition.endCharacter);
    return new vscode.Location(uri, new vscode.Range(start, end));
  });
}

function activate(context) {
  const selector = { language: LANGUAGE_ID, scheme: 'file' };
  let decorations = createColorDecorations();
  for (const item of Object.values(decorations)) context.subscriptions.push(item);

  const indexController = new WorkspaceIndexController(context);
  indexController.start();

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
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          return provideWorkspaceCompletions(indexController, document, position);
        }
      },
      '[',
      '=',
      ','
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition(document, position) {
        return provideSectionDefinitions(indexController, document, position);
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
      vscode.window.setStatusBarMessage('RA2 INI：已整理并对齐等号与行内注释。', 2500);
    })
  );

  const decorationTimers = new Map();
  const scheduleDecorationRefresh = (editor = vscode.window.activeTextEditor) => {
    if (!editor || editor.document.languageId !== LANGUAGE_ID) return;
    const key = editor.document.uri.toString();
    const previous = decorationTimers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      decorationTimers.delete(key);
      applyVisibleColorDecorations(editor, decorations);
    }, 40);
    decorationTimers.set(key, timer);
  };

  const refreshVisibleIniEditors = () => {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === LANGUAGE_ID) scheduleDecorationRefresh(editor);
    }
  };

  const recreateDecorations = () => {
    for (const item of Object.values(decorations)) item.dispose();
    decorations = createColorDecorations();
    for (const item of Object.values(decorations)) context.subscriptions.push(item);
    refreshVisibleIniEditors();
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => scheduleDecorationRefresh(editor)),
    vscode.window.onDidChangeTextEditorVisibleRanges(event => scheduleDecorationRefresh(event.textEditor)),
    vscode.workspace.onDidChangeTextDocument(event => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (event.document === editor.document) scheduleDecorationRefresh(editor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('ra2Ini.colors')) recreateDecorations();
    }),
    vscode.window.onDidChangeActiveColorTheme(() => recreateDecorations()),
    {
      dispose: () => {
        for (const timer of decorationTimers.values()) clearTimeout(timer);
        decorationTimers.clear();
      }
    }
  );

  refreshVisibleIniEditors();
}

function deactivate() {}

module.exports = { activate, deactivate };
