'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const manifest = require(path.join('..', 'package.json'));

function property(name) {
  return manifest.contributes.configuration.properties[name];
}

function contributedColor(id) {
  return manifest.contributes.colors.find(item => item.id === id);
}

test('v0.2.1 uses requested default Section and equals colors', () => {
  assert.equal(manifest.version, '0.2.1');
  assert.equal(property('ra2Ini.colors.sectionForeground').default, '#8B00BD');
  assert.equal(property('ra2Ini.colors.equalsForeground').default, '#FF0000');
});

test('theme color fallbacks match the v0.2.1 defaults', () => {
  const section = contributedColor('ra2Ini.sectionForeground');
  const equals = contributedColor('ra2Ini.equalsForeground');
  for (const key of ['dark', 'light', 'highContrast', 'highContrastLight']) {
    assert.equal(section.defaults[key], '#8B00BD');
    assert.equal(equals.defaults[key], '#FF0000');
  }
});
