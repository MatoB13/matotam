// Minimal wasm-bindgen import shim for "__wbindgen_placeholder__"
// Needed when bundler can't import the original helper module from the package.

let wasm;

const heap = new Array(32).fill(undefined);
heap.push(undefined, null, true, false);

let heapNext = heap.length;

function getObject(idx) {
  return heap[idx];
}

function dropObject(idx) {
  if (idx < 36) return;
  heap[idx] = heapNext;
  heapNext = idx;
}

function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}

function addHeapObject(obj) {
  if (heapNext === heap.length) heap.push(heap.length + 1);
  const idx = heapNext;
  heapNext = heap[idx];
  heap[idx] = obj;
  return idx;
}

const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });

function getStringFromWasm0(ptr, len) {
  return textDecoder.decode(wasm.memory.buffer.slice(ptr, ptr + len));
}

// ---- Exports expected by many wasm-bindgen builds ----

export function __wbindgen_object_drop_ref(idx) {
  takeObject(idx);
}

export function __wbindgen_object_clone_ref(idx) {
  return addHeapObject(getObject(idx));
}

export function __wbindgen_is_undefined(idx) {
  return getObject(idx) === undefined;
}

export function __wbindgen_is_null(idx) {
  return getObject(idx) === null;
}

export function __wbindgen_boolean_get(idx) {
  const v = getObject(idx);
  return typeof v === "boolean" ? (v ? 1 : 0) : 2;
}

export function __wbindgen_number_get(idx, outPtr) {
  const v = getObject(idx);
  if (typeof v !== "number") return 0;
  // write f64 into wasm memory (caller provides outPtr)
  new DataView(wasm.memory.buffer).setFloat64(outPtr, v, true);
  return 1;
}

export function __wbindgen_string_new(ptr, len) {
  const s = getStringFromWasm0(ptr, len);
  return addHeapObject(s);
}

export function __wbindgen_throw(ptr, len) {
  throw new Error(getStringFromWasm0(ptr, len));
}

export function __wbindgen_rethrow(idx) {
  throw takeObject(idx);
}

// Optional: console error hook (helps debugging)
export function __wbindgen_error_new(ptr, len) {
  const s = getStringFromWasm0(ptr, len);
  return addHeapObject(new Error(s));
}

// wasm-bindgen sometimes calls this to get access to JS global objects
export function __wbindgen_globalThis() {
  return addHeapObject(globalThis);
}

export function __wbindgen_window() {
  return addHeapObject(typeof window !== "undefined" ? window : undefined);
}

export function __wbindgen_self() {
  return addHeapObject(typeof self !== "undefined" ? self : undefined);
}

// This gets set by the generated glue code in many wasm-bindgen outputs.
// We expose a setter so your generated JS can inject the wasm instance if it wants.
export function __wbindgen_set_wasm(val) {
  wasm = val;
}
