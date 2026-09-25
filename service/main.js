import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// service/config.ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
var CONFIG_RELATIVE_PATH = path.join(".config", "openchamber", "extensions", "openchamber-magic-context.json");
var MAX_CONFIG_BYTES = 16 * 1024;
var MAX_PATH_LENGTH = 4096;
var defaultDataPaths = (home = os.homedir(), temp = os.tmpdir()) => {
  const magicContextStorageDir = path.join(home, ".local", "share", "cortexkit", "magic-context");
  return {
    magicContextStorageDir,
    magicContextDatabase: path.join(magicContextStorageDir, "context.db"),
    openCodeDatabase: path.join(home, ".local", "share", "opencode", "opencode.db"),
    magicContextLog: path.join(temp, "opencode", "magic-context", "magic-context.log")
  };
};
var configFilePath = (home = os.homedir()) => path.join(home, CONFIG_RELATIVE_PATH);
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var validAbsolutePath = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_PATH_LENGTH && !value.includes("\x00") && path.isAbsolute(value);
var parseOverrides = (value) => {
  if (!isRecord(value))
    return null;
  const allowed = new Set(["magicContextStorageDir", "openCodeDatabasePath", "magicContextLogPath"]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    return null;
  const overrides = {};
  for (const key of allowed) {
    const item = value[key];
    if (item === undefined)
      continue;
    if (!validAbsolutePath(item))
      return null;
    if (key === "magicContextStorageDir")
      overrides.magicContextStorageDir = path.resolve(item);
    if (key === "openCodeDatabasePath")
      overrides.openCodeDatabasePath = path.resolve(item);
    if (key === "magicContextLogPath")
      overrides.magicContextLogPath = path.resolve(item);
  }
  return overrides;
};
var readBoundedConfig = async (filePath) => {
  let handle = null;
  try {
    handle = await fs.open(filePath, "r");
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_CONFIG_BYTES)
      return null;
    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_CONFIG_BYTES)
      return null;
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle?.close().catch(() => {
      return;
    });
  }
};
var resolveServiceConfig = async ({
  home = os.homedir(),
  temp = os.tmpdir(),
  filePath = configFilePath(home)
} = {}) => {
  const defaults = defaultDataPaths(home, temp);
  let text;
  try {
    text = await readBoundedConfig(filePath);
  } catch (error) {
    return error.code === "ENOENT" ? { paths: defaults, state: "default" } : { paths: defaults, state: "invalid" };
  }
  if (text === null)
    return { paths: defaults, state: "invalid" };
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { paths: defaults, state: "invalid" };
  }
  const overrides = parseOverrides(decoded);
  if (!overrides)
    return { paths: defaults, state: "invalid" };
  const magicContextStorageDir = overrides.magicContextStorageDir ?? defaults.magicContextStorageDir;
  return {
    paths: {
      magicContextStorageDir,
      magicContextDatabase: path.join(magicContextStorageDir, "context.db"),
      openCodeDatabase: overrides.openCodeDatabasePath ?? defaults.openCodeDatabase,
      magicContextLog: overrides.magicContextLogPath ?? defaults.magicContextLog
    },
    state: Object.keys(decoded).length ? "configured" : "default"
  };
};

// service/server.ts
import { timingSafeEqual } from "node:crypto";
import http from "node:http";

// service/diagnostics.ts
import { stat } from "node:fs";

// node_modules/zod/v4/core/util.js
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function attachSchema(issues, start, inst) {
  var _a;
  for (let i = start;i < issues.length; i++) {
    (_a = issues[i]).schema ?? (_a.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config) {
  var _a;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a = iss).schema ?? (_a.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : undefined;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
  const units = str.length;
  if (!highSurrogate.test(str))
    return units;
  let count = units;
  for (let i = 0;i < units - 1; i++) {
    if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
      count--;
      i++;
    }
  }
  return count;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return;
  }
};
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = undefined;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}

