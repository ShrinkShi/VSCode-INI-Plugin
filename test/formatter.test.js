'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatIniText, parseAssignment } = require('../formatter');

test('aligns equals inside a contiguous block', () => {
  const input = '[General]\nA=1\nLongKey = 2\n; keep comment\nB=3';
  const output = formatIniText(input, {
    alignmentScope: 'block',
    minimumSpacesAroundEquals: 1
  });
  assert.equal(output, '[General]\nA       = 1\nLongKey = 2\n; keep comment\nB = 3');
});

test('section mode aligns across comments and blank lines but not across sections', () => {
  const input = '[One]\nA=1\n\n; note\nLong=2\n[Two]\nX=3\nYY=4';
  const output = formatIniText(input, { alignmentScope: 'section' });
  assert.equal(output, '[One]\nA    = 1\n\n; note\nLong = 2\n[Two]\nX  = 3\nYY = 4');
});

test('keeps order, duplicate keys and comments untouched', () => {
  const input = '[List]\n1=GACNST\n1=GAPOWR\n; 这条注释不能丢\n2=GAREFN';
  const output = formatIniText(input, { alignmentScope: 'block' });
  assert.equal(output, '[List]\n1 = GACNST\n1 = GAPOWR\n; 这条注释不能丢\n2 = GAREFN');
});

test('only first equals is structural', () => {
  const parsed = parseAssignment('Expression = A=B=C');
  assert.equal(parsed.key, 'Expression');
  assert.equal(parsed.value, 'A=B=C');
});

test('recognizes whitespace-prefixed inline semicolon comments', () => {
  const input = 'Speed=5    ; vehicle speed';
  const output = formatIniText(input, { minimumSpacesAroundEquals: 1 });
  assert.equal(output, 'Speed = 5 ; vehicle speed');
});

test('does not treat an unspaced semicolon as an inline comment', () => {
  const parsed = parseAssignment('Text=Alpha;Beta');
  assert.equal(parsed.value, 'Alpha;Beta');
  assert.equal(parsed.comment, '');
});

test('preserves CRLF line endings when requested', () => {
  const input = '[A]\r\nX=1\r\nYY=2\r\n';
  const output = formatIniText(input, { eol: '\r\n' });
  assert.equal(output, '[A]\r\nX  = 1\r\nYY = 2\r\n');
});
