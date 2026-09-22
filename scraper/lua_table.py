"""Minimal parser for Lua *data* modules, as used on MediaWiki (Scribunto).

It is not a Lua interpreter. It understands the subset that wiki data
modules are written in:

    return { ... }                      -- a table literal
    local p = {}                        -- local assignments
    p.MainGifts = { ... }               -- field assignments
    return p

Table literals may contain ``[expr] = value``, ``name = value`` and
positional values; values may be strings (all quote styles and long
brackets), numbers, booleans, nil, nested tables, names of earlier locals,
and ``..`` string concatenation. Comments are skipped.

Lua tables are converted to Python: a table with only positional values
becomes a ``list``; anything else becomes a ``dict`` (positional values get
integer keys starting at 1, as in Lua).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


class LuaParseError(ValueError):
    pass


@dataclass
class Token:
    kind: str  # 'name' | 'string' | 'number' | 'op' | 'eof'
    value: Any
    pos: int


_ESCAPES = {
    "n": "\n", "t": "\t", "r": "\r", "a": "\a", "b": "\b", "f": "\f",
    "v": "\v", "\\": "\\", '"': '"', "'": "'", "\n": "\n",
}
_NUMBER_RE = re.compile(
    r"0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?"
)
_NAME_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_OPS = ("..", "==", "[", "]", "{", "}", "(", ")", "=", ",", ";", ".", "-")


def _long_bracket(src: str, i: int) -> tuple[str, int] | None:
    """If src[i:] starts a long bracket like [[ or [==[, return (body, end)."""
    m = re.compile(r"\[(=*)\[").match(src, i)
    if not m:
        return None
    close = "]" + m.group(1) + "]"
    start = m.end()
    end = src.find(close, start)
    if end == -1:
        raise LuaParseError(f"unterminated long bracket at {i}")
    body = src[start:end]
    if body.startswith("\r\n"):
        body = body[2:]
    elif body.startswith("\n"):
        body = body[1:]
    return body, end + len(close)


def tokenize(src: str) -> list[Token]:
    tokens: list[Token] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in " \t\r\n﻿":
            i += 1
            continue
        if src.startswith("--", i):
            lb = _long_bracket(src, i + 2)
            if lb is not None:
                i = lb[1]
            else:
                nl = src.find("\n", i)
                i = n if nl == -1 else nl + 1
            continue
        if c in "\"'":
            quote, j, out = c, i + 1, []
            while True:
                if j >= n:
                    raise LuaParseError(f"unterminated string at {i}")
                ch = src[j]
                if ch == quote:
                    j += 1
                    break
                if ch == "\n":
                    raise LuaParseError(f"newline in string at {j}")
                if ch == "\\":
                    nxt = src[j + 1] if j + 1 < n else ""
                    if nxt in _ESCAPES:
                        out.append(_ESCAPES[nxt])
                        j += 2
                    elif nxt.isdigit():
                        m = re.compile(r"\d{1,3}").match(src, j + 1)
                        out.append(chr(int(m.group())))
                        j = m.end()
                    elif nxt == "z":
                        j += 2
                        while j < n and src[j] in " \t\r\n":
                            j += 1
                    elif nxt == "x":
                        out.append(chr(int(src[j + 2:j + 4], 16)))
                        j += 4
                    elif nxt == "u":
                        end = src.index("}", j)
                        out.append(chr(int(src[j + 3:end], 16)))
                        j = end + 1
                    else:
                        raise LuaParseError(f"bad escape \\{nxt} at {j}")
                    continue
                out.append(ch)
                j += 1
            tokens.append(Token("string", "".join(out), i))
            i = j
            continue
        if c == "[":
            lb = _long_bracket(src, i)
            if lb is not None:
                tokens.append(Token("string", lb[0], i))
                i = lb[1]
                continue
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            m = _NUMBER_RE.match(src, i)
            text = m.group()
            if text.lower().startswith("0x"):
                val: Any = int(text, 16)
            elif re.fullmatch(r"\d+", text):
                val = int(text)
            else:
                val = float(text)
            tokens.append(Token("number", val, i))
            i = m.end()
            continue
        m = _NAME_RE.match(src, i)
        if m:
            tokens.append(Token("name", m.group(), i))
            i = m.end()
            continue
        for op in _OPS:
            if src.startswith(op, i):
                tokens.append(Token("op", op, i))
                i += len(op)
                break
        else:
            raise LuaParseError(f"unexpected character {c!r} at {i}")
    tokens.append(Token("eof", None, n))
    return tokens


class _Parser:
    def __init__(self, src: str):
        self.src = src
        self.toks = tokenize(src)
        self.i = 0
        self.env: dict[str, Any] = {}

    # -- helpers -----------------------------------------------------------
    def peek(self, k: int = 0) -> Token:
        return self.toks[min(self.i + k, len(self.toks) - 1)]

    def next(self) -> Token:
        t = self.toks[self.i]
        self.i += 1
        return t

    def accept(self, kind: str, value: Any = None) -> Token | None:
        t = self.peek()
        if t.kind == kind and (value is None or t.value == value):
            self.i += 1
            return t
        return None

    def expect(self, kind: str, value: Any = None) -> Token:
        t = self.accept(kind, value)
        if t is None:
            got = self.peek()
            line = self.src.count("\n", 0, got.pos) + 1
            want = value if value is not None else kind
            raise LuaParseError(
                f"line {line}: expected {want!r}, got {got.kind} {got.value!r}"
            )
        return t

    # -- statements --------------------------------------------------------
    def chunk(self) -> Any:
        while self.peek().kind != "eof":
            if self.accept("name", "return"):
                value = self.expr()
                self.accept("op", ";")
                return value
            if self.accept("name", "local"):
                name = self.expect("name").value
                self.expect("op", "=")
                self.env[name] = self.expr()
            else:
                # NAME(.FIELD | [expr])* = expr
                obj: Any = self.env
                key: Any = self.expect("name").value
                while True:
                    if self.accept("op", "."):
                        obj, key = _get(obj, key), self.expect("name").value
                    elif self.accept("op", "["):
                        obj, key = _get(obj, key), self.expr()
                        self.expect("op", "]")
                    else:
                        break
                self.expect("op", "=")
                _set(obj, key, self.expr())
            self.accept("op", ";")
        return None

    # -- expressions -------------------------------------------------------
    def expr(self) -> Any:
        value = self.simple()
        while self.accept("op", ".."):
            rhs = self.simple()
            value = _to_str(value) + _to_str(rhs)
        return value

    def simple(self) -> Any:
        t = self.peek()
        if t.kind == "string":
            self.i += 1
            return t.value
        if t.kind == "number":
            self.i += 1
            return t.value
        if t.kind == "op" and t.value == "-":
            self.i += 1
            return -self.expect("number").value
        if t.kind == "op" and t.value == "{":
            return self.table()
        if t.kind == "op" and t.value == "(":
            self.i += 1
            v = self.expr()
            self.expect("op", ")")
            return v
        if t.kind == "name":
            self.i += 1
            if t.value == "true":
                return True
            if t.value == "false":
                return False
            if t.value == "nil":
                return None
            if t.value in self.env:
                v = self.env[t.value]
                while self.accept("op", "."):
                    v = v[self.expect("name").value]
                return v
            raise LuaParseError(f"unknown name {t.value!r}")
        raise LuaParseError(f"unexpected token {t.kind} {t.value!r}")

    def table(self) -> Any:
        self.expect("op", "{")
        positional: list[Any] = []
        keyed: dict[Any, Any] = {}
        while not self.accept("op", "}"):
            if self.accept("op", "["):
                key = self.expr()
                self.expect("op", "]")
                self.expect("op", "=")
                keyed[key] = self.expr()
            elif (
                self.peek().kind == "name"
                and self.peek(1).kind == "op"
                and self.peek(1).value == "="
            ):
                key = self.next().value
                self.next()
                keyed[key] = self.expr()
            else:
                positional.append(self.expr())
            if not (self.accept("op", ",") or self.accept("op", ";")):
                self.expect("op", "}")
                break
        if not keyed and positional:
            return positional
        # An empty table ({}) becomes a dict so fields can be assigned later
        # (`local p = {}` then `p.X = ...`). Consumers treat {} and [] alike.
        for idx, v in enumerate(positional, start=1):
            keyed[idx] = v
        return keyed


def _get(container: Any, key: Any) -> Any:
    try:
        if isinstance(container, list):
            return container[key - 1]
        return container[key]
    except (KeyError, IndexError, TypeError):
        raise LuaParseError(f"unknown name or field {key!r}") from None


def _set(container: Any, key: Any, value: Any) -> None:
    if isinstance(container, list):
        if isinstance(key, int) and 1 <= key <= len(container) + 1:
            if key == len(container) + 1:
                container.append(value)
            else:
                container[key - 1] = value
            return
        raise LuaParseError(f"cannot set field {key!r} on a list table")
    if not isinstance(container, dict):
        raise LuaParseError(f"cannot set field {key!r} on {type(container).__name__}")
    container[key] = value


def _to_str(v: Any) -> str:
    if isinstance(v, str):
        return v
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, (int, float)):
        return str(v)
    raise LuaParseError(f"cannot concatenate {type(v).__name__}")


def parse_module(src: str) -> Any:
    """Parse a Lua data module and return whatever it returns."""
    parser = _Parser(src)
    return parser.chunk()