// node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: undefined, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition;
      }
      try {
        return new Definition;
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition;
}
function $constructor(name, initializer, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = new Set;
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && new WeakSet;
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = undefined;
      }
    } else if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    if (initialized) {
      const own2 = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own2;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own2;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto2 = _.prototype;
    for (const k in proto2) {
      if (!Object.prototype.hasOwnProperty.call(proto2, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto2[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = undefined;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _issuesDesc = { value: undefined, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = undefined;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, undefined, {
  Parent: Error
});

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError;
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
function failure(Err, issues, ctx) {
  let error;
  return {
    success: false,
    get error() {
      if (!error) {
        error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = undefined;
        ctx = undefined;
      }
      return error;
    },
    set error(e) {
      error = e;
      issues = undefined;
      ctx = undefined;
    }
  };
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);

// node_modules/zod/v4/core/regexes.js
var anyString = /^[\s\S]{0,}$/;
var bigint = /^-?\d+n?$/;
var number = /^-?\d+(?:\.\d+)?$/;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a2;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
});
var _whenHasLength = (payload) => {
  const val = payload.value;
  return !nullish(val) && val.length !== undefined;
};
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 6,
  patch: 5
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
}, {
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {}
      return validateAsync(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = def.pattern ?? anyString;
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodBigInt = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = bigint;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = BigInt(payload.value);
      } catch (_) {}
    if (typeof payload.value === "bigint")
      return payload;
    payload.issues.push({
      expected: "bigint",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== undefined) ? "optional" : undefined);
  defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
  defineLazyInternal(inst, "values", (zod) => {
    if (zod.def.options.every((o) => o._zod.values)) {
      return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    if (zod.def.options.every((o) => o._zod.pattern)) {
      const patterns = zod.def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});

// node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
function _string(Class, params) {
  return new Class(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
function _number(Class, params) {
  return new Class(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
function _bigint(Class, params) {
  return new Class({
    type: "bigint",
    ...normalizeParams(params)
  });
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _trim() {
  return _overwrite((input) => input.trim());
}
// node_modules/zod/v4/mini/schemas.js
var ZodMiniType = /* @__PURE__ */ $constructor("ZodMiniType", (inst, def) => {
  if (!inst._zod)
    throw new Error("Uninitialized schema in ZodMiniType.");
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
}, {
  get with() {
    return this.check;
  },
  set with(value) {
    own(this, "with", value);
  },
  parse(data, params) {
    return parse(this, data, params, { callee: this.parse });
  },
  parseAsync(data, params) {
    return parseAsync(this, data, params, { callee: this.parseAsync });
  },
  safeParse(data, params) {
    return safeParse(this, data, params);
  },
  safeParseAsync(data, params) {
    return safeParseAsync(this, data, params);
  },
  check(...checks) {
    const def = this.def;
    return this.clone({
      ...def,
      checks: [
        ...def.checks ?? [],
        ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }, { parent: true });
  },
  clone(_def, params) {
    return clone(this, _def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta2) {
    reg.add(this, meta2);
    return this;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  }
});
var ZodMiniString = /* @__PURE__ */ $constructor("ZodMiniString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodMiniType.init(inst, def);
});
function string2(params) {
  return _string(ZodMiniString, params);
}
var ZodMiniNumber = /* @__PURE__ */ $constructor("ZodMiniNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodMiniType.init(inst, def);
});
function number2(params) {
  return _number(ZodMiniNumber, params);
}
var ZodMiniBigInt = /* @__PURE__ */ $constructor("ZodMiniBigInt", (inst, def) => {
  $ZodBigInt.init(inst, def);
  ZodMiniType.init(inst, def);
});
function bigint2(params) {
  return _bigint(ZodMiniBigInt, params);
}
var ZodMiniUnion = /* @__PURE__ */ $constructor("ZodMiniUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodMiniType.init(inst, def);
});
function union(options, params) {
  return new ZodMiniUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
// service/magic-context-rpc.ts
import { createHash } from "node:crypto";
import fs2 from "node:fs/promises";
import path2 from "node:path";
var MAX_DISCOVERY_FILES = 64;
var MAX_PORT_FILE_BYTES = 8 * 1024;
var MAX_RESPONSE_BYTES = 512 * 1024;
var REQUEST_TIMEOUT_MS = 2000;
var RPC_METHODS = ["sidebar-snapshot", "status-detail"];
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var projectHash = (directory) => createHash("sha256").update(directory.replace(/\/+$/, "")).digest("hex").slice(0, 16);
var validateProjectDirectory = (value) => typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.includes("\x00") && !/(^|[\\/])\.\.([\\/]|$)/.test(value) && value.trim() === value && path2.isAbsolute(value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
var validateSessionId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
var parsePortRecord = (text) => {
  if (Buffer.byteLength(text, "utf8") > MAX_PORT_FILE_BYTES)
    return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord2(value))
    return null;
  const { port, pid, started_at: startedAt, token, instance_id: instanceId } = value;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return null;
  if (!Number.isSafeInteger(pid) || pid < 1)
    return null;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt < 0)
    return null;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token))
    return null;
  if (instanceId !== undefined && (typeof instanceId !== "string" || !/^[a-f0-9]{16,64}$/i.test(instanceId)))
    return null;
  return {
    port,
    pid,
    started_at: startedAt,
    token,
    ...typeof instanceId === "string" ? { instance_id: instanceId } : {}
  };
};
var readPortRecord = async (filePath) => {
  let handle = null;
  try {
    handle = await fs2.open(filePath, "r");
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_PORT_FILE_BYTES)
      return null;
    const buffer = Buffer.alloc(MAX_PORT_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_PORT_FILE_BYTES)
      return null;
    return parsePortRecord(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await handle?.close().catch(() => {
      return;
    });
  }
};
var fetchBoundedJson = async (response, maxBytes) => {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes)
    return null;
  try {
    const reader = response.body?.getReader();
    if (!reader)
      return null;
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
};
var healthIdentityMatches = (record, body) => {
  if (!isRecord2(body) || body.ok !== true || body.pid !== record.pid)
    return false;
  const healthInstance = body.instance_id;
  if (healthInstance !== undefined && (typeof healthInstance !== "string" || !/^[a-f0-9]{16,64}$/i.test(healthInstance)))
    return false;
  if (record.instance_id === undefined && healthInstance === undefined)
    return true;
  return typeof healthInstance === "string" && record.instance_id === healthInstance;
};
var healthCheck = async (record, fetcher) => {
  try {
    const response = await fetcher(`http://127.0.0.1:${record.port}/health`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok)
      return "unavailable";
    const body = await fetchBoundedJson(response, 4 * 1024);
    return healthIdentityMatches(record, body) ? "ready" : "mismatch";
  } catch {
    return "unavailable";
  }
};
var discoverRpcEndpoint = async ({
  storageDir,
  directory,
  fetcher = fetch
}) => {
  if (!validateProjectDirectory(directory) || !path2.isAbsolute(storageDir)) {
    return { endpoint: null, state: "error", sawIdentityMismatch: false, sawUnsupportedRecord: false };
  }
  const discoveryDir = path2.join(storageDir, "rpc", projectHash(directory));
  let entries = [];
  let exceededDiscoveryLimit = false;
  try {
    const directoryHandle = await fs2.opendir(discoveryDir);
    for await (const entry of directoryHandle) {
      if (!entry.isFile() || !/^port-[^/]+\.json$/.test(entry.name))
        continue;
      if (entries.length >= MAX_DISCOVERY_FILES) {
        exceededDiscoveryLimit = true;
        break;
      }
      entries.push(entry);
    }
  } catch (error) {
    return {
      endpoint: null,
      state: error.code === "ENOENT" ? "missing" : "error",
      sawIdentityMismatch: false,
      sawUnsupportedRecord: false
    };
  }
  const records = [];
  let sawUnsupportedRecord = exceededDiscoveryLimit;
  for (const entry of entries) {
    try {
      const filePath = path2.join(discoveryDir, entry.name);
      const parsed = await readPortRecord(filePath);
      if (!parsed) {
        sawUnsupportedRecord = true;
        continue;
      }
      records.push(parsed);
    } catch {}
  }
  records.sort((left, right) => right.started_at - left.started_at);
  let sawIdentityMismatch = false;
  let sawReachableRecord = false;
  for (const record of records) {
    const health = await healthCheck(record, fetcher);
    if (health === "ready") {
      return { endpoint: record, state: sawUnsupportedRecord ? "partial" : "ready", sawIdentityMismatch, sawUnsupportedRecord };
    }
    if (health === "mismatch")
      sawIdentityMismatch = true;
    else
      sawReachableRecord = true;
  }
  return {
    endpoint: null,
    state: sawIdentityMismatch || sawReachableRecord ? "error" : sawUnsupportedRecord ? "unsupported" : "missing",
    sawIdentityMismatch,
    sawUnsupportedRecord
  };
};
var finiteValue = (object, key, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
};
var booleanValue = (object, key) => typeof object[key] === "boolean" ? object[key] : null;
var safeTtlMs = (value) => {
  if (typeof value !== "string")
    return null;
  if (value === "never")
    return -1;
  const match = value.trim().match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match)
    return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
  const milliseconds = amount * multiplier;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
};
var safeRecompProgress = (value) => {
  if (!isRecord2(value))
    return null;
  const phase = value.phase;
  if (!["recomp", "migration", "done", "failed", "skipped"].includes(String(phase)))
    return null;
  const processedMessages = finiteValue(value, "processedMessages");
  const totalMessages = finiteValue(value, "totalMessages");
  const passCount = finiteValue(value, "passCount");
  const compartmentsCreated = finiteValue(value, "compartmentsCreated");
  if (processedMessages === null || totalMessages === null || passCount === null || compartmentsCreated === null)
    return null;
  const kind = value.kind;
  return {
    kind: kind === "recomp" || kind === "upgrade" || kind === "embed" || kind === "wrapup" ? kind : null,
    phase,
    processedMessages,
    totalMessages,
    passCount,
    compartmentsCreated
  };
};
var mapLiveSidebar = (sidebar, detail) => {
  const recomp = safeRecompProgress(sidebar.recompProgress) ?? (detail ? safeRecompProgress(detail.recompProgress) : null);
  const cacheTtlMs = detail ? finiteValue(detail, "cacheTtlMs", -1) : null;
  const rawCacheTtlMs = cacheTtlMs ?? safeTtlMs(sidebar.cacheTtl);
  const dreamerProgress = sidebar.dreamerProgress;
  return {
    usage: {
      inputTokens: finiteValue(sidebar, "inputTokens"),
      contextLimit: finiteValue(sidebar, "contextLimit"),
      usagePercent: finiteValue(sidebar, "usagePercentage", 0, 100)
    },
    composition: {
      systemPromptTokens: finiteValue(sidebar, "systemPromptTokens"),
      conversationTokens: finiteValue(sidebar, "conversationTokens"),
      toolCallTokens: finiteValue(sidebar, "toolCallTokens"),
      toolDefinitionTokens: finiteValue(sidebar, "toolDefinitionTokens"),
      compartmentTokens: finiteValue(sidebar, "compartmentTokens"),
      factTokens: finiteValue(sidebar, "factTokens"),
      memoryTokens: finiteValue(sidebar, "memoryTokens"),
      docsTokens: finiteValue(sidebar, "docsTokens"),
      profileTokens: finiteValue(sidebar, "profileTokens")
    },
    counts: {
      compartments: finiteValue(sidebar, "compartmentCount"),
      memories: finiteValue(sidebar, "memoryCount"),
      memoryBlocks: finiteValue(sidebar, "memoryBlockCount"),
      pendingOperations: finiteValue(sidebar, "pendingOpsCount"),
      sessionNotes: finiteValue(sidebar, "sessionNoteCount"),
      readySmartNotes: finiteValue(sidebar, "readySmartNoteCount")
    },
    activity: {
      historianRunning: booleanValue(sidebar, "historianRunning"),
      dreamerRunning: dreamerProgress === undefined ? null : dreamerProgress === null ? false : isRecord2(dreamerProgress) ? true : null,
      lastDreamerRunAt: finiteValue(sidebar, "lastDreamerRunAt"),
      historianFailures: detail ? finiteValue(detail, "historianFailureCount") : null
    },
    transform: {
      hasLastError: "lastTransformError" in sidebar && (typeof sidebar.lastTransformError === "string" || sidebar.lastTransformError === null) ? typeof sidebar.lastTransformError === "string" && sidebar.lastTransformError.length > 0 : detail && ("lastTransformError" in detail) && (typeof detail.lastTransformError === "string" || detail.lastTransformError === null) ? typeof detail.lastTransformError === "string" && detail.lastTransformError.length > 0 : null,
      inProgress: booleanValue(sidebar, "compartmentInProgress"),
      recomp
    },
    cache: {
      ttlMs: rawCacheTtlMs,
      remainingMs: detail ? finiteValue(detail, "cacheRemainingMs", -1) : null,
      expired: detail ? booleanValue(detail, "cacheExpired") : null,
      thresholdPercent: finiteValue(sidebar, "executeThreshold", 0, 100)
    }
  };
};
var status = (state, observedAt, capabilities) => ({
  source: "magic-context-rpc",
  state,
  observedAt,
  freshness: state === "ready" || state === "partial" ? "fresh" : "unknown",
  ageMs: 0,
  capabilities
});
var decodeRpcResult = async (response) => ({
  status: response.status,
  body: await fetchBoundedJson(response, MAX_RESPONSE_BYTES)
});
var invokeAllowlistedRpc = async (endpoint, method, parameters, fetcher) => {
  if (!RPC_METHODS.includes(method))
    return { status: 404, body: null };
  const response = await fetcher(`http://127.0.0.1:${endpoint.port}/rpc/${method}`, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.token}` },
    body: JSON.stringify(parameters),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  return decodeRpcResult(response);
};
var readLiveSidebar = async ({
  storageDir,
  directory,
  sessionId,
  fetcher = fetch,
  now = () => new Date
}) => {
  const observedAt = now().toISOString();
  const discovery = await discoverRpcEndpoint({ storageDir, directory, fetcher });
  if (!discovery.endpoint) {
    const state2 = discovery.state;
    return {
      status: status(state2, observedAt, [
        { id: "rpc.discovery", state: discovery.sawUnsupportedRecord ? "partial" : "unavailable" },
        { id: "rpc.bearer-auth", state: discovery.sawUnsupportedRecord ? "unsupported" : "unavailable" },
        { id: "rpc.sidebar-snapshot", state: "unavailable" },
        { id: "rpc.status-detail", state: "unavailable" },
        { id: "rpc.activity-status", state: "unavailable" }
      ]),
      sidebar: null
    };
  }
  if (!sessionId || !validateSessionId(sessionId)) {
    return {
      status: status("partial", observedAt, [
        { id: "rpc.discovery", state: discovery.sawUnsupportedRecord ? "partial" : "available" },
        { id: "rpc.bearer-auth", state: "available" },
        { id: "rpc.sidebar-snapshot", state: "unavailable" },
        { id: "rpc.status-detail", state: "unavailable" },
        { id: "rpc.activity-status", state: "unavailable" }
      ]),
      sidebar: null
    };
  }
  const parameters = { sessionId, directory };
  let sidebarReply;
  try {
    sidebarReply = await invokeAllowlistedRpc(discovery.endpoint, "sidebar-snapshot", parameters, fetcher);
  } catch {
    return {
      status: status("error", now().toISOString(), [
        { id: "rpc.discovery", state: discovery.sawUnsupportedRecord ? "partial" : "available" },
        { id: "rpc.bearer-auth", state: "available" },
        { id: "rpc.sidebar-snapshot", state: "unavailable" },
        { id: "rpc.status-detail", state: "unavailable" },
        { id: "rpc.activity-status", state: "unavailable" }
      ]),
      sidebar: null
    };
  }
  if (!sidebarReply.body || sidebarReply.status < 200 || sidebarReply.status >= 300 || !isRecord2(sidebarReply.body)) {
    const unsupported = sidebarReply.status === 404;
    return {
      status: status(unsupported ? "unsupported" : "error", now().toISOString(), [
        { id: "rpc.discovery", state: discovery.sawUnsupportedRecord ? "partial" : "available" },
        { id: "rpc.bearer-auth", state: "available" },
        { id: "rpc.sidebar-snapshot", state: unsupported ? "unsupported" : "unavailable" },
        { id: "rpc.status-detail", state: "unavailable" },
        { id: "rpc.activity-status", state: "unavailable" }
      ]),
      sidebar: null
    };
  }
  const rawSidebar = sidebarReply.body;
  if (typeof rawSidebar.error === "string") {
    return {
      status: status("error", now().toISOString(), [
        { id: "rpc.discovery", state: discovery.sawUnsupportedRecord ? "partial" : "available" },
        { id: "rpc.bearer-auth", state: "available" },
        { id: "rpc.sidebar-snapshot", state: "unavailable" },
        { id: "rpc.status-detail", state: "unavailable" },
        { id: "rpc.activity-status", state: "unavailable" }
      ]),
      sidebar: null
    };
  }
  if (rawSidebar.sessionId !== sessionId) {
    return {
      status: status("partial", now().toISOString(), [
        { id: "rpc.discovery", state: discovery.sawUnsupportedRecord ? "partial" : "available" },
        { id: "rpc.bearer-auth", state: "available" },
        { id: "rpc.sidebar-snapshot", state: "partial" },
        { id: "rpc.status-detail", state: "unavailable" },
        { id: "rpc.activity-status", state: "unavailable" }
      ]),
      sidebar: null
    };
  }
  let detail = null;
  let detailCapability = "unavailable";
  try {
    const result = await invokeAllowlistedRpc(discovery.endpoint, "status-detail", parameters, fetcher);
    if (result.status === 404)
      detailCapability = "unsupported";
    else if (result.status >= 200 && result.status < 300 && isRecord2(result.body) && typeof result.body.error === "string")
      detailCapability = "unavailable";
    else if (result.status >= 200 && result.status < 300 && isRecord2(result.body) && result.body.sessionId === sessionId) {
      detail = result.body;
      const hasCurrentStatusFields = finiteValue(detail, "cacheTtlMs", -1) !== null && finiteValue(detail, "cacheRemainingMs", -1) !== null && typeof detail.cacheExpired === "boolean" && finiteValue(detail, "historianFailureCount") !== null;
      detailCapability = hasCurrentStatusFields ? "available" : "partial";
    } else if (result.body && isRecord2(result.body))
      detailCapability = "partial";
  } catch {
    detailCapability = "unavailable";
  }
  const sidebar = mapLiveSidebar(rawSidebar, detail);
  const requiredUsage = sidebar.usage.inputTokens !== null && sidebar.usage.contextLimit !== null && sidebar.usage.usagePercent !== null;
  const compositionValues = Object.values(sidebar.composition);
  const countValues = Object.values(sidebar.counts);
  const compositionCapability = compositionValues.every((value) => value !== null) ? "available" : "partial";
  const countsCapability = countValues.every((value) => value !== null) ? "available" : "partial";
  const transformCapability = sidebar.transform.hasLastError !== null && sidebar.transform.inProgress !== null && "recompProgress" in rawSidebar && (rawSidebar.recompProgress === null || safeRecompProgress(rawSidebar.recompProgress) !== null) ? "available" : "partial";
  const validLastDreamerRunAt = rawSidebar.lastDreamerRunAt === null || finiteValue(rawSidebar, "lastDreamerRunAt") !== null;
  const activityCapability = typeof rawSidebar.historianRunning === "boolean" && "lastDreamerRunAt" in rawSidebar && validLastDreamerRunAt && "dreamerProgress" in rawSidebar ? "available" : "partial";
  const cacheCapability = sidebar.cache.ttlMs !== null || sidebar.cache.thresholdPercent !== null ? "available" : "partial";
  const state = requiredUsage && discovery.state === "ready" && detailCapability === "available" && compositionCapability === "available" && countsCapability === "available" && activityCapability === "available" && transformCapability === "available" && cacheCapability === "available" ? "ready" : "partial";
  return {
    status: status(state, now().toISOString(), [
      { id: "rpc.discovery", state: discovery.sawUnsupportedRecord ? "partial" : "available" },
      { id: "rpc.bearer-auth", state: "available" },
      { id: "rpc.sidebar-snapshot", state: requiredUsage ? "available" : "partial" },
      { id: "rpc.sidebar-composition", state: compositionCapability },
      { id: "rpc.sidebar-counts", state: countsCapability },
      { id: "rpc.status-detail", state: detailCapability },
      { id: "rpc.activity-status", state: activityCapability },
      { id: "rpc.transform-status", state: transformCapability },
      { id: "rpc.cache-status", state: cacheCapability }
    ]),
    sidebar
  };
};

// service/diagnostics.ts
var MAX_CACHE_ROWS = 50;
var MESSAGE_TABLES = ["message", "session_message"];
var COUNT_TABLES = ["compartments", "memories", "pending_ops", "notes"];
var USAGE_COLUMNS = [
  "last_input_tokens",
  "last_context_percentage",
  "last_usage_percentage",
  "last_usage_context_limit"
];
var sqliteNumberSchema = union([
  number2(),
  bigint2(),
  string2().check(_trim(), _minLength(1))
]);
var sqliteStringSchema = string2().check(_minLength(1));
var sqliteModulePromise = null;
var loadSqlite = () => {
  sqliteModulePromise ??= import("node:sqlite").catch(() => null);
  return sqliteModulePromise;
};
var fileState = (filePath) => new Promise((resolve) => {
  stat(filePath, (error) => {
    if (!error)
      resolve("ready");
    else
      resolve(error.code === "ENOENT" ? "missing" : "error");
  });
});
var finiteNumber = (value) => {
  const parsed = sqliteNumberSchema.safeParse(value);
  if (!parsed.success)
    return null;
  const number3 = Number(parsed.data);
  return Number.isFinite(number3) ? number3 : null;
};
var stringValue = (value) => {
  const parsed = sqliteStringSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
var timestamp = (value) => {
  const text = sqliteStringSchema.safeParse(value);
  if (text.success) {
    const parsed2 = Date.parse(text.data);
    if (Number.isFinite(parsed2))
      return new Date(parsed2).toISOString();
  }
  const number3 = finiteNumber(value);
  if (number3 === null)
    return null;
  const milliseconds = number3 < 1000000000000 ? number3 * 1000 : number3;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
var ratio = (cacheRead, inputTokens) => {
  if (cacheRead === null || inputTokens === null || cacheRead + inputTokens <= 0)
    return null;
  return Math.max(0, Math.min(1, cacheRead / (cacheRead + inputTokens)));
};
var safeCause = (decision, reason, emergency) => {
  if (emergency === 1)
    return "emergency";
  const normalizedDecision = (decision ?? "").toLowerCase();
  if (normalizedDecision.includes("material"))
    return "materialized";
  if (normalizedDecision.includes("threshold"))
    return "threshold";
  if (normalizedDecision.includes("compact"))
    return "compaction";
  if (normalizedDecision.includes("cache"))
    return "cache";
  const combined = (reason ?? "").toLowerCase();
  if (combined.includes("threshold"))
    return "threshold";
  if (combined.includes("material"))
    return "materialized";
  if (combined.includes("compact"))
    return "compaction";
  if (combined.includes("cache"))
    return "cache";
  return combined.trim() ? "unknown" : null;
};
var quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
var tableNames = (database) => {
  const rows = database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all();
  const names = new Set;
  for (const row of rows) {
    const name = stringValue(row.name);
    if (name)
      names.add(name);
  }
  return names;
};
var tableColumns = (database, table) => {
  const rows = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  const names = new Set;
  for (const row of rows) {
    const name = stringValue(row.name);
    if (name)
      names.add(name);
  }
  return names;
};
var countRows = (database, table, sessionId) => {
  const columns = tableColumns(database, table);
  if (!columns.size)
    return null;
  const clauses = [];
  const parameters = [];
  if (sessionId && columns.has("session_id")) {
    clauses.push(`${quoteIdentifier("session_id")} = ?`);
    parameters.push(sessionId);
  }
  if (columns.has("deleted_at"))
    clauses.push(`${quoteIdentifier("deleted_at")} IS NULL`);
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const result = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}${where}`).get(...parameters);
  return finiteNumber(result?.count);
};
var usageFromContextDb = (database, sessionId) => {
  if (!sessionId)
    return null;
  const tables = tableNames(database);
  if (!tables.has("session_meta"))
    return null;
  const columns = tableColumns(database, "session_meta");
  if (!columns.has("session_id"))
    return null;
  const selected = USAGE_COLUMNS.filter((column) => columns.has(column));
  if (!selected.length)
    return null;
  const filters = [`${quoteIdentifier("session_id")} = ?`];
  const parameters = [sessionId];
  if (columns.has("harness")) {
    filters.push(`${quoteIdentifier("harness")} = ?`);
    parameters.push("opencode");
  }
  const fields = selected.map(quoteIdentifier).join(", ");
  const row = database.prepare(`SELECT ${fields} FROM ${quoteIdentifier("session_meta")} WHERE ${filters.join(" AND ")} LIMIT 1`).get(...parameters);
  if (!row)
    return null;
  const usagePercent = finiteNumber(row.last_context_percentage) ?? finiteNumber(row.last_usage_percentage);
  return {
    inputTokens: finiteNumber(row.last_input_tokens),
    contextLimit: finiteNumber(row.last_usage_context_limit),
    usagePercent: usagePercent === null ? null : Math.max(0, Math.min(100, usagePercent))
  };
};
var contextDatabase = async (filePath, sessionId, messageIds, sqlite) => {
  if (!sqlite)
    return { state: "unsupported", counts: null, context: null, causes: new Map, transformDecisionsCapability: "unsupported" };
  const pathState = await fileState(filePath);
  if (pathState !== "ready")
    return { state: pathState, counts: null, context: null, causes: new Map, transformDecisionsCapability: "unavailable" };
  let database = null;
  try {
    database = new sqlite.DatabaseSync(filePath, { readOnly: true });
    database.exec("PRAGMA query_only = ON");
    const tables = tableNames(database);
    const counts = {
      compartments: tables.has("compartments") ? countRows(database, "compartments", sessionId) : null,
      memories: tables.has("memories") ? countRows(database, "memories", sessionId) : null,
      pendingOps: tables.has("pending_ops") ? countRows(database, "pending_ops", sessionId) : null,
      sessionNotes: tables.has("notes") ? countRows(database, "notes", sessionId) : null
    };
    const context = usageFromContextDb(database, sessionId);
    const causes = readDecisionCauses(database, sessionId, messageIds);
    const anyTable = COUNT_TABLES.some((table) => tables.has(table)) || tables.has("session_meta");
    let transformDecisionsCapability = "unsupported";
    if (tables.has("transform_decisions")) {
      const columns = tableColumns(database, "transform_decisions");
      const hasDecisionFields = ["decision", "materialize_reason", "emergency"].some((column) => columns.has(column));
      transformDecisionsCapability = columns.has("session_id") && columns.has("message_id") && hasDecisionFields ? "available" : "partial";
    }
    return {
      state: anyTable ? "ready" : "partial",
      counts,
      context,
      causes,
      transformDecisionsCapability
    };
  } catch {
    return { state: "error", counts: null, context: null, causes: new Map, transformDecisionsCapability: "unavailable" };
  } finally {
    database?.close();
  }
};
var readDecisionCauses = (database, sessionId, messageIds) => {
  if (!sessionId || !messageIds.length || !tableNames(database).has("transform_decisions"))
    return new Map;
  const columns = tableColumns(database, "transform_decisions");
  if (!columns.has("session_id") || !columns.has("message_id"))
    return new Map;
  const selected = ["message_id", "decision", "materialize_reason", "emergency"].filter((column) => columns.has(column));
  if (selected.length < 2)
    return new Map;
  const filters = [`${quoteIdentifier("session_id")} = ?`];
  const parameters = [sessionId];
  if (columns.has("harness")) {
    filters.push(`${quoteIdentifier("harness")} = ?`);
    parameters.push("opencode");
  }
  filters.push(`${quoteIdentifier("message_id")} IN (${messageIds.map(() => "?").join(", ")})`);
  parameters.push(...messageIds);
  const rows = database.prepare(`SELECT ${selected.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier("transform_decisions")} WHERE ${filters.join(" AND ")} LIMIT ${messageIds.length}`).all(...parameters);
  const causes = new Map;
  for (const row of rows) {
    const id = stringValue(row.message_id);
    if (!id)
      continue;
    const cause = safeCause(stringValue(row.decision), stringValue(row.materialize_reason), finiteNumber(row.emergency));
    if (cause)
      causes.set(id, cause);
  }
  return causes;
};
var openCodeCacheEvents = (database, sessionId) => {
  if (!sessionId)
    return { state: "partial", lastInputTokens: null, events: [] };
  const tables = tableNames(database);
  const table = MESSAGE_TABLES.find((name) => tables.has(name));
  if (!table)
    return { state: "partial", lastInputTokens: null, events: [] };
  const columns = tableColumns(database, table);
  const timeColumn = columns.has("time_created") ? "time_created" : columns.has("created_at") ? "created_at" : null;
  if (!columns.has("id") || !columns.has("session_id") || !columns.has("data") || !timeColumn) {
    return { state: "partial", lastInputTokens: null, events: [] };
  }
  const roleExpression = `CASE WHEN json_valid(${quoteIdentifier("data")}) THEN json_extract(${quoteIdentifier("data")}, '$.role') END`;
  const filters = [`${roleExpression} = 'assistant'`];
  const parameters = [];
  if (sessionId) {
    filters.push(`${quoteIdentifier("session_id")} = ?`);
    parameters.push(sessionId);
  }
  const rows = database.prepare(`
    SELECT ${quoteIdentifier("id")} AS message_id, ${quoteIdentifier(timeColumn)} AS created_at,
      json_extract(${quoteIdentifier("data")}, '$.role') AS role,
      json_extract(${quoteIdentifier("data")}, '$.tokens.input') AS input_tokens,
      json_extract(${quoteIdentifier("data")}, '$.tokens.cache.read') AS cache_read,
      json_extract(${quoteIdentifier("data")}, '$.tokens.cache.write') AS cache_write,
      json_extract(${quoteIdentifier("data")}, '$.tokens.total') AS total_tokens
    FROM ${quoteIdentifier(table)} WHERE ${filters.join(" AND ")}
    ORDER BY ${quoteIdentifier(timeColumn)} DESC LIMIT ${MAX_CACHE_ROWS}
  `).all(...parameters);
  const events = [];
  let assistantRows = 0;
  let usageShapeSeen = false;
  for (const row of rows) {
    if (stringValue(row.role) !== "assistant")
      continue;
    assistantRows += 1;
    const inputTokens = finiteNumber(row.input_tokens);
    const cacheRead = finiteNumber(row.cache_read);
    const cacheWrite = finiteNumber(row.cache_write);
    const rowTotalTokens = finiteNumber(row.total_tokens);
    usageShapeSeen ||= inputTokens !== null || cacheRead !== null || cacheWrite !== null || rowTotalTokens !== null;
    const totalTokens = rowTotalTokens ?? [inputTokens, cacheRead, cacheWrite].reduce((sum, value) => sum + (value ?? 0), 0);
    if (totalTokens <= 0)
      continue;
    const messageId = stringValue(row.message_id);
    events.push({
      messageId,
      event: {
        at: timestamp(row.created_at),
        inputTokens,
        cacheRead,
        cacheWrite,
        totalTokens,
        hitRatio: ratio(cacheRead, inputTokens),
        cause: null
      }
    });
  }
  return {
    state: assistantRows > 0 && !usageShapeSeen ? "partial" : "ready",
    lastInputTokens: events[0]?.event.inputTokens ?? null,
    events
  };
};
var openCodeDatabase = async (filePath, sessionId, sqlite) => {
  if (!sqlite)
    return { state: "unsupported", lastInputTokens: null, events: [] };
  const pathState = await fileState(filePath);
  if (pathState !== "ready")
    return { state: pathState, lastInputTokens: null, events: [] };
  let database = null;
  try {
    database = new sqlite.DatabaseSync(filePath, { readOnly: true });
    database.exec("PRAGMA query_only = ON");
    return openCodeCacheEvents(database, sessionId);
  } catch {
    return { state: "error", lastInputTokens: null, events: [] };
  } finally {
    database?.close();
  }
};
var statusFor = (source, state, observedAt, capabilities) => ({
  source,
  state,
  observedAt,
  freshness: state === "ready" || state === "partial" ? "fresh" : "unknown",
  ageMs: 0,
  capabilities
});
var MagicContextDatabaseProvider = {
  read: contextDatabase
};
var OpenCodeUsageProvider = {
  read: openCodeDatabase
};
var emptyDatabaseDiagnostics = () => ({
  magicContext: { counts: null, context: null },
  openCode: { lastInputTokens: null, cacheEvents: [] }
});
var readDatabaseProviders = async ({
  sessionId,
  paths,
  sqlite: sqliteOverride,
  now = () => new Date
}) => {
  const sqlite = sqliteOverride === undefined ? await loadSqlite() : sqliteOverride;
  const openCode = await OpenCodeUsageProvider.read(paths.openCodeDatabase, sessionId, sqlite);
  const messageIds = openCode.events.flatMap(({ messageId }) => messageId ? [messageId] : []);
  const contextWithCauses = await MagicContextDatabaseProvider.read(paths.magicContextDatabase, sessionId, messageIds, sqlite);
  const observedAt = now().toISOString();
  const mcCountValues = contextWithCauses.counts ? Object.values(contextWithCauses.counts) : [];
  const mcCountsCapability = contextWithCauses.state === "unsupported" ? "unsupported" : contextWithCauses.state === "missing" || contextWithCauses.state === "error" ? "unavailable" : contextWithCauses.counts && mcCountValues.every((value) => value !== null) ? "available" : "partial";
  const mcState = contextWithCauses.state === "ready" && mcCountsCapability === "available" ? "ready" : contextWithCauses.state === "ready" ? "partial" : contextWithCauses.state;
  const magicContextStatus = statusFor("magic-context-db", mcState, observedAt, [
    { id: "db.session-counts", state: mcCountsCapability },
    { id: "db.session-usage", state: contextWithCauses.state === "unsupported" ? "unsupported" : contextWithCauses.state === "missing" || contextWithCauses.state === "error" ? "unavailable" : contextWithCauses.context ? "available" : "partial" },
    { id: "db.transform-decisions", state: contextWithCauses.state === "unsupported" ? "unsupported" : contextWithCauses.state === "missing" || contextWithCauses.state === "error" ? "unavailable" : contextWithCauses.transformDecisionsCapability }
  ]);
  const openCodeStatus = statusFor("opencode-db", openCode.state, observedAt, [
    { id: "db.assistant-usage", state: openCode.state === "ready" ? "available" : openCode.state === "partial" ? "partial" : openCode.state === "unsupported" ? "unsupported" : "unavailable" }
  ]);
  return {
    database: {
      magicContext: {
        counts: contextWithCauses.counts,
        context: contextWithCauses.context
      },
      openCode: {
        lastInputTokens: openCode.lastInputTokens,
        cacheEvents: openCode.events.map(({ messageId, event }) => ({
          ...event,
          cause: messageId ? contextWithCauses.causes.get(messageId) ?? null : null
        }))
      }
    },
    magicContextStatus,
    openCodeStatus
  };
};
var unavailableStatus = (source, observedAt) => statusFor(source, "error", observedAt, []);
var noProjectStatus = (observedAt) => statusFor("magic-context-rpc", "missing", observedAt, [
  { id: "rpc.bearer-auth", state: "unavailable" },
  { id: "rpc.sidebar-snapshot", state: "unavailable" },
  { id: "rpc.status-detail", state: "unavailable" }
]);
var buildSnapshot = async ({
  sessionId,
  directory,
  paths,
  logStatus,
  configurationValid = true,
  now = () => new Date
}) => {
  const observedAt = now().toISOString();
  if (!configurationValid) {
    return {
      schemaVersion: 2,
      observedAt,
      sessionId,
      sources: {
        liveRpc: unavailableStatus("magic-context-rpc", observedAt),
        magicContextDatabase: unavailableStatus("magic-context-db", observedAt),
        openCodeDatabase: unavailableStatus("opencode-db", observedAt),
        logTail: logStatus
      },
      liveSidebar: null,
      database: emptyDatabaseDiagnostics()
    };
  }
  const [live, databases] = await Promise.all([
    directory ? readLiveSidebar({ storageDir: paths.magicContextStorageDir, directory, sessionId, now }) : Promise.resolve({ status: noProjectStatus(now().toISOString()), sidebar: null }),
    readDatabaseProviders({ sessionId, paths, now })
  ]);
  return {
    schemaVersion: 2,
    observedAt,
    sessionId,
    sources: {
      liveRpc: live.status,
      magicContextDatabase: databases.magicContextStatus,
      openCodeDatabase: databases.openCodeStatus,
      logTail: logStatus
    },
    liveSidebar: live.sidebar,
    database: databases.database
  };
};

// service/log-tail.ts
import { createHash as createHash2, randomBytes } from "node:crypto";
import fs3 from "node:fs/promises";
var MAX_BOOTSTRAP_BYTES = 256 * 1024;
var MAX_READ_BYTES = 64 * 1024;
var MAX_LINE_BYTES = 8 * 1024;
var MAX_RETAINED_EVENTS = 500;
var MAX_PAGE_EVENTS = 100;
var MAX_SEEN_EVENTS = 2000;
var MAX_CURSORS = 256;
var CURSOR_TTL_MS = 10 * 60 * 1000;
var LOG_FRESHNESS_MS = 1e4;
var logCategory = (message) => {
  const lower = message.toLowerCase();
  if (lower.startsWith("rust pass:"))
    return "transform";
  if (lower.includes("dreamer"))
    return "dreamer";
  if (lower.includes("historian") || lower.includes("compart"))
    return "historian";
  if (lower.includes("transform") || lower.includes("material"))
    return "transform";
  if (lower.includes("cache") || lower.includes("tokens.input"))
    return "cache";
  if (lower.includes("session.status") || lower.includes("stream") || lower.includes("receive") || lower.includes("complete") || lower.includes("event"))
    return "stream";
  return null;
};
var parsedTime = (value) => {
  if (!value)
    return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
};
var hasSupportedEnvelope = (line) => /^\[([^\]]+)\]\s*\[magic-context\](?:\[[^\]]+\])?/i.test(line) || /^\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+/i.test(line);
var parseMagicContextLogLine = (line) => {
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES)
    return null;
  const legacy = line.match(/^\[([^\]]+)\]\s*\[magic-context\](?:\[[^\]]+\])?\s*(.*)$/i);
  const fleet = line.match(/^(\S+)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(.*)$/i);
  const time2 = legacy?.[1] ?? fleet?.[1];
  const message = legacy?.[2] ?? fleet?.[3];
  if (!message)
    return null;
  const category = logCategory(message);
  if (!category)
    return null;
  const numberIn = (name) => {
    const match = message.match(new RegExp(`(?:${name})\\s*[=: ]\\s*(\\d{1,16})`, "i"));
    if (!match)
      return null;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) ? value : null;
  };
  const level = fleet?.[2]?.toLowerCase();
  const normalizedLevel = level === "trace" || level === "debug" || level === "warn" || level === "error" ? level : "info";
  return {
    at: parsedTime(time2),
    level: normalizedLevel,
    category,
    inputTokens: numberIn("tokens(?:\\.input| input)") ?? (message.toLowerCase().startsWith("rust pass:") ? numberIn("\\bin") : null),
    cacheRead: numberIn("cache(?:\\.read| read)"),
    cacheWrite: numberIn("cache(?:\\.write| write)")
  };
};
var eventId = (event) => createHash2("sha256").update(JSON.stringify(event)).digest("hex");

