'use strict';
/**
 * CodePet · C 语言规则引擎（本地规则 MVP）
 * ------------------------------------------------------------
 * 纯正则 + 轻量解析，零依赖，离线可用。
 * 覆盖 408 考研《数据结构》手写代码的高频模式：
 * 变量/指针/数组声明、函数、循环、条件、结构体、链表、
 * 动态内存、字符串、输入输出、位运算等。
 *
 * 每个规则返回：
 *   type    : 语句类别（用于状态栏/气泡分类）
 *   comment : 一句话中文注释（可插入代码，教学口吻）
 *   detail  : 更详细的解释（悬停/气泡展示）
 * 若行不属于任何已知规则，返回 null。
 */

const VERSION = '0.1.0';

// ---------- 工具 ----------

/** 去掉缩进、行尾注释，保留句末分号便于判断 */
function clean(line) {
  return line.replace(/\/\/.*$/, '').trim();
}

/** 该行是否是完整的 C 语句（以 ; { } 结尾，或本身就是块标记） */
function isComplete(s) {
  return /[;{}]$/.test(s);
}

/** 常见基础类型 */
const BASE_TYPES = '(?:unsigned\\s+|signed\\s+|long\\s+|short\\s+)?(?:int|char|float|double|void|bool|_Bool|long|short)';

/** 标识符（含用户自定义类型：LNode / LinkList / ElemType ...） */
const ID = '[A-Za-z_][A-Za-z0-9_]*';
const TYPE = `(?:${BASE_TYPES}|${ID})`;

/** 不能被当作函数名的关键字（避免 else if(...){} 被误判为函数定义） */
const NON_FUNC_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'else', 'return', 'case', 'do',
  'printf', 'scanf', 'malloc', 'free', 'sizeof', 'struct', 'typedef',
  'break', 'continue', 'goto', 'include', 'define', 'const', 'static'
]);

/** 字符串库函数 */
const STR_FUNCS = 'strlen|strcpy|strncpy|strcmp|strncmp|strcat|strncat|strstr|strchr|sprintf|sscanf|atoi|atof|strtol';

// ---------- 规则表 ----------
// 按优先级从高到低排列，第一个命中即返回。

