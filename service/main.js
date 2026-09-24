import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// service/main.ts
import http from "node:http";

// service/diagnostics.ts
import fs from "node:fs/promises";
import { stat } from "node:fs";
import os from "node:os";
import path from "node:path";

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
// service/diagnostics.ts
var MAX_LOG_BYTES = 256 * 1024;
var MAX_LOG_LINES = 100;
var MAX_CACHE_ROWS = 50;
var CONTEXT_DB = path.join(".local", "share", "cortexkit", "magic-context", "context.db");
var OPENCODE_DB = path.join(".local", "share", "opencode", "opencode.db");
var LOG_PATH = path.join("opencode", "magic-context", "magic-context.log");
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
var resolveDataPaths = (home = os.homedir(), temp = os.tmpdir()) => ({
  magicContext: path.join(home, CONTEXT_DB),
  openCode: path.join(home, OPENCODE_DB),
  log: path.join(temp, LOG_PATH)
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
    return;
  const tables = tableNames(database);
  if (!tables.has("session_meta"))
    return;
  const columns = tableColumns(database, "session_meta");
  if (!columns.has("session_id"))
    return;
  const selected = USAGE_COLUMNS.filter((column) => columns.has(column));
  if (!selected.length)
    return;
  const filters = [`${quoteIdentifier("session_id")} = ?`];
  const parameters = [sessionId];
  if (columns.has("harness")) {
    filters.push(`${quoteIdentifier("harness")} = ?`);
    parameters.push("opencode");
  }
  const fields = selected.map(quoteIdentifier).join(", ");
  const row = database.prepare(`SELECT ${fields} FROM ${quoteIdentifier("session_meta")} WHERE ${filters.join(" AND ")} LIMIT 1`).get(...parameters);
  if (!row)
    return;
  const usagePercent = finiteNumber(row.last_context_percentage) ?? finiteNumber(row.last_usage_percentage);
  return {
    inputTokens: finiteNumber(row.last_input_tokens),
    contextLimit: finiteNumber(row.last_usage_context_limit),
    usagePercent: usagePercent === null ? null : Math.max(0, Math.min(100, usagePercent))
  };
};
var contextDatabase = async (filePath, sessionId, messageIds, sqlite) => {
  if (!sqlite)
    return { diagnostics: { state: "unsupported" }, causes: new Map };
  const pathState = await fileState(filePath);
  if (pathState !== "ready")
    return { diagnostics: { state: pathState }, causes: new Map };
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
    const result = { state: anyTable ? "ready" : "partial", counts };
    if (context)
      result.context = context;
    return { diagnostics: result, causes };
  } catch {
    return { diagnostics: { state: "error" }, causes: new Map };
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
  for (const row of rows) {
    if (stringValue(row.role) !== "assistant")
      continue;
    const inputTokens = finiteNumber(row.input_tokens);
    const cacheRead = finiteNumber(row.cache_read);
    const cacheWrite = finiteNumber(row.cache_write);
    const totalTokens = finiteNumber(row.total_tokens) ?? [inputTokens, cacheRead, cacheWrite].reduce((sum, value) => sum + (value ?? 0), 0);
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
  return { state: "ready", lastInputTokens: events[0]?.event.inputTokens ?? null, events };
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
var logCategory = (message) => {
  const lower = message.toLowerCase();
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
var parseMagicContextLogLine = (line) => {
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
    const match = message.match(new RegExp(`(?:${name})\\s*[=: ]\\s*(\\d+)`, "i"));
    return match ? Number(match[1]) : null;
  };
  const level = fleet?.[2]?.toLowerCase();
  const normalizedLevel = level === "trace" || level === "debug" || level === "warn" || level === "error" ? level : "info";
  return {
    at: parsedTime(time2),
    level: normalizedLevel,
    category,
    inputTokens: numberIn("tokens(?:\\.input| input)"),
    cacheRead: numberIn("cache(?:\\.read| read)"),
    cacheWrite: numberIn("cache(?:\\.write| write)")
  };
};
var readLog = async (filePath) => {
  const observedAt = new Date().toISOString();
  const pathState = await fileState(filePath);
  if (pathState !== "ready")
    return { state: pathState, observedAt, events: [] };
  let handle = null;
  try {
    handle = await fs.open(filePath, "r");
    const info = await handle.stat();
    const byteLength = Math.min(info.size, MAX_LOG_BYTES);
    const buffer = Buffer.alloc(byteLength);
    if (byteLength)
      await handle.read(buffer, 0, byteLength, info.size - byteLength);
    const lines = buffer.toString("utf8").split(/\r?\n/).slice(-MAX_LOG_LINES);
    const events = lines.flatMap((line) => {
      const event = parseMagicContextLogLine(line);
      return event ? [event] : [];
    });
    return { state: "ready", observedAt, events };
  } catch {
    return { state: "error", observedAt, events: [] };
  } finally {
    await handle?.close();
  }
};
var readDiagnostics = async ({
  sessionId,
  includeDatabase,
  paths = resolveDataPaths()
}) => {
  const log = await readLog(paths.log);
  const response = { schemaVersion: 1, observedAt: new Date().toISOString(), log };
  if (includeDatabase) {
    const sqlite = await loadSqlite();
    const openCode = await openCodeDatabase(paths.openCode, sessionId, sqlite);
    const messageIds = openCode.events.flatMap(({ messageId }) => messageId ? [messageId] : []);
    const context = await contextDatabase(paths.magicContext, sessionId, messageIds, sqlite);
    response.database = {
      observedAt: response.observedAt,
      magicContext: context.diagnostics,
      openCode: {
        state: openCode.state,
        lastInputTokens: openCode.lastInputTokens,
        cacheEvents: openCode.events.map(({ messageId, event }) => ({
          ...event,
          cause: messageId ? context.causes.get(messageId) ?? null : null
        }))
      }
    };
  }
  return response;
};

// service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
var reply = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};
if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
  throw new Error("OpenChamber service port and token are required");
}
var server = http.createServer((request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) {
    reply(response, 401, { error: "unauthorized" });
    return;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/health") {
    reply(response, 200, { ok: true });
    return;
  }
  if (request.method !== "GET" || url.pathname !== "/diagnostics") {
    reply(response, 404, { error: "not-found" });
    return;
  }
  const requestedSession = url.searchParams.get("sessionId");
  if (requestedSession !== null && (requestedSession.length > 128 || requestedSession.includes("\x00"))) {
    reply(response, 400, { error: "invalid-session" });
    return;
  }
  readDiagnostics({
    sessionId: requestedSession,
    includeDatabase: url.searchParams.get("includeDatabase") === "1"
  }).then((snapshot) => reply(response, 200, snapshot)).catch(() => {
    reply(response, 500, { error: "diagnostics-unavailable" });
  });
});
server.listen(port, "127.0.0.1");