class MagicContextLogTailProvider {
  filePath;
  identity = null;
  offset = 0;
  partialLine = Buffer.alloc(0);
  discardUntilNewline = false;
  initialized = false;
  sequence = 0;
  retained = [];
  seen = new Map;
  cursors = new Map;
  gapHistory = [];
  gapVersion = 0;
  sourceState = "unknown";
  observedAt = null;
  lastGoodAt = null;
  nonEmptyLines = 0;
  supportedEnvelopeSeen = false;
  formatGapRecorded = false;
  constructor(filePath) {
    this.filePath = filePath;
  }
  status(now = Date.now()) {
    const ageMs = this.lastGoodAt === null ? null : Math.max(0, now - this.lastGoodAt);
    const freshness = this.lastGoodAt === null ? "unknown" : (this.sourceState === "ready" || this.sourceState === "partial") && ageMs !== null && ageMs <= LOG_FRESHNESS_MS ? "fresh" : "stale";
    return {
      source: "magic-context-log",
      state: this.sourceState,
      observedAt: this.observedAt,
      freshness,
      ageMs,
      capabilities: [
        { id: "log.incremental-tail", state: this.sourceState === "ready" || this.sourceState === "partial" ? "available" : "unavailable" },
        { id: "log.metadata-parser", state: this.sourceState === "partial" ? "partial" : this.sourceState === "ready" ? "available" : "unavailable" }
      ]
    };
  }
  async poll(cursor, now = Date.now()) {
    await this.scan(now);
    this.expireCursors(now);
    const gaps = new Set;
    let afterSequence;
    let priorGapVersion = 0;
    if (cursor === null) {
      const first = this.retained[0]?.sequence ?? this.sequence + 1;
      afterSequence = Math.max(first - 1, this.sequence - MAX_PAGE_EVENTS);
    } else {
      const state = this.cursors.get(cursor);
      if (!state) {
        gaps.add("cursor-expired");
        afterSequence = Math.max((this.retained[0]?.sequence ?? this.sequence + 1) - 1, this.sequence - MAX_PAGE_EVENTS);
      } else {
        afterSequence = state.sequence;
        priorGapVersion = state.gapVersion;
        this.cursors.delete(cursor);
        if (this.retained.length && afterSequence < this.retained[0].sequence - 1)
          gaps.add("retention");
      }
    }
    for (const gap of this.gapHistory) {
      if (gap.version > priorGapVersion)
        gaps.add(gap.reason);
    }
    const page = this.retained.filter((entry) => entry.sequence > afterSequence).slice(0, MAX_PAGE_EVENTS);
    const nextSequence = page.length ? page[page.length - 1].sequence : this.sequence;
    const nextCursor = this.createCursor(nextSequence, now);
    const status2 = this.status(now);
    if (status2.state === "missing" || status2.state === "error" || status2.state === "unsupported")
      gaps.add("source-unavailable");
    return {
      state: status2.state,
      observedAt: this.observedAt ?? new Date(now).toISOString(),
      events: page.map(({ event }) => event),
      cursor: nextCursor,
      gaps: [...gaps],
      retainedEvents: this.retained.length
    };
  }
  async scan(now) {
    const observedAt = new Date(now).toISOString();
    let handle = null;
    try {
      handle = await fs3.open(this.filePath, "r");
      const info = await handle.stat();
      if (!info.isFile()) {
        this.setFailure("unsupported", observedAt, now);
        return;
      }
      const identity = `${info.dev}:${info.ino}`;
      const gaps = new Set;
      if (!this.initialized) {
        this.initialized = true;
        this.identity = identity;
        if (info.size > MAX_BOOTSTRAP_BYTES) {
          this.offset = info.size - MAX_BOOTSTRAP_BYTES;
          this.discardUntilNewline = true;
          gaps.add("initial-tail");
        }
      } else if (identity !== this.identity) {
        this.identity = identity;
        this.offset = 0;
        this.partialLine = Buffer.alloc(0);
        this.discardUntilNewline = false;
        this.nonEmptyLines = 0;
        this.supportedEnvelopeSeen = false;
        this.formatGapRecorded = false;
        gaps.add("rotation");
      } else if (info.size < this.offset) {
        this.offset = 0;
        this.partialLine = Buffer.alloc(0);
        this.discardUntilNewline = false;
        this.nonEmptyLines = 0;
        this.supportedEnvelopeSeen = false;
        this.formatGapRecorded = false;
        gaps.add("truncation");
      }
      const bytesToRead = Math.max(0, Math.min(MAX_READ_BYTES, info.size - this.offset));
      if (info.size - this.offset > MAX_READ_BYTES)
        gaps.add("backpressure");
      if (bytesToRead > 0) {
        const buffer = Buffer.alloc(bytesToRead);
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, this.offset);
        this.offset += bytesRead;
        this.consume(buffer.subarray(0, bytesRead), gaps);
      }
      if (this.nonEmptyLines > 0 && !this.supportedEnvelopeSeen && !this.formatGapRecorded) {
        gaps.add("format-unsupported");
        this.formatGapRecorded = true;
      }
      this.sourceState = this.nonEmptyLines > 0 && !this.supportedEnvelopeSeen ? "partial" : "ready";
      this.observedAt = observedAt;
      this.lastGoodAt = now;
      for (const gap of gaps)
        this.recordGap(gap);
    } catch (error) {
      const code = error.code;
      const state = code === "ENOENT" ? "missing" : "error";
      const changed = this.sourceState !== state;
      this.sourceState = state;
      this.observedAt = observedAt;
      if (changed)
        this.recordGap("source-unavailable");
    } finally {
      await handle?.close().catch(() => {
        return;
      });
    }
  }
  consume(bytes, gaps) {
    const combined = this.partialLine.length ? Buffer.concat([this.partialLine, bytes]) : bytes;
    this.partialLine = Buffer.alloc(0);
    let start = 0;
    while (start < combined.length) {
      const newline = combined.indexOf(10, start);
      if (newline < 0)
        break;
      const line = combined.subarray(start, newline);
      start = newline + 1;
      if (this.discardUntilNewline) {
        this.discardUntilNewline = false;
        continue;
      }
      this.consumeLine(line, gaps);
    }
    const remaining = combined.subarray(start);
    if (this.discardUntilNewline)
      return;
    if (remaining.length > MAX_LINE_BYTES) {
      this.discardUntilNewline = true;
      gaps.add("backpressure");
      return;
    }
    this.partialLine = Buffer.from(remaining);
  }
  consumeLine(bytes, gaps) {
    const content = bytes.length && bytes[bytes.length - 1] === 13 ? bytes.subarray(0, -1) : bytes;
    if (content.length > MAX_LINE_BYTES) {
      gaps.add("backpressure");
      return;
    }
    const text = content.toString("utf8");
    if (text.trim())
      this.nonEmptyLines += 1;
    if (hasSupportedEnvelope(text))
      this.supportedEnvelopeSeen = true;
    const parsed = parseMagicContextLogLine(text);
    if (!parsed)
      return;
    const id = eventId(parsed);
    if (this.seen.has(id))
      return;
    this.seen.set(id, this.sequence + 1);
    while (this.seen.size > MAX_SEEN_EVENTS) {
      const oldest = this.seen.keys().next().value;
      if (oldest)
        this.seen.delete(oldest);
      else
        break;
    }
    this.sequence += 1;
    this.retained.push({ sequence: this.sequence, event: { id, ...parsed } });
    if (this.retained.length > MAX_RETAINED_EVENTS) {
      this.retained.shift();
      gaps.add("retention");
    }
  }
  recordGap(reason) {
    this.gapVersion += 1;
    this.gapHistory.push({ version: this.gapVersion, reason });
    if (this.gapHistory.length > 64)
      this.gapHistory.shift();
  }
  createCursor(sequence, now) {
    const cursor = randomBytes(18).toString("base64url");
    this.cursors.set(cursor, { sequence, gapVersion: this.gapVersion, createdAt: now });
    while (this.cursors.size > MAX_CURSORS) {
      const oldest = this.cursors.keys().next().value;
      if (oldest)
        this.cursors.delete(oldest);
      else
        break;
    }
    return cursor;
  }
  expireCursors(now) {
    for (const [cursor, state] of this.cursors) {
      if (now - state.createdAt > CURSOR_TTL_MS)
        this.cursors.delete(cursor);
    }
  }
  setFailure(state, observedAt, now) {
    const changed = this.sourceState !== state;
    this.sourceState = state;
    this.observedAt = observedAt;
    if (changed)
      this.recordGap("source-unavailable");
    if (this.lastGoodAt !== null && now - this.lastGoodAt > CURSOR_TTL_MS * 24) {
      this.retained = [];
      this.sequence = 0;
      this.recordGap("retention");
    }
  }
}

