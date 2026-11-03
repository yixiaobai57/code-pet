'use strict';
/**
 * CodePet · 注释生成器
 * 把规则引擎的分析结果组装成可直接插入代码的中文注释。
 */

/** 行尾追加注释：`int x = 5;` -> `int x = 5; // 声明整型变量 x...` */
function buildTrailingComment(result) {
  return ` // ${result.comment}`;
}

/** 行上方注释：`// 声明整型变量 x...` */
function buildAboveComment(result) {
  return `// ${result.comment}`;
}

/** 截断过长注释（状态栏/气泡展示用） */
function shorten(text, max = 42) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

module.exports = {
  buildTrailingComment,
  buildAboveComment,
  shorten
};
