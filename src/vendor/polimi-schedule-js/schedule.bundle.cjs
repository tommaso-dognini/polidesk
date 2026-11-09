// Bundle of polimi-schedule-js (MIT, bebora) + luxon (MIT) + immutable-ics (ISC) + uuid (MIT). Built by: npm run build:vendor
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/immutable/dist/immutable.js
var require_immutable = __commonJS({
  "node_modules/immutable/dist/immutable.js"(exports2, module2) {
    (function(global2, factory) {
      typeof exports2 === "object" && typeof module2 !== "undefined" ? factory(exports2) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global2 = typeof globalThis !== "undefined" ? globalThis : global2 || self, factory(global2.Immutable = {}));
    })(exports2, (function(exports3) {
      "use strict";
      var IS_INDEXED_SYMBOL = "@@__IMMUTABLE_INDEXED__@@";
      function isIndexed(maybeIndexed) {
        return Boolean(maybeIndexed && // @ts-expect-error: maybeIndexed is typed as `{}`, need to change in 6.0 to `maybeIndexed && typeof maybeIndexed === 'object' && IS_INDEXED_SYMBOL in maybeIndexed`
        maybeIndexed[IS_INDEXED_SYMBOL]);
      }
      var IS_KEYED_SYMBOL = "@@__IMMUTABLE_KEYED__@@";
      function isKeyed(maybeKeyed) {
        return Boolean(maybeKeyed && // @ts-expect-error: maybeKeyed is typed as `{}`, need to change in 6.0 to `maybeKeyed && typeof maybeKeyed === 'object' && IS_KEYED_SYMBOL in maybeKeyed`
        maybeKeyed[IS_KEYED_SYMBOL]);
      }
      function isAssociative(maybeAssociative) {
        return isKeyed(maybeAssociative) || isIndexed(maybeAssociative);
      }
      var IS_COLLECTION_SYMBOL = "@@__IMMUTABLE_ITERABLE__@@";
      function isCollection(maybeCollection) {
        return Boolean(maybeCollection && // @ts-expect-error: maybeCollection is typed as `{}`, need to change in 6.0 to `maybeCollection && typeof maybeCollection === 'object' && IS_COLLECTION_SYMBOL in maybeCollection`
        maybeCollection[IS_COLLECTION_SYMBOL]);
      }
      var Collection = function Collection2(value2) {
        return isCollection(value2) ? value2 : Seq(value2);
      };
      var KeyedCollection = /* @__PURE__ */ (function(Collection2) {
        function KeyedCollection2(value2) {
          return isKeyed(value2) ? value2 : KeyedSeq(value2);
        }
        if (Collection2) KeyedCollection2.__proto__ = Collection2;
        KeyedCollection2.prototype = Object.create(Collection2 && Collection2.prototype);
        KeyedCollection2.prototype.constructor = KeyedCollection2;
        return KeyedCollection2;
      })(Collection);
      var IndexedCollection = /* @__PURE__ */ (function(Collection2) {
        function IndexedCollection2(value2) {
          return isIndexed(value2) ? value2 : IndexedSeq(value2);
        }
        if (Collection2) IndexedCollection2.__proto__ = Collection2;
        IndexedCollection2.prototype = Object.create(Collection2 && Collection2.prototype);
        IndexedCollection2.prototype.constructor = IndexedCollection2;
        return IndexedCollection2;
      })(Collection);
      var SetCollection = /* @__PURE__ */ (function(Collection2) {
        function SetCollection2(value2) {
          return isCollection(value2) && !isAssociative(value2) ? value2 : SetSeq(value2);
        }
        if (Collection2) SetCollection2.__proto__ = Collection2;
        SetCollection2.prototype = Object.create(Collection2 && Collection2.prototype);
        SetCollection2.prototype.constructor = SetCollection2;
        return SetCollection2;
      })(Collection);
      Collection.Keyed = KeyedCollection;
      Collection.Indexed = IndexedCollection;
      Collection.Set = SetCollection;
      var ITERATE_KEYS = 0;
      var ITERATE_VALUES = 1;
      var ITERATE_ENTRIES = 2;
      var REAL_ITERATOR_SYMBOL = typeof Symbol === "function" && Symbol.iterator;
      var FAUX_ITERATOR_SYMBOL = "@@iterator";
      var ITERATOR_SYMBOL = REAL_ITERATOR_SYMBOL || FAUX_ITERATOR_SYMBOL;
      var Iterator = function Iterator2(next) {
        this.next = next;
      };
      Iterator.prototype.toString = function toString2() {
        return "[Iterator]";
      };
      Iterator.KEYS = ITERATE_KEYS;
      Iterator.VALUES = ITERATE_VALUES;
      Iterator.ENTRIES = ITERATE_ENTRIES;
      Iterator.prototype.inspect = Iterator.prototype.toSource = function() {
        return this.toString();
      };
      Iterator.prototype[ITERATOR_SYMBOL] = function() {
        return this;
      };
      function iteratorValue(type, k, v, iteratorResult) {
        var value2 = type === ITERATE_KEYS ? k : type === ITERATE_VALUES ? v : [k, v];
        iteratorResult ? iteratorResult.value = value2 : iteratorResult = {
          // @ts-expect-error ensure value is not undefined
          value: value2,
          done: false
        };
        return iteratorResult;
      }
      function iteratorDone() {
        return { value: void 0, done: true };
      }
      function hasIterator(maybeIterable) {
        if (Array.isArray(maybeIterable)) {
          return true;
        }
        return !!getIteratorFn(maybeIterable);
      }
      function isIterator(maybeIterator) {
        return !!(maybeIterator && // @ts-expect-error: maybeIterator is typed as `{}`
        typeof maybeIterator.next === "function");
      }
      function getIterator(iterable) {
        var iteratorFn = getIteratorFn(iterable);
        return iteratorFn && iteratorFn.call(iterable);
      }
      function getIteratorFn(iterable) {
        var iteratorFn = iterable && // @ts-expect-error: maybeIterator is typed as `{}`
        (REAL_ITERATOR_SYMBOL && iterable[REAL_ITERATOR_SYMBOL] || // @ts-expect-error: maybeIterator is typed as `{}`
        iterable[FAUX_ITERATOR_SYMBOL]);
        if (typeof iteratorFn === "function") {
          return iteratorFn;
        }
      }
      function isEntriesIterable(maybeIterable) {
        var iteratorFn = getIteratorFn(maybeIterable);
        return iteratorFn && iteratorFn === maybeIterable.entries;
      }
      function isKeysIterable(maybeIterable) {
        var iteratorFn = getIteratorFn(maybeIterable);
        return iteratorFn && iteratorFn === maybeIterable.keys;
      }
      var DELETE = "delete";
      var SHIFT = 5;
      var SIZE = 1 << SHIFT;
      var MASK = SIZE - 1;
      var NOT_SET = {};
      function MakeRef() {
        return { value: false };
      }
      function SetRef(ref) {
        if (ref) {
          ref.value = true;
        }
      }
      function OwnerID() {
      }
      function ensureSize(iter) {
        if (iter.size === void 0) {
          iter.size = iter.__iterate(returnTrue);
        }
        return iter.size;
      }
      function wrapIndex(iter, index) {
        if (typeof index !== "number") {
          var uint32Index = index >>> 0;
          if ("" + uint32Index !== index || uint32Index === 4294967295) {
            return NaN;
          }
          index = uint32Index;
        }
        return index < 0 ? ensureSize(iter) + index : index;
      }
      function returnTrue() {
        return true;
      }
      function wholeSlice(begin, end, size) {
        return (begin === 0 && !isNeg(begin) || size !== void 0 && begin <= -size) && (end === void 0 || size !== void 0 && end >= size);
      }
      function resolveBegin(begin, size) {
        return resolveIndex(begin, size, 0);
      }
      function resolveEnd(end, size) {
        return resolveIndex(end, size, size);
      }
      function resolveIndex(index, size, defaultIndex) {
        return index === void 0 ? defaultIndex : isNeg(index) ? size === Infinity ? size : Math.max(0, size + index) | 0 : size === void 0 || size === index ? index : Math.min(size, index) | 0;
      }
      function isNeg(value2) {
        return value2 < 0 || value2 === 0 && 1 / value2 === -Infinity;
      }
      var IS_RECORD_SYMBOL = "@@__IMMUTABLE_RECORD__@@";
      function isRecord(maybeRecord) {
        return Boolean(maybeRecord && // @ts-expect-error: maybeRecord is typed as `{}`, need to change in 6.0 to `maybeRecord && typeof maybeRecord === 'object' && IS_RECORD_SYMBOL in maybeRecord`
        maybeRecord[IS_RECORD_SYMBOL]);
      }
      function isImmutable(maybeImmutable) {
        return isCollection(maybeImmutable) || isRecord(maybeImmutable);
      }
      var IS_ORDERED_SYMBOL = "@@__IMMUTABLE_ORDERED__@@";
      function isOrdered(maybeOrdered) {
        return Boolean(maybeOrdered && // @ts-expect-error: maybeOrdered is typed as `{}`, need to change in 6.0 to `maybeOrdered && typeof maybeOrdered === 'object' && IS_ORDERED_SYMBOL in maybeOrdered`
        maybeOrdered[IS_ORDERED_SYMBOL]);
      }
      var IS_SEQ_SYMBOL = "@@__IMMUTABLE_SEQ__@@";
      function isSeq(maybeSeq) {
        return Boolean(maybeSeq && // @ts-expect-error: maybeSeq is typed as `{}`, need to change in 6.0 to `maybeSeq && typeof maybeSeq === 'object' && MAYBE_SEQ_SYMBOL in maybeSeq`
        maybeSeq[IS_SEQ_SYMBOL]);
      }
      var hasOwnProperty2 = Object.prototype.hasOwnProperty;
      function isArrayLike(value2) {
        if (Array.isArray(value2) || typeof value2 === "string") {
          return true;
        }
        return value2 && typeof value2 === "object" && // @ts-expect-error check that `'length' in value &&`
        Number.isInteger(value2.length) && // @ts-expect-error check that `'length' in value &&`
        value2.length >= 0 && // @ts-expect-error check that `'length' in value &&`
        (value2.length === 0 ? (
          // Only {length: 0} is considered Array-like.
          Object.keys(value2).length === 1
        ) : (
          // An object is only Array-like if it has a property where the last value
          // in the array-like may be found (which could be undefined).
          // @ts-expect-error check that `'length' in value &&`
          value2.hasOwnProperty(value2.length - 1)
        ));
      }
      var Seq = /* @__PURE__ */ (function(Collection2) {
        function Seq2(value2) {
          return value2 === void 0 || value2 === null ? emptySequence() : isImmutable(value2) ? value2.toSeq() : seqFromValue(value2);
        }
        if (Collection2) Seq2.__proto__ = Collection2;
        Seq2.prototype = Object.create(Collection2 && Collection2.prototype);
        Seq2.prototype.constructor = Seq2;
        Seq2.prototype.toSeq = function toSeq() {
          return this;
        };
        Seq2.prototype.toString = function toString2() {
          return this.__toString("Seq {", "}");
        };
        Seq2.prototype.cacheResult = function cacheResult() {
          if (!this._cache && this.__iterateUncached) {
            this._cache = this.entrySeq().toArray();
            this.size = this._cache.length;
          }
          return this;
        };
        Seq2.prototype.__iterate = function __iterate(fn, reverse) {
          var cache = this._cache;
          if (cache) {
            var size = cache.length;
            var i = 0;
            while (i !== size) {
              var entry = cache[reverse ? size - ++i : i++];
              if (fn(entry[1], entry[0], this) === false) {
                break;
              }
            }
            return i;
          }
          return this.__iterateUncached(fn, reverse);
        };
        Seq2.prototype.__iterator = function __iterator(type, reverse) {
          var cache = this._cache;
          if (cache) {
            var size = cache.length;
            var i = 0;
            return new Iterator(function() {
              if (i === size) {
                return iteratorDone();
              }
              var entry = cache[reverse ? size - ++i : i++];
              return iteratorValue(type, entry[0], entry[1]);
            });
          }
          return this.__iteratorUncached(type, reverse);
        };
        return Seq2;
      })(Collection);
      var KeyedSeq = /* @__PURE__ */ (function(Seq2) {
        function KeyedSeq2(value2) {
          return value2 === void 0 || value2 === null ? emptySequence().toKeyedSeq() : isCollection(value2) ? isKeyed(value2) ? value2.toSeq() : value2.fromEntrySeq() : isRecord(value2) ? value2.toSeq() : keyedSeqFromValue(value2);
        }
        if (Seq2) KeyedSeq2.__proto__ = Seq2;
        KeyedSeq2.prototype = Object.create(Seq2 && Seq2.prototype);
        KeyedSeq2.prototype.constructor = KeyedSeq2;
        KeyedSeq2.prototype.toKeyedSeq = function toKeyedSeq() {
          return this;
        };
        return KeyedSeq2;
      })(Seq);
      var IndexedSeq = /* @__PURE__ */ (function(Seq2) {
        function IndexedSeq2(value2) {
          return value2 === void 0 || value2 === null ? emptySequence() : isCollection(value2) ? isKeyed(value2) ? value2.entrySeq() : value2.toIndexedSeq() : isRecord(value2) ? value2.toSeq().entrySeq() : indexedSeqFromValue(value2);
        }
        if (Seq2) IndexedSeq2.__proto__ = Seq2;
        IndexedSeq2.prototype = Object.create(Seq2 && Seq2.prototype);
        IndexedSeq2.prototype.constructor = IndexedSeq2;
        IndexedSeq2.of = function of() {
          return IndexedSeq2(arguments);
        };
        IndexedSeq2.prototype.toIndexedSeq = function toIndexedSeq() {
          return this;
        };
        IndexedSeq2.prototype.toString = function toString2() {
          return this.__toString("Seq [", "]");
        };
        return IndexedSeq2;
      })(Seq);
      var SetSeq = /* @__PURE__ */ (function(Seq2) {
        function SetSeq2(value2) {
          return (isCollection(value2) && !isAssociative(value2) ? value2 : IndexedSeq(value2)).toSetSeq();
        }
        if (Seq2) SetSeq2.__proto__ = Seq2;
        SetSeq2.prototype = Object.create(Seq2 && Seq2.prototype);
        SetSeq2.prototype.constructor = SetSeq2;
        SetSeq2.of = function of() {
          return SetSeq2(arguments);
        };
        SetSeq2.prototype.toSetSeq = function toSetSeq() {
          return this;
        };
        return SetSeq2;
      })(Seq);
      Seq.isSeq = isSeq;
      Seq.Keyed = KeyedSeq;
      Seq.Set = SetSeq;
      Seq.Indexed = IndexedSeq;
      Seq.prototype[IS_SEQ_SYMBOL] = true;
      var ArraySeq = /* @__PURE__ */ (function(IndexedSeq2) {
        function ArraySeq2(array) {
          this._array = array;
          this.size = array.length;
        }
        if (IndexedSeq2) ArraySeq2.__proto__ = IndexedSeq2;
        ArraySeq2.prototype = Object.create(IndexedSeq2 && IndexedSeq2.prototype);
        ArraySeq2.prototype.constructor = ArraySeq2;
        ArraySeq2.prototype.get = function get2(index, notSetValue) {
          return this.has(index) ? this._array[wrapIndex(this, index)] : notSetValue;
        };
        ArraySeq2.prototype.__iterate = function __iterate(fn, reverse) {
          var array = this._array;
          var size = array.length;
          var i = 0;
          while (i !== size) {
            var ii = reverse ? size - ++i : i++;
            if (fn(array[ii], ii, this) === false) {
              break;
            }
          }
          return i;
        };
        ArraySeq2.prototype.__iterator = function __iterator(type, reverse) {
          var array = this._array;
          var size = array.length;
          var i = 0;
          return new Iterator(function() {
            if (i === size) {
              return iteratorDone();
            }
            var ii = reverse ? size - ++i : i++;
            return iteratorValue(type, ii, array[ii]);
          });
        };
        return ArraySeq2;
      })(IndexedSeq);
      var ObjectSeq = /* @__PURE__ */ (function(KeyedSeq2) {
        function ObjectSeq2(object) {
          var keys = Object.keys(object).concat(
            Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(object) : []
          );
          this._object = object;
          this._keys = keys;
          this.size = keys.length;
        }
        if (KeyedSeq2) ObjectSeq2.__proto__ = KeyedSeq2;
        ObjectSeq2.prototype = Object.create(KeyedSeq2 && KeyedSeq2.prototype);
        ObjectSeq2.prototype.constructor = ObjectSeq2;
        ObjectSeq2.prototype.get = function get2(key2, notSetValue) {
          if (notSetValue !== void 0 && !this.has(key2)) {
            return notSetValue;
          }
          return this._object[key2];
        };
        ObjectSeq2.prototype.has = function has2(key2) {
          return hasOwnProperty2.call(this._object, key2);
        };
        ObjectSeq2.prototype.__iterate = function __iterate(fn, reverse) {
          var object = this._object;
          var keys = this._keys;
          var size = keys.length;
          var i = 0;
          while (i !== size) {
            var key2 = keys[reverse ? size - ++i : i++];
            if (fn(object[key2], key2, this) === false) {
              break;
            }
          }
          return i;
        };
        ObjectSeq2.prototype.__iterator = function __iterator(type, reverse) {
          var object = this._object;
          var keys = this._keys;
          var size = keys.length;
          var i = 0;
          return new Iterator(function() {
            if (i === size) {
              return iteratorDone();
            }
            var key2 = keys[reverse ? size - ++i : i++];
            return iteratorValue(type, key2, object[key2]);
          });
        };
        return ObjectSeq2;
      })(KeyedSeq);
      ObjectSeq.prototype[IS_ORDERED_SYMBOL] = true;
      var CollectionSeq = /* @__PURE__ */ (function(IndexedSeq2) {
        function CollectionSeq2(collection) {
          this._collection = collection;
          this.size = collection.length || collection.size;
        }
        if (IndexedSeq2) CollectionSeq2.__proto__ = IndexedSeq2;
        CollectionSeq2.prototype = Object.create(IndexedSeq2 && IndexedSeq2.prototype);
        CollectionSeq2.prototype.constructor = CollectionSeq2;
        CollectionSeq2.prototype.__iterateUncached = function __iterateUncached(fn, reverse) {
          if (reverse) {
            return this.cacheResult().__iterate(fn, reverse);
          }
          var collection = this._collection;
          var iterator = getIterator(collection);
          var iterations = 0;
          if (isIterator(iterator)) {
            var step;
            while (!(step = iterator.next()).done) {
              if (fn(step.value, iterations++, this) === false) {
                break;
              }
            }
          }
          return iterations;
        };
        CollectionSeq2.prototype.__iteratorUncached = function __iteratorUncached(type, reverse) {
          if (reverse) {
            return this.cacheResult().__iterator(type, reverse);
          }
          var collection = this._collection;
          var iterator = getIterator(collection);
          if (!isIterator(iterator)) {
            return new Iterator(iteratorDone);
          }
          var iterations = 0;
          return new Iterator(function() {
            var step = iterator.next();
            return step.done ? step : iteratorValue(type, iterations++, step.value);
          });
        };
        return CollectionSeq2;
      })(IndexedSeq);
      var EMPTY_SEQ;
      function emptySequence() {
        return EMPTY_SEQ || (EMPTY_SEQ = new ArraySeq([]));
      }
      function keyedSeqFromValue(value2) {
        var seq = maybeIndexedSeqFromValue(value2);
        if (seq) {
          return seq.fromEntrySeq();
        }
        if (typeof value2 === "object") {
          return new ObjectSeq(value2);
        }
        throw new TypeError(
          "Expected Array or collection object of [k, v] entries, or keyed object: " + value2
        );
      }
      function indexedSeqFromValue(value2) {
        var seq = maybeIndexedSeqFromValue(value2);
        if (seq) {
          return seq;
        }
        throw new TypeError(
          "Expected Array or collection object of values: " + value2
        );
      }
      function seqFromValue(value2) {
        var seq = maybeIndexedSeqFromValue(value2);
        if (seq) {
          return isEntriesIterable(value2) ? seq.fromEntrySeq() : isKeysIterable(value2) ? seq.toSetSeq() : seq;
        }
        if (typeof value2 === "object") {
          return new ObjectSeq(value2);
        }
        throw new TypeError(
          "Expected Array or collection object of values, or keyed object: " + value2
        );
      }
      function maybeIndexedSeqFromValue(value2) {
        return isArrayLike(value2) ? new ArraySeq(value2) : hasIterator(value2) ? new CollectionSeq(value2) : void 0;
      }
      function asImmutable() {
        return this.__ensureOwner();
      }
      function asMutable() {
        return this.__ownerID ? this : this.__ensureOwner(new OwnerID());
      }
      var imul = typeof Math.imul === "function" && Math.imul(4294967295, 2) === -2 ? Math.imul : function imul2(a, b) {
        a |= 0;
        b |= 0;
        var c = a & 65535;
        var d = b & 65535;
        return c * d + ((a >>> 16) * d + c * (b >>> 16) << 16 >>> 0) | 0;
      };
      function smi(i32) {
        return i32 >>> 1 & 1073741824 | i32 & 3221225471;
      }
      var defaultValueOf = Object.prototype.valueOf;
      function hash(o) {
        if (o == null) {
          return hashNullish(o);
        }
        if (typeof o.hashCode === "function") {
          return smi(o.hashCode(o));
        }
        var v = valueOf(o);
        if (v == null) {
          return hashNullish(v);
        }
        switch (typeof v) {
          case "boolean":
            return v ? 1108378657 : 1108378656;
          case "number":
            return hashNumber(v);
          case "string":
            return v.length > STRING_HASH_CACHE_MIN_STRLEN ? cachedHashString(v) : hashString(v);
          case "object":
          case "function":
            return hashJSObj(v);
          case "symbol":
            return hashSymbol(v);
          default:
            if (typeof v.toString === "function") {
              return hashString(v.toString());
            }
            throw new Error("Value type " + typeof v + " cannot be hashed.");
        }
      }
      function hashNullish(nullish) {
        return nullish === null ? 1108378658 : (
          /* undefined */
          1108378659
        );
      }
      function hashNumber(n2) {
        if (n2 !== n2 || n2 === Infinity) {
          return 0;
        }
        var hash2 = n2 | 0;
        if (hash2 !== n2) {
          hash2 ^= n2 * 4294967295;
        }
        while (n2 > 4294967295) {
          n2 /= 4294967295;
          hash2 ^= n2;
        }
        return smi(hash2);
      }
      function cachedHashString(string) {
        var hashed = stringHashCache[string];
        if (hashed === void 0) {
          hashed = hashString(string);
          if (STRING_HASH_CACHE_SIZE === STRING_HASH_CACHE_MAX_SIZE) {
            STRING_HASH_CACHE_SIZE = 0;
            stringHashCache = {};
          }
          STRING_HASH_CACHE_SIZE++;
          stringHashCache[string] = hashed;
        }
        return hashed;
      }
      function hashString(string) {
        var hashed = 0;
        for (var ii = 0; ii < string.length; ii++) {
          hashed = 31 * hashed + string.charCodeAt(ii) | 0;
        }
        return smi(hashed);
      }
      var COLLISION_HASH_BASE = (Math.random() * 1048576 | 1) % 1048576 || 40503;
      function hashCollisionKey(key2) {
        if (typeof key2 !== "string") {
          return hash(key2);
        }
        var hashed = 0;
        for (var ii = 0; ii < key2.length; ii++) {
          hashed = COLLISION_HASH_BASE * hashed + key2.charCodeAt(ii) | 0;
        }
        return hashed;
      }
      function hashSymbol(sym) {
        var hashed = symbolMap[sym];
        if (hashed !== void 0) {
          return hashed;
        }
        hashed = nextHash();
        symbolMap[sym] = hashed;
        return hashed;
      }
      function hashJSObj(obj) {
        var hashed;
        if (usingWeakMap) {
          hashed = weakMap.get(obj);
          if (hashed !== void 0) {
            return hashed;
          }
        }
        hashed = obj[UID_HASH_KEY];
        if (hashed !== void 0) {
          return hashed;
        }
        if (!canDefineProperty) {
          hashed = obj.propertyIsEnumerable && obj.propertyIsEnumerable[UID_HASH_KEY];
          if (hashed !== void 0) {
            return hashed;
          }
          hashed = getIENodeHash(obj);
          if (hashed !== void 0) {
            return hashed;
          }
        }
        hashed = nextHash();
        if (usingWeakMap) {
          weakMap.set(obj, hashed);
        } else if (isExtensible !== void 0 && isExtensible(obj) === false) {
          throw new Error("Non-extensible objects are not allowed as keys.");
        } else if (canDefineProperty) {
          Object.defineProperty(obj, UID_HASH_KEY, {
            enumerable: false,
            configurable: false,
            writable: false,
            value: hashed
          });
        } else if (obj.propertyIsEnumerable !== void 0 && obj.propertyIsEnumerable === obj.constructor.prototype.propertyIsEnumerable) {
          obj.propertyIsEnumerable = function() {
            return this.constructor.prototype.propertyIsEnumerable.apply(
              this,
              // eslint-disable-next-line prefer-rest-params
              arguments
            );
          };
          obj.propertyIsEnumerable[UID_HASH_KEY] = hashed;
        } else if (obj.nodeType !== void 0) {
          obj[UID_HASH_KEY] = hashed;
        } else {
          throw new Error("Unable to set a non-enumerable property on object.");
        }
        return hashed;
      }
      var isExtensible = Object.isExtensible;
      var canDefineProperty = (function() {
        try {
          Object.defineProperty({}, "@", {});
          return true;
        } catch (e) {
          return false;
        }
      })();
      function getIENodeHash(node) {
        if (node && node.nodeType > 0) {
          switch (node.nodeType) {
            case 1:
              return node.uniqueID;
            case 9:
              return node.documentElement && node.documentElement.uniqueID;
          }
        }
      }
      function valueOf(obj) {
        return obj.valueOf !== defaultValueOf && typeof obj.valueOf === "function" ? (
          // @ts-expect-error weird the "obj" parameter as `valueOf` should not have a parameter
          obj.valueOf(obj)
        ) : obj;
      }
      function nextHash() {
        var nextHash2 = ++_objHashUID;
        if (_objHashUID & 1073741824) {
          _objHashUID = 0;
        }
        return nextHash2;
      }
      var usingWeakMap = typeof WeakMap === "function";
      var weakMap;
      if (usingWeakMap) {
        weakMap = /* @__PURE__ */ new WeakMap();
      }
      var symbolMap = /* @__PURE__ */ Object.create(null);
      var _objHashUID = 0;
      var UID_HASH_KEY = "__immutablehash__";
      if (typeof Symbol === "function") {
        UID_HASH_KEY = Symbol(UID_HASH_KEY);
      }
      var STRING_HASH_CACHE_MIN_STRLEN = 16;
      var STRING_HASH_CACHE_MAX_SIZE = 255;
      var STRING_HASH_CACHE_SIZE = 0;
      var stringHashCache = {};
      var ToKeyedSequence = /* @__PURE__ */ (function(KeyedSeq2) {
        function ToKeyedSequence2(indexed, useKeys) {
          this._iter = indexed;
          this._useKeys = useKeys;
          this.size = indexed.size;
        }
        if (KeyedSeq2) ToKeyedSequence2.__proto__ = KeyedSeq2;
        ToKeyedSequence2.prototype = Object.create(KeyedSeq2 && KeyedSeq2.prototype);
        ToKeyedSequence2.prototype.constructor = ToKeyedSequence2;
        ToKeyedSequence2.prototype.get = function get2(key2, notSetValue) {
          return this._iter.get(key2, notSetValue);
        };
        ToKeyedSequence2.prototype.has = function has2(key2) {
          return this._iter.has(key2);
        };
        ToKeyedSequence2.prototype.valueSeq = function valueSeq() {
          return this._iter.valueSeq();
        };
        ToKeyedSequence2.prototype.reverse = function reverse() {
          var this$1$1 = this;
          var reversedSequence = reverseFactory(this, true);
          if (!this._useKeys) {
            reversedSequence.valueSeq = function() {
              return this$1$1._iter.toSeq().reverse();
            };
          }
          return reversedSequence;
        };
        ToKeyedSequence2.prototype.map = function map(mapper, context) {
          var this$1$1 = this;
          var mappedSequence = mapFactory(this, mapper, context);
          if (!this._useKeys) {
            mappedSequence.valueSeq = function() {
              return this$1$1._iter.toSeq().map(mapper, context);
            };
          }
          return mappedSequence;
        };
        ToKeyedSequence2.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          return this._iter.__iterate(function(v, k) {
            return fn(v, k, this$1$1);
          }, reverse);
        };
        ToKeyedSequence2.prototype.__iterator = function __iterator(type, reverse) {
          return this._iter.__iterator(type, reverse);
        };
        return ToKeyedSequence2;
      })(KeyedSeq);
      ToKeyedSequence.prototype[IS_ORDERED_SYMBOL] = true;
      var ToIndexedSequence = /* @__PURE__ */ (function(IndexedSeq2) {
        function ToIndexedSequence2(iter) {
          this._iter = iter;
          this.size = iter.size;
        }
        if (IndexedSeq2) ToIndexedSequence2.__proto__ = IndexedSeq2;
        ToIndexedSequence2.prototype = Object.create(IndexedSeq2 && IndexedSeq2.prototype);
        ToIndexedSequence2.prototype.constructor = ToIndexedSequence2;
        ToIndexedSequence2.prototype.includes = function includes(value2) {
          return this._iter.includes(value2);
        };
        ToIndexedSequence2.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          var i = 0;
          reverse && ensureSize(this);
          return this._iter.__iterate(
            function(v) {
              return fn(v, reverse ? this$1$1.size - ++i : i++, this$1$1);
            },
            reverse
          );
        };
        ToIndexedSequence2.prototype.__iterator = function __iterator(type, reverse) {
          var this$1$1 = this;
          var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
          var i = 0;
          reverse && ensureSize(this);
          return new Iterator(function() {
            var step = iterator.next();
            return step.done ? step : iteratorValue(
              type,
              reverse ? this$1$1.size - ++i : i++,
              step.value,
              step
            );
          });
        };
        return ToIndexedSequence2;
      })(IndexedSeq);
      var ToSetSequence = /* @__PURE__ */ (function(SetSeq2) {
        function ToSetSequence2(iter) {
          this._iter = iter;
          this.size = iter.size;
        }
        if (SetSeq2) ToSetSequence2.__proto__ = SetSeq2;
        ToSetSequence2.prototype = Object.create(SetSeq2 && SetSeq2.prototype);
        ToSetSequence2.prototype.constructor = ToSetSequence2;
        ToSetSequence2.prototype.has = function has2(key2) {
          return this._iter.includes(key2);
        };
        ToSetSequence2.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          return this._iter.__iterate(function(v) {
            return fn(v, v, this$1$1);
          }, reverse);
        };
        ToSetSequence2.prototype.__iterator = function __iterator(type, reverse) {
          var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
          return new Iterator(function() {
            var step = iterator.next();
            return step.done ? step : iteratorValue(type, step.value, step.value, step);
          });
        };
        return ToSetSequence2;
      })(SetSeq);
      var FromEntriesSequence = /* @__PURE__ */ (function(KeyedSeq2) {
        function FromEntriesSequence2(entries) {
          this._iter = entries;
          this.size = entries.size;
        }
        if (KeyedSeq2) FromEntriesSequence2.__proto__ = KeyedSeq2;
        FromEntriesSequence2.prototype = Object.create(KeyedSeq2 && KeyedSeq2.prototype);
        FromEntriesSequence2.prototype.constructor = FromEntriesSequence2;
        FromEntriesSequence2.prototype.entrySeq = function entrySeq() {
          return this._iter.toSeq();
        };
        FromEntriesSequence2.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          return this._iter.__iterate(function(entry) {
            if (entry) {
              validateEntry(entry);
              var indexedCollection = isCollection(entry);
              return fn(
                indexedCollection ? entry.get(1) : entry[1],
                indexedCollection ? entry.get(0) : entry[0],
                this$1$1
              );
            }
          }, reverse);
        };
        FromEntriesSequence2.prototype.__iterator = function __iterator(type, reverse) {
          var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
          return new Iterator(function() {
            while (true) {
              var step = iterator.next();
              if (step.done) {
                return step;
              }
              var entry = step.value;
              if (entry) {
                validateEntry(entry);
                var indexedCollection = isCollection(entry);
                return iteratorValue(
                  type,
                  indexedCollection ? entry.get(0) : entry[0],
                  indexedCollection ? entry.get(1) : entry[1],
                  step
                );
              }
            }
          });
        };
        return FromEntriesSequence2;
      })(KeyedSeq);
      ToIndexedSequence.prototype.cacheResult = ToKeyedSequence.prototype.cacheResult = ToSetSequence.prototype.cacheResult = FromEntriesSequence.prototype.cacheResult = cacheResultThrough;
      function flipFactory(collection) {
        var flipSequence = makeSequence(collection);
        flipSequence._iter = collection;
        flipSequence.size = collection.size;
        flipSequence.flip = function() {
          return collection;
        };
        flipSequence.reverse = function() {
          var reversedSequence = collection.reverse.apply(this);
          reversedSequence.flip = function() {
            return collection.reverse();
          };
          return reversedSequence;
        };
        flipSequence.has = function(key2) {
          return collection.includes(key2);
        };
        flipSequence.includes = function(key2) {
          return collection.has(key2);
        };
        flipSequence.cacheResult = cacheResultThrough;
        flipSequence.__iterateUncached = function(fn, reverse) {
          var this$1$1 = this;
          return collection.__iterate(function(v, k) {
            return fn(k, v, this$1$1) !== false;
          }, reverse);
        };
        flipSequence.__iteratorUncached = function(type, reverse) {
          if (type === ITERATE_ENTRIES) {
            var iterator = collection.__iterator(type, reverse);
            return new Iterator(function() {
              var step = iterator.next();
              if (!step.done) {
                var k = step.value[0];
                step.value[0] = step.value[1];
                step.value[1] = k;
              }
              return step;
            });
          }
          return collection.__iterator(
            type === ITERATE_VALUES ? ITERATE_KEYS : ITERATE_VALUES,
            reverse
          );
        };
        return flipSequence;
      }
      function mapFactory(collection, mapper, context) {
        var mappedSequence = makeSequence(collection);
        mappedSequence.size = collection.size;
        mappedSequence.has = function(key2) {
          return collection.has(key2);
        };
        mappedSequence.get = function(key2, notSetValue) {
          var v = collection.get(key2, NOT_SET);
          return v === NOT_SET ? notSetValue : mapper.call(context, v, key2, collection);
        };
        mappedSequence.__iterateUncached = function(fn, reverse) {
          var this$1$1 = this;
          return collection.__iterate(
            function(v, k, c) {
              return fn(mapper.call(context, v, k, c), k, this$1$1) !== false;
            },
            reverse
          );
        };
        mappedSequence.__iteratorUncached = function(type, reverse) {
          var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
          return new Iterator(function() {
            var step = iterator.next();
            if (step.done) {
              return step;
            }
            var entry = step.value;
            var key2 = entry[0];
            return iteratorValue(
              type,
              key2,
              mapper.call(context, entry[1], key2, collection),
              step
            );
          });
        };
        return mappedSequence;
      }
      function reverseFactory(collection, useKeys) {
        var reversedSequence = makeSequence(collection);
        reversedSequence._iter = collection;
        reversedSequence.size = collection.size;
        reversedSequence.reverse = function() {
          return collection;
        };
        if (collection.flip) {
          reversedSequence.flip = function() {
            var flipSequence = flipFactory(collection);
            flipSequence.reverse = function() {
              return collection.flip();
            };
            return flipSequence;
          };
        }
        reversedSequence.get = function(key2, notSetValue) {
          return collection.get(useKeys ? key2 : -1 - key2, notSetValue);
        };
        reversedSequence.has = function(key2) {
          return collection.has(useKeys ? key2 : -1 - key2);
        };
        reversedSequence.includes = function(value2) {
          return collection.includes(value2);
        };
        reversedSequence.cacheResult = cacheResultThrough;
        reversedSequence.__iterate = function(fn, reverse) {
          var this$1$1 = this;
          var i = 0;
          reverse && ensureSize(collection);
          return collection.__iterate(
            function(v, k) {
              return fn(v, useKeys ? k : reverse ? this$1$1.size - ++i : i++, this$1$1);
            },
            !reverse
          );
        };
        reversedSequence.__iterator = function(type, reverse) {
          var i = 0;
          reverse && ensureSize(collection);
          var iterator = collection.__iterator(ITERATE_ENTRIES, !reverse);
          return new Iterator(function() {
            var step = iterator.next();
            if (step.done) {
              return step;
            }
            var entry = step.value;
            return iteratorValue(
              type,
              // `__iterator` is an arrow function, so `this` is not the reversed
              // sequence here — read `reversedSequence.size` explicitly.
              useKeys ? entry[0] : reverse ? reversedSequence.size - ++i : i++,
              entry[1],
              step
            );
          });
        };
        return reversedSequence;
      }
      function filterFactory(collection, predicate, context, useKeys) {
        var filterSequence = makeSequence(collection);
        if (useKeys) {
          filterSequence.has = function(key2) {
            var v = collection.get(key2, NOT_SET);
            return v !== NOT_SET && !!predicate.call(context, v, key2, collection);
          };
          filterSequence.get = function(key2, notSetValue) {
            var v = collection.get(key2, NOT_SET);
            return v !== NOT_SET && predicate.call(context, v, key2, collection) ? v : notSetValue;
          };
        }
        filterSequence.__iterateUncached = function(fn, reverse) {
          var this$1$1 = this;
          var iterations = 0;
          collection.__iterate(function(v, k, c) {
            if (predicate.call(context, v, k, c)) {
              iterations++;
              return fn(v, useKeys ? k : iterations - 1, this$1$1);
            }
          }, reverse);
          return iterations;
        };
        filterSequence.__iteratorUncached = function(type, reverse) {
          var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
          var iterations = 0;
          return new Iterator(function() {
            while (true) {
              var step = iterator.next();
              if (step.done) {
                return step;
              }
              var entry = step.value;
              var key2 = entry[0];
              var value2 = entry[1];
              if (predicate.call(context, value2, key2, collection)) {
                return iteratorValue(type, useKeys ? key2 : iterations++, value2, step);
              }
            }
          });
        };
        return filterSequence;
      }
      function countByFactory(collection, grouper, context) {
        var groups = Map2().asMutable();
        collection.__iterate(function(v, k) {
          groups.update(grouper.call(context, v, k, collection), 0, function(a) {
            return a + 1;
          });
        });
        return groups.asImmutable();
      }
      function groupByFactory(collection, grouper, context) {
        var isKeyedIter = isKeyed(collection);
        var groups = (isOrdered(collection) ? OrderedMap() : Map2()).asMutable();
        collection.__iterate(function(v, k) {
          groups.update(
            grouper.call(context, v, k, collection),
            function(a) {
              return a = a || [], a.push(isKeyedIter ? [k, v] : v), a;
            }
          );
        });
        var coerce = collectionClass(collection);
        return groups.map(function(arr) {
          return reify(collection, coerce(arr));
        }).asImmutable();
      }
      function partitionFactory(collection, predicate, context) {
        var isKeyedIter = isKeyed(collection);
        var groups = [[], []];
        collection.__iterate(function(v, k) {
          groups[predicate.call(context, v, k, collection) ? 1 : 0].push(
            isKeyedIter ? [k, v] : v
          );
        });
        var coerce = collectionClass(collection);
        return groups.map(function(arr) {
          return reify(collection, coerce(arr));
        });
      }
      function sliceFactory(collection, begin, end, useKeys) {
        var originalSize = collection.size;
        if (wholeSlice(begin, end, originalSize)) {
          return collection;
        }
        if (typeof originalSize === "undefined" && (begin < 0 || end < 0)) {
          return sliceFactory(collection.toSeq().cacheResult(), begin, end, useKeys);
        }
        var resolvedBegin = resolveBegin(begin, originalSize);
        var resolvedEnd = resolveEnd(end, originalSize);
        var resolvedSize = resolvedEnd - resolvedBegin;
        var sliceSize;
        if (resolvedSize === resolvedSize) {
          sliceSize = resolvedSize < 0 ? 0 : resolvedSize;
        }
        var sliceSeq = makeSequence(collection);
        sliceSeq.size = sliceSize === 0 ? sliceSize : collection.size && sliceSize || void 0;
        if (!useKeys && isSeq(collection) && sliceSize >= 0) {
          sliceSeq.get = function(index, notSetValue) {
            index = wrapIndex(this, index);
            return index >= 0 && index < sliceSize ? collection.get(index + resolvedBegin, notSetValue) : notSetValue;
          };
        }
        sliceSeq.__iterateUncached = function(fn, reverse) {
          var this$1$1 = this;
          if (sliceSize === 0) {
            return 0;
          }
          if (reverse) {
            return this.cacheResult().__iterate(fn, reverse);
          }
          var skipped = 0;
          var isSkipping = true;
          var iterations = 0;
          collection.__iterate(function(v, k) {
            if (!(isSkipping && (isSkipping = skipped++ < resolvedBegin))) {
              iterations++;
              return fn(v, useKeys ? k : iterations - 1, this$1$1) !== false && iterations !== sliceSize;
            }
          });
          return iterations;
        };
        sliceSeq.__iteratorUncached = function(type, reverse) {
          if (sliceSize !== 0 && reverse) {
            return this.cacheResult().__iterator(type, reverse);
          }
          if (sliceSize === 0) {
            return new Iterator(iteratorDone);
          }
          var iterator = collection.__iterator(type, reverse);
          var skipped = 0;
          var iterations = 0;
          return new Iterator(function() {
            while (skipped++ < resolvedBegin) {
              iterator.next();
            }
            if (++iterations > sliceSize) {
              return iteratorDone();
            }
            var step = iterator.next();
            if (useKeys || type === ITERATE_VALUES || step.done) {
              return step;
            }
            if (type === ITERATE_KEYS) {
              return iteratorValue(type, iterations - 1, void 0, step);
            }
            return iteratorValue(type, iterations - 1, step.value[1], step);
          });
        };
        return sliceSeq;
      }
      function takeWhileFactory(collection, predicate, context) {
        var takeSequence = makeSequence(collection);
        takeSequence.__iterateUncached = function(fn, reverse) {
          var this$1$1 = this;
          if (reverse) {
            return this.cacheResult().__iterate(fn, reverse);
          }
          var iterations = 0;
          collection.__iterate(
            function(v, k, c) {
              return predicate.call(context, v, k, c) && ++iterations && fn(v, k, this$1$1);
            }
          );
          return iterations;
        };
        takeSequence.__iteratorUncached = function(type, reverse) {
          var this$1$1 = this;
          if (reverse) {
            return this.cacheResult().__iterator(type, reverse);
          }
          var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
          var iterating = true;
          return new Iterator(function() {
            if (!iterating) {
              return iteratorDone();
            }
            var step = iterator.next();
            if (step.done) {
              return step;
            }
            var entry = step.value;
            var k = entry[0];
            var v = entry[1];
            if (!predicate.call(context, v, k, this$1$1)) {
              iterating = false;
              return iteratorDone();
            }
            return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
          });
        };
        return takeSequence;
      }
      function skipWhileFactory(collection, predicate, context, useKeys) {
        var skipSequence = makeSequence(collection);
        skipSequence.__iterateUncached = function(fn, reverse) {
          var this$1$1 = this;
          if (reverse) {
            return this.cacheResult().__iterate(fn, reverse);
          }
          var isSkipping = true;
          var iterations = 0;
          collection.__iterate(function(v, k, c) {
            if (!(isSkipping && (isSkipping = predicate.call(context, v, k, c)))) {
              iterations++;
              return fn(v, useKeys ? k : iterations - 1, this$1$1);
            }
          });
          return iterations;
        };
        skipSequence.__iteratorUncached = function(type, reverse) {
          var this$1$1 = this;
          if (reverse) {
            return this.cacheResult().__iterator(type, reverse);
          }
          var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
          var skipping = true;
          var iterations = 0;
          return new Iterator(function() {
            var step;
            var k;
            var v;
            do {
              step = iterator.next();
              if (step.done) {
                if (useKeys || type === ITERATE_VALUES) {
                  return step;
                }
                if (type === ITERATE_KEYS) {
                  return iteratorValue(type, iterations++, void 0, step);
                }
                return iteratorValue(type, iterations++, step.value[1], step);
              }
              var entry = step.value;
              k = entry[0];
              v = entry[1];
              skipping && (skipping = predicate.call(context, v, k, this$1$1));
            } while (skipping);
            return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
          });
        };
        return skipSequence;
      }
      var ConcatSeq = /* @__PURE__ */ (function(Seq2) {
        function ConcatSeq2(iterables) {
          this._wrappedIterables = iterables.flatMap(function(iterable) {
            if (iterable._wrappedIterables) {
              return iterable._wrappedIterables;
            }
            return [iterable];
          });
          this.size = this._wrappedIterables.reduce(function(sum, iterable) {
            if (sum !== void 0) {
              var size = iterable.size;
              if (size !== void 0) {
                return sum + size;
              }
            }
          }, 0);
          this[IS_KEYED_SYMBOL] = this._wrappedIterables[0][IS_KEYED_SYMBOL];
          this[IS_INDEXED_SYMBOL] = this._wrappedIterables[0][IS_INDEXED_SYMBOL];
          this[IS_ORDERED_SYMBOL] = this._wrappedIterables[0][IS_ORDERED_SYMBOL];
        }
        if (Seq2) ConcatSeq2.__proto__ = Seq2;
        ConcatSeq2.prototype = Object.create(Seq2 && Seq2.prototype);
        ConcatSeq2.prototype.constructor = ConcatSeq2;
        ConcatSeq2.prototype.__iterateUncached = function __iterateUncached(fn, reverse) {
          if (this._wrappedIterables.length === 0) {
            return;
          }
          if (reverse) {
            return this.cacheResult().__iterate(fn, reverse);
          }
          var iterableIndex = 0;
          var useKeys = isKeyed(this);
          var iteratorType = useKeys ? ITERATE_ENTRIES : ITERATE_VALUES;
          var currentIterator = this._wrappedIterables[iterableIndex].__iterator(
            iteratorType,
            reverse
          );
          var keepGoing = true;
          var index = 0;
          while (keepGoing) {
            var next = currentIterator.next();
            while (next.done) {
              iterableIndex++;
              if (iterableIndex === this._wrappedIterables.length) {
                return index;
              }
              currentIterator = this._wrappedIterables[iterableIndex].__iterator(
                iteratorType,
                reverse
              );
              next = currentIterator.next();
            }
            var fnResult = useKeys ? fn(next.value[1], next.value[0], this) : fn(next.value, index, this);
            keepGoing = fnResult !== false;
            index++;
          }
          return index;
        };
        ConcatSeq2.prototype.__iteratorUncached = function __iteratorUncached(type, reverse) {
          var this$1$1 = this;
          if (this._wrappedIterables.length === 0) {
            return new Iterator(iteratorDone);
          }
          if (reverse) {
            return this.cacheResult().__iterator(type, reverse);
          }
          var iterableIndex = 0;
          var currentIterator = this._wrappedIterables[iterableIndex].__iterator(
            type,
            reverse
          );
          return new Iterator(function() {
            var next = currentIterator.next();
            while (next.done) {
              iterableIndex++;
              if (iterableIndex === this$1$1._wrappedIterables.length) {
                return next;
              }
              currentIterator = this$1$1._wrappedIterables[iterableIndex].__iterator(
                type,
                reverse
              );
              next = currentIterator.next();
            }
            return next;
          });
        };
        return ConcatSeq2;
      })(Seq);
      function concatFactory(collection, values) {
        var isKeyedCollection = isKeyed(collection);
        var iters = [collection].concat(values).map(function(v) {
          if (!isCollection(v)) {
            v = isKeyedCollection ? keyedSeqFromValue(v) : indexedSeqFromValue(Array.isArray(v) ? v : [v]);
          } else if (isKeyedCollection) {
            v = KeyedCollection(v);
          }
          return v;
        }).filter(function(v) {
          return v.size !== 0;
        });
        if (iters.length === 0) {
          return collection;
        }
        if (iters.length === 1) {
          var singleton2 = iters[0];
          if (singleton2 === collection || isKeyedCollection && isKeyed(singleton2) || isIndexed(collection) && isIndexed(singleton2)) {
            return singleton2;
          }
        }
        return new ConcatSeq(iters);
      }
      function flattenFactory(collection, depth, useKeys) {
        var flatSequence = makeSequence(collection);
        flatSequence.__iterateUncached = function(fn, reverse) {
          if (reverse) {
            return this.cacheResult().__iterate(fn, reverse);
          }
          var iterations = 0;
          var stopped = false;
          function flatDeep(iter, currentDepth) {
            iter.__iterate(function(v, k) {
              if ((!depth || currentDepth < depth) && isCollection(v)) {
                flatDeep(v, currentDepth + 1);
              } else {
                iterations++;
                if (fn(v, useKeys ? k : iterations - 1, flatSequence) === false) {
                  stopped = true;
                }
              }
              return !stopped;
            }, reverse);
          }
          flatDeep(collection, 0);
          return iterations;
        };
        flatSequence.__iteratorUncached = function(type, reverse) {
          if (reverse) {
            return this.cacheResult().__iterator(type, reverse);
          }
          var iterator = collection.__iterator(type, reverse);
          var stack = [];
          var iterations = 0;
          return new Iterator(function() {
            while (iterator) {
              var step = iterator.next();
              if (step.done !== false) {
                iterator = stack.pop();
                continue;
              }
              var v = step.value;
              if (type === ITERATE_ENTRIES) {
                v = v[1];
              }
              if ((!depth || stack.length < depth) && isCollection(v)) {
                stack.push(iterator);
                iterator = v.__iterator(type, reverse);
              } else {
                return useKeys ? step : iteratorValue(type, iterations++, v, step);
              }
            }
            return iteratorDone();
          });
        };
        return flatSequence;
      }
      function flatMapFactory(collection, mapper, context) {
        var coerce = collectionClass(collection);
        return collection.toSeq().map(function(v, k) {
          return coerce(mapper.call(context, v, k, collection));
        }).flatten(true);
      }
      function interposeFactory(collection, separator) {
        var interposedSequence = makeSequence(collection);
        interposedSequence.size = collection.size && collection.size * 2 - 1;
        interposedSequence.__iterateUncached = function(fn, reverse) {
          var this$1$1 = this;
          var iterations = 0;
          collection.__iterate(
            function(v) {
              return (!iterations || fn(separator, iterations++, this$1$1) !== false) && fn(v, iterations++, this$1$1) !== false;
            },
            reverse
          );
          return iterations;
        };
        interposedSequence.__iteratorUncached = function(type, reverse) {
          var iterator = collection.__iterator(ITERATE_VALUES, reverse);
          var iterations = 0;
          var step;
          return new Iterator(function() {
            if (!step || iterations % 2) {
              step = iterator.next();
              if (step.done) {
                return step;
              }
            }
            return iterations % 2 ? iteratorValue(type, iterations++, separator) : iteratorValue(type, iterations++, step.value, step);
          });
        };
        return interposedSequence;
      }
      function sortFactory(collection, comparator, mapper) {
        if (!comparator) {
          comparator = defaultComparator;
        }
        var isKeyedCollection = isKeyed(collection);
        var index = 0;
        var entries = collection.toSeq().map(function(v, k) {
          return [k, v, index++, mapper ? mapper(v, k, collection) : v];
        }).valueSeq().toArray();
        entries.sort(function(a, b) {
          return comparator(a[3], b[3]) || a[2] - b[2];
        }).forEach(
          isKeyedCollection ? function(v, i) {
            entries[i].length = 2;
          } : function(v, i) {
            entries[i] = v[1];
          }
        );
        return isKeyedCollection ? KeyedSeq(entries) : isIndexed(collection) ? IndexedSeq(entries) : SetSeq(entries);
      }
      function maxFactory(collection, comparator, mapper) {
        if (!comparator) {
          comparator = defaultComparator;
        }
        if (mapper) {
          var entry = collection.toSeq().map(function(v, k) {
            return [v, mapper(v, k, collection)];
          }).reduce(function(a, b) {
            return maxCompare(comparator, a[1], b[1]) ? b : a;
          });
          return entry && entry[0];
        }
        return collection.reduce(function(a, b) {
          return maxCompare(comparator, a, b) ? b : a;
        });
      }
      function maxCompare(comparator, a, b) {
        var comp = comparator(b, a);
        return comp === 0 && b !== a && (b === void 0 || b === null || b !== b) || comp > 0;
      }
      function zipWithFactory(keyIter, zipper, iters, zipAll) {
        var zipSequence = makeSequence(keyIter);
        var sizes = new ArraySeq(iters).map(function(i) {
          return i.size;
        });
        zipSequence.size = zipAll ? sizes.max() : sizes.min();
        zipSequence.__iterate = function(fn, reverse) {
          var iterator = this.__iterator(ITERATE_VALUES, reverse);
          var step;
          var iterations = 0;
          while (!(step = iterator.next()).done) {
            if (fn(step.value, iterations++, this) === false) {
              break;
            }
          }
          return iterations;
        };
        zipSequence.__iteratorUncached = function(type, reverse) {
          var iterators = iters.map(
            function(i) {
              return i = Collection(i), getIterator(reverse ? i.reverse() : i);
            }
          );
          var iterations = 0;
          var isDone = false;
          return new Iterator(function() {
            var steps;
            if (!isDone) {
              steps = iterators.map(function(i) {
                return i.next();
              });
              isDone = zipAll ? steps.every(function(s2) {
                return s2.done;
              }) : steps.some(function(s2) {
                return s2.done;
              });
            }
            if (isDone) {
              return iteratorDone();
            }
            return iteratorValue(
              type,
              iterations++,
              zipper.apply(
                null,
                steps.map(function(s2) {
                  return s2.value;
                })
              )
            );
          });
        };
        return zipSequence;
      }
      function reify(iter, seq) {
        return iter === seq ? iter : isSeq(iter) ? seq : iter.constructor(seq);
      }
      function validateEntry(entry) {
        if (entry !== Object(entry)) {
          throw new TypeError("Expected [K, V] tuple: " + entry);
        }
      }
      function collectionClass(collection) {
        return isKeyed(collection) ? KeyedCollection : isIndexed(collection) ? IndexedCollection : SetCollection;
      }
      function makeSequence(collection) {
        return Object.create(
          (isKeyed(collection) ? KeyedSeq : isIndexed(collection) ? IndexedSeq : SetSeq).prototype
        );
      }
      function cacheResultThrough() {
        if (this._iter.cacheResult) {
          this._iter.cacheResult();
          this.size = this._iter.size;
          return this;
        }
        return Seq.prototype.cacheResult.call(this);
      }
      function defaultComparator(a, b) {
        if (a === void 0 && b === void 0) {
          return 0;
        }
        if (a === void 0) {
          return 1;
        }
        if (b === void 0) {
          return -1;
        }
        return a > b ? 1 : a < b ? -1 : 0;
      }
      function isValueObject(maybeValue) {
        return Boolean(maybeValue && // @ts-expect-error: maybeValue is typed as `{}`
        typeof maybeValue.equals === "function" && // @ts-expect-error: maybeValue is typed as `{}`
        typeof maybeValue.hashCode === "function");
      }
      function is(valueA, valueB) {
        if (valueA === valueB || valueA !== valueA && valueB !== valueB) {
          return true;
        }
        if (!valueA || !valueB) {
          return false;
        }
        if (typeof valueA.valueOf === "function" && typeof valueB.valueOf === "function") {
          valueA = valueA.valueOf();
          valueB = valueB.valueOf();
          if (valueA === valueB || valueA !== valueA && valueB !== valueB) {
            return true;
          }
          if (!valueA || !valueB) {
            return false;
          }
        }
        return !!(isValueObject(valueA) && isValueObject(valueB) && valueA.equals(valueB));
      }
      function update$1(collection, key2, notSetValue, updater) {
        return updateIn(
          // @ts-expect-error Index signature for type string is missing in type V[]
          collection,
          [key2],
          notSetValue,
          updater
        );
      }
      function merge$1() {
        var iters = [], len = arguments.length;
        while (len--) iters[len] = arguments[len];
        return mergeIntoKeyedWith(this, iters);
      }
      function mergeWith$1(merger) {
        var iters = [], len = arguments.length - 1;
        while (len-- > 0) iters[len] = arguments[len + 1];
        if (typeof merger !== "function") {
          throw new TypeError("Invalid merger function: " + merger);
        }
        return mergeIntoKeyedWith(this, iters, merger);
      }
      function mergeIntoKeyedWith(collection, collections, merger) {
        var iters = [];
        for (var ii = 0; ii < collections.length; ii++) {
          var collection$1 = KeyedCollection(collections[ii]);
          if (collection$1.size !== 0) {
            iters.push(collection$1);
          }
        }
        if (iters.length === 0) {
          return collection;
        }
        if (collection.toSeq().size === 0 && !collection.__ownerID && iters.length === 1) {
          return isRecord(collection) ? collection : collection.constructor(iters[0]);
        }
        return collection.withMutations(function(collection2) {
          var mergeIntoCollection = merger ? function(value2, key2) {
            update$1(
              collection2,
              key2,
              NOT_SET,
              function(oldVal) {
                return oldVal === NOT_SET ? value2 : merger(oldVal, value2, key2);
              }
            );
          } : function(value2, key2) {
            collection2.set(key2, value2);
          };
          for (var ii2 = 0; ii2 < iters.length; ii2++) {
            iters[ii2].forEach(mergeIntoCollection);
          }
        });
      }
      var toString = Object.prototype.toString;
      function isPlainObject(value2) {
        if (!value2 || typeof value2 !== "object" || toString.call(value2) !== "[object Object]") {
          return false;
        }
        var proto = Object.getPrototypeOf(value2);
        if (proto === null) {
          return true;
        }
        var parentProto = proto;
        var nextProto = Object.getPrototypeOf(proto);
        while (nextProto !== null) {
          parentProto = nextProto;
          nextProto = Object.getPrototypeOf(parentProto);
        }
        return parentProto === proto;
      }
      function isDataStructure(value2) {
        return typeof value2 === "object" && (isImmutable(value2) || Array.isArray(value2) || isPlainObject(value2));
      }
      function isProtoKey(key2) {
        return typeof key2 === "string" && (key2 === "__proto__" || key2 === "constructor");
      }
      function arrCopy(arr, offset2) {
        offset2 = offset2 || 0;
        var len = Math.max(0, arr.length - offset2);
        var newArr = new Array(len);
        for (var ii = 0; ii < len; ii++) {
          newArr[ii] = arr[ii + offset2];
        }
        return newArr;
      }
      function shallowCopy(from) {
        if (Array.isArray(from)) {
          return arrCopy(from);
        }
        var to = {};
        for (var key2 in from) {
          if (isProtoKey(key2)) {
            continue;
          }
          if (hasOwnProperty2.call(from, key2)) {
            to[key2] = from[key2];
          }
        }
        return to;
      }
      function merge(collection) {
        var sources = [], len = arguments.length - 1;
        while (len-- > 0) sources[len] = arguments[len + 1];
        return mergeWithSources(collection, sources);
      }
      function mergeWith(merger, collection) {
        var sources = [], len = arguments.length - 2;
        while (len-- > 0) sources[len] = arguments[len + 2];
        return mergeWithSources(collection, sources, merger);
      }
      function mergeDeep$1(collection) {
        var sources = [], len = arguments.length - 1;
        while (len-- > 0) sources[len] = arguments[len + 1];
        return mergeDeepWithSources(collection, sources);
      }
      function mergeDeepWith$1(merger, collection) {
        var sources = [], len = arguments.length - 2;
        while (len-- > 0) sources[len] = arguments[len + 2];
        return mergeDeepWithSources(collection, sources, merger);
      }
      function mergeDeepWithSources(collection, sources, merger) {
        return mergeWithSources(collection, sources, deepMergerWith(merger));
      }
      function mergeWithSources(collection, sources, merger) {
        if (!isDataStructure(collection)) {
          throw new TypeError(
            "Cannot merge into non-data-structure value: " + collection
          );
        }
        if (isImmutable(collection)) {
          return typeof merger === "function" && collection.mergeWith ? collection.mergeWith.apply(collection, [merger].concat(sources)) : collection.merge ? collection.merge.apply(collection, sources) : collection.concat.apply(collection, sources);
        }
        var isArray = Array.isArray(collection);
        var merged = collection;
        var Collection2 = isArray ? IndexedCollection : KeyedCollection;
        var mergeItem = isArray ? function(value2) {
          if (merged === collection) {
            merged = shallowCopy(merged);
          }
          merged.push(value2);
        } : function(value2, key2) {
          if (isProtoKey(key2)) {
            return;
          }
          var hasVal = hasOwnProperty2.call(merged, key2);
          var nextVal = hasVal && merger ? merger(merged[key2], value2, key2) : value2;
          if (!hasVal || nextVal !== merged[key2]) {
            if (merged === collection) {
              merged = shallowCopy(merged);
            }
            merged[key2] = nextVal;
          }
        };
        for (var i = 0; i < sources.length; i++) {
          Collection2(sources[i]).forEach(mergeItem);
        }
        return merged;
      }
      function deepMergerWith(merger) {
        function deepMerger(oldValue, newValue, key2) {
          return isDataStructure(oldValue) && isDataStructure(newValue) && areMergeable(oldValue, newValue) ? mergeWithSources(oldValue, [newValue], deepMerger) : merger ? merger(oldValue, newValue, key2) : newValue;
        }
        return deepMerger;
      }
      function areMergeable(oldDataStructure, newDataStructure) {
        var oldSeq = Seq(oldDataStructure);
        var newSeq = Seq(newDataStructure);
        return isIndexed(oldSeq) === isIndexed(newSeq) && isKeyed(oldSeq) === isKeyed(newSeq);
      }
      function mergeDeep() {
        var iters = [], len = arguments.length;
        while (len--) iters[len] = arguments[len];
        return mergeDeepWithSources(this, iters);
      }
      function mergeDeepWith(merger) {
        var iters = [], len = arguments.length - 1;
        while (len-- > 0) iters[len] = arguments[len + 1];
        return mergeDeepWithSources(this, iters, merger);
      }
      function mergeDeepIn(keyPath) {
        var iters = [], len = arguments.length - 1;
        while (len-- > 0) iters[len] = arguments[len + 1];
        return updateIn(
          this,
          keyPath,
          emptyMap(),
          function(m) {
            return mergeDeepWithSources(m, iters);
          }
        );
      }
      function mergeIn(keyPath) {
        var iters = [], len = arguments.length - 1;
        while (len-- > 0) iters[len] = arguments[len + 1];
        return updateIn(this, keyPath, emptyMap(), function(m) {
          return mergeWithSources(m, iters);
        });
      }
      function setIn$1(collection, keyPath, value2) {
        return updateIn(collection, keyPath, NOT_SET, function() {
          return value2;
        });
      }
      function setIn(keyPath, v) {
        return setIn$1(this, keyPath, v);
      }
      function update(key2, notSetValue, updater) {
        return arguments.length === 1 ? key2(this) : update$1(this, key2, notSetValue, updater);
      }
      function updateIn$1(keyPath, notSetValue, updater) {
        return updateIn(this, keyPath, notSetValue, updater);
      }
      function wasAltered() {
        return this.__altered;
      }
      function withMutations(fn) {
        var mutable = this.asMutable();
        fn(mutable);
        return mutable.wasAltered() ? mutable.__ensureOwner(this.__ownerID) : this;
      }
      var IS_MAP_SYMBOL = "@@__IMMUTABLE_MAP__@@";
      function isMap(maybeMap) {
        return Boolean(maybeMap && // @ts-expect-error: maybeMap is typed as `{}`, need to change in 6.0 to `maybeMap && typeof maybeMap === 'object' && IS_MAP_SYMBOL in maybeMap`
        maybeMap[IS_MAP_SYMBOL]);
      }
      function invariant(condition, error) {
        if (!condition) {
          throw new Error(error);
        }
      }
      function assertNotInfinite(size) {
        invariant(size !== Infinity, "Cannot perform this action with an infinite size.");
      }
      var Map2 = /* @__PURE__ */ (function(KeyedCollection2) {
        function Map3(value2) {
          return value2 === void 0 || value2 === null ? emptyMap() : isMap(value2) && !isOrdered(value2) ? value2 : emptyMap().withMutations(function(map) {
            var iter = KeyedCollection2(value2);
            assertNotInfinite(iter.size);
            iter.forEach(function(v, k) {
              return map.set(k, v);
            });
          });
        }
        if (KeyedCollection2) Map3.__proto__ = KeyedCollection2;
        Map3.prototype = Object.create(KeyedCollection2 && KeyedCollection2.prototype);
        Map3.prototype.constructor = Map3;
        Map3.prototype.toString = function toString2() {
          return this.__toString("Map {", "}");
        };
        Map3.prototype.get = function get2(k, notSetValue) {
          return this._root ? this._root.get(0, void 0, k, notSetValue) : notSetValue;
        };
        Map3.prototype.set = function set2(k, v) {
          return updateMap(this, k, v);
        };
        Map3.prototype.remove = function remove2(k) {
          return updateMap(this, k, NOT_SET);
        };
        Map3.prototype.deleteAll = function deleteAll(keys) {
          var collection = Collection(keys);
          if (collection.size === 0) {
            return this;
          }
          return this.withMutations(function(map) {
            collection.forEach(function(key2) {
              return map.remove(key2);
            });
          });
        };
        Map3.prototype.clear = function clear() {
          if (this.size === 0) {
            return this;
          }
          if (this.__ownerID) {
            this.size = 0;
            this._root = null;
            this.__hash = void 0;
            this.__altered = true;
            return this;
          }
          return emptyMap();
        };
        Map3.prototype.sort = function sort(comparator) {
          return OrderedMap(sortFactory(this, comparator));
        };
        Map3.prototype.sortBy = function sortBy(mapper, comparator) {
          return OrderedMap(sortFactory(this, comparator, mapper));
        };
        Map3.prototype.map = function map(mapper, context) {
          var this$1$1 = this;
          return this.withMutations(function(map2) {
            map2.forEach(function(value2, key2) {
              map2.set(key2, mapper.call(context, value2, key2, this$1$1));
            });
          });
        };
        Map3.prototype.__iterator = function __iterator(type, reverse) {
          return new MapIterator(this, type, reverse);
        };
        Map3.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          var iterations = 0;
          this._root && this._root.iterate(function(entry) {
            iterations++;
            return fn(entry[1], entry[0], this$1$1);
          }, reverse);
          return iterations;
        };
        Map3.prototype.__ensureOwner = function __ensureOwner(ownerID) {
          if (ownerID === this.__ownerID) {
            return this;
          }
          if (!ownerID) {
            if (this.size === 0) {
              return emptyMap();
            }
            this.__ownerID = ownerID;
            this.__altered = false;
            return this;
          }
          return makeMap(this.size, this._root, ownerID, this.__hash);
        };
        return Map3;
      })(KeyedCollection);
      Map2.isMap = isMap;
      var MapPrototype = Map2.prototype;
      MapPrototype[IS_MAP_SYMBOL] = true;
      MapPrototype[DELETE] = MapPrototype.remove;
      MapPrototype.removeAll = MapPrototype.deleteAll;
      MapPrototype.setIn = setIn;
      MapPrototype.removeIn = MapPrototype.deleteIn = deleteIn;
      MapPrototype.update = update;
      MapPrototype.updateIn = updateIn$1;
      MapPrototype.merge = MapPrototype.concat = merge$1;
      MapPrototype.mergeWith = mergeWith$1;
      MapPrototype.mergeDeep = mergeDeep;
      MapPrototype.mergeDeepWith = mergeDeepWith;
      MapPrototype.mergeIn = mergeIn;
      MapPrototype.mergeDeepIn = mergeDeepIn;
      MapPrototype.withMutations = withMutations;
      MapPrototype.wasAltered = wasAltered;
      MapPrototype.asImmutable = asImmutable;
      MapPrototype["@@transducer/init"] = MapPrototype.asMutable = asMutable;
      MapPrototype["@@transducer/step"] = function(result, arr) {
        return result.set(arr[0], arr[1]);
      };
      MapPrototype["@@transducer/result"] = function(obj) {
        return obj.asImmutable();
      };
      var ArrayMapNode = function ArrayMapNode2(ownerID, entries) {
        this.ownerID = ownerID;
        this.entries = entries;
      };
      ArrayMapNode.prototype.get = function get2(shift, keyHash, key2, notSetValue) {
        var entries = this.entries;
        for (var ii = 0, len = entries.length; ii < len; ii++) {
          if (is(key2, entries[ii][0])) {
            return entries[ii][1];
          }
        }
        return notSetValue;
      };
      ArrayMapNode.prototype.update = function update2(ownerID, shift, keyHash, key2, value2, didChangeSize, didAlter) {
        var removed = value2 === NOT_SET;
        var entries = this.entries;
        var idx = 0;
        var len = entries.length;
        for (; idx < len; idx++) {
          if (is(key2, entries[idx][0])) {
            break;
          }
        }
        var exists = idx < len;
        if (exists ? entries[idx][1] === value2 : removed) {
          return this;
        }
        SetRef(didAlter);
        (removed || !exists) && SetRef(didChangeSize);
        if (removed && entries.length === 1) {
          return;
        }
        if (!exists && !removed && entries.length >= MAX_ARRAY_MAP_SIZE) {
          return createNodes(ownerID, entries, key2, value2);
        }
        var isEditable = ownerID && ownerID === this.ownerID;
        var newEntries = isEditable ? entries : arrCopy(entries);
        if (exists) {
          if (removed) {
            idx === len - 1 ? newEntries.pop() : newEntries[idx] = newEntries.pop();
          } else {
            newEntries[idx] = [key2, value2];
          }
        } else {
          newEntries.push([key2, value2]);
        }
        if (isEditable) {
          this.entries = newEntries;
          return this;
        }
        return new ArrayMapNode(ownerID, newEntries);
      };
      var BitmapIndexedNode = function BitmapIndexedNode2(ownerID, bitmap, nodes) {
        this.ownerID = ownerID;
        this.bitmap = bitmap;
        this.nodes = nodes;
      };
      BitmapIndexedNode.prototype.get = function get2(shift, keyHash, key2, notSetValue) {
        if (keyHash === void 0) {
          keyHash = hash(key2);
        }
        var bit = 1 << ((shift === 0 ? keyHash : keyHash >>> shift) & MASK);
        var bitmap = this.bitmap;
        return (bitmap & bit) === 0 ? notSetValue : this.nodes[popCount(bitmap & bit - 1)].get(
          shift + SHIFT,
          keyHash,
          key2,
          notSetValue
        );
      };
      BitmapIndexedNode.prototype.update = function update2(ownerID, shift, keyHash, key2, value2, didChangeSize, didAlter) {
        if (keyHash === void 0) {
          keyHash = hash(key2);
        }
        var keyHashFrag = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
        var bit = 1 << keyHashFrag;
        var bitmap = this.bitmap;
        var exists = (bitmap & bit) !== 0;
        if (!exists && value2 === NOT_SET) {
          return this;
        }
        var idx = popCount(bitmap & bit - 1);
        var nodes = this.nodes;
        var node = exists ? nodes[idx] : void 0;
        var newNode = updateNode(
          node,
          ownerID,
          shift + SHIFT,
          keyHash,
          key2,
          value2,
          didChangeSize,
          didAlter
        );
        if (newNode === node) {
          return this;
        }
        if (!exists && newNode && nodes.length >= MAX_BITMAP_INDEXED_SIZE) {
          return expandNodes(ownerID, nodes, bitmap, keyHashFrag, newNode);
        }
        if (exists && !newNode && nodes.length === 2 && isLeafNode(nodes[idx ^ 1])) {
          return nodes[idx ^ 1];
        }
        if (exists && newNode && nodes.length === 1 && isLeafNode(newNode)) {
          return newNode;
        }
        var isEditable = ownerID && ownerID === this.ownerID;
        var newBitmap = exists ? newNode ? bitmap : bitmap ^ bit : bitmap | bit;
        var newNodes = exists ? newNode ? setAt(nodes, idx, newNode, isEditable) : spliceOut(nodes, idx, isEditable) : spliceIn(nodes, idx, newNode, isEditable);
        if (isEditable) {
          this.bitmap = newBitmap;
          this.nodes = newNodes;
          return this;
        }
        return new BitmapIndexedNode(ownerID, newBitmap, newNodes);
      };
      var HashArrayMapNode = function HashArrayMapNode2(ownerID, count, nodes) {
        this.ownerID = ownerID;
        this.count = count;
        this.nodes = nodes;
      };
      HashArrayMapNode.prototype.get = function get2(shift, keyHash, key2, notSetValue) {
        if (keyHash === void 0) {
          keyHash = hash(key2);
        }
        var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
        var node = this.nodes[idx];
        return node ? node.get(shift + SHIFT, keyHash, key2, notSetValue) : notSetValue;
      };
      HashArrayMapNode.prototype.update = function update2(ownerID, shift, keyHash, key2, value2, didChangeSize, didAlter) {
        if (keyHash === void 0) {
          keyHash = hash(key2);
        }
        var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
        var removed = value2 === NOT_SET;
        var nodes = this.nodes;
        var node = nodes[idx];
        if (removed && !node) {
          return this;
        }
        var newNode = updateNode(
          node,
          ownerID,
          shift + SHIFT,
          keyHash,
          key2,
          value2,
          didChangeSize,
          didAlter
        );
        if (newNode === node) {
          return this;
        }
        var newCount = this.count;
        if (!node) {
          newCount++;
        } else if (!newNode) {
          newCount--;
          if (newCount < MIN_HASH_ARRAY_MAP_SIZE) {
            return packNodes(ownerID, nodes, newCount, idx);
          }
        }
        var isEditable = ownerID && ownerID === this.ownerID;
        var newNodes = setAt(nodes, idx, newNode, isEditable);
        if (isEditable) {
          this.count = newCount;
          this.nodes = newNodes;
          return this;
        }
        return new HashArrayMapNode(ownerID, newCount, newNodes);
      };
      var HashCollisionNode = function HashCollisionNode2(ownerID, keyHash, entries) {
        this.ownerID = ownerID;
        this.keyHash = keyHash;
        this.entries = entries;
        this._index = void 0;
      };
      HashCollisionNode.prototype._positionOf = function _positionOf(key2, buildIndex) {
        var entries = this.entries;
        var index = this._index;
        if (index === void 0 && buildIndex && entries.length >= MIN_HASH_COLLISION_INDEX_SIZE) {
          index = this._buildIndex();
        }
        if (index !== void 0) {
          var positions = index[hashCollisionKey(key2)];
          if (positions !== void 0) {
            for (var jj = 0; jj < positions.length; jj++) {
              var ii = positions[jj];
              if (is(key2, entries[ii][0])) {
                return ii;
              }
            }
          }
          return -1;
        }
        for (var ii$1 = 0, len = entries.length; ii$1 < len; ii$1++) {
          if (is(key2, entries[ii$1][0])) {
            return ii$1;
          }
        }
        return -1;
      };
      HashCollisionNode.prototype._buildIndex = function _buildIndex() {
        var index = /* @__PURE__ */ Object.create(null);
        var entries = this.entries;
        for (var ii = 0, len = entries.length; ii < len; ii++) {
          var secondaryHash = hashCollisionKey(entries[ii][0]);
          var positions = index[secondaryHash];
          if (positions !== void 0) {
            positions.push(ii);
          } else {
            index[secondaryHash] = [ii];
          }
        }
        this._index = index;
        return index;
      };
      HashCollisionNode.prototype.get = function get2(shift, keyHash, key2, notSetValue) {
        var idx = this._positionOf(key2, true);
        return idx === -1 ? notSetValue : this.entries[idx][1];
      };
      HashCollisionNode.prototype.update = function update2(ownerID, shift, keyHash, key2, value2, didChangeSize, didAlter) {
        if (keyHash === void 0) {
          keyHash = hash(key2);
        }
        var removed = value2 === NOT_SET;
        if (keyHash !== this.keyHash) {
          if (removed) {
            return this;
          }
          SetRef(didAlter);
          SetRef(didChangeSize);
          return mergeIntoNode(this, ownerID, shift, keyHash, [key2, value2]);
        }
        var entries = this.entries;
        var len = entries.length;
        var isEditable = ownerID && ownerID === this.ownerID;
        var foundIdx = this._positionOf(key2, isEditable);
        var idx = foundIdx === -1 ? len : foundIdx;
        var exists = foundIdx !== -1;
        if (exists ? entries[idx][1] === value2 : removed) {
          return this;
        }
        SetRef(didAlter);
        (removed || !exists) && SetRef(didChangeSize);
        if (removed && len === 2) {
          return new ValueNode(ownerID, this.keyHash, entries[idx ^ 1]);
        }
        var newEntries = isEditable ? entries : arrCopy(entries);
        if (exists) {
          if (removed) {
            idx === len - 1 ? newEntries.pop() : newEntries[idx] = newEntries.pop();
            if (isEditable) {
              this._index = void 0;
            }
          } else {
            newEntries[idx] = [key2, value2];
          }
        } else {
          newEntries.push([key2, value2]);
          if (isEditable && this._index !== void 0) {
            var secondaryHash = hashCollisionKey(key2);
            var positions = this._index[secondaryHash];
            if (positions !== void 0) {
              positions.push(len);
            } else {
              this._index[secondaryHash] = [len];
            }
          }
        }
        if (isEditable) {
          this.entries = newEntries;
          return this;
        }
        return new HashCollisionNode(ownerID, this.keyHash, newEntries);
      };
      var ValueNode = function ValueNode2(ownerID, keyHash, entry) {
        this.ownerID = ownerID;
        this.keyHash = keyHash;
        this.entry = entry;
      };
      ValueNode.prototype.get = function get2(shift, keyHash, key2, notSetValue) {
        return is(key2, this.entry[0]) ? this.entry[1] : notSetValue;
      };
      ValueNode.prototype.update = function update2(ownerID, shift, keyHash, key2, value2, didChangeSize, didAlter) {
        var removed = value2 === NOT_SET;
        var keyMatch = is(key2, this.entry[0]);
        if (keyMatch ? value2 === this.entry[1] : removed) {
          return this;
        }
        SetRef(didAlter);
        if (removed) {
          SetRef(didChangeSize);
          return;
        }
        if (keyMatch) {
          if (ownerID && ownerID === this.ownerID) {
            this.entry[1] = value2;
            return this;
          }
          return new ValueNode(ownerID, this.keyHash, [key2, value2]);
        }
        SetRef(didChangeSize);
        return mergeIntoNode(this, ownerID, shift, hash(key2), [key2, value2]);
      };
      ArrayMapNode.prototype.iterate = HashCollisionNode.prototype.iterate = function(fn, reverse) {
        var entries = this.entries;
        for (var ii = 0, maxIndex = entries.length - 1; ii <= maxIndex; ii++) {
          if (fn(entries[reverse ? maxIndex - ii : ii]) === false) {
            return false;
          }
        }
      };
      BitmapIndexedNode.prototype.iterate = HashArrayMapNode.prototype.iterate = function(fn, reverse) {
        var nodes = this.nodes;
        for (var ii = 0, maxIndex = nodes.length - 1; ii <= maxIndex; ii++) {
          var node = nodes[reverse ? maxIndex - ii : ii];
          if (node && node.iterate(fn, reverse) === false) {
            return false;
          }
        }
      };
      ValueNode.prototype.iterate = function(fn, reverse) {
        return fn(this.entry);
      };
      var MapIterator = /* @__PURE__ */ (function(Iterator2) {
        function MapIterator2(map, type, reverse) {
          this._type = type;
          this._reverse = reverse;
          this._stack = map._root && mapIteratorFrame(map._root);
        }
        if (Iterator2) MapIterator2.__proto__ = Iterator2;
        MapIterator2.prototype = Object.create(Iterator2 && Iterator2.prototype);
        MapIterator2.prototype.constructor = MapIterator2;
        MapIterator2.prototype.next = function next() {
          var type = this._type;
          var stack = this._stack;
          while (stack) {
            var node = stack.node;
            var index = stack.index++;
            var maxIndex = void 0;
            if (node.entry) {
              if (index === 0) {
                return mapIteratorValue(type, node.entry);
              }
            } else if (node.entries) {
              maxIndex = node.entries.length - 1;
              if (index <= maxIndex) {
                return mapIteratorValue(
                  type,
                  node.entries[this._reverse ? maxIndex - index : index]
                );
              }
            } else {
              maxIndex = node.nodes.length - 1;
              if (index <= maxIndex) {
                var subNode = node.nodes[this._reverse ? maxIndex - index : index];
                if (subNode) {
                  if (subNode.entry) {
                    return mapIteratorValue(type, subNode.entry);
                  }
                  stack = this._stack = mapIteratorFrame(subNode, stack);
                }
                continue;
              }
            }
            stack = this._stack = this._stack.__prev;
          }
          return iteratorDone();
        };
        return MapIterator2;
      })(Iterator);
      function mapIteratorValue(type, entry) {
        return iteratorValue(type, entry[0], entry[1]);
      }
      function mapIteratorFrame(node, prev) {
        return {
          node,
          index: 0,
          __prev: prev
        };
      }
      function makeMap(size, root, ownerID, hash2) {
        var map = Object.create(MapPrototype);
        map.size = size;
        map._root = root;
        map.__ownerID = ownerID;
        map.__hash = hash2;
        map.__altered = false;
        return map;
      }
      var EMPTY_MAP;
      function emptyMap() {
        return EMPTY_MAP || (EMPTY_MAP = makeMap(0));
      }
      function updateMap(map, k, v) {
        var newRoot;
        var newSize;
        if (!map._root) {
          if (v === NOT_SET) {
            return map;
          }
          newSize = 1;
          newRoot = new ArrayMapNode(map.__ownerID, [[k, v]]);
        } else {
          var didChangeSize = MakeRef();
          var didAlter = MakeRef();
          newRoot = updateNode(
            map._root,
            map.__ownerID,
            0,
            void 0,
            k,
            v,
            didChangeSize,
            didAlter
          );
          if (!didAlter.value) {
            return map;
          }
          newSize = map.size + (didChangeSize.value ? v === NOT_SET ? -1 : 1 : 0);
        }
        if (map.__ownerID) {
          map.size = newSize;
          map._root = newRoot;
          map.__hash = void 0;
          map.__altered = true;
          return map;
        }
        return newRoot ? makeMap(newSize, newRoot) : emptyMap();
      }
      function updateNode(node, ownerID, shift, keyHash, key2, value2, didChangeSize, didAlter) {
        if (!node) {
          if (value2 === NOT_SET) {
            return node;
          }
          SetRef(didAlter);
          SetRef(didChangeSize);
          return new ValueNode(ownerID, keyHash, [key2, value2]);
        }
        return node.update(
          ownerID,
          shift,
          keyHash,
          key2,
          value2,
          didChangeSize,
          didAlter
        );
      }
      function isLeafNode(node) {
        return node.constructor === ValueNode || node.constructor === HashCollisionNode;
      }
      function mergeIntoNode(node, ownerID, shift, keyHash, entry) {
        if (node.keyHash === keyHash) {
          return new HashCollisionNode(ownerID, keyHash, [node.entry, entry]);
        }
        var idx1 = (shift === 0 ? node.keyHash : node.keyHash >>> shift) & MASK;
        var idx2 = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
        var newNode;
        var nodes = idx1 === idx2 ? [mergeIntoNode(node, ownerID, shift + SHIFT, keyHash, entry)] : (newNode = new ValueNode(ownerID, keyHash, entry), idx1 < idx2 ? [node, newNode] : [newNode, node]);
        return new BitmapIndexedNode(ownerID, 1 << idx1 | 1 << idx2, nodes);
      }
      function createNodes(ownerID, entries, key2, value2) {
        if (!ownerID) {
          ownerID = new OwnerID();
        }
        var node = new ValueNode(ownerID, hash(key2), [key2, value2]);
        for (var ii = 0; ii < entries.length; ii++) {
          var entry = entries[ii];
          node = node.update(ownerID, 0, void 0, entry[0], entry[1]);
        }
        return node;
      }
      function packNodes(ownerID, nodes, count, excluding) {
        var bitmap = 0;
        var packedII = 0;
        var packedNodes = new Array(count);
        for (var ii = 0, bit = 1, len = nodes.length; ii < len; ii++, bit <<= 1) {
          var node = nodes[ii];
          if (node !== void 0 && ii !== excluding) {
            bitmap |= bit;
            packedNodes[packedII++] = node;
          }
        }
        return new BitmapIndexedNode(ownerID, bitmap, packedNodes);
      }
      function expandNodes(ownerID, nodes, bitmap, including, node) {
        var count = 0;
        var expandedNodes = new Array(SIZE);
        for (var ii = 0; bitmap !== 0; ii++, bitmap >>>= 1) {
          expandedNodes[ii] = bitmap & 1 ? nodes[count++] : void 0;
        }
        expandedNodes[including] = node;
        return new HashArrayMapNode(ownerID, count + 1, expandedNodes);
      }
      function popCount(x) {
        x -= x >> 1 & 1431655765;
        x = (x & 858993459) + (x >> 2 & 858993459);
        x = x + (x >> 4) & 252645135;
        x += x >> 8;
        x += x >> 16;
        return x & 127;
      }
      function setAt(array, idx, val, canEdit) {
        var newArray = canEdit ? array : arrCopy(array);
        newArray[idx] = val;
        return newArray;
      }
      function spliceIn(array, idx, val, canEdit) {
        var newLen = array.length + 1;
        if (canEdit && idx + 1 === newLen) {
          array[idx] = val;
          return array;
        }
        var newArray = new Array(newLen);
        var after = 0;
        for (var ii = 0; ii < newLen; ii++) {
          if (ii === idx) {
            newArray[ii] = val;
            after = -1;
          } else {
            newArray[ii] = array[ii + after];
          }
        }
        return newArray;
      }
      function spliceOut(array, idx, canEdit) {
        var newLen = array.length - 1;
        if (canEdit && idx === newLen) {
          array.pop();
          return array;
        }
        var newArray = new Array(newLen);
        var after = 0;
        for (var ii = 0; ii < newLen; ii++) {
          if (ii === idx) {
            after = 1;
          }
          newArray[ii] = array[ii + after];
        }
        return newArray;
      }
      var MAX_ARRAY_MAP_SIZE = SIZE / 4;
      var MAX_BITMAP_INDEXED_SIZE = SIZE / 2;
      var MIN_HASH_ARRAY_MAP_SIZE = SIZE / 4;
      var MIN_HASH_COLLISION_INDEX_SIZE = 16;
      function coerceKeyPath(keyPath) {
        if (isArrayLike(keyPath) && typeof keyPath !== "string") {
          return keyPath;
        }
        if (isOrdered(keyPath)) {
          return keyPath.toArray();
        }
        throw new TypeError("Invalid keyPath: expected Ordered Collection or Array: " + keyPath);
      }
      function quoteString(value2) {
        try {
          return typeof value2 === "string" ? JSON.stringify(value2) : String(value2);
        } catch (_ignoreError) {
          return JSON.stringify(value2);
        }
      }
      function has(collection, key2) {
        return isImmutable(collection) ? (
          // @ts-expect-error key might be a number or symbol, which is not handled be Record key type
          collection.has(key2)
        ) : (
          // @ts-expect-error key might be anything else than PropertyKey, and will return false in that case but runtime is OK
          isDataStructure(collection) && hasOwnProperty2.call(collection, key2)
        );
      }
      function get(collection, key2, notSetValue) {
        return isImmutable(collection) ? collection.get(key2, notSetValue) : !has(collection, key2) ? notSetValue : (
          // @ts-expect-error weird "get" here,
          typeof collection.get === "function" ? (
            // @ts-expect-error weird "get" here,
            collection.get(key2)
          ) : (
            // @ts-expect-error key is unknown here,
            collection[key2]
          )
        );
      }
      function remove(collection, key2) {
        if (!isDataStructure(collection)) {
          throw new TypeError("Cannot update non-data-structure value: " + collection);
        }
        if (isImmutable(collection)) {
          if (!collection.remove) {
            throw new TypeError("Cannot update immutable value without .remove() method: " + collection);
          }
          return collection.remove(key2);
        }
        if (!hasOwnProperty2.call(collection, key2)) {
          return collection;
        }
        var collectionCopy = shallowCopy(collection);
        if (Array.isArray(collectionCopy)) {
          collectionCopy.splice(key2, 1);
        } else {
          delete collectionCopy[key2];
        }
        return collectionCopy;
      }
      function set(collection, key2, value2) {
        if (isProtoKey(key2)) {
          return collection;
        }
        if (!isDataStructure(collection)) {
          throw new TypeError("Cannot update non-data-structure value: " + collection);
        }
        if (isImmutable(collection)) {
          if (!collection.set) {
            throw new TypeError("Cannot update immutable value without .set() method: " + collection);
          }
          return collection.set(key2, value2);
        }
        if (hasOwnProperty2.call(collection, key2) && value2 === collection[key2]) {
          return collection;
        }
        var collectionCopy = shallowCopy(collection);
        collectionCopy[key2] = value2;
        return collectionCopy;
      }
      function updateIn(collection, keyPath, notSetValue, updater) {
        if (!updater) {
          updater = notSetValue;
          notSetValue = void 0;
        }
        var updatedValue = updateInDeeply(
          isImmutable(collection),
          // @ts-expect-error type issues with Record and mixed types
          collection,
          coerceKeyPath(keyPath),
          0,
          notSetValue,
          updater
        );
        return updatedValue === NOT_SET ? notSetValue : updatedValue;
      }
      function updateInDeeply(inImmutable, existing, keyPath, i, notSetValue, updater) {
        var wasNotSet = existing === NOT_SET;
        if (i === keyPath.length) {
          var existingValue = wasNotSet ? notSetValue : existing;
          var newValue = updater(existingValue);
          return newValue === existingValue ? existing : newValue;
        }
        if (!wasNotSet && !isDataStructure(existing)) {
          throw new TypeError("Cannot update within non-data-structure value in path [" + Array.from(keyPath).slice(0, i).map(quoteString) + "]: " + existing);
        }
        var key2 = keyPath[i];
        var nextExisting = wasNotSet ? NOT_SET : get(existing, key2, NOT_SET);
        var nextUpdated = updateInDeeply(
          nextExisting === NOT_SET ? inImmutable : isImmutable(nextExisting),
          // @ts-expect-error mixed type
          nextExisting,
          keyPath,
          i + 1,
          notSetValue,
          updater
        );
        return nextUpdated === nextExisting ? existing : nextUpdated === NOT_SET ? remove(existing, key2) : set(wasNotSet ? inImmutable ? emptyMap() : {} : existing, key2, nextUpdated);
      }
      function removeIn(collection, keyPath) {
        return updateIn(collection, keyPath, function() {
          return NOT_SET;
        });
      }
      function deleteIn(keyPath) {
        return removeIn(this, keyPath);
      }
      var IS_LIST_SYMBOL = "@@__IMMUTABLE_LIST__@@";
      function isList(maybeList) {
        return Boolean(maybeList && // @ts-expect-error: maybeList is typed as `{}`, need to change in 6.0 to `maybeList && typeof maybeList === 'object' && IS_LIST_SYMBOL in maybeList`
        maybeList[IS_LIST_SYMBOL]);
      }
      var List = /* @__PURE__ */ (function(IndexedCollection2) {
        function List2(value2) {
          var empty = emptyList();
          if (value2 === void 0 || value2 === null) {
            return empty;
          }
          if (isList(value2)) {
            return value2;
          }
          var iter = IndexedCollection2(value2);
          var size = iter.size;
          if (size === 0) {
            return empty;
          }
          assertNotInfinite(size);
          if (size > 0 && size < SIZE) {
            return makeList(0, size, SHIFT, void 0, new VNode(iter.toArray()));
          }
          return empty.withMutations(function(list) {
            list.setSize(size);
            iter.forEach(function(v, i) {
              return list.set(i, v);
            });
          });
        }
        if (IndexedCollection2) List2.__proto__ = IndexedCollection2;
        List2.prototype = Object.create(IndexedCollection2 && IndexedCollection2.prototype);
        List2.prototype.constructor = List2;
        List2.of = function of() {
          return this(arguments);
        };
        List2.prototype.toString = function toString2() {
          return this.__toString("List [", "]");
        };
        List2.prototype.get = function get2(index, notSetValue) {
          index = wrapIndex(this, index);
          if (index >= 0 && index < this.size) {
            index += this._origin;
            var node = listNodeFor(this, index);
            return node && node.array[index & MASK];
          }
          return notSetValue;
        };
        List2.prototype.set = function set2(index, value2) {
          return updateList(this, index, value2);
        };
        List2.prototype.remove = function remove2(index) {
          return !this.has(index) ? this : index === 0 ? this.shift() : index === this.size - 1 ? this.pop() : this.splice(index, 1);
        };
        List2.prototype.insert = function insert(index, value2) {
          return this.splice(index, 0, value2);
        };
        List2.prototype.clear = function clear() {
          if (this.size === 0) {
            return this;
          }
          if (this.__ownerID) {
            this.size = this._origin = this._capacity = 0;
            this._level = SHIFT;
            this._root = this._tail = this.__hash = void 0;
            this.__altered = true;
            return this;
          }
          return emptyList();
        };
        List2.prototype.push = function push() {
          var values = arguments;
          var oldSize = this.size;
          return this.withMutations(function(list) {
            setListBounds(list, 0, oldSize + values.length);
            for (var ii = 0; ii < values.length; ii++) {
              list.set(oldSize + ii, values[ii]);
            }
          });
        };
        List2.prototype.pop = function pop() {
          return setListBounds(this, 0, -1);
        };
        List2.prototype.unshift = function unshift() {
          var values = arguments;
          return this.withMutations(function(list) {
            setListBounds(list, -values.length);
            for (var ii = 0; ii < values.length; ii++) {
              list.set(ii, values[ii]);
            }
          });
        };
        List2.prototype.shift = function shift() {
          return setListBounds(this, 1);
        };
        List2.prototype.shuffle = function shuffle(random) {
          if (random === void 0) random = Math.random;
          return this.withMutations(function(mutable) {
            var current = mutable.size;
            var destination;
            var tmp;
            while (current) {
              destination = Math.floor(random() * current--);
              tmp = mutable.get(destination);
              mutable.set(destination, mutable.get(current));
              mutable.set(current, tmp);
            }
          });
        };
        List2.prototype.concat = function concat() {
          var arguments$1 = arguments;
          var seqs = [];
          for (var i = 0; i < arguments.length; i++) {
            var argument = arguments$1[i];
            var seq = IndexedCollection2(
              typeof argument !== "string" && hasIterator(argument) ? argument : [argument]
            );
            if (seq.size !== 0) {
              seqs.push(seq);
            }
          }
          if (seqs.length === 0) {
            return this;
          }
          if (this.size === 0 && !this.__ownerID && seqs.length === 1) {
            return this.constructor(seqs[0]);
          }
          return this.withMutations(function(list) {
            seqs.forEach(function(seq2) {
              return seq2.forEach(function(value2) {
                return list.push(value2);
              });
            });
          });
        };
        List2.prototype.setSize = function setSize(size) {
          return setListBounds(this, 0, size);
        };
        List2.prototype.map = function map(mapper, context) {
          var this$1$1 = this;
          return this.withMutations(function(list) {
            for (var i = 0; i < this$1$1.size; i++) {
              list.set(i, mapper.call(context, list.get(i), i, this$1$1));
            }
          });
        };
        List2.prototype.slice = function slice(begin, end) {
          var size = this.size;
          if (wholeSlice(begin, end, size)) {
            return this;
          }
          return setListBounds(
            this,
            resolveBegin(begin, size),
            resolveEnd(end, size)
          );
        };
        List2.prototype.__iterator = function __iterator(type, reverse) {
          var index = reverse ? this.size : 0;
          var values = iterateList(this, reverse);
          return new Iterator(function() {
            var value2 = values();
            return value2 === DONE ? iteratorDone() : iteratorValue(type, reverse ? --index : index++, value2);
          });
        };
        List2.prototype.__iterate = function __iterate(fn, reverse) {
          var index = reverse ? this.size : 0;
          var values = iterateList(this, reverse);
          var value2;
          while ((value2 = values()) !== DONE) {
            if (fn(value2, reverse ? --index : index++, this) === false) {
              break;
            }
          }
          return index;
        };
        List2.prototype.__ensureOwner = function __ensureOwner(ownerID) {
          if (ownerID === this.__ownerID) {
            return this;
          }
          if (!ownerID) {
            if (this.size === 0) {
              return emptyList();
            }
            this.__ownerID = ownerID;
            this.__altered = false;
            return this;
          }
          return makeList(
            this._origin,
            this._capacity,
            this._level,
            this._root,
            this._tail,
            ownerID,
            this.__hash
          );
        };
        return List2;
      })(IndexedCollection);
      List.isList = isList;
      var ListPrototype = List.prototype;
      ListPrototype[IS_LIST_SYMBOL] = true;
      ListPrototype[DELETE] = ListPrototype.remove;
      ListPrototype.merge = ListPrototype.concat;
      ListPrototype.setIn = setIn;
      ListPrototype.deleteIn = ListPrototype.removeIn = deleteIn;
      ListPrototype.update = update;
      ListPrototype.updateIn = updateIn$1;
      ListPrototype.mergeIn = mergeIn;
      ListPrototype.mergeDeepIn = mergeDeepIn;
      ListPrototype.withMutations = withMutations;
      ListPrototype.wasAltered = wasAltered;
      ListPrototype.asImmutable = asImmutable;
      ListPrototype["@@transducer/init"] = ListPrototype.asMutable = asMutable;
      ListPrototype["@@transducer/step"] = function(result, arr) {
        return result.push(arr);
      };
      ListPrototype["@@transducer/result"] = function(obj) {
        return obj.asImmutable();
      };
      var VNode = function VNode2(array, ownerID) {
        this.array = array;
        this.ownerID = ownerID;
      };
      VNode.prototype.removeBefore = function removeBefore(ownerID, level, index) {
        if ((index & (1 << level + SHIFT) - 1) === 0 || this.array.length === 0) {
          return this;
        }
        var originIndex = index >>> level & MASK;
        if (originIndex >= this.array.length) {
          return new VNode([], ownerID);
        }
        var removingFirst = originIndex === 0;
        var newChild;
        if (level > 0) {
          var oldChild = this.array[originIndex];
          newChild = oldChild && oldChild.removeBefore(ownerID, level - SHIFT, index);
          if (newChild === oldChild && removingFirst) {
            return this;
          }
        }
        if (removingFirst && !newChild) {
          return this;
        }
        var editable = editableVNode(this, ownerID);
        if (!removingFirst) {
          for (var ii = 0; ii < originIndex; ii++) {
            editable.array[ii] = void 0;
          }
        }
        if (newChild) {
          editable.array[originIndex] = newChild;
        }
        return editable;
      };
      VNode.prototype.removeAfter = function removeAfter(ownerID, level, index) {
        if (index === (level ? 1 << level + SHIFT : SIZE) || this.array.length === 0) {
          return this;
        }
        var sizeIndex = index - 1 >>> level & MASK;
        if (sizeIndex >= this.array.length) {
          return this;
        }
        var newChild;
        if (level > 0) {
          var oldChild = this.array[sizeIndex];
          newChild = oldChild && oldChild.removeAfter(ownerID, level - SHIFT, index);
          if (newChild === oldChild && sizeIndex === this.array.length - 1) {
            return this;
          }
        }
        var editable = editableVNode(this, ownerID);
        editable.array.splice(sizeIndex + 1);
        if (newChild) {
          editable.array[sizeIndex] = newChild;
        }
        return editable;
      };
      var DONE = {};
      function iterateList(list, reverse) {
        var left = list._origin;
        var right = list._capacity;
        var tailPos = getTailOffset(right);
        var tail = list._tail;
        return iterateNodeOrLeaf(list._root, list._level, 0);
        function iterateNodeOrLeaf(node, level, offset2) {
          return level === 0 ? iterateLeaf(node, offset2) : iterateNode(node, level, offset2);
        }
        function iterateLeaf(node, offset2) {
          var array = offset2 === tailPos ? tail && tail.array : node && node.array;
          var from = offset2 > left ? 0 : left - offset2;
          var to = right - offset2;
          if (to > SIZE) {
            to = SIZE;
          }
          return function() {
            if (from === to) {
              return DONE;
            }
            var idx = reverse ? --to : from++;
            return array && array[idx];
          };
        }
        function iterateNode(node, level, offset2) {
          var values;
          var array = node && node.array;
          var from = offset2 > left ? 0 : left - offset2 >> level;
          var to = (right - offset2 >> level) + 1;
          if (to > SIZE) {
            to = SIZE;
          }
          return function() {
            while (true) {
              if (values) {
                var value2 = values();
                if (value2 !== DONE) {
                  return value2;
                }
                values = null;
              }
              if (from === to) {
                return DONE;
              }
              var idx = reverse ? --to : from++;
              values = iterateNodeOrLeaf(
                array && array[idx],
                level - SHIFT,
                offset2 + (idx << level)
              );
            }
          };
        }
      }
      function makeList(origin, capacity, level, root, tail, ownerID, hash2) {
        var list = Object.create(ListPrototype);
        list.size = capacity - origin;
        list._origin = origin;
        list._capacity = capacity;
        list._level = level;
        list._root = root;
        list._tail = tail;
        list.__ownerID = ownerID;
        list.__hash = hash2;
        list.__altered = false;
        return list;
      }
      function emptyList() {
        return makeList(0, 0, SHIFT);
      }
      function updateList(list, index, value2) {
        index = wrapIndex(list, index);
        if (index !== index) {
          return list;
        }
        if (index >= list.size || index < 0) {
          return list.withMutations(function(list2) {
            index < 0 ? setListBounds(list2, index).set(0, value2) : setListBounds(list2, 0, index + 1).set(index, value2);
          });
        }
        index += list._origin;
        var newTail = list._tail;
        var newRoot = list._root;
        var didAlter = MakeRef();
        if (index >= getTailOffset(list._capacity)) {
          newTail = updateVNode(newTail, list.__ownerID, 0, index, value2, didAlter);
        } else {
          newRoot = updateVNode(
            newRoot,
            list.__ownerID,
            list._level,
            index,
            value2,
            didAlter
          );
        }
        if (!didAlter.value) {
          return list;
        }
        if (list.__ownerID) {
          list._root = newRoot;
          list._tail = newTail;
          list.__hash = void 0;
          list.__altered = true;
          return list;
        }
        return makeList(list._origin, list._capacity, list._level, newRoot, newTail);
      }
      function updateVNode(node, ownerID, level, index, value2, didAlter) {
        var idx = index >>> level & MASK;
        var nodeHas = node && idx < node.array.length;
        if (!nodeHas && value2 === void 0) {
          return node;
        }
        var newNode;
        if (level > 0) {
          var lowerNode = node && node.array[idx];
          var newLowerNode = updateVNode(
            lowerNode,
            ownerID,
            level - SHIFT,
            index,
            value2,
            didAlter
          );
          if (newLowerNode === lowerNode) {
            return node;
          }
          newNode = editableVNode(node, ownerID);
          newNode.array[idx] = newLowerNode;
          return newNode;
        }
        if (nodeHas && node.array[idx] === value2) {
          return node;
        }
        if (didAlter) {
          SetRef(didAlter);
        }
        newNode = editableVNode(node, ownerID);
        if (value2 === void 0 && idx === newNode.array.length - 1) {
          newNode.array.pop();
        } else {
          newNode.array[idx] = value2;
        }
        return newNode;
      }
      function editableVNode(node, ownerID) {
        if (ownerID && node && ownerID === node.ownerID) {
          return node;
        }
        return new VNode(node ? node.array.slice() : [], ownerID);
      }
      function listNodeFor(list, rawIndex) {
        if (rawIndex >= getTailOffset(list._capacity)) {
          return list._tail;
        }
        if (rawIndex < 1 << list._level + SHIFT) {
          var node = list._root;
          var level = list._level;
          while (node && level > 0) {
            node = node.array[rawIndex >>> level & MASK];
            level -= SHIFT;
          }
          return node;
        }
      }
      function validateListBoundsRequest(list, begin, end) {
        var requestedOrigin = list._origin + (begin === void 0 ? 0 : begin);
        var requestedCapacity = end === void 0 ? list._capacity : end < 0 ? list._capacity + end : list._origin + end;
        if (Number.isFinite(requestedCapacity) && requestedCapacity > MAX_LIST_SIZE || Number.isFinite(requestedOrigin) && requestedOrigin < -MAX_LIST_SIZE || Number.isFinite(requestedCapacity) && Number.isFinite(requestedOrigin) && requestedCapacity - requestedOrigin > MAX_LIST_SIZE) {
          throw new RangeError(
            "Invalid List size: a List cannot hold more than " + MAX_LIST_SIZE + " (2 ** 30) values."
          );
        }
      }
      function setListBounds(list, begin, end) {
        validateListBoundsRequest(list, begin, end);
        if (begin !== void 0) {
          begin |= 0;
        }
        if (end !== void 0) {
          end |= 0;
        }
        var owner = list.__ownerID || new OwnerID();
        var oldOrigin = list._origin;
        var oldCapacity = list._capacity;
        var newOrigin = oldOrigin + begin;
        var newCapacity = end === void 0 ? oldCapacity : end < 0 ? oldCapacity + end : oldOrigin + end;
        if (newOrigin === oldOrigin && newCapacity === oldCapacity) {
          return list;
        }
        if (newOrigin >= newCapacity) {
          return list.clear();
        }
        var newLevel = list._level;
        var newRoot = list._root;
        var offsetShift = 0;
        while (newOrigin + offsetShift < 0) {
          newRoot = new VNode(
            newRoot && newRoot.array.length ? [void 0, newRoot] : [],
            owner
          );
          newLevel += SHIFT;
          offsetShift += levelCapacity(newLevel);
        }
        if (offsetShift) {
          newOrigin += offsetShift;
          oldOrigin += offsetShift;
          newCapacity += offsetShift;
          oldCapacity += offsetShift;
        }
        var oldTailOffset = getTailOffset(oldCapacity);
        var newTailOffset = getTailOffset(newCapacity);
        while (newTailOffset >= levelCapacity(newLevel + SHIFT)) {
          newRoot = new VNode(
            newRoot && newRoot.array.length ? [newRoot] : [],
            owner
          );
          newLevel += SHIFT;
        }
        var oldTail = list._tail;
        var newTail = newTailOffset < oldTailOffset ? listNodeFor(list, newCapacity - 1) : newTailOffset > oldTailOffset ? new VNode([], owner) : oldTail;
        if (oldTail && newTailOffset > oldTailOffset && newOrigin < oldCapacity && oldTail.array.length) {
          newRoot = editableVNode(newRoot, owner);
          var node = newRoot;
          for (var level = newLevel; level > SHIFT; level -= SHIFT) {
            var idx = oldTailOffset >>> level & MASK;
            node = node.array[idx] = editableVNode(node.array[idx], owner);
          }
          node.array[oldTailOffset >>> SHIFT & MASK] = oldTail;
        }
        if (newCapacity < oldCapacity) {
          newTail = newTail && newTail.removeAfter(owner, 0, newCapacity);
        }
        if (newOrigin >= newTailOffset) {
          newOrigin -= newTailOffset;
          newCapacity -= newTailOffset;
          newLevel = SHIFT;
          newRoot = void 0;
          newTail = newTail && newTail.removeBefore(owner, 0, newOrigin);
        } else if (newOrigin > oldOrigin || newTailOffset < oldTailOffset) {
          offsetShift = 0;
          while (newRoot) {
            var beginIndex = newOrigin >>> newLevel & MASK;
            if (beginIndex !== newTailOffset >>> newLevel & MASK) {
              break;
            }
            if (beginIndex) {
              offsetShift += (1 << newLevel) * beginIndex;
            }
            newLevel -= SHIFT;
            newRoot = newRoot.array[beginIndex];
          }
          if (newRoot && newOrigin > oldOrigin) {
            newRoot = newRoot.removeBefore(owner, newLevel, newOrigin - offsetShift);
          }
          if (newRoot && newTailOffset < oldTailOffset) {
            newRoot = newRoot.removeAfter(
              owner,
              newLevel,
              newTailOffset - offsetShift
            );
          }
          if (offsetShift) {
            newOrigin -= offsetShift;
            newCapacity -= offsetShift;
          }
        }
        if (list.__ownerID) {
          list.size = newCapacity - newOrigin;
          list._origin = newOrigin;
          list._capacity = newCapacity;
          list._level = newLevel;
          list._root = newRoot;
          list._tail = newTail;
          list.__hash = void 0;
          list.__altered = true;
          return list;
        }
        return makeList(newOrigin, newCapacity, newLevel, newRoot, newTail);
      }
      function getTailOffset(size) {
        return size < SIZE ? 0 : size - 1 >>> SHIFT << SHIFT;
      }
      var MAX_LIST_SIZE = Math.pow(2, 30);
      function levelCapacity(exp) {
        return exp < 31 ? 1 << exp : Math.pow(2, exp);
      }
      function isOrderedMap(maybeOrderedMap) {
        return isMap(maybeOrderedMap) && isOrdered(maybeOrderedMap);
      }
      var OrderedMap = /* @__PURE__ */ (function(Map3) {
        function OrderedMap2(value2) {
          return value2 === void 0 || value2 === null ? emptyOrderedMap() : isOrderedMap(value2) ? value2 : emptyOrderedMap().withMutations(function(map) {
            var iter = KeyedCollection(value2);
            assertNotInfinite(iter.size);
            iter.forEach(function(v, k) {
              return map.set(k, v);
            });
          });
        }
        if (Map3) OrderedMap2.__proto__ = Map3;
        OrderedMap2.prototype = Object.create(Map3 && Map3.prototype);
        OrderedMap2.prototype.constructor = OrderedMap2;
        OrderedMap2.of = function of() {
          return this(arguments);
        };
        OrderedMap2.prototype.toString = function toString2() {
          return this.__toString("OrderedMap {", "}");
        };
        OrderedMap2.prototype.get = function get2(k, notSetValue) {
          var index = this._map.get(k);
          return index !== void 0 ? this._list.get(index)[1] : notSetValue;
        };
        OrderedMap2.prototype.clear = function clear() {
          if (this.size === 0) {
            return this;
          }
          if (this.__ownerID) {
            this.size = 0;
            this._map.clear();
            this._list.clear();
            this.__altered = true;
            return this;
          }
          return emptyOrderedMap();
        };
        OrderedMap2.prototype.set = function set2(k, v) {
          return updateOrderedMap(this, k, v);
        };
        OrderedMap2.prototype.remove = function remove2(k) {
          return updateOrderedMap(this, k, NOT_SET);
        };
        OrderedMap2.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          return this._list.__iterate(
            function(entry) {
              return entry && fn(entry[1], entry[0], this$1$1);
            },
            reverse
          );
        };
        OrderedMap2.prototype.__iterator = function __iterator(type, reverse) {
          return this._list.fromEntrySeq().__iterator(type, reverse);
        };
        OrderedMap2.prototype.__ensureOwner = function __ensureOwner(ownerID) {
          if (ownerID === this.__ownerID) {
            return this;
          }
          var newMap = this._map.__ensureOwner(ownerID);
          var newList = this._list.__ensureOwner(ownerID);
          if (!ownerID) {
            if (this.size === 0) {
              return emptyOrderedMap();
            }
            this.__ownerID = ownerID;
            this.__altered = false;
            this._map = newMap;
            this._list = newList;
            return this;
          }
          return makeOrderedMap(newMap, newList, ownerID, this.__hash);
        };
        return OrderedMap2;
      })(Map2);
      OrderedMap.isOrderedMap = isOrderedMap;
      OrderedMap.prototype[IS_ORDERED_SYMBOL] = true;
      OrderedMap.prototype[DELETE] = OrderedMap.prototype.remove;
      function makeOrderedMap(map, list, ownerID, hash2) {
        var omap = Object.create(OrderedMap.prototype);
        omap.size = map ? map.size : 0;
        omap._map = map;
        omap._list = list;
        omap.__ownerID = ownerID;
        omap.__hash = hash2;
        omap.__altered = false;
        return omap;
      }
      var EMPTY_ORDERED_MAP;
      function emptyOrderedMap() {
        return EMPTY_ORDERED_MAP || (EMPTY_ORDERED_MAP = makeOrderedMap(emptyMap(), emptyList()));
      }
      function updateOrderedMap(omap, k, v) {
        var map = omap._map;
        var list = omap._list;
        var i = map.get(k);
        var has2 = i !== void 0;
        var newMap;
        var newList;
        if (v === NOT_SET) {
          if (!has2) {
            return omap;
          }
          if (list.size >= SIZE && list.size >= map.size * 2) {
            newList = list.filter(function(entry, idx) {
              return entry !== void 0 && i !== idx;
            });
            newMap = newList.toKeyedSeq().map(function(entry) {
              return entry[0];
            }).flip().toMap();
            if (omap.__ownerID) {
              newMap.__ownerID = newList.__ownerID = omap.__ownerID;
            }
          } else {
            newMap = map.remove(k);
            newList = i === list.size - 1 ? list.pop() : list.set(i, void 0);
          }
        } else if (has2) {
          if (v === list.get(i)[1]) {
            return omap;
          }
          newMap = map;
          newList = list.set(i, [k, v]);
        } else {
          newMap = map.set(k, list.size);
          newList = list.set(list.size, [k, v]);
        }
        if (omap.__ownerID) {
          omap.size = newMap.size;
          omap._map = newMap;
          omap._list = newList;
          omap.__hash = void 0;
          omap.__altered = true;
          return omap;
        }
        return makeOrderedMap(newMap, newList);
      }
      var IS_STACK_SYMBOL = "@@__IMMUTABLE_STACK__@@";
      function isStack(maybeStack) {
        return Boolean(maybeStack && // @ts-expect-error: maybeStack is typed as `{}`, need to change in 6.0 to `maybeStack && typeof maybeStack === 'object' && MAYBE_STACK_SYMBOL in maybeStack`
        maybeStack[IS_STACK_SYMBOL]);
      }
      var Stack = /* @__PURE__ */ (function(IndexedCollection2) {
        function Stack2(value2) {
          return value2 === void 0 || value2 === null ? emptyStack() : isStack(value2) ? value2 : emptyStack().pushAll(value2);
        }
        if (IndexedCollection2) Stack2.__proto__ = IndexedCollection2;
        Stack2.prototype = Object.create(IndexedCollection2 && IndexedCollection2.prototype);
        Stack2.prototype.constructor = Stack2;
        Stack2.of = function of() {
          return this(arguments);
        };
        Stack2.prototype.toString = function toString2() {
          return this.__toString("Stack [", "]");
        };
        Stack2.prototype.get = function get2(index, notSetValue) {
          var head = this._head;
          index = wrapIndex(this, index);
          while (head && index--) {
            head = head.next;
          }
          return head ? head.value : notSetValue;
        };
        Stack2.prototype.peek = function peek() {
          return this._head && this._head.value;
        };
        Stack2.prototype.push = function push() {
          var arguments$1 = arguments;
          if (arguments.length === 0) {
            return this;
          }
          var newSize = this.size + arguments.length;
          var head = this._head;
          for (var ii = arguments.length - 1; ii >= 0; ii--) {
            head = {
              value: arguments$1[ii],
              next: head
            };
          }
          if (this.__ownerID) {
            this.size = newSize;
            this._head = head;
            this.__hash = void 0;
            this.__altered = true;
            return this;
          }
          return makeStack(newSize, head);
        };
        Stack2.prototype.pushAll = function pushAll(iter) {
          iter = IndexedCollection2(iter);
          if (iter.size === 0) {
            return this;
          }
          if (this.size === 0 && isStack(iter)) {
            return iter;
          }
          assertNotInfinite(iter.size);
          var newSize = this.size;
          var head = this._head;
          iter.__iterate(
            function(value2) {
              newSize++;
              head = {
                value: value2,
                next: head
              };
            },
            /* reverse */
            true
          );
          if (this.__ownerID) {
            this.size = newSize;
            this._head = head;
            this.__hash = void 0;
            this.__altered = true;
            return this;
          }
          return makeStack(newSize, head);
        };
        Stack2.prototype.pop = function pop() {
          return this.slice(1);
        };
        Stack2.prototype.clear = function clear() {
          if (this.size === 0) {
            return this;
          }
          if (this.__ownerID) {
            this.size = 0;
            this._head = void 0;
            this.__hash = void 0;
            this.__altered = true;
            return this;
          }
          return emptyStack();
        };
        Stack2.prototype.slice = function slice(begin, end) {
          if (wholeSlice(begin, end, this.size)) {
            return this;
          }
          var resolvedBegin = resolveBegin(begin, this.size);
          var resolvedEnd = resolveEnd(end, this.size);
          if (resolvedEnd !== this.size) {
            return IndexedCollection2.prototype.slice.call(this, begin, end);
          }
          var newSize = this.size - resolvedBegin;
          var head = this._head;
          while (resolvedBegin--) {
            head = head.next;
          }
          if (this.__ownerID) {
            this.size = newSize;
            this._head = head;
            this.__hash = void 0;
            this.__altered = true;
            return this;
          }
          return makeStack(newSize, head);
        };
        Stack2.prototype.__ensureOwner = function __ensureOwner(ownerID) {
          if (ownerID === this.__ownerID) {
            return this;
          }
          if (!ownerID) {
            if (this.size === 0) {
              return emptyStack();
            }
            this.__ownerID = ownerID;
            this.__altered = false;
            return this;
          }
          return makeStack(this.size, this._head, ownerID, this.__hash);
        };
        Stack2.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          if (reverse) {
            return new ArraySeq(this.toArray()).__iterate(
              function(v, k) {
                return fn(v, k, this$1$1);
              },
              reverse
            );
          }
          var iterations = 0;
          var node = this._head;
          while (node) {
            if (fn(node.value, iterations++, this) === false) {
              break;
            }
            node = node.next;
          }
          return iterations;
        };
        Stack2.prototype.__iterator = function __iterator(type, reverse) {
          if (reverse) {
            return new ArraySeq(this.toArray()).__iterator(type, reverse);
          }
          var iterations = 0;
          var node = this._head;
          return new Iterator(function() {
            if (node) {
              var value2 = node.value;
              node = node.next;
              return iteratorValue(type, iterations++, value2);
            }
            return iteratorDone();
          });
        };
        return Stack2;
      })(IndexedCollection);
      Stack.isStack = isStack;
      var StackPrototype = Stack.prototype;
      StackPrototype[IS_STACK_SYMBOL] = true;
      StackPrototype.shift = StackPrototype.pop;
      StackPrototype.unshift = StackPrototype.push;
      StackPrototype.unshiftAll = StackPrototype.pushAll;
      StackPrototype.withMutations = withMutations;
      StackPrototype.wasAltered = wasAltered;
      StackPrototype.asImmutable = asImmutable;
      StackPrototype["@@transducer/init"] = StackPrototype.asMutable = asMutable;
      StackPrototype["@@transducer/step"] = function(result, arr) {
        return result.unshift(arr);
      };
      StackPrototype["@@transducer/result"] = function(obj) {
        return obj.asImmutable();
      };
      function makeStack(size, head, ownerID, hash2) {
        var map = Object.create(StackPrototype);
        map.size = size;
        map._head = head;
        map.__ownerID = ownerID;
        map.__hash = hash2;
        map.__altered = false;
        return map;
      }
      var EMPTY_STACK;
      function emptyStack() {
        return EMPTY_STACK || (EMPTY_STACK = makeStack(0));
      }
      function reduce(collection, reducer, reduction, context, useFirst, reverse) {
        assertNotInfinite(collection.size);
        collection.__iterate(function(v, k, c) {
          if (useFirst) {
            useFirst = false;
            reduction = v;
          } else {
            reduction = reducer.call(context, reduction, v, k, c);
          }
        }, reverse);
        return reduction;
      }
      function keyMapper(v, k) {
        return k;
      }
      function entryMapper(v, k) {
        return [k, v];
      }
      function not(predicate) {
        return function() {
          var args = [], len = arguments.length;
          while (len--) args[len] = arguments[len];
          return !predicate.apply(this, args);
        };
      }
      function neg(predicate) {
        return function() {
          var args = [], len = arguments.length;
          while (len--) args[len] = arguments[len];
          return -predicate.apply(this, args);
        };
      }
      function defaultNegComparator(a, b) {
        return a < b ? 1 : a > b ? -1 : 0;
      }
      function deepEqual(a, b) {
        if (a === b) {
          return true;
        }
        if (!isCollection(b) || // @ts-expect-error size should exists on Collection
        a.size !== void 0 && b.size !== void 0 && a.size !== b.size || // @ts-expect-error __hash exists on Collection
        a.__hash !== void 0 && // @ts-expect-error __hash exists on Collection
        b.__hash !== void 0 && // @ts-expect-error __hash exists on Collection
        a.__hash !== b.__hash || isKeyed(a) !== isKeyed(b) || isIndexed(a) !== isIndexed(b) || // @ts-expect-error Range extends Collection, which implements [Symbol.iterator], so it is valid
        isOrdered(a) !== isOrdered(b)) {
          return false;
        }
        if (a.size === 0 && b.size === 0) {
          return true;
        }
        var notAssociative = !isAssociative(a);
        if (isOrdered(a)) {
          var entries = a.entries();
          return b.every(function(v, k) {
            var entry = entries.next().value;
            return entry && is(entry[1], v) && (notAssociative || is(entry[0], k));
          }) && entries.next().done;
        }
        var flipped = false;
        if (a.size === void 0) {
          if (b.size === void 0) {
            if (typeof a.cacheResult === "function") {
              a.cacheResult();
            }
          } else {
            flipped = true;
            var _ = a;
            a = b;
            b = _;
          }
        }
        var allEqual = true;
        var bSize = (
          // @ts-expect-error b is Range | Repeat | Collection<unknown, unknown> as it may have been flipped, and __iterate is valid
          b.__iterate(function(v, k) {
            if (notAssociative ? (
              // @ts-expect-error has exists on Collection
              !a.has(v)
            ) : flipped ? (
              // @ts-expect-error type of `get` does not "catch" the version with `notSetValue`
              !is(v, a.get(k, NOT_SET))
            ) : (
              // @ts-expect-error type of `get` does not "catch" the version with `notSetValue`
              !is(a.get(k, NOT_SET), v)
            )) {
              allEqual = false;
              return false;
            }
          })
        );
        return allEqual && // @ts-expect-error size should exists on Collection
        a.size === bSize;
      }
      var Range = /* @__PURE__ */ (function(IndexedSeq2) {
        function Range2(start, end, step) {
          if (step === void 0) step = 1;
          if (!(this instanceof Range2)) {
            return new Range2(start, end, step);
          }
          invariant(step !== 0, "Cannot step a Range by 0");
          invariant(
            start !== void 0,
            "You must define a start value when using Range"
          );
          invariant(
            end !== void 0,
            "You must define an end value when using Range"
          );
          step = Math.abs(step);
          if (end < start) {
            step = -step;
          }
          this._start = start;
          this._end = end;
          this._step = step;
          this.size = Math.max(0, Math.ceil((end - start) / step - 1) + 1);
          if (this.size === 0) {
            if (EMPTY_RANGE) {
              return EMPTY_RANGE;
            }
            EMPTY_RANGE = this;
          }
        }
        if (IndexedSeq2) Range2.__proto__ = IndexedSeq2;
        Range2.prototype = Object.create(IndexedSeq2 && IndexedSeq2.prototype);
        Range2.prototype.constructor = Range2;
        Range2.prototype.toString = function toString2() {
          return this.size === 0 ? "Range []" : "Range [ " + this._start + "..." + this._end + (this._step !== 1 ? " by " + this._step : "") + " ]";
        };
        Range2.prototype.get = function get2(index, notSetValue) {
          return this.has(index) ? this._start + wrapIndex(this, index) * this._step : notSetValue;
        };
        Range2.prototype.includes = function includes(searchValue) {
          var possibleIndex = (searchValue - this._start) / this._step;
          return possibleIndex >= 0 && possibleIndex < this.size && possibleIndex === Math.floor(possibleIndex);
        };
        Range2.prototype.slice = function slice(begin, end) {
          if (wholeSlice(begin, end, this.size)) {
            return this;
          }
          begin = resolveBegin(begin, this.size);
          end = resolveEnd(end, this.size);
          if (end <= begin) {
            return new Range2(0, 0);
          }
          return new Range2(
            this.get(begin, this._end),
            this.get(end, this._end),
            this._step
          );
        };
        Range2.prototype.indexOf = function indexOf(searchValue) {
          var offsetValue = searchValue - this._start;
          if (offsetValue % this._step === 0) {
            var index = offsetValue / this._step;
            if (index >= 0 && index < this.size) {
              return index;
            }
          }
          return -1;
        };
        Range2.prototype.lastIndexOf = function lastIndexOf(searchValue) {
          return this.indexOf(searchValue);
        };
        Range2.prototype.__iterate = function __iterate(fn, reverse) {
          var size = this.size;
          var step = this._step;
          var value2 = reverse ? this._start + (size - 1) * step : this._start;
          var i = 0;
          while (i !== size) {
            if (fn(value2, reverse ? size - ++i : i++, this) === false) {
              break;
            }
            value2 += reverse ? -step : step;
          }
          return i;
        };
        Range2.prototype.__iterator = function __iterator(type, reverse) {
          var size = this.size;
          var step = this._step;
          var value2 = reverse ? this._start + (size - 1) * step : this._start;
          var i = 0;
          return new Iterator(function() {
            if (i === size) {
              return iteratorDone();
            }
            var v = value2;
            value2 += reverse ? -step : step;
            return iteratorValue(type, reverse ? size - ++i : i++, v);
          });
        };
        Range2.prototype.equals = function equals(other) {
          return other instanceof Range2 ? this._start === other._start && this._end === other._end && this._step === other._step : deepEqual(this, other);
        };
        return Range2;
      })(IndexedSeq);
      var EMPTY_RANGE;
      var IS_SET_SYMBOL = "@@__IMMUTABLE_SET__@@";
      function isSet(maybeSet) {
        return Boolean(maybeSet && // @ts-expect-error: maybeSet is typed as `{}`,  need to change in 6.0 to `maybeSeq && typeof maybeSet === 'object' && MAYBE_SET_SYMBOL in maybeSet`
        maybeSet[IS_SET_SYMBOL]);
      }
      var Set2 = /* @__PURE__ */ (function(SetCollection2) {
        function Set3(value2) {
          return value2 === void 0 || value2 === null ? emptySet() : isSet(value2) && !isOrdered(value2) ? value2 : emptySet().withMutations(function(set2) {
            var iter = SetCollection2(value2);
            assertNotInfinite(iter.size);
            iter.forEach(function(v) {
              return set2.add(v);
            });
          });
        }
        if (SetCollection2) Set3.__proto__ = SetCollection2;
        Set3.prototype = Object.create(SetCollection2 && SetCollection2.prototype);
        Set3.prototype.constructor = Set3;
        Set3.of = function of() {
          return this(arguments);
        };
        Set3.fromKeys = function fromKeys(value2) {
          return this(KeyedCollection(value2).keySeq());
        };
        Set3.intersect = function intersect(sets) {
          sets = Collection(sets).toArray();
          return sets.length ? SetPrototype.intersect.apply(Set3(sets.pop()), sets) : emptySet();
        };
        Set3.union = function union(sets) {
          sets = Collection(sets).toArray();
          return sets.length ? SetPrototype.union.apply(Set3(sets.pop()), sets) : emptySet();
        };
        Set3.prototype.toString = function toString2() {
          return this.__toString("Set {", "}");
        };
        Set3.prototype.has = function has2(value2) {
          return this._map.has(value2);
        };
        Set3.prototype.add = function add(value2) {
          return updateSet(this, this._map.set(value2, value2));
        };
        Set3.prototype.remove = function remove2(value2) {
          return updateSet(this, this._map.remove(value2));
        };
        Set3.prototype.clear = function clear() {
          return updateSet(this, this._map.clear());
        };
        Set3.prototype.map = function map(mapper, context) {
          var this$1$1 = this;
          var didChanges = false;
          var newMap = updateSet(
            this,
            this._map.mapEntries(function(ref) {
              var v = ref[1];
              var mapped = mapper.call(context, v, v, this$1$1);
              if (mapped !== v) {
                didChanges = true;
              }
              return [mapped, mapped];
            }, context)
          );
          return didChanges ? newMap : this;
        };
        Set3.prototype.union = function union() {
          var iters = [], len = arguments.length;
          while (len--) iters[len] = arguments[len];
          iters = iters.filter(function(x) {
            return x.size !== 0;
          });
          if (iters.length === 0) {
            return this;
          }
          if (this.size === 0 && !this.__ownerID && iters.length === 1) {
            return this.constructor(iters[0]);
          }
          return this.withMutations(function(set2) {
            for (var ii = 0; ii < iters.length; ii++) {
              if (typeof iters[ii] === "string") {
                set2.add(iters[ii]);
              } else {
                SetCollection2(iters[ii]).forEach(function(value2) {
                  return set2.add(value2);
                });
              }
            }
          });
        };
        Set3.prototype.intersect = function intersect() {
          var iters = [], len = arguments.length;
          while (len--) iters[len] = arguments[len];
          if (iters.length === 0) {
            return this;
          }
          iters = iters.map(function(iter) {
            return SetCollection2(iter);
          });
          var toRemove = [];
          this.forEach(function(value2) {
            if (!iters.every(function(iter) {
              return iter.includes(value2);
            })) {
              toRemove.push(value2);
            }
          });
          return this.withMutations(function(set2) {
            toRemove.forEach(function(value2) {
              set2.remove(value2);
            });
          });
        };
        Set3.prototype.subtract = function subtract() {
          var iters = [], len = arguments.length;
          while (len--) iters[len] = arguments[len];
          if (iters.length === 0) {
            return this;
          }
          iters = iters.map(function(iter) {
            return SetCollection2(iter);
          });
          var toRemove = [];
          this.forEach(function(value2) {
            if (iters.some(function(iter) {
              return iter.includes(value2);
            })) {
              toRemove.push(value2);
            }
          });
          return this.withMutations(function(set2) {
            toRemove.forEach(function(value2) {
              set2.remove(value2);
            });
          });
        };
        Set3.prototype.sort = function sort(comparator) {
          return OrderedSet(sortFactory(this, comparator));
        };
        Set3.prototype.sortBy = function sortBy(mapper, comparator) {
          return OrderedSet(sortFactory(this, comparator, mapper));
        };
        Set3.prototype.wasAltered = function wasAltered2() {
          return this._map.wasAltered();
        };
        Set3.prototype.__iterate = function __iterate(fn, reverse) {
          var this$1$1 = this;
          return this._map.__iterate(function(k) {
            return fn(k, k, this$1$1);
          }, reverse);
        };
        Set3.prototype.__iterator = function __iterator(type, reverse) {
          return this._map.__iterator(type, reverse);
        };
        Set3.prototype.__ensureOwner = function __ensureOwner(ownerID) {
          if (ownerID === this.__ownerID) {
            return this;
          }
          var newMap = this._map.__ensureOwner(ownerID);
          if (!ownerID) {
            if (this.size === 0) {
              return this.__empty();
            }
            this.__ownerID = ownerID;
            this._map = newMap;
            return this;
          }
          return this.__make(newMap, ownerID);
        };
        return Set3;
      })(SetCollection);
      Set2.isSet = isSet;
      var SetPrototype = Set2.prototype;
      SetPrototype[IS_SET_SYMBOL] = true;
      SetPrototype[DELETE] = SetPrototype.remove;
      SetPrototype.merge = SetPrototype.concat = SetPrototype.union;
      SetPrototype.withMutations = withMutations;
      SetPrototype.asImmutable = asImmutable;
      SetPrototype["@@transducer/init"] = SetPrototype.asMutable = asMutable;
      SetPrototype["@@transducer/step"] = function(result, arr) {
        return result.add(arr);
      };
      SetPrototype["@@transducer/result"] = function(obj) {
        return obj.asImmutable();
      };
      SetPrototype.__empty = emptySet;
      SetPrototype.__make = makeSet;
      function updateSet(set2, newMap) {
        if (set2.__ownerID) {
          set2.size = newMap.size;
          set2._map = newMap;
          return set2;
        }
        return newMap === set2._map ? set2 : newMap.size === 0 ? set2.__empty() : set2.__make(newMap);
      }
      function makeSet(map, ownerID) {
        var set2 = Object.create(SetPrototype);
        set2.size = map ? map.size : 0;
        set2._map = map;
        set2.__ownerID = ownerID;
        return set2;
      }
      var EMPTY_SET;
      function emptySet() {
        return EMPTY_SET || (EMPTY_SET = makeSet(emptyMap()));
      }
      function getIn$1(collection, searchKeyPath, notSetValue) {
        var keyPath = coerceKeyPath(searchKeyPath);
        var i = 0;
        while (i !== keyPath.length) {
          collection = get(collection, keyPath[i++], NOT_SET);
          if (collection === NOT_SET) {
            return notSetValue;
          }
        }
        return collection;
      }
      function getIn(searchKeyPath, notSetValue) {
        return getIn$1(this, searchKeyPath, notSetValue);
      }
      function hasIn$1(collection, keyPath) {
        return getIn$1(collection, keyPath, NOT_SET) !== NOT_SET;
      }
      function hasIn(searchKeyPath) {
        return hasIn$1(this, searchKeyPath);
      }
      function toObject() {
        assertNotInfinite(this.size);
        var object = {};
        this.__iterate(function(v, k) {
          if (isProtoKey(k)) {
            return;
          }
          object[k] = v;
        });
        return object;
      }
      function toJS(value2) {
        if (!value2 || typeof value2 !== "object") {
          return value2;
        }
        if (!isCollection(value2)) {
          if (!isDataStructure(value2)) {
            return value2;
          }
          value2 = Seq(value2);
        }
        if (isKeyed(value2)) {
          var result$1 = {};
          value2.__iterate(function(v, k) {
            if (isProtoKey(k)) {
              return;
            }
            result$1[k] = toJS(v);
          });
          return result$1;
        }
        var result = [];
        value2.__iterate(function(v) {
          result.push(toJS(v));
        });
        return result;
      }
      function hashCollection(collection) {
        if (collection.size === Infinity) {
          return 0;
        }
        var ordered = isOrdered(collection);
        var keyed = isKeyed(collection);
        var h = ordered ? 1 : 0;
        collection.__iterate(keyed ? ordered ? function(v, k) {
          h = 31 * h + hashMerge(hash(v), hash(k)) | 0;
        } : function(v, k) {
          h = h + hashMerge(hash(v), hash(k)) | 0;
        } : ordered ? function(v) {
          h = 31 * h + hash(v) | 0;
        } : function(v) {
          h = h + hash(v) | 0;
        });
        return murmurHashOfSize(collection.size, h);
      }
      function murmurHashOfSize(size, h) {
        h = imul(h, 3432918353);
        h = imul(h << 15 | h >>> -15, 461845907);
        h = imul(h << 13 | h >>> -13, 5);
        h = (h + 3864292196 | 0) ^ size;
        h = imul(h ^ h >>> 16, 2246822507);
        h = imul(h ^ h >>> 13, 3266489909);
        h = smi(h ^ h >>> 16);
        return h;
      }
      function hashMerge(a, b) {
        return a ^ b + 2654435769 + (a << 6) + (a >> 2) | 0;
      }
      function mixin(ctor, methods) {
        var keyCopier = function(key2) {
          ctor.prototype[key2] = methods[key2];
        };
        Object.keys(methods).forEach(keyCopier);
        Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(methods).forEach(keyCopier);
        return ctor;
      }
      Collection.Iterator = Iterator;
      mixin(Collection, {
        // ### Conversion to other types
        toArray: function toArray() {
          assertNotInfinite(this.size);
          var array = new Array(this.size || 0);
          var useTuples = isKeyed(this);
          var i = 0;
          this.__iterate(function(v, k) {
            array[i++] = useTuples ? [k, v] : v;
          });
          return array;
        },
        toIndexedSeq: function toIndexedSeq() {
          return new ToIndexedSequence(this);
        },
        toJS: function toJS$1() {
          return toJS(this);
        },
        toKeyedSeq: function toKeyedSeq() {
          return new ToKeyedSequence(this, true);
        },
        toMap: function toMap() {
          return Map2(this.toKeyedSeq());
        },
        toObject,
        toOrderedMap: function toOrderedMap() {
          return OrderedMap(this.toKeyedSeq());
        },
        toOrderedSet: function toOrderedSet() {
          return OrderedSet(isKeyed(this) ? this.valueSeq() : this);
        },
        toSet: function toSet() {
          return Set2(isKeyed(this) ? this.valueSeq() : this);
        },
        toSetSeq: function toSetSeq() {
          return new ToSetSequence(this);
        },
        toSeq: function toSeq() {
          return isIndexed(this) ? this.toIndexedSeq() : isKeyed(this) ? this.toKeyedSeq() : this.toSetSeq();
        },
        toStack: function toStack() {
          return Stack(isKeyed(this) ? this.valueSeq() : this);
        },
        toList: function toList() {
          return List(isKeyed(this) ? this.valueSeq() : this);
        },
        // ### Common JavaScript methods and properties
        toString: function toString2() {
          return "[Collection]";
        },
        __toString: function __toString(head, tail) {
          if (this.size === 0) {
            return head + tail;
          }
          return head + " " + this.toSeq().map(this.__toStringMapper).join(", ") + " " + tail;
        },
        // ### ES6 Collection methods (ES6 Array and Map)
        concat: function concat() {
          var values = [], len = arguments.length;
          while (len--) values[len] = arguments[len];
          return reify(this, concatFactory(this, values));
        },
        includes: function includes(searchValue) {
          return this.some(function(value2) {
            return is(value2, searchValue);
          });
        },
        entries: function entries() {
          return this.__iterator(ITERATE_ENTRIES);
        },
        every: function every(predicate, context) {
          assertNotInfinite(this.size);
          var returnValue = true;
          this.__iterate(function(v, k, c) {
            if (!predicate.call(context, v, k, c)) {
              returnValue = false;
              return false;
            }
          });
          return returnValue;
        },
        filter: function filter(predicate, context) {
          return reify(this, filterFactory(this, predicate, context, true));
        },
        partition: function partition(predicate, context) {
          return partitionFactory(this, predicate, context);
        },
        find: function find(predicate, context, notSetValue) {
          var entry = this.findEntry(predicate, context);
          return entry ? entry[1] : notSetValue;
        },
        forEach: function forEach(sideEffect, context) {
          assertNotInfinite(this.size);
          return this.__iterate(context ? sideEffect.bind(context) : sideEffect);
        },
        join: function join(separator) {
          assertNotInfinite(this.size);
          separator = separator !== void 0 ? "" + separator : ",";
          var joined = "";
          var isFirst = true;
          this.__iterate(function(v) {
            isFirst ? isFirst = false : joined += separator;
            joined += v !== null && v !== void 0 ? v.toString() : "";
          });
          return joined;
        },
        keys: function keys() {
          return this.__iterator(ITERATE_KEYS);
        },
        map: function map(mapper, context) {
          return reify(this, mapFactory(this, mapper, context));
        },
        reduce: function reduce$1(reducer, initialReduction, context) {
          return reduce(
            this,
            reducer,
            initialReduction,
            context,
            arguments.length < 2,
            false
          );
        },
        reduceRight: function reduceRight(reducer, initialReduction, context) {
          return reduce(
            this,
            reducer,
            initialReduction,
            context,
            arguments.length < 2,
            true
          );
        },
        reverse: function reverse() {
          return reify(this, reverseFactory(this, true));
        },
        slice: function slice(begin, end) {
          return reify(this, sliceFactory(this, begin, end, true));
        },
        some: function some(predicate, context) {
          assertNotInfinite(this.size);
          var returnValue = false;
          this.__iterate(function(v, k, c) {
            if (predicate.call(context, v, k, c)) {
              returnValue = true;
              return false;
            }
          });
          return returnValue;
        },
        sort: function sort(comparator) {
          return reify(this, sortFactory(this, comparator));
        },
        values: function values() {
          return this.__iterator(ITERATE_VALUES);
        },
        // ### More sequential methods
        butLast: function butLast() {
          return this.slice(0, -1);
        },
        isEmpty: function isEmpty() {
          return this.size !== void 0 ? this.size === 0 : !this.some(function() {
            return true;
          });
        },
        count: function count(predicate, context) {
          return ensureSize(
            predicate ? this.toSeq().filter(predicate, context) : this
          );
        },
        countBy: function countBy(grouper, context) {
          return countByFactory(this, grouper, context);
        },
        equals: function equals(other) {
          return deepEqual(this, other);
        },
        entrySeq: function entrySeq() {
          var collection = this;
          if (collection._cache) {
            return new ArraySeq(collection._cache);
          }
          var entriesSequence = collection.toSeq().map(entryMapper).toIndexedSeq();
          entriesSequence.fromEntrySeq = function() {
            return collection.toSeq();
          };
          return entriesSequence;
        },
        filterNot: function filterNot(predicate, context) {
          return this.filter(not(predicate), context);
        },
        findEntry: function findEntry(predicate, context, notSetValue) {
          var found = notSetValue;
          this.__iterate(function(v, k, c) {
            if (predicate.call(context, v, k, c)) {
              found = [k, v];
              return false;
            }
          });
          return found;
        },
        findKey: function findKey(predicate, context) {
          var entry = this.findEntry(predicate, context);
          return entry && entry[0];
        },
        findLast: function findLast(predicate, context, notSetValue) {
          return this.toKeyedSeq().reverse().find(predicate, context, notSetValue);
        },
        findLastEntry: function findLastEntry(predicate, context, notSetValue) {
          return this.toKeyedSeq().reverse().findEntry(predicate, context, notSetValue);
        },
        findLastKey: function findLastKey(predicate, context) {
          return this.toKeyedSeq().reverse().findKey(predicate, context);
        },
        first: function first(notSetValue) {
          return this.find(returnTrue, null, notSetValue);
        },
        flatMap: function flatMap(mapper, context) {
          return reify(this, flatMapFactory(this, mapper, context));
        },
        flatten: function flatten(depth) {
          return reify(this, flattenFactory(this, depth, true));
        },
        fromEntrySeq: function fromEntrySeq() {
          return new FromEntriesSequence(this);
        },
        get: function get2(searchKey, notSetValue) {
          return this.find(function(_, key2) {
            return is(key2, searchKey);
          }, void 0, notSetValue);
        },
        getIn,
        groupBy: function groupBy(grouper, context) {
          return groupByFactory(this, grouper, context);
        },
        has: function has2(searchKey) {
          return this.get(searchKey, NOT_SET) !== NOT_SET;
        },
        hasIn,
        isSubset: function isSubset(iter) {
          iter = typeof iter.includes === "function" ? iter : Collection(iter);
          return this.every(function(value2) {
            return iter.includes(value2);
          });
        },
        isSuperset: function isSuperset(iter) {
          iter = typeof iter.isSubset === "function" ? iter : Collection(iter);
          return iter.isSubset(this);
        },
        keyOf: function keyOf(searchValue) {
          return this.findKey(function(value2) {
            return is(value2, searchValue);
          });
        },
        keySeq: function keySeq() {
          return this.toSeq().map(keyMapper).toIndexedSeq();
        },
        last: function last(notSetValue) {
          return this.toSeq().reverse().first(notSetValue);
        },
        lastKeyOf: function lastKeyOf(searchValue) {
          return this.toKeyedSeq().reverse().keyOf(searchValue);
        },
        max: function max(comparator) {
          return maxFactory(this, comparator);
        },
        maxBy: function maxBy(mapper, comparator) {
          return maxFactory(this, comparator, mapper);
        },
        min: function min(comparator) {
          return maxFactory(
            this,
            comparator ? neg(comparator) : defaultNegComparator
          );
        },
        minBy: function minBy(mapper, comparator) {
          return maxFactory(
            this,
            comparator ? neg(comparator) : defaultNegComparator,
            mapper
          );
        },
        rest: function rest() {
          return this.slice(1);
        },
        skip: function skip(amount) {
          return amount === 0 ? this : this.slice(Math.max(0, amount));
        },
        skipLast: function skipLast(amount) {
          return amount === 0 ? this : this.slice(0, -Math.max(0, amount));
        },
        skipWhile: function skipWhile(predicate, context) {
          return reify(this, skipWhileFactory(this, predicate, context, true));
        },
        skipUntil: function skipUntil(predicate, context) {
          return this.skipWhile(not(predicate), context);
        },
        sortBy: function sortBy(mapper, comparator) {
          return reify(this, sortFactory(this, comparator, mapper));
        },
        take: function take(amount) {
          return this.slice(0, Math.max(0, amount));
        },
        takeLast: function takeLast(amount) {
          return this.slice(-Math.max(0, amount));
        },
        takeWhile: function takeWhile(predicate, context) {
          return reify(this, takeWhileFactory(this, predicate, context));
        },
        takeUntil: function takeUntil(predicate, context) {
          return this.takeWhile(not(predicate), context);
        },
        update: function update2(fn) {
          return fn(this);
        },
        valueSeq: function valueSeq() {
          return this.toIndexedSeq();
        },
        // ### Hashable Object
        hashCode: function hashCode() {
          return this.__hash || (this.__hash = hashCollection(this));
        }
        // ### Internal
        // abstract __iterate(fn, reverse)
        // abstract __iterator(type, reverse)
      });
      var CollectionPrototype = Collection.prototype;
      CollectionPrototype[IS_COLLECTION_SYMBOL] = true;
      CollectionPrototype[ITERATOR_SYMBOL] = CollectionPrototype.values;
      CollectionPrototype.toJSON = CollectionPrototype.toArray;
      CollectionPrototype.__toStringMapper = quoteString;
      CollectionPrototype.inspect = CollectionPrototype.toSource = function() {
        return this.toString();
      };
      CollectionPrototype.chain = CollectionPrototype.flatMap;
      CollectionPrototype.contains = CollectionPrototype.includes;
      mixin(KeyedCollection, {
        // ### More sequential methods
        flip: function flip() {
          return reify(this, flipFactory(this));
        },
        mapEntries: function mapEntries(mapper, context) {
          var this$1$1 = this;
          var iterations = 0;
          return reify(
            this,
            this.toSeq().map(function(v, k) {
              return mapper.call(context, [k, v], iterations++, this$1$1);
            }).fromEntrySeq()
          );
        },
        mapKeys: function mapKeys(mapper, context) {
          var this$1$1 = this;
          return reify(
            this,
            this.toSeq().flip().map(function(k, v) {
              return mapper.call(context, k, v, this$1$1);
            }).flip()
          );
        }
      });
      var KeyedCollectionPrototype = KeyedCollection.prototype;
      KeyedCollectionPrototype[IS_KEYED_SYMBOL] = true;
      KeyedCollectionPrototype[ITERATOR_SYMBOL] = CollectionPrototype.entries;
      KeyedCollectionPrototype.toJSON = toObject;
      KeyedCollectionPrototype.__toStringMapper = function(v, k) {
        return quoteString(k) + ": " + quoteString(v);
      };
      mixin(IndexedCollection, {
        // ### Conversion to other types
        toKeyedSeq: function toKeyedSeq() {
          return new ToKeyedSequence(this, false);
        },
        // ### ES6 Collection methods (ES6 Array and Map)
        filter: function filter(predicate, context) {
          return reify(this, filterFactory(this, predicate, context, false));
        },
        findIndex: function findIndex(predicate, context) {
          var entry = this.findEntry(predicate, context);
          return entry ? entry[0] : -1;
        },
        indexOf: function indexOf(searchValue) {
          var key2 = this.keyOf(searchValue);
          return key2 === void 0 ? -1 : key2;
        },
        lastIndexOf: function lastIndexOf(searchValue) {
          var key2 = this.lastKeyOf(searchValue);
          return key2 === void 0 ? -1 : key2;
        },
        reverse: function reverse() {
          return reify(this, reverseFactory(this, false));
        },
        slice: function slice(begin, end) {
          return reify(this, sliceFactory(this, begin, end, false));
        },
        splice: function splice(index, removeNum) {
          var numArgs = arguments.length;
          removeNum = Math.max(removeNum || 0, 0);
          if (numArgs === 0 || numArgs === 2 && !removeNum) {
            return this;
          }
          index = resolveBegin(index, index < 0 ? this.count() : this.size);
          var spliced = this.slice(0, index);
          return reify(
            this,
            numArgs === 1 ? spliced : spliced.concat(arrCopy(arguments, 2), this.slice(index + removeNum))
          );
        },
        // ### More collection methods
        findLastIndex: function findLastIndex(predicate, context) {
          var entry = this.findLastEntry(predicate, context);
          return entry ? entry[0] : -1;
        },
        first: function first(notSetValue) {
          return this.get(0, notSetValue);
        },
        flatten: function flatten(depth) {
          return reify(this, flattenFactory(this, depth, false));
        },
        get: function get2(index, notSetValue) {
          index = wrapIndex(this, index);
          return index < 0 || this.size === Infinity || this.size !== void 0 && index > this.size ? notSetValue : this.find(function(_, key2) {
            return key2 === index;
          }, void 0, notSetValue);
        },
        has: function has2(index) {
          index = wrapIndex(this, index);
          return index >= 0 && (this.size !== void 0 ? this.size === Infinity || index < this.size : this.find(function(_, key2) {
            return key2 === index;
          }, void 0, NOT_SET) !== NOT_SET);
        },
        interpose: function interpose(separator) {
          return reify(this, interposeFactory(this, separator));
        },
        interleave: function interleave() {
          var collections = [this].concat(arrCopy(arguments));
          var zipped = zipWithFactory(this.toSeq(), IndexedSeq.of, collections);
          var interleaved = zipped.flatten(true);
          if (zipped.size) {
            interleaved.size = zipped.size * collections.length;
          }
          return reify(this, interleaved);
        },
        keySeq: function keySeq() {
          return Range(0, this.size);
        },
        last: function last(notSetValue) {
          return this.get(-1, notSetValue);
        },
        skipWhile: function skipWhile(predicate, context) {
          return reify(this, skipWhileFactory(this, predicate, context, false));
        },
        zip: function zip() {
          var collections = [this].concat(arrCopy(arguments));
          return reify(this, zipWithFactory(this, defaultZipper, collections));
        },
        zipAll: function zipAll() {
          var collections = [this].concat(arrCopy(arguments));
          return reify(this, zipWithFactory(this, defaultZipper, collections, true));
        },
        zipWith: function zipWith(zipper) {
          var collections = arrCopy(arguments);
          collections[0] = this;
          return reify(this, zipWithFactory(this, zipper, collections));
        }
      });
      var IndexedCollectionPrototype = IndexedCollection.prototype;
      IndexedCollectionPrototype[IS_INDEXED_SYMBOL] = true;
      IndexedCollectionPrototype[IS_ORDERED_SYMBOL] = true;
      mixin(SetCollection, {
        // ### ES6 Collection methods (ES6 Array and Map)
        get: function get2(value2, notSetValue) {
          return this.has(value2) ? value2 : notSetValue;
        },
        includes: function includes(value2) {
          return this.has(value2);
        },
        // ### More sequential methods
        keySeq: function keySeq() {
          return this.valueSeq();
        }
      });
      var SetCollectionPrototype = SetCollection.prototype;
      SetCollectionPrototype.has = CollectionPrototype.includes;
      SetCollectionPrototype.contains = SetCollectionPrototype.includes;
      SetCollectionPrototype.keys = SetCollectionPrototype.values;
      mixin(KeyedSeq, KeyedCollectionPrototype);
      mixin(IndexedSeq, IndexedCollectionPrototype);
      mixin(SetSeq, SetCollectionPrototype);
      function defaultZipper() {
        return arrCopy(arguments);
      }
      function isOrderedSet(maybeOrderedSet) {
        return isSet(maybeOrderedSet) && isOrdered(maybeOrderedSet);
      }
      var OrderedSet = /* @__PURE__ */ (function(Set3) {
        function OrderedSet2(value2) {
          return value2 === void 0 || value2 === null ? emptyOrderedSet() : isOrderedSet(value2) ? value2 : emptyOrderedSet().withMutations(function(set2) {
            var iter = SetCollection(value2);
            assertNotInfinite(iter.size);
            iter.forEach(function(v) {
              return set2.add(v);
            });
          });
        }
        if (Set3) OrderedSet2.__proto__ = Set3;
        OrderedSet2.prototype = Object.create(Set3 && Set3.prototype);
        OrderedSet2.prototype.constructor = OrderedSet2;
        OrderedSet2.of = function of() {
          return this(arguments);
        };
        OrderedSet2.fromKeys = function fromKeys(value2) {
          return this(KeyedCollection(value2).keySeq());
        };
        OrderedSet2.prototype.toString = function toString2() {
          return this.__toString("OrderedSet {", "}");
        };
        return OrderedSet2;
      })(Set2);
      OrderedSet.isOrderedSet = isOrderedSet;
      var OrderedSetPrototype = OrderedSet.prototype;
      OrderedSetPrototype[IS_ORDERED_SYMBOL] = true;
      OrderedSetPrototype.zip = IndexedCollectionPrototype.zip;
      OrderedSetPrototype.zipWith = IndexedCollectionPrototype.zipWith;
      OrderedSetPrototype.zipAll = IndexedCollectionPrototype.zipAll;
      OrderedSetPrototype.__empty = emptyOrderedSet;
      OrderedSetPrototype.__make = makeOrderedSet;
      function makeOrderedSet(map, ownerID) {
        var set2 = Object.create(OrderedSetPrototype);
        set2.size = map ? map.size : 0;
        set2._map = map;
        set2.__ownerID = ownerID;
        return set2;
      }
      var EMPTY_ORDERED_SET;
      function emptyOrderedSet() {
        return EMPTY_ORDERED_SET || (EMPTY_ORDERED_SET = makeOrderedSet(emptyOrderedMap()));
      }
      var PairSorting = {
        LeftThenRight: -1,
        RightThenLeft: 1
      };
      function throwOnInvalidDefaultValues(defaultValues) {
        if (isRecord(defaultValues)) {
          throw new Error(
            "Can not call `Record` with an immutable Record as default values. Use a plain javascript object instead."
          );
        }
        if (isImmutable(defaultValues)) {
          throw new Error(
            "Can not call `Record` with an immutable Collection as default values. Use a plain javascript object instead."
          );
        }
        if (defaultValues === null || typeof defaultValues !== "object") {
          throw new Error(
            "Can not call `Record` with a non-object as default values. Use a plain javascript object instead."
          );
        }
      }
      var Record = function Record2(defaultValues, name) {
        var hasInitialized;
        throwOnInvalidDefaultValues(defaultValues);
        var RecordType = function Record3(values) {
          var this$1$1 = this;
          if (values instanceof RecordType) {
            return values;
          }
          if (!(this instanceof RecordType)) {
            return new RecordType(values);
          }
          if (!hasInitialized) {
            hasInitialized = true;
            var keys = Object.keys(defaultValues);
            var indices = RecordTypePrototype._indices = {};
            RecordTypePrototype._name = name;
            RecordTypePrototype._keys = keys;
            RecordTypePrototype._defaultValues = defaultValues;
            for (var i = 0; i < keys.length; i++) {
              var propName = keys[i];
              indices[propName] = i;
              if (RecordTypePrototype[propName]) {
                typeof console === "object" && console.warn && console.warn(
                  "Cannot define " + recordName(this) + ' with property "' + propName + '" since that property name is part of the Record API.'
                );
              } else {
                setProp(RecordTypePrototype, propName);
              }
            }
          }
          this.__ownerID = void 0;
          this._values = List().withMutations(function(l2) {
            l2.setSize(this$1$1._keys.length);
            KeyedCollection(values).forEach(function(v, k) {
              l2.set(this$1$1._indices[k], v === this$1$1._defaultValues[k] ? void 0 : v);
            });
          });
          return this;
        };
        var RecordTypePrototype = RecordType.prototype = Object.create(RecordPrototype);
        RecordTypePrototype.constructor = RecordType;
        if (name) {
          RecordType.displayName = name;
        }
        return RecordType;
      };
      Record.prototype.toString = function toString2() {
        var str = recordName(this) + " { ";
        var keys = this._keys;
        var k;
        for (var i = 0, l2 = keys.length; i !== l2; i++) {
          k = keys[i];
          str += (i ? ", " : "") + k + ": " + quoteString(this.get(k));
        }
        return str + " }";
      };
      Record.prototype.equals = function equals(other) {
        return this === other || isRecord(other) && recordSeq(this).equals(recordSeq(other));
      };
      Record.prototype.hashCode = function hashCode() {
        return recordSeq(this).hashCode();
      };
      Record.prototype.has = function has2(k) {
        return this._indices.hasOwnProperty(k);
      };
      Record.prototype.get = function get2(k, notSetValue) {
        if (!this.has(k)) {
          return notSetValue;
        }
        var index = this._indices[k];
        var value2 = this._values.get(index);
        return value2 === void 0 ? this._defaultValues[k] : value2;
      };
      Record.prototype.set = function set2(k, v) {
        if (this.has(k)) {
          var newValues = this._values.set(
            this._indices[k],
            v === this._defaultValues[k] ? void 0 : v
          );
          if (newValues !== this._values && !this.__ownerID) {
            return makeRecord(this, newValues);
          }
        }
        return this;
      };
      Record.prototype.remove = function remove2(k) {
        return this.set(k);
      };
      Record.prototype.clear = function clear() {
        var newValues = this._values.clear().setSize(this._keys.length);
        return this.__ownerID ? this : makeRecord(this, newValues);
      };
      Record.prototype.wasAltered = function wasAltered2() {
        return this._values.wasAltered();
      };
      Record.prototype.toSeq = function toSeq() {
        return recordSeq(this);
      };
      Record.prototype.toJS = function toJS$1() {
        return toJS(this);
      };
      Record.prototype.entries = function entries() {
        return this.__iterator(ITERATE_ENTRIES);
      };
      Record.prototype.__iterator = function __iterator(type, reverse) {
        return recordSeq(this).__iterator(type, reverse);
      };
      Record.prototype.__iterate = function __iterate(fn, reverse) {
        return recordSeq(this).__iterate(fn, reverse);
      };
      Record.prototype.__ensureOwner = function __ensureOwner(ownerID) {
        if (ownerID === this.__ownerID) {
          return this;
        }
        var newValues = this._values.__ensureOwner(ownerID);
        if (!ownerID) {
          this.__ownerID = ownerID;
          this._values = newValues;
          return this;
        }
        return makeRecord(this, newValues, ownerID);
      };
      Record.isRecord = isRecord;
      Record.getDescriptiveName = recordName;
      var RecordPrototype = Record.prototype;
      RecordPrototype[IS_RECORD_SYMBOL] = true;
      RecordPrototype[DELETE] = RecordPrototype.remove;
      RecordPrototype.deleteIn = RecordPrototype.removeIn = deleteIn;
      RecordPrototype.getIn = getIn;
      RecordPrototype.hasIn = CollectionPrototype.hasIn;
      RecordPrototype.merge = merge$1;
      RecordPrototype.mergeWith = mergeWith$1;
      RecordPrototype.mergeIn = mergeIn;
      RecordPrototype.mergeDeep = mergeDeep;
      RecordPrototype.mergeDeepWith = mergeDeepWith;
      RecordPrototype.mergeDeepIn = mergeDeepIn;
      RecordPrototype.setIn = setIn;
      RecordPrototype.update = update;
      RecordPrototype.updateIn = updateIn$1;
      RecordPrototype.withMutations = withMutations;
      RecordPrototype.asMutable = asMutable;
      RecordPrototype.asImmutable = asImmutable;
      RecordPrototype[ITERATOR_SYMBOL] = RecordPrototype.entries;
      RecordPrototype.toJSON = RecordPrototype.toObject = CollectionPrototype.toObject;
      RecordPrototype.inspect = RecordPrototype.toSource = function() {
        return this.toString();
      };
      function makeRecord(likeRecord, values, ownerID) {
        var record = Object.create(Object.getPrototypeOf(likeRecord));
        record._values = values;
        record.__ownerID = ownerID;
        return record;
      }
      function recordName(record) {
        return record.constructor.displayName || record.constructor.name || "Record";
      }
      function recordSeq(record) {
        return keyedSeqFromValue(record._keys.map(function(k) {
          return [k, record.get(k)];
        }));
      }
      function setProp(prototype, name) {
        try {
          Object.defineProperty(prototype, name, {
            get: function() {
              return this.get(name);
            },
            set: function(value2) {
              invariant(this.__ownerID, "Cannot set on an immutable record.");
              this.set(name, value2);
            }
          });
        } catch (error) {
        }
      }
      var Repeat = /* @__PURE__ */ (function(IndexedSeq2) {
        function Repeat2(value2, times) {
          if (!(this instanceof Repeat2)) {
            return new Repeat2(value2, times);
          }
          this._value = value2;
          this.size = times === void 0 ? Infinity : Math.max(0, times);
          if (this.size === 0) {
            if (EMPTY_REPEAT) {
              return EMPTY_REPEAT;
            }
            EMPTY_REPEAT = this;
          }
        }
        if (IndexedSeq2) Repeat2.__proto__ = IndexedSeq2;
        Repeat2.prototype = Object.create(IndexedSeq2 && IndexedSeq2.prototype);
        Repeat2.prototype.constructor = Repeat2;
        Repeat2.prototype.toString = function toString2() {
          if (this.size === 0) {
            return "Repeat []";
          }
          return "Repeat [ " + this._value + " " + this.size + " times ]";
        };
        Repeat2.prototype.get = function get2(index, notSetValue) {
          return this.has(index) ? this._value : notSetValue;
        };
        Repeat2.prototype.includes = function includes(searchValue) {
          return is(this._value, searchValue);
        };
        Repeat2.prototype.slice = function slice(begin, end) {
          var size = this.size;
          return wholeSlice(begin, end, size) ? this : new Repeat2(
            this._value,
            resolveEnd(end, size) - resolveBegin(begin, size)
          );
        };
        Repeat2.prototype.reverse = function reverse() {
          return this;
        };
        Repeat2.prototype.indexOf = function indexOf(searchValue) {
          if (this.size !== 0 && is(this._value, searchValue)) {
            return 0;
          }
          return -1;
        };
        Repeat2.prototype.lastIndexOf = function lastIndexOf(searchValue) {
          if (this.size !== 0 && is(this._value, searchValue)) {
            return this.size - 1;
          }
          return -1;
        };
        Repeat2.prototype.__iterate = function __iterate(fn, reverse) {
          var size = this.size;
          var i = 0;
          while (i !== size) {
            if (fn(this._value, reverse ? size - ++i : i++, this) === false) {
              break;
            }
          }
          return i;
        };
        Repeat2.prototype.__iterator = function __iterator(type, reverse) {
          var this$1$1 = this;
          var size = this.size;
          var i = 0;
          return new Iterator(
            function() {
              return i === size ? iteratorDone() : iteratorValue(type, reverse ? size - ++i : i++, this$1$1._value);
            }
          );
        };
        Repeat2.prototype.equals = function equals(other) {
          return other instanceof Repeat2 ? is(this._value, other._value) : deepEqual(this, other);
        };
        return Repeat2;
      })(IndexedSeq);
      var EMPTY_REPEAT;
      function fromJS(value2, converter) {
        return fromJSWith(
          [],
          converter || defaultConverter,
          value2,
          "",
          converter && converter.length > 2 ? [] : void 0,
          { "": value2 }
        );
      }
      function fromJSWith(stack, converter, value2, key2, keyPath, parentValue) {
        if (typeof value2 !== "string" && !isImmutable(value2) && (isArrayLike(value2) || hasIterator(value2) || isPlainObject(value2))) {
          if (~stack.indexOf(value2)) {
            throw new TypeError("Cannot convert circular structure to Immutable");
          }
          stack.push(value2);
          keyPath && key2 !== "" && keyPath.push(key2);
          var converted = converter.call(
            parentValue,
            key2,
            Seq(value2).map(
              function(v, k) {
                return fromJSWith(stack, converter, v, k, keyPath, value2);
              }
            ),
            keyPath && keyPath.slice()
          );
          stack.pop();
          keyPath && keyPath.pop();
          return converted;
        }
        return value2;
      }
      function defaultConverter(k, v) {
        return isIndexed(v) ? v.toList() : isKeyed(v) ? v.toMap() : v.toSet();
      }
      var version = "5.1.9";
      var Iterable = Collection;
      exports3.Collection = Collection;
      exports3.Iterable = Iterable;
      exports3.List = List;
      exports3.Map = Map2;
      exports3.OrderedMap = OrderedMap;
      exports3.OrderedSet = OrderedSet;
      exports3.PairSorting = PairSorting;
      exports3.Range = Range;
      exports3.Record = Record;
      exports3.Repeat = Repeat;
      exports3.Seq = Seq;
      exports3.Set = Set2;
      exports3.Stack = Stack;
      exports3.fromJS = fromJS;
      exports3.get = get;
      exports3.getIn = getIn$1;
      exports3.has = has;
      exports3.hasIn = hasIn$1;
      exports3.hash = hash;
      exports3.is = is;
      exports3.isAssociative = isAssociative;
      exports3.isCollection = isCollection;
      exports3.isImmutable = isImmutable;
      exports3.isIndexed = isIndexed;
      exports3.isKeyed = isKeyed;
      exports3.isList = isList;
      exports3.isMap = isMap;
      exports3.isOrdered = isOrdered;
      exports3.isOrderedMap = isOrderedMap;
      exports3.isOrderedSet = isOrderedSet;
      exports3.isPlainObject = isPlainObject;
      exports3.isRecord = isRecord;
      exports3.isSeq = isSeq;
      exports3.isSet = isSet;
      exports3.isStack = isStack;
      exports3.isValueObject = isValueObject;
      exports3.merge = merge;
      exports3.mergeDeep = mergeDeep$1;
      exports3.mergeDeepWith = mergeDeepWith$1;
      exports3.mergeWith = mergeWith;
      exports3.remove = remove;
      exports3.removeIn = removeIn;
      exports3.set = set;
      exports3.setIn = setIn$1;
      exports3.update = update$1;
      exports3.updateIn = updateIn;
      exports3.version = version;
    }));
  }
});

// node_modules/typed-immutable/lib/typed.js
var require_typed = __commonJS({
  "node_modules/typed-immutable/lib/typed.js"(exports2) {
    (function(global2, factory) {
      if (typeof define === "function" && define.amd) {
        define(["exports", "immutable"], factory);
      } else if (typeof exports2 !== "undefined") {
        factory(exports2, require_immutable());
      } else {
        var mod = {
          exports: {}
        };
        factory(mod.exports, global2.Immutable);
        global2.typed = mod.exports;
      }
    })(exports2, function(exports3, _immutable) {
      "use strict";
      var _createClass = /* @__PURE__ */ (function() {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }
        return function(Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      })();
      var _get = function get(_x3, _x4, _x5) {
        var _again = true;
        _function: while (_again) {
          var object = _x3, property = _x4, receiver = _x5;
          _again = false;
          if (object === null) object = Function.prototype;
          var desc = Object.getOwnPropertyDescriptor(object, property);
          if (desc === void 0) {
            var parent = Object.getPrototypeOf(object);
            if (parent === null) {
              return void 0;
            } else {
              _x3 = parent;
              _x4 = property;
              _x5 = receiver;
              _again = true;
              desc = parent = void 0;
              continue _function;
            }
          } else if ("value" in desc) {
            return desc.value;
          } else {
            var getter = desc.get;
            if (getter === void 0) {
              return void 0;
            }
            return getter.call(receiver);
          }
        }
      };
      function _defaults(obj, defaults) {
        var keys = Object.getOwnPropertyNames(defaults);
        for (var i = 0; i < keys.length; i++) {
          var key2 = keys[i];
          var value2 = Object.getOwnPropertyDescriptor(defaults, key2);
          if (value2 && value2.configurable && obj[key2] === void 0) {
            Object.defineProperty(obj, key2, value2);
          }
        }
        return obj;
      }
      function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
          throw new TypeError("Cannot call a class as a function");
        }
      }
      function _inherits(subClass, superClass) {
        if (typeof superClass !== "function" && superClass !== null) {
          throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
        }
        subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } });
        if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : _defaults(subClass, superClass);
      }
      if (typeof Symbol2 === "undefined") {
        var Symbol2 = function Symbol3(hint) {
          return "@@" + hint;
        };
        Symbol2["for"] = Symbol2;
      }
      function Construct() {
      }
      var construct = function construct2(value2) {
        Construct.prototype = value2.constructor.prototype;
        return new Construct();
      };
      exports3.construct = construct;
      var $type = Symbol2["for"]("typed/type");
      var $store = Symbol2["for"]("typed/store");
      var $empty = Symbol2["for"]("typed/empty");
      var $maybe = Symbol2["for"]("typed/type/maybe");
      var $default = Symbol2["for"]("typed/type/default");
      var $label = Symbol2["for"]("typed/type/label");
      var $init = Symbol2["for"]("transducer/init");
      var $result = Symbol2["for"]("transducer/result");
      var $step = Symbol2["for"]("transducer/step");
      var $read = Symbol2["for"]("typed/type/read");
      var $parse = Symbol2["for"]("typed/type/parse");
      var $typeName = Symbol2("typed/type/name");
      var $typeSignature = Symbol2("typed/type/signature");
      var Typed = function Typed2(label, parse2, defaultValue) {
        var ValueType = (function(_Type) {
          _inherits(ValueType2, _Type);
          function ValueType2(defaultValue2) {
            _classCallCheck(this, ValueType2);
            _get(Object.getPrototypeOf(ValueType2.prototype), "constructor", this).call(this);
            this[$default] = defaultValue2;
          }
          return ValueType2;
        })(Type);
        var prototype = ValueType.prototype;
        prototype[$default] = defaultValue;
        prototype[$parse] = parse2;
        prototype[$label] = label;
        var TypedValue = function TypedValue2(defaultValue2) {
          return defaultValue2 === void 0 ? prototype : new ValueType(defaultValue2);
        };
        TypedValue.prototype = prototype;
        return TypedValue;
      };
      exports3.Typed = Typed;
      Typed.label = $label;
      Typed.defaultValue = $default;
      Typed.read = $read;
      Typed.typeName = $typeName;
      Typed.typeSignature = $typeSignature;
      Typed.type = $type;
      Typed.store = $store;
      Typed.init = $init;
      Typed.result = $result;
      Typed.step = $step;
      Typed.DELETE = "delete";
      Typed.empty = $empty;
      var typeName = function typeName2(type) {
        return type[$typeName]();
      };
      var typeSignature = function typeSignature2(type) {
        return type[$typeSignature]();
      };
      var Type = (function() {
        function Type2() {
          _classCallCheck(this, Type2);
        }
        _createClass(Type2, [{
          key: Typed.read,
          value: function value2() {
            var _value = arguments.length <= 0 || arguments[0] === void 0 ? this[$default] : arguments[0];
            return this[$parse](_value);
          }
        }, {
          key: Typed.parse,
          value: function value2(_value2) {
            throw TypeError('Type implementation must implement "[read.symbol]" method');
          }
        }, {
          key: Typed.typeName,
          value: function value2() {
            var label = this[$label];
            var defaultValue = this[$default];
            return defaultValue === void 0 ? label : label + "(" + JSON.stringify(defaultValue) + ")";
          }
        }]);
        return Type2;
      })();
      exports3.Type = Type;
      var ObjectPrototype = Object.prototype;
      var isArray = Array.isArray || function(x) {
        return ObjectPrototype.toString.call(x) === "[object Array]";
      };
      var isRegExp = function isRegExp2(x) {
        return ObjectPrototype.toString.call(x) === "[object RegExp]";
      };
      var typeOf = function typeOf2(x) {
        var type = arguments.length <= 1 || arguments[1] === void 0 ? typeof x : arguments[1];
        return (function() {
          return x === void 0 ? x : x === null ? x : x[$read] ? x : x.prototype && x.prototype[$read] ? x.prototype : type === "number" ? new Typed.Number(x) : type === "string" ? new Typed.String(x) : type === "boolean" ? new Typed.Boolean(x) : type === "symbol" ? new Typed.Symbol(x) : isArray(x) ? Typed.Array(x) : isRegExp(x) ? new Typed.RegExp(x) : x === String ? Typed.String.prototype : x === Number ? Typed.Number.prototype : x === Boolean ? Typed.Boolean.prototype : x === RegExp ? Typed.RegExp.prototype : x === Array ? Typed.Array.prototype : x === Symbol2 ? Typed.Symbol.prototype : x === Date ? Typed.Date.prototype : Any;
        })();
      };
      exports3.typeOf = typeOf;
      var Any = Typed("Any", function(value2) {
        return value2;
      })();
      exports3.Any = Any;
      Typed.Any = Any;
      Typed.Number = Typed("Number", function(value2) {
        return typeof value2 === "number" ? value2 : TypeError('"' + value2 + '" is not a number');
      });
      Typed.String = Typed("String", function(value2) {
        return typeof value2 === "string" ? value2 : TypeError('"' + value2 + '" is not a string');
      });
      Typed.Symbol = Typed("Symbol", function(value2) {
        return typeof value2 === "symbol" ? value2 : TypeError('"' + value2 + '" is not a symbol');
      });
      Typed.Array = Typed("Array", function(value2) {
        return isArray(value2) ? value2 : TypeError('"' + value2 + '" is not an array');
      });
      Typed.RegExp = Typed("RegExp", function(value2) {
        return value2 instanceof RegExp ? value2 : TypeError('"' + value2 + '" is not a regexp');
      });
      Typed.Boolean = Typed("Boolean", function(value2) {
        return value2 === true ? true : value2 === false ? false : TypeError('"' + value2 + '" is not a boolean');
      });
      Typed.Date = Typed("Date", function(value2) {
        var d = new Date(value2);
        if (isNaN(d.valueOf())) {
          return new TypeError('"' + value2 + '" is not a valid date.');
        }
        return d;
      });
      var MaybeType = (function(_Type2) {
        _inherits(MaybeType2, _Type2);
        function MaybeType2(type) {
          _classCallCheck(this, MaybeType2);
          _get(Object.getPrototypeOf(MaybeType2.prototype), "constructor", this).call(this);
          this[$type] = type;
        }
        _createClass(MaybeType2, [{
          key: Typed.typeName,
          value: function value2() {
            return "Maybe(" + this[$type][$typeName]() + ")";
          }
        }, {
          key: Typed.read,
          value: function value2(_value3) {
            var result = _value3 == null ? null : this[$type][$read](_value3);
            return !(result instanceof TypeError) ? result : TypeError('"' + _value3 + '" is not nully nor it is of ' + this[$type][$typeName]() + " type");
          }
        }]);
        return MaybeType2;
      })(Type);
      var Maybe = function Maybe2(Type2) {
        var type = typeOf(Type2);
        if (type === Any) {
          throw TypeError(Type2 + " is not a valid type");
        }
        return type[$maybe] || (type[$maybe] = new MaybeType(type));
      };
      exports3.Maybe = Maybe;
      Maybe.Type = MaybeType;
      var UnionType = (function(_Type3) {
        _inherits(UnionType2, _Type3);
        function UnionType2(variants) {
          _classCallCheck(this, UnionType2);
          _get(Object.getPrototypeOf(UnionType2.prototype), "constructor", this).call(this);
          this[$type] = variants;
        }
        _createClass(UnionType2, [{
          key: Typed.typeName,
          value: function value2() {
            return "Union(" + this[$type].map(typeName).join(", ") + ")";
          }
        }, {
          key: Typed.read,
          value: function value2(_value4) {
            var variants = this[$type];
            var count = variants.length;
            var index = 0;
            while (index < count) {
              var variant = variants[index];
              if (_value4 instanceof variant.constructor) {
                return _value4;
              }
              index = index + 1;
            }
            index = 0;
            while (index < count) {
              var result = variants[index][$read](_value4);
              if (!(result instanceof TypeError)) {
                return result;
              }
              index = index + 1;
            }
            return TypeError('"' + _value4 + '" does not satisfy ' + this[$typeName]() + " type");
          }
        }]);
        return UnionType2;
      })(Type);
      var subtract = function subtract2(xs, ys) {
        return xs.filter(function(x) {
          return ys.indexOf(x) < 0;
        });
      };
      var union = function union2(xs, ys) {
        if (xs.length > ys.length) {
          var diff2 = subtract(ys, xs);
          return diff2.length === 0 ? xs : xs.concat(diff2);
        } else {
          var diff2 = subtract(xs, ys);
          return diff2.length === 0 ? ys : diff2.concat(ys);
        }
      };
      var Union = function Union2() {
        for (var _len = arguments.length, Types = Array(_len), _key = 0; _key < _len; _key++) {
          Types[_key] = arguments[_key];
        }
        var count = Types.length;
        if (count === 0) {
          throw TypeError("Union must be of at at least one type");
        }
        var variants = null;
        var type = null;
        var index = 0;
        while (index < count) {
          var variant = typeOf(Types[index]);
          if (variant === Any) {
            return Any;
          }
          if (!variants) {
            type = variant;
            variants = type instanceof UnionType ? type[$type] : [variant];
          } else if (variants.indexOf(variant) < 0) {
            if (variant instanceof UnionType) {
              var variantUnion = union(variants, variant[$type]);
              if (variantUnion === variant[$type]) {
                type = variant;
                variants = variantUnion;
              } else if (variantUnion !== variants) {
                type = null;
                variants = variantUnion;
              }
            } else {
              type = null;
              variants.push(variant);
            }
          }
          index = index + 1;
        }
        return type ? type : new UnionType(variants);
      };
      exports3.Union = Union;
      Union.Type = UnionType;
      Typed.Number.Range = function(from, to, defaultValue) {
        if (to === void 0) to = Infinity;
        return Typed("Typed.Number.Range(" + from + ".." + to + ")", function(value2) {
          if (typeof value2 !== "number") {
            return TypeError('"' + value2 + '" is not a number');
          }
          if (!(value2 >= from && value2 <= to)) {
            return TypeError('"' + value2 + `" isn't in the range of ` + from + ".." + to);
          }
          return value2;
        }, defaultValue);
      };
    });
  }
});

// node_modules/typed-immutable/lib/record.js
var require_record = __commonJS({
  "node_modules/typed-immutable/lib/record.js"(exports2) {
    (function(global2, factory) {
      if (typeof define === "function" && define.amd) {
        define(["exports", "./typed", "immutable"], factory);
      } else if (typeof exports2 !== "undefined") {
        factory(exports2, require_typed(), require_immutable());
      } else {
        var mod = {
          exports: {}
        };
        factory(mod.exports, global2.typed, global2.immutable);
        global2.record = mod.exports;
      }
    })(exports2, function(exports3, _typed, _immutable) {
      "use strict";
      var _slicedToArray = /* @__PURE__ */ (function() {
        function sliceIterator(arr, i) {
          var _arr = [];
          var _n = true;
          var _d = false;
          var _e = void 0;
          try {
            for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
              _arr.push(_s.value);
              if (i && _arr.length === i) break;
            }
          } catch (err) {
            _d = true;
            _e = err;
          } finally {
            try {
              if (!_n && _i["return"]) _i["return"]();
            } finally {
              if (_d) throw _e;
            }
          }
          return _arr;
        }
        return function(arr, i) {
          if (Array.isArray(arr)) {
            return arr;
          } else if (Symbol.iterator in Object(arr)) {
            return sliceIterator(arr, i);
          } else {
            throw new TypeError("Invalid attempt to destructure non-iterable instance");
          }
        };
      })();
      var _createClass = /* @__PURE__ */ (function() {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }
        return function(Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      })();
      var _get = function get(_x, _x2, _x3) {
        var _again = true;
        _function: while (_again) {
          var object = _x, property = _x2, receiver = _x3;
          _again = false;
          if (object === null) object = Function.prototype;
          var desc = Object.getOwnPropertyDescriptor(object, property);
          if (desc === void 0) {
            var parent = Object.getPrototypeOf(object);
            if (parent === null) {
              return void 0;
            } else {
              _x = parent;
              _x2 = property;
              _x3 = receiver;
              _again = true;
              desc = parent = void 0;
              continue _function;
            }
          } else if ("value" in desc) {
            return desc.value;
          } else {
            var getter = desc.get;
            if (getter === void 0) {
              return void 0;
            }
            return getter.call(receiver);
          }
        }
      };
      function _defaults(obj, defaults) {
        var keys = Object.getOwnPropertyNames(defaults);
        for (var i = 0; i < keys.length; i++) {
          var key2 = keys[i];
          var value2 = Object.getOwnPropertyDescriptor(defaults, key2);
          if (value2 && value2.configurable && obj[key2] === void 0) {
            Object.defineProperty(obj, key2, value2);
          }
        }
        return obj;
      }
      function _defineProperty(obj, key2, value2) {
        if (key2 in obj) {
          Object.defineProperty(obj, key2, { value: value2, enumerable: true, configurable: true, writable: true });
        } else {
          obj[key2] = value2;
        }
        return obj;
      }
      function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
          throw new TypeError("Cannot call a class as a function");
        }
      }
      function _inherits(subClass, superClass) {
        if (typeof superClass !== "function" && superClass !== null) {
          throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
        }
        subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } });
        if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : _defaults(subClass, superClass);
      }
      var Keyed = _immutable.Iterable.Keyed;
      var Getter = function Getter2(key2) {
        return function() {
          return this.get(key2);
        };
      };
      var Setter = function Setter2(key2) {
        return function(value2) {
          if (!this.__ownerID) {
            throw TypeError("Cannot set on an immutable record.");
          }
          this.set(key2, value2);
        };
      };
      var $store = _typed.Typed.store;
      var $type = _typed.Typed.type;
      var $step = _typed.Typed.step;
      var $init = _typed.Typed.init;
      var $result = _typed.Typed.result;
      var $read = _typed.Typed.read;
      var $label = _typed.Typed.label;
      var $empty = _typed.Typed.empty;
      var $typeName = _typed.Typed.typeName;
      var $typeSignature = _typed.Typed.typeSignature;
      var IterableKeyedBase = function IterableKeyedBase2() {
      };
      IterableKeyedBase.prototype = _immutable.Iterable.Keyed.prototype;
      var TypedRecord = (function(_IterableKeyedBase) {
        _inherits(TypedRecord2, _IterableKeyedBase);
        function TypedRecord2() {
          _classCallCheck(this, TypedRecord2);
          _get(Object.getPrototypeOf(TypedRecord2.prototype), "constructor", this).call(this);
        }
        _createClass(TypedRecord2, [{
          key: _typed.Typed.init,
          value: function value2() {
            return (0, _typed.construct)(this).asMutable();
          }
        }, {
          key: _typed.Typed.result,
          value: function value2(result) {
            return result.asImmutable();
          }
        }, {
          key: _typed.Typed.read,
          value: function value2(structure) {
            var Type = this.constructor;
            if (structure && structure instanceof Type) {
              return structure;
            }
            if (structure === null || structure && typeof structure !== "object") {
              return TypeError('Invalid data structure "' + structure + '" was passed to ' + this[$typeName]());
            }
            var seq = (0, _immutable.Seq)(structure);
            var type = this[$type];
            var isEmpty = seq.size === 0;
            if (isEmpty && this[$empty]) {
              return this[$empty];
            }
            var record = void 0;
            for (var key2 in type) {
              var fieldType = type[key2];
              var value3 = seq.has(key2) ? seq.get(key2) : this.get(key2);
              var result = fieldType[$read](value3);
              if (result instanceof TypeError) {
                return TypeError('Invalid value for "' + key2 + '" field:\n ' + result.message);
              }
              record = this[$step](record || this[$init](), [key2, result]);
            }
            record = this[$result](record);
            if (isEmpty) {
              this[$empty] = record;
            }
            return record;
          }
        }, {
          key: _typed.Typed.step,
          value: function value2(result, _ref) {
            var _ref2 = _slicedToArray(_ref, 2);
            var key2 = _ref2[0];
            var _value = _ref2[1];
            var store = result[$store] ? result[$store].set(key2, _value) : new _immutable.Map([[key2, _value]]);
            if (result[$store] === store) {
              return result;
            }
            var record = result.__ownerID ? result : (0, _typed.construct)(result);
            record[$store] = store;
            return record;
          }
        }, {
          key: _typed.Typed.typeSignature,
          value: function value2() {
            var type = this[$type];
            var body = [];
            for (var key2 in type) {
              body.push(key2 + ": " + type[key2][$typeName]());
            }
            return "Typed.Record({" + body.join(", ") + "})";
          }
        }, {
          key: _typed.Typed.typeName,
          value: function value2() {
            return this[$label] || this[$typeSignature]();
          }
        }, {
          key: "toString",
          value: function toString() {
            return this.__toString(this[$typeName]() + "({", "})");
          }
        }, {
          key: "has",
          value: function has(key2) {
            return !!this[$type][key2];
          }
        }, {
          key: "get",
          value: function get(key2, defaultValue) {
            return !this[$type][key2] ? defaultValue : !this[$store] ? defaultValue : this[$store].get(key2, defaultValue);
          }
        }, {
          key: "clear",
          value: function clear() {
            if (this.__ownerID) {
              this[$store] && this[$store].clear();
              return this;
            }
            return this[$empty] || (this[$empty] = new this.constructor());
          }
        }, {
          key: "remove",
          value: function remove(key2) {
            return this[$type][key2] ? this.set(key2, void 0) : this;
          }
        }, {
          key: "set",
          value: function set(key2, value2) {
            var fieldType = this[$type][key2];
            if (!fieldType) {
              throw TypeError('Cannot set unknown field "' + key2 + '" on "' + this[$typeName]() + '"');
            }
            var result = fieldType[$read](value2);
            if (result instanceof TypeError) {
              throw TypeError("Invalid value for " + key2 + " field: " + result.message);
            }
            return this[$step](this, [key2, result]);
          }
        }, {
          key: "__iterator",
          value: function __iterator(type, reverse) {
            var _this = this;
            return Keyed(this[$type]).map(function(_, key2) {
              return _this.get(key2);
            }).__iterator(type, reverse);
          }
        }, {
          key: "__iterate",
          value: function __iterate(f, reverse) {
            var _this2 = this;
            return Keyed(this[$type]).map(function(_, key2) {
              return _this2.get(key2);
            }).__iterate(f, reverse);
          }
        }, {
          key: "__ensureOwner",
          value: function __ensureOwner(ownerID) {
            if (ownerID === this.__ownerID) {
              return this;
            }
            var store = this[$store] && this[$store].__ensureOwner(ownerID);
            var result = !ownerID ? this : (0, _typed.construct)(this);
            result.__ownerID = ownerID;
            result[$store] = store;
            return result;
          }
        }, {
          key: "wasAltered",
          value: function wasAltered() {
            return this[$store].wasAltered();
          }
        }]);
        return TypedRecord2;
      })(IterableKeyedBase);
      var Record = function Record2(descriptor, label) {
        if (descriptor && typeof descriptor === "object") {
          var type = /* @__PURE__ */ Object.create(null);
          var _keys = Object.keys(descriptor);
          var size = _keys.length;
          if (size > 0) {
            var _properties;
            var _ret = (function() {
              var properties = (_properties = {
                size: { value: size }
              }, _defineProperty(_properties, $type, { value: type }), _defineProperty(_properties, $label, { value: label }), _properties);
              var index = 0;
              while (index < size) {
                var key2 = _keys[index];
                var fieldType = (0, _typed.typeOf)(descriptor[key2]);
                if (fieldType) {
                  type[key2] = fieldType;
                  properties[key2] = { get: Getter(key2), set: Setter(key2), enumerable: true };
                } else {
                  throw TypeError('Invalid field descriptor provided for a "' + key2 + '" field');
                }
                index = index + 1;
              }
              var RecordType = function RecordType2(structure) {
                var isNew = this instanceof RecordType2;
                var constructor = isNew ? this.constructor : RecordType2;
                if (structure instanceof constructor) {
                  return structure;
                }
                var type2 = constructor.prototype;
                var result = type2[$read](structure);
                if (result instanceof TypeError) {
                  throw result;
                }
                if (isNew) {
                  this[$store] = result[$store];
                } else {
                  return result;
                }
              };
              properties.constructor = { value: RecordType };
              RecordType.prototype = Object.create(RecordPrototype, properties);
              var prototype = RecordType.prototype;
              return {
                v: RecordType
              };
            })();
            if (typeof _ret === "object") return _ret.v;
          } else {
            throw TypeError("Typed.Record descriptor must define at least one field");
          }
        } else {
          throw TypeError("Typed.Record must be passed a descriptor of fields");
        }
      };
      exports3.Record = Record;
      Record.Type = TypedRecord;
      Record.prototype = TypedRecord.prototype;
      var RecordPrototype = TypedRecord.prototype;
      RecordPrototype[_typed.Typed.DELETE] = RecordPrototype.remove;
      RecordPrototype.deleteIn = _immutable.Map.prototype.deleteIn;
      RecordPrototype.removeIn = _immutable.Map.prototype.removeIn;
      RecordPrototype.merge = _immutable.Map.prototype.merge;
      RecordPrototype.mergeWith = _immutable.Map.prototype.mergeWith;
      RecordPrototype.mergeIn = _immutable.Map.prototype.mergeIn;
      RecordPrototype.mergeDeep = _immutable.Map.prototype.mergeDeep;
      RecordPrototype.mergeDeepWith = _immutable.Map.prototype.mergeDeepWith;
      RecordPrototype.mergeDeepIn = _immutable.Map.prototype.mergeDeepIn;
      RecordPrototype.setIn = _immutable.Map.prototype.setIn;
      RecordPrototype.update = _immutable.Map.prototype.update;
      RecordPrototype.updateIn = _immutable.Map.prototype.updateIn;
      RecordPrototype.withMutations = _immutable.Map.prototype.withMutations;
      RecordPrototype.asMutable = _immutable.Map.prototype.asMutable;
      RecordPrototype.asImmutable = _immutable.Map.prototype.asImmutable;
      RecordPrototype.map = void 0;
      RecordPrototype.filter = void 0;
      RecordPrototype.filterNot = void 0;
      RecordPrototype.flip = void 0;
      RecordPrototype.mapKeys = void 0;
      RecordPrototype.mapEntries = void 0;
      RecordPrototype.sort = void 0;
      RecordPrototype.sortBy = void 0;
      RecordPrototype.reverse = void 0;
      RecordPrototype.slice = void 0;
      RecordPrototype.butLast = void 0;
      RecordPrototype.flatMap = void 0;
      RecordPrototype.flatten = void 0;
      RecordPrototype.rest = void 0;
      RecordPrototype.skip = void 0;
      RecordPrototype.skipLast = void 0;
      RecordPrototype.skipWhile = void 0;
      RecordPrototype.skipUntil = void 0;
      RecordPrototype.sortBy = void 0;
      RecordPrototype.take = void 0;
      RecordPrototype.takeLast = void 0;
      RecordPrototype.takeWhile = void 0;
      RecordPrototype.takeUntil = void 0;
    });
  }
});

// node_modules/typed-immutable/lib/list.js
var require_list = __commonJS({
  "node_modules/typed-immutable/lib/list.js"(exports2) {
    (function(global2, factory) {
      if (typeof define === "function" && define.amd) {
        define(["exports", "./typed", "immutable"], factory);
      } else if (typeof exports2 !== "undefined") {
        factory(exports2, require_typed(), require_immutable());
      } else {
        var mod = {
          exports: {}
        };
        factory(mod.exports, global2.typed, global2.Immutable);
        global2.list = mod.exports;
      }
    })(exports2, function(exports3, _typed, _immutable) {
      "use strict";
      var _slicedToArray = /* @__PURE__ */ (function() {
        function sliceIterator(arr, i) {
          var _arr = [];
          var _n = true;
          var _d = false;
          var _e = void 0;
          try {
            for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
              _arr.push(_s.value);
              if (i && _arr.length === i) break;
            }
          } catch (err) {
            _d = true;
            _e = err;
          } finally {
            try {
              if (!_n && _i["return"]) _i["return"]();
            } finally {
              if (_d) throw _e;
            }
          }
          return _arr;
        }
        return function(arr, i) {
          if (Array.isArray(arr)) {
            return arr;
          } else if (Symbol.iterator in Object(arr)) {
            return sliceIterator(arr, i);
          } else {
            throw new TypeError("Invalid attempt to destructure non-iterable instance");
          }
        };
      })();
      var _createClass = /* @__PURE__ */ (function() {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }
        return function(Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      })();
      var _get = function get(_x2, _x3, _x4) {
        var _again = true;
        _function: while (_again) {
          var object = _x2, property = _x3, receiver = _x4;
          _again = false;
          if (object === null) object = Function.prototype;
          var desc = Object.getOwnPropertyDescriptor(object, property);
          if (desc === void 0) {
            var parent = Object.getPrototypeOf(object);
            if (parent === null) {
              return void 0;
            } else {
              _x2 = parent;
              _x3 = property;
              _x4 = receiver;
              _again = true;
              desc = parent = void 0;
              continue _function;
            }
          } else if ("value" in desc) {
            return desc.value;
          } else {
            var getter = desc.get;
            if (getter === void 0) {
              return void 0;
            }
            return getter.call(receiver);
          }
        }
      };
      function _defaults(obj, defaults) {
        var keys = Object.getOwnPropertyNames(defaults);
        for (var i = 0; i < keys.length; i++) {
          var key2 = keys[i];
          var value2 = Object.getOwnPropertyDescriptor(defaults, key2);
          if (value2 && value2.configurable && obj[key2] === void 0) {
            Object.defineProperty(obj, key2, value2);
          }
        }
        return obj;
      }
      function _defineProperty(obj, key2, value2) {
        if (key2 in obj) {
          Object.defineProperty(obj, key2, { value: value2, enumerable: true, configurable: true, writable: true });
        } else {
          obj[key2] = value2;
        }
        return obj;
      }
      function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
          throw new TypeError("Cannot call a class as a function");
        }
      }
      function _inherits(subClass, superClass) {
        if (typeof superClass !== "function" && superClass !== null) {
          throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
        }
        subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } });
        if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : _defaults(subClass, superClass);
      }
      var ImmutableList = _immutable.List;
      var Indexed = _immutable.Iterable.Indexed;
      var $store = _typed.Typed.store;
      var $type = _typed.Typed.type;
      var $read = _typed.Typed.read;
      var $step = _typed.Typed.step;
      var $init = _typed.Typed.init;
      var $result = _typed.Typed.result;
      var $label = _typed.Typed.label;
      var $typeName = _typed.Typed.typeName;
      var $empty = _typed.Typed.empty;
      var change = function change2(list, f) {
        var store = f(list[$store]);
        if (store === list[$store]) {
          return list;
        } else {
          var result = list.__ownerID ? list : (0, _typed.construct)(list);
          result[$store] = store;
          result.size = store.size;
          return result;
        }
      };
      var _clear = function _clear2(target) {
        return target.clear();
      };
      var _pop = function _pop2(target) {
        return target.pop();
      };
      var _shift = function _shift2(target) {
        return target.shift();
      };
      var TypeInferer = (function(_Type) {
        _inherits(TypeInferer2, _Type);
        function TypeInferer2() {
          _classCallCheck(this, TypeInferer2);
          _get(Object.getPrototypeOf(TypeInferer2.prototype), "constructor", this).apply(this, arguments);
        }
        _createClass(TypeInferer2, [{
          key: _typed.Typed.typeName,
          value: function value2() {
            return "TypeInferer";
          }
        }, {
          key: _typed.Typed.read,
          value: function value2(_value) {
            var type = (0, _typed.typeOf)(_value).constructor.prototype;
            this.type = this.type ? (0, _typed.Union)(this.type, type) : type;
            return _value;
          }
        }]);
        return TypeInferer2;
      })(_typed.Type);
      function BaseImmutableList() {
      }
      BaseImmutableList.prototype = ImmutableList.prototype;
      var TypeInferedList = (function(_BaseImmutableList) {
        _inherits(TypeInferedList2, _BaseImmutableList);
        _createClass(TypeInferedList2, null, [{
          key: "from",
          value: function from(list) {
            var result = (0, _typed.construct)(this.prototype);
            result[$store] = list[$store];
            result.size = list.size;
            return result;
          }
        }]);
        function TypeInferedList2(value2) {
          _classCallCheck(this, TypeInferedList2);
          _get(Object.getPrototypeOf(TypeInferedList2.prototype), "constructor", this).call(this);
          return TypeInferedList2.prototype[$read](value2);
        }
        _createClass(TypeInferedList2, [{
          key: _typed.Typed.init,
          value: function value2() {
            var result = (0, _typed.construct)(this).asMutable();
            result[$type] = new TypeInferer();
            return result;
          }
        }, {
          key: _typed.Typed.result,
          value: function value2(result) {
            var list = result.asImmutable();
            list[$type] = result[$type].type;
            return list;
          }
        }, {
          key: _typed.Typed.read,
          value: function value2(input) {
            var Type = this.constructor;
            if (input === null || input === void 0) {
              if (!this[$empty]) {
                var result = (0, _typed.construct)(this);
                result[$store] = ImmutableList();
                result.size = 0;
                this[$empty] = result;
              }
              return this[$empty];
            }
            if (input instanceof Type && input && input.constructor === Type) {
              return input;
            }
            var source = Indexed(input);
            var isEmpty = source.size === 0;
            if (isEmpty && this[$empty]) {
              return this[$empty];
            }
            var list = this[$init]();
            list.size = source.size;
            source.forEach(function(value3, index) {
              list.set(index, value3);
            });
            list = this[$result](list);
            if (isEmpty) {
              this[$empty] = list;
            }
            return list;
          }
        }, {
          key: _typed.Typed.step,
          value: function value2(result, _ref) {
            var _ref2 = _slicedToArray(_ref, 2);
            var key2 = _ref2[0];
            var _value2 = _ref2[1];
            return change(result, function() {
              var store = arguments.length <= 0 || arguments[0] === void 0 ? ImmutableList() : arguments[0];
              return store.set(key2, _value2);
            });
          }
        }, {
          key: _typed.Typed.typeName,
          value: function value2() {
            return this[$label] || "Typed.List(" + this[$type][$typeName]() + ")";
          }
        }, {
          key: "toString",
          value: function toString() {
            return this.__toString(this[$typeName]() + "([", "])");
          }
        }, {
          key: "has",
          value: function has(key2) {
            return this[$store].has(key2);
          }
        }, {
          key: "get",
          value: function get(index, notSetValue) {
            return this[$store] ? this[$store].get(parseInt(index), notSetValue) : notSetValue;
          }
        }, {
          key: "clear",
          value: function clear() {
            if (this.__ownerID) {
              return change(this, _clear);
            }
            return this[$empty] || this[$read]();
          }
        }, {
          key: "insert",
          value: function insert(index, value2) {
            if (index > this.size) {
              throw TypeError('Index "' + index + '" is out of bounds.');
            }
            var result = this[$type][$read](value2);
            if (result instanceof TypeError) {
              throw TypeError("Invalid value: " + result.message);
            }
            return change(this, function(store) {
              return store.insert(index, value2);
            });
          }
        }, {
          key: "remove",
          value: function remove(index) {
            return change(this, function(store) {
              return store && store.remove(index);
            });
          }
        }, {
          key: "set",
          value: function set(index, value2) {
            if (index > this.size) {
              throw TypeError('Index "' + index + '" is out of bounds.');
            }
            var result = this[$type][$read](value2);
            if (result instanceof TypeError) {
              throw TypeError("Invalid value: " + result.message);
            }
            return this[$step](this, [index, result]);
          }
        }, {
          key: "push",
          value: function push() {
            var type = this[$type];
            var items = [];
            for (var _len = arguments.length, values = Array(_len), _key = 0; _key < _len; _key++) {
              values[_key] = arguments[_key];
            }
            var count = values.length;
            var index = 0;
            while (index < count) {
              var value2 = values[index];
              var result = type[$read](value2);
              if (result instanceof TypeError) {
                throw TypeError("Invalid value: " + result.message);
              }
              items.push(result);
              index = index + 1;
            }
            return change(this, function(store) {
              return store ? store.push.apply(store, items) : ImmutableList.apply(void 0, items);
            });
          }
        }, {
          key: "pop",
          value: function pop() {
            return change(this, _pop);
          }
        }, {
          key: "unshift",
          value: function unshift() {
            var type = this[$type];
            var items = [];
            for (var _len2 = arguments.length, values = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
              values[_key2] = arguments[_key2];
            }
            var count = values.length;
            var index = 0;
            while (index < count) {
              var value2 = values[index];
              var result = type[$read](value2);
              if (result instanceof TypeError) {
                throw TypeError("Invalid value: " + result.message);
              }
              items.push(result);
              index = index + 1;
            }
            return change(this, function(store) {
              return store ? store.unshift.apply(store, items) : ImmutableList.apply(void 0, items);
            });
          }
        }, {
          key: "shift",
          value: function shift() {
            return change(this, _shift);
          }
        }, {
          key: "setSize",
          value: function setSize(size) {
            if (size > this.size) {
              throw TypeError("setSize may only downsize");
            }
            return change(this, function(store) {
              return store.setSize(size);
            });
          }
        }, {
          key: "slice",
          value: function slice(begin, end) {
            return change(this, function(store) {
              return store && store.slice(begin, end);
            });
          }
        }, {
          key: "wasAltered",
          value: function wasAltered() {
            return this[$store].wasAltered();
          }
        }, {
          key: "__ensureOwner",
          value: function __ensureOwner(ownerID) {
            var result = this.__ownerID === ownerID ? this : !ownerID ? this : (0, _typed.construct)(this);
            result.__ownerID = ownerID;
            result[$store] = this[$store] ? this[$store].__ensureOwner(ownerID) : ImmutableList().__ensureOwner(ownerID);
            result.size = result[$store].size;
            return result;
          }
        }, {
          key: "__iterator",
          value: function __iterator(type, reverse) {
            var _this = this;
            return Indexed(this[$store]).map(function(_, key2) {
              return _this.get(key2);
            }).__iterator(type, reverse);
          }
        }, {
          key: "__iterate",
          value: function __iterate(f, reverse) {
            var _this2 = this;
            return Indexed(this[$store]).map(function(_, key2) {
              return _this2.get(key2);
            }).__iterate(f, reverse);
          }
        }]);
        return TypeInferedList2;
      })(BaseImmutableList);
      TypeInferedList.prototype[_typed.Typed.DELETE] = TypeInferedList.prototype.remove;
      var BaseTypeInferedList = function BaseTypeInferedList2() {
      };
      BaseTypeInferedList.prototype = TypeInferedList.prototype;
      var TypedList = (function(_BaseTypeInferedList) {
        _inherits(TypedList2, _BaseTypeInferedList);
        function TypedList2() {
          _classCallCheck(this, TypedList2);
          _get(Object.getPrototypeOf(TypedList2.prototype), "constructor", this).call(this);
        }
        _createClass(TypedList2, [{
          key: _typed.Typed.init,
          value: function value2() {
            return (0, _typed.construct)(this).asMutable();
          }
        }, {
          key: _typed.Typed.result,
          value: function value2(result) {
            return result.asImmutable();
          }
        }, {
          key: "map",
          value: function map(mapper, context) {
            if (this.size === 0) {
              return this;
            } else {
              var result = TypeInferedList.from(this).map(mapper, context);
              if (this[$store] === result[$store]) {
                return this;
              }
              if (result[$type] === this[$type]) {
                var list = (0, _typed.construct)(this);
                list[$store] = result[$store];
                list.size = result.size;
                return list;
              } else {
                return result;
              }
            }
          }
        }, {
          key: "flatMap",
          value: function flatMap(mapper, context) {
            if (this.size === 0) {
              return this;
            } else {
              var result = TypeInferedList.from(this).flatMap(mapper, context);
              if (this[$store] === result[$store]) {
                return this;
              }
              if (result[$type] === this[$type]) {
                var list = (0, _typed.construct)(this);
                list[$store] = result[$store];
                list.size = result.size;
                return list;
              } else {
                return result;
              }
            }
          }
        }]);
        return TypedList2;
      })(BaseTypeInferedList);
      var List = function List2(descriptor, label) {
        var _Object$create;
        if (descriptor === void 0) {
          throw TypeError("Typed.List must be passed a type descriptor");
        }
        if (descriptor === _typed.Any) {
          return _immutable.List;
        }
        var type = (0, _typed.typeOf)(descriptor);
        if (type === _typed.Any) {
          throw TypeError("Typed.List was passed an invalid type descriptor: " + descriptor);
        }
        var ListType = function ListType2(value2) {
          var isListType = this instanceof ListType2;
          var Type = isListType ? this.constructor : ListType2;
          if (value2 instanceof Type) {
            return value2;
          }
          var result = Type.prototype[$read](value2);
          if (result instanceof TypeError) {
            throw result;
          }
          if (isListType && !this[$store]) {
            this[$store] = result[$store];
            this.size = result.size;
          } else {
            return result;
          }
          return this;
        };
        ListType.of = ImmutableList.of;
        ListType.prototype = Object.create(ListPrototype, (_Object$create = {
          constructor: { value: ListType }
        }, _defineProperty(_Object$create, $type, { value: type }), _defineProperty(_Object$create, $label, { value: label }), _Object$create));
        return ListType;
      };
      exports3.List = List;
      List.Type = TypedList;
      List.prototype = TypedList.prototype;
      var ListPrototype = TypedList.prototype;
    });
  }
});

// node_modules/typed-immutable/lib/map.js
var require_map = __commonJS({
  "node_modules/typed-immutable/lib/map.js"(exports2) {
    (function(global2, factory) {
      if (typeof define === "function" && define.amd) {
        define(["exports", "./typed", "immutable"], factory);
      } else if (typeof exports2 !== "undefined") {
        factory(exports2, require_typed(), require_immutable());
      } else {
        var mod = {
          exports: {}
        };
        factory(mod.exports, global2.typed, global2.Immutable);
        global2.map = mod.exports;
      }
    })(exports2, function(exports3, _typed, _immutable) {
      "use strict";
      var _slicedToArray = /* @__PURE__ */ (function() {
        function sliceIterator(arr, i) {
          var _arr = [];
          var _n = true;
          var _d = false;
          var _e = void 0;
          try {
            for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
              _arr.push(_s.value);
              if (i && _arr.length === i) break;
            }
          } catch (err) {
            _d = true;
            _e = err;
          } finally {
            try {
              if (!_n && _i["return"]) _i["return"]();
            } finally {
              if (_d) throw _e;
            }
          }
          return _arr;
        }
        return function(arr, i) {
          if (Array.isArray(arr)) {
            return arr;
          } else if (Symbol.iterator in Object(arr)) {
            return sliceIterator(arr, i);
          } else {
            throw new TypeError("Invalid attempt to destructure non-iterable instance");
          }
        };
      })();
      var _createClass = /* @__PURE__ */ (function() {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }
        return function(Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      })();
      var _get = function get(_x2, _x3, _x4) {
        var _again = true;
        _function: while (_again) {
          var object = _x2, property = _x3, receiver = _x4;
          _again = false;
          if (object === null) object = Function.prototype;
          var desc = Object.getOwnPropertyDescriptor(object, property);
          if (desc === void 0) {
            var parent = Object.getPrototypeOf(object);
            if (parent === null) {
              return void 0;
            } else {
              _x2 = parent;
              _x3 = property;
              _x4 = receiver;
              _again = true;
              desc = parent = void 0;
              continue _function;
            }
          } else if ("value" in desc) {
            return desc.value;
          } else {
            var getter = desc.get;
            if (getter === void 0) {
              return void 0;
            }
            return getter.call(receiver);
          }
        }
      };
      function _defaults(obj, defaults) {
        var keys = Object.getOwnPropertyNames(defaults);
        for (var i = 0; i < keys.length; i++) {
          var key2 = keys[i];
          var value2 = Object.getOwnPropertyDescriptor(defaults, key2);
          if (value2 && value2.configurable && obj[key2] === void 0) {
            Object.defineProperty(obj, key2, value2);
          }
        }
        return obj;
      }
      function _defineProperty(obj, key2, value2) {
        if (key2 in obj) {
          Object.defineProperty(obj, key2, { value: value2, enumerable: true, configurable: true, writable: true });
        } else {
          obj[key2] = value2;
        }
        return obj;
      }
      function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
          throw new TypeError("Cannot call a class as a function");
        }
      }
      function _inherits(subClass, superClass) {
        if (typeof superClass !== "function" && superClass !== null) {
          throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
        }
        subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } });
        if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : _defaults(subClass, superClass);
      }
      var ImmutableMap = _immutable.Map;
      var Keyed = _immutable.Iterable.Keyed;
      var $store = _typed.Typed.store;
      var $type = _typed.Typed.type;
      var $read = _typed.Typed.read;
      var $step = _typed.Typed.step;
      var $init = _typed.Typed.init;
      var $result = _typed.Typed.result;
      var $label = _typed.Typed.label;
      var $typeName = _typed.Typed.typeName;
      var $empty = _typed.Typed.empty;
      var EntryType = (function(_Type) {
        _inherits(EntryType2, _Type);
        function EntryType2(key2, value2, label) {
          _classCallCheck(this, EntryType2);
          _get(Object.getPrototypeOf(EntryType2.prototype), "constructor", this).call(this);
          this.key = key2;
          this.value = value2;
          this.label = label;
        }
        _createClass(EntryType2, [{
          key: _typed.Typed.typeName,
          value: function value2() {
            return this.label || this.key[$typeName]() + ", " + this.value[$typeName]();
          }
        }, {
          key: _typed.Typed.read,
          value: (function(_value) {
            function value2(_x) {
              return _value.apply(this, arguments);
            }
            value2.toString = function() {
              return _value.toString();
            };
            return value2;
          })(function(_ref) {
            var _ref2 = _slicedToArray(_ref, 2);
            var key2 = _ref2[0];
            var value2 = _ref2[1];
            var keyResult = this.key[$read](key2);
            if (keyResult instanceof TypeError) {
              return TypeError("Invalid key: " + keyResult.message);
            }
            var valueResult = this.value[$read](value2);
            if (valueResult instanceof TypeError) {
              return TypeError("Invalid value: " + valueResult.message);
            }
            return [keyResult, valueResult];
          })
        }]);
        return EntryType2;
      })(_typed.Type);
      var InferredEntryType = (function(_EntryType) {
        _inherits(InferredEntryType2, _EntryType);
        function InferredEntryType2() {
          _classCallCheck(this, InferredEntryType2);
          _get(Object.getPrototypeOf(InferredEntryType2.prototype), "constructor", this).call(this, key, value);
        }
        _createClass(InferredEntryType2, [{
          key: "toStatic",
          value: function toStatic() {
            return new MapEntryType(this.key, this.value);
          }
        }, {
          key: _typed.Typed.typeName,
          value: function value2() {
            var key2 = this.key ? this.key[$typeName]() : "TypeInferred";
            var value3 = this.value ? this.value[$typeName]() : "TypeInferred";
            return key2 + ", " + value3;
          }
        }, {
          key: _typed.Typed.read,
          value: function value2(entry) {
            var key2 = (0, _typed.typeOf)(entry[0]).constructor.prototype;
            this.key = this.key ? (0, _typed.Union)(this.key, key2) : key2;
            var value3 = (0, _typed.typeOf)(entry[1]).constructor.prototype;
            this.value = this.value ? (0, _typed.Union)(this.value, value3) : value3;
            return entry;
          }
        }]);
        return InferredEntryType2;
      })(EntryType);
      var BaseImmutableMap = function BaseImmutableMap2() {
      };
      BaseImmutableMap.prototype = _immutable.Map.prototype;
      var TypedMap = (function(_BaseImmutableMap) {
        _inherits(TypedMap2, _BaseImmutableMap);
        function TypedMap2(value2) {
          _classCallCheck(this, TypedMap2);
          _get(Object.getPrototypeOf(TypedMap2.prototype), "constructor", this).call(this);
          return TypedMap2.prototype[$read](value2);
        }
        _createClass(TypedMap2, [{
          key: "advance",
          value: function advance(store) {
            var result = store.__ownerID ? this : (0, _typed.construct)(this);
            result[$store] = store;
            result.size = store.size;
            result.__ownerID = store.__ownerID;
            return result;
          }
        }, {
          key: _typed.Typed.init,
          value: function value2() {
            return this.advance(ImmutableMap()).asMutable();
          }
        }, {
          key: _typed.Typed.step,
          value: function value2(state, entry) {
            var result = this[$type][$read](entry);
            if (result instanceof TypeError) {
              throw result;
            }
            var _result = _slicedToArray(result, 2);
            var key2 = _result[0];
            var value3 = _result[1];
            return state.advance(state[$store].set(key2, value3));
          }
        }, {
          key: _typed.Typed.result,
          value: function value2(state) {
            return state.asImmutable();
          }
        }, {
          key: _typed.Typed.read,
          value: function value2(structure) {
            var constructor = this.constructor;
            if (structure === null || structure === void 0) {
              if (!this[$empty]) {
                this[$empty] = this.advance(ImmutableMap());
              }
              return this[$empty];
            }
            var isInstance = structure instanceof constructor && structure.constructor === constructor;
            if (isInstance) {
              return structure;
            }
            var entries = Keyed(structure).entries();
            var type = this[$type];
            var state = this[$init]();
            while (true) {
              var _entries$next = entries.next();
              var done = _entries$next.done;
              var entry = _entries$next.value;
              if (done) {
                break;
              }
              var result = type[$read](entry);
              if (result instanceof TypeError) {
                return result;
              }
              state = state[$step](state, result);
            }
            return this[$result](state);
          }
        }, {
          key: _typed.Typed.typeName,
          value: function value2() {
            return this[$label] || "Typed.Map(" + this[$type][$typeName]() + ")";
          }
        }, {
          key: "toString",
          value: function toString() {
            return this.__toString(this[$typeName]() + "({", "})");
          }
        }, {
          key: "has",
          value: function has(key2) {
            return this[$store].has(key2);
          }
        }, {
          key: "get",
          value: function get(key2, fallback) {
            return this[$store].get(key2, fallback);
          }
        }, {
          key: "clear",
          value: function clear() {
            if (this.size === 0) {
              return this;
            }
            if (this.__ownerID) {
              return this.advance(this[$store].clear());
            }
            return this[$empty] || this[$read]();
          }
        }, {
          key: "remove",
          value: function remove(key2) {
            return this.advance(this[$store].remove(key2));
          }
        }, {
          key: "set",
          value: function set(key2, value2) {
            return this[$step](this, [key2, value2]);
          }
        }, {
          key: "wasAltered",
          value: function wasAltered() {
            return this[$store].wasAltered();
          }
        }, {
          key: "__ensureOwner",
          value: function __ensureOwner(ownerID) {
            var result = this.__ownerID === ownerID ? this : !ownerID ? this : (0, _typed.construct)(this);
            var store = this[$store].__ensureOwner(ownerID);
            result[$store] = store;
            result.size = store.size;
            result.__ownerID = ownerID;
            return result;
          }
        }, {
          key: "__iterator",
          value: function __iterator(type, reverse) {
            return this[$store].__iterator(type, reverse);
          }
        }, {
          key: "__iterate",
          value: function __iterate(f, reverse) {
            return this[$store].__iterate(f, reverse);
          }
        }]);
        return TypedMap2;
      })(BaseImmutableMap);
      TypedMap.prototype[_typed.Typed.DELETE] = TypedMap.prototype.remove;
      var TypeInferredMap = (function(_TypedMap) {
        _inherits(TypeInferredMap2, _TypedMap);
        function TypeInferredMap2() {
          _classCallCheck(this, TypeInferredMap2);
          _get(Object.getPrototypeOf(TypeInferredMap2.prototype), "constructor", this).call(this);
        }
        _createClass(TypeInferredMap2, [{
          key: _typed.Typed.init,
          value: function value2() {
            var result = this.advance(ImmutableMap()).asMutable();
            result[$type] = new InferredEntryType();
            return result;
          }
        }, {
          key: _typed.Typed.result,
          value: function value2(state) {
            var result = state.asImmutable();
            result[$type] = state[$type].toStatic();
            return result;
          }
        }]);
        return TypeInferredMap2;
      })(TypedMap);
      var Map2 = function Map3(keyDescriptor, valueDescriptor, label) {
        var _Object$create;
        if (keyDescriptor === void 0) {
          throw TypeError("Typed.Map must be passed a key type descriptor");
        }
        if (valueDescriptor === void 0) {
          throw TypeError("Typed.Map must be passed a value type descriptor");
        }
        if (keyDescriptor === _typed.Any && valueDescriptor === _typed.Any) {
          return ImmutableMap;
        }
        var keyType = (0, _typed.typeOf)(keyDescriptor);
        var valueType = (0, _typed.typeOf)(valueDescriptor);
        if (keyType === _typed.Any && keyDescriptor !== _typed.Any) {
          throw TypeError("Typed.Map was passed an invalid key type descriptor: " + keyDescriptor);
        }
        if (valueType === _typed.Any && valueDescriptor !== _typed.Any) {
          throw TypeError("Typed.Map was passed an invalid value type descriptor: " + valueDescriptor);
        }
        var type = new EntryType(keyType, valueType, label);
        var MapType = function MapType2(value2) {
          var isMapType = this instanceof MapType2;
          var constructor = isMapType ? this.constructor : MapType2;
          if (value2 instanceof constructor) {
            return value2;
          }
          var result = constructor.prototype[$read](value2);
          if (result instanceof TypeError) {
            throw result;
          }
          if (isMapType && !this[$store]) {
            this[$store] = result[$store];
            this.size = result.size;
          } else {
            return result;
          }
          return this;
        };
        MapType.of = function() {
          for (var _len = arguments.length, keyValues = Array(_len), _key = 0; _key < _len; _key++) {
            keyValues[_key] = arguments[_key];
          }
          return MapType().withMutations(function(map) {
            for (var i = 0; i < keyValues.length; i += 2) {
              if (i + 1 >= keyValues.length) {
                throw new Error("Missing value for key: " + keyValues[i]);
              }
              map.set(keyValues[i], keyValues[i + 1]);
            }
          });
        };
        MapType.prototype = Object.create(MapPrototype, (_Object$create = {
          constructor: { value: MapType }
        }, _defineProperty(_Object$create, $type, { value: type }), _defineProperty(_Object$create, $label, { value: label }), _Object$create));
        return MapType;
      };
      exports3.Map = Map2;
      Map2.Type = TypedMap;
      Map2.prototype = TypedMap.prototype;
      var MapPrototype = Map2.prototype;
    });
  }
});

// node_modules/typed-immutable/lib/index.js
var require_lib = __commonJS({
  "node_modules/typed-immutable/lib/index.js"(exports2) {
    (function(global2, factory) {
      if (typeof define === "function" && define.amd) {
        define(["exports", "./record", "./list", "./map", "./typed"], factory);
      } else if (typeof exports2 !== "undefined") {
        factory(exports2, require_record(), require_list(), require_map(), require_typed());
      } else {
        var mod = {
          exports: {}
        };
        factory(mod.exports, global2.record, global2.list, global2.map, global2.typed);
        global2.index = mod.exports;
      }
    })(exports2, function(exports3, _record, _list, _map, _typed) {
      "use strict";
      Object.defineProperty(exports3, "Record", {
        enumerable: true,
        get: function get() {
          return _record.Record;
        }
      });
      Object.defineProperty(exports3, "List", {
        enumerable: true,
        get: function get() {
          return _list.List;
        }
      });
      Object.defineProperty(exports3, "Map", {
        enumerable: true,
        get: function get() {
          return _map.Map;
        }
      });
      Object.defineProperty(exports3, "Typed", {
        enumerable: true,
        get: function get() {
          return _typed.Typed;
        }
      });
      Object.defineProperty(exports3, "typeOf", {
        enumerable: true,
        get: function get() {
          return _typed.typeOf;
        }
      });
      Object.defineProperty(exports3, "Type", {
        enumerable: true,
        get: function get() {
          return _typed.Type;
        }
      });
      Object.defineProperty(exports3, "Any", {
        enumerable: true,
        get: function get() {
          return _typed.Any;
        }
      });
      Object.defineProperty(exports3, "Union", {
        enumerable: true,
        get: function get() {
          return _typed.Union;
        }
      });
      Object.defineProperty(exports3, "Maybe", {
        enumerable: true,
        get: function get() {
          return _typed.Maybe;
        }
      });
    });
  }
});

// node_modules/lodash.isfunction/index.js
var require_lodash = __commonJS({
  "node_modules/lodash.isfunction/index.js"(exports2, module2) {
    var asyncTag = "[object AsyncFunction]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var nullTag = "[object Null]";
    var proxyTag = "[object Proxy]";
    var undefinedTag = "[object Undefined]";
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    var objectProto = Object.prototype;
    var hasOwnProperty2 = objectProto.hasOwnProperty;
    var nativeObjectToString = objectProto.toString;
    var Symbol2 = root.Symbol;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function baseGetTag(value2) {
      if (value2 == null) {
        return value2 === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value2) ? getRawTag(value2) : objectToString(value2);
    }
    function getRawTag(value2) {
      var isOwn = hasOwnProperty2.call(value2, symToStringTag), tag = value2[symToStringTag];
      try {
        value2[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value2);
      if (unmasked) {
        if (isOwn) {
          value2[symToStringTag] = tag;
        } else {
          delete value2[symToStringTag];
        }
      }
      return result;
    }
    function objectToString(value2) {
      return nativeObjectToString.call(value2);
    }
    function isFunction(value2) {
      if (!isObject(value2)) {
        return false;
      }
      var tag = baseGetTag(value2);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    function isObject(value2) {
      var type = typeof value2;
      return value2 != null && (type == "object" || type == "function");
    }
    module2.exports = isFunction;
  }
});

// node_modules/lodash.isnull/index.js
var require_lodash2 = __commonJS({
  "node_modules/lodash.isnull/index.js"(exports2, module2) {
    function isNull(value2) {
      return value2 === null;
    }
    module2.exports = isNull;
  }
});

// node_modules/lodash.isundefined/index.js
var require_lodash3 = __commonJS({
  "node_modules/lodash.isundefined/index.js"(exports2, module2) {
    function isUndefined2(value2) {
      return value2 === void 0;
    }
    module2.exports = isUndefined2;
  }
});

// node_modules/lodash.isdate/index.js
var require_lodash4 = __commonJS({
  "node_modules/lodash.isdate/index.js"(exports2, module2) {
    var dateTag = "[object Date]";
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeExports = typeof exports2 == "object" && exports2 && !exports2.nodeType && exports2;
    var freeModule = freeExports && typeof module2 == "object" && module2 && !module2.nodeType && module2;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        return freeProcess && freeProcess.binding("util");
      } catch (e) {
      }
    })();
    var nodeIsDate = nodeUtil && nodeUtil.isDate;
    function baseUnary(func) {
      return function(value2) {
        return func(value2);
      };
    }
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function baseIsDate(value2) {
      return isObjectLike(value2) && objectToString.call(value2) == dateTag;
    }
    var isDate2 = nodeIsDate ? baseUnary(nodeIsDate) : baseIsDate;
    function isObjectLike(value2) {
      return !!value2 && typeof value2 == "object";
    }
    module2.exports = isDate2;
  }
});

// node_modules/lodash.padstart/index.js
var require_lodash5 = __commonJS({
  "node_modules/lodash.padstart/index.js"(exports2, module2) {
    var INFINITY = 1 / 0;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var rsAstralRange = "\\ud800-\\udfff";
    var rsComboMarksRange = "\\u0300-\\u036f\\ufe20-\\ufe23";
    var rsComboSymbolsRange = "\\u20d0-\\u20f0";
    var rsVarRange = "\\ufe0e\\ufe0f";
    var rsAstral = "[" + rsAstralRange + "]";
    var rsCombo = "[" + rsComboMarksRange + rsComboSymbolsRange + "]";
    var rsFitz = "\\ud83c[\\udffb-\\udfff]";
    var rsModifier = "(?:" + rsCombo + "|" + rsFitz + ")";
    var rsNonAstral = "[^" + rsAstralRange + "]";
    var rsRegional = "(?:\\ud83c[\\udde6-\\uddff]){2}";
    var rsSurrPair = "[\\ud800-\\udbff][\\udc00-\\udfff]";
    var rsZWJ = "\\u200d";
    var reOptMod = rsModifier + "?";
    var rsOptVar = "[" + rsVarRange + "]?";
    var rsOptJoin = "(?:" + rsZWJ + "(?:" + [rsNonAstral, rsRegional, rsSurrPair].join("|") + ")" + rsOptVar + reOptMod + ")*";
    var rsSeq = rsOptVar + reOptMod + rsOptJoin;
    var rsSymbol = "(?:" + [rsNonAstral + rsCombo + "?", rsCombo, rsRegional, rsSurrPair, rsAstral].join("|") + ")";
    var reUnicode = RegExp(rsFitz + "(?=" + rsFitz + ")|" + rsSymbol + rsSeq, "g");
    var reHasUnicode = RegExp("[" + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + "]");
    var freeParseInt = parseInt;
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    var asciiSize = baseProperty("length");
    function asciiToArray(string) {
      return string.split("");
    }
    function baseProperty(key2) {
      return function(object) {
        return object == null ? void 0 : object[key2];
      };
    }
    function hasUnicode(string) {
      return reHasUnicode.test(string);
    }
    function stringSize(string) {
      return hasUnicode(string) ? unicodeSize(string) : asciiSize(string);
    }
    function stringToArray(string) {
      return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
    }
    function unicodeSize(string) {
      var result = reUnicode.lastIndex = 0;
      while (reUnicode.test(string)) {
        result++;
      }
      return result;
    }
    function unicodeToArray(string) {
      return string.match(reUnicode) || [];
    }
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    var Symbol2 = root.Symbol;
    var nativeCeil = Math.ceil;
    var nativeFloor = Math.floor;
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function baseRepeat(string, n2) {
      var result = "";
      if (!string || n2 < 1 || n2 > MAX_SAFE_INTEGER) {
        return result;
      }
      do {
        if (n2 % 2) {
          result += string;
        }
        n2 = nativeFloor(n2 / 2);
        if (n2) {
          string += string;
        }
      } while (n2);
      return result;
    }
    function baseSlice(array, start, end) {
      var index = -1, length = array.length;
      if (start < 0) {
        start = -start > length ? 0 : length + start;
      }
      end = end > length ? length : end;
      if (end < 0) {
        end += length;
      }
      length = start > end ? 0 : end - start >>> 0;
      start >>>= 0;
      var result = Array(length);
      while (++index < length) {
        result[index] = array[index + start];
      }
      return result;
    }
    function baseToString(value2) {
      if (typeof value2 == "string") {
        return value2;
      }
      if (isSymbol(value2)) {
        return symbolToString ? symbolToString.call(value2) : "";
      }
      var result = value2 + "";
      return result == "0" && 1 / value2 == -INFINITY ? "-0" : result;
    }
    function castSlice(array, start, end) {
      var length = array.length;
      end = end === void 0 ? length : end;
      return !start && end >= length ? array : baseSlice(array, start, end);
    }
    function createPadding(length, chars) {
      chars = chars === void 0 ? " " : baseToString(chars);
      var charsLength = chars.length;
      if (charsLength < 2) {
        return charsLength ? baseRepeat(chars, length) : chars;
      }
      var result = baseRepeat(chars, nativeCeil(length / stringSize(chars)));
      return hasUnicode(chars) ? castSlice(stringToArray(result), 0, length).join("") : result.slice(0, length);
    }
    function isObject(value2) {
      var type = typeof value2;
      return !!value2 && (type == "object" || type == "function");
    }
    function isObjectLike(value2) {
      return !!value2 && typeof value2 == "object";
    }
    function isSymbol(value2) {
      return typeof value2 == "symbol" || isObjectLike(value2) && objectToString.call(value2) == symbolTag;
    }
    function toFinite(value2) {
      if (!value2) {
        return value2 === 0 ? value2 : 0;
      }
      value2 = toNumber(value2);
      if (value2 === INFINITY || value2 === -INFINITY) {
        var sign = value2 < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value2 === value2 ? value2 : 0;
    }
    function toInteger(value2) {
      var result = toFinite(value2), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value2) {
      if (typeof value2 == "number") {
        return value2;
      }
      if (isSymbol(value2)) {
        return NAN;
      }
      if (isObject(value2)) {
        var other = typeof value2.valueOf == "function" ? value2.valueOf() : value2;
        value2 = isObject(other) ? other + "" : other;
      }
      if (typeof value2 != "string") {
        return value2 === 0 ? value2 : +value2;
      }
      value2 = value2.replace(reTrim, "");
      var isBinary = reIsBinary.test(value2);
      return isBinary || reIsOctal.test(value2) ? freeParseInt(value2.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value2) ? NAN : +value2;
    }
    function toString(value2) {
      return value2 == null ? "" : baseToString(value2);
    }
    function padStart2(string, length, chars) {
      string = toString(string);
      length = toInteger(length);
      var strLength = length ? stringSize(string) : 0;
      return length && strLength < length ? createPadding(length - strLength, chars) + string : string;
    }
    module2.exports = padStart2;
  }
});

// node_modules/immutable-ics/dist/immutable-ics.cjs.js
var require_immutable_ics_cjs = __commonJS({
  "node_modules/immutable-ics/dist/immutable-ics.cjs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    function _interopDefault(ex) {
      return ex && typeof ex === "object" && "default" in ex ? ex["default"] : ex;
    }
    var typedImmutable = require_lib();
    var isFunction = _interopDefault(require_lodash());
    var isNull = _interopDefault(require_lodash2());
    var isUndefined2 = _interopDefault(require_lodash3());
    var isDate2 = _interopDefault(require_lodash4());
    var padStart2 = _interopDefault(require_lodash5());
    var formatDate = (function(a) {
      return a.getFullYear() + padStart2(a.getMonth() + 1, 2, 0) + padStart2(a.getDate(), 2, 0);
    });
    var formatTime = (function(a) {
      return padStart2(a.getHours(), 2, 0) + padStart2(a.getMinutes(), 2, 0) + padStart2(a.getSeconds(), 2, 0);
    });
    var formatDateTime = (function(a) {
      return formatDate(a) + "T" + formatTime(a);
    });
    var removeTimeZoneOffset = (function(a) {
      var b = 6e4 * a.getTimezoneOffset();
      return new Date(a.getTime() + b);
    });
    var BOOLEAN = function(a) {
      return a ? "TRUE" : "FALSE";
    };
    var DATE = function(a) {
      return isDate2(a) ? formatDate(removeTimeZoneOffset(a)) : a;
    };
    var DATETIME = function(a) {
      return isDate2(a) ? formatDateTime(a) : a;
    };
    var FLOAT = function(a) {
      return Number.parseFloat(a);
    };
    var FLOAT__FIXED_1 = function() {
      return FLOAT.apply(void 0, arguments).toFixed(1);
    };
    var INTEGER = function(a) {
      return Number.parseInt(a);
    };
    var TEXT = function(a) {
      return a.toString().replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
    };
    var TIME = function(a) {
      return isDate2(a) ? formatTime(removeTimeZoneOffset(a)) : a;
    };
    var transformers = Object.freeze({
      BOOLEAN,
      DATE,
      DATETIME,
      FLOAT,
      FLOAT__FIXED_1,
      INTEGER,
      TEXT,
      TIME
    });
    var FOLD_SEPARATOR = "\r\n ";
    var LINE_SEPARATOR = "\r\n";
    var PARAMETER_SEPARATOR = ";";
    var PARAMETER_KV_SEPARATOR = "=";
    var PARAMETER_VALUE_KEY = "VALUE";
    var PROPERTY_KV_SEPARATOR = ":";
    var VALUE_SEPARATOR = ",";
    var FOLD_REGEX = new RegExp(/[\s\S]{1,75}/g);
    var PREFIX = "BEGIN";
    var SUFFIX = "END";
    var VALUE_TYPES = { BINARY: "BINARY", BOOLEAN: "BOOLEAN", CALADDRESS: "CALADDRESS", "CAL-ADDRESS": "CALADDRESS", DATE: "DATE", DATETIME: "DATETIME", "DATE-TIME": "DATETIME", DURATION: "DURATION", FLOAT: "FLOAT", INTEGER: "INTEGER", PERIOD: "PERIOD", RECUR: "RECUR", TEXT: "TEXT", TIME: "TIME", URI: "URI", UTCOFFSET: "UTCOFFSET", "UTC-OFFSET": "UTCOFFSET" };
    var DEFAULT_VALUE_TYPE = VALUE_TYPES.TEXT;
    var DEFAULT_VALUE_TYPES = { ATTACH: VALUE_TYPES.URI, ATTENDEE: VALUE_TYPES.CALADDRESS, CREATED: VALUE_TYPES.DATETIME, DTSTART: VALUE_TYPES.DATETIME, DTEND: VALUE_TYPES.DATETIME, DTSTAMP: VALUE_TYPES.DATETIME, DUE: VALUE_TYPES.DATETIME, DURATION: VALUE_TYPES.DURATION, EXDATE: VALUE_TYPES.DATETIME, FREEBUSY: VALUE_TYPES.PERIOD, "LAST-MODIFIED": VALUE_TYPES.DATETIME, ORGANIZER: VALUE_TYPES.CALADDRESS, "PERCENT-COMPLETE": VALUE_TYPES.INTEGER, PRIORITY: VALUE_TYPES.INTEGER, RDATE: VALUE_TYPES.DATETIME, "RECURRENCE-ID": VALUE_TYPES.DATETIME, REPEAT: VALUE_TYPES.INTEGER, RRULE: VALUE_TYPES.RECUR, SEQUENCE: VALUE_TYPES.INTEGER, TRIGGER: VALUE_TYPES.DURATION, TZOFFSETFROM: VALUE_TYPES.UTCOFFSET, TZOFFSETTO: VALUE_TYPES.UTCOFFSET, TZURL: VALUE_TYPES.URI, URL: VALUE_TYPES.URI, VERSION: VALUE_TYPES.FLOAT + "__FIXED_1" };
    var classCallCheck = function(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    };
    var createClass = /* @__PURE__ */ (function() {
      function defineProperties(target, props) {
        for (var i = 0; i < props.length; i++) {
          var descriptor = props[i];
          descriptor.enumerable = descriptor.enumerable || false;
          descriptor.configurable = true;
          if ("value" in descriptor) descriptor.writable = true;
          Object.defineProperty(target, descriptor.key, descriptor);
        }
      }
      return function(Constructor, protoProps, staticProps) {
        if (protoProps) defineProperties(Constructor.prototype, protoProps);
        if (staticProps) defineProperties(Constructor, staticProps);
        return Constructor;
      };
    })();
    var inherits = function(subClass, superClass) {
      if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
      }
      subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
          value: subClass,
          enumerable: false,
          writable: true,
          configurable: true
        }
      });
      if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
    };
    var possibleConstructorReturn = function(self2, call) {
      if (!self2) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }
      return call && (typeof call === "object" || typeof call === "function") ? call : self2;
    };
    var slicedToArray = /* @__PURE__ */ (function() {
      function sliceIterator(arr, i) {
        var _arr = [];
        var _n = true;
        var _d = false;
        var _e = void 0;
        try {
          for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
            _arr.push(_s.value);
            if (i && _arr.length === i) break;
          }
        } catch (err) {
          _d = true;
          _e = err;
        } finally {
          try {
            if (!_n && _i["return"]) _i["return"]();
          } finally {
            if (_d) throw _e;
          }
        }
        return _arr;
      }
      return function(arr, i) {
        if (Array.isArray(arr)) {
          return arr;
        } else if (Symbol.iterator in Object(arr)) {
          return sliceIterator(arr, i);
        } else {
          throw new TypeError("Invalid attempt to destructure non-iterable instance");
        }
      };
    })();
    var toConsumableArray = function(arr) {
      if (Array.isArray(arr)) {
        for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];
        return arr2;
      } else {
        return Array.from(arr);
      }
    };
    var Property2 = (function(a) {
      function b() {
        return classCallCheck(this, b), possibleConstructorReturn(this, (b.__proto__ || Object.getPrototypeOf(b)).apply(this, arguments));
      }
      return inherits(b, a), createClass(b, [{ key: "getTransformedValue", value: function getTransformedValue() {
        var a2 = this, b2 = VALUE_TYPES[this.parameters.get(PARAMETER_VALUE_KEY)] || DEFAULT_VALUE_TYPES[this.name] || DEFAULT_VALUE_TYPE, c = transformers[b2];
        return isFunction(c) ? Array.isArray(this.value) ? this.value.map(function(b3) {
          return c(b3, a2.parameters);
        }).join(VALUE_SEPARATOR) : c(this.value, this.parameters) : this.value;
      } }, { key: "toString", value: function toString() {
        var a2 = this.name;
        0 < this.parameters.size && (a2 += PARAMETER_SEPARATOR + this.parameters.entrySeq().map(function(a3) {
          var b3 = slicedToArray(a3, 2), c = b3[0], d = b3[1];
          return c + PARAMETER_KV_SEPARATOR + d;
        }).join(PARAMETER_SEPARATOR));
        var b2 = this.transform ? this.getTransformedValue() : this.value;
        return isNull(b2) || isUndefined2(b2) || (a2 += PROPERTY_KV_SEPARATOR + b2), a2.match(FOLD_REGEX).join(FOLD_SEPARATOR);
      } }]), b;
    })(typedImmutable.Record({ name: String, parameters: typedImmutable.Map(String, typedImmutable.Any), transform: true, value: typedImmutable.Any }));
    typedImmutable.Typed.Component = typedImmutable.Typed("Component", function(a) {
      return a instanceof Component2 ? a : TypeError('"' + a + '" is not a Component');
    }), typedImmutable.Typed.Property = typedImmutable.Typed("Property", function(a) {
      return a instanceof Property2 ? a : TypeError('"' + a + '" is not a Property');
    });
    var Component2 = (function(a) {
      function b() {
        return classCallCheck(this, b), possibleConstructorReturn(this, (b.__proto__ || Object.getPrototypeOf(b)).apply(this, arguments));
      }
      return inherits(b, a), createClass(b, [{ key: "pushComponent", value: function pushComponent(a2) {
        return this.update("components", function(b2) {
          return b2.push(a2);
        });
      } }, { key: "pushProperty", value: function pushProperty(a2) {
        return this.update("properties", function(b2) {
          return b2.push(a2);
        });
      } }, { key: "clear", value: function clear() {
        return this.clearComponents().clearProperties();
      } }, { key: "clearComponents", value: function clearComponents() {
        return this.remove("components");
      } }, { key: "clearProperties", value: function clearProperties() {
        return this.remove("properties");
      } }, { key: "toString", value: function toString() {
        return [new Property2({ name: PREFIX, value: this.name })].concat(toConsumableArray(this.properties), toConsumableArray(this.components), [new Property2({ name: SUFFIX, value: this.name })]).join(LINE_SEPARATOR);
      } }]), b;
    })(typedImmutable.Record({ name: String, components: typedImmutable.List(typedImmutable.Typed.Component), properties: typedImmutable.List(typedImmutable.Typed.Property) }));
    exports2.Component = Component2;
    exports2.Property = Property2;
  }
});

// src/vendor/polimi-schedule-js/schedule-to-ical.mjs
var schedule_to_ical_exports = {};
__export(schedule_to_ical_exports, {
  getIcalendar: () => getIcalendar,
  parseText: () => parseText
});
module.exports = __toCommonJS(schedule_to_ical_exports);

// node_modules/luxon/build/es6/luxon.mjs
var LuxonError = class extends Error {
};
var InvalidDateTimeError = class extends LuxonError {
  constructor(reason) {
    super(`Invalid DateTime: ${reason.toMessage()}`);
  }
};
var InvalidIntervalError = class extends LuxonError {
  constructor(reason) {
    super(`Invalid Interval: ${reason.toMessage()}`);
  }
};
var InvalidDurationError = class extends LuxonError {
  constructor(reason) {
    super(`Invalid Duration: ${reason.toMessage()}`);
  }
};
var ConflictingSpecificationError = class extends LuxonError {
};
var InvalidUnitError = class extends LuxonError {
  constructor(unit) {
    super(`Invalid unit ${unit}`);
  }
};
var InvalidArgumentError = class extends LuxonError {
};
var ZoneIsAbstractError = class extends LuxonError {
  constructor() {
    super("Zone is an abstract class");
  }
};
var n = "numeric";
var s = "short";
var l = "long";
var DATE_SHORT = {
  year: n,
  month: n,
  day: n
};
var DATE_MED = {
  year: n,
  month: s,
  day: n
};
var DATE_MED_WITH_WEEKDAY = {
  year: n,
  month: s,
  day: n,
  weekday: s
};
var DATE_FULL = {
  year: n,
  month: l,
  day: n
};
var DATE_HUGE = {
  year: n,
  month: l,
  day: n,
  weekday: l
};
var TIME_SIMPLE = {
  hour: n,
  minute: n
};
var TIME_WITH_SECONDS = {
  hour: n,
  minute: n,
  second: n
};
var TIME_WITH_SHORT_OFFSET = {
  hour: n,
  minute: n,
  second: n,
  timeZoneName: s
};
var TIME_WITH_LONG_OFFSET = {
  hour: n,
  minute: n,
  second: n,
  timeZoneName: l
};
var TIME_24_SIMPLE = {
  hour: n,
  minute: n,
  hourCycle: "h23"
};
var TIME_24_WITH_SECONDS = {
  hour: n,
  minute: n,
  second: n,
  hourCycle: "h23"
};
var TIME_24_WITH_SHORT_OFFSET = {
  hour: n,
  minute: n,
  second: n,
  hourCycle: "h23",
  timeZoneName: s
};
var TIME_24_WITH_LONG_OFFSET = {
  hour: n,
  minute: n,
  second: n,
  hourCycle: "h23",
  timeZoneName: l
};
var DATETIME_SHORT = {
  year: n,
  month: n,
  day: n,
  hour: n,
  minute: n
};
var DATETIME_SHORT_WITH_SECONDS = {
  year: n,
  month: n,
  day: n,
  hour: n,
  minute: n,
  second: n
};
var DATETIME_MED = {
  year: n,
  month: s,
  day: n,
  hour: n,
  minute: n
};
var DATETIME_MED_WITH_SECONDS = {
  year: n,
  month: s,
  day: n,
  hour: n,
  minute: n,
  second: n
};
var DATETIME_MED_WITH_WEEKDAY = {
  year: n,
  month: s,
  day: n,
  weekday: s,
  hour: n,
  minute: n
};
var DATETIME_FULL = {
  year: n,
  month: l,
  day: n,
  hour: n,
  minute: n,
  timeZoneName: s
};
var DATETIME_FULL_WITH_SECONDS = {
  year: n,
  month: l,
  day: n,
  hour: n,
  minute: n,
  second: n,
  timeZoneName: s
};
var DATETIME_HUGE = {
  year: n,
  month: l,
  day: n,
  weekday: l,
  hour: n,
  minute: n,
  timeZoneName: l
};
var DATETIME_HUGE_WITH_SECONDS = {
  year: n,
  month: l,
  day: n,
  weekday: l,
  hour: n,
  minute: n,
  second: n,
  timeZoneName: l
};
var Zone = class {
  /**
   * The type of zone
   * @abstract
   * @type {string}
   */
  get type() {
    throw new ZoneIsAbstractError();
  }
  /**
   * The name of this zone.
   * @abstract
   * @type {string}
   */
  get name() {
    throw new ZoneIsAbstractError();
  }
  /**
   * The IANA name of this zone.
   * Defaults to `name` if not overwritten by a subclass.
   * @abstract
   * @type {string}
   */
  get ianaName() {
    return this.name;
  }
  /**
   * Returns whether the offset is known to be fixed for the whole year.
   * @abstract
   * @type {boolean}
   */
  get isUniversal() {
    throw new ZoneIsAbstractError();
  }
  /**
   * Returns the offset's common name (such as EST) at the specified timestamp
   * @abstract
   * @param {number} ts - Epoch milliseconds for which to get the name
   * @param {Object} opts - Options to affect the format
   * @param {string} opts.format - What style of offset to return. Accepts 'long' or 'short'.
   * @param {string} opts.locale - What locale to return the offset name in.
   * @return {string}
   */
  offsetName(ts, opts) {
    throw new ZoneIsAbstractError();
  }
  /**
   * Returns the offset's value as a string
   * @abstract
   * @param {number} ts - Epoch milliseconds for which to get the offset
   * @param {string} format - What style of offset to return.
   *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
   * @return {string}
   */
  formatOffset(ts, format) {
    throw new ZoneIsAbstractError();
  }
  /**
   * Return the offset in minutes for this zone at the specified timestamp.
   * @abstract
   * @param {number} ts - Epoch milliseconds for which to compute the offset
   * @return {number}
   */
  offset(ts) {
    throw new ZoneIsAbstractError();
  }
  /**
   * Return whether this Zone is equal to another zone
   * @abstract
   * @param {Zone} otherZone - the zone to compare
   * @return {boolean}
   */
  equals(otherZone) {
    throw new ZoneIsAbstractError();
  }
  /**
   * Return whether this Zone is valid.
   * @abstract
   * @type {boolean}
   */
  get isValid() {
    throw new ZoneIsAbstractError();
  }
};
var singleton$1 = null;
var SystemZone = class _SystemZone extends Zone {
  /**
   * Get a singleton instance of the local zone
   * @return {SystemZone}
   */
  static get instance() {
    if (singleton$1 === null) {
      singleton$1 = new _SystemZone();
    }
    return singleton$1;
  }
  /** @override **/
  get type() {
    return "system";
  }
  /** @override **/
  get name() {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  /** @override **/
  get isUniversal() {
    return false;
  }
  /** @override **/
  offsetName(ts, { format, locale }) {
    return parseZoneInfo(ts, format, locale);
  }
  /** @override **/
  formatOffset(ts, format) {
    return formatOffset(this.offset(ts), format);
  }
  /** @override **/
  offset(ts) {
    return -new Date(ts).getTimezoneOffset();
  }
  /** @override **/
  equals(otherZone) {
    return otherZone.type === "system";
  }
  /** @override **/
  get isValid() {
    return true;
  }
};
var dtfCache = /* @__PURE__ */ new Map();
function makeDTF(zoneName) {
  let dtf = dtfCache.get(zoneName);
  if (dtf === void 0) {
    dtf = new Intl.DateTimeFormat("en-US", {
      hour12: false,
      timeZone: zoneName,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      era: "short"
    });
    dtfCache.set(zoneName, dtf);
  }
  return dtf;
}
var typeToPos = {
  year: 0,
  month: 1,
  day: 2,
  era: 3,
  hour: 4,
  minute: 5,
  second: 6
};
function hackyOffset(dtf, date) {
  const formatted = dtf.format(date).replace(/\u200E/g, ""), parsed = /(\d+)\/(\d+)\/(\d+) (AD|BC),? (\d+):(\d+):(\d+)/.exec(formatted), [, fMonth, fDay, fYear, fadOrBc, fHour, fMinute, fSecond] = parsed;
  return [fYear, fMonth, fDay, fadOrBc, fHour, fMinute, fSecond];
}
function partsOffset(dtf, date) {
  const formatted = dtf.formatToParts(date);
  const filled = [];
  for (let i = 0; i < formatted.length; i++) {
    const { type, value: value2 } = formatted[i];
    const pos = typeToPos[type];
    if (type === "era") {
      filled[pos] = value2;
    } else if (!isUndefined(pos)) {
      filled[pos] = parseInt(value2, 10);
    }
  }
  return filled;
}
var ianaZoneCache = /* @__PURE__ */ new Map();
var IANAZone = class _IANAZone extends Zone {
  /**
   * @param {string} name - Zone name
   * @return {IANAZone}
   */
  static create(name) {
    let zone = ianaZoneCache.get(name);
    if (zone === void 0) {
      ianaZoneCache.set(name, zone = new _IANAZone(name));
    }
    return zone;
  }
  /**
   * Reset local caches. Should only be necessary in testing scenarios.
   * @return {void}
   */
  static resetCache() {
    ianaZoneCache.clear();
    dtfCache.clear();
  }
  /**
   * Returns whether the provided string is a valid specifier. This only checks the string's format, not that the specifier identifies a known zone; see isValidZone for that.
   * @param {string} s - The string to check validity on
   * @example IANAZone.isValidSpecifier("America/New_York") //=> true
   * @example IANAZone.isValidSpecifier("Sport~~blorp") //=> false
   * @deprecated For backward compatibility, this forwards to isValidZone, better use `isValidZone()` directly instead.
   * @return {boolean}
   */
  static isValidSpecifier(s2) {
    return this.isValidZone(s2);
  }
  /**
   * Returns whether the provided string identifies a real zone
   * @param {string} zone - The string to check
   * @example IANAZone.isValidZone("America/New_York") //=> true
   * @example IANAZone.isValidZone("Fantasia/Castle") //=> false
   * @example IANAZone.isValidZone("Sport~~blorp") //=> false
   * @return {boolean}
   */
  static isValidZone(zone) {
    if (!zone) {
      return false;
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
      return true;
    } catch (e) {
      return false;
    }
  }
  constructor(name) {
    super();
    this.zoneName = name;
    this.valid = _IANAZone.isValidZone(name);
  }
  /**
   * The type of zone. `iana` for all instances of `IANAZone`.
   * @override
   * @type {string}
   */
  get type() {
    return "iana";
  }
  /**
   * The name of this zone (i.e. the IANA zone name).
   * @override
   * @type {string}
   */
  get name() {
    return this.zoneName;
  }
  /**
   * Returns whether the offset is known to be fixed for the whole year:
   * Always returns false for all IANA zones.
   * @override
   * @type {boolean}
   */
  get isUniversal() {
    return false;
  }
  /**
   * Returns the offset's common name (such as EST) at the specified timestamp
   * @override
   * @param {number} ts - Epoch milliseconds for which to get the name
   * @param {Object} opts - Options to affect the format
   * @param {string} opts.format - What style of offset to return. Accepts 'long' or 'short'.
   * @param {string} opts.locale - What locale to return the offset name in.
   * @return {string}
   */
  offsetName(ts, { format, locale }) {
    return parseZoneInfo(ts, format, locale, this.name);
  }
  /**
   * Returns the offset's value as a string
   * @override
   * @param {number} ts - Epoch milliseconds for which to get the offset
   * @param {string} format - What style of offset to return.
   *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
   * @return {string}
   */
  formatOffset(ts, format) {
    return formatOffset(this.offset(ts), format);
  }
  /**
   * Return the offset in minutes for this zone at the specified timestamp.
   * @override
   * @param {number} ts - Epoch milliseconds for which to compute the offset
   * @return {number}
   */
  offset(ts) {
    if (!this.valid) return NaN;
    const date = new Date(ts);
    if (isNaN(date)) return NaN;
    const dtf = makeDTF(this.name);
    let [year, month, day, adOrBc, hour, minute, second] = dtf.formatToParts ? partsOffset(dtf, date) : hackyOffset(dtf, date);
    if (adOrBc === "BC") {
      year = -Math.abs(year) + 1;
    }
    const adjustedHour = hour === 24 ? 0 : hour;
    const asUTC = objToLocalTS({
      year,
      month,
      day,
      hour: adjustedHour,
      minute,
      second,
      millisecond: 0
    });
    let asTS = +date;
    const over = asTS % 1e3;
    asTS -= over >= 0 ? over : 1e3 + over;
    return (asUTC - asTS) / (60 * 1e3);
  }
  /**
   * Return whether this Zone is equal to another zone
   * @override
   * @param {Zone} otherZone - the zone to compare
   * @return {boolean}
   */
  equals(otherZone) {
    return otherZone.type === "iana" && otherZone.name === this.name;
  }
  /**
   * Return whether this Zone is valid.
   * @override
   * @type {boolean}
   */
  get isValid() {
    return this.valid;
  }
};
var intlLFCache = {};
function getCachedLF(locString, opts = {}) {
  const key2 = JSON.stringify([locString, opts]);
  let dtf = intlLFCache[key2];
  if (!dtf) {
    dtf = new Intl.ListFormat(locString, opts);
    intlLFCache[key2] = dtf;
  }
  return dtf;
}
var intlDTCache = /* @__PURE__ */ new Map();
function getCachedDTF(locString, opts = {}) {
  const key2 = JSON.stringify([locString, opts]);
  let dtf = intlDTCache.get(key2);
  if (dtf === void 0) {
    dtf = new Intl.DateTimeFormat(locString, opts);
    intlDTCache.set(key2, dtf);
  }
  return dtf;
}
var intlNumCache = /* @__PURE__ */ new Map();
function getCachedINF(locString, opts = {}) {
  const key2 = JSON.stringify([locString, opts]);
  let inf = intlNumCache.get(key2);
  if (inf === void 0) {
    inf = new Intl.NumberFormat(locString, opts);
    intlNumCache.set(key2, inf);
  }
  return inf;
}
var intlRelCache = /* @__PURE__ */ new Map();
function getCachedRTF(locString, opts = {}) {
  const { base, ...cacheKeyOpts } = opts;
  const key2 = JSON.stringify([locString, cacheKeyOpts]);
  let inf = intlRelCache.get(key2);
  if (inf === void 0) {
    inf = new Intl.RelativeTimeFormat(locString, opts);
    intlRelCache.set(key2, inf);
  }
  return inf;
}
var sysLocaleCache = null;
function systemLocale() {
  if (sysLocaleCache) {
    return sysLocaleCache;
  } else {
    sysLocaleCache = new Intl.DateTimeFormat().resolvedOptions().locale;
    return sysLocaleCache;
  }
}
var intlResolvedOptionsCache = /* @__PURE__ */ new Map();
function getCachedIntResolvedOptions(locString) {
  let opts = intlResolvedOptionsCache.get(locString);
  if (opts === void 0) {
    opts = new Intl.DateTimeFormat(locString).resolvedOptions();
    intlResolvedOptionsCache.set(locString, opts);
  }
  return opts;
}
var weekInfoCache = /* @__PURE__ */ new Map();
function getCachedWeekInfo(locString) {
  let data = weekInfoCache.get(locString);
  if (!data) {
    const locale = new Intl.Locale(locString);
    data = "getWeekInfo" in locale ? locale.getWeekInfo() : locale.weekInfo;
    if (!("minimalDays" in data)) {
      data = { ...fallbackWeekSettings, ...data };
    }
    weekInfoCache.set(locString, data);
  }
  return data;
}
function parseLocaleString(localeStr) {
  const xIndex = localeStr.indexOf("-x-");
  if (xIndex !== -1) {
    localeStr = localeStr.substring(0, xIndex);
  }
  const uIndex = localeStr.indexOf("-u-");
  if (uIndex === -1) {
    return [localeStr];
  } else {
    let options;
    let selectedStr;
    try {
      options = getCachedDTF(localeStr).resolvedOptions();
      selectedStr = localeStr;
    } catch (e) {
      const smaller = localeStr.substring(0, uIndex);
      options = getCachedDTF(smaller).resolvedOptions();
      selectedStr = smaller;
    }
    const { numberingSystem, calendar } = options;
    return [selectedStr, numberingSystem, calendar];
  }
}
function intlConfigString(localeStr, numberingSystem, outputCalendar) {
  if (outputCalendar || numberingSystem) {
    if (!localeStr.includes("-u-")) {
      localeStr += "-u";
    }
    if (outputCalendar) {
      localeStr += `-ca-${outputCalendar}`;
    }
    if (numberingSystem) {
      localeStr += `-nu-${numberingSystem}`;
    }
    return localeStr;
  } else {
    return localeStr;
  }
}
function mapMonths(f) {
  const ms = [];
  for (let i = 1; i <= 12; i++) {
    const dt = DateTime.utc(2009, i, 1);
    ms.push(f(dt));
  }
  return ms;
}
function mapWeekdays(f) {
  const ms = [];
  for (let i = 1; i <= 7; i++) {
    const dt = DateTime.utc(2016, 11, 13 + i);
    ms.push(f(dt));
  }
  return ms;
}
function listStuff(loc, length, englishFn, intlFn) {
  const mode = loc.listingMode();
  if (mode === "error") {
    return null;
  } else if (mode === "en") {
    return englishFn(length);
  } else {
    return intlFn(length);
  }
}
function supportsFastNumbers(loc) {
  if (loc.numberingSystem && loc.numberingSystem !== "latn") {
    return false;
  } else {
    return loc.numberingSystem === "latn" || !loc.locale || loc.locale.startsWith("en") || getCachedIntResolvedOptions(loc.locale).numberingSystem === "latn";
  }
}
var PolyNumberFormatter = class {
  constructor(intl, forceSimple, opts) {
    this.padTo = opts.padTo || 0;
    this.floor = opts.floor || false;
    const { padTo, floor, ...otherOpts } = opts;
    if (!forceSimple || Object.keys(otherOpts).length > 0) {
      const intlOpts = { useGrouping: false, ...opts };
      if (opts.padTo > 0) intlOpts.minimumIntegerDigits = opts.padTo;
      this.inf = getCachedINF(intl, intlOpts);
    }
  }
  format(i) {
    if (this.inf) {
      const fixed = this.floor ? Math.floor(i) : i;
      return this.inf.format(fixed);
    } else {
      const fixed = this.floor ? Math.floor(i) : roundTo(i, 3);
      return padStart(fixed, this.padTo);
    }
  }
};
var PolyDateFormatter = class {
  constructor(dt, intl, opts) {
    this.opts = opts;
    this.originalZone = void 0;
    let z = void 0;
    if (this.opts.timeZone) {
      this.dt = dt;
    } else if (dt.zone.type === "fixed") {
      const gmtOffset = -1 * (dt.offset / 60);
      const offsetZ = gmtOffset >= 0 ? `Etc/GMT+${gmtOffset}` : `Etc/GMT${gmtOffset}`;
      if (dt.offset !== 0 && IANAZone.create(offsetZ).valid) {
        z = offsetZ;
        this.dt = dt;
      } else {
        z = "UTC";
        this.dt = dt.offset === 0 ? dt : dt.setZone("UTC").plus({ minutes: dt.offset });
        this.originalZone = dt.zone;
      }
    } else if (dt.zone.type === "system") {
      this.dt = dt;
    } else if (dt.zone.type === "iana") {
      this.dt = dt;
      z = dt.zone.name;
    } else {
      z = "UTC";
      this.dt = dt.setZone("UTC").plus({ minutes: dt.offset });
      this.originalZone = dt.zone;
    }
    const intlOpts = { ...this.opts };
    intlOpts.timeZone = intlOpts.timeZone || z;
    this.dtf = getCachedDTF(intl, intlOpts);
  }
  format() {
    if (this.originalZone) {
      return this.formatToParts().map(({ value: value2 }) => value2).join("");
    }
    return this.dtf.format(this.dt.toJSDate());
  }
  formatToParts() {
    const parts = this.dtf.formatToParts(this.dt.toJSDate());
    if (this.originalZone) {
      return parts.map((part) => {
        if (part.type === "timeZoneName") {
          const offsetName = this.originalZone.offsetName(this.dt.ts, {
            locale: this.dt.locale,
            format: this.opts.timeZoneName
          });
          return {
            ...part,
            value: offsetName
          };
        } else {
          return part;
        }
      });
    }
    return parts;
  }
  resolvedOptions() {
    return this.dtf.resolvedOptions();
  }
};
var PolyRelFormatter = class {
  constructor(intl, isEnglish, opts) {
    this.opts = { style: "long", ...opts };
    if (!isEnglish && hasRelative()) {
      this.rtf = getCachedRTF(intl, opts);
    }
  }
  format(count, unit) {
    if (this.rtf) {
      return this.rtf.format(count, unit);
    } else {
      return formatRelativeTime(unit, count, this.opts.numeric, this.opts.style !== "long");
    }
  }
  formatToParts(count, unit) {
    if (this.rtf) {
      return this.rtf.formatToParts(count, unit);
    } else {
      return [];
    }
  }
};
var fallbackWeekSettings = {
  firstDay: 1,
  minimalDays: 4,
  weekend: [6, 7]
};
var Locale = class _Locale {
  static fromOpts(opts) {
    return _Locale.create(
      opts.locale,
      opts.numberingSystem,
      opts.outputCalendar,
      opts.weekSettings,
      opts.defaultToEN
    );
  }
  static create(locale, numberingSystem, outputCalendar, weekSettings, defaultToEN = false) {
    const specifiedLocale = locale || Settings.defaultLocale;
    const localeR = specifiedLocale || (defaultToEN ? "en-US" : systemLocale());
    const numberingSystemR = numberingSystem || Settings.defaultNumberingSystem;
    const outputCalendarR = outputCalendar || Settings.defaultOutputCalendar;
    const weekSettingsR = validateWeekSettings(weekSettings) || Settings.defaultWeekSettings;
    return new _Locale(localeR, numberingSystemR, outputCalendarR, weekSettingsR, specifiedLocale);
  }
  static resetCache() {
    sysLocaleCache = null;
    intlDTCache.clear();
    intlNumCache.clear();
    intlRelCache.clear();
    intlResolvedOptionsCache.clear();
    weekInfoCache.clear();
  }
  static fromObject({ locale, numberingSystem, outputCalendar, weekSettings } = {}) {
    return _Locale.create(locale, numberingSystem, outputCalendar, weekSettings);
  }
  constructor(locale, numbering, outputCalendar, weekSettings, specifiedLocale) {
    const [parsedLocale, parsedNumberingSystem, parsedOutputCalendar] = parseLocaleString(locale);
    this.locale = parsedLocale;
    this.numberingSystem = numbering || parsedNumberingSystem || null;
    this.outputCalendar = outputCalendar || parsedOutputCalendar || null;
    this.weekSettings = weekSettings;
    this.intl = intlConfigString(this.locale, this.numberingSystem, this.outputCalendar);
    this.weekdaysCache = { format: {}, standalone: {} };
    this.monthsCache = { format: {}, standalone: {} };
    this.meridiemCache = null;
    this.eraCache = {};
    this.specifiedLocale = specifiedLocale;
    this.fastNumbersCached = null;
  }
  get fastNumbers() {
    if (this.fastNumbersCached == null) {
      this.fastNumbersCached = supportsFastNumbers(this);
    }
    return this.fastNumbersCached;
  }
  listingMode() {
    const isActuallyEn = this.isEnglish();
    const hasNoWeirdness = (this.numberingSystem === null || this.numberingSystem === "latn") && (this.outputCalendar === null || this.outputCalendar === "gregory");
    return isActuallyEn && hasNoWeirdness ? "en" : "intl";
  }
  clone(alts) {
    if (!alts || Object.getOwnPropertyNames(alts).length === 0) {
      return this;
    } else {
      return _Locale.create(
        alts.locale || this.specifiedLocale,
        alts.numberingSystem || this.numberingSystem,
        alts.outputCalendar || this.outputCalendar,
        validateWeekSettings(alts.weekSettings) || this.weekSettings,
        alts.defaultToEN || false
      );
    }
  }
  redefaultToEN(alts = {}) {
    return this.clone({ ...alts, defaultToEN: true });
  }
  redefaultToSystem(alts = {}) {
    return this.clone({ ...alts, defaultToEN: false });
  }
  months(length, format = false) {
    return listStuff(this, length, months, () => {
      const monthSpecialCase = this.intl === "ja" || this.intl.startsWith("ja-");
      format &= !monthSpecialCase;
      const intl = format ? { month: length, day: "numeric" } : { month: length }, formatStr = format ? "format" : "standalone";
      if (!this.monthsCache[formatStr][length]) {
        const mapper = !monthSpecialCase ? (dt) => this.extract(dt, intl, "month") : (dt) => this.dtFormatter(dt, intl).format();
        this.monthsCache[formatStr][length] = mapMonths(mapper);
      }
      return this.monthsCache[formatStr][length];
    });
  }
  weekdays(length, format = false) {
    return listStuff(this, length, weekdays, () => {
      const intl = format ? { weekday: length, year: "numeric", month: "long", day: "numeric" } : { weekday: length }, formatStr = format ? "format" : "standalone";
      if (!this.weekdaysCache[formatStr][length]) {
        this.weekdaysCache[formatStr][length] = mapWeekdays(
          (dt) => this.extract(dt, intl, "weekday")
        );
      }
      return this.weekdaysCache[formatStr][length];
    });
  }
  meridiems() {
    return listStuff(
      this,
      void 0,
      () => meridiems,
      () => {
        if (!this.meridiemCache) {
          const intl = { hour: "numeric", hourCycle: "h12" };
          this.meridiemCache = [DateTime.utc(2016, 11, 13, 9), DateTime.utc(2016, 11, 13, 19)].map(
            (dt) => this.extract(dt, intl, "dayperiod")
          );
        }
        return this.meridiemCache;
      }
    );
  }
  eras(length) {
    return listStuff(this, length, eras, () => {
      const intl = { era: length };
      if (!this.eraCache[length]) {
        this.eraCache[length] = [DateTime.utc(-40, 1, 1), DateTime.utc(2017, 1, 1)].map(
          (dt) => this.extract(dt, intl, "era")
        );
      }
      return this.eraCache[length];
    });
  }
  extract(dt, intlOpts, field) {
    const df = this.dtFormatter(dt, intlOpts), results = df.formatToParts(), matching = results.find((m) => m.type.toLowerCase() === field);
    return matching ? matching.value : null;
  }
  numberFormatter(opts = {}) {
    return new PolyNumberFormatter(this.intl, opts.forceSimple || this.fastNumbers, opts);
  }
  dtFormatter(dt, intlOpts = {}) {
    return new PolyDateFormatter(dt, this.intl, intlOpts);
  }
  relFormatter(opts = {}) {
    return new PolyRelFormatter(this.intl, this.isEnglish(), opts);
  }
  listFormatter(opts = {}) {
    return getCachedLF(this.intl, opts);
  }
  isEnglish() {
    return this.locale === "en" || this.locale.toLowerCase() === "en-us" || getCachedIntResolvedOptions(this.intl).locale.startsWith("en-us");
  }
  getWeekSettings() {
    if (this.weekSettings) {
      return this.weekSettings;
    } else if (!hasLocaleWeekInfo()) {
      return fallbackWeekSettings;
    } else {
      return getCachedWeekInfo(this.locale);
    }
  }
  getStartOfWeek() {
    return this.getWeekSettings().firstDay;
  }
  getMinDaysInFirstWeek() {
    return this.getWeekSettings().minimalDays;
  }
  getWeekendDays() {
    return this.getWeekSettings().weekend;
  }
  equals(other) {
    return this.locale === other.locale && this.numberingSystem === other.numberingSystem && this.outputCalendar === other.outputCalendar;
  }
  toString() {
    return `Locale(${this.locale}, ${this.numberingSystem}, ${this.outputCalendar})`;
  }
};
var singleton = null;
var FixedOffsetZone = class _FixedOffsetZone extends Zone {
  /**
   * Get a singleton instance of UTC
   * @return {FixedOffsetZone}
   */
  static get utcInstance() {
    if (singleton === null) {
      singleton = new _FixedOffsetZone(0);
    }
    return singleton;
  }
  /**
   * Get an instance with a specified offset
   * @param {number} offset - The offset in minutes
   * @return {FixedOffsetZone}
   */
  static instance(offset2) {
    return offset2 === 0 ? _FixedOffsetZone.utcInstance : new _FixedOffsetZone(offset2);
  }
  /**
   * Get an instance of FixedOffsetZone from a UTC offset string, like "UTC+6"
   * @param {string} s - The offset string to parse
   * @example FixedOffsetZone.parseSpecifier("UTC+6")
   * @example FixedOffsetZone.parseSpecifier("UTC+06")
   * @example FixedOffsetZone.parseSpecifier("UTC-6:00")
   * @return {FixedOffsetZone}
   */
  static parseSpecifier(s2) {
    if (s2) {
      const r = s2.match(/^utc(?:([+-]\d{1,2})(?::(\d{2}))?)?$/i);
      if (r) {
        return new _FixedOffsetZone(signedOffset(r[1], r[2]));
      }
    }
    return null;
  }
  constructor(offset2) {
    super();
    this.fixed = offset2;
  }
  /**
   * The type of zone. `fixed` for all instances of `FixedOffsetZone`.
   * @override
   * @type {string}
   */
  get type() {
    return "fixed";
  }
  /**
   * The name of this zone.
   * All fixed zones' names always start with "UTC" (plus optional offset)
   * @override
   * @type {string}
   */
  get name() {
    return this.fixed === 0 ? "UTC" : `UTC${formatOffset(this.fixed, "narrow")}`;
  }
  /**
   * The IANA name of this zone, i.e. `Etc/UTC` or `Etc/GMT+/-nn`
   *
   * @override
   * @type {string}
   */
  get ianaName() {
    if (this.fixed === 0) {
      return "Etc/UTC";
    } else {
      return `Etc/GMT${formatOffset(-this.fixed, "narrow")}`;
    }
  }
  /**
   * Returns the offset's common name at the specified timestamp.
   *
   * For fixed offset zones this equals to the zone name.
   * @override
   */
  offsetName() {
    return this.name;
  }
  /**
   * Returns the offset's value as a string
   * @override
   * @param {number} ts - Epoch milliseconds for which to get the offset
   * @param {string} format - What style of offset to return.
   *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
   * @return {string}
   */
  formatOffset(ts, format) {
    return formatOffset(this.fixed, format);
  }
  /**
   * Returns whether the offset is known to be fixed for the whole year:
   * Always returns true for all fixed offset zones.
   * @override
   * @type {boolean}
   */
  get isUniversal() {
    return true;
  }
  /**
   * Return the offset in minutes for this zone at the specified timestamp.
   *
   * For fixed offset zones, this is constant and does not depend on a timestamp.
   * @override
   * @return {number}
   */
  offset() {
    return this.fixed;
  }
  /**
   * Return whether this Zone is equal to another zone (i.e. also fixed and same offset)
   * @override
   * @param {Zone} otherZone - the zone to compare
   * @return {boolean}
   */
  equals(otherZone) {
    return otherZone.type === "fixed" && otherZone.fixed === this.fixed;
  }
  /**
   * Return whether this Zone is valid:
   * All fixed offset zones are valid.
   * @override
   * @type {boolean}
   */
  get isValid() {
    return true;
  }
};
var InvalidZone = class extends Zone {
  constructor(zoneName) {
    super();
    this.zoneName = zoneName;
  }
  /** @override **/
  get type() {
    return "invalid";
  }
  /** @override **/
  get name() {
    return this.zoneName;
  }
  /** @override **/
  get isUniversal() {
    return false;
  }
  /** @override **/
  offsetName() {
    return null;
  }
  /** @override **/
  formatOffset() {
    return "";
  }
  /** @override **/
  offset() {
    return NaN;
  }
  /** @override **/
  equals() {
    return false;
  }
  /** @override **/
  get isValid() {
    return false;
  }
};
function normalizeZone(input, defaultZone2) {
  if (isUndefined(input) || input === null) {
    return defaultZone2;
  } else if (input instanceof Zone) {
    return input;
  } else if (isString(input)) {
    const lowered = input.toLowerCase();
    if (lowered === "default") return defaultZone2;
    else if (lowered === "local" || lowered === "system") return SystemZone.instance;
    else if (lowered === "utc" || lowered === "gmt") return FixedOffsetZone.utcInstance;
    else return FixedOffsetZone.parseSpecifier(lowered) || IANAZone.create(input);
  } else if (isNumber(input)) {
    return FixedOffsetZone.instance(input);
  } else if (typeof input === "object" && "offset" in input && typeof input.offset === "function") {
    return input;
  } else {
    return new InvalidZone(input);
  }
}
var numberingSystems = {
  arab: "[\u0660-\u0669]",
  arabext: "[\u06F0-\u06F9]",
  bali: "[\u1B50-\u1B59]",
  beng: "[\u09E6-\u09EF]",
  deva: "[\u0966-\u096F]",
  fullwide: "[\uFF10-\uFF19]",
  gujr: "[\u0AE6-\u0AEF]",
  hanidec: "[\u3007|\u4E00|\u4E8C|\u4E09|\u56DB|\u4E94|\u516D|\u4E03|\u516B|\u4E5D]",
  khmr: "[\u17E0-\u17E9]",
  knda: "[\u0CE6-\u0CEF]",
  laoo: "[\u0ED0-\u0ED9]",
  limb: "[\u1946-\u194F]",
  mlym: "[\u0D66-\u0D6F]",
  mong: "[\u1810-\u1819]",
  mymr: "[\u1040-\u1049]",
  orya: "[\u0B66-\u0B6F]",
  tamldec: "[\u0BE6-\u0BEF]",
  telu: "[\u0C66-\u0C6F]",
  thai: "[\u0E50-\u0E59]",
  tibt: "[\u0F20-\u0F29]",
  latn: "\\d"
};
var numberingSystemsUTF16 = {
  arab: [1632, 1641],
  arabext: [1776, 1785],
  bali: [6992, 7001],
  beng: [2534, 2543],
  deva: [2406, 2415],
  fullwide: [65296, 65303],
  gujr: [2790, 2799],
  khmr: [6112, 6121],
  knda: [3302, 3311],
  laoo: [3792, 3801],
  limb: [6470, 6479],
  mlym: [3430, 3439],
  mong: [6160, 6169],
  mymr: [4160, 4169],
  orya: [2918, 2927],
  tamldec: [3046, 3055],
  telu: [3174, 3183],
  thai: [3664, 3673],
  tibt: [3872, 3881]
};
var hanidecChars = numberingSystems.hanidec.replace(/[\[|\]]/g, "").split("");
function parseDigits(str) {
  let value2 = parseInt(str, 10);
  if (isNaN(value2)) {
    value2 = "";
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (str[i].search(numberingSystems.hanidec) !== -1) {
        value2 += hanidecChars.indexOf(str[i]);
      } else {
        for (const key2 in numberingSystemsUTF16) {
          const [min, max] = numberingSystemsUTF16[key2];
          if (code >= min && code <= max) {
            value2 += code - min;
          }
        }
      }
    }
    return parseInt(value2, 10);
  } else {
    return value2;
  }
}
var digitRegexCache = /* @__PURE__ */ new Map();
function resetDigitRegexCache() {
  digitRegexCache.clear();
}
function digitRegex({ numberingSystem }, append = "") {
  const ns = numberingSystem || "latn";
  let appendCache = digitRegexCache.get(ns);
  if (appendCache === void 0) {
    appendCache = /* @__PURE__ */ new Map();
    digitRegexCache.set(ns, appendCache);
  }
  let regex = appendCache.get(append);
  if (regex === void 0) {
    regex = new RegExp(`${numberingSystems[ns]}${append}`);
    appendCache.set(append, regex);
  }
  return regex;
}
var now = () => Date.now();
var defaultZone = "system";
var defaultLocale = null;
var defaultNumberingSystem = null;
var defaultOutputCalendar = null;
var twoDigitCutoffYear = 60;
var throwOnInvalid;
var defaultWeekSettings = null;
var Settings = class {
  /**
   * Get the callback for returning the current timestamp.
   * @type {function}
   */
  static get now() {
    return now;
  }
  /**
   * Set the callback for returning the current timestamp.
   * The function should return a number, which will be interpreted as an Epoch millisecond count
   * @type {function}
   * @example Settings.now = () => Date.now() + 3000 // pretend it is 3 seconds in the future
   * @example Settings.now = () => 0 // always pretend it's Jan 1, 1970 at midnight in UTC time
   */
  static set now(n2) {
    now = n2;
  }
  /**
   * Set the default time zone to create DateTimes in. Does not affect existing instances.
   * Use the value "system" to reset this value to the system's time zone.
   * @type {string}
   */
  static set defaultZone(zone) {
    defaultZone = zone;
  }
  /**
   * Get the default time zone object currently used to create DateTimes. Does not affect existing instances.
   * The default value is the system's time zone (the one set on the machine that runs this code).
   * @type {Zone}
   */
  static get defaultZone() {
    return normalizeZone(defaultZone, SystemZone.instance);
  }
  /**
   * Get the default locale to create DateTimes with. Does not affect existing instances.
   * @type {string}
   */
  static get defaultLocale() {
    return defaultLocale;
  }
  /**
   * Set the default locale to create DateTimes with. Does not affect existing instances.
   * @type {string}
   */
  static set defaultLocale(locale) {
    defaultLocale = locale;
  }
  /**
   * Get the default numbering system to create DateTimes with. Does not affect existing instances.
   * @type {string}
   */
  static get defaultNumberingSystem() {
    return defaultNumberingSystem;
  }
  /**
   * Set the default numbering system to create DateTimes with. Does not affect existing instances.
   * @type {string}
   */
  static set defaultNumberingSystem(numberingSystem) {
    defaultNumberingSystem = numberingSystem;
  }
  /**
   * Get the default output calendar to create DateTimes with. Does not affect existing instances.
   * @type {string}
   */
  static get defaultOutputCalendar() {
    return defaultOutputCalendar;
  }
  /**
   * Set the default output calendar to create DateTimes with. Does not affect existing instances.
   * @type {string}
   */
  static set defaultOutputCalendar(outputCalendar) {
    defaultOutputCalendar = outputCalendar;
  }
  /**
   * @typedef {Object} WeekSettings
   * @property {number} firstDay
   * @property {number} minimalDays
   * @property {number[]} weekend
   */
  /**
   * @return {WeekSettings|null}
   */
  static get defaultWeekSettings() {
    return defaultWeekSettings;
  }
  /**
   * Allows overriding the default locale week settings, i.e. the start of the week, the weekend and
   * how many days are required in the first week of a year.
   * Does not affect existing instances.
   *
   * @param {WeekSettings|null} weekSettings
   */
  static set defaultWeekSettings(weekSettings) {
    defaultWeekSettings = validateWeekSettings(weekSettings);
  }
  /**
   * Get the cutoff year for whether a 2-digit year string is interpreted in the current or previous century. Numbers higher than the cutoff will be considered to mean 19xx and numbers lower or equal to the cutoff will be considered 20xx.
   * @type {number}
   */
  static get twoDigitCutoffYear() {
    return twoDigitCutoffYear;
  }
  /**
   * Set the cutoff year for whether a 2-digit year string is interpreted in the current or previous century. Numbers higher than the cutoff will be considered to mean 19xx and numbers lower or equal to the cutoff will be considered 20xx.
   * @type {number}
   * @example Settings.twoDigitCutoffYear = 0 // all 'yy' are interpreted as 20th century
   * @example Settings.twoDigitCutoffYear = 99 // all 'yy' are interpreted as 21st century
   * @example Settings.twoDigitCutoffYear = 50 // '49' -> 2049; '50' -> 1950
   * @example Settings.twoDigitCutoffYear = 1950 // interpreted as 50
   * @example Settings.twoDigitCutoffYear = 2050 // ALSO interpreted as 50
   */
  static set twoDigitCutoffYear(cutoffYear) {
    twoDigitCutoffYear = cutoffYear % 100;
  }
  /**
   * Get whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
   * @type {boolean}
   */
  static get throwOnInvalid() {
    return throwOnInvalid;
  }
  /**
   * Set whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
   * @type {boolean}
   */
  static set throwOnInvalid(t) {
    throwOnInvalid = t;
  }
  /**
   * Reset Luxon's global caches. Should only be necessary in testing scenarios.
   * @return {void}
   */
  static resetCaches() {
    Locale.resetCache();
    IANAZone.resetCache();
    DateTime.resetCache();
    resetDigitRegexCache();
  }
};
var Invalid = class {
  constructor(reason, explanation) {
    this.reason = reason;
    this.explanation = explanation;
  }
  toMessage() {
    if (this.explanation) {
      return `${this.reason}: ${this.explanation}`;
    } else {
      return this.reason;
    }
  }
};
var nonLeapLadder = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
var leapLadder = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
function unitOutOfRange(unit, value2) {
  return new Invalid(
    "unit out of range",
    `you specified ${value2} (of type ${typeof value2}) as a ${unit}, which is invalid`
  );
}
function dayOfWeek(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (year < 100 && year >= 0) {
    d.setUTCFullYear(d.getUTCFullYear() - 1900);
  }
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}
function computeOrdinal(year, month, day) {
  return day + (isLeapYear(year) ? leapLadder : nonLeapLadder)[month - 1];
}
function uncomputeOrdinal(year, ordinal) {
  const table = isLeapYear(year) ? leapLadder : nonLeapLadder, month0 = table.findIndex((i) => i < ordinal), day = ordinal - table[month0];
  return { month: month0 + 1, day };
}
function isoWeekdayToLocal(isoWeekday, startOfWeek) {
  return (isoWeekday - startOfWeek + 7) % 7 + 1;
}
function gregorianToWeek(gregObj, minDaysInFirstWeek = 4, startOfWeek = 1) {
  const { year, month, day } = gregObj, ordinal = computeOrdinal(year, month, day), weekday = isoWeekdayToLocal(dayOfWeek(year, month, day), startOfWeek);
  let weekNumber = Math.floor((ordinal - weekday + 14 - minDaysInFirstWeek) / 7), weekYear;
  if (weekNumber < 1) {
    weekYear = year - 1;
    weekNumber = weeksInWeekYear(weekYear, minDaysInFirstWeek, startOfWeek);
  } else if (weekNumber > weeksInWeekYear(year, minDaysInFirstWeek, startOfWeek)) {
    weekYear = year + 1;
    weekNumber = 1;
  } else {
    weekYear = year;
  }
  return { weekYear, weekNumber, weekday, ...timeObject(gregObj) };
}
function weekToGregorian(weekData, minDaysInFirstWeek = 4, startOfWeek = 1) {
  const { weekYear, weekNumber, weekday } = weekData, weekdayOfJan4 = isoWeekdayToLocal(dayOfWeek(weekYear, 1, minDaysInFirstWeek), startOfWeek), yearInDays = daysInYear(weekYear);
  let ordinal = weekNumber * 7 + weekday - weekdayOfJan4 - 7 + minDaysInFirstWeek, year;
  if (ordinal < 1) {
    year = weekYear - 1;
    ordinal += daysInYear(year);
  } else if (ordinal > yearInDays) {
    year = weekYear + 1;
    ordinal -= daysInYear(weekYear);
  } else {
    year = weekYear;
  }
  const { month, day } = uncomputeOrdinal(year, ordinal);
  return { year, month, day, ...timeObject(weekData) };
}
function gregorianToOrdinal(gregData) {
  const { year, month, day } = gregData;
  const ordinal = computeOrdinal(year, month, day);
  return { year, ordinal, ...timeObject(gregData) };
}
function ordinalToGregorian(ordinalData) {
  const { year, ordinal } = ordinalData;
  const { month, day } = uncomputeOrdinal(year, ordinal);
  return { year, month, day, ...timeObject(ordinalData) };
}
function usesLocalWeekValues(obj, loc) {
  const hasLocaleWeekData = !isUndefined(obj.localWeekday) || !isUndefined(obj.localWeekNumber) || !isUndefined(obj.localWeekYear);
  if (hasLocaleWeekData) {
    const hasIsoWeekData = !isUndefined(obj.weekday) || !isUndefined(obj.weekNumber) || !isUndefined(obj.weekYear);
    if (hasIsoWeekData) {
      throw new ConflictingSpecificationError(
        "Cannot mix locale-based week fields with ISO-based week fields"
      );
    }
    if (!isUndefined(obj.localWeekday)) obj.weekday = obj.localWeekday;
    if (!isUndefined(obj.localWeekNumber)) obj.weekNumber = obj.localWeekNumber;
    if (!isUndefined(obj.localWeekYear)) obj.weekYear = obj.localWeekYear;
    delete obj.localWeekday;
    delete obj.localWeekNumber;
    delete obj.localWeekYear;
    return {
      minDaysInFirstWeek: loc.getMinDaysInFirstWeek(),
      startOfWeek: loc.getStartOfWeek()
    };
  } else {
    return { minDaysInFirstWeek: 4, startOfWeek: 1 };
  }
}
function hasInvalidWeekData(obj, minDaysInFirstWeek = 4, startOfWeek = 1) {
  const validYear = isInteger(obj.weekYear), validWeek = integerBetween(
    obj.weekNumber,
    1,
    weeksInWeekYear(obj.weekYear, minDaysInFirstWeek, startOfWeek)
  ), validWeekday = integerBetween(obj.weekday, 1, 7);
  if (!validYear) {
    return unitOutOfRange("weekYear", obj.weekYear);
  } else if (!validWeek) {
    return unitOutOfRange("week", obj.weekNumber);
  } else if (!validWeekday) {
    return unitOutOfRange("weekday", obj.weekday);
  } else return false;
}
function hasInvalidOrdinalData(obj) {
  const validYear = isInteger(obj.year), validOrdinal = integerBetween(obj.ordinal, 1, daysInYear(obj.year));
  if (!validYear) {
    return unitOutOfRange("year", obj.year);
  } else if (!validOrdinal) {
    return unitOutOfRange("ordinal", obj.ordinal);
  } else return false;
}
function hasInvalidGregorianData(obj) {
  const validYear = isInteger(obj.year), validMonth = integerBetween(obj.month, 1, 12), validDay = integerBetween(obj.day, 1, daysInMonth(obj.year, obj.month));
  if (!validYear) {
    return unitOutOfRange("year", obj.year);
  } else if (!validMonth) {
    return unitOutOfRange("month", obj.month);
  } else if (!validDay) {
    return unitOutOfRange("day", obj.day);
  } else return false;
}
function hasInvalidTimeData(obj) {
  const { hour, minute, second, millisecond } = obj;
  const validHour = integerBetween(hour, 0, 23) || hour === 24 && minute === 0 && second === 0 && millisecond === 0, validMinute = integerBetween(minute, 0, 59), validSecond = integerBetween(second, 0, 59), validMillisecond = integerBetween(millisecond, 0, 999);
  if (!validHour) {
    return unitOutOfRange("hour", hour);
  } else if (!validMinute) {
    return unitOutOfRange("minute", minute);
  } else if (!validSecond) {
    return unitOutOfRange("second", second);
  } else if (!validMillisecond) {
    return unitOutOfRange("millisecond", millisecond);
  } else return false;
}
function isUndefined(o) {
  return typeof o === "undefined";
}
function isNumber(o) {
  return typeof o === "number";
}
function isInteger(o) {
  return typeof o === "number" && o % 1 === 0;
}
function isString(o) {
  return typeof o === "string";
}
function isDate(o) {
  return Object.prototype.toString.call(o) === "[object Date]";
}
function hasRelative() {
  try {
    return typeof Intl !== "undefined" && !!Intl.RelativeTimeFormat;
  } catch (e) {
    return false;
  }
}
function hasLocaleWeekInfo() {
  try {
    return typeof Intl !== "undefined" && !!Intl.Locale && ("weekInfo" in Intl.Locale.prototype || "getWeekInfo" in Intl.Locale.prototype);
  } catch (e) {
    return false;
  }
}
function maybeArray(thing) {
  return Array.isArray(thing) ? thing : [thing];
}
function bestBy(arr, by, compare) {
  if (arr.length === 0) {
    return void 0;
  }
  return arr.reduce((best, next) => {
    const pair = [by(next), next];
    if (!best) {
      return pair;
    } else if (compare(best[0], pair[0]) === best[0]) {
      return best;
    } else {
      return pair;
    }
  }, null)[1];
}
function pick(obj, keys) {
  return keys.reduce((a, k) => {
    a[k] = obj[k];
    return a;
  }, {});
}
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}
function validateWeekSettings(settings) {
  if (settings == null) {
    return null;
  } else if (typeof settings !== "object") {
    throw new InvalidArgumentError("Week settings must be an object");
  } else {
    if (!integerBetween(settings.firstDay, 1, 7) || !integerBetween(settings.minimalDays, 1, 7) || !Array.isArray(settings.weekend) || settings.weekend.some((v) => !integerBetween(v, 1, 7))) {
      throw new InvalidArgumentError("Invalid week settings");
    }
    return {
      firstDay: settings.firstDay,
      minimalDays: settings.minimalDays,
      weekend: Array.from(settings.weekend)
    };
  }
}
function integerBetween(thing, bottom, top) {
  return isInteger(thing) && thing >= bottom && thing <= top;
}
function floorMod(x, n2) {
  return x - n2 * Math.floor(x / n2);
}
function padStart(input, n2 = 2) {
  const isNeg = input < 0;
  let padded;
  if (isNeg) {
    padded = "-" + ("" + -input).padStart(n2, "0");
  } else {
    padded = ("" + input).padStart(n2, "0");
  }
  return padded;
}
function parseInteger(string) {
  if (isUndefined(string) || string === null || string === "") {
    return void 0;
  } else {
    return parseInt(string, 10);
  }
}
function parseFloating(string) {
  if (isUndefined(string) || string === null || string === "") {
    return void 0;
  } else {
    return parseFloat(string);
  }
}
function parseMillis(fraction) {
  if (isUndefined(fraction) || fraction === null || fraction === "") {
    return void 0;
  } else {
    const f = parseFloat("0." + fraction) * 1e3;
    return Math.floor(f);
  }
}
function roundTo(number, digits, rounding = "round") {
  const factor = 10 ** digits;
  switch (rounding) {
    case "expand":
      return number > 0 ? Math.ceil(number * factor) / factor : Math.floor(number * factor) / factor;
    case "trunc":
      return Math.trunc(number * factor) / factor;
    case "round":
      return Math.round(number * factor) / factor;
    case "floor":
      return Math.floor(number * factor) / factor;
    case "ceil":
      return Math.ceil(number * factor) / factor;
    default:
      throw new RangeError(`Value rounding ${rounding} is out of range`);
  }
}
function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}
function daysInMonth(year, month) {
  const modMonth = floorMod(month - 1, 12) + 1, modYear = year + (month - modMonth) / 12;
  if (modMonth === 2) {
    return isLeapYear(modYear) ? 29 : 28;
  } else {
    return [31, null, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][modMonth - 1];
  }
}
function objToLocalTS(obj) {
  let d = Date.UTC(
    obj.year,
    obj.month - 1,
    obj.day,
    obj.hour,
    obj.minute,
    obj.second,
    obj.millisecond
  );
  if (obj.year < 100 && obj.year >= 0) {
    d = new Date(d);
    d.setUTCFullYear(obj.year, obj.month - 1, obj.day);
  }
  return +d;
}
function firstWeekOffset(year, minDaysInFirstWeek, startOfWeek) {
  const fwdlw = isoWeekdayToLocal(dayOfWeek(year, 1, minDaysInFirstWeek), startOfWeek);
  return -fwdlw + minDaysInFirstWeek - 1;
}
function weeksInWeekYear(weekYear, minDaysInFirstWeek = 4, startOfWeek = 1) {
  const weekOffset = firstWeekOffset(weekYear, minDaysInFirstWeek, startOfWeek);
  const weekOffsetNext = firstWeekOffset(weekYear + 1, minDaysInFirstWeek, startOfWeek);
  return (daysInYear(weekYear) - weekOffset + weekOffsetNext) / 7;
}
function untruncateYear(year) {
  if (year > 99) {
    return year;
  } else return year > Settings.twoDigitCutoffYear ? 1900 + year : 2e3 + year;
}
function parseZoneInfo(ts, offsetFormat, locale, timeZone = null) {
  const date = new Date(ts), intlOpts = {
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  };
  if (timeZone) {
    intlOpts.timeZone = timeZone;
  }
  const modified = { timeZoneName: offsetFormat, ...intlOpts };
  const parsed = new Intl.DateTimeFormat(locale, modified).formatToParts(date).find((m) => m.type.toLowerCase() === "timezonename");
  return parsed ? parsed.value : null;
}
function signedOffset(offHourStr, offMinuteStr) {
  let offHour = parseInt(offHourStr, 10);
  if (Number.isNaN(offHour)) {
    offHour = 0;
  }
  const offMin = parseInt(offMinuteStr, 10) || 0, offMinSigned = offHour < 0 || Object.is(offHour, -0) ? -offMin : offMin;
  return offHour * 60 + offMinSigned;
}
function asNumber(value2) {
  const numericValue = Number(value2);
  if (typeof value2 === "boolean" || value2 === "" || !Number.isFinite(numericValue))
    throw new InvalidArgumentError(`Invalid unit value ${value2}`);
  return numericValue;
}
function normalizeObject(obj, normalizer) {
  const normalized = {};
  for (const u in obj) {
    if (hasOwnProperty(obj, u)) {
      const v = obj[u];
      if (v === void 0 || v === null) continue;
      normalized[normalizer(u)] = asNumber(v);
    }
  }
  return normalized;
}
function formatOffset(offset2, format) {
  const hours = Math.trunc(Math.abs(offset2 / 60)), minutes = Math.trunc(Math.abs(offset2 % 60)), sign = offset2 >= 0 ? "+" : "-";
  switch (format) {
    case "short":
      return `${sign}${padStart(hours, 2)}:${padStart(minutes, 2)}`;
    case "narrow":
      return `${sign}${hours}${minutes > 0 ? `:${minutes}` : ""}`;
    case "techie":
      return `${sign}${padStart(hours, 2)}${padStart(minutes, 2)}`;
    default:
      throw new RangeError(`Value format ${format} is out of range for property format`);
  }
}
function timeObject(obj) {
  return pick(obj, ["hour", "minute", "second", "millisecond"]);
}
var monthsLong = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var monthsShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
var monthsNarrow = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
function months(length) {
  switch (length) {
    case "narrow":
      return [...monthsNarrow];
    case "short":
      return [...monthsShort];
    case "long":
      return [...monthsLong];
    case "numeric":
      return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    case "2-digit":
      return ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    default:
      return null;
  }
}
var weekdaysLong = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
var weekdaysShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var weekdaysNarrow = ["M", "T", "W", "T", "F", "S", "S"];
function weekdays(length) {
  switch (length) {
    case "narrow":
      return [...weekdaysNarrow];
    case "short":
      return [...weekdaysShort];
    case "long":
      return [...weekdaysLong];
    case "numeric":
      return ["1", "2", "3", "4", "5", "6", "7"];
    default:
      return null;
  }
}
var meridiems = ["AM", "PM"];
var erasLong = ["Before Christ", "Anno Domini"];
var erasShort = ["BC", "AD"];
var erasNarrow = ["B", "A"];
function eras(length) {
  switch (length) {
    case "narrow":
      return [...erasNarrow];
    case "short":
      return [...erasShort];
    case "long":
      return [...erasLong];
    default:
      return null;
  }
}
function meridiemForDateTime(dt) {
  return meridiems[dt.hour < 12 ? 0 : 1];
}
function weekdayForDateTime(dt, length) {
  return weekdays(length)[dt.weekday - 1];
}
function monthForDateTime(dt, length) {
  return months(length)[dt.month - 1];
}
function eraForDateTime(dt, length) {
  return eras(length)[dt.year < 0 ? 0 : 1];
}
function formatRelativeTime(unit, count, numeric = "always", narrow = false) {
  const units = {
    years: ["year", "yr."],
    quarters: ["quarter", "qtr."],
    months: ["month", "mo."],
    weeks: ["week", "wk."],
    days: ["day", "day", "days"],
    hours: ["hour", "hr."],
    minutes: ["minute", "min."],
    seconds: ["second", "sec."]
  };
  const lastable = ["hours", "minutes", "seconds"].indexOf(unit) === -1;
  if (numeric === "auto" && lastable) {
    const isDay = unit === "days";
    switch (count) {
      case 1:
        return isDay ? "tomorrow" : `next ${units[unit][0]}`;
      case -1:
        return isDay ? "yesterday" : `last ${units[unit][0]}`;
      case 0:
        return isDay ? "today" : `this ${units[unit][0]}`;
    }
  }
  const isInPast = Object.is(count, -0) || count < 0, fmtValue = Math.abs(count), singular = fmtValue === 1, lilUnits = units[unit], fmtUnit = narrow ? singular ? lilUnits[1] : lilUnits[2] || lilUnits[1] : singular ? units[unit][0] : unit;
  return isInPast ? `${fmtValue} ${fmtUnit} ago` : `in ${fmtValue} ${fmtUnit}`;
}
function stringifyTokens(splits, tokenToString) {
  let s2 = "";
  for (const token of splits) {
    if (token.literal) {
      s2 += token.val;
    } else {
      s2 += tokenToString(token.val);
    }
  }
  return s2;
}
var macroTokenToFormatOpts = {
  D: DATE_SHORT,
  DD: DATE_MED,
  DDD: DATE_FULL,
  DDDD: DATE_HUGE,
  t: TIME_SIMPLE,
  tt: TIME_WITH_SECONDS,
  ttt: TIME_WITH_SHORT_OFFSET,
  tttt: TIME_WITH_LONG_OFFSET,
  T: TIME_24_SIMPLE,
  TT: TIME_24_WITH_SECONDS,
  TTT: TIME_24_WITH_SHORT_OFFSET,
  TTTT: TIME_24_WITH_LONG_OFFSET,
  f: DATETIME_SHORT,
  ff: DATETIME_MED,
  fff: DATETIME_FULL,
  ffff: DATETIME_HUGE,
  F: DATETIME_SHORT_WITH_SECONDS,
  FF: DATETIME_MED_WITH_SECONDS,
  FFF: DATETIME_FULL_WITH_SECONDS,
  FFFF: DATETIME_HUGE_WITH_SECONDS
};
var Formatter = class _Formatter {
  static create(locale, opts = {}) {
    return new _Formatter(locale, opts);
  }
  static parseFormat(fmt) {
    let current = null, currentFull = "", bracketed = false;
    const splits = [];
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt.charAt(i);
      if (c === "'") {
        if (currentFull.length > 0 || bracketed) {
          splits.push({
            literal: bracketed || /^\s+$/.test(currentFull),
            val: currentFull === "" ? "'" : currentFull
          });
        }
        current = null;
        currentFull = "";
        bracketed = !bracketed;
      } else if (bracketed) {
        currentFull += c;
      } else if (c === current) {
        currentFull += c;
      } else {
        if (currentFull.length > 0) {
          splits.push({ literal: /^\s+$/.test(currentFull), val: currentFull });
        }
        currentFull = c;
        current = c;
      }
    }
    if (currentFull.length > 0) {
      splits.push({ literal: bracketed || /^\s+$/.test(currentFull), val: currentFull });
    }
    return splits;
  }
  static macroTokenToFormatOpts(token) {
    return macroTokenToFormatOpts[token];
  }
  constructor(locale, formatOpts) {
    this.opts = formatOpts;
    this.loc = locale;
    this.systemLoc = null;
  }
  formatWithSystemDefault(dt, opts) {
    if (this.systemLoc === null) {
      this.systemLoc = this.loc.redefaultToSystem();
    }
    const df = this.systemLoc.dtFormatter(dt, { ...this.opts, ...opts });
    return df.format();
  }
  dtFormatter(dt, opts = {}) {
    return this.loc.dtFormatter(dt, { ...this.opts, ...opts });
  }
  formatDateTime(dt, opts) {
    return this.dtFormatter(dt, opts).format();
  }
  formatDateTimeParts(dt, opts) {
    return this.dtFormatter(dt, opts).formatToParts();
  }
  formatInterval(interval, opts) {
    const df = this.dtFormatter(interval.start, opts);
    return df.dtf.formatRange(interval.start.toJSDate(), interval.end.toJSDate());
  }
  resolvedOptions(dt, opts) {
    return this.dtFormatter(dt, opts).resolvedOptions();
  }
  num(n2, p = 0, signDisplay = void 0) {
    if (this.opts.forceSimple) {
      return padStart(n2, p);
    }
    const opts = { ...this.opts };
    if (p > 0) {
      opts.padTo = p;
    }
    if (signDisplay) {
      opts.signDisplay = signDisplay;
    }
    return this.loc.numberFormatter(opts).format(n2);
  }
  formatDateTimeFromString(dt, fmt) {
    const knownEnglish = this.loc.listingMode() === "en", useDateTimeFormatter = this.loc.outputCalendar && this.loc.outputCalendar !== "gregory", string = (opts, extract) => this.loc.extract(dt, opts, extract), formatOffset2 = (opts) => {
      if (dt.isOffsetFixed && dt.offset === 0 && opts.allowZ) {
        return "Z";
      }
      return dt.isValid ? dt.zone.formatOffset(dt.ts, opts.format) : "";
    }, meridiem = () => knownEnglish ? meridiemForDateTime(dt) : string({ hour: "numeric", hourCycle: "h12" }, "dayperiod"), month = (length, standalone) => knownEnglish ? monthForDateTime(dt, length) : string(standalone ? { month: length } : { month: length, day: "numeric" }, "month"), weekday = (length, standalone) => knownEnglish ? weekdayForDateTime(dt, length) : string(
      standalone ? { weekday: length } : { weekday: length, month: "long", day: "numeric" },
      "weekday"
    ), maybeMacro = (token) => {
      const formatOpts = _Formatter.macroTokenToFormatOpts(token);
      if (formatOpts) {
        return this.formatWithSystemDefault(dt, formatOpts);
      } else {
        return token;
      }
    }, era = (length) => knownEnglish ? eraForDateTime(dt, length) : string({ era: length }, "era"), tokenToString = (token) => {
      switch (token) {
        // ms
        case "S":
          return this.num(dt.millisecond);
        case "u":
        // falls through
        case "SSS":
          return this.num(dt.millisecond, 3);
        // seconds
        case "s":
          return this.num(dt.second);
        case "ss":
          return this.num(dt.second, 2);
        // fractional seconds
        case "uu":
          return this.num(Math.floor(dt.millisecond / 10), 2);
        case "uuu":
          return this.num(Math.floor(dt.millisecond / 100));
        // minutes
        case "m":
          return this.num(dt.minute);
        case "mm":
          return this.num(dt.minute, 2);
        // hours
        case "h":
          return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12);
        case "hh":
          return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12, 2);
        case "H":
          return this.num(dt.hour);
        case "HH":
          return this.num(dt.hour, 2);
        // offset
        case "Z":
          return formatOffset2({ format: "narrow", allowZ: this.opts.allowZ });
        case "ZZ":
          return formatOffset2({ format: "short", allowZ: this.opts.allowZ });
        case "ZZZ":
          return formatOffset2({ format: "techie", allowZ: this.opts.allowZ });
        case "ZZZZ":
          return dt.zone.offsetName(dt.ts, { format: "short", locale: this.loc.locale });
        case "ZZZZZ":
          return dt.zone.offsetName(dt.ts, { format: "long", locale: this.loc.locale });
        // zone
        case "z":
          return dt.zoneName;
        // meridiems
        case "a":
          return meridiem();
        // dates
        case "d":
          return useDateTimeFormatter ? string({ day: "numeric" }, "day") : this.num(dt.day);
        case "dd":
          return useDateTimeFormatter ? string({ day: "2-digit" }, "day") : this.num(dt.day, 2);
        // weekdays - standalone
        case "c":
          return this.num(dt.weekday);
        case "ccc":
          return weekday("short", true);
        case "cccc":
          return weekday("long", true);
        case "ccccc":
          return weekday("narrow", true);
        // weekdays - format
        case "E":
          return this.num(dt.weekday);
        case "EEE":
          return weekday("short", false);
        case "EEEE":
          return weekday("long", false);
        case "EEEEE":
          return weekday("narrow", false);
        // months - standalone
        case "L":
          return useDateTimeFormatter ? string({ month: "numeric", day: "numeric" }, "month") : this.num(dt.month);
        case "LL":
          return useDateTimeFormatter ? string({ month: "2-digit", day: "numeric" }, "month") : this.num(dt.month, 2);
        case "LLL":
          return month("short", true);
        case "LLLL":
          return month("long", true);
        case "LLLLL":
          return month("narrow", true);
        // months - format
        case "M":
          return useDateTimeFormatter ? string({ month: "numeric" }, "month") : this.num(dt.month);
        case "MM":
          return useDateTimeFormatter ? string({ month: "2-digit" }, "month") : this.num(dt.month, 2);
        case "MMM":
          return month("short", false);
        case "MMMM":
          return month("long", false);
        case "MMMMM":
          return month("narrow", false);
        // years
        case "y":
          return useDateTimeFormatter ? string({ year: "numeric" }, "year") : this.num(dt.year);
        case "yy":
          return useDateTimeFormatter ? string({ year: "2-digit" }, "year") : this.num(dt.year.toString().slice(-2), 2);
        case "yyyy":
          return useDateTimeFormatter ? string({ year: "numeric" }, "year") : this.num(dt.year, 4);
        case "yyyyyy":
          return useDateTimeFormatter ? string({ year: "numeric" }, "year") : this.num(dt.year, 6);
        // eras
        case "G":
          return era("short");
        case "GG":
          return era("long");
        case "GGGGG":
          return era("narrow");
        case "kk":
          return this.num(dt.weekYear.toString().slice(-2), 2);
        case "kkkk":
          return this.num(dt.weekYear, 4);
        case "W":
          return this.num(dt.weekNumber);
        case "WW":
          return this.num(dt.weekNumber, 2);
        case "n":
          return this.num(dt.localWeekNumber);
        case "nn":
          return this.num(dt.localWeekNumber, 2);
        case "ii":
          return this.num(dt.localWeekYear.toString().slice(-2), 2);
        case "iiii":
          return this.num(dt.localWeekYear, 4);
        case "o":
          return this.num(dt.ordinal);
        case "ooo":
          return this.num(dt.ordinal, 3);
        case "q":
          return this.num(dt.quarter);
        case "qq":
          return this.num(dt.quarter, 2);
        case "X":
          return this.num(Math.floor(dt.ts / 1e3));
        case "x":
          return this.num(dt.ts);
        default:
          return maybeMacro(token);
      }
    };
    return stringifyTokens(_Formatter.parseFormat(fmt), tokenToString);
  }
  formatDurationFromString(dur, fmt) {
    const invertLargest = this.opts.signMode === "negativeLargestOnly" ? -1 : 1;
    const tokenToField = (token) => {
      switch (token[0]) {
        case "S":
          return "milliseconds";
        case "s":
          return "seconds";
        case "m":
          return "minutes";
        case "h":
          return "hours";
        case "d":
          return "days";
        case "w":
          return "weeks";
        case "M":
          return "months";
        case "y":
          return "years";
        default:
          return null;
      }
    }, tokenToString = (lildur, info) => (token) => {
      const mapped = tokenToField(token);
      if (mapped) {
        const inversionFactor = info.isNegativeDuration && mapped !== info.largestUnit ? invertLargest : 1;
        let signDisplay;
        if (this.opts.signMode === "negativeLargestOnly" && mapped !== info.largestUnit) {
          signDisplay = "never";
        } else if (this.opts.signMode === "all") {
          signDisplay = "always";
        } else {
          signDisplay = "auto";
        }
        return this.num(lildur.get(mapped) * inversionFactor, token.length, signDisplay);
      } else {
        return token;
      }
    }, tokens = _Formatter.parseFormat(fmt), realTokens = tokens.reduce(
      (found, { literal, val }) => literal ? found : found.concat(val),
      []
    ), collapsed = dur.shiftTo(...realTokens.map(tokenToField).filter((t) => t)), durationInfo = {
      isNegativeDuration: collapsed < 0,
      // this relies on "collapsed" being based on "shiftTo", which builds up the object
      // in order
      largestUnit: Object.keys(collapsed.values)[0]
    };
    return stringifyTokens(tokens, tokenToString(collapsed, durationInfo));
  }
};
var ianaRegex = /[A-Za-z_+-]{1,256}(?::?\/[A-Za-z0-9_+-]{1,256}(?:\/[A-Za-z0-9_+-]{1,256})?)?/;
function combineRegexes(...regexes) {
  const full = regexes.reduce((f, r) => f + r.source, "");
  return RegExp(`^${full}$`);
}
function combineExtractors(...extractors) {
  return (m) => extractors.reduce(
    ([mergedVals, mergedZone, cursor], ex) => {
      const [val, zone, next] = ex(m, cursor);
      return [{ ...mergedVals, ...val }, zone || mergedZone, next];
    },
    [{}, null, 1]
  ).slice(0, 2);
}
function parse(s2, ...patterns) {
  if (s2 == null) {
    return [null, null];
  }
  for (const [regex, extractor] of patterns) {
    const m = regex.exec(s2);
    if (m) {
      return extractor(m);
    }
  }
  return [null, null];
}
function simpleParse(...keys) {
  return (match2, cursor) => {
    const ret = {};
    let i;
    for (i = 0; i < keys.length; i++) {
      ret[keys[i]] = parseInteger(match2[cursor + i]);
    }
    return [ret, null, cursor + i];
  };
}
var offsetRegex = /(?:([Zz])|([+-]\d\d)(?::?(\d\d))?)/;
var isoExtendedZone = `(?:${offsetRegex.source}?(?:\\[(${ianaRegex.source})\\])?)?`;
var isoTimeBaseRegex = /(\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d{1,30}))?)?)?/;
var isoTimeRegex = RegExp(`${isoTimeBaseRegex.source}${isoExtendedZone}`);
var isoTimeExtensionRegex = RegExp(`(?:[Tt]${isoTimeRegex.source})?`);
var isoYmdRegex = /([+-]\d{6}|\d{4})(?:-?(\d\d)(?:-?(\d\d))?)?/;
var isoWeekRegex = /(\d{4})-?W(\d\d)(?:-?(\d))?/;
var isoOrdinalRegex = /(\d{4})-?(\d{3})/;
var extractISOWeekData = simpleParse("weekYear", "weekNumber", "weekDay");
var extractISOOrdinalData = simpleParse("year", "ordinal");
var sqlYmdRegex = /(\d{4})-(\d\d)-(\d\d)/;
var sqlTimeRegex = RegExp(
  `${isoTimeBaseRegex.source} ?(?:${offsetRegex.source}|(${ianaRegex.source}))?`
);
var sqlTimeExtensionRegex = RegExp(`(?: ${sqlTimeRegex.source})?`);
function int(match2, pos, fallback) {
  const m = match2[pos];
  return isUndefined(m) ? fallback : parseInteger(m);
}
function extractISOYmd(match2, cursor) {
  const item = {
    year: int(match2, cursor),
    month: int(match2, cursor + 1, 1),
    day: int(match2, cursor + 2, 1)
  };
  return [item, null, cursor + 3];
}
function extractISOTime(match2, cursor) {
  const item = {
    hours: int(match2, cursor, 0),
    minutes: int(match2, cursor + 1, 0),
    seconds: int(match2, cursor + 2, 0),
    milliseconds: parseMillis(match2[cursor + 3])
  };
  return [item, null, cursor + 4];
}
function extractISOOffset(match2, cursor) {
  const local = !match2[cursor] && !match2[cursor + 1], fullOffset = signedOffset(match2[cursor + 1], match2[cursor + 2]), zone = local ? null : FixedOffsetZone.instance(fullOffset);
  return [{}, zone, cursor + 3];
}
function extractIANAZone(match2, cursor) {
  const zone = match2[cursor] ? IANAZone.create(match2[cursor]) : null;
  return [{}, zone, cursor + 1];
}
var isoTimeOnly = RegExp(`^T?${isoTimeBaseRegex.source}$`);
var isoDuration = /^-?P(?:(?:(-?\d{1,20}(?:\.\d{1,20})?)Y)?(?:(-?\d{1,20}(?:\.\d{1,20})?)M)?(?:(-?\d{1,20}(?:\.\d{1,20})?)W)?(?:(-?\d{1,20}(?:\.\d{1,20})?)D)?(?:T(?:(-?\d{1,20}(?:\.\d{1,20})?)H)?(?:(-?\d{1,20}(?:\.\d{1,20})?)M)?(?:(-?\d{1,20})(?:[.,](-?\d{1,20}))?S)?)?)$/;
function extractISODuration(match2) {
  const [s2, yearStr, monthStr, weekStr, dayStr, hourStr, minuteStr, secondStr, millisecondsStr] = match2;
  const hasNegativePrefix = s2[0] === "-";
  const negativeSeconds = secondStr && secondStr[0] === "-";
  const maybeNegate = (num, force = false) => num !== void 0 && (force || num && hasNegativePrefix) ? -num : num;
  return [
    {
      years: maybeNegate(parseFloating(yearStr)),
      months: maybeNegate(parseFloating(monthStr)),
      weeks: maybeNegate(parseFloating(weekStr)),
      days: maybeNegate(parseFloating(dayStr)),
      hours: maybeNegate(parseFloating(hourStr)),
      minutes: maybeNegate(parseFloating(minuteStr)),
      seconds: maybeNegate(parseFloating(secondStr), secondStr === "-0"),
      milliseconds: maybeNegate(parseMillis(millisecondsStr), negativeSeconds)
    }
  ];
}
var obsOffsets = {
  GMT: 0,
  EDT: -4 * 60,
  EST: -5 * 60,
  CDT: -5 * 60,
  CST: -6 * 60,
  MDT: -6 * 60,
  MST: -7 * 60,
  PDT: -7 * 60,
  PST: -8 * 60
};
function fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
  const result = {
    year: yearStr.length === 2 ? untruncateYear(parseInteger(yearStr)) : parseInteger(yearStr),
    month: monthsShort.indexOf(monthStr) + 1,
    day: parseInteger(dayStr),
    hour: parseInteger(hourStr),
    minute: parseInteger(minuteStr)
  };
  if (secondStr) result.second = parseInteger(secondStr);
  if (weekdayStr) {
    result.weekday = weekdayStr.length > 3 ? weekdaysLong.indexOf(weekdayStr) + 1 : weekdaysShort.indexOf(weekdayStr) + 1;
  }
  return result;
}
var rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|(?:([+-]\d\d)(\d\d)))$/;
function extractRFC2822(match2) {
  const [
    ,
    weekdayStr,
    dayStr,
    monthStr,
    yearStr,
    hourStr,
    minuteStr,
    secondStr,
    obsOffset,
    milOffset,
    offHourStr,
    offMinuteStr
  ] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
  let offset2;
  if (obsOffset) {
    offset2 = obsOffsets[obsOffset];
  } else if (milOffset) {
    offset2 = 0;
  } else {
    offset2 = signedOffset(offHourStr, offMinuteStr);
  }
  return [result, new FixedOffsetZone(offset2)];
}
function preprocessRFC2822(s2) {
  return s2.replace(/\([^()]*\)|[\n\t]/g, " ").replace(/(\s\s+)/g, " ").trim();
}
var rfc1123 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d\d) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d\d):(\d\d):(\d\d) GMT$/;
var rfc850 = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d\d) (\d\d):(\d\d):(\d\d) GMT$/;
var ascii = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d\d) (\d\d):(\d\d):(\d\d) (\d{4})$/;
function extractRFC1123Or850(match2) {
  const [, weekdayStr, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
  return [result, FixedOffsetZone.utcInstance];
}
function extractASCII(match2) {
  const [, weekdayStr, monthStr, dayStr, hourStr, minuteStr, secondStr, yearStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
  return [result, FixedOffsetZone.utcInstance];
}
var isoYmdWithTimeExtensionRegex = combineRegexes(isoYmdRegex, isoTimeExtensionRegex);
var isoWeekWithTimeExtensionRegex = combineRegexes(isoWeekRegex, isoTimeExtensionRegex);
var isoOrdinalWithTimeExtensionRegex = combineRegexes(isoOrdinalRegex, isoTimeExtensionRegex);
var isoTimeCombinedRegex = combineRegexes(isoTimeRegex);
var extractISOYmdTimeAndOffset = combineExtractors(
  extractISOYmd,
  extractISOTime,
  extractISOOffset,
  extractIANAZone
);
var extractISOWeekTimeAndOffset = combineExtractors(
  extractISOWeekData,
  extractISOTime,
  extractISOOffset,
  extractIANAZone
);
var extractISOOrdinalDateAndTime = combineExtractors(
  extractISOOrdinalData,
  extractISOTime,
  extractISOOffset,
  extractIANAZone
);
var extractISOTimeAndOffset = combineExtractors(
  extractISOTime,
  extractISOOffset,
  extractIANAZone
);
function parseISODate(s2) {
  return parse(
    s2,
    [isoYmdWithTimeExtensionRegex, extractISOYmdTimeAndOffset],
    [isoWeekWithTimeExtensionRegex, extractISOWeekTimeAndOffset],
    [isoOrdinalWithTimeExtensionRegex, extractISOOrdinalDateAndTime],
    [isoTimeCombinedRegex, extractISOTimeAndOffset]
  );
}
function parseRFC2822Date(s2) {
  return parse(preprocessRFC2822(s2), [rfc2822, extractRFC2822]);
}
function parseHTTPDate(s2) {
  return parse(
    s2,
    [rfc1123, extractRFC1123Or850],
    [rfc850, extractRFC1123Or850],
    [ascii, extractASCII]
  );
}
function parseISODuration(s2) {
  return parse(s2, [isoDuration, extractISODuration]);
}
var extractISOTimeOnly = combineExtractors(extractISOTime);
function parseISOTimeOnly(s2) {
  return parse(s2, [isoTimeOnly, extractISOTimeOnly]);
}
var sqlYmdWithTimeExtensionRegex = combineRegexes(sqlYmdRegex, sqlTimeExtensionRegex);
var sqlTimeCombinedRegex = combineRegexes(sqlTimeRegex);
var extractISOTimeOffsetAndIANAZone = combineExtractors(
  extractISOTime,
  extractISOOffset,
  extractIANAZone
);
function parseSQL(s2) {
  return parse(
    s2,
    [sqlYmdWithTimeExtensionRegex, extractISOYmdTimeAndOffset],
    [sqlTimeCombinedRegex, extractISOTimeOffsetAndIANAZone]
  );
}
var INVALID$2 = "Invalid Duration";
var lowOrderMatrix = {
  weeks: {
    days: 7,
    hours: 7 * 24,
    minutes: 7 * 24 * 60,
    seconds: 7 * 24 * 60 * 60,
    milliseconds: 7 * 24 * 60 * 60 * 1e3
  },
  days: {
    hours: 24,
    minutes: 24 * 60,
    seconds: 24 * 60 * 60,
    milliseconds: 24 * 60 * 60 * 1e3
  },
  hours: { minutes: 60, seconds: 60 * 60, milliseconds: 60 * 60 * 1e3 },
  minutes: { seconds: 60, milliseconds: 60 * 1e3 },
  seconds: { milliseconds: 1e3 }
};
var casualMatrix = {
  years: {
    quarters: 4,
    months: 12,
    weeks: 52,
    days: 365,
    hours: 365 * 24,
    minutes: 365 * 24 * 60,
    seconds: 365 * 24 * 60 * 60,
    milliseconds: 365 * 24 * 60 * 60 * 1e3
  },
  quarters: {
    months: 3,
    weeks: 13,
    days: 91,
    hours: 91 * 24,
    minutes: 91 * 24 * 60,
    seconds: 91 * 24 * 60 * 60,
    milliseconds: 91 * 24 * 60 * 60 * 1e3
  },
  months: {
    weeks: 4,
    days: 30,
    hours: 30 * 24,
    minutes: 30 * 24 * 60,
    seconds: 30 * 24 * 60 * 60,
    milliseconds: 30 * 24 * 60 * 60 * 1e3
  },
  ...lowOrderMatrix
};
var daysInYearAccurate = 146097 / 400;
var daysInMonthAccurate = 146097 / 4800;
var accurateMatrix = {
  years: {
    quarters: 4,
    months: 12,
    weeks: daysInYearAccurate / 7,
    days: daysInYearAccurate,
    hours: daysInYearAccurate * 24,
    minutes: daysInYearAccurate * 24 * 60,
    seconds: daysInYearAccurate * 24 * 60 * 60,
    milliseconds: daysInYearAccurate * 24 * 60 * 60 * 1e3
  },
  quarters: {
    months: 3,
    weeks: daysInYearAccurate / 28,
    days: daysInYearAccurate / 4,
    hours: daysInYearAccurate * 24 / 4,
    minutes: daysInYearAccurate * 24 * 60 / 4,
    seconds: daysInYearAccurate * 24 * 60 * 60 / 4,
    milliseconds: daysInYearAccurate * 24 * 60 * 60 * 1e3 / 4
  },
  months: {
    weeks: daysInMonthAccurate / 7,
    days: daysInMonthAccurate,
    hours: daysInMonthAccurate * 24,
    minutes: daysInMonthAccurate * 24 * 60,
    seconds: daysInMonthAccurate * 24 * 60 * 60,
    milliseconds: daysInMonthAccurate * 24 * 60 * 60 * 1e3
  },
  ...lowOrderMatrix
};
var orderedUnits$1 = [
  "years",
  "quarters",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds"
];
var reverseUnits = orderedUnits$1.slice(0).reverse();
function clone$1(dur, alts, clear = false) {
  const conf = {
    values: clear ? alts.values : { ...dur.values, ...alts.values || {} },
    loc: dur.loc.clone(alts.loc),
    conversionAccuracy: alts.conversionAccuracy || dur.conversionAccuracy,
    matrix: alts.matrix || dur.matrix
  };
  return new Duration(conf);
}
function durationToMillis(matrix, vals) {
  let sum = vals.milliseconds ?? 0;
  for (const unit of reverseUnits.slice(1)) {
    if (vals[unit]) {
      sum += vals[unit] * matrix[unit]["milliseconds"];
    }
  }
  return sum;
}
function normalizeValues(matrix, vals) {
  const factor = durationToMillis(matrix, vals) < 0 ? -1 : 1;
  orderedUnits$1.reduceRight((previous, current) => {
    if (!isUndefined(vals[current])) {
      if (previous) {
        const previousVal = vals[previous] * factor;
        const conv = matrix[current][previous];
        const rollUp = Math.floor(previousVal / conv);
        vals[current] += rollUp * factor;
        vals[previous] -= rollUp * conv * factor;
      }
      return current;
    } else {
      return previous;
    }
  }, null);
  orderedUnits$1.reduce((previous, current) => {
    if (!isUndefined(vals[current])) {
      if (previous) {
        const fraction = vals[previous] % 1;
        vals[previous] -= fraction;
        vals[current] += fraction * matrix[previous][current];
      }
      return current;
    } else {
      return previous;
    }
  }, null);
}
function removeZeroes(vals) {
  const newVals = {};
  for (const [key2, value2] of Object.entries(vals)) {
    if (value2 !== 0) {
      newVals[key2] = value2;
    }
  }
  return newVals;
}
var Duration = class _Duration {
  /**
   * @private
   */
  constructor(config) {
    const accurate = config.conversionAccuracy === "longterm" || false;
    let matrix = accurate ? accurateMatrix : casualMatrix;
    if (config.matrix) {
      matrix = config.matrix;
    }
    this.values = config.values;
    this.loc = config.loc || Locale.create();
    this.conversionAccuracy = accurate ? "longterm" : "casual";
    this.invalid = config.invalid || null;
    this.matrix = matrix;
    this.isLuxonDuration = true;
  }
  /**
   * Create Duration from a number of milliseconds.
   * @param {number} count of milliseconds
   * @param {Object} opts - options for parsing
   * @param {string} [opts.locale='en-US'] - the locale to use
   * @param {string} opts.numberingSystem - the numbering system to use
   * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
   * @return {Duration}
   */
  static fromMillis(count, opts) {
    return _Duration.fromObject({ milliseconds: count }, opts);
  }
  /**
   * Create a Duration from a JavaScript object with keys like 'years' and 'hours'.
   * If this object is empty then a zero milliseconds duration is returned.
   * @param {Object} obj - the object to create the DateTime from
   * @param {number} obj.years
   * @param {number} obj.quarters
   * @param {number} obj.months
   * @param {number} obj.weeks
   * @param {number} obj.days
   * @param {number} obj.hours
   * @param {number} obj.minutes
   * @param {number} obj.seconds
   * @param {number} obj.milliseconds
   * @param {Object} [opts=[]] - options for creating this Duration
   * @param {string} [opts.locale='en-US'] - the locale to use
   * @param {string} opts.numberingSystem - the numbering system to use
   * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
   * @param {string} [opts.matrix=Object] - the custom conversion system to use
   * @return {Duration}
   */
  static fromObject(obj, opts = {}) {
    if (obj == null || typeof obj !== "object") {
      throw new InvalidArgumentError(
        `Duration.fromObject: argument expected to be an object, got ${obj === null ? "null" : typeof obj}`
      );
    }
    return new _Duration({
      values: normalizeObject(obj, _Duration.normalizeUnit),
      loc: Locale.fromObject(opts),
      conversionAccuracy: opts.conversionAccuracy,
      matrix: opts.matrix
    });
  }
  /**
   * Create a Duration from DurationLike.
   *
   * @param {Object | number | Duration} durationLike
   * One of:
   * - object with keys like 'years' and 'hours'.
   * - number representing milliseconds
   * - Duration instance
   * @return {Duration}
   */
  static fromDurationLike(durationLike) {
    if (isNumber(durationLike)) {
      return _Duration.fromMillis(durationLike);
    } else if (_Duration.isDuration(durationLike)) {
      return durationLike;
    } else if (typeof durationLike === "object") {
      return _Duration.fromObject(durationLike);
    } else {
      throw new InvalidArgumentError(
        `Unknown duration argument ${durationLike} of type ${typeof durationLike}`
      );
    }
  }
  /**
   * Create a Duration from an ISO 8601 duration string.
   * @param {string} text - text to parse
   * @param {Object} opts - options for parsing
   * @param {string} [opts.locale='en-US'] - the locale to use
   * @param {string} opts.numberingSystem - the numbering system to use
   * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
   * @param {string} [opts.matrix=Object] - the preset conversion system to use
   * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
   * @example Duration.fromISO('P3Y6M1W4DT12H30M5S').toObject() //=> { years: 3, months: 6, weeks: 1, days: 4, hours: 12, minutes: 30, seconds: 5 }
   * @example Duration.fromISO('PT23H').toObject() //=> { hours: 23 }
   * @example Duration.fromISO('P5Y3M').toObject() //=> { years: 5, months: 3 }
   * @return {Duration}
   */
  static fromISO(text, opts) {
    const [parsed] = parseISODuration(text);
    if (parsed) {
      return _Duration.fromObject(parsed, opts);
    } else {
      return _Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
    }
  }
  /**
   * Create a Duration from an ISO 8601 time string.
   * @param {string} text - text to parse
   * @param {Object} opts - options for parsing
   * @param {string} [opts.locale='en-US'] - the locale to use
   * @param {string} opts.numberingSystem - the numbering system to use
   * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
   * @param {string} [opts.matrix=Object] - the conversion system to use
   * @see https://en.wikipedia.org/wiki/ISO_8601#Times
   * @example Duration.fromISOTime('11:22:33.444').toObject() //=> { hours: 11, minutes: 22, seconds: 33, milliseconds: 444 }
   * @example Duration.fromISOTime('11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
   * @example Duration.fromISOTime('T11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
   * @example Duration.fromISOTime('1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
   * @example Duration.fromISOTime('T1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
   * @return {Duration}
   */
  static fromISOTime(text, opts) {
    const [parsed] = parseISOTimeOnly(text);
    if (parsed) {
      return _Duration.fromObject(parsed, opts);
    } else {
      return _Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
    }
  }
  /**
   * Create an invalid Duration.
   * @param {string} reason - simple string of why this datetime is invalid. Should not contain parameters or anything else data-dependent
   * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
   * @return {Duration}
   */
  static invalid(reason, explanation = null) {
    if (!reason) {
      throw new InvalidArgumentError("need to specify a reason the Duration is invalid");
    }
    const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
    if (Settings.throwOnInvalid) {
      throw new InvalidDurationError(invalid);
    } else {
      return new _Duration({ invalid });
    }
  }
  /**
   * @private
   */
  static normalizeUnit(unit) {
    const normalized = {
      year: "years",
      years: "years",
      quarter: "quarters",
      quarters: "quarters",
      month: "months",
      months: "months",
      week: "weeks",
      weeks: "weeks",
      day: "days",
      days: "days",
      hour: "hours",
      hours: "hours",
      minute: "minutes",
      minutes: "minutes",
      second: "seconds",
      seconds: "seconds",
      millisecond: "milliseconds",
      milliseconds: "milliseconds"
    }[unit ? unit.toLowerCase() : unit];
    if (!normalized) throw new InvalidUnitError(unit);
    return normalized;
  }
  /**
   * Check if an object is a Duration. Works across context boundaries
   * @param {object} o
   * @return {boolean}
   */
  static isDuration(o) {
    return o && o.isLuxonDuration || false;
  }
  /**
   * Get  the locale of a Duration, such 'en-GB'
   * @type {string}
   */
  get locale() {
    return this.isValid ? this.loc.locale : null;
  }
  /**
   * Get the numbering system of a Duration, such 'beng'. The numbering system is used when formatting the Duration
   *
   * @type {string}
   */
  get numberingSystem() {
    return this.isValid ? this.loc.numberingSystem : null;
  }
  /**
   * Returns a string representation of this Duration formatted according to the specified format string. You may use these tokens:
   * * `S` for milliseconds
   * * `s` for seconds
   * * `m` for minutes
   * * `h` for hours
   * * `d` for days
   * * `w` for weeks
   * * `M` for months
   * * `y` for years
   * Notes:
   * * Add padding by repeating the token, e.g. "yy" pads the years to two digits, "hhhh" pads the hours out to four digits
   * * Tokens can be escaped by wrapping with single quotes.
   * * The duration will be converted to the set of units in the format string using {@link Duration#shiftTo} and the Durations's conversion accuracy setting.
   * @param {string} fmt - the format string
   * @param {Object} opts - options
   * @param {boolean} [opts.floor=true] - floor numerical values
   * @param {'negative'|'all'|'negativeLargestOnly'} [opts.signMode=negative] - How to handle signs
   * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("y d s") //=> "1 6 2"
   * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("yy dd sss") //=> "01 06 002"
   * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("M S") //=> "12 518402000"
   * @example Duration.fromObject({ days: 6, seconds: 2 }).toFormat("d s", { signMode: "all" }) //=> "+6 +2"
   * @example Duration.fromObject({ days: -6, seconds: -2 }).toFormat("d s", { signMode: "all" }) //=> "-6 -2"
   * @example Duration.fromObject({ days: -6, seconds: -2 }).toFormat("d s", { signMode: "negativeLargestOnly" }) //=> "-6 2"
   * @return {string}
   */
  toFormat(fmt, opts = {}) {
    const fmtOpts = {
      ...opts,
      floor: opts.round !== false && opts.floor !== false
    };
    return this.isValid ? Formatter.create(this.loc, fmtOpts).formatDurationFromString(this, fmt) : INVALID$2;
  }
  /**
   * Returns a string representation of a Duration with all units included.
   * To modify its behavior, use `listStyle` and any Intl.NumberFormat option, though `unitDisplay` is especially relevant.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#options
   * @param {Object} opts - Formatting options. Accepts the same keys as the options parameter of the native `Intl.NumberFormat` constructor, as well as `listStyle`.
   * @param {string} [opts.listStyle='narrow'] - How to format the merged list. Corresponds to the `style` property of the options parameter of the native `Intl.ListFormat` constructor.
   * @param {boolean} [opts.showZeros=true] - Show all units previously used by the duration even if they are zero
   * @example
   * ```js
   * var dur = Duration.fromObject({ months: 1, weeks: 0, hours: 5, minutes: 6 })
   * dur.toHuman() //=> '1 month, 0 weeks, 5 hours, 6 minutes'
   * dur.toHuman({ listStyle: "long" }) //=> '1 month, 0 weeks, 5 hours, and 6 minutes'
   * dur.toHuman({ unitDisplay: "short" }) //=> '1 mth, 0 wks, 5 hr, 6 min'
   * dur.toHuman({ showZeros: false }) //=> '1 month, 5 hours, 6 minutes'
   * ```
   */
  toHuman(opts = {}) {
    if (!this.isValid) return INVALID$2;
    const showZeros = opts.showZeros !== false;
    const l2 = orderedUnits$1.map((unit) => {
      const val = this.values[unit];
      if (isUndefined(val) || val === 0 && !showZeros) {
        return null;
      }
      return this.loc.numberFormatter({ style: "unit", unitDisplay: "long", ...opts, unit: unit.slice(0, -1) }).format(val);
    }).filter((n2) => n2);
    return this.loc.listFormatter({ type: "conjunction", style: opts.listStyle || "narrow", ...opts }).format(l2);
  }
  /**
   * Returns a JavaScript object with this Duration's values.
   * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toObject() //=> { years: 1, days: 6, seconds: 2 }
   * @return {Object}
   */
  toObject() {
    if (!this.isValid) return {};
    return { ...this.values };
  }
  /**
   * Returns an ISO 8601-compliant string representation of this Duration.
   * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
   * @example Duration.fromObject({ years: 3, seconds: 45 }).toISO() //=> 'P3YT45S'
   * @example Duration.fromObject({ months: 4, seconds: 45 }).toISO() //=> 'P4MT45S'
   * @example Duration.fromObject({ months: 5 }).toISO() //=> 'P5M'
   * @example Duration.fromObject({ minutes: 5 }).toISO() //=> 'PT5M'
   * @example Duration.fromObject({ milliseconds: 6 }).toISO() //=> 'PT0.006S'
   * @return {string}
   */
  toISO() {
    if (!this.isValid) return null;
    let s2 = "P";
    if (this.years !== 0) s2 += this.years + "Y";
    if (this.months !== 0 || this.quarters !== 0) s2 += this.months + this.quarters * 3 + "M";
    if (this.weeks !== 0) s2 += this.weeks + "W";
    if (this.days !== 0) s2 += this.days + "D";
    if (this.hours !== 0 || this.minutes !== 0 || this.seconds !== 0 || this.milliseconds !== 0)
      s2 += "T";
    if (this.hours !== 0) s2 += this.hours + "H";
    if (this.minutes !== 0) s2 += this.minutes + "M";
    if (this.seconds !== 0 || this.milliseconds !== 0)
      s2 += roundTo(this.seconds + this.milliseconds / 1e3, 3) + "S";
    if (s2 === "P") s2 += "T0S";
    return s2;
  }
  /**
   * Returns an ISO 8601-compliant string representation of this Duration, formatted as a time of day.
   * Note that this will return null if the duration is invalid, negative, or equal to or greater than 24 hours.
   * @see https://en.wikipedia.org/wiki/ISO_8601#Times
   * @param {Object} opts - options
   * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
   * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
   * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
   * @param {string} [opts.format='extended'] - choose between the basic and extended format
   * @example Duration.fromObject({ hours: 11 }).toISOTime() //=> '11:00:00.000'
   * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressMilliseconds: true }) //=> '11:00:00'
   * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressSeconds: true }) //=> '11:00'
   * @example Duration.fromObject({ hours: 11 }).toISOTime({ includePrefix: true }) //=> 'T11:00:00.000'
   * @example Duration.fromObject({ hours: 11 }).toISOTime({ format: 'basic' }) //=> '110000.000'
   * @return {string}
   */
  toISOTime(opts = {}) {
    if (!this.isValid) return null;
    const millis = this.toMillis();
    if (millis < 0 || millis >= 864e5) return null;
    opts = {
      suppressMilliseconds: false,
      suppressSeconds: false,
      includePrefix: false,
      format: "extended",
      ...opts,
      includeOffset: false
    };
    const dateTime = DateTime.fromMillis(millis, { zone: "UTC" });
    return dateTime.toISOTime(opts);
  }
  /**
   * Returns an ISO 8601 representation of this Duration appropriate for use in JSON.
   * @return {string}
   */
  toJSON() {
    return this.toISO();
  }
  /**
   * Returns an ISO 8601 representation of this Duration appropriate for use in debugging.
   * @return {string}
   */
  toString() {
    return this.toISO();
  }
  /**
   * Returns a string representation of this Duration appropriate for the REPL.
   * @return {string}
   */
  [Symbol.for("nodejs.util.inspect.custom")]() {
    if (this.isValid) {
      return `Duration { values: ${JSON.stringify(this.values)} }`;
    } else {
      return `Duration { Invalid, reason: ${this.invalidReason} }`;
    }
  }
  /**
   * Returns an milliseconds value of this Duration.
   * @return {number}
   */
  toMillis() {
    if (!this.isValid) return NaN;
    return durationToMillis(this.matrix, this.values);
  }
  /**
   * Returns an milliseconds value of this Duration. Alias of {@link toMillis}
   * @return {number}
   */
  valueOf() {
    return this.toMillis();
  }
  /**
   * Make this Duration longer by the specified amount. Return a newly-constructed Duration.
   * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
   * @return {Duration}
   */
  plus(duration) {
    if (!this.isValid) return this;
    const dur = _Duration.fromDurationLike(duration), result = {};
    for (const k of orderedUnits$1) {
      if (hasOwnProperty(dur.values, k) || hasOwnProperty(this.values, k)) {
        result[k] = dur.get(k) + this.get(k);
      }
    }
    return clone$1(this, { values: result }, true);
  }
  /**
   * Make this Duration shorter by the specified amount. Return a newly-constructed Duration.
   * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
   * @return {Duration}
   */
  minus(duration) {
    if (!this.isValid) return this;
    const dur = _Duration.fromDurationLike(duration);
    return this.plus(dur.negate());
  }
  /**
   * Scale this Duration by the specified amount. Return a newly-constructed Duration.
   * @param {function} fn - The function to apply to each unit. Arity is 1 or 2: the value of the unit and, optionally, the unit name. Must return a number.
   * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnits(x => x * 2) //=> { hours: 2, minutes: 60 }
   * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnits((x, u) => u === "hours" ? x * 2 : x) //=> { hours: 2, minutes: 30 }
   * @return {Duration}
   */
  mapUnits(fn) {
    if (!this.isValid) return this;
    const result = {};
    for (const k of Object.keys(this.values)) {
      result[k] = asNumber(fn(this.values[k], k));
    }
    return clone$1(this, { values: result }, true);
  }
  /**
   * Get the value of unit.
   * @param {string} unit - a unit such as 'minute' or 'day'
   * @example Duration.fromObject({years: 2, days: 3}).get('years') //=> 2
   * @example Duration.fromObject({years: 2, days: 3}).get('months') //=> 0
   * @example Duration.fromObject({years: 2, days: 3}).get('days') //=> 3
   * @return {number}
   */
  get(unit) {
    return this[_Duration.normalizeUnit(unit)];
  }
  /**
   * "Set" the values of specified units. Return a newly-constructed Duration.
   * @param {Object} values - a mapping of units to numbers
   * @example dur.set({ years: 2017 })
   * @example dur.set({ hours: 8, minutes: 30 })
   * @return {Duration}
   */
  set(values) {
    if (!this.isValid) return this;
    const mixed = { ...this.values, ...normalizeObject(values, _Duration.normalizeUnit) };
    return clone$1(this, { values: mixed });
  }
  /**
   * "Set" the locale and/or numberingSystem.  Returns a newly-constructed Duration.
   * @example dur.reconfigure({ locale: 'en-GB' })
   * @return {Duration}
   */
  reconfigure({ locale, numberingSystem, conversionAccuracy, matrix } = {}) {
    const loc = this.loc.clone({ locale, numberingSystem });
    const opts = { loc, matrix, conversionAccuracy };
    return clone$1(this, opts);
  }
  /**
   * Return the length of the duration in the specified unit.
   * @param {string} unit - a unit such as 'minutes' or 'days'
   * @example Duration.fromObject({years: 1}).as('days') //=> 365
   * @example Duration.fromObject({years: 1}).as('months') //=> 12
   * @example Duration.fromObject({hours: 60}).as('days') //=> 2.5
   * @return {number}
   */
  as(unit) {
    return this.isValid ? this.shiftTo(unit).get(unit) : NaN;
  }
  /**
   * Reduce this Duration to its canonical representation in its current units.
   * Assuming the overall value of the Duration is positive, this means:
   * - excessive values for lower-order units are converted to higher-order units (if possible, see first and second example)
   * - negative lower-order units are converted to higher order units (there must be such a higher order unit, otherwise
   *   the overall value would be negative, see third example)
   * - fractional values for higher-order units are converted to lower-order units (if possible, see fourth example)
   *
   * If the overall value is negative, the result of this method is equivalent to `this.negate().normalize().negate()`.
   * @example Duration.fromObject({ years: 2, days: 5000 }).normalize().toObject() //=> { years: 15, days: 255 }
   * @example Duration.fromObject({ days: 5000 }).normalize().toObject() //=> { days: 5000 }
   * @example Duration.fromObject({ hours: 12, minutes: -45 }).normalize().toObject() //=> { hours: 11, minutes: 15 }
   * @example Duration.fromObject({ years: 2.5, days: 0, hours: 0 }).normalize().toObject() //=> { years: 2, days: 182, hours: 12 }
   * @return {Duration}
   */
  normalize() {
    if (!this.isValid) return this;
    const vals = this.toObject();
    normalizeValues(this.matrix, vals);
    return clone$1(this, { values: vals }, true);
  }
  /**
   * Rescale units to its largest representation
   * @example Duration.fromObject({ milliseconds: 90000 }).rescale().toObject() //=> { minutes: 1, seconds: 30 }
   * @return {Duration}
   */
  rescale() {
    if (!this.isValid) return this;
    const vals = removeZeroes(this.normalize().shiftToAll().toObject());
    return clone$1(this, { values: vals }, true);
  }
  /**
   * Convert this Duration into its representation in a different set of units.
   * @example Duration.fromObject({ hours: 1, seconds: 30 }).shiftTo('minutes', 'milliseconds').toObject() //=> { minutes: 60, milliseconds: 30000 }
   * @return {Duration}
   */
  shiftTo(...units) {
    if (!this.isValid) return this;
    if (units.length === 0) {
      return this;
    }
    units = units.map((u) => _Duration.normalizeUnit(u));
    const built = {}, accumulated = {}, vals = this.toObject();
    let lastUnit;
    for (const k of orderedUnits$1) {
      if (units.indexOf(k) >= 0) {
        lastUnit = k;
        let own = 0;
        for (const ak in accumulated) {
          own += this.matrix[ak][k] * accumulated[ak];
          accumulated[ak] = 0;
        }
        if (isNumber(vals[k])) {
          own += vals[k];
        }
        const i = Math.trunc(own);
        built[k] = i;
        accumulated[k] = (own * 1e3 - i * 1e3) / 1e3;
      } else if (isNumber(vals[k])) {
        accumulated[k] = vals[k];
      }
    }
    for (const key2 in accumulated) {
      if (accumulated[key2] !== 0) {
        built[lastUnit] += key2 === lastUnit ? accumulated[key2] : accumulated[key2] / this.matrix[lastUnit][key2];
      }
    }
    normalizeValues(this.matrix, built);
    return clone$1(this, { values: built }, true);
  }
  /**
   * Shift this Duration to all available units.
   * Same as shiftTo("years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds")
   * @return {Duration}
   */
  shiftToAll() {
    if (!this.isValid) return this;
    return this.shiftTo(
      "years",
      "months",
      "weeks",
      "days",
      "hours",
      "minutes",
      "seconds",
      "milliseconds"
    );
  }
  /**
   * Return the negative of this Duration.
   * @example Duration.fromObject({ hours: 1, seconds: 30 }).negate().toObject() //=> { hours: -1, seconds: -30 }
   * @return {Duration}
   */
  negate() {
    if (!this.isValid) return this;
    const negated = {};
    for (const k of Object.keys(this.values)) {
      negated[k] = this.values[k] === 0 ? 0 : -this.values[k];
    }
    return clone$1(this, { values: negated }, true);
  }
  /**
   * Removes all units with values equal to 0 from this Duration.
   * @example Duration.fromObject({ years: 2, days: 0, hours: 0, minutes: 0 }).removeZeros().toObject() //=> { years: 2 }
   * @return {Duration}
   */
  removeZeros() {
    if (!this.isValid) return this;
    const vals = removeZeroes(this.values);
    return clone$1(this, { values: vals }, true);
  }
  /**
   * Get the years.
   * @type {number}
   */
  get years() {
    return this.isValid ? this.values.years || 0 : NaN;
  }
  /**
   * Get the quarters.
   * @type {number}
   */
  get quarters() {
    return this.isValid ? this.values.quarters || 0 : NaN;
  }
  /**
   * Get the months.
   * @type {number}
   */
  get months() {
    return this.isValid ? this.values.months || 0 : NaN;
  }
  /**
   * Get the weeks
   * @type {number}
   */
  get weeks() {
    return this.isValid ? this.values.weeks || 0 : NaN;
  }
  /**
   * Get the days.
   * @type {number}
   */
  get days() {
    return this.isValid ? this.values.days || 0 : NaN;
  }
  /**
   * Get the hours.
   * @type {number}
   */
  get hours() {
    return this.isValid ? this.values.hours || 0 : NaN;
  }
  /**
   * Get the minutes.
   * @type {number}
   */
  get minutes() {
    return this.isValid ? this.values.minutes || 0 : NaN;
  }
  /**
   * Get the seconds.
   * @return {number}
   */
  get seconds() {
    return this.isValid ? this.values.seconds || 0 : NaN;
  }
  /**
   * Get the milliseconds.
   * @return {number}
   */
  get milliseconds() {
    return this.isValid ? this.values.milliseconds || 0 : NaN;
  }
  /**
   * Returns whether the Duration is invalid. Invalid durations are returned by diff operations
   * on invalid DateTimes or Intervals.
   * @return {boolean}
   */
  get isValid() {
    return this.invalid === null;
  }
  /**
   * Returns an error code if this Duration became invalid, or null if the Duration is valid
   * @return {string}
   */
  get invalidReason() {
    return this.invalid ? this.invalid.reason : null;
  }
  /**
   * Returns an explanation of why this Duration became invalid, or null if the Duration is valid
   * @type {string}
   */
  get invalidExplanation() {
    return this.invalid ? this.invalid.explanation : null;
  }
  /**
   * Equality check
   * Two Durations are equal iff they have the same units and the same values for each unit.
   * @param {Duration} other
   * @return {boolean}
   */
  equals(other) {
    if (!this.isValid || !other.isValid) {
      return false;
    }
    if (!this.loc.equals(other.loc)) {
      return false;
    }
    function eq(v1, v2) {
      if (v1 === void 0 || v1 === 0) return v2 === void 0 || v2 === 0;
      return v1 === v2;
    }
    for (const u of orderedUnits$1) {
      if (!eq(this.values[u], other.values[u])) {
        return false;
      }
    }
    return true;
  }
};
var INVALID$1 = "Invalid Interval";
function validateStartEnd(start, end) {
  if (!start || !start.isValid) {
    return Interval.invalid("missing or invalid start");
  } else if (!end || !end.isValid) {
    return Interval.invalid("missing or invalid end");
  } else if (end < start) {
    return Interval.invalid(
      "end before start",
      `The end of an interval must be after its start, but you had start=${start.toISO()} and end=${end.toISO()}`
    );
  } else {
    return null;
  }
}
var Interval = class _Interval {
  /**
   * @private
   */
  constructor(config) {
    this.s = config.start;
    this.e = config.end;
    this.invalid = config.invalid || null;
    this.isLuxonInterval = true;
  }
  /**
   * Create an invalid Interval.
   * @param {string} reason - simple string of why this Interval is invalid. Should not contain parameters or anything else data-dependent
   * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
   * @return {Interval}
   */
  static invalid(reason, explanation = null) {
    if (!reason) {
      throw new InvalidArgumentError("need to specify a reason the Interval is invalid");
    }
    const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
    if (Settings.throwOnInvalid) {
      throw new InvalidIntervalError(invalid);
    } else {
      return new _Interval({ invalid });
    }
  }
  /**
   * Create an Interval from a start DateTime and an end DateTime. Inclusive of the start but not the end.
   * @param {DateTime|Date|Object} start
   * @param {DateTime|Date|Object} end
   * @return {Interval}
   */
  static fromDateTimes(start, end) {
    const builtStart = friendlyDateTime(start), builtEnd = friendlyDateTime(end);
    const validateError = validateStartEnd(builtStart, builtEnd);
    if (validateError == null) {
      return new _Interval({
        start: builtStart,
        end: builtEnd
      });
    } else {
      return validateError;
    }
  }
  /**
   * Create an Interval from a start DateTime and a Duration to extend to.
   * @param {DateTime|Date|Object} start
   * @param {Duration|Object|number} duration - the length of the Interval.
   * @return {Interval}
   */
  static after(start, duration) {
    const dur = Duration.fromDurationLike(duration), dt = friendlyDateTime(start);
    return _Interval.fromDateTimes(dt, dt.plus(dur));
  }
  /**
   * Create an Interval from an end DateTime and a Duration to extend backwards to.
   * @param {DateTime|Date|Object} end
   * @param {Duration|Object|number} duration - the length of the Interval.
   * @return {Interval}
   */
  static before(end, duration) {
    const dur = Duration.fromDurationLike(duration), dt = friendlyDateTime(end);
    return _Interval.fromDateTimes(dt.minus(dur), dt);
  }
  /**
   * Create an Interval from an ISO 8601 string.
   * Accepts `<start>/<end>`, `<start>/<duration>`, and `<duration>/<end>` formats.
   * @param {string} text - the ISO string to parse
   * @param {Object} [opts] - options to pass {@link DateTime#fromISO} and optionally {@link Duration#fromISO}
   * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
   * @return {Interval}
   */
  static fromISO(text, opts) {
    const [s2, e] = (text || "").split("/", 2);
    if (s2 && e) {
      let start, startIsValid;
      try {
        start = DateTime.fromISO(s2, opts);
        startIsValid = start.isValid;
      } catch (e2) {
        startIsValid = false;
      }
      let end, endIsValid;
      try {
        end = DateTime.fromISO(e, opts);
        endIsValid = end.isValid;
      } catch (e2) {
        endIsValid = false;
      }
      if (startIsValid && endIsValid) {
        return _Interval.fromDateTimes(start, end);
      }
      if (startIsValid) {
        const dur = Duration.fromISO(e, opts);
        if (dur.isValid) {
          return _Interval.after(start, dur);
        }
      } else if (endIsValid) {
        const dur = Duration.fromISO(s2, opts);
        if (dur.isValid) {
          return _Interval.before(end, dur);
        }
      }
    }
    return _Interval.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
  }
  /**
   * Check if an object is an Interval. Works across context boundaries
   * @param {object} o
   * @return {boolean}
   */
  static isInterval(o) {
    return o && o.isLuxonInterval || false;
  }
  /**
   * Returns the start of the Interval
   * @type {DateTime}
   */
  get start() {
    return this.isValid ? this.s : null;
  }
  /**
   * Returns the end of the Interval. This is the first instant which is not part of the interval
   * (Interval is half-open).
   * @type {DateTime}
   */
  get end() {
    return this.isValid ? this.e : null;
  }
  /**
   * Returns the last DateTime included in the interval (since end is not part of the interval)
   * @type {DateTime}
   */
  get lastDateTime() {
    return this.isValid ? this.e ? this.e.minus(1) : null : null;
  }
  /**
   * Returns whether this Interval's end is at least its start, meaning that the Interval isn't 'backwards'.
   * @type {boolean}
   */
  get isValid() {
    return this.invalidReason === null;
  }
  /**
   * Returns an error code if this Interval is invalid, or null if the Interval is valid
   * @type {string}
   */
  get invalidReason() {
    return this.invalid ? this.invalid.reason : null;
  }
  /**
   * Returns an explanation of why this Interval became invalid, or null if the Interval is valid
   * @type {string}
   */
  get invalidExplanation() {
    return this.invalid ? this.invalid.explanation : null;
  }
  /**
   * Returns the length of the Interval in the specified unit.
   * @param {string} unit - the unit (such as 'hours' or 'days') to return the length in.
   * @return {number}
   */
  length(unit = "milliseconds") {
    return this.isValid ? this.toDuration(...[unit]).get(unit) : NaN;
  }
  /**
   * Returns the count of minutes, hours, days, months, or years included in the Interval, even in part.
   * Unlike {@link Interval#length} this counts sections of the calendar, not periods of time, e.g. specifying 'day'
   * asks 'what dates are included in this interval?', not 'how many days long is this interval?'
   * @param {string} [unit='milliseconds'] - the unit of time to count.
   * @param {Object} opts - options
   * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week; this operation will always use the locale of the start DateTime
   * @return {number}
   */
  count(unit = "milliseconds", opts) {
    if (!this.isValid) return NaN;
    const start = this.start.startOf(unit, opts);
    let end;
    if (opts?.useLocaleWeeks) {
      end = this.end.reconfigure({ locale: start.locale });
    } else {
      end = this.end;
    }
    end = end.startOf(unit, opts);
    return Math.floor(end.diff(start, unit).get(unit)) + (end.valueOf() !== this.end.valueOf());
  }
  /**
   * Returns whether this Interval's start and end are both in the same unit of time
   * @param {string} unit - the unit of time to check sameness on
   * @return {boolean}
   */
  hasSame(unit) {
    return this.isValid ? this.isEmpty() || this.e.minus(1).hasSame(this.s, unit) : false;
  }
  /**
   * Return whether this Interval has the same start and end DateTimes.
   * @return {boolean}
   */
  isEmpty() {
    return this.s.valueOf() === this.e.valueOf();
  }
  /**
   * Return whether this Interval's start is after the specified DateTime.
   * @param {DateTime} dateTime
   * @return {boolean}
   */
  isAfter(dateTime) {
    if (!this.isValid) return false;
    return this.s > dateTime;
  }
  /**
   * Return whether this Interval's end is before the specified DateTime.
   * @param {DateTime} dateTime
   * @return {boolean}
   */
  isBefore(dateTime) {
    if (!this.isValid) return false;
    return this.e <= dateTime;
  }
  /**
   * Return whether this Interval contains the specified DateTime.
   * @param {DateTime} dateTime
   * @return {boolean}
   */
  contains(dateTime) {
    if (!this.isValid) return false;
    return this.s <= dateTime && this.e > dateTime;
  }
  /**
   * "Sets" the start and/or end dates. Returns a newly-constructed Interval.
   * @param {Object} values - the values to set
   * @param {DateTime} values.start - the starting DateTime
   * @param {DateTime} values.end - the ending DateTime
   * @return {Interval}
   */
  set({ start, end } = {}) {
    if (!this.isValid) return this;
    return _Interval.fromDateTimes(start || this.s, end || this.e);
  }
  /**
   * Split this Interval at each of the specified DateTimes
   * @param {...DateTime} dateTimes - the unit of time to count.
   * @return {Array}
   */
  splitAt(...dateTimes) {
    if (!this.isValid) return [];
    const sorted = dateTimes.map(friendlyDateTime).filter((d) => this.contains(d)).sort((a, b) => a.toMillis() - b.toMillis()), results = [];
    let { s: s2 } = this, i = 0;
    while (s2 < this.e) {
      const added = sorted[i] || this.e, next = +added > +this.e ? this.e : added;
      results.push(_Interval.fromDateTimes(s2, next));
      s2 = next;
      i += 1;
    }
    return results;
  }
  /**
   * Split this Interval into smaller Intervals, each of the specified length.
   * Left over time is grouped into a smaller interval
   * @param {Duration|Object|number} duration - The length of each resulting interval.
   * @return {Array}
   */
  splitBy(duration) {
    const dur = Duration.fromDurationLike(duration);
    if (!this.isValid || !dur.isValid || dur.as("milliseconds") === 0) {
      return [];
    }
    let { s: s2 } = this, idx = 1, next;
    const results = [];
    while (s2 < this.e) {
      const added = this.start.plus(dur.mapUnits((x) => x * idx));
      next = +added > +this.e ? this.e : added;
      results.push(_Interval.fromDateTimes(s2, next));
      s2 = next;
      idx += 1;
    }
    return results;
  }
  /**
   * Split this Interval into the specified number of smaller intervals.
   * @param {number} numberOfParts - The number of Intervals to divide the Interval into.
   * @return {Array}
   */
  divideEqually(numberOfParts) {
    if (!this.isValid) return [];
    return this.splitBy(this.length() / numberOfParts).slice(0, numberOfParts);
  }
  /**
   * Return whether this Interval overlaps with the specified Interval
   * @param {Interval} other
   * @return {boolean}
   */
  overlaps(other) {
    return this.e > other.s && this.s < other.e;
  }
  /**
   * Return whether this Interval's end is adjacent to the specified Interval's start.
   * @param {Interval} other
   * @return {boolean}
   */
  abutsStart(other) {
    if (!this.isValid) return false;
    return +this.e === +other.s;
  }
  /**
   * Return whether this Interval's start is adjacent to the specified Interval's end.
   * @param {Interval} other
   * @return {boolean}
   */
  abutsEnd(other) {
    if (!this.isValid) return false;
    return +other.e === +this.s;
  }
  /**
   * Returns true if this Interval fully contains the specified Interval, specifically if the intersect (of this Interval and the other Interval) is equal to the other Interval; false otherwise.
   * @param {Interval} other
   * @return {boolean}
   */
  engulfs(other) {
    if (!this.isValid) return false;
    return this.s <= other.s && this.e >= other.e;
  }
  /**
   * Return whether this Interval has the same start and end as the specified Interval.
   * @param {Interval} other
   * @return {boolean}
   */
  equals(other) {
    if (!this.isValid || !other.isValid) {
      return false;
    }
    return this.s.equals(other.s) && this.e.equals(other.e);
  }
  /**
   * Return an Interval representing the intersection of this Interval and the specified Interval.
   * Specifically, the resulting Interval has the maximum start time and the minimum end time of the two Intervals.
   * Returns null if the intersection is empty, meaning, the intervals don't intersect.
   * @param {Interval} other
   * @return {Interval}
   */
  intersection(other) {
    if (!this.isValid) return this;
    const s2 = this.s > other.s ? this.s : other.s, e = this.e < other.e ? this.e : other.e;
    if (s2 >= e) {
      return null;
    } else {
      return _Interval.fromDateTimes(s2, e);
    }
  }
  /**
   * Return an Interval representing the union of this Interval and the specified Interval.
   * Specifically, the resulting Interval has the minimum start time and the maximum end time of the two Intervals.
   * @param {Interval} other
   * @return {Interval}
   */
  union(other) {
    if (!this.isValid) return this;
    const s2 = this.s < other.s ? this.s : other.s, e = this.e > other.e ? this.e : other.e;
    return _Interval.fromDateTimes(s2, e);
  }
  /**
   * Merge an array of Intervals into an equivalent minimal set of Intervals.
   * Combines overlapping and adjacent Intervals.
   * The resulting array will contain the Intervals in ascending order, that is, starting with the earliest Interval
   * and ending with the latest.
   *
   * @param {Array} intervals
   * @return {Array}
   */
  static merge(intervals) {
    const [found, final] = intervals.sort((a, b) => a.s - b.s).reduce(
      ([sofar, current], item) => {
        if (!current) {
          return [sofar, item];
        } else if (current.overlaps(item) || current.abutsStart(item)) {
          return [sofar, current.union(item)];
        } else {
          return [sofar.concat([current]), item];
        }
      },
      [[], null]
    );
    if (final) {
      found.push(final);
    }
    return found;
  }
  /**
   * Return an array of Intervals representing the spans of time that only appear in one of the specified Intervals.
   * @param {Array} intervals
   * @return {Array}
   */
  static xor(intervals) {
    let start = null, currentCount = 0;
    const results = [], ends = intervals.map((i) => [
      { time: i.s, type: "s" },
      { time: i.e, type: "e" }
    ]), flattened = Array.prototype.concat(...ends), arr = flattened.sort((a, b) => a.time - b.time);
    for (const i of arr) {
      currentCount += i.type === "s" ? 1 : -1;
      if (currentCount === 1) {
        start = i.time;
      } else {
        if (start && +start !== +i.time) {
          results.push(_Interval.fromDateTimes(start, i.time));
        }
        start = null;
      }
    }
    return _Interval.merge(results);
  }
  /**
   * Return an Interval representing the span of time in this Interval that doesn't overlap with any of the specified Intervals.
   * @param {...Interval} intervals
   * @return {Array}
   */
  difference(...intervals) {
    return _Interval.xor([this].concat(intervals)).map((i) => this.intersection(i)).filter((i) => i && !i.isEmpty());
  }
  /**
   * Returns a string representation of this Interval appropriate for debugging.
   * @return {string}
   */
  toString() {
    if (!this.isValid) return INVALID$1;
    return `[${this.s.toISO()} \u2013 ${this.e.toISO()})`;
  }
  /**
   * Returns a string representation of this Interval appropriate for the REPL.
   * @return {string}
   */
  [Symbol.for("nodejs.util.inspect.custom")]() {
    if (this.isValid) {
      return `Interval { start: ${this.s.toISO()}, end: ${this.e.toISO()} }`;
    } else {
      return `Interval { Invalid, reason: ${this.invalidReason} }`;
    }
  }
  /**
   * Returns a localized string representing this Interval. Accepts the same options as the
   * Intl.DateTimeFormat constructor and any presets defined by Luxon, such as
   * {@link DateTime.DATE_FULL} or {@link DateTime.TIME_SIMPLE}. The exact behavior of this method
   * is browser-specific, but in general it will return an appropriate representation of the
   * Interval in the assigned locale. Defaults to the system's locale if no locale has been
   * specified.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
   * @param {Object} [formatOpts=DateTime.DATE_SHORT] - Either a DateTime preset or
   * Intl.DateTimeFormat constructor options.
   * @param {Object} opts - Options to override the configuration of the start DateTime.
   * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(); //=> 11/7/2022 – 11/8/2022
   * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(DateTime.DATE_FULL); //=> November 7 – 8, 2022
   * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(DateTime.DATE_FULL, { locale: 'fr-FR' }); //=> 7–8 novembre 2022
   * @example Interval.fromISO('2022-11-07T17:00Z/2022-11-07T19:00Z').toLocaleString(DateTime.TIME_SIMPLE); //=> 6:00 – 8:00 PM
   * @example Interval.fromISO('2022-11-07T17:00Z/2022-11-07T19:00Z').toLocaleString({ weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); //=> Mon, Nov 07, 6:00 – 8:00 p
   * @return {string}
   */
  toLocaleString(formatOpts = DATE_SHORT, opts = {}) {
    return this.isValid ? Formatter.create(this.s.loc.clone(opts), formatOpts).formatInterval(this) : INVALID$1;
  }
  /**
   * Returns an ISO 8601-compliant string representation of this Interval.
   * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
   * @param {Object} opts - The same options as {@link DateTime#toISO}
   * @return {string}
   */
  toISO(opts) {
    if (!this.isValid) return INVALID$1;
    return `${this.s.toISO(opts)}/${this.e.toISO(opts)}`;
  }
  /**
   * Returns an ISO 8601-compliant string representation of date of this Interval.
   * The time components are ignored.
   * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
   * @return {string}
   */
  toISODate() {
    if (!this.isValid) return INVALID$1;
    return `${this.s.toISODate()}/${this.e.toISODate()}`;
  }
  /**
   * Returns an ISO 8601-compliant string representation of time of this Interval.
   * The date components are ignored.
   * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
   * @param {Object} opts - The same options as {@link DateTime#toISO}
   * @return {string}
   */
  toISOTime(opts) {
    if (!this.isValid) return INVALID$1;
    return `${this.s.toISOTime(opts)}/${this.e.toISOTime(opts)}`;
  }
  /**
   * Returns a string representation of this Interval formatted according to the specified format
   * string. **You may not want this.** See {@link Interval#toLocaleString} for a more flexible
   * formatting tool.
   * @param {string} dateFormat - The format string. This string formats the start and end time.
   * See {@link DateTime#toFormat} for details.
   * @param {Object} opts - Options.
   * @param {string} [opts.separator =  ' – '] - A separator to place between the start and end
   * representations.
   * @return {string}
   */
  toFormat(dateFormat, { separator = " \u2013 " } = {}) {
    if (!this.isValid) return INVALID$1;
    return `${this.s.toFormat(dateFormat)}${separator}${this.e.toFormat(dateFormat)}`;
  }
  /**
   * Return a Duration representing the time spanned by this interval.
   * @param {string|string[]} [unit=['milliseconds']] - the unit or units (such as 'hours' or 'days') to include in the duration.
   * @param {Object} opts - options that affect the creation of the Duration
   * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
   * @example Interval.fromDateTimes(dt1, dt2).toDuration().toObject() //=> { milliseconds: 88489257 }
   * @example Interval.fromDateTimes(dt1, dt2).toDuration('days').toObject() //=> { days: 1.0241812152777778 }
   * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes']).toObject() //=> { hours: 24, minutes: 34.82095 }
   * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes', 'seconds']).toObject() //=> { hours: 24, minutes: 34, seconds: 49.257 }
   * @example Interval.fromDateTimes(dt1, dt2).toDuration('seconds').toObject() //=> { seconds: 88489.257 }
   * @return {Duration}
   */
  toDuration(unit, opts) {
    if (!this.isValid) {
      return Duration.invalid(this.invalidReason);
    }
    return this.e.diff(this.s, unit, opts);
  }
  /**
   * Run mapFn on the interval start and end, returning a new Interval from the resulting DateTimes
   * @param {function} mapFn
   * @return {Interval}
   * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.toUTC())
   * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.plus({ hours: 2 }))
   */
  mapEndpoints(mapFn) {
    return _Interval.fromDateTimes(mapFn(this.s), mapFn(this.e));
  }
};
var Info = class {
  /**
   * Return whether the specified zone contains a DST.
   * @param {string|Zone} [zone='local'] - Zone to check. Defaults to the environment's local zone.
   * @return {boolean}
   */
  static hasDST(zone = Settings.defaultZone) {
    const proto = DateTime.now().setZone(zone).set({ month: 12 });
    return !zone.isUniversal && proto.offset !== proto.set({ month: 6 }).offset;
  }
  /**
   * Return whether the specified zone is a valid IANA specifier.
   * @param {string} zone - Zone to check
   * @return {boolean}
   */
  static isValidIANAZone(zone) {
    return IANAZone.isValidZone(zone);
  }
  /**
   * Converts the input into a {@link Zone} instance.
   *
   * * If `input` is already a Zone instance, it is returned unchanged.
   * * If `input` is a string containing a valid time zone name, a Zone instance
   *   with that name is returned.
   * * If `input` is a string that doesn't refer to a known time zone, a Zone
   *   instance with {@link Zone#isValid} == false is returned.
   * * If `input is a number, a Zone instance with the specified fixed offset
   *   in minutes is returned.
   * * If `input` is `null` or `undefined`, the default zone is returned.
   * @param {string|Zone|number} [input] - the value to be converted
   * @return {Zone}
   */
  static normalizeZone(input) {
    return normalizeZone(input, Settings.defaultZone);
  }
  /**
   * Get the weekday on which the week starts according to the given locale.
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @param {string} [opts.locObj=null] - an existing locale object to use
   * @returns {number} the start of the week, 1 for Monday through 7 for Sunday
   */
  static getStartOfWeek({ locale = null, locObj = null } = {}) {
    return (locObj || Locale.create(locale)).getStartOfWeek();
  }
  /**
   * Get the minimum number of days necessary in a week before it is considered part of the next year according
   * to the given locale.
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @param {string} [opts.locObj=null] - an existing locale object to use
   * @returns {number}
   */
  static getMinimumDaysInFirstWeek({ locale = null, locObj = null } = {}) {
    return (locObj || Locale.create(locale)).getMinDaysInFirstWeek();
  }
  /**
   * Get the weekdays, which are considered the weekend according to the given locale
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @param {string} [opts.locObj=null] - an existing locale object to use
   * @returns {number[]} an array of weekdays, 1 for Monday through 7 for Sunday
   */
  static getWeekendWeekdays({ locale = null, locObj = null } = {}) {
    return (locObj || Locale.create(locale)).getWeekendDays().slice();
  }
  /**
   * Return an array of standalone month names.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
   * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @param {string} [opts.numberingSystem=null] - the numbering system
   * @param {string} [opts.locObj=null] - an existing locale object to use
   * @param {string} [opts.outputCalendar='gregory'] - the calendar
   * @example Info.months()[0] //=> 'January'
   * @example Info.months('short')[0] //=> 'Jan'
   * @example Info.months('numeric')[0] //=> '1'
   * @example Info.months('short', { locale: 'fr-CA' } )[0] //=> 'janv.'
   * @example Info.months('numeric', { locale: 'ar' })[0] //=> '١'
   * @example Info.months('long', { outputCalendar: 'islamic' })[0] //=> 'Rabiʻ I'
   * @return {Array}
   */
  static months(length = "long", { locale = null, numberingSystem = null, locObj = null, outputCalendar = "gregory" } = {}) {
    return (locObj || Locale.create(locale, numberingSystem, outputCalendar)).months(length);
  }
  /**
   * Return an array of format month names.
   * Format months differ from standalone months in that they're meant to appear next to the day of the month. In some languages, that
   * changes the string.
   * See {@link Info#months}
   * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @param {string} [opts.numberingSystem=null] - the numbering system
   * @param {string} [opts.locObj=null] - an existing locale object to use
   * @param {string} [opts.outputCalendar='gregory'] - the calendar
   * @return {Array}
   */
  static monthsFormat(length = "long", { locale = null, numberingSystem = null, locObj = null, outputCalendar = "gregory" } = {}) {
    return (locObj || Locale.create(locale, numberingSystem, outputCalendar)).months(length, true);
  }
  /**
   * Return an array of standalone week names.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
   * @param {string} [length='long'] - the length of the weekday representation, such as "narrow", "short", "long".
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @param {string} [opts.numberingSystem=null] - the numbering system
   * @param {string} [opts.locObj=null] - an existing locale object to use
   * @example Info.weekdays()[0] //=> 'Monday'
   * @example Info.weekdays('short')[0] //=> 'Mon'
   * @example Info.weekdays('short', { locale: 'fr-CA' })[0] //=> 'lun.'
   * @example Info.weekdays('short', { locale: 'ar' })[0] //=> 'الاثنين'
   * @return {Array}
   */
  static weekdays(length = "long", { locale = null, numberingSystem = null, locObj = null } = {}) {
    return (locObj || Locale.create(locale, numberingSystem, null)).weekdays(length);
  }
  /**
   * Return an array of format week names.
   * Format weekdays differ from standalone weekdays in that they're meant to appear next to more date information. In some languages, that
   * changes the string.
   * See {@link Info#weekdays}
   * @param {string} [length='long'] - the length of the month representation, such as "narrow", "short", "long".
   * @param {Object} opts - options
   * @param {string} [opts.locale=null] - the locale code
   * @param {string} [opts.numberingSystem=null] - the numbering system
   * @param {string} [opts.locObj=null] - an existing locale object to use
   * @return {Array}
   */
  static weekdaysFormat(length = "long", { locale = null, numberingSystem = null, locObj = null } = {}) {
    return (locObj || Locale.create(locale, numberingSystem, null)).weekdays(length, true);
  }
  /**
   * Return an array of meridiems.
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @example Info.meridiems() //=> [ 'AM', 'PM' ]
   * @example Info.meridiems({ locale: 'my' }) //=> [ 'နံနက်', 'ညနေ' ]
   * @return {Array}
   */
  static meridiems({ locale = null } = {}) {
    return Locale.create(locale).meridiems();
  }
  /**
   * Return an array of eras, such as ['BC', 'AD']. The locale can be specified, but the calendar system is always Gregorian.
   * @param {string} [length='short'] - the length of the era representation, such as "short" or "long".
   * @param {Object} opts - options
   * @param {string} [opts.locale] - the locale code
   * @example Info.eras() //=> [ 'BC', 'AD' ]
   * @example Info.eras('long') //=> [ 'Before Christ', 'Anno Domini' ]
   * @example Info.eras('long', { locale: 'fr' }) //=> [ 'avant Jésus-Christ', 'après Jésus-Christ' ]
   * @return {Array}
   */
  static eras(length = "short", { locale = null } = {}) {
    return Locale.create(locale, null, "gregory").eras(length);
  }
  /**
   * Return the set of available features in this environment.
   * Some features of Luxon are not available in all environments. For example, on older browsers, relative time formatting support is not available. Use this function to figure out if that's the case.
   * Keys:
   * * `relative`: whether this environment supports relative time formatting
   * * `localeWeek`: whether this environment supports different weekdays for the start of the week based on the locale
   * @example Info.features() //=> { relative: false, localeWeek: true }
   * @return {Object}
   */
  static features() {
    return { relative: hasRelative(), localeWeek: hasLocaleWeekInfo() };
  }
};
function dayDiff(earlier, later) {
  const utcDayStart = (dt) => dt.toUTC(0, { keepLocalTime: true }).startOf("day").valueOf(), ms = utcDayStart(later) - utcDayStart(earlier);
  return Math.floor(Duration.fromMillis(ms).as("days"));
}
function highOrderDiffs(cursor, later, units) {
  const differs = [
    ["years", (a, b) => b.year - a.year],
    ["quarters", (a, b) => b.quarter - a.quarter + (b.year - a.year) * 4],
    ["months", (a, b) => b.month - a.month + (b.year - a.year) * 12],
    [
      "weeks",
      (a, b) => {
        const days = dayDiff(a, b);
        return (days - days % 7) / 7;
      }
    ],
    ["days", dayDiff]
  ];
  const results = {};
  const earlier = cursor;
  let lowestOrder, highWater;
  for (const [unit, differ] of differs) {
    if (units.indexOf(unit) >= 0) {
      lowestOrder = unit;
      results[unit] = differ(cursor, later);
      highWater = earlier.plus(results);
      if (highWater > later) {
        results[unit]--;
        cursor = earlier.plus(results);
        if (cursor > later) {
          highWater = cursor;
          results[unit]--;
          cursor = earlier.plus(results);
        }
      } else {
        cursor = highWater;
      }
    }
  }
  return [cursor, results, highWater, lowestOrder];
}
function diff(earlier, later, units, opts) {
  let [cursor, results, highWater, lowestOrder] = highOrderDiffs(earlier, later, units);
  const remainingMillis = later - cursor;
  const lowerOrderUnits = units.filter(
    (u) => ["hours", "minutes", "seconds", "milliseconds"].indexOf(u) >= 0
  );
  if (lowerOrderUnits.length === 0) {
    if (highWater < later) {
      highWater = cursor.plus({ [lowestOrder]: 1 });
    }
    if (highWater !== cursor) {
      results[lowestOrder] = (results[lowestOrder] || 0) + remainingMillis / (highWater - cursor);
    }
  }
  const duration = Duration.fromObject(results, opts);
  if (lowerOrderUnits.length > 0) {
    return Duration.fromMillis(remainingMillis, opts).shiftTo(...lowerOrderUnits).plus(duration);
  } else {
    return duration;
  }
}
var MISSING_FTP = "missing Intl.DateTimeFormat.formatToParts support";
function intUnit(regex, post = (i) => i) {
  return { regex, deser: ([s2]) => post(parseDigits(s2)) };
}
var NBSP = String.fromCharCode(160);
var spaceOrNBSP = `[ ${NBSP}]`;
var spaceOrNBSPRegExp = new RegExp(spaceOrNBSP, "g");
function fixListRegex(s2) {
  return s2.replace(/\./g, "\\.?").replace(spaceOrNBSPRegExp, spaceOrNBSP);
}
function stripInsensitivities(s2) {
  return s2.replace(/\./g, "").replace(spaceOrNBSPRegExp, " ").toLowerCase();
}
function oneOf(strings, startIndex) {
  if (strings === null) {
    return null;
  } else {
    return {
      regex: RegExp(strings.map(fixListRegex).join("|")),
      deser: ([s2]) => strings.findIndex((i) => stripInsensitivities(s2) === stripInsensitivities(i)) + startIndex
    };
  }
}
function offset(regex, groups) {
  return { regex, deser: ([, h, m]) => signedOffset(h, m), groups };
}
function simple(regex) {
  return { regex, deser: ([s2]) => s2 };
}
function escapeToken(value2) {
  return value2.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
}
function unitForToken(token, loc) {
  const one = digitRegex(loc), two = digitRegex(loc, "{2}"), three = digitRegex(loc, "{3}"), four = digitRegex(loc, "{4}"), six = digitRegex(loc, "{6}"), oneOrTwo = digitRegex(loc, "{1,2}"), oneToThree = digitRegex(loc, "{1,3}"), oneToSix = digitRegex(loc, "{1,6}"), oneToNine = digitRegex(loc, "{1,9}"), twoToFour = digitRegex(loc, "{2,4}"), fourToSix = digitRegex(loc, "{4,6}"), literal = (t) => ({ regex: RegExp(escapeToken(t.val)), deser: ([s2]) => s2, literal: true }), unitate = (t) => {
    if (token.literal) {
      return literal(t);
    }
    switch (t.val) {
      // era
      case "G":
        return oneOf(loc.eras("short"), 0);
      case "GG":
        return oneOf(loc.eras("long"), 0);
      // years
      case "y":
        return intUnit(oneToSix);
      case "yy":
        return intUnit(twoToFour, untruncateYear);
      case "yyyy":
        return intUnit(four);
      case "yyyyy":
        return intUnit(fourToSix);
      case "yyyyyy":
        return intUnit(six);
      // months
      case "M":
        return intUnit(oneOrTwo);
      case "MM":
        return intUnit(two);
      case "MMM":
        return oneOf(loc.months("short", true), 1);
      case "MMMM":
        return oneOf(loc.months("long", true), 1);
      case "L":
        return intUnit(oneOrTwo);
      case "LL":
        return intUnit(two);
      case "LLL":
        return oneOf(loc.months("short", false), 1);
      case "LLLL":
        return oneOf(loc.months("long", false), 1);
      // dates
      case "d":
        return intUnit(oneOrTwo);
      case "dd":
        return intUnit(two);
      // ordinals
      case "o":
        return intUnit(oneToThree);
      case "ooo":
        return intUnit(three);
      // time
      case "HH":
        return intUnit(two);
      case "H":
        return intUnit(oneOrTwo);
      case "hh":
        return intUnit(two);
      case "h":
        return intUnit(oneOrTwo);
      case "mm":
        return intUnit(two);
      case "m":
        return intUnit(oneOrTwo);
      case "q":
        return intUnit(oneOrTwo);
      case "qq":
        return intUnit(two);
      case "s":
        return intUnit(oneOrTwo);
      case "ss":
        return intUnit(two);
      case "S":
        return intUnit(oneToThree);
      case "SSS":
        return intUnit(three);
      case "u":
        return simple(oneToNine);
      case "uu":
        return simple(oneOrTwo);
      case "uuu":
        return intUnit(one);
      // meridiem
      case "a":
        return oneOf(loc.meridiems(), 0);
      // weekYear (k)
      case "kkkk":
        return intUnit(four);
      case "kk":
        return intUnit(twoToFour, untruncateYear);
      // weekNumber (W)
      case "W":
        return intUnit(oneOrTwo);
      case "WW":
        return intUnit(two);
      // weekdays
      case "E":
      case "c":
        return intUnit(one);
      case "EEE":
        return oneOf(loc.weekdays("short", false), 1);
      case "EEEE":
        return oneOf(loc.weekdays("long", false), 1);
      case "ccc":
        return oneOf(loc.weekdays("short", true), 1);
      case "cccc":
        return oneOf(loc.weekdays("long", true), 1);
      // offset/zone
      case "Z":
      case "ZZ":
        return offset(new RegExp(`([+-]${oneOrTwo.source})(?::(${two.source}))?`), 2);
      case "ZZZ":
        return offset(new RegExp(`([+-]${oneOrTwo.source})(${two.source})?`), 2);
      // we don't support ZZZZ (PST) or ZZZZZ (Pacific Standard Time) in parsing
      // because we don't have any way to figure out what they are
      case "z":
        return simple(/[a-z_+-/]{1,256}?/i);
      // this special-case "token" represents a place where a macro-token expanded into a white-space literal
      // in this case we accept any non-newline white-space
      case " ":
        return simple(/[^\S\n\r]/);
      default:
        return literal(t);
    }
  };
  const unit = unitate(token) || {
    invalidReason: MISSING_FTP
  };
  unit.token = token;
  return unit;
}
var partTypeStyleToTokenVal = {
  year: {
    "2-digit": "yy",
    numeric: "yyyyy"
  },
  month: {
    numeric: "M",
    "2-digit": "MM",
    short: "MMM",
    long: "MMMM"
  },
  day: {
    numeric: "d",
    "2-digit": "dd"
  },
  weekday: {
    short: "EEE",
    long: "EEEE"
  },
  dayperiod: "a",
  dayPeriod: "a",
  hour12: {
    numeric: "h",
    "2-digit": "hh"
  },
  hour24: {
    numeric: "H",
    "2-digit": "HH"
  },
  minute: {
    numeric: "m",
    "2-digit": "mm"
  },
  second: {
    numeric: "s",
    "2-digit": "ss"
  },
  timeZoneName: {
    long: "ZZZZZ",
    short: "ZZZ"
  }
};
function tokenForPart(part, formatOpts, resolvedOpts) {
  const { type, value: value2 } = part;
  if (type === "literal") {
    const isSpace = /^\s+$/.test(value2);
    return {
      literal: !isSpace,
      val: isSpace ? " " : value2
    };
  }
  const style = formatOpts[type];
  let actualType = type;
  if (type === "hour") {
    if (formatOpts.hour12 != null) {
      actualType = formatOpts.hour12 ? "hour12" : "hour24";
    } else if (formatOpts.hourCycle != null) {
      if (formatOpts.hourCycle === "h11" || formatOpts.hourCycle === "h12") {
        actualType = "hour12";
      } else {
        actualType = "hour24";
      }
    } else {
      actualType = resolvedOpts.hour12 ? "hour12" : "hour24";
    }
  }
  let val = partTypeStyleToTokenVal[actualType];
  if (typeof val === "object") {
    val = val[style];
  }
  if (val) {
    return {
      literal: false,
      val
    };
  }
  return void 0;
}
function buildRegex(units) {
  const re = units.map((u) => u.regex).reduce((f, r) => `${f}(${r.source})`, "");
  return [`^${re}$`, units];
}
function match(input, regex, handlers) {
  const matches = input.match(regex);
  if (matches) {
    const all = {};
    let matchIndex = 1;
    for (const i in handlers) {
      if (hasOwnProperty(handlers, i)) {
        const h = handlers[i], groups = h.groups ? h.groups + 1 : 1;
        if (!h.literal && h.token) {
          all[h.token.val[0]] = h.deser(matches.slice(matchIndex, matchIndex + groups));
        }
        matchIndex += groups;
      }
    }
    return [matches, all];
  } else {
    return [matches, {}];
  }
}
function dateTimeFromMatches(matches) {
  const toField = (token) => {
    switch (token) {
      case "S":
        return "millisecond";
      case "s":
        return "second";
      case "m":
        return "minute";
      case "h":
      case "H":
        return "hour";
      case "d":
        return "day";
      case "o":
        return "ordinal";
      case "L":
      case "M":
        return "month";
      case "y":
        return "year";
      case "E":
      case "c":
        return "weekday";
      case "W":
        return "weekNumber";
      case "k":
        return "weekYear";
      case "q":
        return "quarter";
      default:
        return null;
    }
  };
  let zone = null;
  let specificOffset;
  if (!isUndefined(matches.z)) {
    zone = IANAZone.create(matches.z);
  }
  if (!isUndefined(matches.Z)) {
    if (!zone) {
      zone = new FixedOffsetZone(matches.Z);
    }
    specificOffset = matches.Z;
  }
  if (!isUndefined(matches.q)) {
    matches.M = (matches.q - 1) * 3 + 1;
  }
  if (!isUndefined(matches.h)) {
    if (matches.h < 12 && matches.a === 1) {
      matches.h += 12;
    } else if (matches.h === 12 && matches.a === 0) {
      matches.h = 0;
    }
  }
  if (matches.G === 0 && matches.y) {
    matches.y = -matches.y;
  }
  if (!isUndefined(matches.u)) {
    matches.S = parseMillis(matches.u);
  }
  const vals = Object.keys(matches).reduce((r, k) => {
    const f = toField(k);
    if (f) {
      r[f] = matches[k];
    }
    return r;
  }, {});
  return [vals, zone, specificOffset];
}
var dummyDateTimeCache = null;
function getDummyDateTime() {
  if (!dummyDateTimeCache) {
    dummyDateTimeCache = DateTime.fromMillis(1555555555555);
  }
  return dummyDateTimeCache;
}
function maybeExpandMacroToken(token, locale) {
  if (token.literal) {
    return token;
  }
  const formatOpts = Formatter.macroTokenToFormatOpts(token.val);
  const tokens = formatOptsToTokens(formatOpts, locale);
  if (tokens == null || tokens.includes(void 0)) {
    return token;
  }
  return tokens;
}
function expandMacroTokens(tokens, locale) {
  return Array.prototype.concat(...tokens.map((t) => maybeExpandMacroToken(t, locale)));
}
var TokenParser = class {
  constructor(locale, format) {
    this.locale = locale;
    this.format = format;
    this.tokens = expandMacroTokens(Formatter.parseFormat(format), locale);
    this.units = this.tokens.map((t) => unitForToken(t, locale));
    this.disqualifyingUnit = this.units.find((t) => t.invalidReason);
    if (!this.disqualifyingUnit) {
      const [regexString, handlers] = buildRegex(this.units);
      this.regex = RegExp(regexString, "i");
      this.handlers = handlers;
    }
  }
  explainFromTokens(input) {
    if (!this.isValid) {
      return { input, tokens: this.tokens, invalidReason: this.invalidReason };
    } else {
      const [rawMatches, matches] = match(input, this.regex, this.handlers), [result, zone, specificOffset] = matches ? dateTimeFromMatches(matches) : [null, null, void 0];
      if (hasOwnProperty(matches, "a") && hasOwnProperty(matches, "H")) {
        throw new ConflictingSpecificationError(
          "Can't include meridiem when specifying 24-hour format"
        );
      }
      return {
        input,
        tokens: this.tokens,
        regex: this.regex,
        rawMatches,
        matches,
        result,
        zone,
        specificOffset
      };
    }
  }
  get isValid() {
    return !this.disqualifyingUnit;
  }
  get invalidReason() {
    return this.disqualifyingUnit ? this.disqualifyingUnit.invalidReason : null;
  }
};
function explainFromTokens(locale, input, format) {
  const parser = new TokenParser(locale, format);
  return parser.explainFromTokens(input);
}
function parseFromTokens(locale, input, format) {
  const { result, zone, specificOffset, invalidReason } = explainFromTokens(locale, input, format);
  return [result, zone, specificOffset, invalidReason];
}
function formatOptsToTokens(formatOpts, locale) {
  if (!formatOpts) {
    return null;
  }
  const formatter = Formatter.create(locale, formatOpts);
  const df = formatter.dtFormatter(getDummyDateTime());
  const parts = df.formatToParts();
  const resolvedOpts = df.resolvedOptions();
  return parts.map((p) => tokenForPart(p, formatOpts, resolvedOpts));
}
var INVALID = "Invalid DateTime";
var MAX_DATE = 864e13;
function unsupportedZone(zone) {
  return new Invalid("unsupported zone", `the zone "${zone.name}" is not supported`);
}
function possiblyCachedWeekData(dt) {
  if (dt.weekData === null) {
    dt.weekData = gregorianToWeek(dt.c);
  }
  return dt.weekData;
}
function possiblyCachedLocalWeekData(dt) {
  if (dt.localWeekData === null) {
    dt.localWeekData = gregorianToWeek(
      dt.c,
      dt.loc.getMinDaysInFirstWeek(),
      dt.loc.getStartOfWeek()
    );
  }
  return dt.localWeekData;
}
function clone(inst, alts) {
  const current = {
    ts: inst.ts,
    zone: inst.zone,
    c: inst.c,
    o: inst.o,
    loc: inst.loc,
    invalid: inst.invalid
  };
  return new DateTime({ ...current, ...alts, old: current });
}
function fixOffset(localTS, o, tz) {
  let utcGuess = localTS - o * 60 * 1e3;
  const o2 = tz.offset(utcGuess);
  if (o === o2) {
    return [utcGuess, o];
  }
  utcGuess -= (o2 - o) * 60 * 1e3;
  const o3 = tz.offset(utcGuess);
  if (o2 === o3) {
    return [utcGuess, o2];
  }
  return [localTS - Math.min(o2, o3) * 60 * 1e3, Math.max(o2, o3)];
}
function tsToObj(ts, offset2) {
  ts += offset2 * 60 * 1e3;
  const d = new Date(ts);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds()
  };
}
function objToTS(obj, offset2, zone) {
  return fixOffset(objToLocalTS(obj), offset2, zone);
}
function adjustTime(inst, dur) {
  const oPre = inst.o, year = inst.c.year + Math.trunc(dur.years), month = inst.c.month + Math.trunc(dur.months) + Math.trunc(dur.quarters) * 3, c = {
    ...inst.c,
    year,
    month,
    day: Math.min(inst.c.day, daysInMonth(year, month)) + Math.trunc(dur.days) + Math.trunc(dur.weeks) * 7
  }, millisToAdd = Duration.fromObject({
    years: dur.years - Math.trunc(dur.years),
    quarters: dur.quarters - Math.trunc(dur.quarters),
    months: dur.months - Math.trunc(dur.months),
    weeks: dur.weeks - Math.trunc(dur.weeks),
    days: dur.days - Math.trunc(dur.days),
    hours: dur.hours,
    minutes: dur.minutes,
    seconds: dur.seconds,
    milliseconds: dur.milliseconds
  }).as("milliseconds"), localTS = objToLocalTS(c);
  let [ts, o] = fixOffset(localTS, oPre, inst.zone);
  if (millisToAdd !== 0) {
    ts += millisToAdd;
    o = inst.zone.offset(ts);
  }
  return { ts, o };
}
function parseDataToDateTime(parsed, parsedZone, opts, format, text, specificOffset) {
  const { setZone, zone } = opts;
  if (parsed && Object.keys(parsed).length !== 0 || parsedZone) {
    const interpretationZone = parsedZone || zone, inst = DateTime.fromObject(parsed, {
      ...opts,
      zone: interpretationZone,
      specificOffset
    });
    return setZone ? inst : inst.setZone(zone);
  } else {
    return DateTime.invalid(
      new Invalid("unparsable", `the input "${text}" can't be parsed as ${format}`)
    );
  }
}
function toTechFormat(dt, format, allowZ = true) {
  return dt.isValid ? Formatter.create(Locale.create("en-US"), {
    allowZ,
    forceSimple: true
  }).formatDateTimeFromString(dt, format) : null;
}
function toISODate(o, extended, precision) {
  const longFormat = o.c.year > 9999 || o.c.year < 0;
  let c = "";
  if (longFormat && o.c.year >= 0) c += "+";
  c += padStart(o.c.year, longFormat ? 6 : 4);
  if (precision === "year") return c;
  if (extended) {
    c += "-";
    c += padStart(o.c.month);
    if (precision === "month") return c;
    c += "-";
  } else {
    c += padStart(o.c.month);
    if (precision === "month") return c;
  }
  c += padStart(o.c.day);
  return c;
}
function toISOTime(o, extended, suppressSeconds, suppressMilliseconds, includeOffset, extendedZone, precision) {
  let showSeconds = !suppressSeconds || o.c.millisecond !== 0 || o.c.second !== 0, c = "";
  switch (precision) {
    case "day":
    case "month":
    case "year":
      break;
    default:
      c += padStart(o.c.hour);
      if (precision === "hour") break;
      if (extended) {
        c += ":";
        c += padStart(o.c.minute);
        if (precision === "minute") break;
        if (showSeconds) {
          c += ":";
          c += padStart(o.c.second);
        }
      } else {
        c += padStart(o.c.minute);
        if (precision === "minute") break;
        if (showSeconds) {
          c += padStart(o.c.second);
        }
      }
      if (precision === "second") break;
      if (showSeconds && (!suppressMilliseconds || o.c.millisecond !== 0)) {
        c += ".";
        c += padStart(o.c.millisecond, 3);
      }
  }
  if (includeOffset) {
    if (o.isOffsetFixed && o.offset === 0 && !extendedZone) {
      c += "Z";
    } else if (o.o < 0) {
      c += "-";
      c += padStart(Math.trunc(-o.o / 60));
      c += ":";
      c += padStart(Math.trunc(-o.o % 60));
    } else {
      c += "+";
      c += padStart(Math.trunc(o.o / 60));
      c += ":";
      c += padStart(Math.trunc(o.o % 60));
    }
  }
  if (extendedZone) {
    c += "[" + o.zone.ianaName + "]";
  }
  return c;
}
var defaultUnitValues = {
  month: 1,
  day: 1,
  hour: 0,
  minute: 0,
  second: 0,
  millisecond: 0
};
var defaultWeekUnitValues = {
  weekNumber: 1,
  weekday: 1,
  hour: 0,
  minute: 0,
  second: 0,
  millisecond: 0
};
var defaultOrdinalUnitValues = {
  ordinal: 1,
  hour: 0,
  minute: 0,
  second: 0,
  millisecond: 0
};
var orderedUnits = ["year", "month", "day", "hour", "minute", "second", "millisecond"];
var orderedWeekUnits = [
  "weekYear",
  "weekNumber",
  "weekday",
  "hour",
  "minute",
  "second",
  "millisecond"
];
var orderedOrdinalUnits = ["year", "ordinal", "hour", "minute", "second", "millisecond"];
function normalizeUnit(unit) {
  const normalized = {
    year: "year",
    years: "year",
    month: "month",
    months: "month",
    day: "day",
    days: "day",
    hour: "hour",
    hours: "hour",
    minute: "minute",
    minutes: "minute",
    quarter: "quarter",
    quarters: "quarter",
    second: "second",
    seconds: "second",
    millisecond: "millisecond",
    milliseconds: "millisecond",
    weekday: "weekday",
    weekdays: "weekday",
    weeknumber: "weekNumber",
    weeksnumber: "weekNumber",
    weeknumbers: "weekNumber",
    weekyear: "weekYear",
    weekyears: "weekYear",
    ordinal: "ordinal"
  }[unit.toLowerCase()];
  if (!normalized) throw new InvalidUnitError(unit);
  return normalized;
}
function normalizeUnitWithLocalWeeks(unit) {
  switch (unit.toLowerCase()) {
    case "localweekday":
    case "localweekdays":
      return "localWeekday";
    case "localweeknumber":
    case "localweeknumbers":
      return "localWeekNumber";
    case "localweekyear":
    case "localweekyears":
      return "localWeekYear";
    default:
      return normalizeUnit(unit);
  }
}
function guessOffsetForZone(zone) {
  if (zoneOffsetTs === void 0) {
    zoneOffsetTs = Settings.now();
  }
  if (zone.type !== "iana") {
    return zone.offset(zoneOffsetTs);
  }
  const zoneName = zone.name;
  let offsetGuess = zoneOffsetGuessCache.get(zoneName);
  if (offsetGuess === void 0) {
    offsetGuess = zone.offset(zoneOffsetTs);
    zoneOffsetGuessCache.set(zoneName, offsetGuess);
  }
  return offsetGuess;
}
function quickDT(obj, opts) {
  const zone = normalizeZone(opts.zone, Settings.defaultZone);
  if (!zone.isValid) {
    return DateTime.invalid(unsupportedZone(zone));
  }
  const loc = Locale.fromObject(opts);
  let ts, o;
  if (!isUndefined(obj.year)) {
    for (const u of orderedUnits) {
      if (isUndefined(obj[u])) {
        obj[u] = defaultUnitValues[u];
      }
    }
    const invalid = hasInvalidGregorianData(obj) || hasInvalidTimeData(obj);
    if (invalid) {
      return DateTime.invalid(invalid);
    }
    const offsetProvis = guessOffsetForZone(zone);
    [ts, o] = objToTS(obj, offsetProvis, zone);
  } else {
    ts = Settings.now();
  }
  return new DateTime({ ts, zone, loc, o });
}
function diffRelative(start, end, opts) {
  const round = isUndefined(opts.round) ? true : opts.round, rounding = isUndefined(opts.rounding) ? "trunc" : opts.rounding, format = (c, unit) => {
    c = roundTo(c, round || opts.calendary ? 0 : 2, opts.calendary ? "round" : rounding);
    const formatter = end.loc.clone(opts).relFormatter(opts);
    return formatter.format(c, unit);
  }, differ = (unit) => {
    if (opts.calendary) {
      if (!end.hasSame(start, unit)) {
        return end.startOf(unit).diff(start.startOf(unit), unit).get(unit);
      } else return 0;
    } else {
      return end.diff(start, unit).get(unit);
    }
  };
  if (opts.unit) {
    return format(differ(opts.unit), opts.unit);
  }
  for (const unit of opts.units) {
    const count = differ(unit);
    if (Math.abs(count) >= 1) {
      return format(count, unit);
    }
  }
  return format(start > end ? -0 : 0, opts.units[opts.units.length - 1]);
}
function lastOpts(argList) {
  let opts = {}, args;
  if (argList.length > 0 && typeof argList[argList.length - 1] === "object") {
    opts = argList[argList.length - 1];
    args = Array.from(argList).slice(0, argList.length - 1);
  } else {
    args = Array.from(argList);
  }
  return [opts, args];
}
var zoneOffsetTs;
var zoneOffsetGuessCache = /* @__PURE__ */ new Map();
var DateTime = class _DateTime {
  /**
   * @access private
   */
  constructor(config) {
    const zone = config.zone || Settings.defaultZone;
    let invalid = config.invalid || (Number.isNaN(config.ts) ? new Invalid("invalid input") : null) || (!zone.isValid ? unsupportedZone(zone) : null);
    this.ts = isUndefined(config.ts) ? Settings.now() : config.ts;
    let c = null, o = null;
    if (!invalid) {
      const unchanged = config.old && config.old.ts === this.ts && config.old.zone.equals(zone);
      if (unchanged) {
        [c, o] = [config.old.c, config.old.o];
      } else {
        const ot = isNumber(config.o) && !config.old ? config.o : zone.offset(this.ts);
        c = tsToObj(this.ts, ot);
        invalid = Number.isNaN(c.year) ? new Invalid("invalid input") : null;
        c = invalid ? null : c;
        o = invalid ? null : ot;
      }
    }
    this._zone = zone;
    this.loc = config.loc || Locale.create();
    this.invalid = invalid;
    this.weekData = null;
    this.localWeekData = null;
    this.c = c;
    this.o = o;
    this.isLuxonDateTime = true;
  }
  // CONSTRUCT
  /**
   * Create a DateTime for the current instant, in the system's time zone.
   *
   * Use Settings to override these default values if needed.
   * @example DateTime.now().toISO() //~> now in the ISO format
   * @return {DateTime}
   */
  static now() {
    return new _DateTime({});
  }
  /**
   * Create a local DateTime
   * @param {number} [year] - The calendar year. If omitted (as in, call `local()` with no arguments), the current time will be used
   * @param {number} [month=1] - The month, 1-indexed
   * @param {number} [day=1] - The day of the month, 1-indexed
   * @param {number} [hour=0] - The hour of the day, in 24-hour time
   * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
   * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
   * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
   * @example DateTime.local()                                  //~> now
   * @example DateTime.local({ zone: "America/New_York" })      //~> now, in US east coast time
   * @example DateTime.local(2017)                              //~> 2017-01-01T00:00:00
   * @example DateTime.local(2017, 3)                           //~> 2017-03-01T00:00:00
   * @example DateTime.local(2017, 3, 12, { locale: "fr" })     //~> 2017-03-12T00:00:00, with a French locale
   * @example DateTime.local(2017, 3, 12, 5)                    //~> 2017-03-12T05:00:00
   * @example DateTime.local(2017, 3, 12, 5, { zone: "utc" })   //~> 2017-03-12T05:00:00, in UTC
   * @example DateTime.local(2017, 3, 12, 5, 45)                //~> 2017-03-12T05:45:00
   * @example DateTime.local(2017, 3, 12, 5, 45, 10)            //~> 2017-03-12T05:45:10
   * @example DateTime.local(2017, 3, 12, 5, 45, 10, 765)       //~> 2017-03-12T05:45:10.765
   * @return {DateTime}
   */
  static local() {
    const [opts, args] = lastOpts(arguments), [year, month, day, hour, minute, second, millisecond] = args;
    return quickDT({ year, month, day, hour, minute, second, millisecond }, opts);
  }
  /**
   * Create a DateTime in UTC
   * @param {number} [year] - The calendar year. If omitted (as in, call `utc()` with no arguments), the current time will be used
   * @param {number} [month=1] - The month, 1-indexed
   * @param {number} [day=1] - The day of the month
   * @param {number} [hour=0] - The hour of the day, in 24-hour time
   * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
   * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
   * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
   * @param {Object} options - configuration options for the DateTime
   * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
   * @param {string} [options.outputCalendar] - the output calendar to set on the resulting DateTime instance
   * @param {string} [options.numberingSystem] - the numbering system to set on the resulting DateTime instance
   * @param {string} [options.weekSettings] - the week settings to set on the resulting DateTime instance
   * @example DateTime.utc()                                              //~> now
   * @example DateTime.utc(2017)                                          //~> 2017-01-01T00:00:00Z
   * @example DateTime.utc(2017, 3)                                       //~> 2017-03-01T00:00:00Z
   * @example DateTime.utc(2017, 3, 12)                                   //~> 2017-03-12T00:00:00Z
   * @example DateTime.utc(2017, 3, 12, 5)                                //~> 2017-03-12T05:00:00Z
   * @example DateTime.utc(2017, 3, 12, 5, 45)                            //~> 2017-03-12T05:45:00Z
   * @example DateTime.utc(2017, 3, 12, 5, 45, { locale: "fr" })          //~> 2017-03-12T05:45:00Z with a French locale
   * @example DateTime.utc(2017, 3, 12, 5, 45, 10)                        //~> 2017-03-12T05:45:10Z
   * @example DateTime.utc(2017, 3, 12, 5, 45, 10, 765, { locale: "fr" }) //~> 2017-03-12T05:45:10.765Z with a French locale
   * @return {DateTime}
   */
  static utc() {
    const [opts, args] = lastOpts(arguments), [year, month, day, hour, minute, second, millisecond] = args;
    opts.zone = FixedOffsetZone.utcInstance;
    return quickDT({ year, month, day, hour, minute, second, millisecond }, opts);
  }
  /**
   * Create a DateTime from a JavaScript Date object. Uses the default zone.
   * @param {Date} date - a JavaScript Date object
   * @param {Object} options - configuration options for the DateTime
   * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
   * @return {DateTime}
   */
  static fromJSDate(date, options = {}) {
    const ts = isDate(date) ? date.valueOf() : NaN;
    if (Number.isNaN(ts)) {
      return _DateTime.invalid("invalid input");
    }
    const zoneToUse = normalizeZone(options.zone, Settings.defaultZone);
    if (!zoneToUse.isValid) {
      return _DateTime.invalid(unsupportedZone(zoneToUse));
    }
    return new _DateTime({
      ts,
      zone: zoneToUse,
      loc: Locale.fromObject(options)
    });
  }
  /**
   * Create a DateTime from a number of milliseconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
   * @param {number} milliseconds - a number of milliseconds since 1970 UTC
   * @param {Object} options - configuration options for the DateTime
   * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
   * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
   * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
   * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
   * @param {string} options.weekSettings - the week settings to set on the resulting DateTime instance
   * @return {DateTime}
   */
  static fromMillis(milliseconds, options = {}) {
    if (!isNumber(milliseconds)) {
      throw new InvalidArgumentError(
        `fromMillis requires a numerical input, but received a ${typeof milliseconds} with value ${milliseconds}`
      );
    } else if (milliseconds < -MAX_DATE || milliseconds > MAX_DATE) {
      return _DateTime.invalid("Timestamp out of range");
    } else {
      return new _DateTime({
        ts: milliseconds,
        zone: normalizeZone(options.zone, Settings.defaultZone),
        loc: Locale.fromObject(options)
      });
    }
  }
  /**
   * Create a DateTime from a number of seconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
   * @param {number} seconds - a number of seconds since 1970 UTC
   * @param {Object} options - configuration options for the DateTime
   * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
   * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
   * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
   * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
   * @param {string} options.weekSettings - the week settings to set on the resulting DateTime instance
   * @return {DateTime}
   */
  static fromSeconds(seconds, options = {}) {
    if (!isNumber(seconds)) {
      throw new InvalidArgumentError("fromSeconds requires a numerical input");
    } else {
      return new _DateTime({
        ts: seconds * 1e3,
        zone: normalizeZone(options.zone, Settings.defaultZone),
        loc: Locale.fromObject(options)
      });
    }
  }
  /**
   * Create a DateTime from a JavaScript object with keys like 'year' and 'hour' with reasonable defaults.
   * @param {Object} obj - the object to create the DateTime from
   * @param {number} obj.year - a year, such as 1987
   * @param {number} obj.month - a month, 1-12
   * @param {number} obj.day - a day of the month, 1-31, depending on the month
   * @param {number} obj.ordinal - day of the year, 1-365 or 366
   * @param {number} obj.weekYear - an ISO week year
   * @param {number} obj.weekNumber - an ISO week number, between 1 and 52 or 53, depending on the year
   * @param {number} obj.weekday - an ISO weekday, 1-7, where 1 is Monday and 7 is Sunday
   * @param {number} obj.localWeekYear - a week year, according to the locale
   * @param {number} obj.localWeekNumber - a week number, between 1 and 52 or 53, depending on the year, according to the locale
   * @param {number} obj.localWeekday - a weekday, 1-7, where 1 is the first and 7 is the last day of the week, according to the locale
   * @param {number} obj.hour - hour of the day, 0-23
   * @param {number} obj.minute - minute of the hour, 0-59
   * @param {number} obj.second - second of the minute, 0-59
   * @param {number} obj.millisecond - millisecond of the second, 0-999
   * @param {Object} opts - options for creating this DateTime
   * @param {string|Zone} [opts.zone='local'] - interpret the numbers in the context of a particular zone. Can take any value taken as the first argument to setZone()
   * @param {string} [opts.locale='system\'s locale'] - a locale to set on the resulting DateTime instance
   * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
   * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
   * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
   * @example DateTime.fromObject({ year: 1982, month: 5, day: 25}).toISODate() //=> '1982-05-25'
   * @example DateTime.fromObject({ year: 1982 }).toISODate() //=> '1982-01-01'
   * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }) //~> today at 10:26:06
   * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'utc' }),
   * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'local' })
   * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'America/New_York' })
   * @example DateTime.fromObject({ weekYear: 2016, weekNumber: 2, weekday: 3 }).toISODate() //=> '2016-01-13'
   * @example DateTime.fromObject({ localWeekYear: 2022, localWeekNumber: 1, localWeekday: 1 }, { locale: "en-US" }).toISODate() //=> '2021-12-26'
   * @return {DateTime}
   */
  static fromObject(obj, opts = {}) {
    obj = obj || {};
    const zoneToUse = normalizeZone(opts.zone, Settings.defaultZone);
    if (!zoneToUse.isValid) {
      return _DateTime.invalid(unsupportedZone(zoneToUse));
    }
    const loc = Locale.fromObject(opts);
    const normalized = normalizeObject(obj, normalizeUnitWithLocalWeeks);
    const { minDaysInFirstWeek, startOfWeek } = usesLocalWeekValues(normalized, loc);
    const tsNow = Settings.now(), offsetProvis = !isUndefined(opts.specificOffset) ? opts.specificOffset : zoneToUse.offset(tsNow), containsOrdinal = !isUndefined(normalized.ordinal), containsGregorYear = !isUndefined(normalized.year), containsGregorMD = !isUndefined(normalized.month) || !isUndefined(normalized.day), containsGregor = containsGregorYear || containsGregorMD, definiteWeekDef = normalized.weekYear || normalized.weekNumber;
    if ((containsGregor || containsOrdinal) && definiteWeekDef) {
      throw new ConflictingSpecificationError(
        "Can't mix weekYear/weekNumber units with year/month/day or ordinals"
      );
    }
    if (containsGregorMD && containsOrdinal) {
      throw new ConflictingSpecificationError("Can't mix ordinal dates with month/day");
    }
    const useWeekData = definiteWeekDef || normalized.weekday && !containsGregor;
    let units, defaultValues, objNow = tsToObj(tsNow, offsetProvis);
    if (useWeekData) {
      units = orderedWeekUnits;
      defaultValues = defaultWeekUnitValues;
      objNow = gregorianToWeek(objNow, minDaysInFirstWeek, startOfWeek);
    } else if (containsOrdinal) {
      units = orderedOrdinalUnits;
      defaultValues = defaultOrdinalUnitValues;
      objNow = gregorianToOrdinal(objNow);
    } else {
      units = orderedUnits;
      defaultValues = defaultUnitValues;
    }
    let foundFirst = false;
    for (const u of units) {
      const v = normalized[u];
      if (!isUndefined(v)) {
        foundFirst = true;
      } else if (foundFirst) {
        normalized[u] = defaultValues[u];
      } else {
        normalized[u] = objNow[u];
      }
    }
    const higherOrderInvalid = useWeekData ? hasInvalidWeekData(normalized, minDaysInFirstWeek, startOfWeek) : containsOrdinal ? hasInvalidOrdinalData(normalized) : hasInvalidGregorianData(normalized), invalid = higherOrderInvalid || hasInvalidTimeData(normalized);
    if (invalid) {
      return _DateTime.invalid(invalid);
    }
    const gregorian = useWeekData ? weekToGregorian(normalized, minDaysInFirstWeek, startOfWeek) : containsOrdinal ? ordinalToGregorian(normalized) : normalized, [tsFinal, offsetFinal] = objToTS(gregorian, offsetProvis, zoneToUse), inst = new _DateTime({
      ts: tsFinal,
      zone: zoneToUse,
      o: offsetFinal,
      loc
    });
    if (normalized.weekday && containsGregor && obj.weekday !== inst.weekday) {
      return _DateTime.invalid(
        "mismatched weekday",
        `you can't specify both a weekday of ${normalized.weekday} and a date of ${inst.toISO()}`
      );
    }
    if (!inst.isValid) {
      return _DateTime.invalid(inst.invalid);
    }
    return inst;
  }
  /**
   * Create a DateTime from an ISO 8601 string
   * @param {string} text - the ISO string
   * @param {Object} opts - options to affect the creation
   * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the time to this zone
   * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
   * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
   * @param {string} [opts.outputCalendar] - the output calendar to set on the resulting DateTime instance
   * @param {string} [opts.numberingSystem] - the numbering system to set on the resulting DateTime instance
   * @param {string} [opts.weekSettings] - the week settings to set on the resulting DateTime instance
   * @example DateTime.fromISO('2016-05-25T09:08:34.123')
   * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00')
   * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00', {setZone: true})
   * @example DateTime.fromISO('2016-05-25T09:08:34.123', {zone: 'utc'})
   * @example DateTime.fromISO('2016-W05-4')
   * @return {DateTime}
   */
  static fromISO(text, opts = {}) {
    const [vals, parsedZone] = parseISODate(text);
    return parseDataToDateTime(vals, parsedZone, opts, "ISO 8601", text);
  }
  /**
   * Create a DateTime from an RFC 2822 string
   * @param {string} text - the RFC 2822 string
   * @param {Object} opts - options to affect the creation
   * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since the offset is always specified in the string itself, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
   * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
   * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
   * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
   * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
   * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
   * @example DateTime.fromRFC2822('25 Nov 2016 13:23:12 GMT')
   * @example DateTime.fromRFC2822('Fri, 25 Nov 2016 13:23:12 +0600')
   * @example DateTime.fromRFC2822('25 Nov 2016 13:23 Z')
   * @return {DateTime}
   */
  static fromRFC2822(text, opts = {}) {
    const [vals, parsedZone] = parseRFC2822Date(text);
    return parseDataToDateTime(vals, parsedZone, opts, "RFC 2822", text);
  }
  /**
   * Create a DateTime from an HTTP header date
   * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
   * @param {string} text - the HTTP header date
   * @param {Object} opts - options to affect the creation
   * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since HTTP dates are always in UTC, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
   * @param {boolean} [opts.setZone=false] - override the zone with the fixed-offset zone specified in the string. For HTTP dates, this is always UTC, so this option is equivalent to setting the `zone` option to 'utc', but this option is included for consistency with similar methods.
   * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
   * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
   * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
   * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
   * @example DateTime.fromHTTP('Sun, 06 Nov 1994 08:49:37 GMT')
   * @example DateTime.fromHTTP('Sunday, 06-Nov-94 08:49:37 GMT')
   * @example DateTime.fromHTTP('Sun Nov  6 08:49:37 1994')
   * @return {DateTime}
   */
  static fromHTTP(text, opts = {}) {
    const [vals, parsedZone] = parseHTTPDate(text);
    return parseDataToDateTime(vals, parsedZone, opts, "HTTP", opts);
  }
  /**
   * Create a DateTime from an input string and format string.
   * Defaults to en-US if no locale has been specified, regardless of the system's locale. For a table of tokens and their interpretations, see [here](https://moment.github.io/luxon/#/parsing?id=table-of-tokens).
   * @param {string} text - the string to parse
   * @param {string} fmt - the format the string is expected to be in (see the link below for the formats)
   * @param {Object} opts - options to affect the creation
   * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
   * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
   * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
   * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
   * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
   * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
   * @return {DateTime}
   */
  static fromFormat(text, fmt, opts = {}) {
    if (isUndefined(text) || isUndefined(fmt)) {
      throw new InvalidArgumentError("fromFormat requires an input string and a format");
    }
    const { locale = null, numberingSystem = null } = opts, localeToUse = Locale.fromOpts({
      locale,
      numberingSystem,
      defaultToEN: true
    }), [vals, parsedZone, specificOffset, invalid] = parseFromTokens(localeToUse, text, fmt);
    if (invalid) {
      return _DateTime.invalid(invalid);
    } else {
      return parseDataToDateTime(vals, parsedZone, opts, `format ${fmt}`, text, specificOffset);
    }
  }
  /**
   * @deprecated use fromFormat instead
   */
  static fromString(text, fmt, opts = {}) {
    return _DateTime.fromFormat(text, fmt, opts);
  }
  /**
   * Create a DateTime from a SQL date, time, or datetime
   * Defaults to en-US if no locale has been specified, regardless of the system's locale
   * @param {string} text - the string to parse
   * @param {Object} opts - options to affect the creation
   * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
   * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
   * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
   * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
   * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
   * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
   * @example DateTime.fromSQL('2017-05-15')
   * @example DateTime.fromSQL('2017-05-15 09:12:34')
   * @example DateTime.fromSQL('2017-05-15 09:12:34.342')
   * @example DateTime.fromSQL('2017-05-15 09:12:34.342+06:00')
   * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles')
   * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles', { setZone: true })
   * @example DateTime.fromSQL('2017-05-15 09:12:34.342', { zone: 'America/Los_Angeles' })
   * @example DateTime.fromSQL('09:12:34.342')
   * @return {DateTime}
   */
  static fromSQL(text, opts = {}) {
    const [vals, parsedZone] = parseSQL(text);
    return parseDataToDateTime(vals, parsedZone, opts, "SQL", text);
  }
  /**
   * Create an invalid DateTime.
   * @param {string} reason - simple string of why this DateTime is invalid. Should not contain parameters or anything else data-dependent.
   * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
   * @return {DateTime}
   */
  static invalid(reason, explanation = null) {
    if (!reason) {
      throw new InvalidArgumentError("need to specify a reason the DateTime is invalid");
    }
    const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
    if (Settings.throwOnInvalid) {
      throw new InvalidDateTimeError(invalid);
    } else {
      return new _DateTime({ invalid });
    }
  }
  /**
   * Check if an object is an instance of DateTime. Works across context boundaries
   * @param {object} o
   * @return {boolean}
   */
  static isDateTime(o) {
    return o && o.isLuxonDateTime || false;
  }
  /**
   * Produce the format string for a set of options
   * @param formatOpts
   * @param localeOpts
   * @returns {string}
   */
  static parseFormatForOpts(formatOpts, localeOpts = {}) {
    const tokenList = formatOptsToTokens(formatOpts, Locale.fromObject(localeOpts));
    return !tokenList ? null : tokenList.map((t) => t ? t.val : null).join("");
  }
  /**
   * Produce the the fully expanded format token for the locale
   * Does NOT quote characters, so quoted tokens will not round trip correctly
   * @param fmt
   * @param localeOpts
   * @returns {string}
   */
  static expandFormat(fmt, localeOpts = {}) {
    const expanded = expandMacroTokens(Formatter.parseFormat(fmt), Locale.fromObject(localeOpts));
    return expanded.map((t) => t.val).join("");
  }
  static resetCache() {
    zoneOffsetTs = void 0;
    zoneOffsetGuessCache.clear();
  }
  // INFO
  /**
   * Get the value of unit.
   * @param {string} unit - a unit such as 'minute' or 'day'
   * @example DateTime.local(2017, 7, 4).get('month'); //=> 7
   * @example DateTime.local(2017, 7, 4).get('day'); //=> 4
   * @return {number}
   */
  get(unit) {
    return this[unit];
  }
  /**
   * Returns whether the DateTime is valid. Invalid DateTimes occur when:
   * * The DateTime was created from invalid calendar information, such as the 13th month or February 30
   * * The DateTime was created by an operation on another invalid date
   * @type {boolean}
   */
  get isValid() {
    return this.invalid === null;
  }
  /**
   * Returns an error code if this DateTime is invalid, or null if the DateTime is valid
   * @type {string}
   */
  get invalidReason() {
    return this.invalid ? this.invalid.reason : null;
  }
  /**
   * Returns an explanation of why this DateTime became invalid, or null if the DateTime is valid
   * @type {string}
   */
  get invalidExplanation() {
    return this.invalid ? this.invalid.explanation : null;
  }
  /**
   * Get the locale of a DateTime, such 'en-GB'. The locale is used when formatting the DateTime
   *
   * @type {string}
   */
  get locale() {
    return this.isValid ? this.loc.locale : null;
  }
  /**
   * Get the numbering system of a DateTime, such 'beng'. The numbering system is used when formatting the DateTime
   *
   * @type {string}
   */
  get numberingSystem() {
    return this.isValid ? this.loc.numberingSystem : null;
  }
  /**
   * Get the output calendar of a DateTime, such 'islamic'. The output calendar is used when formatting the DateTime
   *
   * @type {string}
   */
  get outputCalendar() {
    return this.isValid ? this.loc.outputCalendar : null;
  }
  /**
   * Get the time zone associated with this DateTime.
   * @type {Zone}
   */
  get zone() {
    return this._zone;
  }
  /**
   * Get the name of the time zone.
   * @type {string}
   */
  get zoneName() {
    return this.isValid ? this.zone.name : null;
  }
  /**
   * Get the year
   * @example DateTime.local(2017, 5, 25).year //=> 2017
   * @type {number}
   */
  get year() {
    return this.isValid ? this.c.year : NaN;
  }
  /**
   * Get the quarter
   * @example DateTime.local(2017, 5, 25).quarter //=> 2
   * @type {number}
   */
  get quarter() {
    return this.isValid ? Math.ceil(this.c.month / 3) : NaN;
  }
  /**
   * Get the month (1-12).
   * @example DateTime.local(2017, 5, 25).month //=> 5
   * @type {number}
   */
  get month() {
    return this.isValid ? this.c.month : NaN;
  }
  /**
   * Get the day of the month (1-30ish).
   * @example DateTime.local(2017, 5, 25).day //=> 25
   * @type {number}
   */
  get day() {
    return this.isValid ? this.c.day : NaN;
  }
  /**
   * Get the hour of the day (0-23).
   * @example DateTime.local(2017, 5, 25, 9).hour //=> 9
   * @type {number}
   */
  get hour() {
    return this.isValid ? this.c.hour : NaN;
  }
  /**
   * Get the minute of the hour (0-59).
   * @example DateTime.local(2017, 5, 25, 9, 30).minute //=> 30
   * @type {number}
   */
  get minute() {
    return this.isValid ? this.c.minute : NaN;
  }
  /**
   * Get the second of the minute (0-59).
   * @example DateTime.local(2017, 5, 25, 9, 30, 52).second //=> 52
   * @type {number}
   */
  get second() {
    return this.isValid ? this.c.second : NaN;
  }
  /**
   * Get the millisecond of the second (0-999).
   * @example DateTime.local(2017, 5, 25, 9, 30, 52, 654).millisecond //=> 654
   * @type {number}
   */
  get millisecond() {
    return this.isValid ? this.c.millisecond : NaN;
  }
  /**
   * Get the week year
   * @see https://en.wikipedia.org/wiki/ISO_week_date
   * @example DateTime.local(2014, 12, 31).weekYear //=> 2015
   * @type {number}
   */
  get weekYear() {
    return this.isValid ? possiblyCachedWeekData(this).weekYear : NaN;
  }
  /**
   * Get the week number of the week year (1-52ish).
   * @see https://en.wikipedia.org/wiki/ISO_week_date
   * @example DateTime.local(2017, 5, 25).weekNumber //=> 21
   * @type {number}
   */
  get weekNumber() {
    return this.isValid ? possiblyCachedWeekData(this).weekNumber : NaN;
  }
  /**
   * Get the day of the week.
   * 1 is Monday and 7 is Sunday
   * @see https://en.wikipedia.org/wiki/ISO_week_date
   * @example DateTime.local(2014, 11, 31).weekday //=> 4
   * @type {number}
   */
  get weekday() {
    return this.isValid ? possiblyCachedWeekData(this).weekday : NaN;
  }
  /**
   * Returns true if this date is on a weekend according to the locale, false otherwise
   * @returns {boolean}
   */
  get isWeekend() {
    return this.isValid && this.loc.getWeekendDays().includes(this.weekday);
  }
  /**
   * Get the day of the week according to the locale.
   * 1 is the first day of the week and 7 is the last day of the week.
   * If the locale assigns Sunday as the first day of the week, then a date which is a Sunday will return 1,
   * @returns {number}
   */
  get localWeekday() {
    return this.isValid ? possiblyCachedLocalWeekData(this).weekday : NaN;
  }
  /**
   * Get the week number of the week year according to the locale. Different locales assign week numbers differently,
   * because the week can start on different days of the week (see localWeekday) and because a different number of days
   * is required for a week to count as the first week of a year.
   * @returns {number}
   */
  get localWeekNumber() {
    return this.isValid ? possiblyCachedLocalWeekData(this).weekNumber : NaN;
  }
  /**
   * Get the week year according to the locale. Different locales assign week numbers (and therefor week years)
   * differently, see localWeekNumber.
   * @returns {number}
   */
  get localWeekYear() {
    return this.isValid ? possiblyCachedLocalWeekData(this).weekYear : NaN;
  }
  /**
   * Get the ordinal (meaning the day of the year)
   * @example DateTime.local(2017, 5, 25).ordinal //=> 145
   * @type {number|DateTime}
   */
  get ordinal() {
    return this.isValid ? gregorianToOrdinal(this.c).ordinal : NaN;
  }
  /**
   * Get the human readable short month name, such as 'Oct'.
   * Defaults to the system's locale if no locale has been specified
   * @example DateTime.local(2017, 10, 30).monthShort //=> Oct
   * @type {string}
   */
  get monthShort() {
    return this.isValid ? Info.months("short", { locObj: this.loc })[this.month - 1] : null;
  }
  /**
   * Get the human readable long month name, such as 'October'.
   * Defaults to the system's locale if no locale has been specified
   * @example DateTime.local(2017, 10, 30).monthLong //=> October
   * @type {string}
   */
  get monthLong() {
    return this.isValid ? Info.months("long", { locObj: this.loc })[this.month - 1] : null;
  }
  /**
   * Get the human readable short weekday, such as 'Mon'.
   * Defaults to the system's locale if no locale has been specified
   * @example DateTime.local(2017, 10, 30).weekdayShort //=> Mon
   * @type {string}
   */
  get weekdayShort() {
    return this.isValid ? Info.weekdays("short", { locObj: this.loc })[this.weekday - 1] : null;
  }
  /**
   * Get the human readable long weekday, such as 'Monday'.
   * Defaults to the system's locale if no locale has been specified
   * @example DateTime.local(2017, 10, 30).weekdayLong //=> Monday
   * @type {string}
   */
  get weekdayLong() {
    return this.isValid ? Info.weekdays("long", { locObj: this.loc })[this.weekday - 1] : null;
  }
  /**
   * Get the UTC offset of this DateTime in minutes
   * @example DateTime.now().offset //=> -240
   * @example DateTime.utc().offset //=> 0
   * @type {number}
   */
  get offset() {
    return this.isValid ? +this.o : NaN;
  }
  /**
   * Get the short human name for the zone's current offset, for example "EST" or "EDT".
   * Defaults to the system's locale if no locale has been specified
   * @type {string}
   */
  get offsetNameShort() {
    if (this.isValid) {
      return this.zone.offsetName(this.ts, {
        format: "short",
        locale: this.locale
      });
    } else {
      return null;
    }
  }
  /**
   * Get the long human name for the zone's current offset, for example "Eastern Standard Time" or "Eastern Daylight Time".
   * Defaults to the system's locale if no locale has been specified
   * @type {string}
   */
  get offsetNameLong() {
    if (this.isValid) {
      return this.zone.offsetName(this.ts, {
        format: "long",
        locale: this.locale
      });
    } else {
      return null;
    }
  }
  /**
   * Get whether this zone's offset ever changes, as in a DST.
   * @type {boolean}
   */
  get isOffsetFixed() {
    return this.isValid ? this.zone.isUniversal : null;
  }
  /**
   * Get whether the DateTime is in a DST.
   * @type {boolean}
   */
  get isInDST() {
    if (this.isOffsetFixed) {
      return false;
    } else {
      return this.offset > this.set({ month: 1, day: 1 }).offset || this.offset > this.set({ month: 5 }).offset;
    }
  }
  /**
   * Get those DateTimes which have the same local time as this DateTime, but a different offset from UTC
   * in this DateTime's zone. During DST changes local time can be ambiguous, for example
   * `2023-10-29T02:30:00` in `Europe/Berlin` can have offset `+01:00` or `+02:00`.
   * This method will return both possible DateTimes if this DateTime's local time is ambiguous.
   * @returns {DateTime[]}
   */
  getPossibleOffsets() {
    if (!this.isValid || this.isOffsetFixed) {
      return [this];
    }
    const dayMs = 864e5;
    const minuteMs = 6e4;
    const localTS = objToLocalTS(this.c);
    const oEarlier = this.zone.offset(localTS - dayMs);
    const oLater = this.zone.offset(localTS + dayMs);
    const o1 = this.zone.offset(localTS - oEarlier * minuteMs);
    const o2 = this.zone.offset(localTS - oLater * minuteMs);
    if (o1 === o2) {
      return [this];
    }
    const ts1 = localTS - o1 * minuteMs;
    const ts2 = localTS - o2 * minuteMs;
    const c1 = tsToObj(ts1, o1);
    const c2 = tsToObj(ts2, o2);
    if (c1.hour === c2.hour && c1.minute === c2.minute && c1.second === c2.second && c1.millisecond === c2.millisecond) {
      return [clone(this, { ts: ts1 }), clone(this, { ts: ts2 })];
    }
    return [this];
  }
  /**
   * Returns true if this DateTime is in a leap year, false otherwise
   * @example DateTime.local(2016).isInLeapYear //=> true
   * @example DateTime.local(2013).isInLeapYear //=> false
   * @type {boolean}
   */
  get isInLeapYear() {
    return isLeapYear(this.year);
  }
  /**
   * Returns the number of days in this DateTime's month
   * @example DateTime.local(2016, 2).daysInMonth //=> 29
   * @example DateTime.local(2016, 3).daysInMonth //=> 31
   * @type {number}
   */
  get daysInMonth() {
    return daysInMonth(this.year, this.month);
  }
  /**
   * Returns the number of days in this DateTime's year
   * @example DateTime.local(2016).daysInYear //=> 366
   * @example DateTime.local(2013).daysInYear //=> 365
   * @type {number}
   */
  get daysInYear() {
    return this.isValid ? daysInYear(this.year) : NaN;
  }
  /**
   * Returns the number of weeks in this DateTime's year
   * @see https://en.wikipedia.org/wiki/ISO_week_date
   * @example DateTime.local(2004).weeksInWeekYear //=> 53
   * @example DateTime.local(2013).weeksInWeekYear //=> 52
   * @type {number}
   */
  get weeksInWeekYear() {
    return this.isValid ? weeksInWeekYear(this.weekYear) : NaN;
  }
  /**
   * Returns the number of weeks in this DateTime's local week year
   * @example DateTime.local(2020, 6, {locale: 'en-US'}).weeksInLocalWeekYear //=> 52
   * @example DateTime.local(2020, 6, {locale: 'de-DE'}).weeksInLocalWeekYear //=> 53
   * @type {number}
   */
  get weeksInLocalWeekYear() {
    return this.isValid ? weeksInWeekYear(
      this.localWeekYear,
      this.loc.getMinDaysInFirstWeek(),
      this.loc.getStartOfWeek()
    ) : NaN;
  }
  /**
   * Returns the resolved Intl options for this DateTime.
   * This is useful in understanding the behavior of formatting methods
   * @param {Object} opts - the same options as toLocaleString
   * @return {Object}
   */
  resolvedLocaleOptions(opts = {}) {
    const { locale, numberingSystem, calendar } = Formatter.create(
      this.loc.clone(opts),
      opts
    ).resolvedOptions(this);
    return { locale, numberingSystem, outputCalendar: calendar };
  }
  // TRANSFORM
  /**
   * "Set" the DateTime's zone to UTC. Returns a newly-constructed DateTime.
   *
   * Equivalent to {@link DateTime#setZone}('utc')
   * @param {number} [offset=0] - optionally, an offset from UTC in minutes
   * @param {Object} [opts={}] - options to pass to `setZone()`
   * @return {DateTime}
   */
  toUTC(offset2 = 0, opts = {}) {
    return this.setZone(FixedOffsetZone.instance(offset2), opts);
  }
  /**
   * "Set" the DateTime's zone to the host's local zone. Returns a newly-constructed DateTime.
   *
   * Equivalent to `setZone('local')`
   * @return {DateTime}
   */
  toLocal() {
    return this.setZone(Settings.defaultZone);
  }
  /**
   * "Set" the DateTime's zone to specified zone. Returns a newly-constructed DateTime.
   *
   * By default, the setter keeps the underlying time the same (as in, the same timestamp), but the new instance will report different local times and consider DSTs when making computations, as with {@link DateTime#plus}. You may wish to use {@link DateTime#toLocal} and {@link DateTime#toUTC} which provide simple convenience wrappers for commonly used zones.
   * @param {string|Zone} [zone='local'] - a zone identifier. As a string, that can be any IANA zone supported by the host environment, or a fixed-offset name of the form 'UTC+3', or the strings 'local' or 'utc'. You may also supply an instance of a {@link DateTime#Zone} class.
   * @param {Object} opts - options
   * @param {boolean} [opts.keepLocalTime=false] - If true, adjust the underlying time so that the local time stays the same, but in the target zone. You should rarely need this.
   * @return {DateTime}
   */
  setZone(zone, { keepLocalTime = false, keepCalendarTime = false } = {}) {
    zone = normalizeZone(zone, Settings.defaultZone);
    if (zone.equals(this.zone)) {
      return this;
    } else if (!zone.isValid) {
      return _DateTime.invalid(unsupportedZone(zone));
    } else {
      let newTS = this.ts;
      if (keepLocalTime || keepCalendarTime) {
        const offsetGuess = zone.offset(this.ts);
        const asObj = this.toObject();
        [newTS] = objToTS(asObj, offsetGuess, zone);
      }
      return clone(this, { ts: newTS, zone });
    }
  }
  /**
   * "Set" the locale, numberingSystem, or outputCalendar. Returns a newly-constructed DateTime.
   * @param {Object} properties - the properties to set
   * @example DateTime.local(2017, 5, 25).reconfigure({ locale: 'en-GB' })
   * @return {DateTime}
   */
  reconfigure({ locale, numberingSystem, outputCalendar } = {}) {
    const loc = this.loc.clone({ locale, numberingSystem, outputCalendar });
    return clone(this, { loc });
  }
  /**
   * "Set" the locale. Returns a newly-constructed DateTime.
   * Just a convenient alias for reconfigure({ locale })
   * @example DateTime.local(2017, 5, 25).setLocale('en-GB')
   * @return {DateTime}
   */
  setLocale(locale) {
    return this.reconfigure({ locale });
  }
  /**
   * "Set" the values of specified units. Returns a newly-constructed DateTime.
   * You can only set units with this method; for "setting" metadata, see {@link DateTime#reconfigure} and {@link DateTime#setZone}.
   *
   * This method also supports setting locale-based week units, i.e. `localWeekday`, `localWeekNumber` and `localWeekYear`.
   * They cannot be mixed with ISO-week units like `weekday`.
   * @param {Object} values - a mapping of units to numbers
   * @example dt.set({ year: 2017 })
   * @example dt.set({ hour: 8, minute: 30 })
   * @example dt.set({ weekday: 5 })
   * @example dt.set({ year: 2005, ordinal: 234 })
   * @return {DateTime}
   */
  set(values) {
    if (!this.isValid) return this;
    const normalized = normalizeObject(values, normalizeUnitWithLocalWeeks);
    const { minDaysInFirstWeek, startOfWeek } = usesLocalWeekValues(normalized, this.loc);
    const settingWeekStuff = !isUndefined(normalized.weekYear) || !isUndefined(normalized.weekNumber) || !isUndefined(normalized.weekday), containsOrdinal = !isUndefined(normalized.ordinal), containsGregorYear = !isUndefined(normalized.year), containsGregorMD = !isUndefined(normalized.month) || !isUndefined(normalized.day), containsGregor = containsGregorYear || containsGregorMD, definiteWeekDef = normalized.weekYear || normalized.weekNumber;
    if ((containsGregor || containsOrdinal) && definiteWeekDef) {
      throw new ConflictingSpecificationError(
        "Can't mix weekYear/weekNumber units with year/month/day or ordinals"
      );
    }
    if (containsGregorMD && containsOrdinal) {
      throw new ConflictingSpecificationError("Can't mix ordinal dates with month/day");
    }
    let mixed;
    if (settingWeekStuff) {
      mixed = weekToGregorian(
        { ...gregorianToWeek(this.c, minDaysInFirstWeek, startOfWeek), ...normalized },
        minDaysInFirstWeek,
        startOfWeek
      );
    } else if (!isUndefined(normalized.ordinal)) {
      mixed = ordinalToGregorian({ ...gregorianToOrdinal(this.c), ...normalized });
    } else {
      mixed = { ...this.toObject(), ...normalized };
      if (isUndefined(normalized.day)) {
        mixed.day = Math.min(daysInMonth(mixed.year, mixed.month), mixed.day);
      }
    }
    const [ts, o] = objToTS(mixed, this.o, this.zone);
    return clone(this, { ts, o });
  }
  /**
   * Add a period of time to this DateTime and return the resulting DateTime
   *
   * Adding hours, minutes, seconds, or milliseconds increases the timestamp by the right number of milliseconds. Adding days, months, or years shifts the calendar, accounting for DSTs and leap years along the way. Thus, `dt.plus({ hours: 24 })` may result in a different time than `dt.plus({ days: 1 })` if there's a DST shift in between.
   * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
   * @example DateTime.now().plus(123) //~> in 123 milliseconds
   * @example DateTime.now().plus({ minutes: 15 }) //~> in 15 minutes
   * @example DateTime.now().plus({ days: 1 }) //~> this time tomorrow
   * @example DateTime.now().plus({ days: -1 }) //~> this time yesterday
   * @example DateTime.now().plus({ hours: 3, minutes: 13 }) //~> in 3 hr, 13 min
   * @example DateTime.now().plus(Duration.fromObject({ hours: 3, minutes: 13 })) //~> in 3 hr, 13 min
   * @return {DateTime}
   */
  plus(duration) {
    if (!this.isValid) return this;
    const dur = Duration.fromDurationLike(duration);
    return clone(this, adjustTime(this, dur));
  }
  /**
   * Subtract a period of time to this DateTime and return the resulting DateTime
   * See {@link DateTime#plus}
   * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
   @return {DateTime}
   */
  minus(duration) {
    if (!this.isValid) return this;
    const dur = Duration.fromDurationLike(duration).negate();
    return clone(this, adjustTime(this, dur));
  }
  /**
   * "Set" this DateTime to the beginning of a unit of time.
   * @param {string} unit - The unit to go to the beginning of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
   * @param {Object} opts - options
   * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week
   * @example DateTime.local(2014, 3, 3).startOf('month').toISODate(); //=> '2014-03-01'
   * @example DateTime.local(2014, 3, 3).startOf('year').toISODate(); //=> '2014-01-01'
   * @example DateTime.local(2014, 3, 3).startOf('week').toISODate(); //=> '2014-03-03', weeks always start on Mondays
   * @example DateTime.local(2014, 3, 3, 5, 30).startOf('day').toISOTime(); //=> '00:00.000-05:00'
   * @example DateTime.local(2014, 3, 3, 5, 30).startOf('hour').toISOTime(); //=> '05:00:00.000-05:00'
   * @return {DateTime}
   */
  startOf(unit, { useLocaleWeeks = false } = {}) {
    if (!this.isValid) return this;
    const o = {}, normalizedUnit = Duration.normalizeUnit(unit);
    switch (normalizedUnit) {
      case "years":
        o.month = 1;
      // falls through
      case "quarters":
      case "months":
        o.day = 1;
      // falls through
      case "weeks":
      case "days":
        o.hour = 0;
      // falls through
      case "hours":
        o.minute = 0;
      // falls through
      case "minutes":
        o.second = 0;
      // falls through
      case "seconds":
        o.millisecond = 0;
        break;
    }
    if (normalizedUnit === "weeks") {
      if (useLocaleWeeks) {
        const startOfWeek = this.loc.getStartOfWeek();
        const { weekday } = this;
        if (weekday < startOfWeek) {
          o.weekNumber = this.weekNumber - 1;
        }
        o.weekday = startOfWeek;
      } else {
        o.weekday = 1;
      }
    }
    if (normalizedUnit === "quarters") {
      const q = Math.ceil(this.month / 3);
      o.month = (q - 1) * 3 + 1;
    }
    return this.set(o);
  }
  /**
   * "Set" this DateTime to the end (meaning the last millisecond) of a unit of time
   * @param {string} unit - The unit to go to the end of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
   * @param {Object} opts - options
   * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week
   * @example DateTime.local(2014, 3, 3).endOf('month').toISO(); //=> '2014-03-31T23:59:59.999-05:00'
   * @example DateTime.local(2014, 3, 3).endOf('year').toISO(); //=> '2014-12-31T23:59:59.999-05:00'
   * @example DateTime.local(2014, 3, 3).endOf('week').toISO(); // => '2014-03-09T23:59:59.999-05:00', weeks start on Mondays
   * @example DateTime.local(2014, 3, 3, 5, 30).endOf('day').toISO(); //=> '2014-03-03T23:59:59.999-05:00'
   * @example DateTime.local(2014, 3, 3, 5, 30).endOf('hour').toISO(); //=> '2014-03-03T05:59:59.999-05:00'
   * @return {DateTime}
   */
  endOf(unit, opts) {
    return this.isValid ? this.plus({ [unit]: 1 }).startOf(unit, opts).minus(1) : this;
  }
  // OUTPUT
  /**
   * Returns a string representation of this DateTime formatted according to the specified format string.
   * **You may not want this.** See {@link DateTime#toLocaleString} for a more flexible formatting tool. For a table of tokens and their interpretations, see [here](https://moment.github.io/luxon/#/formatting?id=table-of-tokens).
   * Defaults to en-US if no locale has been specified, regardless of the system's locale.
   * @param {string} fmt - the format string
   * @param {Object} opts - opts to override the configuration options on this DateTime
   * @example DateTime.now().toFormat('yyyy LLL dd') //=> '2017 Apr 22'
   * @example DateTime.now().setLocale('fr').toFormat('yyyy LLL dd') //=> '2017 avr. 22'
   * @example DateTime.now().toFormat('yyyy LLL dd', { locale: "fr" }) //=> '2017 avr. 22'
   * @example DateTime.now().toFormat("HH 'hours and' mm 'minutes'") //=> '20 hours and 55 minutes'
   * @return {string}
   */
  toFormat(fmt, opts = {}) {
    return this.isValid ? Formatter.create(this.loc.redefaultToEN(opts)).formatDateTimeFromString(this, fmt) : INVALID;
  }
  /**
   * Returns a localized string representing this date. Accepts the same options as the Intl.DateTimeFormat constructor and any presets defined by Luxon, such as `DateTime.DATE_FULL` or `DateTime.TIME_SIMPLE`.
   * The exact behavior of this method is browser-specific, but in general it will return an appropriate representation
   * of the DateTime in the assigned locale.
   * Defaults to the system's locale if no locale has been specified
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
   * @param formatOpts {Object} - Intl.DateTimeFormat constructor options and configuration options
   * @param {Object} opts - opts to override the configuration options on this DateTime
   * @example DateTime.now().toLocaleString(); //=> 4/20/2017
   * @example DateTime.now().setLocale('en-gb').toLocaleString(); //=> '20/04/2017'
   * @example DateTime.now().toLocaleString(DateTime.DATE_FULL); //=> 'April 20, 2017'
   * @example DateTime.now().toLocaleString(DateTime.DATE_FULL, { locale: 'fr' }); //=> '28 août 2022'
   * @example DateTime.now().toLocaleString(DateTime.TIME_SIMPLE); //=> '11:32 AM'
   * @example DateTime.now().toLocaleString(DateTime.DATETIME_SHORT); //=> '4/20/2017, 11:32 AM'
   * @example DateTime.now().toLocaleString({ weekday: 'long', month: 'long', day: '2-digit' }); //=> 'Thursday, April 20'
   * @example DateTime.now().toLocaleString({ weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); //=> 'Thu, Apr 20, 11:27 AM'
   * @example DateTime.now().toLocaleString({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); //=> '11:32'
   * @return {string}
   */
  toLocaleString(formatOpts = DATE_SHORT, opts = {}) {
    return this.isValid ? Formatter.create(this.loc.clone(opts), formatOpts).formatDateTime(this) : INVALID;
  }
  /**
   * Returns an array of format "parts", meaning individual tokens along with metadata. This is allows callers to post-process individual sections of the formatted output.
   * Defaults to the system's locale if no locale has been specified
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat/formatToParts
   * @param opts {Object} - Intl.DateTimeFormat constructor options, same as `toLocaleString`.
   * @example DateTime.now().toLocaleParts(); //=> [
   *                                   //=>   { type: 'day', value: '25' },
   *                                   //=>   { type: 'literal', value: '/' },
   *                                   //=>   { type: 'month', value: '05' },
   *                                   //=>   { type: 'literal', value: '/' },
   *                                   //=>   { type: 'year', value: '1982' }
   *                                   //=> ]
   */
  toLocaleParts(opts = {}) {
    return this.isValid ? Formatter.create(this.loc.clone(opts), opts).formatDateTimeParts(this) : [];
  }
  /**
   * Returns an ISO 8601-compliant string representation of this DateTime
   * @param {Object} opts - options
   * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
   * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
   * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
   * @param {boolean} [opts.extendedZone=false] - add the time zone format extension
   * @param {string} [opts.format='extended'] - choose between the basic and extended format
   * @param {string} [opts.precision='milliseconds'] - truncate output to desired presicion: 'years', 'months', 'days', 'hours', 'minutes', 'seconds' or 'milliseconds'. When precision and suppressSeconds or suppressMilliseconds are used together, precision sets the maximum unit shown in the output, however seconds or milliseconds will still be suppressed if they are 0.
   * @example DateTime.utc(1983, 5, 25).toISO() //=> '1982-05-25T00:00:00.000Z'
   * @example DateTime.now().toISO() //=> '2017-04-22T20:47:05.335-04:00'
   * @example DateTime.now().toISO({ includeOffset: false }) //=> '2017-04-22T20:47:05.335'
   * @example DateTime.now().toISO({ format: 'basic' }) //=> '20170422T204705.335-0400'
   * @example DateTime.now().toISO({ precision: 'day' }) //=> '2017-04-22Z'
   * @example DateTime.now().toISO({ precision: 'minute' }) //=> '2017-04-22T20:47Z'
   * @return {string|null}
   */
  toISO({
    format = "extended",
    suppressSeconds = false,
    suppressMilliseconds = false,
    includeOffset = true,
    extendedZone = false,
    precision = "milliseconds"
  } = {}) {
    if (!this.isValid) {
      return null;
    }
    precision = normalizeUnit(precision);
    const ext = format === "extended";
    let c = toISODate(this, ext, precision);
    if (orderedUnits.indexOf(precision) >= 3) c += "T";
    c += toISOTime(
      this,
      ext,
      suppressSeconds,
      suppressMilliseconds,
      includeOffset,
      extendedZone,
      precision
    );
    return c;
  }
  /**
   * Returns an ISO 8601-compliant string representation of this DateTime's date component
   * @param {Object} opts - options
   * @param {string} [opts.format='extended'] - choose between the basic and extended format
   * @param {string} [opts.precision='day'] - truncate output to desired precision: 'years', 'months', or 'days'.
   * @example DateTime.utc(1982, 5, 25).toISODate() //=> '1982-05-25'
   * @example DateTime.utc(1982, 5, 25).toISODate({ format: 'basic' }) //=> '19820525'
   * @example DateTime.utc(1982, 5, 25).toISODate({ precision: 'month' }) //=> '1982-05'
   * @return {string|null}
   */
  toISODate({ format = "extended", precision = "day" } = {}) {
    if (!this.isValid) {
      return null;
    }
    return toISODate(this, format === "extended", normalizeUnit(precision));
  }
  /**
   * Returns an ISO 8601-compliant string representation of this DateTime's week date
   * @example DateTime.utc(1982, 5, 25).toISOWeekDate() //=> '1982-W21-2'
   * @return {string}
   */
  toISOWeekDate() {
    return toTechFormat(this, "kkkk-'W'WW-c");
  }
  /**
   * Returns an ISO 8601-compliant string representation of this DateTime's time component
   * @param {Object} opts - options
   * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
   * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
   * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
   * @param {boolean} [opts.extendedZone=true] - add the time zone format extension
   * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
   * @param {string} [opts.format='extended'] - choose between the basic and extended format
   * @param {string} [opts.precision='milliseconds'] - truncate output to desired presicion: 'hours', 'minutes', 'seconds' or 'milliseconds'. When precision and suppressSeconds or suppressMilliseconds are used together, precision sets the maximum unit shown in the output, however seconds or milliseconds will still be suppressed if they are 0.
   * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime() //=> '07:34:19.361Z'
   * @example DateTime.utc().set({ hour: 7, minute: 34, seconds: 0, milliseconds: 0 }).toISOTime({ suppressSeconds: true }) //=> '07:34Z'
   * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ format: 'basic' }) //=> '073419.361Z'
   * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ includePrefix: true }) //=> 'T07:34:19.361Z'
   * @example DateTime.utc().set({ hour: 7, minute: 34, second: 56 }).toISOTime({ precision: 'minute' }) //=> '07:34Z'
   * @return {string}
   */
  toISOTime({
    suppressMilliseconds = false,
    suppressSeconds = false,
    includeOffset = true,
    includePrefix = false,
    extendedZone = false,
    format = "extended",
    precision = "milliseconds"
  } = {}) {
    if (!this.isValid) {
      return null;
    }
    precision = normalizeUnit(precision);
    let c = includePrefix && orderedUnits.indexOf(precision) >= 3 ? "T" : "";
    return c + toISOTime(
      this,
      format === "extended",
      suppressSeconds,
      suppressMilliseconds,
      includeOffset,
      extendedZone,
      precision
    );
  }
  /**
   * Returns an RFC 2822-compatible string representation of this DateTime
   * @example DateTime.utc(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 +0000'
   * @example DateTime.local(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 -0400'
   * @return {string}
   */
  toRFC2822() {
    return toTechFormat(this, "EEE, dd LLL yyyy HH:mm:ss ZZZ", false);
  }
  /**
   * Returns a string representation of this DateTime appropriate for use in HTTP headers. The output is always expressed in GMT.
   * Specifically, the string conforms to RFC 1123.
   * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
   * @example DateTime.utc(2014, 7, 13).toHTTP() //=> 'Sun, 13 Jul 2014 00:00:00 GMT'
   * @example DateTime.utc(2014, 7, 13, 19).toHTTP() //=> 'Sun, 13 Jul 2014 19:00:00 GMT'
   * @return {string}
   */
  toHTTP() {
    return toTechFormat(this.toUTC(), "EEE, dd LLL yyyy HH:mm:ss 'GMT'");
  }
  /**
   * Returns a string representation of this DateTime appropriate for use in SQL Date
   * @example DateTime.utc(2014, 7, 13).toSQLDate() //=> '2014-07-13'
   * @return {string|null}
   */
  toSQLDate() {
    if (!this.isValid) {
      return null;
    }
    return toISODate(this, true);
  }
  /**
   * Returns a string representation of this DateTime appropriate for use in SQL Time
   * @param {Object} opts - options
   * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
   * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
   * @param {boolean} [opts.includeOffsetSpace=true] - include the space between the time and the offset, such as '05:15:16.345 -04:00'
   * @example DateTime.utc().toSQL() //=> '05:15:16.345'
   * @example DateTime.now().toSQL() //=> '05:15:16.345 -04:00'
   * @example DateTime.now().toSQL({ includeOffset: false }) //=> '05:15:16.345'
   * @example DateTime.now().toSQL({ includeZone: false }) //=> '05:15:16.345 America/New_York'
   * @return {string}
   */
  toSQLTime({ includeOffset = true, includeZone = false, includeOffsetSpace = true } = {}) {
    let fmt = "HH:mm:ss.SSS";
    if (includeZone || includeOffset) {
      if (includeOffsetSpace) {
        fmt += " ";
      }
      if (includeZone) {
        fmt += "z";
      } else if (includeOffset) {
        fmt += "ZZ";
      }
    }
    return toTechFormat(this, fmt, true);
  }
  /**
   * Returns a string representation of this DateTime appropriate for use in SQL DateTime
   * @param {Object} opts - options
   * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
   * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
   * @param {boolean} [opts.includeOffsetSpace=true] - include the space between the time and the offset, such as '05:15:16.345 -04:00'
   * @example DateTime.utc(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 Z'
   * @example DateTime.local(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 -04:00'
   * @example DateTime.local(2014, 7, 13).toSQL({ includeOffset: false }) //=> '2014-07-13 00:00:00.000'
   * @example DateTime.local(2014, 7, 13).toSQL({ includeZone: true }) //=> '2014-07-13 00:00:00.000 America/New_York'
   * @return {string}
   */
  toSQL(opts = {}) {
    if (!this.isValid) {
      return null;
    }
    return `${this.toSQLDate()} ${this.toSQLTime(opts)}`;
  }
  /**
   * Returns a string representation of this DateTime appropriate for debugging
   * @return {string}
   */
  toString() {
    return this.isValid ? this.toISO() : INVALID;
  }
  /**
   * Returns a string representation of this DateTime appropriate for the REPL.
   * @return {string}
   */
  [Symbol.for("nodejs.util.inspect.custom")]() {
    if (this.isValid) {
      return `DateTime { ts: ${this.toISO()}, zone: ${this.zone.name}, locale: ${this.locale} }`;
    } else {
      return `DateTime { Invalid, reason: ${this.invalidReason} }`;
    }
  }
  /**
   * Returns the epoch milliseconds of this DateTime. Alias of {@link DateTime#toMillis}
   * @return {number}
   */
  valueOf() {
    return this.toMillis();
  }
  /**
   * Returns the epoch milliseconds of this DateTime.
   * @return {number}
   */
  toMillis() {
    return this.isValid ? this.ts : NaN;
  }
  /**
   * Returns the epoch seconds (including milliseconds in the fractional part) of this DateTime.
   * @return {number}
   */
  toSeconds() {
    return this.isValid ? this.ts / 1e3 : NaN;
  }
  /**
   * Returns the epoch seconds (as a whole number) of this DateTime.
   * @return {number}
   */
  toUnixInteger() {
    return this.isValid ? Math.floor(this.ts / 1e3) : NaN;
  }
  /**
   * Returns an ISO 8601 representation of this DateTime appropriate for use in JSON.
   * @return {string}
   */
  toJSON() {
    return this.toISO();
  }
  /**
   * Returns a BSON serializable equivalent to this DateTime.
   * @return {Date}
   */
  toBSON() {
    return this.toJSDate();
  }
  /**
   * Returns a JavaScript object with this DateTime's year, month, day, and so on.
   * @param opts - options for generating the object
   * @param {boolean} [opts.includeConfig=false] - include configuration attributes in the output
   * @example DateTime.now().toObject() //=> { year: 2017, month: 4, day: 22, hour: 20, minute: 49, second: 42, millisecond: 268 }
   * @return {Object}
   */
  toObject(opts = {}) {
    if (!this.isValid) return {};
    const base = { ...this.c };
    if (opts.includeConfig) {
      base.outputCalendar = this.outputCalendar;
      base.numberingSystem = this.loc.numberingSystem;
      base.locale = this.loc.locale;
    }
    return base;
  }
  /**
   * Returns a JavaScript Date equivalent to this DateTime.
   * @return {Date}
   */
  toJSDate() {
    return new Date(this.isValid ? this.ts : NaN);
  }
  // COMPARE
  /**
   * Return the difference between two DateTimes as a Duration.
   * @param {DateTime} otherDateTime - the DateTime to compare this one to
   * @param {string|string[]} [unit=['milliseconds']] - the unit or array of units (such as 'hours' or 'days') to include in the duration.
   * @param {Object} opts - options that affect the creation of the Duration
   * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
   * @example
   * var i1 = DateTime.fromISO('1982-05-25T09:45'),
   *     i2 = DateTime.fromISO('1983-10-14T10:30');
   * i2.diff(i1).toObject() //=> { milliseconds: 43807500000 }
   * i2.diff(i1, 'hours').toObject() //=> { hours: 12168.75 }
   * i2.diff(i1, ['months', 'days']).toObject() //=> { months: 16, days: 19.03125 }
   * i2.diff(i1, ['months', 'days', 'hours']).toObject() //=> { months: 16, days: 19, hours: 0.75 }
   * @return {Duration}
   */
  diff(otherDateTime, unit = "milliseconds", opts = {}) {
    if (!this.isValid || !otherDateTime.isValid) {
      return Duration.invalid("created by diffing an invalid DateTime");
    }
    const durOpts = { locale: this.locale, numberingSystem: this.numberingSystem, ...opts };
    const units = maybeArray(unit).map(Duration.normalizeUnit), otherIsLater = otherDateTime.valueOf() > this.valueOf(), earlier = otherIsLater ? this : otherDateTime, later = otherIsLater ? otherDateTime : this, diffed = diff(earlier, later, units, durOpts);
    return otherIsLater ? diffed.negate() : diffed;
  }
  /**
   * Return the difference between this DateTime and right now.
   * See {@link DateTime#diff}
   * @param {string|string[]} [unit=['milliseconds']] - the unit or units units (such as 'hours' or 'days') to include in the duration
   * @param {Object} opts - options that affect the creation of the Duration
   * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
   * @return {Duration}
   */
  diffNow(unit = "milliseconds", opts = {}) {
    return this.diff(_DateTime.now(), unit, opts);
  }
  /**
   * Return an Interval spanning between this DateTime and another DateTime
   * @param {DateTime} otherDateTime - the other end point of the Interval
   * @return {Interval|DateTime}
   */
  until(otherDateTime) {
    return this.isValid ? Interval.fromDateTimes(this, otherDateTime) : this;
  }
  /**
   * Return whether this DateTime is in the same unit of time as another DateTime.
   * Higher-order units must also be identical for this function to return `true`.
   * Note that time zones are **ignored** in this comparison, which compares the **local** calendar time. Use {@link DateTime#setZone} to convert one of the dates if needed.
   * @param {DateTime} otherDateTime - the other DateTime
   * @param {string} unit - the unit of time to check sameness on
   * @param {Object} opts - options
   * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week; only the locale of this DateTime is used
   * @example DateTime.now().hasSame(otherDT, 'day'); //~> true if otherDT is in the same current calendar day
   * @return {boolean}
   */
  hasSame(otherDateTime, unit, opts) {
    if (!this.isValid) return false;
    const inputMs = otherDateTime.valueOf();
    const adjustedToZone = this.setZone(otherDateTime.zone, { keepLocalTime: true });
    return adjustedToZone.startOf(unit, opts) <= inputMs && inputMs <= adjustedToZone.endOf(unit, opts);
  }
  /**
   * Equality check
   * Two DateTimes are equal if and only if they represent the same millisecond, have the same zone and location, and are both valid.
   * To compare just the millisecond values, use `+dt1 === +dt2`.
   * @param {DateTime} other - the other DateTime
   * @return {boolean}
   */
  equals(other) {
    return this.isValid && other.isValid && this.valueOf() === other.valueOf() && this.zone.equals(other.zone) && this.loc.equals(other.loc);
  }
  /**
   * Returns a string representation of a this time relative to now, such as "in two days". Can only internationalize if your
   * platform supports Intl.RelativeTimeFormat. Rounds towards zero by default.
   * @param {Object} options - options that affect the output
   * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
   * @param {string} [options.style="long"] - the style of units, must be "long", "short", or "narrow"
   * @param {string|string[]} options.unit - use a specific unit or array of units; if omitted, or an array, the method will pick the best unit. Use an array or one of "years", "quarters", "months", "weeks", "days", "hours", "minutes", or "seconds"
   * @param {boolean} [options.round=true] - whether to round the numbers in the output.
   * @param {string} [options.rounding="trunc"] - rounding method to use when rounding the numbers in the output. Can be "trunc" (toward zero), "expand" (away from zero), "round", "floor", or "ceil".
   * @param {number} [options.padding=0] - padding in milliseconds. This allows you to round up the result if it fits inside the threshold. Don't use in combination with {round: false} because the decimal output will include the padding.
   * @param {string} options.locale - override the locale of this DateTime
   * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
   * @example DateTime.now().plus({ days: 1 }).toRelative() //=> "in 1 day"
   * @example DateTime.now().setLocale("es").toRelative({ days: 1 }) //=> "dentro de 1 día"
   * @example DateTime.now().plus({ days: 1 }).toRelative({ locale: "fr" }) //=> "dans 23 heures"
   * @example DateTime.now().minus({ days: 2 }).toRelative() //=> "2 days ago"
   * @example DateTime.now().minus({ days: 2 }).toRelative({ unit: "hours" }) //=> "48 hours ago"
   * @example DateTime.now().minus({ hours: 36 }).toRelative({ round: false }) //=> "1.5 days ago"
   */
  toRelative(options = {}) {
    if (!this.isValid) return null;
    const base = options.base || _DateTime.fromObject({}, { zone: this.zone }), padding = options.padding ? this < base ? -options.padding : options.padding : 0;
    let units = ["years", "months", "days", "hours", "minutes", "seconds"];
    let unit = options.unit;
    if (Array.isArray(options.unit)) {
      units = options.unit;
      unit = void 0;
    }
    return diffRelative(base, this.plus(padding), {
      ...options,
      numeric: "always",
      units,
      unit
    });
  }
  /**
   * Returns a string representation of this date relative to today, such as "yesterday" or "next month".
   * Only internationalizes on platforms that supports Intl.RelativeTimeFormat.
   * @param {Object} options - options that affect the output
   * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
   * @param {string} options.locale - override the locale of this DateTime
   * @param {string} options.unit - use a specific unit; if omitted, the method will pick the unit. Use one of "years", "quarters", "months", "weeks", or "days"
   * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
   * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar() //=> "tomorrow"
   * @example DateTime.now().setLocale("es").plus({ days: 1 }).toRelative() //=> ""mañana"
   * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar({ locale: "fr" }) //=> "demain"
   * @example DateTime.now().minus({ days: 2 }).toRelativeCalendar() //=> "2 days ago"
   */
  toRelativeCalendar(options = {}) {
    if (!this.isValid) return null;
    return diffRelative(options.base || _DateTime.fromObject({}, { zone: this.zone }), this, {
      ...options,
      numeric: "auto",
      units: ["years", "months", "days"],
      calendary: true
    });
  }
  /**
   * Return the min of several date times
   * @param {...DateTime} dateTimes - the DateTimes from which to choose the minimum
   * @return {DateTime} the min DateTime, or undefined if called with no argument
   */
  static min(...dateTimes) {
    if (!dateTimes.every(_DateTime.isDateTime)) {
      throw new InvalidArgumentError("min requires all arguments be DateTimes");
    }
    return bestBy(dateTimes, (i) => i.valueOf(), Math.min);
  }
  /**
   * Return the max of several date times
   * @param {...DateTime} dateTimes - the DateTimes from which to choose the maximum
   * @return {DateTime} the max DateTime, or undefined if called with no argument
   */
  static max(...dateTimes) {
    if (!dateTimes.every(_DateTime.isDateTime)) {
      throw new InvalidArgumentError("max requires all arguments be DateTimes");
    }
    return bestBy(dateTimes, (i) => i.valueOf(), Math.max);
  }
  // MISC
  /**
   * Explain how a string would be parsed by fromFormat()
   * @param {string} text - the string to parse
   * @param {string} fmt - the format the string is expected to be in (see description)
   * @param {Object} options - options taken by fromFormat()
   * @return {Object}
   */
  static fromFormatExplain(text, fmt, options = {}) {
    const { locale = null, numberingSystem = null } = options, localeToUse = Locale.fromOpts({
      locale,
      numberingSystem,
      defaultToEN: true
    });
    return explainFromTokens(localeToUse, text, fmt);
  }
  /**
   * @deprecated use fromFormatExplain instead
   */
  static fromStringExplain(text, fmt, options = {}) {
    return _DateTime.fromFormatExplain(text, fmt, options);
  }
  /**
   * Build a parser for `fmt` using the given locale. This parser can be passed
   * to {@link DateTime.fromFormatParser} to a parse a date in this format. This
   * can be used to optimize cases where many dates need to be parsed in a
   * specific format.
   *
   * @param {String} fmt - the format the string is expected to be in (see
   * description)
   * @param {Object} options - options used to set locale and numberingSystem
   * for parser
   * @returns {TokenParser} - opaque object to be used
   */
  static buildFormatParser(fmt, options = {}) {
    const { locale = null, numberingSystem = null } = options, localeToUse = Locale.fromOpts({
      locale,
      numberingSystem,
      defaultToEN: true
    });
    return new TokenParser(localeToUse, fmt);
  }
  /**
   * Create a DateTime from an input string and format parser.
   *
   * The format parser must have been created with the same locale as this call.
   *
   * @param {String} text - the string to parse
   * @param {TokenParser} formatParser - parser from {@link DateTime.buildFormatParser}
   * @param {Object} opts - options taken by fromFormat()
   * @returns {DateTime}
   */
  static fromFormatParser(text, formatParser, opts = {}) {
    if (isUndefined(text) || isUndefined(formatParser)) {
      throw new InvalidArgumentError(
        "fromFormatParser requires an input string and a format parser"
      );
    }
    const { locale = null, numberingSystem = null } = opts, localeToUse = Locale.fromOpts({
      locale,
      numberingSystem,
      defaultToEN: true
    });
    if (!localeToUse.equals(formatParser.locale)) {
      throw new InvalidArgumentError(
        `fromFormatParser called with a locale of ${localeToUse}, but the format parser was created for ${formatParser.locale}`
      );
    }
    const { result, zone, specificOffset, invalidReason } = formatParser.explainFromTokens(text);
    if (invalidReason) {
      return _DateTime.invalid(invalidReason);
    } else {
      return parseDataToDateTime(
        result,
        zone,
        opts,
        `format ${formatParser.format}`,
        text,
        specificOffset
      );
    }
  }
  // FORMAT PRESETS
  /**
   * {@link DateTime#toLocaleString} format like 10/14/1983
   * @type {Object}
   */
  static get DATE_SHORT() {
    return DATE_SHORT;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Oct 14, 1983'
   * @type {Object}
   */
  static get DATE_MED() {
    return DATE_MED;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Fri, Oct 14, 1983'
   * @type {Object}
   */
  static get DATE_MED_WITH_WEEKDAY() {
    return DATE_MED_WITH_WEEKDAY;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'October 14, 1983'
   * @type {Object}
   */
  static get DATE_FULL() {
    return DATE_FULL;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Tuesday, October 14, 1983'
   * @type {Object}
   */
  static get DATE_HUGE() {
    return DATE_HUGE;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30 AM'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get TIME_SIMPLE() {
    return TIME_SIMPLE;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30:23 AM'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get TIME_WITH_SECONDS() {
    return TIME_WITH_SECONDS;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30:23 AM EDT'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get TIME_WITH_SHORT_OFFSET() {
    return TIME_WITH_SHORT_OFFSET;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30:23 AM Eastern Daylight Time'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get TIME_WITH_LONG_OFFSET() {
    return TIME_WITH_LONG_OFFSET;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30', always 24-hour.
   * @type {Object}
   */
  static get TIME_24_SIMPLE() {
    return TIME_24_SIMPLE;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30:23', always 24-hour.
   * @type {Object}
   */
  static get TIME_24_WITH_SECONDS() {
    return TIME_24_WITH_SECONDS;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30:23 EDT', always 24-hour.
   * @type {Object}
   */
  static get TIME_24_WITH_SHORT_OFFSET() {
    return TIME_24_WITH_SHORT_OFFSET;
  }
  /**
   * {@link DateTime#toLocaleString} format like '09:30:23 Eastern Daylight Time', always 24-hour.
   * @type {Object}
   */
  static get TIME_24_WITH_LONG_OFFSET() {
    return TIME_24_WITH_LONG_OFFSET;
  }
  /**
   * {@link DateTime#toLocaleString} format like '10/14/1983, 9:30 AM'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_SHORT() {
    return DATETIME_SHORT;
  }
  /**
   * {@link DateTime#toLocaleString} format like '10/14/1983, 9:30:33 AM'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_SHORT_WITH_SECONDS() {
    return DATETIME_SHORT_WITH_SECONDS;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Oct 14, 1983, 9:30 AM'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_MED() {
    return DATETIME_MED;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Oct 14, 1983, 9:30:33 AM'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_MED_WITH_SECONDS() {
    return DATETIME_MED_WITH_SECONDS;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Fri, 14 Oct 1983, 9:30 AM'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_MED_WITH_WEEKDAY() {
    return DATETIME_MED_WITH_WEEKDAY;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'October 14, 1983, 9:30 AM EDT'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_FULL() {
    return DATETIME_FULL;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'October 14, 1983, 9:30:33 AM EDT'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_FULL_WITH_SECONDS() {
    return DATETIME_FULL_WITH_SECONDS;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Friday, October 14, 1983, 9:30 AM Eastern Daylight Time'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_HUGE() {
    return DATETIME_HUGE;
  }
  /**
   * {@link DateTime#toLocaleString} format like 'Friday, October 14, 1983, 9:30:33 AM Eastern Daylight Time'. Only 12-hour if the locale is.
   * @type {Object}
   */
  static get DATETIME_HUGE_WITH_SECONDS() {
    return DATETIME_HUGE_WITH_SECONDS;
  }
};
function friendlyDateTime(dateTimeish) {
  if (DateTime.isDateTime(dateTimeish)) {
    return dateTimeish;
  } else if (dateTimeish && dateTimeish.valueOf && isNumber(dateTimeish.valueOf())) {
    return DateTime.fromJSDate(dateTimeish);
  } else if (dateTimeish && typeof dateTimeish === "object") {
    return DateTime.fromObject(dateTimeish);
  } else {
    throw new InvalidArgumentError(
      `Unknown datetime argument: ${dateTimeish}, of type ${typeof dateTimeish}`
    );
  }
}

// src/vendor/polimi-schedule-js/schedule-to-ical.mjs
var import_immutable_ics = __toESM(require_immutable_ics_cjs(), 1);

// node_modules/uuid/dist/esm-node/rng.js
var import_crypto = __toESM(require("crypto"));
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    import_crypto.default.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// node_modules/uuid/dist/esm-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset2 = 0) {
  return byteToHex[arr[offset2 + 0]] + byteToHex[arr[offset2 + 1]] + byteToHex[arr[offset2 + 2]] + byteToHex[arr[offset2 + 3]] + "-" + byteToHex[arr[offset2 + 4]] + byteToHex[arr[offset2 + 5]] + "-" + byteToHex[arr[offset2 + 6]] + byteToHex[arr[offset2 + 7]] + "-" + byteToHex[arr[offset2 + 8]] + byteToHex[arr[offset2 + 9]] + "-" + byteToHex[arr[offset2 + 10]] + byteToHex[arr[offset2 + 11]] + byteToHex[arr[offset2 + 12]] + byteToHex[arr[offset2 + 13]] + byteToHex[arr[offset2 + 14]] + byteToHex[arr[offset2 + 15]];
}

// node_modules/uuid/dist/esm-node/native.js
var import_crypto2 = __toESM(require("crypto"));
var native_default = {
  randomUUID: import_crypto2.default.randomUUID
};

// node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset2) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset2 = offset2 || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset2 + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// src/vendor/polimi-schedule-js/schedule-to-ical.mjs
var europeRomeIcalTimezone = `
X-WR-TIMEZONE:Europe/Rome
BEGIN:VTIMEZONE
TZID:Europe/Rome
X-LIC-LOCATION:Europe/Rome
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
`.replace(/\r?\n/g, "\r\n");
var weekdays2 = {
  Domenica: 7,
  Luned\u00EC: 1,
  Marted\u00EC: 2,
  Mercoled\u00EC: 3,
  Gioved\u00EC: 4,
  Venerd\u00EC: 5,
  Sabato: 6,
  Sunday: 7,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};
var months2 = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  gen: 1,
  mag: 5,
  giu: 6,
  lug: 7,
  ago: 8,
  set: 9,
  ott: 10,
  dic: 12
};
var acceptableStartingMonths = [2, 3, 4, 9, 10, 11];
var acceptableEndingMonths = [4, 5, 6, 10, 11, 12, 1];
var languageLookup = {
  Lezione: "it",
  Esercitazione: "it",
  "Laboratorio informatico": "it",
  Laboratorio: "it",
  Lesson: "en",
  Training: "en",
  Laboratory: "en",
  "Computer laboratory": "en"
};
var professorsLookup = {
  it: { one: "Docente:", many: "Docenti:" },
  en: { one: "Professor:", many: "Professors:" }
};
function insertVTimezone(rawCalendar) {
  return rawCalendar.replace(/\r\n(?=BEGIN:VEVENT)/, europeRomeIcalTimezone);
}
function dateToLocalRuleText(date) {
  return date.toFormat("yyyyMMdd'T'HHmmss");
}
function dateToUTCRuleText(date) {
  return date.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}
function setHourGenerator(firstDatetime) {
  return (otherDate) => {
    return otherDate.set({
      hour: firstDatetime.hour,
      minute: firstDatetime.minute
    });
  };
}
var auicDateRegexSource = String.raw`\d{2}-[a-zA-Z]{3}-\d{4}`;
var auicDateRegex = new RegExp(auicDateRegexSource);
function isValidDate(line) {
  return auicDateRegex.test(line);
}
var unacceptableTitleWords = `${Object.keys(weekdays2).join(
  "|"
)}|Virtual classroom|Aula virtuale|Inizio lezioni|Start of lessons|Lectures start|Lessons start|Fine lezioni|End of lessons*|Lectures end|Lessons end|Semester:|Semestre:|Period:|Periodo:|${auicDateRegexSource}|\\(|\\)`;
function isCourseDdMmYyyy(startComponents, endComponents) {
  let ret = true;
  const startMonth = parseInt(startComponents[2]);
  const endMonth = parseInt(endComponents[2]);
  const startAsNumber = parseInt(
    startComponents[3] + startComponents[2] + startComponents[1]
  );
  const endAsNumber = parseInt(
    endComponents[3] + endComponents[2] + endComponents[1]
  );
  if (acceptableStartingMonths.indexOf(startMonth) === -1 || acceptableEndingMonths.indexOf(endMonth) === -1 || startMonth > 12 || endMonth > 12 || startAsNumber > endAsNumber) {
    ret = false;
  }
  return ret;
}
function createDateFromText(text) {
  let pieces = text.split("-");
  const year = parseInt(pieces[2]);
  const month = months2[pieces[1].toLowerCase()];
  if (month === void 0) {
    throw new Error(`Invalid month in: ${text}`);
  }
  const day = parseInt(pieces[0]);
  return DateTime.fromObject(
    { year, month, day, hour: 12, minute: 0 },
    { zone: "Europe/Rome" }
  );
}
function buildProfessorsList(course, alreadyMatchedTitles) {
  let professorNames = [];
  for (let title of alreadyMatchedTitles) {
    if (title[3] !== void 0)
      professorNames.push(title[3].trim());
  }
  const virtualClassroomRegex = /^\s*(?:Aula virtuale|Virtual classroom)\s*-\s*(.*)$/gm;
  let virtualClassrooms = [...course.matchAll(virtualClassroomRegex)];
  for (let virtualClassroom of virtualClassrooms) {
    professorNames.push(virtualClassroom[1].trim());
  }
  professorNames = [...new Set(professorNames)];
  return professorNames;
}
function getProfessorString(lessonType, professorNames) {
  let pluralSelector = null;
  let languageTable = professorsLookup[languageLookup[lessonType] || "en"];
  if (professorNames.length === 1) {
    pluralSelector = "one";
  } else if (professorNames.length > 1) {
    pluralSelector = "many";
  }
  let professorString = "";
  if (pluralSelector != null) {
    professorString = languageTable[pluralSelector];
  }
  return professorString;
}
function parseAUICCourse(course, professorNames, courseName) {
  const events = [];
  let timeLocationRegex = /^\s*([^\s]*) (?:dalle|from) (\d{2}):(\d{2}) (?:alle|to) (\d{2}):(\d{2})(?:,\s*)?(.+?(?=\sin\s|\sClassroom\s|\sAula\s))?(?: in (?:the)?\s*(?:aula|classroom|lecture theatre))*\s*(.*)$/gim;
  let timesLocations = [...course.split(timeLocationRegex)];
  timesLocations.splice(0, 1);
  let regexCapturingGroups = 8;
  let numberTimesLocations = timesLocations.length / regexCapturingGroups;
  for (let i = 0; i < numberTimesLocations; i++) {
    let startHour = timesLocations[i * regexCapturingGroups + 1];
    let startMinute = timesLocations[i * regexCapturingGroups + 2];
    let endHour = timesLocations[i * regexCapturingGroups + 3];
    let endMinute = timesLocations[i * regexCapturingGroups + 4];
    let lessonType = timesLocations[i * regexCapturingGroups + 5];
    lessonType = lessonType[0].toUpperCase() + lessonType.substring(1);
    let location = timesLocations[i * regexCapturingGroups + 6];
    let dates = timesLocations[i * regexCapturingGroups + 7].split("\n\n")[0].trim().split("\n");
    dates = dates.filter(isValidDate);
    const partialFirstDay = createDateFromText(dates.splice(0, 1)[0]);
    const firstDay = partialFirstDay.set({
      hour: startHour,
      minute: startMinute
    });
    const firstEnd = partialFirstDay.set({
      hour: endHour,
      minute: endMinute
    });
    let professorString = getProfessorString(lessonType, professorNames);
    let event = {
      summary: courseName,
      start: firstDay,
      end: firstEnd,
      dtstamp: DateTime.now(),
      location,
      description: (lessonType === null ? "" : `${lessonType}
`) + professorString + "\n" + professorNames.join("\n")
    };
    if (dates.length > 0) {
      event.rdate = dates.map(createDateFromText).map(setHourGenerator(firstDay)).map(dateToUTCRuleText).join(",");
    }
    events.push(event);
  }
  return { data: events, error: null };
}
function parseIIICourse(course, datesRegex, titleRegex2, professorNames, courseName) {
  datesRegex.lastIndex = 0;
  let datesGroups = [...course.matchAll(datesRegex)];
  if (datesGroups.length > 1) {
    let datesDefined = false;
    let subCourses = [];
    let tempCourse = "";
    for (let row of course.split("\n")) {
      if (titleRegex2.test(row)) {
        tempCourse = tempCourse.trim();
        if (tempCourse !== "") subCourses.push(tempCourse);
        tempCourse = row;
        datesDefined = false;
      } else {
        if (datesRegex.test(row)) {
          if (!datesDefined) {
            datesDefined = true;
            tempCourse += "\n" + row;
          }
        } else {
          tempCourse += "\n" + row;
        }
      }
    }
    tempCourse = tempCourse.trim();
    if (tempCourse !== "") subCourses.push(tempCourse);
    const headingData = parseCourse(subCourses[0], professorNames);
    const followingData = parseCourse(
      subCourses.slice(1).join("\n"),
      professorNames
    );
    return {
      data: [...headingData.data, ...followingData.data],
      error: headingData.error || followingData.error
    };
  } else if (datesGroups.length === 1) {
    let datesMatch = datesGroups[0];
    const dateComponentsRegex = /(\d{2})\/(\d{2})\/(\d{4})/;
    const startComponents = dateComponentsRegex.exec(datesMatch[2]);
    const endComponents = dateComponentsRegex.exec(datesMatch[3]);
    const isDdMmYyyy = isCourseDdMmYyyy(startComponents, endComponents);
    const dateFormat = isDdMmYyyy ? "dd/MM/yyyy" : "MM/dd/yyyy";
    let start = DateTime.fromFormat(datesMatch[2], dateFormat, {
      zone: "Europe/Rome"
    });
    let end = DateTime.fromFormat(datesMatch[3], dateFormat, {
      zone: "Europe/Rome"
    });
    if (start.invalid !== null || end.invalid != null) {
      return {
        data: [],
        error: start.invalid || end.invalid
      };
    } else if (start.valueOf() > end.valueOf()) {
      return {
        data: [],
        error: `Start is unexpectedly greater than End (${start} > ${end})`
      };
    }
    const events = [];
    let courseDays = /\n[^\n]+\n?([\s\S]*)/.exec(course);
    if (courseDays !== null && courseDays[1] !== "") {
      let rows = courseDays[1].trim().split("\n\n")[0].split("\n");
      for (let j of rows) {
        let timeMatch = /([^\s]*) (?:dalle|from) (\d+)[:.](\d+)\s?(?<startMidday>(?:[ap])\.?m\.?)? (?:alle|to) (\d+)[:.](\d+)\s?(?<endMidday>(?:[ap])\.?m\.?)?/i.exec(
          j
        );
        if (timeMatch === null) {
          continue;
        }
        let noRoomTest = /.*? (?:Aula al momento non disponibile|Classroom not available yet).*/;
        let weekDay = weekdays2[timeMatch[1]];
        let firstDay = start;
        if (weekDay < start.weekday) {
          firstDay = start.set({
            day: start.day - start.weekday + 7 + weekDay
          });
        } else {
          firstDay = start.set({ day: start.day - start.weekday + weekDay });
        }
        const startMiddayOffset = timeMatch.groups.startMidday !== void 0 && timeMatch.groups.startMidday[0] === "p" ? 12 : 0;
        firstDay = firstDay.set({
          hour: parseInt(timeMatch[2]) + startMiddayOffset,
          minute: parseInt(timeMatch[3])
        });
        let lastDay = end;
        if (weekDay <= end.weekday) {
          lastDay = end.set({ day: end.day - end.weekday + weekDay });
        } else {
          lastDay = end.set({ day: end.day - end.weekday - 7 + weekDay });
        }
        lastDay = lastDay.set({
          hour: firstDay.hour,
          minute: firstDay.minute
        });
        if (firstDay.valueOf() > lastDay.valueOf()) {
          return {
            data: events,
            error: `First day is unexpectedly greater than Last day (${firstDay} > ${lastDay})`
          };
        }
        let firstEnd = firstDay;
        const endMiddayOffset = timeMatch.groups.endMidday !== void 0 && timeMatch.groups.endMidday[0] === "p" ? 12 : 0;
        firstEnd = firstEnd.set({
          hour: parseInt(timeMatch[5]) + endMiddayOffset,
          minute: parseInt(timeMatch[6])
        });
        let location = null;
        let lessonType = null;
        if (!noRoomTest.test(j)) {
          let roomMatch = /\d(?:\s*(?:am|pm))?(,\s*(.+))?\s+in\s+(?:aula|classroom|lecture theatre|the classroom|the|room) (.*)/.exec(
            j
          );
          if (roomMatch === null) {
            let inaccurateRoomMatch = /,\s*(?:classroom lesson)?\s*(.*)/.exec(
              j
            );
            if (inaccurateRoomMatch !== null) {
              lessonType = "Lesson";
              location = inaccurateRoomMatch[1];
            }
          } else {
            if (roomMatch[2] !== void 0) {
              lessonType = roomMatch[2][0].toUpperCase() + roomMatch[2].substring(1);
            }
            location = roomMatch[3];
          }
        }
        let professorString = getProfessorString(lessonType, professorNames);
        events.push({
          summary: courseName,
          start: firstDay,
          end: firstEnd,
          dtstamp: DateTime.now(),
          location,
          rrule: "FREQ=WEEKLY;UNTIL=" + dateToUTCRuleText(lastDay),
          description: (lessonType === null ? "" : `${lessonType}
`) + professorString + "\n" + professorNames.join("\n")
        });
      }
    }
    return { data: events, error: null };
  }
}
var titleRegex = new RegExp(
  String.raw`^(?:\s*(\d{6}) - )?((?!${unacceptableTitleWords})[^\s].+?)(?:\s*\(\s*(?:Docente|Professor|Lecturer|Teacher):(.*)\)|$)`,
  "gm"
);
function parseCourse(course, upperLevelProfessorNames = null, subcourseSeparator = null) {
  const titles = [...course.matchAll(titleRegex)];
  if (titles.length === 0) {
    return { data: [], error: null };
  }
  let professorNames = buildProfessorsList(course, titles);
  if (professorNames.length === 0 && upperLevelProfessorNames !== null) {
    professorNames = upperLevelProfessorNames;
  }
  if (subcourseSeparator !== null && titles.length > 1) {
    if (course.includes(subcourseSeparator)) {
      let innerEvents = [];
      for (const wholeCourse of course.split(subcourseSeparator)) {
        const newSubcourse = parseCourse(wholeCourse.trim(), professorNames);
        innerEvents = [...innerEvents, ...newSubcourse.data];
        if (newSubcourse.error !== null) {
          return { data: innerEvents, error: newSubcourse.error };
        }
      }
      return { data: innerEvents, error: null };
    }
  }
  const noLessonTest = /\s*(?:L'orario non è stato definito|The schedule has not been defined)/;
  const noScheduleTest = /\s*(?:Nessun orario definito|No timetable defined)/;
  if (noLessonTest.test(course) || noScheduleTest.test(course)) {
    return { data: [], error: null };
  }
  const courseName = titles[titles.length - 1][2];
  const datesRegex = /(1|2|A|Annual(?:e*))?\s*(?:Inizio lezioni|Start of lessons|Lectures start|Lessons start): (\d{2}\/\d{2}\/\d{4})\s*(?:Fine lezioni|End of lessons*|Lectures end|Lessons end): (\d{2}\/\d{2}\/\d{4})/g;
  if (!datesRegex.test(course)) {
    return parseAUICCourse(course, professorNames, courseName);
  } else {
    return parseIIICourse(
      course,
      datesRegex,
      titleRegex,
      professorNames,
      courseName
    );
  }
}
var weekdaysRegex = Object.keys(weekdays2).join("|");
function splitCollapsedDates(match2, p1, p2, offset2, string, groups) {
  const dates = p2.match(/.{11}/g);
  return `${p1}
${dates.join("\n")}`;
}
function adjustParentheses(text) {
  const inputLines = text.split("\n");
  const outputLines = [];
  let lineBuilder = "";
  let extraOpenInBuilder = 0;
  for (const line of inputLines) {
    const openParenthesesCount = (line.match(/\(/g) || []).length;
    const closeParenthesesCount = (line.match(/\)/g) || []).length;
    if (extraOpenInBuilder > 0) {
      extraOpenInBuilder += openParenthesesCount - closeParenthesesCount;
      lineBuilder += ` ${line}`;
      if (extraOpenInBuilder === 0) {
        outputLines.push(lineBuilder);
        lineBuilder = "";
      }
    } else {
      extraOpenInBuilder += openParenthesesCount - closeParenthesesCount;
      if (extraOpenInBuilder === 0) {
        outputLines.push(line);
      } else {
        lineBuilder = line;
      }
    }
  }
  if (lineBuilder !== "") {
    outputLines.push(`${lineBuilder}${")".repeat(extraOpenInBuilder)}`);
  }
  return outputLines.join("\n");
}
function guessNewlines(text, courseSeparator = "\n\n") {
  if (text.match(courseSeparator) === null) {
    return text.replace(titleRegex, "\n$&");
  } else {
    return text;
  }
}
function preprocessText(userInput) {
  const simplePreprocessedText = userInput.replace(/\n\)/g, ")").replace(/\u00A0/g, " ").replace(
    new RegExp(`(?<pre>\\S)(?<auicDate>(${auicDateRegexSource})+)`, "g"),
    splitCollapsedDates
  ).replace(new RegExp(`(\\S)(${weekdaysRegex})`, "g"), "$1\n$2").replace(
    new RegExp(
      `(?<titlePart>${titleRegex.source})(?<doubleNewline>\\n\\n)(?<semester>Semester|Semestre)`,
      "gm"
    ),
    "$<titlePart>\n$<semester>"
  ).trim();
  const adjustedText = adjustParentheses(simplePreprocessedText);
  return guessNewlines(adjustedText).trim();
}
function parseText(allCourses, firstTry = true) {
  try {
    const preprocessedInput = preprocessText(allCourses);
    let separator = "\n\n\n";
    if (preprocessedInput.includes("\n\n\n\n")) {
      separator = "\n\n\n\n";
    }
    let coursesList = preprocessedInput.split(separator);
    let events = [];
    for (let wholeCourse of coursesList) {
      const newCourse = parseCourse(
        wholeCourse.trim(),
        null,
        separator.slice(0, -1)
      );
      events = [...events, ...newCourse.data];
      if (newCourse.error !== null) {
        return { data: events, error: newCourse.error };
      }
    }
    if (events.length === 0 && preprocessedInput.length !== 0) {
      if (firstTry) {
        return parseText(guessNewlines(preprocessedInput, "\n\n\n"), false);
      } else {
        return { data: [], error: "No courses detected" };
      }
    }
    return { data: events, error: null };
  } catch (err) {
    console.error(
      "The website is no longer compatible with polimi-schedule-js. Please report the error message and the calendar text you are trying to convert. (" + err.message + ")"
    );
    return { data: [], error: err.message };
  }
}
function getIcalendar(events) {
  const versionProperty = new import_immutable_ics.Property({ name: "VERSION", value: 2 });
  const prodId = new import_immutable_ics.Property({ name: "PRODID", value: "bebora@github" });
  let calendar = new import_immutable_ics.Component({
    name: "VCALENDAR",
    properties: [versionProperty, prodId]
  });
  for (let e of events.data) {
    let newEvent = new import_immutable_ics.Component({
      name: "VEVENT",
      properties: [
        new import_immutable_ics.Property({
          name: "SUMMARY",
          value: e.summary
        }),
        new import_immutable_ics.Property({
          name: "DTSTART",
          parameters: { TZID: "Europe/Rome" },
          value: dateToLocalRuleText(e.start)
        }),
        new import_immutable_ics.Property({
          name: "DTEND",
          parameters: { TZID: "Europe/Rome" },
          value: dateToLocalRuleText(e.end)
        }),
        new import_immutable_ics.Property({
          name: "DTSTAMP",
          value: dateToUTCRuleText(e.dtstamp)
        }),
        new import_immutable_ics.Property({
          name: "UID",
          value: v4_default()
        })
      ]
    });
    if (e.location !== void 0) {
      newEvent = newEvent.pushProperty(
        new import_immutable_ics.Property({
          name: "LOCATION",
          value: e.location
        })
      );
    }
    if (e.description !== void 0) {
      newEvent = newEvent.pushProperty(
        new import_immutable_ics.Property({
          name: "DESCRIPTION",
          value: e.description
        })
      );
    }
    if (e.rrule !== void 0) {
      newEvent = newEvent.pushProperty(
        new import_immutable_ics.Property({
          name: "RRULE",
          value: e.rrule
        })
      );
    }
    if (e.rdate !== void 0) {
      newEvent = newEvent.pushProperty(
        new import_immutable_ics.Property({
          name: "RDATE",
          value: e.rdate
        })
      );
    }
    calendar = calendar.pushComponent(newEvent);
  }
  const rawCalendar = calendar.toString();
  return { data: insertVTimezone(rawCalendar), error: null };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getIcalendar,
  parseText
});
/*! Bundled license information:

immutable/dist/immutable.js:
  (**
   * @license
   * MIT License
   * 
   * Copyright (c) 2014-present, Lee Byron and other contributors.
   * 
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * 
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * 
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *)
*/