// service/server.ts
var MAX_URL_LENGTH = 8192;
var MAX_ACTIVE_REQUESTS = 8;
var reply = (response, status2, body) => {
  response.writeHead(status2, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
};
var isAuthorized = (header, token) => {
  if (!header?.startsWith("Bearer "))
    return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
var onlyQueryKeys = (url, allowed) => {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      return false;
  }
  return true;
};
var emptyLogStatus = (state, observedAt) => ({
  source: "magic-context-log",
  state,
  observedAt,
  freshness: "unknown",
  ageMs: null,
  capabilities: [
    { id: "log.incremental-tail", state: "unavailable" },
    { id: "log.metadata-parser", state: "available" }
  ]
});
var invalidConfigEventPage = (observedAt) => ({
  schemaVersion: 1,
  observedAt,
  source: emptyLogStatus("error", observedAt),
  cursor: null,
  events: [],
  gaps: ["source-unavailable"],
  retainedEvents: 0
});
var createExtensionService = ({
  port,
  token,
  config: config2,
  logProvider
}) => {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
    throw new Error("OpenChamber service port and token are required");
  }
  const logTail = logProvider === undefined ? config2.state === "invalid" ? null : new MagicContextLogTailProvider(config2.paths.magicContextLog) : logProvider;
  let activeRequests = 0;
  return http.createServer((request, response) => {
    if (!isAuthorized(request.headers.authorization, token)) {
      reply(response, 401, { error: "unauthorized" });
      return;
    }
    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      reply(response, 429, { error: "service-busy" });
      return;
    }
    if (request.method !== "GET" || typeof request.url !== "string" || request.url.length > MAX_URL_LENGTH) {
      reply(response, 404, { error: "not-found" });
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/health" && onlyQueryKeys(url, [])) {
      reply(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/snapshot") {
      if (!onlyQueryKeys(url, ["directory", "sessionId"])) {
        reply(response, 400, { error: "invalid-request" });
        return;
      }
      const directoryValue = url.searchParams.get("directory");
      const directory = directoryValue === null || directoryValue === "" ? null : directoryValue;
      if (directory !== null && !validateProjectDirectory(directory)) {
        reply(response, 400, { error: "invalid-request" });
        return;
      }
      const sessionValue = url.searchParams.get("sessionId");
      const sessionId = sessionValue === null || sessionValue === "" ? null : sessionValue;
      if (sessionId !== null && !validateSessionId(sessionId)) {
        reply(response, 400, { error: "invalid-request" });
        return;
      }
      activeRequests += 1;
      buildSnapshot({
        sessionId,
        directory,
        paths: config2.paths,
        logStatus: logTail?.status() ?? emptyLogStatus(config2.state === "invalid" ? "error" : "unknown", new Date().toISOString()),
        configurationValid: config2.state !== "invalid"
      }).then((snapshot) => reply(response, 200, snapshot)).catch(() => {
        reply(response, 500, { error: "diagnostics-unavailable" });
      }).finally(() => {
        activeRequests -= 1;
      });
      return;
    }
    if (url.pathname === "/events") {
      if (!onlyQueryKeys(url, ["cursor"])) {
        reply(response, 400, { error: "invalid-request" });
        return;
      }
      const cursorValue = url.searchParams.get("cursor");
      if (cursorValue !== null && !/^[A-Za-z0-9_-]{24}$/.test(cursorValue)) {
        reply(response, 400, { error: "invalid-request" });
        return;
      }
      if (!logTail) {
        reply(response, 200, invalidConfigEventPage(new Date().toISOString()));
        return;
      }
      activeRequests += 1;
      logTail.poll(cursorValue).then((page) => {
        const body = {
          schemaVersion: 1,
          observedAt: page.observedAt,
          source: logTail.status(),
          cursor: page.cursor,
          events: page.events,
          gaps: page.gaps,
          retainedEvents: page.retainedEvents
        };
        reply(response, 200, body);
      }).catch(() => {
        const observedAt = new Date().toISOString();
        const gaps = ["source-unavailable"];
        reply(response, 200, {
          schemaVersion: 1,
          observedAt,
          source: emptyLogStatus("error", observedAt),
          cursor: cursorValue,
          events: [],
          gaps,
          retainedEvents: 0
        });
      }).finally(() => {
        activeRequests -= 1;
      });
      return;
    }
    reply(response, 404, { error: "not-found" });
  });
};

// service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
var start = async () => {
  const config2 = await resolveServiceConfig();
  const server = createExtensionService({ port, token, config: config2 });
  server.listen(port, "127.0.0.1");
  return server;
};
start().catch(() => {
  process.exitCode = 1;
});
