import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// These are source-level accessibility/layout contracts, not simulated device tests.
const source = ts.createSourceFile('GuideChat.tsx', readFileSync(resolve('src/features/director/GuideChat.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
const visit = (node: ts.Node) => {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
};
visit(source);

function attribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return node.attributes.properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(source) === name)?.initializer;
}

function attributeText(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  const value = attribute(node, name);
  return value && ts.isStringLiteral(value) ? value.text : value?.getText(source);
}

function styleNumber(style: string, property: string) {
  let found: number | undefined;
  const find = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === style && ts.isObjectLiteralExpression(node.initializer)) {
      const value = node.initializer.properties.find((item): item is ts.PropertyAssignment => ts.isPropertyAssignment(item) && item.name.getText(source) === property)?.initializer;
      if (value && ts.isNumericLiteral(value)) found = Number(value.text);
    }
    ts.forEachChild(node, find);
  };
  find(source);
  return found;
}

describe('guide dismissal UI contract', () => {
  const close = elements.find(node => attributeText(node, 'accessibilityLabel') === 'Close guide')!;

  it('has an explicitly named Close button with a visible label and icon', () => {
    expect(close).toBeDefined();
    expect(close.tagName.getText(source)).toBe('Pressable');
    expect(attributeText(close, 'accessibilityRole')).toBe('button');
    expect(close.parent.getText(source)).toContain('>Close</Text>');
    expect(close.parent.getText(source)).toContain('name="close"');
    expect(styleNumber('close', 'minHeight')).toBeGreaterThanOrEqual(44);
    expect(styleNumber('close', 'minWidth')).toBeGreaterThanOrEqual(44);
  });

  it('keeps dismissal outside the scrolling conversation and enabled during requests', () => {
    let ancestor: ts.Node | undefined = close.parent;
    while (ancestor) {
      if (ts.isJsxElement(ancestor)) expect(ancestor.openingElement.tagName.getText(source)).not.toBe('ScrollView');
      ancestor = ancestor.parent;
    }
    expect(attribute(close, 'disabled')).toBeUndefined();
    expect(attributeText(close, 'onPress')).toBe('{onClose}');
    expect(styleNumber('topline', 'flexShrink')).toBe(0);
    expect(styleNumber('close', 'flexShrink')).toBe(0);
  });

  it('uses the same dismissal path for Android back and the accessibility escape gesture', () => {
    const modal = elements.find(node => node.tagName.getText(source) === 'Modal')!;
    const sheet = elements.find(node => attribute(node, 'onAccessibilityEscape'))!;
    expect(attributeText(modal, 'onRequestClose')).toBe('{close}');
    expect(attributeText(sheet, 'onAccessibilityEscape')).toBe('{onClose}');
    expect(source.getText()).toContain('Keyboard.dismiss(); setOpen(false);');
  });

  it('allows the message viewport to shrink when the keyboard reduces available height', () => {
    expect(styleNumber('sheet', 'minHeight')).toBe(0);
    expect(styleNumber('conversationViewport', 'minHeight')).toBe(0);
    expect(styleNumber('conversationViewport', 'flex')).toBe(1);
  });
});
