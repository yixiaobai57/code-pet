; ============================================================
; CodePet · 系统开关（AutoHotkey v2）
; ------------------------------------------------------------
; 用法：AutoHotkey.exe code-switches.ahk [--symbol] [--shift-ime] [--insert-off]
;   --symbol     中英文符号开关：中文输入法下也强制输出英文标点
;                （写代码时再也不会出现中文标点混入代码）
;   --shift-ime  Shift 快捷键切换中英文输入法（单击 Shift 触发）
;   --insert-off 禁用 Insert 键（防误触改写模式覆盖代码）
; 不带参数运行则全部生效。脚本常驻托盘，右键可退出。
; 由 CodePet 桌宠「设置」面板启动/停止。
; ============================================================
#Requires AutoHotkey v2.0
#SingleInstance Force

; ---------- 解析参数 ----------
global SYMBOL := false, SHIFT_IME := false, INSERT_OFF := false
for arg in A_Args {
    if (arg = "--symbol") {
        SYMBOL := true
    } else if (arg = "--shift-ime") {
        SHIFT_IME := true
    } else if (arg = "--insert-off") {
        INSERT_OFF := true
    }
}
if (A_Args.Length = 0) {
    SYMBOL := true
    SHIFT_IME := true
    INSERT_OFF := true
}

TrayTip "CodePet 系统开关已启动" . (SYMBOL ? " [符号]" : "") . (SHIFT_IME ? " [Shift切中英]" : "") . (INSERT_OFF ? " [Insert禁用]" : "")

; ============================================================
; 1. 中英文符号开关
;    原理：AHK 捕获键盘标点键，用 SendText 直接注入英文字符，
;    绕过输入法（IME）的中文标点转换。
; ============================================================
#HotIf SYMBOL
; 无 Shift 的标点键（注意：分号键用 SC027，因为行首 `;` 是 AHK 注释符）
SC027::SendText(";")
,::SendText(",")
.::SendText(".")
[::SendText("[")
]::SendText("]")
'::SendText("'")
`::SendText("``")
-::SendText("-")
\::SendText("\")
=::SendText("=")
/::SendText("/")
; Shift 组合的标点键（中文输入法下会输出 ！＠＃￥…等，强制回英文）
+1::SendText("!")
+2::SendText("@")
+3::SendText("#")
+4::SendText("$")
+5::SendText("%")
+6::SendText("^")
+7::SendText("&")
+8::SendText("*")
+9::SendText("(")
+0::SendText(")")
+-::SendText("_")
+=::SendText("+")
+[::SendText("{")
+]::SendText("}")
+;::SendText(":")
+'::SendText('"')
+/::SendText("?")
+`::SendText("~")
+\::SendText("|")
+,::SendText("<")
+.::SendText(">")
#HotIf

; ============================================================
; 2. Shift 单击切换中英文输入法
;    短按（<200ms）且期间未按其他键 → 切换中英；
;    长按或组合使用（Shift+字母）不影响原始功能。
; ============================================================
global g_shiftDown := 0

#HotIf SHIFT_IME
~*LShift::
~*RShift::
{
    global g_shiftDown
    g_shiftDown := A_TickCount
}

~*LShift Up::
~*RShift Up::
{
    global g_shiftDown
    if (g_shiftDown > 0 && A_TickCount - g_shiftDown < 200) {
        if (A_PriorKey = "LShift" || A_PriorKey = "RShift") {
            ; 切换中英文：Ctrl+Space（多数输入法支持，可在设置里改成 Alt+Shift）
            Send("{Ctrl down}{Space}{Ctrl up}")
        }
    }
    g_shiftDown := 0
}
#HotIf

; ============================================================
; 3. Insert 改写禁用
; ============================================================
#HotIf INSERT_OFF
Insert::return
#HotIf
