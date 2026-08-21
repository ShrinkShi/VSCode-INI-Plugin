'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  IniWorkspaceIndex,
  parseIniIndexText,
  getCompletionContext,
  getSectionReferenceAtLine
} = require('../ini-index');

test('indexes sections, keys and values from INI text', () => {
  const parsed = parseIniIndexText('[E1]\nPrimary=M60\nArmor=none\n[WEAPON]\nDamage=15');
  assert.deepEqual(parsed.sections.map(item => item.name), ['E1', 'WEAPON']);
  assert.deepEqual(parsed.entries.map(item => [item.section, item.key, item.value]), [
    ['E1', 'Primary', 'M60'],
    ['E1', 'Armor', 'none'],
    ['WEAPON', 'Damage', '15']
  ]);
});

test('workspace index preserves multiple definitions for the same Section across files', () => {
  const index = new IniWorkspaceIndex();
  index.replaceFiles([
    { uri: 'file:///rules.ini', text: '[E1]\nPrimary=M60' },
    { uri: 'file:///rulesmd.ini', text: '[E1]\nPrimary=M60E' }
  ]);
  const definitions = index.getSectionDefinitions('e1');
  assert.equal(definitions.length, 2);
  assert.deepEqual(definitions.map(item => item.uri), ['file:///rules.ini', 'file:///rulesmd.ini']);
});

test('workspace completion learns keys and values for the same key', () => {
  const index = new IniWorkspaceIndex();
  index.replaceFiles([
    { uri: 'file:///a.ini', text: '[A]\nPrimary=M60\nArmor=none' },
    { uri: 'file:///b.ini', text: '[B]\nPrimary=M60\nPrimary=120mm' }
  ]);
  assert.equal(index.getKeys('pri')[0].label, 'Primary');
  assert.deepEqual(index.getValuesForKey('Primary').map(item => item.label), ['M60', '120mm']);
});

test('completion context distinguishes section, key and value positions', () => {
  assert.deepEqual(getCompletionContext('[Gen', 4), {
    type: 'section', prefix: 'Gen', replaceStart: 1, replaceEnd: 4, appendBracket: true
  });
  assert.deepEqual(getCompletionContext('  Prim', 6), {
    type: 'key', prefix: 'Prim', replaceStart: 2, replaceEnd: 6, appendEquals: true
  });
  assert.deepEqual(getCompletionContext('Primary = M6', 12), {
    type: 'value', key: 'Primary', prefix: 'M6', replaceStart: 10, replaceEnd: 12
  });
});

test('section completion does not duplicate an existing closing bracket', () => {
  assert.deepEqual(getCompletionContext('[Gen]', 4), {
    type: 'section', prefix: 'Gen', replaceStart: 1, replaceEnd: 4, appendBracket: false
  });
  assert.equal(getCompletionContext('[General] ; note', 12), null);
});

test('key completion replaces an existing key without inserting a second equals', () => {
  assert.deepEqual(getCompletionContext('Prim = M60', 4), {
    type: 'key', prefix: 'Prim', replaceStart: 0, replaceEnd: 4, appendEquals: false
  });
});

test('value completion replaces the whole token when cursor is in the middle', () => {
  assert.deepEqual(getCompletionContext('Primary = M60', 11), {
    type: 'value', key: 'Primary', prefix: 'M', replaceStart: 10, replaceEnd: 13
  });
});

test('value completion after comma replaces only the current list token', () => {
  assert.deepEqual(getCompletionContext('Owner=Americans,Rus', 19), {
    type: 'value', key: 'Owner', prefix: 'Rus', replaceStart: 16, replaceEnd: 19
  });
});

test('section reference lookup targets values but ignores keys and comments', () => {
  assert.deepEqual(getSectionReferenceAtLine('Primary = M60 ; weapon', 12), {
    name: 'M60', start: 10, end: 13
  });
  assert.equal(getSectionReferenceAtLine('Primary = M60 ; weapon', 2), null);
  assert.equal(getSectionReferenceAtLine('Primary = M60 ; weapon', 18), null);
});

test('section reference lookup supports comma-separated values and section headers', () => {
  assert.deepEqual(getSectionReferenceAtLine('Owner=Americans,Russians,Alliance', 18), {
    name: 'Russians', start: 16, end: 24
  });
  assert.deepEqual(getSectionReferenceAtLine('[Chrono Ivan]', 5), {
    name: 'Chrono Ivan', start: 1, end: 12
  });
});

test('incremental file replacement removes stale sections and values', () => {
  const index = new IniWorkspaceIndex();
  index.replaceFile('file:///rules.ini', '[OLD]\nPrimary=M60');
  index.replaceFile('file:///rules.ini', '[NEW]\nPrimary=120mm');
  assert.equal(index.getSectionDefinitions('OLD').length, 0);
  assert.equal(index.getSectionDefinitions('NEW').length, 1);
  assert.deepEqual(index.getValuesForKey('Primary').map(item => item.label), ['120mm']);
});