const RULES = [

  // 1. 预处理指令
  {
    name: 'include',
    type: '预处理',
    pattern: /^\s*#\s*include\s*[<"]([^>"]+)[>"]/,
    parse(m) {
      return {
        comment: `引入头文件 <${m[1]}>，获得其中声明的函数与类型`,
        detail: `预处理指令 #include 会把头文件的内容“粘贴”到当前位置。比如 #include <stdio.h> 之后才能用 printf/scanf；#include <stdlib.h> 之后才能用 malloc/free。`
      };
    }
  },
  {
    name: 'define',
    type: '预处理',
    pattern: /^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(.*)$/,
    parse(m) {
      return {
        comment: `宏定义：用 ${m[1]} 替换后面的内容（编译前文本替换）`,
        detail: `#define 是编译预处理阶段的“文本替换”。如 #define MAXSIZE 100，之后代码里所有 MAXSIZE 都会被替换成 100。注意宏不检查类型，是纯文本替换。`
      };
    }
  },

  // 2. 函数定义：类型 名字(参数) {（排除关键字）
  {
    name: 'func-def',
    type: '函数',
    pattern: new RegExp(`^(${TYPE})\\s+\\*?\\s*(${ID})\\s*\\(([^;{}]*)\\)\\s*\\{$`),
    parse(m) {
      const name = m[2];
      if (NON_FUNC_NAMES.has(name)) return null;
      const ret = m[1].trim();
      const params = m[3].trim();
      const paramDesc = describeParams(params);
      const retDesc = ret === 'void' ? '不返回任何值' : `返回 ${ret} 类型的结果`;
      return {
        comment: `定义函数 ${name}（${paramDesc}），${retDesc}`,
        detail: `这是函数定义：${name} 接收${paramDesc}，${retDesc}。函数体在 { } 里。调用时写 ${name}(实际参数) 即可。`
      };
    }
  },

  // 3. 函数原型（分号结尾，带小括号）
  {
    name: 'func-proto',
    type: '函数',
    pattern: new RegExp(`^(${TYPE})\\s+\\*?\\s*(${ID})\\s*\\(([^;{}]*)\\)\\s*;$`),
    parse(m) {
      const name = m[2];
      if (NON_FUNC_NAMES.has(name)) return null;
      const params = m[3].trim();
      return {
        comment: `声明函数原型 ${name}（${describeParams(params)}），函数体在别处定义`,
        detail: `这是函数声明（原型），告诉编译器“存在这样一个函数”。实际实现可能在文件后面或其他文件里。C 语言要求“先声明后使用”。`
      };
    }
  },

  // 4. 声明 + malloc/calloc/realloc 初始化（链表中超高频）
  {
    name: 'alloc-decl',
    type: '内存',
    pattern: new RegExp(`^(struct\\s+)?(${ID})\\s+(\\**)\\s*(${ID})\\s*=\\s*(?:\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*)?(malloc|calloc|realloc|free)\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      const type = (m[1] ? m[1] + ' ' : '') + m[2].trim();
      const ptrName = m[4];
      const fn = m[6];
      const args = m[7].trim();
      const fnDesc = {
        malloc: '按字节数分配一块堆内存，返回 void* 指针',
        calloc: '分配并清零（初始化为 0），参数为“个数, 每个大小”',
        realloc: '调整已分配内存的大小',
        free: '释放内存'
      }[fn];
      return {
        comment: `为 ${type} 分配堆内存并让指针 ${ptrName} 指向它（${fn}，参数：${args}）`,
        detail: `${fn} 从“堆”上申请内存（堆比栈大得多），返回指针可能为 NULL（分配失败），使用前最好判空：if (${ptrName} == NULL) return;。链表/树节点几乎都这么建。用完后必须 free 归还，否则内存泄漏。`
      };
    }
  },
  // 纯赋值形式：p = (LNode *)malloc(...)
  {
    name: 'alloc-assign',
    type: '内存',
    pattern: new RegExp(`^(${ID})\\s*=\\s*(?:\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*)?(malloc|calloc|realloc|free)\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      const ptrName = m[1];
      const fn = m[3];
      const args = m[4].trim();
      return {
        comment: `调用 ${fn} 为指针 ${ptrName} 分配/调整/释放内存（参数：${args}）`,
        detail: `${fn} 是动态内存操作：${ptrName} 指向堆上新分配的内存（malloc 按字节分配、calloc 清零分配、realloc 调整大小、free 释放）。用完记得 free，避免内存泄漏。`
      };
    }
  },

  // 5. 声明 + 字符串函数初始化：int len = strlen(s);
  {
    name: 'str-call-decl',
    type: '字符串',
    pattern: new RegExp(`^(${TYPE})\\s+(${ID})\\s*=\\s*(${STR_FUNCS})\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      const varName = m[2];
      const fn = m[3];
      const args = m[4].trim();
      const desc = {
        strlen: '求字符串长度（不含末尾 \\0）', strcpy: '字符串拷贝', strncpy: '限长拷贝',
        strcmp: '比较两个字符串（相等返回 0）', strncmp: '限长比较前 n 个字符',
        strcat: '字符串拼接', strncat: '限长拼接', strstr: '查找子串返回位置指针',
        strchr: '查找字符', sprintf: '格式化写入缓冲区', sscanf: '从字符串按格式读取',
        atoi: '字符串转 int', atof: '字符串转 double', strtol: '字符串转 long'
      }[fn];
      return {
        comment: `调用 ${fn}（${desc}），结果存入变量 ${varName}`,
        detail: `${fn} 是 C 标准库字符串函数：${desc}。参数：${args}。C 字符串以 \\0 结尾。`
      };
    }
  },

  // 6. 声明 + sizeof 初始化：int size = sizeof(...);
  {
    name: 'sizeof-decl',
    type: '运算',
    pattern: new RegExp(`^(${TYPE})\\s+(${ID})\\s*=\\s*sizeof\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      const varName = m[2];
      const target = m[3].trim();
      return {
        comment: `计算 sizeof(${target})（${target} 占用的字节数），存入变量 ${varName}`,
        detail: `sizeof 是运算符，编译期算出 ${target} 占用内存的字节数。malloc 时写 sizeof(struct Node) 才能分对大小。`
      };
    }
  },

  // 7. struct 定义
  {
    name: 'struct-def',
    type: '结构体',
    pattern: new RegExp(`^struct\\s+(${ID})\\s*\\{`),
    parse(m) {
      return {
        comment: `定义结构体 ${m[1]}：把一组相关数据打包成一个类型`,
        detail: `结构体（struct）把多个不同类型的成员打包成一个整体。比如链表节点 struct Node { int data; struct Node *next; }; 定义后可用 struct ${m[1]} 声明该类型的变量。`
      };
    }
  },
  {
    name: 'typedef-struct',
    type: '结构体',
    pattern: new RegExp(`^typedef\\s+struct(?:\\s+(${ID}))?\\s*\\{`),
    parse(m) {
      const tag = m[1] ? ` ${m[1]}` : '';
      return {
        comment: `typedef struct${tag} 定义结构体并起别名，之后可直接用别名声明变量`,
        detail: `typedef 给结构体起“外号”。比如 typedef struct Node { ... } LNode; 之后写 LNode p; 就等价于 struct Node p;（更省事）。王道/严蔚敏教材里 LNode、LinkList 很常见。`
      };
    }
  },
  {
    name: 'struct-var',
    type: '结构体',
    pattern: new RegExp(`^struct\\s+(${ID})\\s+(\\*?\\s*${ID})(\\s*\\[[^\\]]*\\])?\\s*(=.*)?;$`),
    parse(m) {
      const type = m[1];
      const varName = m[2].replace(/\s+/g, '');
      const isPtr = varName.startsWith('*');
      const arr = m[3] || '';
      return {
        comment: isPtr
          ? `声明结构体 ${type} 的指针${arr ? '数组' : ''} ${varName.replace('*', '')}${arr}`
          : `声明结构体 ${type} 类型变量${arr ? '数组' : ''} ${varName}${arr}`,
        detail: isPtr
          ? `${type} 是指针变量，存的是结构体的“门牌号”（地址）。数组/链表遍历常用指针。`
          : `${type} 是结构体变量，用 ${varName}.成员 访问其中字段。`
      };
    }
  },

  // 8. union / enum
  {
    name: 'union-def',
    type: '联合体',
    pattern: new RegExp(`^union\\s+(${ID})\\s*\\{`),
    parse(m) {
      return { comment: `定义联合体 ${m[1]}：所有成员共用同一块内存`, detail: `联合体（union）所有成员从同一地址开始、共用存储空间，大小取最大成员。同一时刻只“有意义地”使用其中一个成员。` };
    }
  },
  {
    name: 'enum-def',
    type: '枚举',
    pattern: new RegExp(`^enum\\s+(${ID})\\s*\\{`),
    parse(m) {
      return { comment: `定义枚举 ${m[1]}：一组有名字的整型常量`, detail: `枚举（enum）把一组相关的常量命名，比如 enum Status { OK=1, ERROR=0 };。枚举值默认从 0 递增。` };
    }
  },

  // 9. typedef 别名
  {
    name: 'typedef',
    type: '类型',
    pattern: new RegExp(`^typedef\\s+(${BASE_TYPES}|struct\\s+${ID}|${ID})\\s+\\*?\\s*(${ID})\\s*;$`),
    parse(m) {
      return {
        comment: `typedef：给类型 ${m[1]} 起别名 ${m[2]}，之后可简写`,
        detail: `typedef 让长类型名变短。如 typedef struct LNode *LinkList; 之后 LinkList 就代表“指向链表节点的指针”，写起来顺手。`
      };
    }
  },

  // 10. 循环
  {
    name: 'for-loop',
    type: '循环',
    pattern: /^for\s*\(\s*([^;]*);\s*([^;]*);\s*([^)]*)\)/,
    parse(m) {
      const init = m[1].trim() || '未初始化';
      const cond = m[2].trim() || '恒真(死循环)';
      const step = m[3].trim() || '无步进';
      return {
        comment: `for 循环：初始化「${init}」，条件「${cond}」，每轮「${step}」`,
        detail: `for 循环三要素：①初始化 ${init}（进循环前执行一次）②条件 ${cond}（每次进循环体前判断，真才执行）③步进 ${step}（每轮循环体结束后执行）。数组遍历、顺序表/链表扫描最常用。`
      };
    }
  },
  {
    name: 'while-loop',
    type: '循环',
    pattern: /^while\s*\(([^)]*)\)/,
    parse(m) {
      return {
        comment: `while 循环：条件「${m[1].trim()}」为真时一直执行循环体`,
        detail: `先判断条件再执行：条件为真进循环体，否则跳过。链表遍历、读写文件常用。注意：条件不更新会死循环。`
      };
    }
  },
  {
    name: 'do-while',
    type: '循环',
    pattern: /^do\s*\{/,
    parse() {
      return { comment: `do-while 循环：先执行一次循环体，再判断条件`, detail: `do-while 与 while 的区别：至少执行一次循环体，之后条件为真继续。常用于“先做事再判断”的场景。` };
    }
  },

  // 11. 条件
  {
    name: 'if',
    type: '条件',
    pattern: /^if\s*\(([^)]*)\)/,
    parse(m) {
      return {
        comment: `if 条件判断：「${m[1].trim()}」为真时执行下面的语句块`,
        detail: `条件语句。若 ${m[1].trim()} 计算结果非 0（真），执行 if 后的语句块。比较运算 ==、!=、<、> 结果就是 0 或 1。`
      };
    }
  },
  {
    name: 'else-if',
    type: '条件',
    pattern: /^else\s+if\s*\(([^)]*)\)/,
    parse(m) {
      return { comment: `否则如果「${m[1].trim()}」成立，执行此分支`, detail: `多分支判断的中间环节：前面的 if 不成立时，继续检查这个条件。` };
    }
  },
  {
    name: 'else',
    type: '条件',
    pattern: /^else\s*\{/,
    parse() {
      return { comment: `否则分支：前面条件都不成立时执行`, detail: `else 捕获“条件为假”的情况，与最近的 if 配对。` };
    }
  },
  {
    name: 'switch',
    type: '条件',
    pattern: /^switch\s*\(([^)]*)\)/,
    parse(m) {
      return { comment: `switch 分支：按 ${m[1].trim()} 的值跳转到对应 case`, detail: `switch 按表达式的整数值匹配 case 分支；记得每个 case 结尾 break，否则会“穿透”继续执行。` };
    }
  },
  {
    name: 'case',
    type: '条件',
    pattern: /^case\s+(.+):/,
    parse(m) {
      return { comment: `case 分支：当表达式等于 ${m[1].trim()} 时进入这里`, detail: `switch 的入口之一：匹配到对应值时从这里开始执行。` };
    }
  },

  // 12. 指针声明（类型 + 多个* + 可选维度/初始化）
  {
    name: 'ptr-decl',
    type: '指针',
    pattern: new RegExp(`^(${TYPE})\\s+(\\*+)\\s*(${ID})(\\s*\\[[^\\]]*\\])?\\s*(=\\s*[^;]+)?;`),
    parse(m) {
      const base = m[1].trim();
      const stars = m[2].length;
      const name = m[3];
      const arr = m[4] || '';
      const init = m[5] ? m[5].trim() : '';
      return {
        comment: `声明${base}${'*'.repeat(stars)} 指针变量 ${name}${arr}${init ? `，初始化：${init}` : '（未初始化，野指针！）'}`,
        detail: `${name} 是${base}${'*'.repeat(stars)} 指针变量（存的是地址，不是值本身）。${init ? `当前指向 ${init.replace('=', '')}。` : `未初始化（野指针），使用前必须先赋地址（如 &变量 或 malloc）。`}指针 = 地址，* 解引用 = 取地址里的值。`
      };
    }
  },

  // 13. 数组声明（支持多维）
  {
    name: 'array-decl',
    type: '数组',
    pattern: new RegExp(`^(${TYPE})\\s+(${ID})((?:\\s*\\[[^\\]]*\\])+)\\s*(=\\s*[^;]+)?;`),
    parse(m) {
      const base = m[1].trim();
      const name = m[2];
      const dims = m[3].trim();
      const init = m[4] ? m[4].trim() : '';
      return {
        comment: `声明 ${base} 类型数组 ${name}（${dims.replace(/\s+/g, '')}）${init ? `，初始化${init.replace('=', '')}` : ''}`,
        detail: `数组是在内存中连续存放的一组 ${base}${dims}。下标从 0 开始：${name}[0] 是第一个元素。顺序表（SeqList）底层就是数组。`
      };
    }
  },

  // 14. 变量声明（类型支持自定义 typedef 类型）
  {
    name: 'var-decl',
    type: '变量',
    pattern: new RegExp(`^(${TYPE})\\s+(${ID})\\s*(=\\s*[^;]+)?;`),
    parse(m) {
      const base = m[1].trim();
      const name = m[2];
      const init = m[3] ? m[3].trim() : '';
      const typeDesc = describeBaseType(base, name);
      return {
        comment: `声明${typeDesc}变量 ${name}${init ? `，初始化为 ${init.replace('=', '')}` : '（未初始化）'}`,
        detail: `${name} 是 ${base} 类型变量，内存里分配了一块 ${base} 大小的空间。${init ? `定义时即赋初值 ${init.replace('=', '')}。` : `未初始化时其值是内存里的“垃圾值”，使用前务必赋值。`}`
      };
    }
  },

  // 15. 链表/树指针移动：p = p->next;
  {
    name: 'ptr-move',
    type: '结构体',
    pattern: new RegExp(`^(${ID})\\s*=\\s*(${ID})\\s*->\\s*(${ID})\\s*;`),
    parse(m) {
      const to = m[1];
      const from = m[2];
      const field = m[3];
      const fieldDesc = /next|prior|prev|nextSibling/.test(field) ? `跳到 ${field} 指向的下一个节点` : `读取 ${field} 成员`;
      return {
        comment: `链表指针移动：${to} 从当前节点${fieldDesc}`,
        detail: `${from}->${field} 是通过指针访问结构体成员（等价于 (*${from}).${field}）。${field === 'next' || field === 'prior' || field === 'prev' ? '这一步在链表/树遍历里叫“指针后移”，循环到 NULL 就结束。' : ''}`
      };
    }
  },

  // 16. 位运算（含赋值形式：flag = flag | 0x01;）
  {
    name: 'bitwise',
    type: '位运算',
    pattern: new RegExp(`^(${ID})\\s*(?:=\\s*[^;]*)?(<<|>>|&|\\||\\^)\\s*([^;]+);`),
    parse(m) {
      const target = m[1];
      const op = m[2];
      const val = m[3].trim();
      const desc = { '<<': '左移', '>>': '右移', '&': '按位与', '|': '按位或', '^': '按位异或' }[op];
      return {
        comment: `${target} 参与 ${desc}运算（${op} ${val}）`,
        detail: `${desc}（bitwise）：${op === '<<' ? `左移 n 位 ≈ 乘以 2^n` : op === '>>' ? '右移 n 位 ≈ 除以 2^n' : op === '&' ? '同 1 才 1，常用于取位/掩码' : op === '|' ? '有 1 则 1，常用于置位' : '不同为 1，可用于翻转位'}。`
      };
    }
  },

  // 17. 赋值 / 复合赋值
  {
    name: 'assign',
    type: '赋值',
    pattern: new RegExp(`^(${ID}(?:\\s*->\\s*${ID}|\\s*\\.\\s*${ID}|\\s*\\[[^\\]]*\\])*)\\s*(=|\\+=|-=|\\*=|/=|%=|<<=|>>=|&=|\\|=|\\^=)\\s*([^;]+);`),
    parse(m) {
      const target = m[1].trim();
      const op = m[2];
      const value = m[3].trim();
      const opDesc = {
        '=': '赋值', '+=': '自身加后赋值', '-=': '自身减后赋值',
        '*=': '自身乘后赋值', '/=': '自身除后赋值', '%=': '取余后赋值'
      }[op] || `${op} 运算后赋值`;
      return {
        comment: `${opDesc}：${target} ${op} ${value}`,
        detail: `${opDesc}操作：把右侧表达式的值存入左侧 ${target}。${op === '=' ? '注意 == 才是比较相等。' : `复合赋值 ${op} 等价于 ${target} = ${target} ${op.replace(/=$/, '')} ${value}。`}`
      };
    }
  },

  // 18. 自增自减
  {
    name: 'incdec',
    type: '运算',
    pattern: new RegExp(`^(${ID})\\s*(\\+\\+|--)\\s*;|^(\\+\\+|--)\\s*(${ID})\\s*;`),
    parse(m) {
      const name = m[1] || m[4];
      const op = m[2] || m[3];
      return {
        comment: `${name} ${op === '++' ? '自增 1' : '自减 1'}`,
        detail: `${op === '++' ? '自增' : '自减'}运算符：变量值加/减 1。放前面（++${name}）先改值再用；放后面（${name}++）先用旧值再改。循环步进最常用。`
      };
    }
  },

  // 19. 控制流
  {
    name: 'return',
    type: '控制流',
    pattern: /^return\s*([^;]*);/,
    parse(m) {
      const val = m[1].trim();
      return {
        comment: val ? `return ${val}：返回该值并结束当前函数` : 'return：结束当前函数（void，不返回值）',
        detail: val ? `return 立即结束函数，把 ${val} 的值交回调用处。递归出口、查找失败返回 -1/0 等都靠它。` : `return; 结束 void 函数，把控制权交回调用处。`
      };
    }
  },
  {
    name: 'break',
    type: '控制流',
    pattern: /^break\s*;/,
    parse() {
      return { comment: 'break：立刻跳出当前循环或 switch', detail: 'break 只跳出“最近一层”的循环或 switch，不会跳出多层；退出多层循环要配合标志变量。' };
    }
  },
  {
    name: 'continue',
    type: '控制流',
    pattern: /^continue\s*;/,
    parse() {
      return { comment: 'continue：跳过本轮循环剩余代码，进入下一轮', detail: 'continue 结束“本次迭代”，回到循环条件判断。常用于跳过某些元素（如跳过空节点）。' };
    }
  },
  {
    name: 'goto',
    type: '控制流',
    pattern: new RegExp(`^goto\\s+(${ID})\\s*;`),
    parse(m) {
      return { comment: `goto 跳转到标签 ${m[1]} 处`, detail: 'goto 直接跳转，容易把代码结构搞乱（教科书一般建议少用）。' };
    }
  },

  // 20. 动态内存调用（无赋值：malloc(x); free(p);）
  {
    name: 'malloc-call',
    type: '内存',
    pattern: /^(?:\([^)]*\)\s*)?(malloc|calloc|realloc)\s*\(([^)]*)\)\s*;/,
    parse(m) {
      const fn = m[1];
      const args = m[2].trim();
      const desc = {
        malloc: `按字节数分配一块堆内存，返回 void* 指针`,
        calloc: `分配并清零（初始化为 0），参数为“个数, 每个大小”`,
        realloc: `调整已分配内存的大小`
      }[fn];
      return {
        comment: `${fn}：${desc}（参数：${args}）`,
        detail: `${fn} 从“堆”上申请内存（堆比栈大得多）。返回指针可能为 NULL（分配失败），使用前最好判空。用完后必须 free() 归还，否则内存泄漏。`
      };
    }
  },
  {
    name: 'free',
    type: '内存',
    pattern: new RegExp(`^free\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      return {
        comment: `free：释放 ${m[1].trim()} 指向的堆内存`,
        detail: `free 把 malloc/calloc 申请的内存归还系统。释放后不要再使用该指针（野指针），最好置 NULL：p = NULL;。单链表删除节点、二叉树销毁都要逐节点 free。`
      };
    }
  },

  // 21. 字符串函数调用
  {
    name: 'str-func',
    type: '字符串',
    pattern: new RegExp(`^(${STR_FUNCS})\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      const fn = m[1];
      const args = m[2].trim();
      const desc = {
        strlen: '求字符串长度（不含末尾 \\0）', strcpy: '字符串拷贝（把源串拷到目标）',
        strncpy: '限长拷贝（最多拷 n 个字符）', strcmp: '比较两个字符串（相等返回 0）',
        strncmp: '限长比较前 n 个字符', strcat: '字符串拼接（追加到目标末尾）',
        strncat: '限长拼接', strstr: '在串中查找子串，返回位置指针',
        strchr: '在串中查找字符', sprintf: '把格式化内容写入字符串缓冲区',
        sscanf: '从字符串按格式读取', atoi: '把字符串转成 int', atof: '把字符串转成 double',
        strtol: '把字符串转成 long'
      }[fn];
      return {
        comment: `${fn}：${desc}（参数：${args}）`,
        detail: `${fn} 是 C 标准库字符串函数：${desc}。注意：C 字符串以 \\0 结尾，操作前要确保目标缓冲区够大。`
      };
    }
  },

  // 22. 输入输出
  {
    name: 'printf',
    type: '输入输出',
    pattern: /^printf\s*\(([^)]*)\)\s*;/,
    parse(m) {
      return {
        comment: `printf：按格式把内容输出到屏幕（参数：${m[1].trim()}）`,
        detail: `printf 是格式化输出：双引号里的 %d/%f/%c/%s 是占位符，后面依次给值。如 printf("%d", x); 输出 x 的值。调试代码时用它打印中间结果。`
      };
    }
  },
  {
    name: 'scanf',
    type: '输入输出',
    pattern: /^scanf\s*\(([^)]*)\)\s*;/,
    parse(m) {
      return {
        comment: `scanf：从键盘按格式读取输入（注意要传变量的地址 &）`,
        detail: `scanf 是格式化输入：读取键盘输入到变量。格式串里的 %d 等对应后面的“地址”，普通变量要加 &（如 &n），字符数组名本身就是地址不用加。`
      };
    }
  },
  {
    name: 'getchar-putchar',
    type: '输入输出',
    pattern: new RegExp(`^(getchar|putchar)\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      const fn = m[1];
      return {
        comment: `${fn}：${fn === 'getchar' ? '读入一个字符' : '输出一个字符'}`,
        detail: `${fn} 处理单个字符：${fn === 'getchar' ? '返回下一个输入字符的 ASCII 码' : '把参数里的字符输出'}。`
      };
    }
  },

  // 23. sizeof 表达式
  {
    name: 'sizeof-expr',
    type: '运算',
    pattern: /^(?:const\s+)?sizeof\s*\(([^)]*)\)/,
    parse(m) {
      return {
        comment: `sizeof：求 ${m[1].trim()} 占用的字节数`,
        detail: `sizeof 是运算符（不是函数），编译期算出类型/变量占用内存的字节数。malloc 时写 sizeof(struct Node) 才能分对大小。`
      };
    }
  },

  // 24. 成员访问 ->（链表/树/结构体指针）
  {
    name: 'member-arrow',
    type: '结构体',
    pattern: new RegExp(`^(${ID})\\s*->\\s*(${ID})\\s*(=\\s*[^;]+)?;`),
    parse(m) {
      const ptr = m[1];
      const field = m[2];
      const val = m[3] ? m[3].trim() : '';
      return {
        comment: `通过指针 ${ptr} 访问结构体成员 ${field}${val ? `，赋值为 ${val.replace('=', '')}` : ''}`,
        detail: `-> 是“指针取成员”：${ptr} 是指向结构体的指针，${ptr}->${field} 等价于 (*${ptr}).${field}。链表/树遍历全靠它，比如 p->next 跳到下一个节点。`
      };
    }
  },

  // 25. 普通函数调用
  {
    name: 'func-call',
    type: '调用',
    pattern: new RegExp(`^(${ID})\\s*\\(([^)]*(?:\\([^)]*\\))*[^)]*)\\)\\s*;`),
    parse(m) {
      const name = m[1];
      if (NON_FUNC_NAMES.has(name)) return null;
      const args = m[2].trim();
      return {
        comment: `调用函数 ${name}（参数：${args || '无'}）`,
        detail: `函数调用：把 ${args || '无'} 传给 ${name}，执行它的函数体。返回值可以接收（如 int r = ${name}(...);）也可以忽略。`
      };
    }
  },

  // 26. 解引用 *p
  {
    name: 'deref',
    type: '指针',
    pattern: new RegExp(`^\\*\\s*(${ID})\\s*(=\\s*[^;]+)?;`),
    parse(m) {
      const name = m[1];
      const val = m[2] ? m[2].trim() : '';
      return {
        comment: `解引用：通过指针 ${name} 读写它指向的变量的值${val ? `，写入 ${val.replace('=', '')}` : ''}`,
        detail: `*${name} 表示“${name} 指向的那个变量”。写 *${name} = x 是改目标变量的值，改的是 ${name} 指向的地址里的内容。`
      };
    }
  },

  // 27. 取地址初始化：int *p = &a;
  {
    name: 'addressof',
    type: '指针',
    pattern: new RegExp(`^(${TYPE})\\s+\\*?\\s*(${ID})\\s*=\\s*&(${ID})\\s*;`),
    parse(m) {
      const type = m[1].trim();
      const varName = m[2];
      const src = m[3];
      return {
        comment: `声明${type} 指针 ${varName}，让它指向变量 ${src} 的地址`,
        detail: `& 是取地址符：&${src} 得到 ${src} 在内存中的地址。把地址存进指针 ${varName} 后，*${varName} 就等价于 ${src}。`
      };
    }
  },

  // 28. 比较/逻辑表达式语句（如 i == n;）
  {
    name: 'bool-expr',
    type: '表达式',
    pattern: new RegExp(`^(${ID})\\s*(==|!=|<=|>=|<|>|&&|\\|\\|)\\s*([^;]+);`),
    parse(m) {
      const left = m[1];
      const op = m[2];
      const right = m[3].trim();
      const desc = { '==': '等于', '!=': '不等于', '<=': '小于等于', '>=': '大于等于', '<': '小于', '>': '大于', '&&': '逻辑与（两边都真才真）', '||': '逻辑或（一边真即真）' }[op];
      return {
        comment: `判断 ${left} ${op} ${right}（${desc}），结果用于条件控制`,
        detail: `表达式 ${left} ${op} ${right} 的结果是 0 或 1。== 比较相等（单个 = 是赋值），!= 不相等，&& 逻辑与，|| 逻辑或。`
      };
    }
  },

  // 29. 修饰符声明（const / static 等 + 变量）
  {
    name: 'modifier-decl',
    type: '变量',
    pattern: new RegExp(`^(const|static|volatile|extern|register)\\s+(${TYPE})\\s+(${ID})\\s*(=\\s*[^;]+)?;`),
    parse(m) {
      const mod = m[1];
      const base = m[2].trim();
      const name = m[3];
      const init = m[4] ? m[4].trim() : '';
      const modDesc = {
        const: '常量：值不可修改', static: '静态：函数内只初始化一次/文件内可见',
        volatile: '易变：每次使用时都从内存读', extern: '外部：变量定义在其他文件', register: '寄存器：尽量放 CPU 寄存器'
      }[mod];
      return {
        comment: `声明${mod} ${base} 变量 ${name}${init ? `，${init.replace('=', '')}` : ''}（${modDesc}）`,
        detail: `${mod} 修饰符：${modDesc}。`
      };
    }
  }
];

// ---------- 类型描述 ----------

function describeBaseType(base, name) {
  const map = {
    'int': '整型', 'char': '字符型', 'float': '单精度浮点', 'double': '双精度浮点',
    'void': '空类型', 'bool': '布尔', '_Bool': '布尔', 'long': '长整型', 'short': '短整型'
  };
  const key = base.replace(/\s+/g, ' ');
  if (key.includes('unsigned')) return '无符号整型';
  if (key.includes('signed')) return '有符号整型';
  if (key.includes('long')) return '长整型';
  if (key.includes('short')) return '短整型';
  return map[key] || base;
}

function describeParams(params) {
  if (!params) return '无参数';
  if (params.trim() === 'void') return '无参数';
  let depth = 0, count = 1;
  for (const ch of params) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return `${count} 个参数`;
}

// ---------- 主入口 ----------

/**
 * 分析一行 C 代码
 * @param {string} line 原始行文本
 * @returns {{type:string, comment:string, detail:string}|null}
 */
function analyzeLine(line) {
  if (typeof line !== 'string') return null;
  const s = clean(line);
  if (!s) return null;

  for (const rule of RULES) {
    const m = rule.pattern.exec(s);
    if (m) {
      try {
        const r = rule.parse(m);
        if (r) {
          return {
            type: rule.type,
            comment: r.comment,
            detail: r.detail || r.comment
          };
        }
      } catch (e) {
        // 单条规则失败不影响整体
      }
    }
  }
  return null;
}

/** 分析一段新增代码（多行），返回每条的分析结果 */
function analyzeLines(lines) {
  const results = [];
  const linesArr = Array.isArray(lines) ? lines : [lines];
  for (let i = 0; i < linesArr.length; i++) {
    const line = linesArr[i];
    if (!line || !line.trim()) continue;
    if (!isComplete(clean(line))) continue;
    const r = analyzeLine(line);
    if (r) {
      r.line = line.trim();
      r.index = i;
      results.push(r);
    }
  }
  return results;
}

module.exports = {
  VERSION,
  analyzeLine,
  analyzeLines,
  isComplete,
  clean
};
