'use strict';
/**
 * CodePet · 规则引擎单元测试
 * 运行：node --test tests/
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeLine, analyzeLines, isComplete } = require('../lib/analyzer');

const CASES = [
  // [代码行, 期望类别, 注释必须包含的关键词]
  ['#include <stdio.h>', '预处理', 'stdio.h'],
  ['#define MAXSIZE 100', '预处理', 'MAXSIZE'],
  ['int add(int a, int b) {', '函数', 'add'],
  ['void printList(LinkList L);', '函数', 'printList'],
  ['struct Node {', '结构体', 'Node'],
  ['typedef struct LNode {', '结构体', '别名'],
  ['struct Node *p = (struct Node*)malloc(sizeof(struct Node));', '内存', 'malloc'],
  ['for (int i = 0; i < n; i++) {', '循环', 'for'],
  ['while (p != NULL) {', '循环', 'while'],
  ['do {', '循环', 'do-while'],
  ['if (x > 0) {', '条件', 'if'],
  ['else if (x == 0) {', '条件', '否则如果'],
  ['switch (op) {', '条件', 'switch'],
  ['case 1:', '条件', 'case'],
  ['int x = 5;', '变量', 'x'],
  ['char ch = \'a\';', '变量', 'ch'],
  ['float sum = 0.0;', '变量', 'sum'],
  ['int *p = &a;', '指针', 'p'],
  ['int arr[10];', '数组', 'arr'],
  ['int matrix[3][3] = {0};', '数组', 'matrix'],
  ['x = y + 1;', '赋值', 'x'],
  ['count++;', '运算', 'count'],
  ['return 0;', '控制流', 'return'],
  ['break;', '控制流', 'break'],
  ['continue;', '控制流', 'continue'],
  ['p = (LNode *)malloc(sizeof(LNode));', '内存', 'malloc'],
  ['free(p);', '内存', 'free'],
  ['int len = strlen(s);', '字符串', 'strlen'],
  ['printf("Hello\\n");', '输入输出', 'printf'],
  ['scanf("%d", &n);', '输入输出', 'scanf'],
  ['int size = sizeof(struct Node);', '运算', 'sizeof'],
  ['p = p->next;', '结构体', 'next'],
  ['*p = 10;', '指针', '解引用'],
  ['int *q = &x;', '指针', 'q'],
  ['flag = flag | 0x01;', '位运算', '按位或'],
  ['static int count = 0;', '变量', 'static'],
  ['LinkList L = (LinkList)malloc(sizeof(LNode));', '内存', 'malloc'],
  ['int i = 0;', '变量', 'i'],
];

for (const [line, type, kw] of CASES) {
  test(`analyze: ${line}`, () => {
    const r = analyzeLine(line);
    assert.ok(r, `应识别: ${line}`);
    assert.equal(r.type, type, `类别应为 ${type}，实际 ${r.type}: ${line}`);
    assert.ok(r.comment.includes(kw), `注释应包含「${kw}」: ${r.comment}`);
    assert.ok(r.detail && r.detail.length > 10, '应有详细解释');
  });
}

test('不完整语句不分析（isComplete）', () => {
  assert.equal(isComplete('int x = 5'), false);
  assert.equal(isComplete('int x = 5;'), true);
  assert.equal(isComplete('for (int i = 0; i < n; i++)'), false);
});

test('未知代码返回 null', () => {
  assert.equal(analyzeLine('/* 纯注释 */'), null);
  assert.equal(analyzeLine(''), null);
  assert.equal(analyzeLine('   '), null);
  assert.equal(analyzeLine('}'), null);
});

test('analyzeLines 多行批量', () => {
  const lines = [
    'int x = 5;',
    'for (int i = 0; i < x; i++) {',
    'printf("%d", i);',
    '}'
  ];
  const results = analyzeLines(lines);
  assert.ok(results.length >= 3);
  assert.ok(results.some(r => r.type === '循环'));
  assert.ok(results.some(r => r.type === '输入输出'));
});

test('行尾已有注释的行仍可识别', () => {
  const r = analyzeLine('int x = 5; // 已有注释');
  assert.ok(r);
  assert.equal(r.type, '变量');
});

test('结构体成员赋值', () => {
  const r = analyzeLine('head->data = 10;');
  assert.ok(r);
  assert.ok(r.comment.includes('head'));
});

test('函数定义参数统计', () => {
  const r = analyzeLine('int merge(int a[], int n, int m) {');
  assert.ok(r);
  assert.ok(r.detail.includes('3 个参数'), r.detail);
});
