var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
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

// node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "node_modules/react/cjs/react.production.js"(exports2) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var REACT_VIEW_TRANSITION_TYPE = /* @__PURE__ */ Symbol.for("react.view_transition");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result, thenable = ctor();
        thenable.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject, void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error, void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = thenable);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    function startTransition(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      currentTransition.types = null !== prevTransition ? prevTransition.types : null;
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    }
    function addTransitionType(type) {
      var transition = ReactSharedInternals.T;
      if (null !== transition) {
        var transitionTypes = transition.types;
        null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
      } else startTransition(addTransitionType.bind(null, type));
    }
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports2.Activity = REACT_ACTIVITY_TYPE;
    exports2.Children = Children;
    exports2.Component = Component;
    exports2.Fragment = REACT_FRAGMENT_TYPE;
    exports2.Profiler = REACT_PROFILER_TYPE;
    exports2.PureComponent = PureComponent;
    exports2.StrictMode = REACT_STRICT_MODE_TYPE;
    exports2.Suspense = REACT_SUSPENSE_TYPE;
    exports2.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
    exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports2.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports2.addTransitionType = addTransitionType;
    exports2.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports2.cacheSignal = function() {
      return null;
    };
    exports2.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, props);
    };
    exports2.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports2.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, props);
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports2.isValidElement = isValidElement;
    exports2.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports2.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports2.startTransition = startTransition;
    exports2.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports2.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports2.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports2.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports2.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports2.useEffect = function(create2, deps) {
      return ReactSharedInternals.H.useEffect(create2, deps);
    };
    exports2.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports2.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports2.useImperativeHandle = function(ref, create2, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create2, deps);
    };
    exports2.useInsertionEffect = function(create2, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create2, deps);
    };
    exports2.useLayoutEffect = function(create2, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create2, deps);
    };
    exports2.useMemo = function(create2, deps) {
      return ReactSharedInternals.H.useMemo(create2, deps);
    };
    exports2.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports2.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports2.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports2.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports2.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports2.version = "19.3.1";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
          case REACT_VIEW_TRANSITION_TYPE:
            return "ViewTransition";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var resolveDebugValue = null, rejectDebugValue = null, ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now(), ioInfo.value = new Promise(function(resolve, reject) {
            resolveDebugValue = resolve;
            rejectDebugValue = reject;
          }));
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                if (null != _ioInfo) {
                  _ioInfo.end = performance.now();
                  var debugValue = null == moduleObject ? void 0 : moduleObject.default;
                  resolveDebugValue(debugValue);
                  _ioInfo.value.status = "fulfilled";
                  _ioInfo.value.value = debugValue;
                }
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now(), _ioInfo2.value.then(noop, noop), rejectDebugValue(error), _ioInfo2.value.status = "rejected", _ioInfo2.value.reason = error);
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function startTransition(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition.types = null !== prevTransition ? prevTransition.types : null;
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      }
      function addTransitionType(type) {
        var transition = ReactSharedInternals.T;
        if (null !== transition) {
          var transitionTypes = transition.types;
          null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
        } else
          0 === ReactSharedInternals.asyncTransitions && console.error(
            "addTransitionType can only be called inside a `startTransition()` callback. It must be associated with a specific Transition."
          ), startTransition(addTransitionType.bind(null, type));
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module2 && module2[requireString]).call(
              module2,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = /* @__PURE__ */ Symbol.for("react.view_transition"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports2.Activity = REACT_ACTIVITY_TYPE;
      exports2.Children = fnName;
      exports2.Component = Component;
      exports2.Fragment = REACT_FRAGMENT_TYPE;
      exports2.Profiler = REACT_PROFILER_TYPE;
      exports2.PureComponent = PureComponent;
      exports2.StrictMode = REACT_STRICT_MODE_TYPE;
      exports2.Suspense = REACT_SUSPENSE_TYPE;
      exports2.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
      exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports2.__COMPILER_RUNTIME = deprecatedAPIs;
      exports2.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports2.addTransitionType = addTransitionType;
      exports2.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports2.cacheSignal = function() {
        return null;
      };
      exports2.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports2.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          validateChildKeys(arguments[key]);
        return props;
      };
      exports2.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports2.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        var propName;
        i = {};
        var key = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        (propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++) ? (childArray = Error.stackTraceLimit, Error.stackTraceLimit = 10, childrenLength = Error("react-stack-top-frame"), Error.stackTraceLimit = childArray) : childrenLength = unknownOwnerDebugStack;
        return ReactElement(
          type,
          key,
          i,
          getOwner(),
          childrenLength,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports2.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports2.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports2.isValidElement = isValidElement;
      exports2.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports2.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports2.startTransition = startTransition;
      exports2.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports2.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports2.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports2.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports2.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports2.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports2.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports2.useEffect = function(create2, deps) {
        null == create2 && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create2, deps);
      };
      exports2.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports2.useId = function() {
        return resolveDispatcher().useId();
      };
      exports2.useImperativeHandle = function(ref, create2, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create2, deps);
      };
      exports2.useInsertionEffect = function(create2, deps) {
        null == create2 && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create2, deps);
      };
      exports2.useLayoutEffect = function(create2, deps) {
        null == create2 && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create2, deps);
      };
      exports2.useMemo = function(create2, deps) {
        return resolveDispatcher().useMemo(create2, deps);
      };
      exports2.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports2.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports2.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports2.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports2.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports2.version = "19.3.1";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
var core_exports = {};
__export(core_exports, {
  Channel: () => Channel,
  PluginListener: () => PluginListener,
  Resource: () => Resource,
  SERIALIZE_TO_IPC_FN: () => SERIALIZE_TO_IPC_FN,
  addPluginListener: () => addPluginListener,
  checkPermissions: () => checkPermissions,
  convertFileSrc: () => convertFileSrc,
  invoke: () => invoke,
  isTauri: () => isTauri,
  requestPermissions: () => requestPermissions,
  transformCallback: () => transformCallback
});
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
async function addPluginListener(plugin, event, cb) {
  const handler = new Channel(cb);
  try {
    await invoke(`plugin:${plugin}|register_listener`, {
      event,
      handler
    });
    return new PluginListener(plugin, event, handler.id);
  } catch {
    await invoke(`plugin:${plugin}|registerListener`, { event, handler });
    return new PluginListener(plugin, event, handler.id);
  }
}
async function checkPermissions(plugin) {
  return invoke(`plugin:${plugin}|check_permissions`);
}
async function requestPermissions(plugin) {
  return invoke(`plugin:${plugin}|request_permissions`);
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
function convertFileSrc(filePath, protocol = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
}
function isTauri() {
  return !!(globalThis || window).isTauri;
}
var _Channel_instances, _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Channel_deliver, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, PluginListener, Resource;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_instances.add(this);
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message2);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      /**
       * The handler called for every message sent by the Rust side of this channel.
       *
       * Assigning a new handler replaces the previous one; messages that arrived
       * before a handler was set are not replayed, so set it (or pass it to the
       * constructor) before sending the channel to the backend.
       */
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), _Channel_instances = /* @__PURE__ */ new WeakSet(), _Channel_deliver = function _Channel_deliver2(message) {
        try {
          __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }, SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PluginListener = class {
      constructor(plugin, event, channelId) {
        this.plugin = plugin;
        this.event = event;
        this.channelId = channelId;
      }
      /** Removes this listener from the plugin, so its handler stops being called. */
      async unregister() {
        return invoke(`plugin:${this.plugin}|remove_listener`, {
          event: this.event,
          channelId: this.channelId
        });
      }
    };
    Resource = class {
      get rid() {
        return __classPrivateFieldGet(this, _Resource_rid, "f");
      }
      constructor(rid) {
        _Resource_rid.set(this, void 0);
        __classPrivateFieldSet(this, _Resource_rid, rid, "f");
      }
      /**
       * Destroys and cleans up this resource from memory.
       * **You should not call any method on this object anymore and should drop any reference to it.**
       *
       * @remarks Uses the `core:resources:allow-close` permission, which is part of
       * the `core:resources:default` permission set enabled by default.
       */
      async close() {
        return invoke("plugin:resources|close", {
          rid: this.rid
        });
      }
      async [(_Resource_rid = /* @__PURE__ */ new WeakMap(), Symbol.asyncDispose)]() {
        await this.close();
      }
    };
  }
});

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  MAX_CONFLICT_STAGE_BYTES: () => MAX_CONFLICT_STAGE_BYTES,
  conflictBaseEn: () => conflictBaseEn,
  conflictBaseZh: () => conflictBaseZh,
  fetchStages: () => fetchStages,
  hasConflictMarkers: () => hasConflictMarkers,
  locateBlockSpans: () => locateBlockSpans,
  parseConflictBlocks: () => parseConflictBlocks,
  resolveAllBlocks: () => resolveAllBlocks,
  resolveSingleBlock: () => resolveSingleBlock,
  validateConflictFilePath: () => validateConflictFilePath
});
module.exports = __toCommonJS(stdin_exports);

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners2 = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners2.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners2.add(listener);
    return () => listeners2.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);

// node_modules/zustand/esm/react.mjs
var import_react = __toESM(require_react(), 1);
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = import_react.default.useSyncExternalStore(
    api.subscribe,
    import_react.default.useCallback(() => selector(api.getState()), [api, selector]),
    () => selector(api.getInitialState())
  );
  import_react.default.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = ((createState) => createState ? createImpl(createState) : createImpl);

// src/utils/cursorThemes.ts
var CURSOR_STYLES = [
  {
    "id": "ice-rounded",
    "name": "Ice Rounded",
    "arrow": "/cursors/ice-rounded/arrow.svg",
    "hand": "/cursors/ice-rounded/hand.svg",
    "hotspot": [
      4,
      3
    ],
    "handHotspot": [
      12,
      3
    ]
  },
  {
    "id": "bibata-modern-ice",
    "name": "Bibata Modern Ice",
    "arrow": "/cursors/bibata-modern-ice/arrow.svg",
    "hand": "/cursors/bibata-modern-ice/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "bibata-modern-classic",
    "name": "Bibata Modern Classic",
    "arrow": "/cursors/bibata-modern-classic/arrow.svg",
    "hand": "/cursors/bibata-modern-classic/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "bibata-modern-amber",
    "name": "Bibata Modern Amber",
    "arrow": "/cursors/bibata-modern-amber/arrow.svg",
    "hand": "/cursors/bibata-modern-amber/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "bibata-original-ice",
    "name": "Bibata Original Ice",
    "arrow": "/cursors/bibata-original-ice/arrow.svg",
    "hand": "/cursors/bibata-original-ice/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "phinger-light",
    "name": "Phinger Light",
    "arrow": "/cursors/phinger-light/arrow.svg",
    "hand": "/cursors/phinger-light/hand.svg",
    "hotspot": [
      1,
      1
    ],
    "handHotspot": [
      13,
      5
    ]
  },
  {
    "id": "phinger-dark",
    "name": "Phinger Dark",
    "arrow": "/cursors/phinger-dark/arrow.svg",
    "hand": "/cursors/phinger-dark/hand.svg",
    "hotspot": [
      1,
      1
    ],
    "handHotspot": [
      13,
      5
    ]
  },
  {
    "id": "whitesur",
    "name": "WhiteSur",
    "arrow": "/cursors/whitesur/arrow.svg",
    "hand": "/cursors/whitesur/hand.svg",
    "hotspot": [
      8,
      7
    ],
    "handHotspot": [
      17,
      11
    ]
  },
  {
    "id": "vimix",
    "name": "Vimix",
    "arrow": "/cursors/vimix/arrow.svg",
    "hand": "/cursors/vimix/hand.svg",
    "hotspot": [
      8,
      7
    ],
    "handHotspot": [
      17,
      11
    ]
  },
  {
    "id": "nordzy-nordic",
    "name": "Nordzy Nordic",
    "arrow": "/cursors/nordzy-nordic/arrow.png",
    "hand": "/cursors/nordzy-nordic/hand.png",
    "hotspot": [
      3,
      2
    ],
    "handHotspot": [
      9,
      3
    ]
  },
  {
    "id": "nordzy-mocha-mauve",
    "name": "Nordzy Mocha Mauve",
    "arrow": "/cursors/nordzy-mocha-mauve/arrow.png",
    "hand": "/cursors/nordzy-mocha-mauve/hand.png",
    "hotspot": [
      3,
      2
    ],
    "handHotspot": [
      9,
      3
    ]
  },
  {
    "id": "nordzy-mocha-teal",
    "name": "Nordzy Mocha Teal",
    "arrow": "/cursors/nordzy-mocha-teal/arrow.png",
    "hand": "/cursors/nordzy-mocha-teal/hand.png",
    "hotspot": [
      3,
      2
    ],
    "handHotspot": [
      9,
      3
    ]
  },
  {
    "id": "google-dot-blue",
    "name": "GoogleDot Blue",
    "arrow": "/cursors/google-dot-blue/arrow.png",
    "hand": "/cursors/google-dot-blue/hand.png",
    "hotspot": [
      16,
      16
    ],
    "handHotspot": [
      16,
      16
    ]
  },
  {
    "id": "google-dot-white",
    "name": "GoogleDot White",
    "arrow": "/cursors/google-dot-white/arrow.png",
    "hand": "/cursors/google-dot-white/hand.png",
    "hotspot": [
      16,
      16
    ],
    "handHotspot": [
      16,
      16
    ]
  }
];
function normalizeCursorTheme(value) {
  return CURSOR_STYLES.some((style) => style.id === value) ? value : "system";
}
function getCursorStyle(id) {
  return CURSOR_STYLES.find((style) => style.id === id);
}
function applyCursorTheme(id) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const style = getCursorStyle(id);
  if (style) {
    root.style.setProperty("--app-cursor-default", `url("${style.arrow}") ${style.hotspot.join(" ")}, default`);
    root.style.setProperty("--app-cursor-pointer", `url("${style.hand}") ${style.handHotspot.join(" ")}, pointer`);
  } else {
    root.style.removeProperty("--app-cursor-default");
    root.style.removeProperty("--app-cursor-pointer");
  }
  root.dataset.cursorTheme = style?.id || "system";
}

// src/services/git/invokeError.ts
function normalizeInvokeError(error, fallback) {
  if (error instanceof Error && error.message) return error;
  return new Error(describeInvokeError(error) || fallback);
}
function describeInvokeError(error) {
  if (typeof error === "string") return error.trim();
  if (error && typeof error === "object") {
    const candidate = error;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
    if (typeof candidate.code === "string" && candidate.code.trim()) return candidate.code;
    try {
      return JSON.stringify(error) ?? "";
    } catch {
      return "";
    }
  }
  if (error === void 0 || error === null) return "";
  return String(error);
}

// src/services/tools/ExternalToolService.ts
var TOOL_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
var TOOL_PLACEHOLDERS = ["$LOCAL", "$REMOTE", "$BASE", "$MERGED"];
var isDesktopRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
function containsForbiddenCharacters(value) {
  if (/["';]/.test(value)) return true;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function validateExternalToolDraft(draft) {
  if (!draft.name.trim()) return "Tool name is required";
  if (!TOOL_IDENTIFIER_PATTERN.test(draft.name.trim())) {
    return 'Tool name must be 1-32 characters of letters, digits, "_" or "-"';
  }
  if (draft.mode !== "diff" && draft.mode !== "merge") return "Tool type must be diff or merge";
  if (!draft.program.trim()) return "Program path is required";
  if (!draft.args.trim()) return "Arguments template is required";
  if (containsForbiddenCharacters(draft.args)) {
    return "Arguments template cannot contain quotes, semicolons or control characters";
  }
  for (const placeholder of TOOL_PLACEHOLDERS) {
    const present = draft.args.includes(placeholder);
    if (draft.mode === "diff" && (placeholder === "$BASE" || placeholder === "$MERGED") && present) {
      return `Diff template cannot use ${placeholder}`;
    }
  }
  if (draft.mode === "diff" && (!draft.args.includes("$LOCAL") || !draft.args.includes("$REMOTE"))) {
    return "Diff template must contain $LOCAL and $REMOTE";
  }
  if (draft.mode === "merge" && !draft.args.includes("$MERGED")) {
    return "Merge template must contain $MERGED";
  }
  return null;
}
function requireDesktop() {
  if (!isDesktopRuntime()) {
    throw new Error("External tools are only available in the desktop app");
  }
}
async function invokeCommand(command, args, fallback = "External tool command failed") {
  requireDesktop();
  const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
  try {
    return await invoke2(command, args);
  } catch (error) {
    throw normalizeInvokeError(error, fallback);
  }
}
var externalToolService = {
  /** 读取后端配置镜像（排序后的完整列表）。 */
  list() {
    return invokeCommand("get_external_tools", void 0, "Unable to load external tools");
  },
  /** 新增或按 id 覆盖保存，返回后端排序后的完整列表。 */
  save(tool) {
    const error = validateExternalToolDraft(tool);
    if (error) return Promise.reject(new Error(error));
    return invokeCommand("set_external_tool", { tool }, "Unable to save external tool");
  },
  /** 按 id 删除，返回后端排序后的完整列表。 */
  remove(toolId) {
    return invokeCommand("remove_external_tool", { toolId }, "Unable to remove external tool");
  },
  /**
   * 用已登记的外部工具打开文件。mode 决定后端语义：
   * diff = working 文件 vs HEAD 版本；merge = index 三阶段（ours/base/theirs + working）。
   */
  launch(toolId, mode, repoPath, filePath) {
    return invokeCommand("launch_external_tool", { toolId, mode, repoPath, filePath }, "Unable to launch external tool");
  }
};

// src/i18n/index.ts
var import_react2 = __toESM(require_react(), 1);

// src/i18n/uiReview.ts
var uiReviewZh = {
  "ui.advanced": "\u9AD8\u7EA7\u9009\u9879",
  "ui.clearSearch": "\u6E05\u7A7A\u641C\u7D22",
  "ui.pr.loading": "\u6B63\u5728\u52A0\u8F7D\u62C9\u53D6\u8BF7\u6C42\u2026",
  "ui.pr.empty": "\u5F53\u524D\u6CA1\u6709\u62C9\u53D6\u8BF7\u6C42",
  "ui.pr.emptyDesc": "\u53EF\u4EE5\u5207\u6362\u72B6\u6001\u7B5B\u9009\uFF0C\u6216\u521B\u5EFA\u65B0\u7684\u62C9\u53D6\u8BF7\u6C42\u3002",
  "ui.pr.noRepository": "\u8BF7\u5148\u6253\u5F00\u5E76\u5173\u8054 GitHub \u4ED3\u5E93",
  "ui.pr.failed": "\u65E0\u6CD5\u52A0\u8F7D\u62C9\u53D6\u8BF7\u6C42",
  "ui.pr.refreshing": "\u6B63\u5728\u5237\u65B0\u2026",
  "ui.actions.queued": "\u6392\u961F\u4E2D",
  "ui.actions.waiting": "\u7B49\u5F85\u5904\u7406",
  "ui.actions.cancelled": "\u5DF2\u53D6\u6D88",
  "ui.actions.skipped": "\u5DF2\u8DF3\u8FC7",
  "ui.actions.neutral": "\u4E2D\u6027\u7ED3\u679C",
  "ui.actions.unknown": "\u7ED3\u679C\u672A\u77E5",
  "ui.actions.timedOut": "\u6267\u884C\u8D85\u65F6",
  "ui.actions.empty": "\u5F53\u524D\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55",
  "ui.actions.loading": "\u6B63\u5728\u52A0\u8F7D\u5DE5\u4F5C\u6D41\u2026",
  "ui.actions.jobsLoading": "\u6B63\u5728\u52A0\u8F7D\u4EFB\u52A1\u2026",
  "ui.inspector.label": "\u63D0\u4EA4\u9762\u677F\u663E\u793A\u65B9\u5F0F",
  "ui.inspector.auto": "\u81EA\u52A8\u9002\u5E94\u7A97\u53E3",
  "ui.inspector.inline": "\u5E76\u6392\u663E\u793A",
  "ui.inspector.drawer": "\u62BD\u5C49\u663E\u793A",
  "ui.inspector.desc": "\u5E76\u6392\u663E\u793A\u53EF\u540C\u65F6\u68C0\u67E5\u5DEE\u5F02\u548C\u586B\u5199\u63D0\u4EA4\u8BF4\u660E\uFF1B\u7A84\u7A97\u53E3\u4E0B\u53EF\u6536\u8D77\u5BFC\u822A\u4EE5\u817E\u51FA\u7A7A\u95F4\u3002",
  "ui.error.details": "\u6280\u672F\u8BE6\u60C5",
  "ui.error.generic": "\u64CD\u4F5C\u672A\u5B8C\u6210",
  "ui.error.genericHint": "\u8BF7\u67E5\u770B\u6280\u672F\u8BE6\u60C5\uFF0C\u5904\u7406\u540E\u518D\u91CD\u8BD5\u3002",
  "ui.error.git": "\u627E\u4E0D\u5230 Git \u6267\u884C\u7A0B\u5E8F",
  "ui.error.gitHint": "\u8BF7\u786E\u8BA4\u5DF2\u5B89\u88C5 Git\uFF0C\u5E76\u5728 Git \u8BBE\u7F6E\u4E2D\u68C0\u67E5\u6267\u884C\u7A0B\u5E8F\u8DEF\u5F84\u3002",
  "ui.error.directory": "\u4ED3\u5E93\u76EE\u5F55\u4E0D\u53EF\u7528",
  "ui.error.directoryHint": "\u8BF7\u786E\u8BA4\u76EE\u5F55\u4ECD\u7136\u5B58\u5728\u4E14\u53EF\u8BBF\u95EE\uFF0C\u7136\u540E\u91CD\u65B0\u6253\u5F00\u4ED3\u5E93\u3002",
  "ui.error.auth": "\u8FDC\u7A0B\u4ED3\u5E93\u8BA4\u8BC1\u6216\u6743\u9650\u4E0D\u8DB3",
  "ui.error.authHint": "\u8BF7\u68C0\u67E5\u8FDC\u7A0B\u5730\u5740\u53CA Git \u51ED\u636E\uFF1BGitHub API \u64CD\u4F5C\u8FD8\u9700\u8981\u6709\u6548\u7684\u8D26\u53F7\u51ED\u636E\u3002",
  "ui.error.rejected": "\u8FDC\u7A0B\u5206\u652F\u5305\u542B\u5C1A\u672A\u540C\u6B65\u7684\u63D0\u4EA4",
  "ui.error.rejectedHint": "\u8BF7\u5148\u83B7\u53D6\u66F4\u65B0\u5E76\u68C0\u67E5\u8FDC\u7A0B\u5DEE\u5F02\uFF0C\u6574\u5408\u63D0\u4EA4\u540E\u518D\u63A8\u9001\u3002",
  "ui.error.conflict": "\u9700\u8981\u5148\u89E3\u51B3\u5408\u5E76\u51B2\u7A81",
  "ui.error.conflictHint": "\u8BF7\u5728\u5DE5\u4F5C\u533A\u67E5\u770B\u51B2\u7A81\u6587\u4EF6\uFF0C\u89E3\u51B3\u5E76\u6682\u5B58\u540E\u7EE7\u7EED\u3002",
  "ui.error.network": "\u6682\u65F6\u65E0\u6CD5\u8FDE\u63A5\u8FDC\u7A0B\u670D\u52A1",
  "ui.error.networkHint": "\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u4EE3\u7406\u6216\u670D\u52A1\u72B6\u6001\uFF0C\u7136\u540E\u91CD\u8BD5\u3002",
  "ui.error.lock": "\u4ED3\u5E93\u6B63\u88AB\u5176\u4ED6 Git \u64CD\u4F5C\u5360\u7528",
  "ui.error.lockHint": "\u8BF7\u7B49\u5F85\u5176\u4ED6\u64CD\u4F5C\u5B8C\u6210\u540E\u91CD\u8BD5\uFF1B\u82E5\u6301\u7EED\u51FA\u73B0\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u5B58\u5728\u9057\u7559\u7684\u9501\u6587\u4EF6\u3002",
  "ui.error.gitSettings": "\u6253\u5F00 Git \u8BBE\u7F6E",
  "ui.remotes.refresh": "\u5237\u65B0\u8FDC\u7A0B\u4ED3\u5E93\u5217\u8868"
};
var uiReviewEn = {
  "ui.advanced": "Advanced options",
  "ui.clearSearch": "Clear search",
  "ui.pr.loading": "Loading pull requests\u2026",
  "ui.pr.empty": "No pull requests yet",
  "ui.pr.emptyDesc": "Try another status filter or create a pull request.",
  "ui.pr.noRepository": "Open a repository linked to GitHub first",
  "ui.pr.failed": "Unable to load pull requests",
  "ui.pr.refreshing": "Refreshing\u2026",
  "ui.actions.queued": "Queued",
  "ui.actions.waiting": "Waiting for action",
  "ui.actions.cancelled": "Cancelled",
  "ui.actions.skipped": "Skipped",
  "ui.actions.neutral": "Neutral",
  "ui.actions.unknown": "Unknown result",
  "ui.actions.timedOut": "Timed out",
  "ui.actions.empty": "No workflow runs yet",
  "ui.actions.loading": "Loading workflows\u2026",
  "ui.actions.jobsLoading": "Loading jobs\u2026",
  "ui.inspector.label": "Commit panel presentation",
  "ui.inspector.auto": "Adapt to window",
  "ui.inspector.inline": "Side by side",
  "ui.inspector.drawer": "Drawer",
  "ui.inspector.desc": "Work side by side to review changes while writing a commit. Collapse navigation for more space in narrow windows.",
  "ui.error.details": "Technical details",
  "ui.error.generic": "The operation could not finish",
  "ui.error.genericHint": "Check the technical details, resolve the issue and retry.",
  "ui.error.git": "Git executable was not found",
  "ui.error.gitHint": "Install Git and check the executable path in Git settings.",
  "ui.error.directory": "Repository directory is unavailable",
  "ui.error.directoryHint": "Check that the directory still exists and is accessible, then reopen it.",
  "ui.error.auth": "Remote authentication or permission was denied",
  "ui.error.authHint": "Check the remote URL and Git credentials. GitHub API operations also need valid account credentials.",
  "ui.error.rejected": "The remote branch has commits that are not synchronized",
  "ui.error.rejectedHint": "Fetch updates, review the remote changes and integrate commits before pushing again.",
  "ui.error.conflict": "Merge conflicts need to be resolved",
  "ui.error.conflictHint": "Review the conflicted files in the workspace, resolve and stage them before continuing.",
  "ui.error.network": "The remote service could not be reached",
  "ui.error.networkHint": "Check your network, proxy or service status, then retry.",
  "ui.error.lock": "Another Git operation is using this repository",
  "ui.error.lockHint": "Wait for the other operation to finish. If this persists, check for a stale lock file.",
  "ui.error.gitSettings": "Open Git settings",
  "ui.remotes.refresh": "Refresh remote repositories"
};

// src/i18n/commitBatch.ts
var commitBatchZh = {
  "recovery.op.ai-commits": "AI \u6279\u91CF\u63D0\u4EA4\u524D",
  "batch.button": "AI \u89C4\u5212\u5168\u90E8\u53D8\u66F4",
  "batch.title": "AI \u63D0\u4EA4\u89C4\u5212",
  "batch.scope": "\u5206\u6790\u5168\u90E8\u5DF2\u6682\u5B58\u3001\u672A\u6682\u5B58\u548C\u65B0\u6587\u4EF6\u3002\u6309\u5B8C\u6574\u6587\u4EF6\u62C6\u5206\uFF1B\u90E8\u5206\u6682\u5B58\u6587\u4EF6\u5C06\u4F7F\u7528\u5F53\u524D\u5DE5\u4F5C\u533A\u7248\u672C\u3002\u5DF2\u6709\u63D0\u4EA4\u8349\u7A3F\u4F1A\u4FDD\u7559\u3002",
  "batch.noAmend": "\u8BF7\u5148\u5173\u95ED\u201C\u4FEE\u6539\u4E0A\u4E00\u6B21\u63D0\u4EA4\u201D\uFF0C\u518D\u89C4\u5212\u65B0\u7684\u63D0\u4EA4\u3002",
  "batch.collecting": "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u53D8\u66F4\u2026",
  "batch.analyzing": "AI \u6B63\u5728\u5206\u6790\u5206\u7EC4\u3001\u987A\u5E8F\u548C\u63D0\u4EA4\u8BF4\u660E\u2026",
  "batch.waiting": "\u7B49\u5F85\u5F53\u524D\u4ED3\u5E93\u64CD\u4F5C\u5B8C\u6210\u2026",
  "batch.checking": "\u6B63\u5728\u786E\u8BA4\u53D8\u66F4\u5185\u5BB9\u662F\u5426\u4E00\u81F4\u2026",
  "batch.fileProgress": "\u5DF2\u8BFB\u53D6\u6587\u4EF6",
  "batch.collectDuration": "\u8BFB\u53D6\u53D8\u66F4 {seconds}s",
  "batch.aiDuration": "AI \u5206\u6790 {seconds}s",
  "batch.waitingAi": "\u6B63\u5728\u7B49\u5F85\u6A21\u578B\u8FD4\u56DE\u5B8C\u6574\u65B9\u6848\uFF0C\u53EF\u968F\u65F6\u53D6\u6D88\u3002",
  "batch.analysisTimeout": "AI \u5206\u6790\u8D85\u8FC7 60 \u79D2\uFF0C\u8BF7\u91CD\u8BD5\u6216\u9009\u62E9\u54CD\u5E94\u66F4\u5FEB\u7684\u6A21\u578B\u3002\u4ED3\u5E93\u5C1A\u672A\u4FEE\u6539\u3002",
  "batch.provider": "\u4F7F\u7528\u5DF2\u914D\u7F6E\u7684 AI\uFF1A",
  "batch.context": "\u67E5\u770B\u53D1\u9001\u7ED9 AI \u7684\u53D8\u66F4\u6458\u5F55",
  "batch.configure": "\u8BF7\u5148\u914D\u7F6E AI \u63A5\u53E3\u548C\u6A21\u578B\uFF0C\u518D\u5206\u6790\u63D0\u4EA4\u8BA1\u5212\u3002",
  "batch.analyze": "\u5F00\u59CB AI \u5206\u6790",
  "batch.analysisFailed": "AI \u5206\u6790\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5 AI \u63A5\u53E3\u3001\u6A21\u578B\u6216\u51ED\u636E\u540E\u91CD\u8BD5\u3002\u4ED3\u5E93\u5C1A\u672A\u4FEE\u6539\u3002",
  "batch.retry": "\u91CD\u65B0\u5206\u6790\u5F53\u524D\u53D8\u66F4",
  "batch.cancelAnalysis": "\u53D6\u6D88\u5206\u6790",
  "batch.cancelled": "\u5206\u6790\u5DF2\u53D6\u6D88\uFF0C\u5C1A\u672A\u4FEE\u6539\u4ED3\u5E93\u3002",
  "batch.preview": "\u5EFA\u8BAE\u521B\u5EFA {n} \u4E2A\u63D0\u4EA4\uFF0C\u5305\u542B {files} \u4E2A\u6587\u4EF6\u3002\u8BF7\u68C0\u67E5\u5206\u7EC4\u3001\u987A\u5E8F\u548C\u8BF4\u660E\uFF0C\u786E\u8BA4\u540E\u6267\u884C\u3002",
  "batch.truncated": "\u90E8\u5206\u5DEE\u5F02\u8F83\u957F\uFF0C\u4EC5\u53D1\u9001\u4E86\u6458\u5F55\uFF1B\u8BF7\u7ED3\u5408\u5B8C\u6574\u5DEE\u5F02\u68C0\u67E5 AI \u7684\u5224\u65AD\u3002",
  "batch.skipped": "\u4EE5\u4E0B\u6587\u4EF6\u7684\u6682\u5B58\u4E0E\u672A\u6682\u5B58\u4FEE\u6539\u4E92\u76F8\u62B5\u6D88\uFF0C\u4E0E HEAD \u76F8\u540C\uFF0C\u5C06\u4FDD\u7559\u5176\u6682\u5B58\u72B6\u6001\uFF1A",
  "batch.add": "\u6DFB\u52A0\u63D0\u4EA4\u5206\u7EC4",
  "batch.newTitle": "chore: \u66F4\u65B0\u76F8\u5173\u6587\u4EF6",
  "batch.reason": "\u5206\u7EC4\u4F9D\u636E",
  "batch.subject": "\u63D0\u4EA4\u6807\u9898",
  "batch.body": "\u63D0\u4EA4\u8BF4\u660E",
  "batch.move": "\u79FB\u52A8\u6587\u4EF6\u5230\u63D0\u4EA4\u5206\u7EC4",
  "batch.files": "\u4E2A\u6587\u4EF6",
  "batch.up": "\u5411\u524D\u79FB\u52A8\u6B64\u63D0\u4EA4",
  "batch.down": "\u5411\u540E\u79FB\u52A8\u6B64\u63D0\u4EA4",
  "batch.merge": "\u5408\u5E76\u5230\u4E0A\u4E00\u7EC4",
  "batch.remove": "\u79FB\u9664\u7A7A\u5206\u7EC4",
  "batch.empty": "\u8BF7\u4E3A\u6BCF\u7EC4\u5206\u914D\u6587\u4EF6\u5E76\u586B\u5199\u6709\u6548\u6807\u9898\uFF1B\u540C\u4E00\u6587\u4EF6\u53EA\u80FD\u5C5E\u4E8E\u4E00\u4E2A\u63D0\u4EA4\u3002",
  "batch.confirm": "\u786E\u8BA4\u521B\u5EFA {n} \u4E2A\u63D0\u4EA4",
  "batch.confirmPush": "\u521B\u5EFA\u63D0\u4EA4\u5E76\u63A8\u9001\u2026",
  "batch.committing": "\u6B63\u5728\u6267\u884C\u63D0\u4EA4 {n} / {total}\u2026",
  "batch.choosing": "\u8BF7\u9009\u62E9\u63A8\u9001\u76EE\u6807\uFF0C\u53D6\u6D88\u540E\u4E0D\u4F1A\u521B\u5EFA\u63D0\u4EA4\u3002",
  "batch.hookHint": "\u6BCF\u4E2A\u63D0\u4EA4\u90FD\u4F1A\u6267\u884C\u4ED3\u5E93\u914D\u7F6E\u7684\u68C0\u67E5\u548C\u7B7E\u540D\uFF0C\u53EF\u80FD\u91CD\u590D\u8FD0\u884C\u5168\u9879\u76EE\u68C0\u67E5\u3002\u5168\u90E8\u63D0\u4EA4\u6210\u529F\u540E\u53EA\u63A8\u9001\u4E00\u6B21\u3002",
  "batch.complete": "\u5DF2\u521B\u5EFA {n} \u4E2A\u63D0\u4EA4\u3002",
  "batch.stopped": "\u6267\u884C\u5DF2\u505C\u6B62\uFF0C\u5DF2\u5B8C\u6210 {n} \u4E2A\u63D0\u4EA4\u3002\u8BF7\u68C0\u67E5\u7ED3\u679C\u540E\u91CD\u65B0\u5206\u6790\u5269\u4F59\u53D8\u66F4\u3002",
  "batch.recovery": "\u5DF2\u4FDD\u7559\u64CD\u4F5C\u524D\u7684\u6062\u590D\u70B9\uFF0C\u53EF\u4ECE\u201C\u4ED3\u5E93\u5DE5\u5177 \u2192 \u6062\u590D\u4E2D\u5FC3\u201D\u67E5\u770B\u3002",
  "batch.indexError": "\u6682\u5B58\u72B6\u6001\u672A\u80FD\u6062\u590D\uFF0C\u8BF7\u5148\u68C0\u67E5\u6682\u5B58\u533A\u548C\u63D0\u4EA4\u5386\u53F2\uFF1A",
  "batch.pushing": "\u63D0\u4EA4\u5DF2\u5B8C\u6210\uFF0C\u6B63\u5728\u63A8\u9001\u2026",
  "batch.pushed": "\u5168\u90E8\u63D0\u4EA4\u5DF2\u63A8\u9001\u3002",
  "batch.pushFailed": "\u63D0\u4EA4\u5DF2\u5B8C\u6210\uFF0C\u4F46\u63A8\u9001\u5931\u8D25\u3002\u91CD\u8BD5\u53EA\u4F1A\u63A8\u9001\uFF0C\u4E0D\u4F1A\u91CD\u590D\u521B\u5EFA\u63D0\u4EA4\u3002",
  "batch.retryPush": "\u91CD\u8BD5\u63A8\u9001",
  "batch.pushTarget": "\u63A8\u9001\u76EE\u6807\uFF1A",
  "batch.invalid": "\u63D0\u4EA4\u8BA1\u5212\u65E0\u6548\uFF1A\u5206\u7EC4\u5FC5\u987B\u5B8C\u6574\u8986\u76D6\u53D8\u66F4\u6587\u4EF6\uFF0C\u4E0D\u80FD\u9057\u6F0F\u6216\u91CD\u590D\uFF0C\u6807\u9898\u4E0D\u80FD\u8D85\u8FC7 120 \u5B57\u7B26\u3002",
  "batch.stale": "\u4ED3\u5E93\u3001\u5206\u652F\u3001\u6682\u5B58\u533A\u6216\u6587\u4EF6\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u5206\u6790\u5F53\u524D\u53D8\u66F4\u3002",
  "batch.localBranch": "\u8BF7\u5148\u5207\u6362\u5230\u672C\u5730\u5206\u652F\uFF0C\u518D\u89C4\u5212\u63D0\u4EA4\u3002",
  "batch.tooMany": "\u53D8\u66F4\u6587\u4EF6\u8FC7\u591A\uFF0C\u8BF7\u5148\u7F29\u5C0F\u53D8\u66F4\u8303\u56F4\uFF0C\u518D\u8FDB\u884C AI \u63D0\u4EA4\u89C4\u5212\u3002",
  "batch.renameOverlap": "\u68C0\u6D4B\u5230\u91CD\u547D\u540D\u4E0E\u540C\u540D\u6587\u4EF6\u7684\u4EA4\u53E0\uFF0C\u8BF7\u5148\u6574\u7406\u8FD9\u4E9B\u6587\u4EF6\uFF0C\u518D\u89C4\u5212\u63D0\u4EA4\u3002",
  "batch.submodule": "\u5F53\u524D\u53D8\u66F4\u5305\u542B\u5B50\u6A21\u5757\uFF0C\u6682\u4E0D\u652F\u6301\u6279\u91CF\u89C4\u5212\uFF0C\u8BF7\u5148\u5355\u72EC\u5904\u7406\u5B50\u6A21\u5757\u53D8\u66F4\u3002",
  "batch.noNetChanges": "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0E HEAD \u6CA1\u6709\u5B9E\u9645\u5DEE\u5F02\uFF0C\u65E0\u6CD5\u521B\u5EFA\u63D0\u4EA4\uFF1B\u5DF2\u6709\u6682\u5B58\u72B6\u6001\u4FDD\u6301\u4E0D\u53D8\u3002",
  "batch.headChanged": "HEAD \u5728\u6267\u884C\u8FC7\u7A0B\u4E2D\u5DF2\u53D8\u5316\uFF0C\u53EF\u80FD\u5DF2\u751F\u6210\u63D0\u4EA4\uFF0C\u8BF7\u5148\u68C0\u67E5\u63D0\u4EA4\u5386\u53F2\u3002"
};
var commitBatchEn = {
  "recovery.op.ai-commits": "Before AI batch commits",
  "batch.button": "AI plan all changes",
  "batch.title": "AI commit plan",
  "batch.scope": "Analyze staged, unstaged and new files. Split by whole files; partially staged files use the current working copy. Your existing commit draft is preserved.",
  "batch.noAmend": "Turn off Amend before planning new commits.",
  "batch.collecting": "Reading working changes\u2026",
  "batch.analyzing": "AI is planning groups, order and commit messages\u2026",
  "batch.waiting": "Waiting for repository operations to finish\u2026",
  "batch.checking": "Checking that the changes are still consistent\u2026",
  "batch.fileProgress": "Files read",
  "batch.collectDuration": "Read changes {seconds}s",
  "batch.aiDuration": "AI analysis {seconds}s",
  "batch.waitingAi": "Waiting for the model to return the complete plan. You can cancel at any time.",
  "batch.analysisTimeout": "AI analysis exceeded 60 seconds. Retry or choose a faster model. The repository has not been changed.",
  "batch.provider": "Configured AI: ",
  "batch.context": "Review the excerpts sent to AI",
  "batch.configure": "Configure an AI endpoint and model before analyzing the commit plan.",
  "batch.analyze": "Analyze with AI",
  "batch.analysisFailed": "AI analysis could not finish. Check the AI endpoint, model or credentials and retry. The repository has not been changed.",
  "batch.retry": "Reanalyze current changes",
  "batch.cancelAnalysis": "Cancel analysis",
  "batch.cancelled": "Analysis cancelled. The repository has not been changed.",
  "batch.preview": "Proposed: {n} commits covering {files} files. Review groups, order and messages before proceeding.",
  "batch.truncated": "Long diffs were excerpted. Review the full changes when checking the AI plan.",
  "batch.skipped": "These staged and unstaged changes cancel out relative to HEAD; their staging will be preserved:",
  "batch.add": "Add a commit group",
  "batch.newTitle": "chore: update related files",
  "batch.reason": "Grouping rationale",
  "batch.subject": "Commit title",
  "batch.body": "Commit description",
  "batch.move": "Move file to commit group",
  "batch.files": "files",
  "batch.up": "Move this commit earlier",
  "batch.down": "Move this commit later",
  "batch.merge": "Merge into previous group",
  "batch.remove": "Remove empty group",
  "batch.empty": "Each group needs files and a valid title. Each file must belong to exactly one commit.",
  "batch.confirm": "Confirm {n} commits",
  "batch.confirmPush": "Create commits and push\u2026",
  "batch.committing": "Creating commit {n} / {total}\u2026",
  "batch.choosing": "Select the push destination. Cancelling creates no commits.",
  "batch.hookHint": "Each commit runs the repository\u2019s configured checks and signing, which may repeat full-project checks. Push runs once after all commits succeed.",
  "batch.complete": "Created {n} commits.",
  "batch.stopped": "Stopped after {n} commits. Review the result, then reanalyze the remaining changes.",
  "batch.recovery": "A recovery point was saved before the operation. Find it in Repository tools \u2192 Recovery.",
  "batch.indexError": "Staging could not be restored. Check the index and commit history first:",
  "batch.pushing": "Commits created. Pushing\u2026",
  "batch.pushed": "All commits were pushed.",
  "batch.pushFailed": "Commits were created, but the push failed. Retrying only pushes; it does not create commits again.",
  "batch.retryPush": "Retry push",
  "batch.pushTarget": "Push destination: ",
  "batch.invalid": "Invalid plan: cover all changed files exactly once, with nonempty groups and titles of at most 120 characters.",
  "batch.stale": "The repository, branch, index or files changed. Reanalyze the current changes.",
  "batch.localBranch": "Switch to a local branch before planning commits.",
  "batch.tooMany": "There are too many changed files. Narrow the scope before planning commits with AI.",
  "batch.renameOverlap": "A rename overlaps another file path. Resolve these files before planning commits.",
  "batch.submodule": "Changed submodules are not supported in batch plans yet. Handle the submodule changes separately first.",
  "batch.noNetChanges": "The working copy matches HEAD, so there is nothing to commit. Existing staging is preserved.",
  "batch.headChanged": "HEAD changed during execution and a commit may have been created. Check commit history before continuing."
};

// src/i18n/remote.ts
var remoteZh = {
  "remote.title": "\u63A8\u9001\u5230\u8FDC\u7A0B",
  "remote.choose": "\u8BF7\u9009\u62E9\u76EE\u6807\u8FDC\u7A0B\u4ED3\u5E93",
  "remote.chooseDestination": "\u9009\u62E9\u63A8\u9001\u76EE\u6807\u2026",
  "remote.invalid": "\u8FDC\u7A0B\u4ED3\u5E93\u4E0D\u5B58\u5728\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  "remote.detached": "\u8BF7\u5148\u5207\u6362\u5230\u672C\u5730\u5206\u652F\u518D\u63A8\u9001\u3002",
  "remote.source": "\u672C\u5730\u5206\u652F",
  "remote.destination": "\u76EE\u6807\u8FDC\u7A0B\u4ED3\u5E93",
  "remote.targetBranch": "\u76EE\u6807\u5206\u652F",
  "remote.upstream": "\u8DDF\u8E2A\u5206\u652F",
  "remote.noUpstream": "\u672A\u8BBE\u7F6E",
  "remote.setUpstream": "\u5C06\u76EE\u6807\u8BBE\u4E3A\u6B64\u672C\u5730\u5206\u652F\u7684\u8DDF\u8E2A\u5206\u652F\uFF08\u5F71\u54CD\u540E\u7EED\u62C9\u53D6\uFF09",
  "remote.remember": "\u8BB0\u4E3A\u6B64\u5206\u652F\u7684\u9ED8\u8BA4\u63A8\u9001\u8FDC\u7A0B",
  "remote.saveOptionsHint": "\u9009\u9879\u5728\u63A8\u9001\u6210\u529F\u540E\u4FDD\u5B58\u3002\u53D6\u6D88\u52FE\u9009\u5F53\u524D\u76EE\u6807\u53EF\u6E05\u9664\u5BF9\u5E94\u8BBE\u7F6E\uFF1B\u4E0D\u4F1A\u6E05\u9664\u5176\u4ED6\u76EE\u6807\u7684\u8BBE\u7F6E\u3002",
  "remote.push": "\u63A8\u9001",
  "remote.cancel": "\u53D6\u6D88",
  "remote.loading": "\u6B63\u5728\u8BFB\u53D6\u8FDC\u7A0B\u914D\u7F6E\u2026",
  "remote.loadFailed": "\u65E0\u6CD5\u8BFB\u53D6\u8FDC\u7A0B\u914D\u7F6E",
  "remote.retry": "\u91CD\u8BD5",
  "remote.empty": "\u5C1A\u672A\u914D\u7F6E\u8FDC\u7A0B\u4ED3\u5E93\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u6DFB\u52A0\u3002",
  "remote.select": "\u9009\u62E9\u8FDC\u7A0B\u4ED3\u5E93\u2026",
  "remote.summary": "\u63A8\u9001\u65B9\u5411",
  "remote.force": "\u4F7F\u7528\u5B89\u5168\u5F3A\u5236\u63A8\u9001\uFF1B\u8FD9\u4F1A\u6539\u5199\u76EE\u6807\u5206\u652F\u5386\u53F2\u3002",
  "remote.deleteBranch": "\u5220\u9664\u8FDC\u7A0B\u5206\u652F\u2026",
  "remote.deleteWarning": "\u5C06\u4ECE\u4E0B\u9762\u7684\u8FDC\u7A0B\u4ED3\u5E93\u5220\u9664\u6B64\u5206\u652F\u3002\u672C\u5730\u5206\u652F\u4F1A\u4FDD\u7559\uFF1B\u670D\u52A1\u5668\u7684\u5206\u652F\u4FDD\u62A4\u4ECD\u7136\u751F\u6548\u3002",
  "remote.deleted": "\u8FDC\u7A0B\u5206\u652F\u5DF2\u5220\u9664",
  "remote.deleteFailed": "\u5220\u9664\u8FDC\u7A0B\u5206\u652F\u5931\u8D25",
  "remote.prune": "\u83B7\u53D6\u5E76\u6E05\u7406\u5931\u6548\u8FDC\u7A0B\u5F15\u7528",
  "remote.pruneDone": "\u5DF2\u83B7\u53D6\u5E76\u6E05\u7406\u5931\u6548\u8FDC\u7A0B\u5F15\u7528",
  "remote.checkoutConflict": "\u672C\u5730\u5206\u652F {branch} \u672A\u8DDF\u8E2A {remote}\u3002\u8BF7\u5148\u9009\u62E9\u5176\u4ED6\u672C\u5730\u5206\u652F\u540D\u79F0\uFF0C\u6216\u8C03\u6574\u8DDF\u8E2A\u5173\u7CFB\u540E\u518D\u68C0\u51FA\u3002",
  "remote.changed": "\u4ED3\u5E93\u6216\u5F53\u524D\u5206\u652F\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u64CD\u4F5C\u3002",
  "remote.tags": "\u5168\u90E8\u672C\u5730\u6807\u7B7E",
  "remote.tag": "\u6807\u7B7E",
  "remote.deleteTag": "\u5220\u9664\u8FDC\u7A0B\u6807\u7B7E",
  "remote.deleteTagWarning": "\u5C06\u4ECE\u6240\u9009\u8FDC\u7A0B\u4ED3\u5E93\u5220\u9664\u6B64\u6807\u7B7E\uFF0C\u672C\u5730\u6807\u7B7E\u4FDD\u7559\u3002",
  "remote.other": "\u9009\u62E9\u63A8\u9001\u76EE\u6807\u2026",
  "remote.pullFrom": "\u62C9\u53D6\u6765\u6E90",
  "remote.pushTo": "\u63A8\u9001\u76EE\u6807",
  "remote.outgoingHint": "\u9886\u5148/\u843D\u540E\u6570\u91CF\u76F8\u5BF9\u4E8E\u8DDF\u8E2A\u5206\u652F\uFF0C\u4E0D\u4E00\u5B9A\u662F\u63A8\u9001\u76EE\u6807\u3002",
  "remote.github": "PR / Actions \u5BF9\u5E94\u7684 GitHub \u8FDC\u7A0B\u4ED3\u5E93",
  "remote.automatic": "\u81EA\u52A8\u9009\u62E9\uFF08\u4F18\u5148 origin\uFF09",
  "remote.githubSaved": "GitHub \u534F\u4F5C\u4ED3\u5E93\u5DF2\u66F4\u65B0",
  "remote.savedUnavailable": "\u4E0A\u6B21\u6253\u5F00\u7684\u4ED3\u5E93\u76EE\u5F55\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u4ED3\u5E93\u3002",
  "remote.restoreFailed": "\u6682\u65F6\u65E0\u6CD5\u6062\u590D\u4E0A\u6B21\u7684\u4ED3\u5E93\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6216\u7A0D\u540E\u91CD\u8BD5\u3002",
  "remote.directoryUnavailable": "\u4ED3\u5E93\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u65E0\u6CD5\u8BBF\u95EE\uFF1A{path}\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u6709\u6548\u7684\u4ED3\u5E93\u3002",
  "remote.preferenceNotSaved": "\u63A8\u9001\u5DF2\u6210\u529F\uFF0C\u4F46\u90E8\u5206\u63A8\u9001\u6216\u8DDF\u8E2A\u8BBE\u7F6E\u672A\u80FD\u4FDD\u5B58\u3002",
  "remote.prSourceRepo": "PR \u6765\u6E90\u4ED3\u5E93",
  "remote.prSourceBranch": "\u6765\u6E90\u4ED3\u5E93\u4E2D\u7684\u5206\u652F",
  "remote.prSourceMissing": "\u8BF7\u9009\u62E9\u5DF2\u63A8\u9001\u5206\u652F\u6240\u5728\u7684 GitHub \u4ED3\u5E93\uFF0C\u5E76\u586B\u5199\u8FDC\u7A0B\u5206\u652F\u540D\u3002",
  "remote.prSourceLoading": "\u6B63\u5728\u8BFB\u53D6\u6765\u6E90\u4ED3\u5E93\u2026",
  "remote.prSourceHint": "\u8BF7\u9009\u62E9\u5206\u652F\u5B9E\u9645\u53D1\u5E03\u5230\u7684\u4ED3\u5E93\uFF1B\u8DE8 fork \u65F6\u4F1A\u81EA\u52A8\u5E26\u4E0A\u6240\u5C5E\u8D26\u53F7\u3002"
};
var remoteEn = {
  "remote.title": "Push to remote",
  "remote.choose": "Choose a destination remote",
  "remote.chooseDestination": "Choose push destination\u2026",
  "remote.invalid": "Remote no longer exists. Refresh and try again.",
  "remote.detached": "Switch to a local branch before pushing.",
  "remote.source": "Local branch",
  "remote.destination": "Destination remote",
  "remote.targetBranch": "Destination branch",
  "remote.upstream": "Tracking branch",
  "remote.noUpstream": "Not set",
  "remote.setUpstream": "Track this destination branch (affects future pulls)",
  "remote.remember": "Use as the default push remote for this branch",
  "remote.saveOptionsHint": "Options are saved after a successful push. Unchecking the current destination clears its corresponding setting; settings for other destinations are preserved.",
  "remote.push": "Push",
  "remote.cancel": "Cancel",
  "remote.loading": "Reading remote configuration\u2026",
  "remote.loadFailed": "Could not read remote configuration",
  "remote.retry": "Retry",
  "remote.empty": "No remotes configured. Add one in Settings first.",
  "remote.select": "Choose a remote\u2026",
  "remote.summary": "Push direction",
  "remote.force": "Use force with lease. This rewrites the destination branch history.",
  "remote.deleteBranch": "Delete remote branch\u2026",
  "remote.deleteWarning": "Delete this branch from the remote shown below. Local branches are retained; server branch protection still applies.",
  "remote.deleted": "Remote branch deleted",
  "remote.deleteFailed": "Could not delete remote branch",
  "remote.prune": "Fetch and prune stale remote references",
  "remote.pruneDone": "Fetched and pruned stale remote references",
  "remote.checkoutConflict": "Local branch {branch} does not track {remote}. Choose another local branch name, or update its tracking configuration before checking it out.",
  "remote.changed": "The repository or current branch changed. Try again.",
  "remote.tags": "All local tags",
  "remote.tag": "Tag",
  "remote.deleteTag": "Delete remote tag",
  "remote.deleteTagWarning": "Delete this tag from the selected remote. The local tag is retained.",
  "remote.other": "Choose push destination\u2026",
  "remote.pullFrom": "Pull from",
  "remote.pushTo": "Push to",
  "remote.outgoingHint": "Ahead/behind counts compare with the tracking branch, which may differ from the push destination.",
  "remote.github": "GitHub remote for PRs / Actions",
  "remote.automatic": "Automatic (prefer origin)",
  "remote.githubSaved": "GitHub collaboration repository updated",
  "remote.savedUnavailable": "The previous repository directory no longer exists. Open a repository again.",
  "remote.restoreFailed": "Could not restore the previous repository. Open it again or retry later.",
  "remote.directoryUnavailable": "Repository directory is missing or unavailable: {path}. Open a valid repository again.",
  "remote.preferenceNotSaved": "Push succeeded, but some push or tracking settings could not be saved.",
  "remote.prSourceRepo": "PR source repository",
  "remote.prSourceBranch": "Branch in the source repository",
  "remote.prSourceMissing": "Choose the GitHub repository where the branch was pushed and enter its remote branch name.",
  "remote.prSourceLoading": "Reading source repository\u2026",
  "remote.prSourceHint": "Choose the repository where the branch is published. Cross-fork requests include its owner automatically."
};

// src/i18n/workflow.ts
var workflowZh = {
  "flow.currentBranch": "\u5F53\u524D\u5206\u652F",
  "flow.localHeadRequired": "\u8BF7\u5148\u68C0\u51FA\u4E00\u4E2A\u672C\u5730\u5206\u652F\u3002",
  "flow.linearOnly": "\u53EA\u80FD\u6574\u7406\u6709\u7236\u63D0\u4EA4\u7684\u7EBF\u6027\u5386\u53F2\uFF0C\u8BF7\u7F29\u5C0F\u63D0\u4EA4\u8303\u56F4\uFF0C\u907F\u5F00\u5408\u5E76\u63D0\u4EA4\u3002",
  "flow.invalidPlan": "\u63D0\u4EA4\u8BA1\u5212\u65E0\u6548\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  "flow.published": "\u8FD9\u4E9B\u63D0\u4EA4\u5DF2\u5B58\u5728\u4E8E\u5DF2\u83B7\u53D6\u7684\u8FDC\u7A0B\u5206\u652F\u4E0A\uFF0C\u5DF2\u963B\u6B62\u6539\u5199\u3002\u8BF7\u5148\u7F29\u5C0F\u5230\u5C1A\u672A\u53D1\u5E03\u7684\u63D0\u4EA4\u8303\u56F4\u3002",
  "flow.rewrite": "\u9884\u89C8\u5E76\u6267\u884C\u6574\u7406",
  "flow.rewriteConfirm": "\u5C06\u6309\u6B64\u987A\u5E8F\u91CD\u5199\u5F53\u524D\u5206\u652F\u7684\u63D0\u4EA4\u3002\u6267\u884C\u524D\u81EA\u52A8\u4FDD\u5B58\u6062\u590D\u70B9\uFF1B\u63D0\u4EA4\u7F16\u53F7\u4F1A\u6539\u53D8\u3002\u82E5\u53D1\u751F\u51B2\u7A81\uFF0C\u8BF7\u5728\u5DE5\u4F5C\u533A\u89E3\u51B3\u6216\u4E2D\u6B62\u53D8\u57FA\u3002",
  "flow.rewriteDone": "\u63D0\u4EA4\u5386\u53F2\u5DF2\u6574\u7406",
  "flow.rewriteFailure": "\u82E5\u53D8\u57FA\u5DF2\u5F00\u59CB\uFF0C\u8BF7\u89E3\u51B3\u51B2\u7A81\u6216\u4E2D\u6B62\u53D8\u57FA\u3002\u4E5F\u53EF\u5728\u64CD\u4F5C\u7ED3\u675F\u540E\u4ECE\u6062\u590D\u4E2D\u5FC3\u8FD8\u539F\u3002",
  "flow.historyEditor": "\u6574\u7406\u63D0\u4EA4",
  "flow.historyEditorHint": "\u4ECE\u65E7\u5230\u65B0\u6392\u5217\u3002\u62D6\u52A8\u6216\u4F7F\u7528\u7BAD\u5934\u8C03\u6574\u987A\u5E8F\uFF1BSquash \u5408\u5E76\u8BF4\u660E\uFF0CFixup \u4FDD\u7559\u4E0A\u4E00\u6761\u8BF4\u660E\u3002\u4EC5\u652F\u6301\u5C1A\u672A\u53D1\u5E03\u7684\u7EBF\u6027\u63D0\u4EA4\uFF0C\u6267\u884C\u524D\u4FDD\u5B58\u6062\u590D\u70B9\u3002",
  "flow.recentCommits": "\u6700\u8FD1\u63D0\u4EA4\u6570\u91CF",
  "flow.action": "\u63D0\u4EA4\u52A8\u4F5C",
  "flow.pick": "\u4FDD\u7559 \xB7 Pick",
  "flow.squash": "\u5408\u5E76\u8BF4\u660E \xB7 Squash",
  "flow.fixup": "\u6CBF\u7528\u8BF4\u660E \xB7 Fixup",
  "flow.reword": "\u6539\u5199\u4FE1\u606F \xB7 Reword",
  "flow.drop": "\u4E22\u5F03 \xB7 Drop",
  "flow.rewordLabel": "\u65B0\u7684\u63D0\u4EA4\u4FE1\u606F",
  "flow.rewordPlaceholder": "\u8F93\u5165\u6539\u5199\u540E\u7684\u63D0\u4EA4\u4FE1\u606F",
  "flow.publishedWarn": "\u6240\u9009\u8303\u56F4\u5305\u542B\u5DF2\u63A8\u9001\u5230\u8FDC\u7A0B\u7684\u63D0\u4EA4\u3002\u6539\u5199\u540E\u63A8\u9001\u9700\u8981\u5F3A\u5236\u8986\u76D6\uFF1B\u53EF\u5728\u786E\u8BA4\u65F6\u8BC4\u4F30\uFF0C\u6216\u5148\u7F29\u5C0F\u8303\u56F4\u5230\u5C1A\u672A\u53D1\u5E03\u7684\u63D0\u4EA4\u3002",
  "flow.firstPickRequired": "\u4EC5\u8C03\u6574\u987A\u5E8F\u6216\u5408\u5E76\u8BF4\u660E\u65F6\uFF0C\u7B2C\u4E00\u6761\u9700\u4FDD\u6301\u300C\u4FDD\u7559\u300D\uFF1B\u8981\u6539\u5199\u6216\u5220\u9664\u9996\u6761\u63D0\u4EA4\uFF0C\u8BF7\u4E3A\u5B83\u9009\u62E9\u300C\u6539\u5199\u4FE1\u606F\u300D\u6216\u300C\u4E22\u5F03\u300D\u3002",
  "flow.moveUp": "\u5411\u4E0A\u79FB\u52A8",
  "flow.moveDown": "\u5411\u4E0B\u79FB\u52A8",
  "flow.noDiff": "\u6B64\u63D0\u4EA4\u4E0E\u5F53\u524D HEAD \u6CA1\u6709\u6587\u4EF6\u5DEE\u5F02\u3002",
  "flow.branchRecovered": "\u5DF2\u627E\u56DE\u4E3A\u65B0\u5206\u652F\uFF0C\u5F53\u524D\u5DE5\u4F5C\u533A\u4FDD\u6301\u539F\u72B6",
  "flow.savedPoints": "\u4FDD\u5B58\u7684\u6062\u590D\u70B9",
  "flow.reflog": "\u64CD\u4F5C\u8BB0\u5F55 / Reflog",
  "flow.reflogHint": "\u663E\u793A\u6700\u8FD1\u53EF\u7528\u7684 150 \u6761 Git \u64CD\u4F5C\u8BB0\u5F55\u3002\u53EF\u67E5\u770B\u5386\u53F2\u63D0\u4EA4\uFF0C\u5E76\u627E\u56DE\u4E3A\u65B0\u5206\u652F\uFF1B\u5DF2\u88AB Git \u6E05\u7406\u7684\u5BF9\u8C61\u65E0\u6CD5\u6062\u590D\u3002",
  "flow.inspectRecover": "\u67E5\u770B\u4E0E\u627E\u56DE",
  "flow.compare": "\u67E5\u770B\u5DEE\u5F02",
  "flow.recoverName": "\u627E\u56DE\u540E\u7684\u65B0\u5206\u652F\u540D",
  "flow.recoverBranch": "\u627E\u56DE\u4E3A\u65B0\u5206\u652F",
  "flow.invalidAiResult": "AI \u8FD4\u56DE\u7684\u5185\u5BB9\u4E0D\u7B26\u5408\u8981\u6C42\uFF0C\u672A\u5E94\u7528\u4EFB\u4F55\u4FEE\u6539\u3002\u8BF7\u91CD\u8BD5\u6216\u624B\u52A8\u5904\u7406\u3002",
  "flow.diagnoseError": "\u89E3\u91CA Git \u9519\u8BEF",
  "flow.localDiagnosis": "\u672C\u5730\u8BCA\u65AD\u5EFA\u8BAE",
  "flow.diagnosis.pushRejected": "\u53EF\u80FD\u662F\u8FDC\u7AEF\u5DF2\u6709\u65B0\u63D0\u4EA4\u3002\u5148\u83B7\u53D6\u66F4\u65B0\u5E76\u6BD4\u8F83\u5206\u652F\uFF0C\u518D\u9009\u62E9\u5408\u5E76\u6216\u53D8\u57FA\uFF1B\u89E3\u51B3\u51B2\u7A81\u540E\u91CD\u65B0\u63A8\u9001\u3002\u4E0D\u8981\u76F4\u63A5\u5F3A\u5236\u63A8\u9001\u3002",
  "flow.diagnosis.auth": "\u68C0\u67E5\u8D26\u53F7\u662F\u5426\u6B63\u786E\u3001\u51ED\u8BC1\u662F\u5426\u8FC7\u671F\uFF0C\u4EE5\u53CA\u4ED3\u5E93\u8BBF\u95EE\u6743\u9650\u3002\u53EF\u5728\u8D26\u53F7\u8BBE\u7F6E\u4E2D\u91CD\u65B0\u767B\u5F55\uFF1B\u4E0D\u8981\u628A\u4EE4\u724C\u5199\u5165\u63D0\u4EA4\u6216\u65E5\u5FD7\u3002",
  "flow.diagnosis.dirty": "\u672C\u5730\u4FEE\u6539\u53EF\u80FD\u4F1A\u88AB\u8986\u76D6\u3002\u5148\u63D0\u4EA4\u6216 Stash\uFF08\u5305\u542B\u672A\u8DDF\u8E2A\u6587\u4EF6\uFF09\uFF0C\u518D\u91CD\u8BD5\u3002\u53EF\u6309\u6587\u4EF6\u68C0\u67E5\u54EA\u4E9B\u4FEE\u6539\u9700\u8981\u4FDD\u7559\u3002",
  "flow.diagnosis.conflict": "\u5B58\u5728\u672A\u89E3\u51B3\u51B2\u7A81\u3002\u9010\u4E2A\u67E5\u770B\u51B2\u7A81\u6587\u4EF6\u3001\u9009\u62E9\u6216\u7F16\u8F91\u5185\u5BB9\u5E76\u6682\u5B58\uFF0C\u518D\u7EE7\u7EED\u5F53\u524D\u64CD\u4F5C\uFF1B\u4E0D\u60F3\u7EE7\u7EED\u65F6\u53EF\u4E2D\u6B62\u5408\u5E76\u6216\u53D8\u57FA\u3002",
  "flow.diagnosis.network": "\u68C0\u67E5\u7F51\u7EDC\u3001\u4EE3\u7406\u548C\u8FDC\u7AEF\u670D\u52A1\u662F\u5426\u53EF\u7528\u3002\u7F51\u7EDC\u6062\u590D\u540E\u91CD\u8BD5\u83B7\u53D6\u66F4\u65B0\uFF1B\u8FDE\u63A5\u95EE\u9898\u901A\u5E38\u4E0D\u9700\u8981\u91CD\u7F6E\u672C\u5730\u5386\u53F2\u3002",
  "flow.diagnosis.locked": "\u53EF\u80FD\u8FD8\u6709 Git \u64CD\u4F5C\u8FD0\u884C\u3002\u5148\u7B49\u5F85\u6216\u5173\u95ED\u76F8\u5173\u8FDB\u7A0B\uFF1B\u786E\u8BA4\u6CA1\u6709 Git \u8FDB\u7A0B\u540E\u518D\u68C0\u67E5\u9501\u6587\u4EF6\u3002\u4E0D\u8981\u5728\u5176\u4ED6 Git \u64CD\u4F5C\u8FD0\u884C\u65F6\u5220\u9664\u9501\u3002",
  "flow.diagnosis.unknown": "\u8BF7\u5148\u67E5\u770B\u5B8C\u6574\u9519\u8BEF\u3001\u5F53\u524D\u5206\u652F\u548C\u5DE5\u4F5C\u533A\u72B6\u6001\u3002\u4E0B\u65B9 AI \u53EF\u7ED3\u5408\u8FD9\u4E9B\u4FE1\u606F\u7ED9\u51FA\u66F4\u5177\u4F53\u7684\u5EFA\u8BAE\uFF1B\u6240\u6709\u6B65\u9AA4\u90FD\u9700\u8981\u6838\u5BF9\u540E\u6267\u884C\u3002",
  "flow.proposedResolution": "\u5EFA\u8BAE\u7684\u4EE3\u7801\uFF08\u53EF\u4EE5\u7F16\u8F91\uFF09",
  "flow.conflictReviewHint": "\u4EC5\u66FF\u6362\u8FD9\u4E00\u5757\u5728\u7F16\u8F91\u5668\u4E2D\u7684\u5185\u5BB9\uFF0C\u4E0D\u81EA\u52A8\u4FDD\u5B58\u6216\u6682\u5B58\u3002\u8BF7\u68C0\u67E5\u903B\u8F91\uFF0C\u5B8C\u6210\u6240\u6709\u51B2\u7A81\u540E\u518D\u4FDD\u5B58\uFF0C\u5E76\u8FD0\u884C\u76F8\u5173\u6D4B\u8BD5\u3002",
  "flow.applyBlock": "\u5E94\u7528\u5230\u8FD9\u4E00\u5757",
  "flow.aiConflict": "AI \u51B2\u7A81\u5EFA\u8BAE",
  "flow.splitEmptyIndex": "\u8BF7\u5148\u63D0\u4EA4\u5F53\u524D\u5DF2\u6682\u5B58\u5185\u5BB9\uFF0C\u6216\u53D6\u6D88\u6682\u5B58\u540E\u518D\u5206\u7EC4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u6539\u53D8\u5DF2\u6709\u7684\u6682\u5B58\u9009\u62E9\u3002",
  "flow.updateGroup": "\u66F4\u65B0\u76F8\u5173\u6587\u4EF6",
  "flow.groupStaged": "\u8FD9\u7EC4\u6587\u4EF6\u5DF2\u6682\u5B58\uFF0C\u63D0\u4EA4\u8BF4\u660E\u5DF2\u586B\u5165\u3002\u63D0\u4EA4\u540E\u53EF\u7EE7\u7EED\u6574\u7406\u5269\u4F59\u4FEE\u6539\u3002",
  "flow.splitCommits": "\u667A\u80FD\u62C6\u5206\u63D0\u4EA4",
  "flow.splitShort": "\u5206\u7EC4",
  "flow.splitHint": "\u5148\u6309\u6587\u4EF6\u7528\u9014\u63D0\u4F9B\u672C\u5730\u5206\u7EC4\uFF0C\u4E5F\u53EF\u8BA9 AI \u5EFA\u8BAE\u3002\u8C03\u6574\u6807\u9898\u548C\u6587\u4EF6\u5F52\u5C5E\u540E\uFF0C\u4E00\u6B21\u6682\u5B58\u4E00\u7EC4\uFF0C\u518D\u4ECE\u63D0\u4EA4\u9762\u677F\u5B8C\u6210\u63D0\u4EA4\u3002\u5176\u4F59\u4FEE\u6539\u4FDD\u7559\u5728\u5DE5\u4F5C\u533A\uFF1B\u540C\u4E00\u6587\u4EF6\u5185\u90E8\u53EF\u4F7F\u7528\u6309\u884C\u6682\u5B58\u3002",
  "flow.aiGroups": "AI \u5EFA\u8BAE\u5206\u7EC4",
  "flow.addGroup": "\u6DFB\u52A0\u4E00\u7EC4",
  "flow.commitTitle": "\u63D0\u4EA4\u8BF4\u660E",
  "flow.stageGroup": "\u6682\u5B58\u8FD9\u7EC4",
  "flow.useGroups": "\u91C7\u7528\u5206\u7EC4\u5EFA\u8BAE",
  "flow.lineUnsupported": "\u6309\u884C\u64CD\u4F5C\u4EC5\u652F\u6301\u5DF2\u8DDF\u8E2A\u6587\u4EF6\u7684\u6587\u672C\u4FEE\u6539\uFF1B\u65B0\u589E\u3001\u5220\u9664\u6216\u4E8C\u8FDB\u5236\u6587\u4EF6\u8BF7\u4F7F\u7528\u6587\u4EF6\u6216\u4EE3\u7801\u5757\u6682\u5B58\u3002",
  "flow.selectLines": "\u8BF7\u9009\u62E9\u8981\u64CD\u4F5C\u7684\u589E\u52A0\u6216\u5220\u9664\u884C\u3002",
  "flow.linesApplied": "\u6240\u9009\u884C\u7684\u6682\u5B58\u72B6\u6001\u5DF2\u66F4\u65B0",
  "flow.selectLine": "\u9009\u62E9\u53D8\u66F4\u884C",
  "flow.lineHint": "\u52FE\u9009\u589E\u52A0\u6216\u5220\u9664\u884C\uFF0C\u53EF\u5355\u72EC\u6682\u5B58\uFF1B\u4EC5\u4FEE\u6539\u6682\u5B58\u533A",
  "flow.unstageLines": "\u53D6\u6D88\u6682\u5B58\u6240\u9009\u884C",
  "flow.stageLines": "\u6682\u5B58\u6240\u9009\u884C",
  "flow.before": "\u4FEE\u6539\u524D",
  "flow.after": "\u4FEE\u6539\u540E",
  "flow.invalidImage": "\u56FE\u7247\u65E0\u6CD5\u89E3\u7801\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u662F\u5426\u6709\u6548\u3002",
  "flow.imageAbsent": "\u6B64\u7248\u672C\u6CA1\u6709\u8BE5\u56FE\u7247",
  "flow.sideBySide": "\u5E76\u6392\u5BF9\u6BD4",
  "flow.overlay": "\u53E0\u52A0\u5BF9\u6BD4",
  "flow.opacity": "\u4FEE\u6539\u540E\u56FE\u7247\u900F\u660E\u5EA6",
  "flow.imageHint": "\u652F\u6301 PNG\u3001JPEG\u3001GIF\u3001WebP \u548C BMP\uFF0C\u5355\u5F20\u56FE\u7247\u4E0A\u9650 8 MiB\u3002\u4E0D\u540C\u5C3A\u5BF8\u7684\u56FE\u7247\u6309\u539F\u6BD4\u4F8B\u663E\u793A\u3002",
  "flow.searchMode": "\u5386\u53F2\u641C\u7D22\u8303\u56F4",
  "flow.searchMetadata": "\u63D0\u4EA4\u4FE1\u606F",
  "flow.searchContents": "\u4EE3\u7801\u589E\u5220",
  "flow.graphDragHint": "\u62D6\u52A8\u5206\u652F\u6807\u7B7E\u5230\u53E6\u4E00\u5206\u652F\u53EF\u9884\u89C8\u5408\u5E76\uFF1B\u62D6\u52A8\u63D0\u4EA4\u5230\u5F53\u524D\u5206\u652F\u53EF Cherry-pick"
};
var workflowEn = {
  "flow.currentBranch": "Current branch",
  "flow.localHeadRequired": "Check out a local branch first.",
  "flow.linearOnly": "Choose a smaller linear range without merge commits; the root commit cannot be rewritten here.",
  "flow.invalidPlan": "Invalid commit plan. Reload and try again.",
  "flow.published": "These commits exist on a fetched remote branch. Choose only unpublished commits.",
  "flow.rewrite": "Review and rewrite",
  "flow.rewriteConfirm": "Rewrite the current branch in this order. A recovery point is saved first; commit IDs change. Resolve conflicts in the working tree or abort the rebase.",
  "flow.rewriteDone": "Commit history rewritten",
  "flow.rewriteFailure": "If a rebase started, resolve its conflicts or abort it. Recovery center also retains the original history.",
  "flow.historyEditor": "Organize commits",
  "flow.historyEditorHint": "Oldest first. Drag or use arrows to reorder. Squash combines messages; Fixup keeps the previous message. Only unpublished linear commits are supported. A recovery point is saved first.",
  "flow.recentCommits": "Recent commit count",
  "flow.action": "Commit action",
  "flow.pick": "Keep \xB7 Pick",
  "flow.squash": "Combine messages \xB7 Squash",
  "flow.fixup": "Keep prior message \xB7 Fixup",
  "flow.reword": "Reword message \xB7 Reword",
  "flow.drop": "Drop \xB7 Drop",
  "flow.rewordLabel": "New commit message",
  "flow.rewordPlaceholder": "Enter the rewritten commit message",
  "flow.publishedWarn": "The selected range includes commits already pushed. Pushing after the rewrite requires a force push; evaluate before confirming, or narrow the range to unpublished commits first.",
  "flow.firstPickRequired": "When only reordering or folding, the first step must stay Keep; to rewrite or drop the first commit, set it to Reword or Drop instead.",
  "flow.moveUp": "Move up",
  "flow.moveDown": "Move down",
  "flow.noDiff": "No file differences from the current HEAD.",
  "flow.branchRecovered": "Recovered as a new branch; current working tree preserved",
  "flow.savedPoints": "Saved points",
  "flow.reflog": "Activity / Reflog",
  "flow.reflogHint": "Up to 150 available Git reflog entries. Inspect commits and recover them as new branches. Objects already pruned by Git cannot be recovered.",
  "flow.inspectRecover": "Inspect / recover",
  "flow.compare": "View differences",
  "flow.recoverName": "New recovered branch name",
  "flow.recoverBranch": "Recover as new branch",
  "flow.invalidAiResult": "Invalid AI response. Nothing was applied. Retry or handle it manually.",
  "flow.diagnoseError": "Explain Git error",
  "flow.localDiagnosis": "Local diagnostic guidance",
  "flow.diagnosis.pushRejected": "The remote may have new commits. Fetch and compare branches, then merge or rebase. Resolve conflicts before pushing again. Do not force push by default.",
  "flow.diagnosis.auth": "Check the selected account, credential expiry and repository access. Reauthenticate in account settings. Keep tokens out of commits and logs.",
  "flow.diagnosis.dirty": "Local changes may be overwritten. Commit or stash them, including untracked files, before retrying. Review which edits to keep.",
  "flow.diagnosis.conflict": "Resolve each conflicted file, review and stage the result, then continue the operation. Abort the merge or rebase if you do not want to continue.",
  "flow.diagnosis.network": "Check your network, proxy and remote availability. Retry fetching when connectivity returns. Network errors usually do not require resetting local history.",
  "flow.diagnosis.locked": "Another Git operation may be running. Wait or stop that process first. Inspect lock files only after confirming no Git process is active.",
  "flow.diagnosis.unknown": "Review the full error, current branch and working tree status. AI can use this context for more specific suggestions. Review every step before executing it.",
  "flow.proposedResolution": "Proposed code (editable)",
  "flow.conflictReviewHint": "Replaces only this block in the editor. It does not save or stage. Review logic, finish the other conflicts, save and run relevant tests.",
  "flow.applyBlock": "Apply to this block",
  "flow.aiConflict": "AI conflict suggestion",
  "flow.splitEmptyIndex": "Commit or unstage existing staged changes before grouping. Existing staging selections are not changed automatically.",
  "flow.updateGroup": "update related files",
  "flow.groupStaged": "Group staged and commit title filled in. Commit it, then organize the remaining changes.",
  "flow.splitCommits": "Split changes into commits",
  "flow.splitShort": "Group",
  "flow.splitHint": "Start with local file groups or request AI suggestions. Edit titles and assignments, stage one group, then commit from the commit panel. Other changes stay in the working tree. Use line staging to split changes within a file.",
  "flow.aiGroups": "Suggest groups with AI",
  "flow.addGroup": "Add group",
  "flow.commitTitle": "Commit title",
  "flow.stageGroup": "Stage group",
  "flow.useGroups": "Use these groups",
  "flow.lineUnsupported": "Line staging supports tracked text modifications. Stage new, deleted or binary files by file or hunk.",
  "flow.selectLines": "Select added or deleted lines first.",
  "flow.linesApplied": "Selected lines updated",
  "flow.selectLine": "Select changed line",
  "flow.lineHint": "Select added/deleted lines to stage separately; only the index changes",
  "flow.unstageLines": "Unstage selected lines",
  "flow.stageLines": "Stage selected lines",
  "flow.before": "Before",
  "flow.after": "After",
  "flow.invalidImage": "Unable to decode this image. Check whether the file is valid.",
  "flow.imageAbsent": "Image absent in this version",
  "flow.sideBySide": "Side by side",
  "flow.overlay": "Overlay",
  "flow.opacity": "After-image opacity",
  "flow.imageHint": "Supports PNG, JPEG, GIF, WebP and BMP, up to 8 MiB per image. Different dimensions retain their aspect ratio.",
  "flow.searchMode": "History search scope",
  "flow.searchMetadata": "Commit metadata",
  "flow.searchContents": "Code added / removed",
  "flow.graphDragHint": "Drag branch labels onto another branch to preview a merge; drag commits onto the current branch to cherry-pick"
};

// src/i18n/resilience.ts
var resilienceZh = {
  "resilience.title": "\u8FD9\u4E2A\u89C6\u56FE\u6682\u65F6\u65E0\u6CD5\u663E\u793A",
  "resilience.hint": "\u53EF\u4EE5\u91CD\u8BD5\uFF0C\u6216\u590D\u5236\u8BCA\u65AD\u4FE1\u606F\u5E2E\u52A9\u6392\u67E5\u3002\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3\u524D\uFF0C\u8BF7\u5148\u4FDD\u5B58\u6B63\u5728\u7F16\u8F91\u7684\u5185\u5BB9\u3002",
  "resilience.retry": "\u91CD\u8BD5",
  "resilience.copy": "\u590D\u5236\u8BCA\u65AD\u4FE1\u606F",
  "resilience.copied": "\u8BCA\u65AD\u4FE1\u606F\u5DF2\u590D\u5236",
  "resilience.copyFailed": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u5C55\u5F00\u8BCA\u65AD\u4FE1\u606F\u624B\u52A8\u590D\u5236\u3002",
  "resilience.reload": "\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3",
  "resilience.details": "\u8BCA\u65AD\u4FE1\u606F",
  "dispatch.loadingInputs": "\u6B63\u5728\u8BFB\u53D6\u6240\u9009\u5206\u652F\u7684\u5DE5\u4F5C\u6D41\u53C2\u6570\u2026",
  "dispatch.noInputs": "\u6B64\u5DE5\u4F5C\u6D41\u4E0D\u9700\u8981\u586B\u5199\u53C2\u6570\u3002",
  "dispatch.notManual": "\u6240\u9009\u5206\u652F\u7684\u5DE5\u4F5C\u6D41\u672A\u542F\u7528\u624B\u52A8\u8FD0\u884C\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u5206\u652F\u3002",
  "dispatch.invalidDefinition": "\u65E0\u6CD5\u8BFB\u53D6\u5DE5\u4F5C\u6D41\u53C2\u6570\u5B9A\u4E49\uFF0C\u8BF7\u68C0\u67E5\u5DE5\u4F5C\u6D41\u914D\u7F6E\u3002",
  "dispatch.requiredInput": "\u8BF7\u586B\u5199\u6240\u6709\u5FC5\u586B\u53C2\u6570\u3002",
  "dispatch.invalidInput": "\u53C2\u6570\u503C\u65E0\u6548\uFF0C\u8BF7\u68C0\u67E5\u540E\u91CD\u8BD5\u3002",
  "dispatch.loadOrRunFailed": "\u52A0\u8F7D\u6216\u8FD0\u884C\u5931\u8D25",
  "dispatch.selectValue": "\u8BF7\u9009\u62E9",
  "dispatch.true": "\u662F",
  "dispatch.false": "\u5426",
  "dispatch.environmentHint": "\u586B\u5199\u6B64\u4ED3\u5E93\u4E2D\u5DF2\u914D\u7F6E\u7684\u73AF\u5883\u540D\u79F0\u3002",
  "activity.elapsed": "\u5DF2\u7528\u65F6\u95F4",
  "activity.queued": "\u6392\u961F {n} \u9879",
  "activity.cancelQueued": "\u53D6\u6D88\u6392\u961F",
  "activity.cancelHint": "\u53EA\u53D6\u6D88\u5C1A\u672A\u5F00\u59CB\u7684\u4EFB\u52A1\uFF0C\u5F53\u524D\u64CD\u4F5C\u7EE7\u7EED\u6267\u884C\u3002",
  "activity.cancelled": "\u6392\u961F\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF0C\u672A\u6267\u884C Git \u64CD\u4F5C\u3002",
  "activity.command.transaction": "\u6B63\u5728\u51C6\u5907\u4ED3\u5E93\u64CD\u4F5C",
  "activity.command.fetch": "\u6B63\u5728\u83B7\u53D6\u8FDC\u7AEF\u66F4\u65B0",
  "activity.command.pull": "\u6B63\u5728\u62C9\u53D6",
  "activity.command.push": "\u6B63\u5728\u63A8\u9001",
  "activity.command.clone": "\u6B63\u5728\u514B\u9686",
  "activity.command.commit": "\u6B63\u5728\u63D0\u4EA4\uFF08\u542B\u4ED3\u5E93\u68C0\u67E5\u4E0E\u7B7E\u540D\uFF09",
  "activity.commitHint": "Git \u63D0\u4EA4\u4ECD\u672A\u8FD4\u56DE\uFF0C\u53EF\u80FD\u6B63\u5728\u8FD0\u884C\u4ED3\u5E93\u68C0\u67E5\u6216\u7B49\u5F85\u7B7E\u540D\u3002\u5F53\u524D\u9636\u6BB5\u8017\u65F6\u8F83\u957F\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u63D0\u4EA4\u3002",
  "activity.pushHint": "\u6B63\u5728\u7B49\u5F85 Git \u63A8\u9001\u8FD4\u56DE\uFF0C\u8017\u65F6\u4E0E\u7F51\u7EDC\u3001\u5BF9\u8C61\u5927\u5C0F\u53CA\u670D\u52A1\u5668\u68C0\u67E5\u6709\u5173\uFF0C\u4E0E\u63D0\u4EA4\u5206\u7EC4\u6570\u91CF\u4E0D\u76F4\u63A5\u5BF9\u5E94\u3002",
  "activity.command.add": "\u6B63\u5728\u6682\u5B58",
  "activity.command.reset": "\u6B63\u5728\u91CD\u7F6E",
  "activity.command.restore": "\u6B63\u5728\u8FD8\u539F",
  "activity.command.checkout": "\u6B63\u5728\u68C0\u51FA",
  "activity.command.switch": "\u6B63\u5728\u5207\u6362\u5206\u652F",
  "activity.command.merge": "\u6B63\u5728\u5408\u5E76",
  "activity.command.rebase": "\u6B63\u5728\u53D8\u57FA",
  "activity.command.cherry-pick": "\u6B63\u5728\u5E94\u7528\u63D0\u4EA4",
  "activity.command.stash": "\u6B63\u5728\u5904\u7406\u6682\u5B58\u8BB0\u5F55",
  "activity.command.branch": "\u6B63\u5728\u66F4\u65B0\u5206\u652F",
  "activity.command.tag": "\u6B63\u5728\u66F4\u65B0\u6807\u7B7E",
  "activity.command.worktree": "\u6B63\u5728\u5904\u7406\u5DE5\u4F5C\u6811",
  "activity.command.apply": "\u6B63\u5728\u5E94\u7528\u53D8\u66F4",
  "activity.command.update-ref": "\u6B63\u5728\u4FDD\u5B58\u5F15\u7528",
  "activity.command.status": "\u6B63\u5728\u68C0\u67E5\u5DE5\u4F5C\u533A",
  "activity.command.rev-parse": "\u6B63\u5728\u68C0\u67E5\u63D0\u4EA4\u4F4D\u7F6E",
  "activity.command.diff": "\u6B63\u5728\u68C0\u67E5\u5DEE\u5F02",
  "activity.command.hash-object": "\u6B63\u5728\u6821\u9A8C\u6587\u4EF6\u5185\u5BB9",
  "activity.command.ls-files": "\u6B63\u5728\u68C0\u67E5\u6682\u5B58\u533A",
  "activity.command.write-tree": "\u6B63\u5728\u4FDD\u5B58\u6682\u5B58\u533A\u5FEB\u7167",
  "activity.command.ls-tree": "\u6B63\u5728\u68C0\u67E5\u6682\u5B58\u533A\u5FEB\u7167"
};
var resilienceEn = {
  "resilience.title": "This view could not be displayed",
  "resilience.hint": "Retry or copy diagnostics to investigate. Save any text you are editing before reloading the window.",
  "resilience.retry": "Retry",
  "resilience.copy": "Copy diagnostics",
  "resilience.copied": "Diagnostics copied",
  "resilience.copyFailed": "Could not copy. Expand diagnostics to copy them manually.",
  "resilience.reload": "Reload window",
  "resilience.details": "Diagnostics",
  "dispatch.loadingInputs": "Loading workflow inputs from the selected branch\u2026",
  "dispatch.noInputs": "This workflow has no inputs.",
  "dispatch.notManual": "The workflow on this branch does not support manual runs. Select another branch.",
  "dispatch.invalidDefinition": "Could not read the workflow inputs. Check the workflow configuration.",
  "dispatch.requiredInput": "Fill in all required inputs.",
  "dispatch.invalidInput": "An input value is invalid. Check it and try again.",
  "dispatch.loadOrRunFailed": "Could not load or run the workflow",
  "dispatch.selectValue": "Select a value",
  "dispatch.true": "Yes",
  "dispatch.false": "No",
  "dispatch.environmentHint": "Enter an environment name configured in this repository.",
  "activity.elapsed": "Elapsed time",
  "activity.queued": "{n} queued",
  "activity.cancelQueued": "Cancel queued",
  "activity.cancelHint": "Cancel tasks that have not started. The current operation will continue.",
  "activity.cancelled": "Queued task cancelled before executing Git.",
  "activity.command.transaction": "Preparing repository operation",
  "activity.command.fetch": "Fetching updates",
  "activity.command.pull": "Pulling",
  "activity.command.push": "Pushing",
  "activity.command.clone": "Cloning",
  "activity.command.commit": "Committing (including checks and signing)",
  "activity.commitHint": "Git has not returned yet. Repository checks or signing may still be running. This stage is taking longer; no commit will be retried automatically.",
  "activity.pushHint": "Waiting for Git push. Duration depends on the network, object sizes and server checks, rather than the number of commit groups.",
  "activity.command.add": "Staging",
  "activity.command.reset": "Resetting",
  "activity.command.restore": "Restoring",
  "activity.command.checkout": "Checking out",
  "activity.command.switch": "Switching branch",
  "activity.command.merge": "Merging",
  "activity.command.rebase": "Rebasing",
  "activity.command.cherry-pick": "Applying commit",
  "activity.command.stash": "Updating stash",
  "activity.command.branch": "Updating branch",
  "activity.command.tag": "Updating tag",
  "activity.command.worktree": "Updating worktree",
  "activity.command.apply": "Applying changes",
  "activity.command.update-ref": "Saving reference",
  "activity.command.status": "Checking working tree",
  "activity.command.rev-parse": "Checking commit position",
  "activity.command.diff": "Checking changes",
  "activity.command.hash-object": "Verifying file contents",
  "activity.command.ls-files": "Checking staging",
  "activity.command.write-tree": "Saving index snapshot",
  "activity.command.ls-tree": "Checking index snapshot"
};

// src/i18n/optimization.ts
var optimizationZh = {
  "recoveryManage.name": "\u6062\u590D\u70B9\u540D\u79F0\uFF08\u53EF\u9009\uFF09",
  "recoveryManage.namePlaceholder": "\u4F8B\u5982\uFF1A\u767B\u5F55\u6A21\u5757\u91CD\u6784\u524D",
  "recoveryManage.rename": "\u6539\u540D",
  "recoveryManage.renameLabel": "\u65B0\u7684\u6062\u590D\u70B9\u540D\u79F0",
  "recoveryManage.saveName": "\u4FDD\u5B58\u540D\u79F0",
  "recoveryManage.clearNameHint": "\u7559\u7A7A\u5219\u4F7F\u7528\u9ED8\u8BA4\u540D\u79F0",
  "recoveryManage.renamed": "\u6062\u590D\u70B9\u540D\u79F0\u5DF2\u66F4\u65B0",
  "recoveryManage.delete": "\u5220\u9664\u6062\u590D\u70B9",
  "recoveryManage.deleted": "\u6062\u590D\u70B9\u5DF2\u5220\u9664",
  "recoveryManage.deleteConfirm": "\u786E\u5B9A\u5220\u9664\u201C{name}\u201D\u5417\uFF1F\u6B64\u64CD\u4F5C\u53EA\u79FB\u9664\u8FD9\u4E2A\u6062\u590D\u70B9\uFF0C\u4E0D\u6539\u53D8\u5F53\u524D\u5206\u652F\u6216\u5DE5\u4F5C\u533A\u6587\u4EF6\u3002\u5982\u679C\u76F8\u5173\u63D0\u4EA4\u6CA1\u6709\u5176\u4ED6\u5206\u652F\u6216\u6062\u590D\u70B9\u4FDD\u7559\uFF0C\u4E4B\u540E\u53EF\u80FD\u88AB Git \u6E05\u7406\uFF0C\u65E0\u6CD5\u518D\u901A\u8FC7\u6B64\u6062\u590D\u70B9\u627E\u56DE\u3002",
  "recoveryManage.invalidName": "\u540D\u79F0\u6700\u591A 80 \u4E2A\u5B57\u7B26\uFF0C\u4E0D\u80FD\u5305\u542B\u6362\u884C\u6216\u63A7\u5236\u5B57\u7B26\u3002",
  "recoveryManage.invalidPoint": "\u6062\u590D\u70B9\u65E0\u6548\uFF0C\u8BF7\u5237\u65B0\u5217\u8868\u540E\u91CD\u8BD5\u3002",
  "operationLog.title": "\u6700\u8FD1\u64CD\u4F5C",
  "operationLog.hint": "\u4FDD\u7559\u672C\u6B21\u4F1A\u8BDD\u6700\u8FD1 100 \u6761\u64CD\u4F5C\u4E0E\u901A\u77E5\uFF0C\u5173\u95ED\u5E94\u7528\u540E\u6E05\u7A7A\u3002\u8017\u65F6\u5305\u542B\u6392\u961F\u7B49\u5F85\u65F6\u95F4\u3002",
  "operationLog.filter": "\u7B5B\u9009\u64CD\u4F5C",
  "operationLog.all": "\u5168\u90E8",
  "operationLog.errors": "\u5931\u8D25\u4E0E\u8B66\u544A",
  "operationLog.clear": "\u6E05\u7A7A\u8BB0\u5F55",
  "operationLog.empty": "\u6682\u65E0\u7B26\u5408\u6761\u4EF6\u7684\u64CD\u4F5C\u3002",
  "operationLog.details": "\u67E5\u770B\u8BE6\u60C5",
  "operationLog.completed": "\u64CD\u4F5C\u5DF2\u5B8C\u6210",
  "operationLog.retryFetch": "\u91CD\u8BD5\u6B64\u4ED3\u5E93\u7684\u83B7\u53D6\u64CD\u4F5C",
  "operationLog.recovery": "\u6B64\u4ED3\u5E93\u7684\u6062\u590D\u4E2D\u5FC3",
  "operationLog.recoveryFailed": "\u65E0\u6CD5\u6253\u5F00\u6B64\u4ED3\u5E93\u7684\u6062\u590D\u4E2D\u5FC3",
  "operationLog.currentRecovery": "\u5F53\u524D\u4ED3\u5E93\u7684\u6062\u590D\u4E2D\u5FC3",
  "operationLog.success": "\u6210\u529F",
  "operationLog.error": "\u5931\u8D25",
  "operationLog.warning": "\u8B66\u544A",
  "operationLog.info": "\u63D0\u793A",
  "updates.title": "\u5E94\u7528\u66F4\u65B0",
  "updates.availableHint": "\u53EF\u4ECE\u72B6\u6001\u680F\u6253\u5F00\u7248\u672C\u8BF4\u660E\uFF0C\u9009\u62E9\u4E0B\u8F7D\u6216\u7A0D\u540E\u5904\u7406\u3002",
  "updates.downloaded": "\u66F4\u65B0\u5DF2\u4E0B\u8F7D",
  "updates.installHint": "\u53EF\u4EE5\u7A0D\u540E\u5B89\u88C5\u3002\u5B89\u88C5\u5E76\u91CD\u542F\u524D\uFF0C\u8BF7\u5148\u4FDD\u5B58\u6B63\u5728\u7F16\u8F91\u7684\u5185\u5BB9\u3002",
  "updates.gitBusy": "\u8BF7\u7B49\u5F85\u6240\u6709\u4ED3\u5E93\u7684 Git \u4EFB\u52A1\u7ED3\u675F\u540E\u518D\u5B89\u88C5\u66F4\u65B0\u3002",
  "updates.restartConfirm": "\u5E94\u7528\u5C06\u9000\u51FA\u5E76\u5B89\u88C5\u66F4\u65B0\uFF0C\u7136\u540E\u91CD\u65B0\u542F\u52A8\u3002\u8BF7\u5148\u4FDD\u5B58\u6B63\u5728\u7F16\u8F91\u7684\u5185\u5BB9\u3002",
  "updates.installRestart": "\u5B89\u88C5\u5E76\u91CD\u542F",
  "updates.restart": "\u91CD\u542F\u5E94\u7528",
  "updates.later": "\u7A0D\u540E\u5904\u7406",
  "updates.check": "\u68C0\u67E5\u66F4\u65B0",
  "updates.download": "\u4E0B\u8F7D\u66F4\u65B0",
  "updates.retryDownload": "\u91CD\u65B0\u4E0B\u8F7D",
  "updates.notes": "\u7248\u672C\u8BF4\u660E",
  "updates.progress": "\u66F4\u65B0\u4E0B\u8F7D\u8FDB\u5EA6",
  "updates.desktopOnly": "\u8BF7\u5728\u684C\u9762\u5E94\u7528\u4E2D\u68C0\u67E5\u548C\u5B89\u88C5\u66F4\u65B0\u3002",
  "updates.phase.idle": "\u5C1A\u672A\u53D1\u73B0\u65B0\u7248\u672C\uFF0C\u53EF\u624B\u52A8\u68C0\u67E5\u66F4\u65B0\u3002",
  "updates.phase.checking": "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026",
  "updates.phase.available": "\u53D1\u73B0\u65B0\u7248\u672C",
  "updates.phase.downloading": "\u6B63\u5728\u4E0B\u8F7D\u66F4\u65B0\u2026",
  "updates.phase.ready": "\u4E0B\u8F7D\u5B8C\u6210\uFF0C\u7B49\u5F85\u5B89\u88C5",
  "updates.phase.installing": "\u6B63\u5728\u5B89\u88C5\u5E76\u91CD\u542F\u2026",
  "updates.phase.installed": "\u5DF2\u5B89\u88C5\uFF0C\u7B49\u5F85\u91CD\u542F",
  "updates.phase.error": "\u66F4\u65B0\u5931\u8D25\uFF0C\u53EF\u4EE5\u91CD\u8BD5"
};
var optimizationEn = {
  "recoveryManage.name": "Recovery point name (optional)",
  "recoveryManage.namePlaceholder": "e.g. Before login refactor",
  "recoveryManage.rename": "Rename",
  "recoveryManage.renameLabel": "New recovery point name",
  "recoveryManage.saveName": "Save name",
  "recoveryManage.clearNameHint": "Leave blank to use the default name",
  "recoveryManage.renamed": "Recovery point name updated",
  "recoveryManage.delete": "Delete recovery point",
  "recoveryManage.deleted": "Recovery point deleted",
  "recoveryManage.deleteConfirm": "Delete \u201C{name}\u201D? This removes only this recovery point and leaves the current branch and working files unchanged. If no other branch or recovery point retains the commits, Git may eventually prune them, and this point can no longer recover them.",
  "recoveryManage.invalidName": "Use at most 80 characters, without line breaks or control characters.",
  "recoveryManage.invalidPoint": "Invalid recovery point. Refresh the list and try again.",
  "operationLog.title": "Recent operations",
  "operationLog.hint": "Keeps the last 100 operations and notifications for this session. Cleared when the app closes. Duration includes queue time.",
  "operationLog.filter": "Filter operations",
  "operationLog.all": "All",
  "operationLog.errors": "Errors and warnings",
  "operationLog.clear": "Clear history",
  "operationLog.empty": "No matching operations.",
  "operationLog.details": "View details",
  "operationLog.completed": "Operation completed",
  "operationLog.retryFetch": "Retry fetch for this repository",
  "operationLog.recovery": "Recovery for this repository",
  "operationLog.recoveryFailed": "Could not open recovery for this repository",
  "operationLog.currentRecovery": "Recovery for current repository",
  "operationLog.success": "Success",
  "operationLog.error": "Failed",
  "operationLog.warning": "Warning",
  "operationLog.info": "Info",
  "updates.title": "App updates",
  "updates.availableHint": "Open release notes from the status bar to download now or handle later.",
  "updates.downloaded": "Update downloaded",
  "updates.installHint": "You can install later. Save any text you are editing before installing and restarting.",
  "updates.gitBusy": "Wait for Git tasks in all repositories to finish before installing.",
  "updates.restartConfirm": "The app will exit, install the update, and restart. Save any text you are editing first.",
  "updates.installRestart": "Install and restart",
  "updates.restart": "Restart app",
  "updates.later": "Later",
  "updates.check": "Check for updates",
  "updates.download": "Download update",
  "updates.retryDownload": "Download again",
  "updates.notes": "Release notes",
  "updates.progress": "Update download progress",
  "updates.desktopOnly": "Check and install updates in the desktop app.",
  "updates.phase.idle": "No new version found yet. You can check manually.",
  "updates.phase.checking": "Checking for updates\u2026",
  "updates.phase.available": "New version available",
  "updates.phase.downloading": "Downloading update\u2026",
  "updates.phase.ready": "Downloaded, ready to install",
  "updates.phase.installing": "Installing and restarting\u2026",
  "updates.phase.installed": "Installed, restart pending",
  "updates.phase.error": "Update failed. Try again."
};

// src/i18n/fileTree.ts
var fileTreeZh = {
  // 弹窗模式切换
  "fileTree.modeChanges": "\u53D8\u66F4\u6587\u4EF6",
  "fileTree.modeSnapshot": "\u4ED3\u5E93\u5FEB\u7167",
  "fileTree.backToOriginal": "\u8FD4\u56DE\u539F\u6587\u4EF6\u5DEE\u5F02",
  // 快照树
  "fileTree.snapshotLoading": "\u6B63\u5728\u52A0\u8F7D\u4ED3\u5E93\u5FEB\u7167\u2026",
  "fileTree.snapshotEmpty": "\u8BE5\u63D0\u4EA4\u7684\u4ED3\u5E93\u5FEB\u7167\u4E3A\u7A7A",
  "fileTree.snapshotError": "\u52A0\u8F7D\u4ED3\u5E93\u5FEB\u7167\u5931\u8D25\uFF1A{m}",
  "fileTree.retry": "\u91CD\u8BD5",
  "fileTree.filterPlaceholder": "\u6309\u8DEF\u5F84\u7B5B\u9009\u2026",
  "fileTree.noMatch": "\u6CA1\u6709\u5339\u914D\u7684\u6587\u4EF6",
  "fileTree.entryCount": "{count} \u4E2A\u6761\u76EE",
  "fileTree.treeViewLabel": "\u5FEB\u7167\u6587\u4EF6\u6811",
  "fileTree.changedInCommit": "\u672C\u6B21\u63D0\u4EA4\u5DF2\u53D8\u66F4",
  // 内容查看器
  "fileTree.selectFileHint": "\u4ECE\u5DE6\u4FA7\u9009\u62E9\u6587\u4EF6\uFF0C\u67E5\u770B\u8BE5\u63D0\u4EA4\u65F6\u70B9\u7684\u5185\u5BB9",
  "fileTree.contentViewLabel": "\u5FEB\u7167\u6587\u4EF6\u5185\u5BB9",
  "fileTree.contentLoading": "\u6B63\u5728\u52A0\u8F7D\u6587\u4EF6\u5185\u5BB9\u2026",
  "fileTree.contentError": "\u8BFB\u53D6\u6587\u4EF6\u5185\u5BB9\u5931\u8D25\uFF1A{m}",
  "fileTree.emptyFile": "\uFF08\u7A7A\u6587\u4EF6\uFF09",
  "fileTree.lineCount": "{count} \u884C",
  "fileTree.binaryFile": "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u65E0\u6CD5\u9884\u89C8\u5185\u5BB9",
  "fileTree.tooLargeFile": "\u6587\u4EF6\u5927\u5C0F {size}\uFF0C\u8D85\u8FC7\u9884\u89C8\u4E0A\u9650 {limit}",
  "fileTree.submodule": "\u5B50\u6A21\u5757\u5F15\u7528\uFF0C\u5185\u5BB9\u4FDD\u5B58\u5728\u5176\u81EA\u8EAB\u4ED3\u5E93\u4E2D",
  "fileTree.viewDiff": "\u67E5\u770B\u672C\u6B21\u63D0\u4EA4\u7684\u5DEE\u5F02"
};
var fileTreeEn = {
  // Dialog mode switch
  "fileTree.modeChanges": "Changed files",
  "fileTree.modeSnapshot": "Repository snapshot",
  "fileTree.backToOriginal": "Back to the original file diff",
  // Snapshot tree
  "fileTree.snapshotLoading": "Loading repository snapshot\u2026",
  "fileTree.snapshotEmpty": "This commit has an empty repository snapshot",
  "fileTree.snapshotError": "Failed to load repository snapshot: {m}",
  "fileTree.retry": "Retry",
  "fileTree.filterPlaceholder": "Filter by path\u2026",
  "fileTree.noMatch": "No matching files",
  "fileTree.entryCount": "{count} entries",
  "fileTree.treeViewLabel": "Snapshot file tree",
  "fileTree.changedInCommit": "Changed in this commit",
  // Content viewer
  "fileTree.selectFileHint": "Pick a file on the left to view its content at this commit",
  "fileTree.contentViewLabel": "Snapshot file content",
  "fileTree.contentLoading": "Loading file content\u2026",
  "fileTree.contentError": "Failed to read file content: {m}",
  "fileTree.emptyFile": "(empty file)",
  "fileTree.lineCount": "{count} lines",
  "fileTree.binaryFile": "Binary file; its content cannot be previewed",
  "fileTree.tooLargeFile": "File is {size}, above the {limit} preview limit",
  "fileTree.submodule": "Submodule reference; its content lives in its own repository",
  "fileTree.viewDiff": "View diff in this commit"
};

// src/i18n/historySearch.ts
var historySearchZh = {
  "flow.searchRegex": "\u4EE3\u7801\u6B63\u5219",
  "flow.searchPath": "\u8DEF\u5F84\u8FC7\u6EE4",
  "flow.searchPathPlaceholder": "\u5982 src/lib\uFF08\u53EF\u7559\u7A7A\uFF09"
};
var historySearchEn = {
  "flow.searchRegex": "Code regex",
  "flow.searchPath": "Path filter",
  "flow.searchPathPlaceholder": "e.g. src/lib (optional)"
};

// src/i18n/conflictBase.ts
var conflictBaseZh = {
  "conflictBase.toggle": "\u4E09\u65B9\u5BF9\u7167",
  "conflictBase.toggleTitle": "\u6574\u6587\u4EF6\u4E09\u65B9\u5BF9\u7167\uFF1A\u57FA\u7EBF / \u6211\u65B9 / \u5BF9\u65B9 \u5E76\u6392\u663E\u793A\uFF0C\u70B9\u51FB\u9AD8\u4EAE\u533A\u57DF\u8DF3\u8F6C\u5230\u5BF9\u5E94\u51B2\u7A81\u5757",
  "conflictBase.columnBase": "\u57FA\u7EBF\uFF08\u53EA\u8BFB\uFF09",
  "conflictBase.columnOurs": "\u6211\u65B9",
  "conflictBase.columnTheirs": "\u5BF9\u65B9",
  "conflictBase.blockCompare": "\u5BF9\u6BD4\u4E09\u65B9",
  "conflictBase.blockCompareTitle": "\u5C55\u5F00\u8BE5\u51B2\u7A81\u5757\u7684\u4E09\u65B9\u5BF9\u7167\uFF08\u57FA\u7EBF / \u6211\u65B9 / \u5BF9\u65B9\uFF09",
  "conflictBase.blockCollapse": "\u6536\u8D77\u5BF9\u7167",
  "conflictBase.blockBase": "\u57FA\u7EBF",
  "conflictBase.blockOurs": "\u6211\u65B9 \xB7 {name}",
  "conflictBase.blockTheirs": "\u5BF9\u65B9 \xB7 {name}",
  "conflictBase.baseMissing": "\u57FA\u7EBF\u7248\u672C\u4E0D\u5B58\u5728\uFF08\u5E38\u89C1\u4E8E\u53CC\u65B9\u5404\u81EA\u65B0\u589E\u540C\u4E00\u6587\u4EF6\uFF09",
  "conflictBase.sideMissing": "\u8BE5\u7248\u672C\u6682\u4E0D\u53EF\u7528",
  "conflictBase.loading": "\u6B63\u5728\u8BFB\u53D6\u4E09\u65B9\u7248\u672C\u2026",
  "conflictBase.loadFailed": "\u4E09\u65B9\u7248\u672C\u8BFB\u53D6\u5931\u8D25",
  "conflictBase.retry": "\u91CD\u8BD5",
  "conflictBase.approxRegion": "\u672A\u80FD\u7CBE\u786E\u5339\u914D\uFF0C\u6309\u4F4D\u7F6E\u63A8\u7B97",
  "conflictBase.clickHint": "\u70B9\u51FB\u9AD8\u4EAE\u533A\u57DF\u53EF\u8DF3\u8F6C\u5230\u5BF9\u5E94\u51B2\u7A81\u5757",
  "conflictBase.emptyRegion": "\uFF08\u6B64\u5904\u4E3A\u7A7A\uFF09"
};
var conflictBaseEn = {
  "conflictBase.toggle": "3-way compare",
  "conflictBase.toggleTitle": "Whole-file three-way compare: base / ours / theirs side by side. Click a highlighted region to jump to its conflict block.",
  "conflictBase.columnBase": "Base (read-only)",
  "conflictBase.columnOurs": "Ours",
  "conflictBase.columnTheirs": "Theirs",
  "conflictBase.blockCompare": "Compare sides",
  "conflictBase.blockCompareTitle": "Expand a three-way comparison of this block (base / ours / theirs)",
  "conflictBase.blockCollapse": "Collapse",
  "conflictBase.blockBase": "Base",
  "conflictBase.blockOurs": "Ours \xB7 {name}",
  "conflictBase.blockTheirs": "Theirs \xB7 {name}",
  "conflictBase.baseMissing": "No base version (typical for add/add conflicts)",
  "conflictBase.sideMissing": "This version is unavailable",
  "conflictBase.loading": "Loading the three versions\u2026",
  "conflictBase.loadFailed": "Failed to load the three versions",
  "conflictBase.retry": "Retry",
  "conflictBase.approxRegion": "No exact match; estimated by position",
  "conflictBase.clickHint": "Click a highlighted region to jump to its conflict block",
  "conflictBase.emptyRegion": "(empty here)"
};

// src/i18n/externalTools.ts
var externalToolsZh = {
  // 设置区（Git 页）
  "externalTools.title": "\u5916\u90E8\u5BF9\u6BD4/\u5408\u5E76\u5DE5\u5177",
  "externalTools.description": "\u767B\u8BB0\u672C\u673A\u5DF2\u5B89\u88C5\u7684\u5BF9\u6BD4\u6216\u5408\u5E76\u5DE5\u5177\uFF08\u5982 VSCode\u3001Beyond Compare\uFF09\uFF0C\u4FDD\u5B58\u540E\u53EF\u5728\u6587\u4EF6\u53F3\u952E\u83DC\u5355\u4E2D\u76F4\u63A5\u8C03\u7528\u3002\u914D\u7F6E\u4EC5\u4FDD\u5B58\u5728\u672C\u673A\u3002",
  "externalTools.empty": "\u5C1A\u672A\u914D\u7F6E\u5916\u90E8\u5DE5\u5177",
  "externalTools.add": "\u65B0\u589E\u5DE5\u5177",
  "externalTools.edit": "\u7F16\u8F91",
  "externalTools.delete": "\u5220\u9664",
  "externalTools.deleteTitle": "\u5220\u9664\u5916\u90E8\u5DE5\u5177",
  "externalTools.deleteDesc": "\u786E\u5B9A\u8981\u5220\u9664 {name} \u5417\uFF1F",
  "externalTools.formTitle": "\u5DE5\u5177\u914D\u7F6E",
  "externalTools.name": "\u540D\u79F0",
  "externalTools.namePlaceholder": "\u4F8B\u5982 VSCode",
  "externalTools.program": "\u7A0B\u5E8F\u5B8C\u6574\u8DEF\u5F84",
  "externalTools.programPlaceholder": "\u4F8B\u5982 C:\\Program Files\\...\\Code.exe",
  "externalTools.args": "\u53C2\u6570\u6A21\u677F",
  "externalTools.argsPlaceholder": "$LOCAL $REMOTE",
  "externalTools.argsHint": "\u5360\u4F4D\u7B26\uFF1A$LOCAL \u672C\u5730/\u5F53\u524D\u7248\u672C\uFF0C$REMOTE \u8FDC\u7AEF/HEAD \u6216 theirs\uFF0C$BASE \u51B2\u7A81\u57FA\u7EBF\uFF08\u53EF\u80FD\u7F3A\u7701\uFF09\uFF0C$MERGED \u51B2\u7A81\u5DE5\u4F5C\u533A\u6587\u4EF6\u3002\u53C2\u6570\u4E0D\u7ECF shell\u3001\u6309\u5B57\u9762\u4F20\u5165\uFF0C\u7981\u6B62\u5F15\u53F7\u4E0E\u5206\u53F7\u3002",
  "externalTools.mode": "\u5DE5\u5177\u7C7B\u578B",
  "externalTools.mode.diff": "\u5BF9\u6BD4 (diff)",
  "externalTools.mode.merge": "\u5408\u5E76 (merge)",
  "externalTools.save": "\u4FDD\u5B58",
  "externalTools.saved": "\u5916\u90E8\u5DE5\u5177\u5DF2\u4FDD\u5B58",
  "externalTools.deleted": "\u5916\u90E8\u5DE5\u5177\u5DF2\u5220\u9664",
  "externalTools.loadFailed": "\u5916\u90E8\u5DE5\u5177\u914D\u7F6E\u52A0\u8F7D\u5931\u8D25",
  "externalTools.saveFailed": "\u5916\u90E8\u5DE5\u5177\u4FDD\u5B58\u5931\u8D25",
  "externalTools.deleteFailed": "\u5916\u90E8\u5DE5\u5177\u5220\u9664\u5931\u8D25",
  // 工作区右键菜单
  "externalTools.diffWith": "\u7528 {name} \u5BF9\u6BD4",
  "externalTools.mergeWith": "\u7528 {name} \u5408\u5E76",
  "externalTools.launched": "\u5DF2\u8C03\u7528\u5916\u90E8\u5DE5\u5177",
  "externalTools.launchFailed": "\u5916\u90E8\u5DE5\u5177\u542F\u52A8\u5931\u8D25"
};
var externalToolsEn = {
  // Settings section (Git tab)
  "externalTools.title": "External diff/merge tools",
  "externalTools.description": "Register locally installed diff or merge tools (VSCode, Beyond Compare, ...), then launch them from file context menus. Configuration stays on this machine.",
  "externalTools.empty": "No external tools configured",
  "externalTools.add": "Add tool",
  "externalTools.edit": "Edit",
  "externalTools.delete": "Delete",
  "externalTools.deleteTitle": "Delete external tool",
  "externalTools.deleteDesc": "Delete {name}?",
  "externalTools.formTitle": "Tool configuration",
  "externalTools.name": "Name",
  "externalTools.namePlaceholder": "e.g. VSCode",
  "externalTools.program": "Program full path",
  "externalTools.programPlaceholder": "e.g. C:\\Program Files\\...\\Code.exe",
  "externalTools.args": "Arguments template",
  "externalTools.argsPlaceholder": "$LOCAL $REMOTE",
  "externalTools.argsHint": "Placeholders: $LOCAL local/current version, $REMOTE remote/HEAD or theirs, $BASE conflict base (may be absent), $MERGED conflicted working file. Arguments are passed literally without a shell; quotes and semicolons are not allowed.",
  "externalTools.mode": "Tool type",
  "externalTools.mode.diff": "Diff",
  "externalTools.mode.merge": "Merge",
  "externalTools.save": "Save",
  "externalTools.saved": "External tool saved",
  "externalTools.deleted": "External tool deleted",
  "externalTools.loadFailed": "Failed to load external tools",
  "externalTools.saveFailed": "Failed to save external tool",
  "externalTools.deleteFailed": "Failed to delete external tool",
  // Working tree context menu
  "externalTools.diffWith": "Diff with {name}",
  "externalTools.mergeWith": "Merge with {name}",
  "externalTools.launched": "Launched external tool",
  "externalTools.launchFailed": "Failed to launch external tool"
};

// src/i18n/profiles.ts
var profilesZh = {
  "profiles.menuTitle": "GitHub \u8D26\u53F7",
  "profiles.accountMenuLabel": "\u5207\u6362 GitHub \u8D26\u53F7",
  "profiles.addAccount": "\u6DFB\u52A0\u8D26\u53F7",
  "profiles.manage": "\u7BA1\u7406\u8D26\u53F7\u2026",
  "profiles.addingHint": "\u6B63\u5728\u6DFB\u52A0\u65B0\u8D26\u53F7\uFF0C\u767B\u5F55\u6210\u529F\u540E\u51ED\u636E\u5C06\u4FDD\u5B58\u5728\u65B0\u8D26\u53F7\u4E0B\uFF1B\u53D6\u6D88\u5219\u8FD4\u56DE\u539F\u8D26\u53F7",
  "profiles.defaultLabel": "\u8D26\u53F7 {n}",
  "profiles.addCancelled": "\u5DF2\u53D6\u6D88\u6DFB\u52A0\u65B0\u8D26\u53F7\uFF0C\u5DF2\u8FD4\u56DE\u539F\u8D26\u53F7",
  "profiles.switchedTo": "\u5DF2\u5207\u6362\u5230 {label}"
};
var profilesEn = {
  "profiles.menuTitle": "GitHub accounts",
  "profiles.accountMenuLabel": "Switch GitHub account",
  "profiles.addAccount": "Add account",
  "profiles.manage": "Manage accounts\u2026",
  "profiles.addingHint": "Adding a new account: credentials will be stored under it once you sign in; cancelling returns to the previous account",
  "profiles.defaultLabel": "Account {n}",
  "profiles.addCancelled": "New account sign-in cancelled, returned to the previous account",
  "profiles.switchedTo": "Switched to {label}"
};

// src/i18n/bisect.ts
var bisectZh = {
  "bisect.open": "\u4E8C\u5206\u5B9A\u4F4D Bug",
  "bisect.title": "\u4E8C\u5206\u67E5\u627E\u5411\u5BFC",
  "bisect.subtitle": "\u5F15\u5BFC\u5F0F\u5B9A\u4F4D\u5F15\u5165 bug \u7684\u7B2C\u4E00\u4E2A\u63D0\u4EA4",
  "bisect.step.range": "\u9009\u62E9\u8303\u56F4",
  "bisect.step.testing": "\u6D4B\u8BD5\u5019\u9009",
  "bisect.step.result": "\u5B9A\u4F4D\u7ED3\u679C",
  "bisect.badRef": "\u574F\u63D0\u4EA4\uFF08\u95EE\u9898\u5B58\u5728\uFF09",
  "bisect.goodRef": "\u597D\u63D0\u4EA4\uFF08\u95EE\u9898\u4E0D\u5B58\u5728\uFF09",
  "bisect.badHead": "HEAD\uFF08\u5F53\u524D\u68C0\u51FA\uFF09",
  "bisect.dirtyHint": "\u5F00\u59CB\u540E\u4F1A\u5728\u5386\u53F2\u63D0\u4EA4\u4E4B\u95F4\u5207\u6362\u68C0\u51FA\uFF0C\u8BF7\u5148\u63D0\u4EA4\u6216\u6682\u5B58\u5F53\u524D\u6539\u52A8\u3002",
  "bisect.rangeCount": "\u8BE5\u8303\u56F4\u5305\u542B {n} \u4E2A\u5F85\u6D4B\u63D0\u4EA4",
  "bisect.rangeMissing": "\u8BF7\u9009\u62E9\u574F\u63D0\u4EA4\u4E0E\u597D\u63D0\u4EA4",
  "bisect.sameRef": "\u597D\u63D0\u4EA4\u4E0E\u574F\u63D0\u4EA4\u4E0D\u80FD\u76F8\u540C",
  "bisect.badOrder": "\u597D\u63D0\u4EA4\u5FC5\u987B\u662F\u574F\u63D0\u4EA4\u7684\u7956\u5148",
  "bisect.invalidRef": "\u65E0\u6CD5\u89E3\u6790\u8BE5\u63D0\u4EA4\u5F15\u7528",
  "bisect.start": "\u5F00\u59CB\u4E8C\u5206",
  "bisect.resumed": "\u68C0\u6D4B\u5230\u8FDB\u884C\u4E2D\u7684 bisect \u4F1A\u8BDD\uFF0C\u5DF2\u6062\u590D\u5230\u6D4B\u8BD5\u6B65\u9AA4",
  "bisect.candidate": "\u5F53\u524D\u5019\u9009\u63D0\u4EA4",
  "bisect.stepsRemaining": "\u5269\u4F59\u7EA6 {n} \u6B65\uFF08\u4F30\u7B97\uFF09",
  "bisect.markGood": "Good\uFF1A\u8BE5\u7248\u672C\u6B63\u5E38",
  "bisect.markBad": "Bad\uFF1A\u95EE\u9898\u590D\u73B0",
  "bisect.markSkip": "Skip\uFF1A\u65E0\u6CD5\u6D4B\u8BD5",
  "bisect.viewLog": "\u67E5\u770B\u8FC7\u7A0B",
  "bisect.hideLog": "\u6536\u8D77\u8FC7\u7A0B",
  "bisect.logEmpty": "\u6682\u65E0 bisect \u65E5\u5FD7",
  "bisect.reset": "\u7ED3\u675F\u5E76\u8FD8\u539F",
  "bisect.resetConfirmTitle": "\u7ED3\u675F bisect\uFF1F",
  "bisect.resetConfirmDesc": "\u5C06\u7ED3\u675F\u672C\u6B21\u4E8C\u5206\u5E76\u56DE\u5230\u539F\u6765\u7684\u68C0\u51FA\u4F4D\u7F6E\uFF0C\u5DF2\u6536\u96C6\u7684\u6807\u8BB0\u4F1A\u4E22\u5F03\u3002",
  "bisect.leaveConfirmTitle": "\u4ECD\u5728 bisect \u4E2D",
  "bisect.leaveConfirmDesc": "\u5173\u95ED\u540E bisect \u4F1A\u8BDD\u4ECD\u5728\u8FDB\u884C\uFF0C\u53EF\u968F\u65F6\u91CD\u65B0\u6253\u5F00\u5411\u5BFC\u6062\u590D\u3002\u786E\u5B9A\u5173\u95ED\uFF1F",
  "bisect.resultLeaveConfirmDesc": "\u5DF2\u5B9A\u4F4D\u9996\u4E2A\u574F\u63D0\u4EA4\uFF0C\u4F46 bisect \u4F1A\u8BDD\u5C1A\u672A\u8FD8\u539F\u3002\u5EFA\u8BAE\u5148\u70B9\u51FB Finish \u8FD8\u539F\uFF0C\u518D\u5173\u95ED\u3002\u786E\u5B9A\u4ECD\u8981\u5173\u95ED\uFF1F",
  "bisect.firstBad": "\u9996\u4E2A\u574F\u63D0\u4EA4",
  "bisect.resultHint": "\u8FD9\u5C31\u662F\u5F15\u5165 bug \u7684\u7B2C\u4E00\u4E2A\u63D0\u4EA4\u3002\u70B9\u51FB Finish \u7ED3\u675F bisect \u5E76\u56DE\u5230\u539F\u6765\u7684\u68C0\u51FA\u4F4D\u7F6E\u3002",
  "bisect.files": "\u8BE5\u63D0\u4EA4\u53D8\u66F4\uFF08{n} \u4E2A\u6587\u4EF6\uFF09",
  "bisect.finish": "Finish\uFF1A\u8FD8\u539F\u5230\u539F\u68C0\u51FA\u4F4D\u7F6E",
  "bisect.dirtyBlocked": "\u5DE5\u4F5C\u533A\u6709\u672A\u63D0\u4EA4\u6539\u52A8\uFF0Cgit \u62D2\u7EDD\u5207\u6362\u63D0\u4EA4\u3002\u8BF7\u5148\u63D0\u4EA4\u6216\u6682\u5B58\u540E\u518D\u7EE7\u7EED\u3002",
  "bisect.loadFailed": "\u8BFB\u53D6 bisect \u72B6\u6001\u5931\u8D25",
  "bisect.startFailed": "\u542F\u52A8 bisect \u5931\u8D25",
  "bisect.markFailed": "\u6807\u8BB0\u5931\u8D25",
  "bisect.resetFailed": "\u8FD8\u539F\u5931\u8D25",
  "bisect.resetDone": "bisect \u5DF2\u8FD8\u539F"
};
var bisectEn = {
  "bisect.open": "Bisect for a bug",
  "bisect.title": "Bisect wizard",
  "bisect.subtitle": "Guided search for the first commit that introduced a bug",
  "bisect.step.range": "Pick range",
  "bisect.step.testing": "Test candidates",
  "bisect.step.result": "Result",
  "bisect.badRef": "Bad commit (bug present)",
  "bisect.goodRef": "Good commit (bug-free)",
  "bisect.badHead": "HEAD (currently checked out)",
  "bisect.dirtyHint": "Testing switches between historical commits. Commit or stash your current changes first.",
  "bisect.rangeCount": "{n} commits to test in this range",
  "bisect.rangeMissing": "Pick a bad commit and a good commit first",
  "bisect.sameRef": "Good and bad commits must differ",
  "bisect.badOrder": "The good commit must be an ancestor of the bad commit",
  "bisect.invalidRef": "Cannot resolve this revision",
  "bisect.start": "Start bisect",
  "bisect.resumed": "Resumed the running bisect session",
  "bisect.candidate": "Current candidate",
  "bisect.stepsRemaining": "About {n} steps left (estimate)",
  "bisect.markGood": "Good: works fine",
  "bisect.markBad": "Bad: bug reproduces",
  "bisect.markSkip": "Skip: cannot test",
  "bisect.viewLog": "View log",
  "bisect.hideLog": "Hide log",
  "bisect.logEmpty": "No bisect log yet",
  "bisect.reset": "Abort & reset",
  "bisect.resetConfirmTitle": "Abort bisect?",
  "bisect.resetConfirmDesc": "This ends the bisect and returns to your original checkout; collected marks are discarded.",
  "bisect.leaveConfirmTitle": "Bisect still running",
  "bisect.leaveConfirmDesc": "The bisect session keeps running after closing; reopen the wizard to resume. Close anyway?",
  "bisect.resultLeaveConfirmDesc": "The first bad commit is known but the session is not reset yet. Finish is recommended before closing. Close anyway?",
  "bisect.firstBad": "First bad commit",
  "bisect.resultHint": "This is the first commit that introduced the bug. Finish ends the bisect and restores your original checkout.",
  "bisect.files": "Changed files ({n})",
  "bisect.finish": "Finish: restore checkout",
  "bisect.dirtyBlocked": "Git refused to switch commits because of uncommitted changes. Commit or stash them first.",
  "bisect.loadFailed": "Failed to read bisect state",
  "bisect.startFailed": "Failed to start bisect",
  "bisect.markFailed": "Marking failed",
  "bisect.resetFailed": "Reset failed",
  "bisect.resetDone": "Bisect reset"
};

// src/i18n/releaseNotes.ts
var releaseNotesZh = {
  "releaseNotes.command": "AI \u751F\u6210 Release Notes",
  "releaseNotes.title": "\u751F\u6210 Release Notes",
  "releaseNotes.scope": "\u4ECE\u9009\u5B9A\u7684\u63D0\u4EA4\u533A\u95F4\u751F\u6210\u9762\u5411\u7528\u6237\u7684 Markdown \u53D1\u5E03\u8BF4\u660E\uFF0C\u53EF\u590D\u5236\u5230 GitHub Releases \u7B49\u53D1\u5E03\u9875\u3002",
  "releaseNotes.from": "\u8D77\u70B9\uFF08\u542B\u57FA\u7EBF\u4E4B\u540E\u7684\u63D0\u4EA4\uFF09",
  "releaseNotes.to": "\u7EC8\u70B9",
  "releaseNotes.customRef": "\u81EA\u5B9A\u4E49 rev\u2026",
  "releaseNotes.customRefPlaceholder": "\u8F93\u5165\u5206\u652F\u3001\u6807\u7B7E\u6216\u63D0\u4EA4\u54C8\u5E0C\uFF1B\u7559\u7A7A\u5219\u81EA\u52A8\u4F7F\u7528\u6700\u65B0\u6807\u7B7E",
  "releaseNotes.toPlaceholder": "\u9ED8\u8BA4 HEAD",
  "releaseNotes.generate": "\u751F\u6210\u53D1\u5E03\u8BF4\u660E",
  "releaseNotes.regenerate": "\u91CD\u65B0\u751F\u6210",
  "releaseNotes.generating": "\u6B63\u5728\u751F\u6210\u53D1\u5E03\u8BF4\u660E\u2026",
  "releaseNotes.cancel": "\u53D6\u6D88\u751F\u6210",
  "releaseNotes.cancelled": "\u5DF2\u53D6\u6D88\u751F\u6210\uFF0C\u672A\u4FEE\u6539\u4ED3\u5E93\u3002",
  "releaseNotes.copy": "\u590D\u5236 Markdown",
  "releaseNotes.copied": "Release Notes \u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",
  "releaseNotes.copyFailed": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u6587\u672C\u590D\u5236\u3002",
  "releaseNotes.resultMeta": "\u57FA\u4E8E {n} \u6761\u63D0\u4EA4\u751F\u6210",
  "releaseNotes.truncated": "\u5DF2\u622A\u65AD",
  "releaseNotes.truncatedNote": "> \u6CE8\u610F\uFF1A\u8BE5\u533A\u95F4\u5171 {total} \u6761\u63D0\u4EA4\uFF0C\u4EE5\u4E0B\u8BF4\u660E\u4EC5\u57FA\u4E8E\u6700\u65B0 {cap} \u6761\u751F\u6210\uFF0C\u66F4\u65E9\u7684\u63D0\u4EA4\u672A\u5305\u542B\u3002",
  "releaseNotes.configureAi": "\u8BF7\u5148\u5728 \u8BBE\u7F6E \u2192 AI \u914D\u7F6E \u4E2D\u542F\u7528\u517C\u5BB9\u63A5\u53E3\uFF0C\u5E76\u586B\u5199\u6A21\u578B\u3001\u5730\u5740\u548C API Key\u3002",
  "releaseNotes.noBaseline": "\u4ED3\u5E93\u6CA1\u6709\u4EFB\u4F55\u6807\u7B7E\uFF0C\u65E0\u6CD5\u81EA\u52A8\u786E\u5B9A\u57FA\u7EBF\u3002\u8BF7\u5728\u201C\u8D77\u70B9\u201D\u4E2D\u8F93\u5165\u5206\u652F\u3001\u6807\u7B7E\u6216\u63D0\u4EA4\u54C8\u5E0C\u3002",
  "releaseNotes.emptyRange": "\u6240\u9009\u533A\u95F4 {range} \u6CA1\u6709\u63D0\u4EA4\uFF08\u8D77\u70B9\u4E0E\u7EC8\u70B9\u76F8\u540C\uFF0C\u6216\u7EC8\u70B9\u4E0D\u665A\u4E8E\u8D77\u70B9\uFF09\u3002\u8BF7\u8C03\u6574\u533A\u95F4\u540E\u91CD\u8BD5\u3002",
  "releaseNotes.invalidRef": "\u65E0\u6CD5\u8BC6\u522B\u7684\u5F15\u7528 \u201C{ref}\u201D\uFF0C\u8BF7\u8F93\u5165\u6709\u6548\u7684\u5206\u652F\u3001\u6807\u7B7E\u6216\u63D0\u4EA4\u54C8\u5E0C\u3002",
  "releaseNotes.timeout": "AI \u751F\u6210\u8D85\u8FC7 60 \u79D2\uFF0C\u8BF7\u91CD\u8BD5\u6216\u9009\u62E9\u54CD\u5E94\u66F4\u5FEB\u7684\u6A21\u578B\u3002\u4ED3\u5E93\u5C1A\u672A\u4FEE\u6539\u3002",
  "releaseNotes.aiFailed": "AI \u751F\u6210\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5 AI \u63A5\u53E3\u3001\u6A21\u578B\u6216\u51ED\u636E\u540E\u91CD\u8BD5\u3002\u4ED3\u5E93\u5C1A\u672A\u4FEE\u6539\u3002",
  "releaseNotes.openSettings": "\u6253\u5F00\u8BBE\u7F6E"
};
var releaseNotesEn = {
  "releaseNotes.command": "Generate release notes (AI)",
  "releaseNotes.title": "Generate release notes",
  "releaseNotes.scope": "Generate user-facing Markdown release notes from a selected commit range, ready to paste into GitHub Releases or similar.",
  "releaseNotes.from": "From (commits after this baseline)",
  "releaseNotes.to": "To",
  "releaseNotes.customRef": "Custom rev\u2026",
  "releaseNotes.customRefPlaceholder": "Branch, tag or commit hash; leave empty to use the latest tag",
  "releaseNotes.toPlaceholder": "Defaults to HEAD",
  "releaseNotes.generate": "Generate release notes",
  "releaseNotes.regenerate": "Regenerate",
  "releaseNotes.generating": "Generating release notes\u2026",
  "releaseNotes.cancel": "Cancel generation",
  "releaseNotes.cancelled": "Generation cancelled. Nothing was modified.",
  "releaseNotes.copy": "Copy Markdown",
  "releaseNotes.copied": "Release notes copied to the clipboard.",
  "releaseNotes.copyFailed": "Copy failed. Select the text manually instead.",
  "releaseNotes.resultMeta": "Based on {n} commits",
  "releaseNotes.truncated": "Truncated",
  "releaseNotes.truncatedNote": "> Note: the range contains {total} commits; the notes below cover only the latest {cap}. Older commits are not included.",
  "releaseNotes.configureAi": "Enable an OpenAI-compatible endpoint with model, base URL and API key in Settings \u2192 AI first.",
  "releaseNotes.noBaseline": 'This repository has no tags, so no baseline could be picked automatically. Enter a branch, tag or commit hash under "From".',
  "releaseNotes.emptyRange": 'The selected range {range} has no commits (the endpoints match, or "To" is not newer than "From"). Adjust the range and retry.',
  "releaseNotes.invalidRef": 'Unknown ref "{ref}". Enter a valid branch, tag or commit hash.',
  "releaseNotes.timeout": "Generation exceeded 60 seconds. Retry or choose a faster model. The repository has not been changed.",
  "releaseNotes.aiFailed": "Generation could not finish. Check the AI endpoint, model or credentials and retry. The repository has not been changed.",
  "releaseNotes.openSettings": "Open settings"
};

// src/i18n/prReview.ts
var prReviewZh = {
  // 行入口与弹窗壳
  "prReview.open": "\u8BC4\u5BA1",
  "prReview.openTitle": "\u6253\u5F00 PR #{n} \u7684\u8BC4\u5BA1\u8BE6\u60C5\uFF08\u5BF9\u8BDD\u3001\u6587\u4EF6\u4E0E\u884C\u5185\u8BC4\u8BBA\uFF09",
  "prReview.openAria": "\u8BC4\u5BA1\u62C9\u53D6\u8BF7\u6C42 #{n}",
  "prReview.dialogLabel": "Pull Request \u8BC4\u5BA1\u8BE6\u60C5",
  "prReview.tabConversation": "\u5BF9\u8BDD",
  "prReview.tabFiles": "\u6587\u4EF6",
  // Conversation 时间线
  "prReview.timelineEmpty": "\u6682\u65E0\u5BF9\u8BDD\u6216\u8BC4\u5BA1\u8BB0\u5F55",
  "prReview.badgeApproved": "\u5DF2\u6279\u51C6",
  "prReview.badgeChangesRequested": "\u8BF7\u6C42\u4FEE\u6539",
  "prReview.badgeCommented": "\u5DF2\u8BC4\u8BBA",
  "prReview.badgeDismissed": "\u5DF2\u64A4\u9500",
  "prReview.badgePending": "\u5F85\u63D0\u4EA4",
  // 文件 Tab
  "prReview.filesTitle": "\u53D8\u66F4\u6587\u4EF6",
  "prReview.filesLoading": "\u6B63\u5728\u52A0\u8F7D\u53D8\u66F4\u6587\u4EF6...",
  "prReview.filesEmpty": "\u6B64 Pull Request \u6CA1\u6709\u6587\u4EF6\u53D8\u66F4",
  "prReview.truncatedNotice": "\u53D8\u66F4\u6587\u4EF6\u8F83\u591A\uFF0C\u4EC5\u5C55\u793A\u524D {n} \u4E2A",
  "prReview.binaryFile": "\u4E8C\u8FDB\u5236\u6587\u4EF6\u6216\u5DEE\u5F02\u8FC7\u5927\uFF0C\u65E0\u6CD5\u663E\u793A\u5185\u5BB9",
  "prReview.hunksCollapsed": "\u5DEE\u5F02\u8F83\u5927\uFF0C\u4EE3\u7801\u5757\u9ED8\u8BA4\u6298\u53E0\uFF0C\u70B9\u51FB\u5C55\u5F00",
  "prReview.expandHunk": "\u5C55\u5F00\u4EE3\u7801\u5757",
  "prReview.collapseHunk": "\u6536\u8D77\u4EE3\u7801\u5757",
  "prReview.fileComments": "{n} \u6761\u884C\u5185\u8BC4\u8BBA",
  // 行内评论
  "prReview.addComment": "\u8BC4\u8BBA",
  "prReview.addCommentAria": "\u5728\u7B2C {line} \u884C\u6DFB\u52A0\u8BC4\u8BBA",
  "prReview.commentPlaceholder": "\u8F93\u5165\u884C\u5185\u8BC4\u8BBA...",
  "prReview.commentSubmit": "\u6DFB\u52A0",
  "prReview.lineLabel": "\u7B2C {line} \u884C",
  "prReview.sideLeft": "\u65E7\u4EE3\u7801",
  "prReview.sideRight": "\u65B0\u4EE3\u7801",
  "prReview.draftRemove": "\u79FB\u9664\u8BE5\u6761\u5F85\u63D0\u4EA4\u8BC4\u8BBA",
  "prReview.reviewCommentsTitle": "\u884C\u5185\u8BC4\u8BBA",
  "prReview.pendingBadge": "{n} \u6761\u5F85\u63D0\u4EA4\u8BC4\u8BBA",
  "prReview.draftHint": "\u5728\u6587\u4EF6\u5DEE\u5F02\u4E2D\u9009\u4E2D\u884C\u5373\u53EF\u6DFB\u52A0\u884C\u5185\u8BC4\u8BBA",
  // 提交评审区
  "prReview.submitTitle": "\u63D0\u4EA4\u8BC4\u5BA1",
  "prReview.eventApprove": "\u6279\u51C6 (Approve)",
  "prReview.eventRequestChanges": "\u8BF7\u6C42\u4FEE\u6539 (Request changes)",
  "prReview.eventComment": "\u4EC5\u8BC4\u8BBA (Comment)",
  "prReview.bodyLabel": "\u603B\u8BC4",
  "prReview.bodyPlaceholder": "\u603B\u7ED3\u4F60\u7684\u8BC4\u5BA1\u610F\u89C1\uFF08\u8BF7\u6C42\u4FEE\u6539\u65F6\u5FC5\u586B\uFF09...",
  "prReview.submit": "\u63D0\u4EA4\u8BC4\u5BA1",
  "prReview.submitting": "\u63D0\u4EA4\u4E2D...",
  "prReview.submitted": "\u8BC4\u5BA1\u5DF2\u63D0\u4EA4",
  "prReview.submitFailed": "\u8BC4\u5BA1\u63D0\u4EA4\u5931\u8D25",
  // 校验与降级
  "prReview.changesNeedBody": "\u8BF7\u6C42\u4FEE\u6539\u5FC5\u987B\u586B\u5199\u603B\u8BC4\u8BF4\u660E",
  "prReview.commentEmpty": "\u884C\u5185\u8BC4\u8BBA\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A",
  "prReview.invalidEvent": "\u672A\u77E5\u7684\u8BC4\u5BA1\u7C7B\u578B",
  "prReview.readonlyMerged": "\u8BE5 Pull Request \u5DF2\u5408\u5E76\uFF0C\u8BC4\u5BA1\u533A\u53EA\u8BFB",
  "prReview.readonlyClosed": "\u8BE5 Pull Request \u5DF2\u5173\u95ED\uFF0C\u8BC4\u5BA1\u533A\u53EA\u8BFB",
  "prReview.noPermission": "\u5F53\u524D\u8D26\u53F7\u6216 Token \u65E0\u6743\u9650\u63D0\u4EA4\u8BC4\u5BA1\uFF08401/403\uFF09\uFF0C\u4EC5\u53EF\u6D4F\u89C8",
  "prReview.loadFailed": "\u8BC4\u5BA1\u6570\u636E\u52A0\u8F7D\u5931\u8D25",
  "prReview.filesLoadFailed": "\u53D8\u66F4\u6587\u4EF6\u52A0\u8F7D\u5931\u8D25"
};
var prReviewEn = {
  // Row entry and dialog shell
  "prReview.open": "Review",
  "prReview.openTitle": "Open review details for PR #{n} (conversation, files and inline comments)",
  "prReview.openAria": "Review pull request #{n}",
  "prReview.dialogLabel": "Pull Request review details",
  "prReview.tabConversation": "Conversation",
  "prReview.tabFiles": "Files",
  // Conversation timeline
  "prReview.timelineEmpty": "No conversation or reviews yet",
  "prReview.badgeApproved": "Approved",
  "prReview.badgeChangesRequested": "Changes requested",
  "prReview.badgeCommented": "Commented",
  "prReview.badgeDismissed": "Dismissed",
  "prReview.badgePending": "Pending",
  // Files tab
  "prReview.filesTitle": "Changed files",
  "prReview.filesLoading": "Loading changed files...",
  "prReview.filesEmpty": "This pull request has no file changes",
  "prReview.truncatedNotice": "Many changed files: showing the first {n} only",
  "prReview.binaryFile": "Binary file or oversized diff; content unavailable",
  "prReview.hunksCollapsed": "Large diff: hunks are collapsed by default, click to expand",
  "prReview.expandHunk": "Expand hunk",
  "prReview.collapseHunk": "Collapse hunk",
  "prReview.fileComments": "{n} inline comments",
  // Inline comments
  "prReview.addComment": "Comment",
  "prReview.addCommentAria": "Add a comment on line {line}",
  "prReview.commentPlaceholder": "Write an inline comment...",
  "prReview.commentSubmit": "Add",
  "prReview.lineLabel": "Line {line}",
  "prReview.sideLeft": "Old code",
  "prReview.sideRight": "New code",
  "prReview.draftRemove": "Remove this pending comment",
  "prReview.reviewCommentsTitle": "Inline comments",
  "prReview.pendingBadge": "{n} pending comments",
  "prReview.draftHint": "Select a line in the diff to add an inline comment",
  // Review submission
  "prReview.submitTitle": "Submit review",
  "prReview.eventApprove": "Approve",
  "prReview.eventRequestChanges": "Request changes",
  "prReview.eventComment": "Comment",
  "prReview.bodyLabel": "Summary",
  "prReview.bodyPlaceholder": "Summarize your review (required when requesting changes)...",
  "prReview.submit": "Submit review",
  "prReview.submitting": "Submitting...",
  "prReview.submitted": "Review submitted",
  "prReview.submitFailed": "Failed to submit review",
  // Validation and degradation
  "prReview.changesNeedBody": "Requesting changes requires a summary body",
  "prReview.commentEmpty": "Inline comment body cannot be empty",
  "prReview.invalidEvent": "Unknown review event",
  "prReview.readonlyMerged": "This pull request is merged; the review form is read-only",
  "prReview.readonlyClosed": "This pull request is closed; the review form is read-only",
  "prReview.noPermission": "The current account or token cannot submit reviews (401/403); browse only",
  "prReview.loadFailed": "Failed to load review data",
  "prReview.filesLoadFailed": "Failed to load changed files"
};

// src/i18n/notifications.ts
var notificationsZh = {
  "notifications.ciSuccessTitle": "CI \u68C0\u67E5\u5168\u90E8\u901A\u8FC7",
  "notifications.ciSuccessDesc": "\u4ED3\u5E93 {repo} \u7684\u76D1\u542C\u68C0\u67E5\u5DF2\u5B8C\u6210\uFF1A{summary}",
  "notifications.ciFailureTitle": "CI \u68C0\u67E5\u5931\u8D25",
  "notifications.ciFailureDesc": "\u4ED3\u5E93 {repo} \u7684\u76D1\u542C\u68C0\u67E5\u672A\u5168\u90E8\u901A\u8FC7\uFF1A{summary}",
  "notifications.ciSummaryPassed": "\u901A\u8FC7 {passed}/{total}",
  "notifications.ciSummaryFailedNames": "\u5931\u8D25\uFF1A{names}",
  "notifications.ciSummaryMore": "\u5176\u4F59 {count} \u9879"
};
var notificationsEn = {
  "notifications.ciSuccessTitle": "All CI checks passed",
  "notifications.ciSuccessDesc": "Watched checks finished for {repo}: {summary}",
  "notifications.ciFailureTitle": "CI checks failed",
  "notifications.ciFailureDesc": "Not all watched checks passed for {repo}: {summary}",
  "notifications.ciSummaryPassed": "passed {passed}/{total}",
  "notifications.ciSummaryFailedNames": "failed: {names}",
  "notifications.ciSummaryMore": "{count} more"
};

// src/i18n/workspaces.ts
var workspacesZh = {
  "workspaces.manage": "\u7BA1\u7406\u5206\u7EC4\u2026",
  "workspaces.ungrouped": "\u672A\u5206\u7EC4",
  "workspaces.assignTitle": "\u6307\u6D3E\u5230\u5206\u7EC4",
  "workspaces.removeFromGroup": "\u79FB\u51FA\u5206\u7EC4",
  "workspaces.groupFetchAll": "\u83B7\u53D6\u6574\u7EC4\u8FDC\u7AEF (fetch)",
  "workspaces.groupPullAll": "\u62C9\u53D6\u5F53\u524D\u6253\u5F00\u7684\u4ED3\u5E93",
  "workspaces.groupPullDisabled": "\u4EC5\u652F\u6301\u62C9\u53D6\u5F53\u524D\u6253\u5F00\u7684\u4ED3\u5E93\uFF1B\u672A\u6253\u5F00\u7684\u4ED3\u5E93\u62C9\u53D6\u4F1A\u6539\u52A8\u5176\u5DE5\u4F5C\u533A\uFF0C\u5DF2\u7981\u7528",
  "workspaces.groupEmpty": "\u8BE5\u5206\u7EC4\u6682\u65E0\u4ED3\u5E93",
  "workspaces.batchFetching": "\u6B63\u5728\u83B7\u53D6 {n} \u4E2A\u4ED3\u5E93\u7684\u8FDC\u7AEF\u2026",
  "workspaces.batchFetchDone": "\u6574\u7EC4\u83B7\u53D6\u5B8C\u6210\uFF1A{n} \u4E2A\u4ED3\u5E93\u5DF2\u66F4\u65B0",
  "workspaces.batchFetchPartial": "\u83B7\u53D6\u5B8C\u6210\uFF1A\u6210\u529F {n} \u4E2A\uFF0C\u5931\u8D25 {m} \u4E2A",
  "workspaces.batchNoAuthorized": "\u7EC4\u5185\u6CA1\u6709\u5DF2\u6388\u6743\u7684\u4ED3\u5E93",
  "workspaces.batchNoAuthorizedDesc": "\u8BF7\u5148\u5728\u5E94\u7528\u5185\u6253\u5F00\u5E76\u6388\u6743\u5BF9\u5E94\u4ED3\u5E93\uFF0C\u518D\u91CD\u8BD5\u6279\u91CF\u83B7\u53D6\u3002",
  "workspaces.createPlaceholder": "\u65B0\u5206\u7EC4\u540D\u79F0",
  "workspaces.create": "\u65B0\u5EFA\u5206\u7EC4",
  "workspaces.rename": "\u91CD\u547D\u540D\u5206\u7EC4",
  "workspaces.delete": "\u5220\u9664\u5206\u7EC4",
  "workspaces.deleteConfirmTitle": "\u786E\u8BA4\u5220\u9664",
  "workspaces.deleteConfirm": "\u5220\u9664\u540E\u7EC4\u5185\u4ED3\u5E93\u56DE\u5230\u672A\u5206\u7EC4",
  "workspaces.nameEmpty": "\u7EC4\u540D\u4E0D\u80FD\u4E3A\u7A7A",
  "workspaces.nameDuplicate": "\u5DF2\u5B58\u5728\u540C\u540D\u5206\u7EC4",
  "workspaces.empty": "\u8FD8\u6CA1\u6709\u5206\u7EC4\uFF0C\u5148\u5728\u4E0A\u65B9\u521B\u5EFA\u4E00\u4E2A"
};
var workspacesEn = {
  "workspaces.manage": "Manage groups\u2026",
  "workspaces.ungrouped": "Ungrouped",
  "workspaces.assignTitle": "Assign to group",
  "workspaces.removeFromGroup": "Remove from group",
  "workspaces.groupFetchAll": "Fetch all in group",
  "workspaces.groupPullAll": "Pull the currently open repository",
  "workspaces.groupPullDisabled": "Only the currently open repository can be pulled; pulling an unopened repository would modify its working tree, so it is disabled here",
  "workspaces.groupEmpty": "No repositories in this group",
  "workspaces.batchFetching": "Fetching {n} repositories\u2026",
  "workspaces.batchFetchDone": "Group fetch finished: {n} repositories updated",
  "workspaces.batchFetchPartial": "Fetch finished: {n} succeeded, {m} failed",
  "workspaces.batchNoAuthorized": "No authorized repositories in this group",
  "workspaces.batchNoAuthorizedDesc": "Open and approve the repositories in the app first, then retry the batch fetch.",
  "workspaces.createPlaceholder": "New group name",
  "workspaces.create": "Create group",
  "workspaces.rename": "Rename group",
  "workspaces.delete": "Delete group",
  "workspaces.deleteConfirmTitle": "Confirm delete",
  "workspaces.deleteConfirm": "Repositories in this group return to Ungrouped",
  "workspaces.nameEmpty": "Group name cannot be empty",
  "workspaces.nameDuplicate": "A group with the same name already exists",
  "workspaces.empty": "No groups yet \u2014 create one above"
};

// src/i18n/repoTools.ts
var repoToolsZh = {
  "repoTools.open": "\u4ED3\u5E93\u5DE5\u5177",
  "repoTools.title": "\u4ED3\u5E93\u5DE5\u5177",
  "repoTools.subtitle": "\u5B50\u6A21\u5757\u3001Git LFS \u4E0E\u63D0\u4EA4\u7B7E\u540D",
  "repoTools.tab.submodules": "\u5B50\u6A21\u5757",
  "repoTools.tab.lfs": "Git LFS",
  "repoTools.tab.signing": "\u63D0\u4EA4\u7B7E\u540D"
};
var repoToolsEn = {
  "repoTools.open": "Repository tools",
  "repoTools.title": "Repository tools",
  "repoTools.subtitle": "Submodules, Git LFS and commit signing",
  "repoTools.tab.submodules": "Submodules",
  "repoTools.tab.lfs": "Git LFS",
  "repoTools.tab.signing": "Commit signing"
};

// src/i18n/submodules.ts
var submodulesZh = {
  "submodules.empty": "\u8BE5\u4ED3\u5E93\u6CA1\u6709\u5B50\u6A21\u5757",
  "submodules.refresh": "\u5237\u65B0",
  "submodules.add": "\u6DFB\u52A0\u5B50\u6A21\u5757",
  "submodules.addUrl": "\u4ED3\u5E93\u5730\u5740\uFF08URL \u6216\u672C\u5730\u8DEF\u5F84\uFF09",
  "submodules.addPath": "\u5B50\u6A21\u5757\u8DEF\u5F84",
  "submodules.addBranch": "\u8DDF\u8E2A\u5206\u652F\uFF08\u53EF\u9009\uFF09",
  "submodules.addSubmit": "\u6DFB\u52A0",
  "submodules.addMissing": "\u8BF7\u586B\u5199\u4ED3\u5E93\u5730\u5740\u4E0E\u8DEF\u5F84",
  "submodules.addFailed": "\u6DFB\u52A0\u5B50\u6A21\u5757\u5931\u8D25",
  "submodules.status.initialized": "\u5DF2\u521D\u59CB\u5316",
  "submodules.status.modified": "\u6709\u6539\u52A8",
  "submodules.status.conflict": "\u51B2\u7A81",
  "submodules.currentCommit": "\u5F53\u524D\u63D0\u4EA4",
  "submodules.describe": "\u63CF\u8FF0",
  "submodules.update": "\u66F4\u65B0 / \u521D\u59CB\u5316",
  "submodules.updateRecursive": "\u9012\u5F52\u521D\u59CB\u5316\u5E76\u66F4\u65B0",
  "submodules.deinit": "\u53D6\u6D88\u521D\u59CB\u5316",
  "submodules.deinitConfirmTitle": "\u53D6\u6D88\u521D\u59CB\u5316\u5B50\u6A21\u5757",
  "submodules.deinitConfirmBody": "\u5C06\u79FB\u9664\u5B50\u6A21\u5757\u7684\u5DE5\u4F5C\u533A\u5185\u5BB9\uFF0C.gitmodules \u4E2D\u7684\u767B\u8BB0\u4E0E\u914D\u7F6E\u4FDD\u7559\u3002",
  "submodules.sync": "\u540C\u6B65\u8FDC\u7A0B\u5730\u5740",
  "submodules.commitHint": ".gitmodules \u7684\u53D8\u66F4\u9700\u8981\u63D0\u4EA4\u540E\u624D\u5BF9\u534F\u4F5C\u8005\u751F\u6548\u3002",
  "submodules.dirtyHint": "\u5B50\u6A21\u5757\u5185\u90E8\u6709\u6539\u52A8\uFF1A\u5148\u5728\u5B50\u6A21\u5757\u4E2D\u63D0\u4EA4\uFF0C\u518D\u5728\u6B64\u66F4\u65B0\u6307\u9488\u3002",
  "submodules.actionFailed": "\u5B50\u6A21\u5757\u64CD\u4F5C\u5931\u8D25",
  "submodules.loadFailed": "\u8BFB\u53D6\u5B50\u6A21\u5757\u72B6\u6001\u5931\u8D25"
};
var submodulesEn = {
  "submodules.empty": "This repository has no submodules",
  "submodules.refresh": "Refresh",
  "submodules.add": "Add submodule",
  "submodules.addUrl": "Repository URL or local path",
  "submodules.addPath": "Submodule path",
  "submodules.addBranch": "Branch to track (optional)",
  "submodules.addSubmit": "Add",
  "submodules.addMissing": "Repository URL and path are required",
  "submodules.addFailed": "Failed to add submodule",
  "submodules.status.initialized": "Initialized",
  "submodules.status.modified": "Modified",
  "submodules.status.conflict": "Conflict",
  "submodules.currentCommit": "Current commit",
  "submodules.describe": "Describe",
  "submodules.update": "Update / initialize",
  "submodules.updateRecursive": "Initialize and update recursively",
  "submodules.deinit": "Deinitialize",
  "submodules.deinitConfirmTitle": "Deinitialize submodule",
  "submodules.deinitConfirmBody": "Working files of the submodule will be removed. The .gitmodules entry and configuration are kept.",
  "submodules.sync": "Sync remote URLs",
  "submodules.commitHint": "Commit the .gitmodules change before it reaches collaborators.",
  "submodules.dirtyHint": "The submodule has local changes: commit inside it first, then update the pointer here.",
  "submodules.actionFailed": "Submodule operation failed",
  "submodules.loadFailed": "Failed to load submodule status"
};

// src/i18n/lfs.ts
var lfsZh = {
  "lfs.detecting": "\u6B63\u5728\u68C0\u6D4B git-lfs\u2026",
  "lfs.notInstalled": "\u672A\u68C0\u6D4B\u5230 git-lfs\u3002\u8BF7\u5148\u5B89\u88C5\uFF08https://git-lfs.com\uFF09\u540E\u91CD\u8BD5\u3002",
  "lfs.version": "\u7248\u672C",
  "lfs.repoEnabled": "\u5DF2\u5728\u672C\u4ED3\u5E93\u542F\u7528 LFS \u8FC7\u6EE4",
  "lfs.repoDisabled": "\u672A\u5728\u672C\u4ED3\u5E93\u542F\u7528 LFS \u8FC7\u6EE4",
  "lfs.enable": "\u542F\u7528 LFS\uFF08\u4EC5\u672C\u4ED3\u5E93\uFF09",
  "lfs.disable": "\u505C\u7528 LFS\uFF08\u4EC5\u672C\u4ED3\u5E93\uFF09",
  "lfs.enableDone": "\u5DF2\u5728\u672C\u4ED3\u5E93\u542F\u7528 LFS",
  "lfs.disableDone": "\u5DF2\u5728\u672C\u4ED3\u5E93\u505C\u7528 LFS",
  "lfs.tracks": "\u5DF2\u8DDF\u8E2A\u7684\u6A21\u5F0F",
  "lfs.noTracks": "\u5C1A\u672A\u8DDF\u8E2A\u4EFB\u4F55\u6A21\u5F0F",
  "lfs.addTrack": "\u6DFB\u52A0\u8DDF\u8E2A\u6A21\u5F0F",
  "lfs.trackPattern": "\u6A21\u5F0F\uFF08\u5982 *.psd\uFF09",
  "lfs.trackHint": "\u6A21\u5F0F\u5199\u5165 .gitattributes\uFF0C\u9700\u968F\u4ED3\u5E93\u63D0\u4EA4\u540E\u751F\u6548\u3002",
  "lfs.trackInvalid": "\u8BF7\u8F93\u5165\u8DDF\u8E2A\u6A21\u5F0F",
  "lfs.trackAdded": "\u5DF2\u8DDF\u8E2A {pattern}",
  "lfs.trackRemoved": "\u5DF2\u79FB\u9664\u8DDF\u8E2A {pattern}",
  "lfs.files": "LFS \u6587\u4EF6",
  "lfs.noFiles": "\u6CA1\u6709\u5339\u914D\u7684 LFS \u6587\u4EF6",
  "lfs.pull": "\u62C9\u53D6 LFS \u6587\u4EF6",
  "lfs.pullDone": "LFS \u6587\u4EF6\u62C9\u53D6\u5B8C\u6210",
  "lfs.actionFailed": "LFS \u64CD\u4F5C\u5931\u8D25",
  "lfs.installHint": "\u65B0\u514B\u9686\u7684\u4ED3\u5E93\u9700\u8981\u5148\u5728\u6B64\u542F\u7528 LFS \u8FC7\u6EE4\uFF0C\u5927\u6587\u4EF6\u624D\u4F1A\u6B63\u786E\u4E0B\u8F7D\u3002"
};
var lfsEn = {
  "lfs.detecting": "Detecting git-lfs\u2026",
  "lfs.notInstalled": "git-lfs was not detected. Install it first (https://git-lfs.com) and retry.",
  "lfs.version": "Version",
  "lfs.repoEnabled": "LFS filters are enabled for this repository",
  "lfs.repoDisabled": "LFS filters are not enabled for this repository",
  "lfs.enable": "Enable LFS (this repository only)",
  "lfs.disable": "Disable LFS (this repository only)",
  "lfs.enableDone": "LFS enabled for this repository",
  "lfs.disableDone": "LFS disabled for this repository",
  "lfs.tracks": "Tracked patterns",
  "lfs.noTracks": "No patterns tracked yet",
  "lfs.addTrack": "Track pattern",
  "lfs.trackPattern": "Pattern (e.g. *.psd)",
  "lfs.trackHint": "Patterns are written to .gitattributes and take effect once committed.",
  "lfs.trackInvalid": "Enter a track pattern",
  "lfs.trackAdded": "Tracked {pattern}",
  "lfs.trackRemoved": "Untracked {pattern}",
  "lfs.files": "LFS files",
  "lfs.noFiles": "No LFS files matched",
  "lfs.pull": "Pull LFS files",
  "lfs.pullDone": "LFS files pulled",
  "lfs.actionFailed": "LFS operation failed",
  "lfs.installHint": "Freshly cloned repositories need the LFS filters enabled here before large files download correctly."
};

// src/i18n/signing.ts
var signingZh = {
  "signing.repoEnabled": "\u672C\u4ED3\u5E93\u5DF2\u542F\u7528 SSH \u63D0\u4EA4\u7B7E\u540D",
  "signing.repoDisabled": "\u672C\u4ED3\u5E93\u672A\u542F\u7528\u63D0\u4EA4\u7B7E\u540D",
  "signing.enable": "\u542F\u7528\u7B7E\u540D",
  "signing.disable": "\u505C\u7528\u7B7E\u540D",
  "signing.applyDone": "\u5DF2\u5E94\u7528\u7B7E\u540D\u8BBE\u7F6E",
  "signing.keyLabel": "\u7B7E\u540D\u5BC6\u94A5",
  "signing.noKey": "\u672A\u9009\u62E9\u7B7E\u540D\u5BC6\u94A5",
  "signing.selectKey": "\u9009\u62E9\u5BC6\u94A5",
  "signing.manualKey": "\u6216\u624B\u52A8\u586B\u5199\u5BC6\u94A5\u8DEF\u5F84",
  "signing.keysTitle": "SSH \u5BC6\u94A5\uFF08~/.ssh\uFF09",
  "signing.generate": "\u751F\u6210\u65B0\u5BC6\u94A5",
  "signing.generateName": "\u5BC6\u94A5\u540D",
  "signing.generateComment": "\u6CE8\u91CA\uFF08\u53EF\u9009\uFF09",
  "signing.generateSubmit": "\u751F\u6210",
  "signing.generateHint": "\u5C06\u5728 ~/.ssh \u4E0B\u751F\u6210\u65E0\u53E3\u4EE4\u7684 ed25519 \u5BC6\u94A5\u5BF9\u3002",
  "signing.generateExists": "\u540C\u540D\u5BC6\u94A5\u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u5B57",
  "signing.generateInvalid": "\u5BC6\u94A5\u540D\u4EC5\u9650\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u4E0E\u8FDE\u5B57\u7B26",
  "signing.pubKey": "\u516C\u94A5",
  "signing.fingerprint": "\u6307\u7EB9",
  "signing.keygenMissing": "\u672A\u627E\u5230 ssh-keygen\uFF0C\u8BF7\u5148\u5B89\u88C5 OpenSSH \u5BA2\u6237\u7AEF",
  "signing.generateFailed": "\u751F\u6210\u5BC6\u94A5\u5931\u8D25",
  "signing.actionFailed": "\u7B7E\u540D\u8BBE\u7F6E\u5931\u8D25",
  "signing.commitSignNote": "\u542F\u7528\u540E\u672C\u4ED3\u5E93\u7684\u65B0\u63D0\u4EA4\u5C06\u81EA\u52A8\u643A\u5E26 SSH \u7B7E\u540D\u3002",
  "signing.verifyNote": "\u628A\u4E0A\u65B9\u516C\u94A5\u6DFB\u52A0\u5230 GitHub \u7B49\u5E73\u53F0\u7684 SSH \u7B7E\u540D\u5BC6\u94A5\u540E\u5373\u53EF\u9A8C\u8BC1\u7B7E\u540D\u3002"
};
var signingEn = {
  "signing.repoEnabled": "SSH commit signing is enabled for this repository",
  "signing.repoDisabled": "Commit signing is disabled for this repository",
  "signing.enable": "Enable signing",
  "signing.disable": "Disable signing",
  "signing.applyDone": "Signing settings applied",
  "signing.keyLabel": "Signing key",
  "signing.noKey": "No signing key selected",
  "signing.selectKey": "Select key",
  "signing.manualKey": "Or enter the key path manually",
  "signing.keysTitle": "SSH keys (~/.ssh)",
  "signing.generate": "Generate new key",
  "signing.generateName": "Key name",
  "signing.generateComment": "Comment (optional)",
  "signing.generateSubmit": "Generate",
  "signing.generateHint": "An ed25519 key pair without a passphrase will be created under ~/.ssh.",
  "signing.generateExists": "A key with this name already exists; pick another name",
  "signing.generateInvalid": "Key names may only contain letters, digits, dot, underscore and hyphen",
  "signing.pubKey": "Public key",
  "signing.fingerprint": "Fingerprint",
  "signing.keygenMissing": "ssh-keygen was not found; install the OpenSSH client first",
  "signing.generateFailed": "Failed to generate key",
  "signing.actionFailed": "Signing setup failed",
  "signing.commitSignNote": "New commits in this repository will automatically carry an SSH signature once enabled.",
  "signing.verifyNote": "Add the public key above to the SSH signing keys on GitHub (or similar) to make signatures verifiable."
};

// src/i18n/forge.ts
var forgeZh = {
  "forge.nav": "GitLab / Gitea",
  "forge.title": "GitLab / Gitea",
  "forge.empty.noRepo": "\u6253\u5F00\u4ED3\u5E93\u540E\u81EA\u52A8\u8BC6\u522B GitLab / Gitea \u8FDC\u7A0B",
  "forge.empty.noDetect": "\u672A\u8BC6\u522B\u5230 GitLab / Gitea \u8FDC\u7A0B\uFF1A\u5F53\u524D\u4ED3\u5E93\u7684 origin \u4E0D\u6307\u5411\u5DF2\u8FDE\u63A5\u7684\u5E73\u53F0\uFF0C\u6216\u5C1A\u672A\u8FDE\u63A5\u8D26\u53F7\u3002",
  "forge.connect.gitlab": "\u8FDE\u63A5 GitLab",
  "forge.connect.gitea": "\u8FDE\u63A5 Gitea / Forgejo",
  "forge.disconnect": "\u65AD\u5F00\u8FDE\u63A5",
  "forge.serverUrl": "\u670D\u52A1\u5668\u5730\u5740\uFF08\u5982 https://gitlab.com\uFF09",
  "forge.token": "\u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C\uFF08PAT\uFF09",
  "forge.tokenHint": "\u4EE4\u724C\u4FDD\u5B58\u5728\u7CFB\u7EDF\u51ED\u636E\u7BA1\u7406\u5668\uFF0C\u4EC5\u7528\u4E8E\u672C\u673A API \u8BF7\u6C42\u3002",
  "forge.connectSubmit": "\u8FDE\u63A5",
  "forge.connectFailed": "\u8FDE\u63A5\u5931\u8D25",
  "forge.connected": "\u5DF2\u8FDE\u63A5",
  "forge.refresh": "\u5237\u65B0",
  "forge.pulls": "\u6253\u5F00\u7684\u5408\u5E76\u8BF7\u6C42",
  "forge.pulls.empty": "\u6CA1\u6709\u6253\u5F00\u7684\u5408\u5E76\u8BF7\u6C42",
  "forge.pulls.loadFailed": "\u5408\u5E76\u8BF7\u6C42\u52A0\u8F7D\u5931\u8D25",
  "forge.state.open": "\u5F00\u542F",
  "forge.state.merged": "\u5DF2\u5408\u5E76",
  "forge.state.closed": "\u5DF2\u5173\u95ED",
  "forge.detail.description": "\u63CF\u8FF0",
  "forge.detail.comments": "\u8BC4\u8BBA",
  "forge.detail.commentsEmpty": "\u6682\u65E0\u8BC4\u8BBA",
  "forge.detail.pipelines": "\u6D41\u6C34\u7EBF",
  "forge.detail.pipelinesEmpty": "\u6682\u65E0\u6D41\u6C34\u7EBF\u8BB0\u5F55",
  "forge.pipeline.running": "\u8FD0\u884C\u4E2D",
  "forge.pipeline.success": "\u6210\u529F",
  "forge.pipeline.failed": "\u5931\u8D25",
  "forge.pipeline.canceled": "\u5DF2\u53D6\u6D88",
  "forge.pipeline.pending": "\u7B49\u5F85\u4E2D",
  "forge.detail.openInBrowser": "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00",
  "forge.account.gitlab": "GitLab \u8D26\u53F7",
  "forge.account.gitea": "Gitea \u8D26\u53F7"
};
var forgeEn = {
  "forge.nav": "GitLab / Gitea",
  "forge.title": "GitLab / Gitea",
  "forge.empty.noRepo": "Open a repository to detect GitLab / Gitea remotes",
  "forge.empty.noDetect": "No GitLab / Gitea remote detected: the origin of this repository does not point to a connected platform, or no account is connected yet.",
  "forge.connect.gitlab": "Connect GitLab",
  "forge.connect.gitea": "Connect Gitea / Forgejo",
  "forge.disconnect": "Disconnect",
  "forge.serverUrl": "Server URL (e.g. https://gitlab.com)",
  "forge.token": "Personal access token (PAT)",
  "forge.tokenHint": "The token is stored in the system credential manager and only used for API requests from this machine.",
  "forge.connectSubmit": "Connect",
  "forge.connectFailed": "Connection failed",
  "forge.connected": "Connected",
  "forge.refresh": "Refresh",
  "forge.pulls": "Open merge requests",
  "forge.pulls.empty": "No open merge requests",
  "forge.pulls.loadFailed": "Failed to load merge requests",
  "forge.state.open": "Open",
  "forge.state.merged": "Merged",
  "forge.state.closed": "Closed",
  "forge.detail.description": "Description",
  "forge.detail.comments": "Comments",
  "forge.detail.commentsEmpty": "No comments yet",
  "forge.detail.pipelines": "Pipelines",
  "forge.detail.pipelinesEmpty": "No pipeline runs",
  "forge.pipeline.running": "Running",
  "forge.pipeline.success": "Success",
  "forge.pipeline.failed": "Failed",
  "forge.pipeline.canceled": "Canceled",
  "forge.pipeline.pending": "Pending",
  "forge.detail.openInBrowser": "Open in browser",
  "forge.account.gitlab": "GitLab account",
  "forge.account.gitea": "Gitea account"
};

// src/i18n/review.ts
var reviewZh = {
  // 导航与头部
  "review.title": "\u9636\u6BB5\u590D\u6838",
  "review.stageHint": "\u6309\u68C0\u67E5\u70B9\u590D\u6838\u591A\u6B21\u63D0\u4EA4\u7684\u6700\u7EC8\u6539\u52A8\uFF1B\u63D0\u4EA4\u524D\u5BA1\u6838\u8BF7\u524D\u5F80\u5DE5\u4F5C\u533A\u53D8\u66F4\u3002",
  "review.backHistory": "\u8FD4\u56DE\u63D0\u4EA4\u5386\u53F2",
  "review.since": "\u81EA {hash} \u4EE5\u6765",
  "review.baseCurrent": "\u68C0\u67E5\u70B9:{hash}",
  "review.pendingCount": "\u672C\u8F6E\u5305\u542B {n} \u6B21\u63D0\u4EA4",
  "review.pendingTitle": "\u63D0\u4EA4\u8BB0\u5F55",
  "review.netChanges": "\u6700\u7EC8\u6539\u52A8",
  "review.finalChangesHint": "\u6C47\u603B\u672C\u8F6E {n} \u6B21\u63D0\u4EA4\u7684\u6700\u7EC8\u7ED3\u679C",
  "review.commitsOptional": "\u53EF\u9009",
  "review.commitRecordsHint": "\u6309\u63D0\u4EA4\u67E5\u770B\u4FEE\u6539\u8FC7\u7A0B",
  "review.roundHint": "\u68C0\u67E5\u6700\u7EC8\u6539\u52A8\u5E76\u5904\u7406\u610F\u89C1\u540E,\u5373\u53EF\u5B8C\u6210\u672C\u8F6E\u5BA1\u67E5\u3002",
  "review.returnFinal": "\u8FD4\u56DE\u6700\u7EC8\u6539\u52A8",
  "review.commitViewHint": "\u6309\u63D0\u4EA4\u67E5\u770B\u4E3A\u53EF\u9009\u64CD\u4F5C\u3002\u8FD9\u91CC\u7684\u300C\u5DF2\u67E5\u770B\u300D\u8BB0\u5F55\u5355\u72EC\u4FDD\u5B58,\u4E0D\u8BA1\u5165\u672C\u8F6E\u5B8C\u6210\u5EA6\u3002",
  "review.commitViewHunk": "\u5207\u6362\u6B64\u4EE3\u7801\u5757\u7684\u5DF2\u67E5\u770B\u6807\u8BB0",
  "review.commitViewFile": "\u6807\u8BB0\u5DF2\u67E5\u770B",
  "review.commitUnviewFile": "\u53D6\u6D88\u5DF2\u67E5\u770B\u6807\u8BB0",
  "review.commitFileViewed": "\u5DF2\u67E5\u770B",
  "review.commitPendingGroup": "\u672A\u6807\u8BB0",
  "review.commitApprovedGroup": "\u5DF2\u67E5\u770B",
  "review.commitPendingEmpty": "\u672C\u6B21\u63D0\u4EA4\u7684\u6587\u4EF6\u5747\u5DF2\u6807\u8BB0\u67E5\u770B",
  "review.commitApprovedEmpty": "\u8FD8\u6CA1\u6709\u5DF2\u67E5\u770B\u8BB0\u5F55",
  "review.statsFiles": "{n} \u4E2A\u6587\u4EF6",
  // 风险徽标
  "review.riskSecret": "\u7591\u4F3C\u5BC6\u94A5",
  "review.riskEnv": "\u73AF\u5883\u53D8\u91CF\u6587\u4EF6",
  "review.riskMassDeletion": "\u5927\u91CF\u5220\u9664",
  "review.riskDependency": "\u4F9D\u8D56\u53D8\u66F4",
  "review.riskCi": "CI \u914D\u7F6E",
  "review.riskBinary": "\u4E8C\u8FDB\u5236\u6587\u4EF6",
  // 动作
  "review.markReviewed": "\u5B8C\u6210\u672C\u8F6E\u5BA1\u67E5",
  "review.markReviewedDone": "\u672C\u8F6E\u5BA1\u67E5\u5DF2\u5B8C\u6210",
  "review.completeHint": "\u5B8C\u6210\u540E,\u68C0\u67E5\u70B9\u63A8\u8FDB\u5230\u5F53\u524D\u6700\u65B0\u63D0\u4EA4,\u672C\u8F6E\u6240\u6709\u63D0\u4EA4\u4E00\u5E76\u7ED3\u675F\u5BA1\u67E5\u3002",
  "review.markReviewedDoneDesc": "\u68C0\u67E5\u70B9\u5DF2\u63A8\u8FDB\u5230\u5F53\u524D HEAD",
  "review.markUndo": "\u64A4\u9500",
  "review.markUndone": "\u5DF2\u6062\u590D\u4E4B\u524D\u7684\u68C0\u67E5\u70B9",
  "review.markFailed": "\u6807\u8BB0\u5931\u8D25",
  "review.baseFailed": "\u8BBE\u7F6E\u68C0\u67E5\u70B9\u5931\u8D25",
  "review.tidy": "\u6574\u7406\u63D0\u4EA4",
  "review.linearWarn": "\u5305\u542B\u5408\u5E76\u63D0\u4EA4,\u5386\u53F2\u6574\u7406\u4E0D\u53EF\u7528",
  "review.truncatedWarn": "\u63D0\u4EA4\u8F83\u591A,\u4EC5\u663E\u793A\u524D {n} \u4E2A",
  // 基准引导
  "review.bootstrapTitle": "\u5EFA\u7ACB\u5BA1\u67E5\u57FA\u51C6",
  "review.bootstrapDesc": "\u5BA1\u67E5\u89C6\u56FE\u6C47\u603B\u68C0\u67E5\u70B9\u4E4B\u540E\u7684\u6700\u7EC8\u6539\u52A8\u5E76\u6807\u6CE8\u98CE\u9669\u3002\u68C0\u67E5\u4EE3\u7801\u3001\u5904\u7406\u610F\u89C1\u540E,\u5373\u53EF\u5B8C\u6210\u672C\u8F6E\u5BA1\u67E5;\u4E5F\u53EF\u6309\u63D0\u4EA4\u67E5\u770B\u4FEE\u6539\u8FC7\u7A0B\u3002",
  "review.baseUpstream": "\u8DDF\u8E2A\u5206\u652F\u7684\u8FDC\u7A0B\u4F4D\u7F6E",
  "review.baseUpstreamNone": "\u5F53\u524D\u5206\u652F\u6CA1\u6709\u8DDF\u8E2A\u5206\u652F",
  "review.baseRecent": "\u6700\u8FD1\u63D0\u4EA4\u4E4B\u524D",
  "review.basePick": "\u4ECE\u5386\u53F2\u4E2D\u9009\u62E9\u63D0\u4EA4",
  "review.basePickPlaceholder": "\u9009\u62E9\u4E00\u4E2A\u63D0\u4EA4\u4F5C\u4E3A\u57FA\u51C6\u2026",
  "review.bootstrapApply": "\u8BBE\u4E3A\u57FA\u51C6",
  // 检查点失效
  "review.staleTitle": "\u68C0\u67E5\u70B9\u5DF2\u4E0D\u5728\u5F53\u524D\u5206\u652F\u5386\u53F2\u4E0A",
  "review.staleDesc": "\u53EF\u80FD\u53D1\u751F\u8FC7\u53D8\u57FA\u6216\u5F3A\u5236\u63A8\u9001\u3002\u8BF7\u91CD\u5EFA\u57FA\u51C6\u6216\u91CD\u65B0\u9009\u62E9\u8D77\u70B9\u3002",
  "review.staleRebuild": "\u91CD\u5EFA\u4E3A\u5F53\u524D HEAD",
  "review.stalePick": "\u91CD\u65B0\u9009\u62E9\u57FA\u51C6",
  // 空态与提示
  "review.emptyTitle": "\u6CA1\u6709\u5F85\u5BA1\u67E5\u7684\u63D0\u4EA4",
  "review.emptyDesc": "\u68C0\u67E5\u70B9\u4E4B\u540E\u6CA1\u6709\u65B0\u63D0\u4EA4;AI \u4EA7\u751F\u65B0\u63D0\u4EA4\u540E\u8FD9\u91CC\u4F1A\u6C47\u603B\u5C55\u793A\u3002",
  "review.pickFile": "\u4ECE\u4E0A\u65B9\u9009\u62E9\u6587\u4EF6\u67E5\u770B\u5DEE\u5F02",
  "review.emptyDiff": "\u8BE5\u6587\u4EF6\u6CA1\u6709\u6587\u672C\u5DEE\u5F02(\u53EF\u80FD\u662F\u4E8C\u8FDB\u5236\u6216\u7EAF\u79FB\u52A8)",
  "review.files": "\u6587\u4EF6",
  // 文件面板(分组与过滤)
  "review.filterFiles": "\u8FC7\u6EE4\u6587\u4EF6\u2026",
  "review.pendingGroup": "\u5F85\u5BA1",
  "review.approvedGroup": "\u5DF2\u901A\u8FC7",
  "review.pendingEmpty": "\u6CA1\u6709\u5F85\u5BA1\u6587\u4EF6,\u5168\u90E8\u5DF2\u901A\u8FC7",
  "review.approvedEmpty": "\u8FD8\u6CA1\u6709\u5DF2\u901A\u8FC7\u7684\u6587\u4EF6",
  // AI 摘要
  "review.aiSummary": "AI \u603B\u7ED3",
  "review.aiOverview": "\u8FD9\u6BB5\u65F6\u95F4\u7684\u53D8\u66F4",
  "review.aiBadge": "AI \u53C2\u4E0E",
  // 历史整理(内联)
  "review.tidyRangeHint": "\u6B63\u5728\u6574\u7406\u68C0\u67E5\u70B9\u4E4B\u540E\u7684 {n} \u4E2A\u63D0\u4EA4",
  "review.tidyRangeTooLarge": "\u5F85\u6574\u7406\u63D0\u4EA4\u8D85\u8FC7 30 \u4E2A,\u8BF7\u5728\u5386\u53F2\u89C6\u56FE\u4E2D\u5206\u6279\u6574\u7406",
  // 推送提醒
  "review.pushReminderTitle": "\u63A8\u9001\u6210\u529F,\u8FD8\u6709\u672A\u6807\u8BB0\u5BA1\u67E5\u7684\u63D0\u4EA4",
  "review.pushReminderDesc": "\u53EF\u4EE5\u5728\u5BA1\u67E5\u89C6\u56FE\u4E2D\u68C0\u67E5\u8FD9\u6279\u6539\u52A8,\u6216\u76F4\u63A5\u6807\u8BB0\u4E3A\u5DF2\u5BA1\u67E5\u3002",
  // 分级审查(代码块/文件/全部)
  "review.approveHunk": "\u901A\u8FC7\u6B64\u4EE3\u7801\u5757",
  "review.commentHunk": "\u6DFB\u52A0\u4EE3\u7801\u5757\u6CE8\u91CA",
  "review.approveFile": "\u901A\u8FC7\u6B64\u6587\u4EF6",
  "review.unapproveFile": "\u53D6\u6D88\u6587\u4EF6\u901A\u8FC7",
  "review.fileApproved": "\u6587\u4EF6\u5DF2\u901A\u8FC7",
  "review.commentFile": "\u6587\u4EF6\u6CE8\u91CA",
  "review.progress": "\u6700\u7EC8\u6539\u52A8:\u5DF2\u901A\u8FC7 {a}/{b} \u4E2A\u6587\u4EF6",
  "review.progressTitle": "\u672C\u8F6E\u5B8C\u6210\u5EA6\u53EA\u8BA1\u7B97\u6700\u7EC8\u6539\u52A8\u7684\u6587\u4EF6\u901A\u8FC7\u72B6\u6001\u3002\u5355\u63D0\u4EA4\u7684\u5DF2\u67E5\u770B\u8BB0\u5F55\u4E3A\u53EF\u9009,\u4E0D\u5F71\u54CD\u672C\u8F6E\u8FDB\u5EA6\u3002",
  "review.markPartial": "\u6700\u7EC8\u6539\u52A8\u5DF2\u901A\u8FC7 {a}/{b} \u4E2A\u6587\u4EF6\u3002\u5B8C\u6210\u672C\u8F6E\u5BA1\u67E5\u5C06\u4E00\u5E76\u901A\u8FC7\u5176\u4F59\u6587\u4EF6,\u5E76\u5C06\u68C0\u67E5\u70B9\u63A8\u8FDB\u5230\u5F53\u524D\u6700\u65B0\u63D0\u4EA4\u3002\u7EE7\u7EED?",
  "review.commentEditor": "\u5BA1\u67E5\u6CE8\u91CA",
  "review.commentPlaceholder": "\u5199\u4E0B\u9700\u8981 AI \u8C03\u6574\u7684\u610F\u89C1,\u4F8B\u5982:\u8FD9\u4E00\u6BB5\u4F7F\u7528\u4E86\u786C\u7F16\u7801\u5BC6\u94A5,\u8BF7\u6539\u7528\u73AF\u5883\u53D8\u91CF\u2026",
  "review.commentSave": "\u4FDD\u5B58\u6CE8\u91CA",
  "review.commentUpdate": "\u66F4\u65B0\u6CE8\u91CA",
  "review.commentDelete": "\u5220\u9664\u6CE8\u91CA",
  "review.fileComments": "\u672C\u6587\u4EF6\u6CE8\u91CA",
  "review.incrementalKept": "\u589E\u91CF\u590D\u5BA1:\u5DF2\u4FDD\u7559 {n} \u4E2A\u5185\u5BB9\u672A\u53D8\u5316\u6587\u4EF6\u7684\u901A\u8FC7\u72B6\u6001;\u53D8\u5316\u6587\u4EF6\u5C06\u5728\u6253\u5F00\u540E\u6821\u9A8C\u4EE3\u7801\u5757\u3002",
  "review.statusOpen": "\u5F85\u5904\u7406",
  "review.statusNeedsReview": "\u5F85\u590D\u6838",
  "review.statusResolved": "\u5DF2\u89E3\u51B3",
  "review.statusOutdated": "\u5DF2\u8FC7\u671F",
  "review.issuesButton": "\u610F\u89C1 ({n})",
  "review.issuesTitle": "\u5BA1\u67E5\u610F\u89C1",
  "review.issuesFilter": "\u7B5B\u9009\u610F\u89C1",
  "review.issuesActive": "\u672A\u89E3\u51B3",
  "review.issuesAll": "\u5168\u90E8\u610F\u89C1",
  "review.issuesEmpty": "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u610F\u89C1",
  "review.issuesHint": "\u4EE3\u7801\u53D8\u5316\u540E\u4F1A\u4FDD\u7559\u539F\u59CB\u4E0A\u4E0B\u6587\u5E76\u6807\u8BB0\u5F85\u590D\u6838;\u8BF7\u68C0\u67E5\u4FEE\u590D\u7ED3\u679C,\u518D\u7531\u4F60\u786E\u8BA4\u89E3\u51B3\u3002",
  "review.selectVisible": "\u5168\u9009\u5F53\u524D\u7B5B\u9009",
  "review.selectedCount": "\u5DF2\u9009 {n}/{m}",
  "review.selectIssue": "\u9009\u62E9\u610F\u89C1:{path}",
  "review.resolveSelected": "\u6240\u9009\u5DF2\u89E3\u51B3 ({n})",
  "review.resolveAllVisible": "\u5168\u90E8\u5DF2\u89E3\u51B3 ({n})",
  "review.reopenSelected": "\u91CD\u65B0\u6253\u5F00\u6240\u9009",
  "review.bulkScope": "\u6279\u91CF\u64CD\u4F5C\u4EC5\u5F71\u54CD\u5F53\u524D\u7B5B\u9009\u7ED3\u679C,\u64CD\u4F5C\u540E\u53EF\u64A4\u9500\u3002",
  "review.bulkDone": "\u5DF2\u66F4\u65B0 {n} \u6761\u610F\u89C1",
  "review.progressNotSaved": "\u5BA1\u67E5\u8FDB\u5EA6\u6682\u65F6\u65E0\u6CD5\u4FDD\u5B58\u5230\u672C\u673A,\u5F53\u524D\u5185\u5BB9\u4ECD\u5728\u5185\u5B58\u4E2D\u3002\u5173\u95ED\u6216\u5237\u65B0\u524D\u8BF7\u91CD\u8BD5\u4FDD\u5B58\u3002",
  "review.retrySave": "\u91CD\u8BD5\u4FDD\u5B58",
  "review.progressSaved": "\u5BA1\u67E5\u8FDB\u5EA6\u5DF2\u4FDD\u5B58",
  "review.issueStatus": "\u610F\u89C1\u72B6\u6001",
  "review.issueNeedsReviewHint": "\u76F8\u5173\u6587\u4EF6\u5DF2\u53D8\u5316,\u8BF7\u68C0\u67E5\u5F53\u524D\u4EE3\u7801\u662F\u5426\u6EE1\u8DB3\u8FD9\u6761\u610F\u89C1\u3002",
  "review.issueOutdatedHint": "\u5F53\u524D\u4EE3\u7801\u4E2D\u65E0\u6CD5\u53EF\u9760\u5B9A\u4F4D\u539F\u4F4D\u7F6E\u3002\u539F\u59CB\u610F\u89C1\u548C\u4EE3\u7801\u4ECD\u4FDD\u7559,\u53EF\u91CD\u65B0\u6253\u5F00\u6216\u4EBA\u5DE5\u786E\u8BA4\u89E3\u51B3\u3002",
  "review.issueOriginal": "\u539F\u59CB\u7248\u672C {hash}",
  "review.issueNoContext": "\u8FD9\u6761\u65E7\u610F\u89C1\u6CA1\u6709\u4FDD\u5B58\u4EE3\u7801\u5FEB\u7167,\u53EF\u901A\u8FC7\u539F\u59CB\u7248\u672C\u67E5\u9605\u3002",
  "review.issueOpenDiff": "\u67E5\u770B\u5F53\u524D\u5DEE\u5F02",
  "review.issueFileGone": "\u6B64\u6587\u4EF6\u5DF2\u4E0D\u5728\u5F53\u524D\u5DEE\u5F02\u4E2D,\u8BF7\u5728\u610F\u89C1\u9762\u677F\u67E5\u770B\u539F\u59CB\u4E0A\u4E0B\u6587\u3002",
  "review.markWithIssues": "\u8FD8\u6709 {n} \u6761\u672A\u89E3\u51B3\u6216\u5F85\u590D\u6838\u7684\u610F\u89C1\u3002\u63A8\u8FDB\u68C0\u67E5\u70B9\u5C06\u7ED3\u675F\u672C\u8F6E\u5BA1\u67E5,\u4ECD\u8981\u7EE7\u7EED\u5417?",
  "review.rangeChanged": "\u5BA1\u67E5\u8303\u56F4\u5DF2\u53D8\u5316,\u8BF7\u68C0\u67E5\u65B0\u4EE3\u7801\u540E\u518D\u6807\u8BB0\u3002",
  // 审查报告(面向 AI)
  "review.reportButton": "\u62A5\u544A ({n})",
  "review.reportTitle": "\u5BA1\u67E5\u62A5\u544A",
  "review.reportHint": "\u6C47\u603B\u5F53\u524D\u5BA1\u67E5\u8303\u56F4\u5185\u7684\u6CE8\u91CA,\u6CE8\u660E\u6765\u81EA\u6700\u7EC8\u6539\u52A8\u8FD8\u662F\u67D0\u6B21\u63D0\u4EA4,\u5E76\u4FDD\u7559\u6587\u4EF6\u3001\u884C\u8303\u56F4\u4E0E\u610F\u89C1\u539F\u6587,\u53EF\u590D\u5236\u7ED9 AI \u8C03\u6574\u3002",
  "review.reportIntro": "\u5BA1\u67E5\u8303\u56F4:{base}..{head},\u5171 {n} \u6761\u610F\u89C1\u3002\u8BF7\u6839\u636E\u4EE5\u4E0B\u610F\u89C1\u8C03\u6574\u4EE3\u7801:",
  "review.reportContextHint": "\u4EE3\u7801\u7247\u6BB5\u662F\u610F\u89C1\u521B\u5EFA\u65F6\u7684\u539F\u59CB\u4E0A\u4E0B\u6587\u3002\u5F85\u590D\u6838\u6216\u5DF2\u8FC7\u671F\u610F\u89C1\u8BF7\u5148\u5BF9\u7167\u5F53\u524D\u5B9E\u73B0,\u4E0D\u8981\u76F4\u63A5\u6309\u65E7\u884C\u53F7\u4FEE\u6539;\u5DF2\u89E3\u51B3\u610F\u89C1\u4EC5\u4F9B\u53C2\u8003\u3002",
  "review.reportLines": "\u884C {a}-{b}",
  "review.reportCommit": "\u63D0\u4EA4 {hash}",
  "review.reportWholeFile": "\u6587\u4EF6\u6574\u4F53",
  "review.reportCopy": "\u590D\u5236\u62A5\u544A",
  "review.reportIncludeResolved": "\u5305\u542B\u5DF2\u89E3\u51B3\u610F\u89C1",
  "review.reportNoOpen": "\u6CA1\u6709\u672A\u89E3\u51B3\u610F\u89C1",
  "review.reportNoOpenDesc": "\u52FE\u9009\u300C\u5305\u542B\u5DF2\u89E3\u51B3\u610F\u89C1\u300D\u53EF\u5BFC\u51FA\u5B8C\u6574\u5BA1\u67E5\u8BB0\u5F55\u3002",
  "review.reportCopied": "\u62A5\u544A\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
  "review.reportCopyFailed": "\u590D\u5236\u5931\u8D25",
  "review.reportEmpty": "\u8FD8\u6CA1\u6709\u5BA1\u67E5\u6CE8\u91CA",
  "review.reportEmptyDesc": "\u5728\u4EE3\u7801\u5757\u6216\u6587\u4EF6\u4E0A\u70B9\u300C\u6CE8\u91CA\u300D,\u5199\u4E0B\u7684\u610F\u89C1\u4F1A\u8FDB\u5165\u62A5\u544A;\u6CA1\u6709\u6CE8\u91CA\u7684\u5185\u5BB9\u4E0D\u4F1A\u5217\u51FA\u3002",
  // AI 摘要服务层
  "review.summaryInvalid": "AI \u8FD4\u56DE\u7684\u5BA1\u67E5\u6458\u8981\u683C\u5F0F\u65E0\u6548,\u8BF7\u91CD\u8BD5",
  "review.summaryTimeout": "AI \u6458\u8981\u8BF7\u6C42\u8D85\u65F6,\u8BF7\u91CD\u8BD5"
};
var reviewEn = {
  // Navigation & header
  "review.title": "Checkpoint review",
  "review.stageHint": "Review the combined changes across commits since a checkpoint. Review uncommitted changes in Working Changes.",
  "review.backHistory": "Back to commit history",
  "review.since": "Since {hash}",
  "review.baseCurrent": "Checkpoint: {hash}",
  "review.pendingCount": "{n} commits in this round",
  "review.pendingTitle": "Commit history",
  "review.netChanges": "Final changes",
  "review.finalChangesHint": "Combined final result of {n} commits",
  "review.commitsOptional": "Optional",
  "review.commitRecordsHint": "Browse how the code changed, commit by commit",
  "review.roundHint": "Check the final changes and address findings to complete this review round.",
  "review.returnFinal": "Back to final changes",
  "review.commitViewHint": "Browsing individual commits is optional. Viewed markers are saved separately and do not count toward round progress.",
  "review.commitViewHunk": "Toggle the viewed marker for this hunk",
  "review.commitViewFile": "Mark as viewed",
  "review.commitUnviewFile": "Remove viewed marker",
  "review.commitFileViewed": "Viewed",
  "review.commitPendingGroup": "Unmarked",
  "review.commitApprovedGroup": "Viewed",
  "review.commitPendingEmpty": "All files in this commit are marked as viewed",
  "review.commitApprovedEmpty": "No viewed records yet",
  "review.statsFiles": "{n} files",
  // Risk badges
  "review.riskSecret": "Possible secrets",
  "review.riskEnv": "Env files",
  "review.riskMassDeletion": "Heavy deletions",
  "review.riskDependency": "Dependency changes",
  "review.riskCi": "CI config",
  "review.riskBinary": "Binary files",
  // Actions
  "review.markReviewed": "Complete review round",
  "review.markReviewedDone": "Review round completed",
  "review.completeHint": "Moves the checkpoint to the latest commit and completes the review of all commits in this round.",
  "review.markReviewedDoneDesc": "The checkpoint moved to the current HEAD",
  "review.markUndo": "Undo",
  "review.markUndone": "The previous checkpoint was restored",
  "review.markFailed": "Failed to mark as reviewed",
  "review.baseFailed": "Failed to set the checkpoint",
  "review.tidy": "Tidy commits",
  "review.linearWarn": "Contains merge commits; history tidy is unavailable",
  "review.truncatedWarn": "Many commits; showing the first {n}",
  // Baseline bootstrap
  "review.bootstrapTitle": "Set a review baseline",
  "review.bootstrapDesc": "Review the combined final changes after your checkpoint with risk flags. Check the code and address findings to complete the round. You can also browse individual commits.",
  "review.baseUpstream": "Remote position of the tracking branch",
  "review.baseUpstreamNone": "This branch has no tracking branch",
  "review.baseRecent": "Before recent commits",
  "review.basePick": "Pick a commit from history",
  "review.basePickPlaceholder": "Choose a commit as the baseline\u2026",
  "review.bootstrapApply": "Set baseline",
  // Stale checkpoint
  "review.staleTitle": "The checkpoint is no longer on this branch history",
  "review.staleDesc": "A rebase or force push may have happened. Rebuild the baseline or pick a new starting point.",
  "review.staleRebuild": "Rebuild at current HEAD",
  "review.stalePick": "Pick another baseline",
  // Empty states & hints
  "review.emptyTitle": "Nothing to review",
  "review.emptyDesc": "No new commits after the checkpoint; new AI commits will show up here.",
  "review.pickFile": "Select a file above to view its diff",
  "review.emptyDiff": "No text diff for this file (binary or pure move)",
  "review.files": "Files",
  // File panel (grouping & filter)
  "review.filterFiles": "Filter files\u2026",
  "review.pendingGroup": "Pending",
  "review.approvedGroup": "Approved",
  "review.pendingEmpty": "Nothing pending; everything is approved",
  "review.approvedEmpty": "No approved files yet",
  // AI summary
  "review.aiSummary": "AI summary",
  "review.aiOverview": "What changed in this range",
  "review.aiBadge": "AI involved",
  // Inline history tidy
  "review.tidyRangeHint": "Tidying the {n} commits after the review checkpoint",
  "review.tidyRangeTooLarge": "More than 30 commits to tidy; batch them in the history view instead",
  // Push reminder
  "review.pushReminderTitle": "Pushed; unreviewed commits remain",
  "review.pushReminderDesc": "Check this batch in the review view, or mark it as reviewed.",
  // Graded review (hunk / file / all)
  "review.approveHunk": "Approve this hunk",
  "review.commentHunk": "Comment on this hunk",
  "review.approveFile": "Approve this file",
  "review.unapproveFile": "Unapprove file",
  "review.fileApproved": "File approved",
  "review.commentFile": "File comment",
  "review.progress": "Final changes: {a}/{b} files approved",
  "review.progressTitle": "Round progress counts only file approvals in the final changes. Individual commit viewed markers are optional and do not affect round progress.",
  "review.markPartial": "{a} of {b} files in the final changes are approved. Completing this round also approves the remaining files and advances the checkpoint to the latest commit. Continue?",
  "review.commentEditor": "Review comment",
  "review.commentPlaceholder": "Write what an AI should change, e.g. this block hard-codes a secret; switch to environment variables\u2026",
  "review.commentSave": "Save comment",
  "review.commentUpdate": "Update comment",
  "review.commentDelete": "Delete comment",
  "review.fileComments": "Comments on this file",
  "review.incrementalKept": "Incremental review: kept approval for {n} unchanged files; changed files are checked hunk by hunk when opened.",
  "review.statusOpen": "Open",
  "review.statusNeedsReview": "Needs verification",
  "review.statusResolved": "Resolved",
  "review.statusOutdated": "Outdated",
  "review.issuesButton": "Findings ({n})",
  "review.issuesTitle": "Review findings",
  "review.issuesFilter": "Filter findings",
  "review.issuesActive": "Unresolved",
  "review.issuesAll": "All findings",
  "review.issuesEmpty": "No matching findings",
  "review.issuesHint": "Code changes keep the original context and flag findings for verification. Check the fix and confirm resolution yourself.",
  "review.selectVisible": "Select all filtered",
  "review.selectedCount": "{n}/{m} selected",
  "review.selectIssue": "Select finding: {path}",
  "review.resolveSelected": "Resolve selected ({n})",
  "review.resolveAllVisible": "Resolve all ({n})",
  "review.reopenSelected": "Reopen selected",
  "review.bulkScope": "Bulk actions apply only to the current filter. You can undo after applying.",
  "review.bulkDone": "Updated {n} findings",
  "review.progressNotSaved": "Review progress could not be saved locally. It remains in memory. Retry saving before closing or reloading.",
  "review.retrySave": "Retry save",
  "review.progressSaved": "Review progress saved",
  "review.issueStatus": "Finding status",
  "review.issueNeedsReviewHint": "The related file changed. Check whether the current code addresses this finding.",
  "review.issueOutdatedHint": "The original location cannot be reliably matched in current code. The note and original code are preserved for reopening or manual resolution.",
  "review.issueOriginal": "Original revision {hash}",
  "review.issueNoContext": "This older finding has no code snapshot; inspect its original revision.",
  "review.issueOpenDiff": "View current diff",
  "review.issueFileGone": "This file is no longer in the current diff. Inspect its original context in the findings panel.",
  "review.markWithIssues": "{n} unresolved findings remain. Advancing the checkpoint ends this review. Continue anyway?",
  "review.rangeChanged": "The review range changed. Check the new code before marking it reviewed.",
  // Review report (AI-facing)
  "review.reportButton": "Report ({n})",
  "review.reportTitle": "Review report",
  "review.reportHint": "Collects comments in the current review range, with the source (final changes or a specific commit), file, line range and your note verbatim. Copy it to an AI to apply adjustments.",
  "review.reportIntro": "Review range: {base}..{head}, {n} findings. Please adjust the code according to the notes below:",
  "review.reportContextHint": "Snippets show the original context when each finding was created. Verify outdated findings and those needing review against current code before editing; do not apply old line numbers directly. Resolved findings are reference only.",
  "review.reportLines": "Lines {a}-{b}",
  "review.reportCommit": "Commit {hash}",
  "review.reportWholeFile": "Whole file",
  "review.reportCopy": "Copy report",
  "review.reportIncludeResolved": "Include resolved findings",
  "review.reportNoOpen": "No unresolved findings",
  "review.reportNoOpenDesc": 'Select "Include resolved findings" to export the complete review record.',
  "review.reportCopied": "Report copied to clipboard",
  "review.reportCopyFailed": "Copy failed",
  "review.reportEmpty": "No review comments yet",
  "review.reportEmptyDesc": 'Use "Comment" on a hunk or file; your notes will appear in the report. Uncommented content is not listed.',
  // AI summary service layer
  "review.summaryInvalid": "The AI review summary was malformed, please retry",
  "review.summaryTimeout": "The AI summary request timed out, please retry"
};

// src/i18n/workingReview.ts
var workingReviewZh = {
  "workingReview.title": "\u63D0\u4EA4\u524D\u5BA1\u6838",
  "workingReview.reportTitle": "AI \u4FEE\u590D\u62A5\u544A",
  "workingReview.reportHint": "\u6C47\u603B\u5F53\u524D\u4ED3\u5E93\u3001\u5F53\u524D\u5206\u652F\u6240\u6709\u6587\u4EF6\u7684\u5BA1\u6838\u610F\u89C1\uFF0C\u9ED8\u8BA4\u53EA\u5305\u542B\u5F85\u89E3\u51B3\u9879\u3002\u9884\u89C8\u540E\u53EF\u590D\u5236\u7ED9 AI \u8FDB\u884C\u4FEE\u590D\u3002",
  "workingReview.reportIntro": "\u8BF7\u6839\u636E\u4EE5\u4E0B {n} \u6761\u5BA1\u6838\u610F\u89C1\u4FEE\u590D\u5F53\u524D\u5DE5\u4F5C\u533A\u4EE3\u7801\u3002",
  "workingReview.reportContextHint": "\u4EE3\u7801\u7247\u6BB5\u6765\u81EA\u8BB0\u5F55\u610F\u89C1\u65F6\u7684\u539F\u59CB\u5DEE\u5F02\u3002\u5E94\u7528\u524D\u8BF7\u6838\u5BF9\u5F53\u524D\u4EE3\u7801\u3001\u8DEF\u5F84\u548C\u884C\u53F7\uFF1B\u672A\u4FDD\u5B58\u4E0A\u4E0B\u6587\u7684\u610F\u89C1\u8BF7\u5148\u5B9A\u4F4D\u3002\u4EC5\u5904\u7406\u5F85\u89E3\u51B3\u610F\u89C1\uFF0C\u4FDD\u7559\u5176\u4ED6\u4FEE\u6539\uFF0C\u4E0D\u81EA\u52A8\u6682\u5B58\u3001\u63D0\u4EA4\u6216\u63A8\u9001\u3002\u5DF2\u89E3\u51B3\u610F\u89C1\u4EC5\u4F9B\u53C2\u8003\u3002",
  "workingReview.reportRepository": "\u4ED3\u5E93",
  "workingReview.reportBranch": "\u5206\u652F",
  "workingReview.reportSnapshot": "\u539F\u59CB\u5DEE\u5F02\u5FEB\u7167",
  "workingReview.reportTruncated": "\uFF08\u539F\u59CB\u4E0A\u4E0B\u6587\u5DF2\u622A\u65AD\uFF0C\u8BF7\u7ED3\u5408\u5F53\u524D\u6587\u4EF6\u68C0\u67E5\uFF09",
  "workingReview.reportMissingContext": "\u672A\u4FDD\u5B58\u539F\u59CB\u4EE3\u7801\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u5148\u5B9A\u4F4D\u6838\u5BF9",
  "workingReview.reportUnknownHunk": "\u4EE3\u7801\u5757\u4F4D\u7F6E\u672A\u4FDD\u5B58",
  "workingReview.reportEmptyDesc": "\u5148\u5728\u6587\u4EF6\u6216\u4EE3\u7801\u5757\u7684\u201C\u5BA1\u6838\u610F\u89C1\u201D\u4E2D\u8BB0\u5F55\u95EE\u9898\uFF0C\u62A5\u544A\u4F1A\u6C47\u603B\u5F53\u524D\u4ED3\u5E93\u3001\u5F53\u524D\u5206\u652F\u7684\u610F\u89C1\u3002",
  "workingReview.source.staged": "\u8BB0\u5F55\u65F6\uFF1A\u6682\u5B58\u533A",
  "workingReview.source.unstaged": "\u8BB0\u5F55\u65F6\uFF1A\u5DE5\u4F5C\u533A\u672A\u6682\u5B58",
  "workingReview.source.untracked": "\u8BB0\u5F55\u65F6\uFF1A\u672A\u8DDF\u8E2A\u6587\u4EF6",
  "workingReview.source.unknown": "\u539F\u59CB\u5DEE\u5F02\uFF08\u6765\u6E90\u672A\u8BB0\u5F55\uFF09",
  "workingReview.checking": "\u6B63\u5728\u68C0\u67E5\u672C\u6B21\u63D0\u4EA4\u7684\u5BA1\u6838\u72B6\u6001\u2026",
  "workingReview.approved": "\u5DF2\u5BA1\u6838",
  "workingReview.pending": "\u5F85\u5BA1\u6838",
  "workingReview.listProgress": "\u6587\u4EF6\u5BA1\u6838\u8FDB\u5EA6",
  "workingReview.listPartial": "\u5DF2\u5BA1\u6838 {n}/{total} \u4E2A\u4EE3\u7801\u5757",
  "workingReview.listChecking": "\u6838\u5BF9\u4E2D",
  "workingReview.listIssues": "\u610F\u89C1 {n}",
  "workingReview.approveFile": "\u901A\u8FC7\u6B64\u6587\u4EF6",
  "workingReview.reopen": "\u91CD\u65B0\u5BA1\u6838",
  "workingReview.approveHunk": "\u901A\u8FC7\u6B64\u4EE3\u7801\u5757",
  "workingReview.commentHunk": "\u8BB0\u5F55\u6B64\u4EE3\u7801\u5757\u7684\u95EE\u9898",
  "workingReview.issues": "\u5BA1\u6838\u610F\u89C1",
  "workingReview.resolve": "\u6807\u8BB0\u4E3A\u5DF2\u89E3\u51B3",
  "workingReview.resolved": "\u5DF2\u89E3\u51B3",
  "workingReview.unresolved": "\u5F85\u89E3\u51B3",
  "workingReview.contentChanged": "\u8BB0\u5F55\u540E\u5185\u5BB9\u5DF2\u53D8\u5316",
  "workingReview.deleteIssue": "\u5220\u9664\u6B64\u610F\u89C1",
  "workingReview.wholeFile": "\u6587\u4EF6\u7EA7\u610F\u89C1",
  "workingReview.issueText": "\u5BA1\u6838\u610F\u89C1\u5185\u5BB9",
  "workingReview.issuePlaceholder": "\u8BB0\u5F55\u9700\u8981\u4FEE\u6539\u7684\u5730\u65B9\uFF0C\u4FEE\u590D\u540E\u52FE\u9009\u4E3A\u5DF2\u89E3\u51B3\u2026",
  "workingReview.addIssue": "\u4FDD\u5B58\u610F\u89C1",
  "workingReview.filtered": "\u5173\u95ED\u201C\u5FFD\u7565\u7A7A\u767D\u201D\u540E\u53EF\u5BA1\u6838\u5B8C\u6574\u5DEE\u5F02\u3002",
  "workingReview.loadFailed": "\u5185\u5BB9\u5DF2\u53D8\u5316\u6216\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  "workingReview.reminderTitle": "\u672C\u6B21\u63D0\u4EA4\u8FD8\u6709\u672A\u5BA1\u6838\u5185\u5BB9",
  "workingReview.reminderDesc": "\u672C\u6B21\u63D0\u4EA4\u5305\u542B {n} \u4E2A\u5C1A\u672A\u5BA1\u6838\u901A\u8FC7\u7684\u6587\u4EF6\u3002\u53EF\u4EE5\u8FD4\u56DE\u5DE5\u4F5C\u533A\u5BA1\u6838\uFF0C\u4E5F\u53EF\u4EE5\u7EE7\u7EED\u63D0\u4EA4\u3002",
  "workingReview.unresolvedCount": "\u5176\u4E2D\u8FD8\u6709 {n} \u6761\u672A\u89E3\u51B3\u7684\u5BA1\u6838\u610F\u89C1\u3002",
  "workingReview.continueCommit": "\u7EE7\u7EED\u63D0\u4EA4",
  "workingReview.return": "\u8FD4\u56DE\u5BA1\u6838",
  "workingReview.dontRemind": "\u4E0D\u518D\u63D0\u9192\uFF08\u53EF\u5728 Git \u8BBE\u7F6E\u4E2D\u91CD\u65B0\u5F00\u542F\uFF09",
  "workingReview.setting": "\u63D0\u4EA4\u524D\u63D0\u9192\u672A\u5BA1\u6838\u5185\u5BB9",
  "workingReview.settingDesc": "\u9ED8\u8BA4\u5F00\u542F\uFF1B\u53D1\u73B0\u672A\u5BA1\u6838\u5185\u5BB9\u6216\u672A\u89E3\u51B3\u610F\u89C1\u65F6\u63D0\u9192\uFF0C\u4ECD\u53EF\u7EE7\u7EED\u63D0\u4EA4\u3002\u5173\u95ED\u540E\u53EF\u968F\u65F6\u624B\u52A8\u5BA1\u6838\u3002"
};
var workingReviewEn = {
  "workingReview.listProgress": "File review progress",
  "workingReview.listPartial": "{n}/{total} hunks reviewed",
  "workingReview.listChecking": "Checking",
  "workingReview.listIssues": "Notes {n}",
  "workingReview.reportTitle": "AI fix report",
  "workingReview.reportHint": "Collects review notes across all files in the current repository and branch. Unresolved notes are included by default. Preview and copy the report to an AI for fixes.",
  "workingReview.reportIntro": "Fix the current working changes according to these {n} review notes.",
  "workingReview.reportContextHint": "Code snippets show the original diff when each note was recorded. Verify current code, paths and line numbers before editing; locate notes without saved context first. Address unresolved notes, preserve unrelated edits, and do not stage, commit or push automatically. Resolved notes are reference only.",
  "workingReview.reportRepository": "Repository",
  "workingReview.reportBranch": "Branch",
  "workingReview.reportSnapshot": "Original diff snapshot",
  "workingReview.reportTruncated": "(Original context truncated; inspect the current file.)",
  "workingReview.reportMissingContext": "No original code context saved; locate and verify first",
  "workingReview.reportUnknownHunk": "Hunk location not saved",
  "workingReview.reportEmptyDesc": "Add a review note to a file or hunk first. The report collects notes in the current repository and branch.",
  "workingReview.source.staged": "Recorded in: staging area",
  "workingReview.source.unstaged": "Recorded in: unstaged changes",
  "workingReview.source.untracked": "Recorded in: untracked file",
  "workingReview.source.unknown": "Original diff (source not recorded)",
  "workingReview.checking": "Checking review status for this commit\u2026",
  "workingReview.title": "Review before commit",
  "workingReview.approved": "Reviewed",
  "workingReview.pending": "Needs review",
  "workingReview.approveFile": "Approve file",
  "workingReview.reopen": "Review again",
  "workingReview.approveHunk": "Approve this hunk",
  "workingReview.commentHunk": "Add an issue for this hunk",
  "workingReview.issues": "Review notes",
  "workingReview.resolve": "Mark as resolved",
  "workingReview.resolved": "Resolved",
  "workingReview.unresolved": "Unresolved",
  "workingReview.contentChanged": "Content changed since this note",
  "workingReview.deleteIssue": "Delete note",
  "workingReview.wholeFile": "File note",
  "workingReview.issueText": "Review note",
  "workingReview.issuePlaceholder": "Describe what needs fixing, then mark it resolved after the fix\u2026",
  "workingReview.addIssue": "Save note",
  "workingReview.filtered": "Turn off \u201CIgnore whitespace\u201D to review the complete diff.",
  "workingReview.loadFailed": "Content changed or could not be read. Refresh and retry.",
  "workingReview.reminderTitle": "This commit includes unreviewed changes",
  "workingReview.reminderDesc": "This commit includes {n} files that have not passed review. Return to review them or continue committing.",
  "workingReview.unresolvedCount": "There are also {n} unresolved review notes.",
  "workingReview.continueCommit": "Continue commit",
  "workingReview.return": "Return to review",
  "workingReview.dontRemind": "Don\u2019t remind me again (change this in Git settings)",
  "workingReview.setting": "Remind me about unreviewed changes before committing",
  "workingReview.settingDesc": "On by default. Reminds you about unreviewed changes or unresolved notes, while allowing you to continue. Manual review remains available when disabled."
};

// src/i18n/zh.ts
var zh = {
  "textMenu.title": "\u6587\u672C\u64CD\u4F5C",
  "textMenu.undo": "\u64A4\u9500",
  "textMenu.redo": "\u91CD\u505A",
  "textMenu.cut": "\u526A\u5207",
  "textMenu.copy": "\u590D\u5236",
  "textMenu.copyContent": "\u590D\u5236\u5F53\u524D\u663E\u793A\u5185\u5BB9",
  "textMenu.paste": "\u7C98\u8D34",
  "textMenu.selectAll": "\u5168\u9009",
  "textMenu.selectContent": "\u5168\u9009\u5F53\u524D\u663E\u793A\u5185\u5BB9",
  "textMenu.failed": "\u6587\u672C\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u5C1D\u8BD5\u4F7F\u7528\u952E\u76D8\u5FEB\u6377\u952E",
  "window.controls": "\u7A97\u53E3\u63A7\u5236",
  "window.minimize": "\u6700\u5C0F\u5316\u7A97\u53E3",
  "window.maximize": "\u6700\u5927\u5316\u7A97\u53E3",
  "window.restore": "\u8FD8\u539F\u7A97\u53E3",
  "window.close": "\u5173\u95ED\u7A97\u53E3",
  "window.statusbar": "\u7A97\u53E3\u72B6\u6001\u680F",
  "window.desktopOnly": "\u7A97\u53E3\u63A7\u5236\u4EC5\u684C\u9762\u7248\u53EF\u7528",
  "window.operationFailed": "\u7A97\u53E3\u64CD\u4F5C\u672A\u5B8C\u6210",
  ...commitBatchZh,
  ...uiReviewZh,
  ...remoteZh,
  ...fileTreeZh,
  ...historySearchZh,
  ...conflictBaseZh,
  ...externalToolsZh,
  ...profilesZh,
  ...bisectZh,
  ...releaseNotesZh,
  ...prReviewZh,
  ...notificationsZh,
  ...workspacesZh,
  ...repoToolsZh,
  ...submodulesZh,
  ...lfsZh,
  ...signingZh,
  ...forgeZh,
  ...reviewZh,
  "layout.pinNavigation": "\u56FA\u5B9A\u5DE6\u4FA7\u5BFC\u822A",
  "layout.unpinNavigation": "\u53D6\u6D88\u56FA\u5B9A\u5E76\u6536\u8D77\u5BFC\u822A",
  "layout.pinNavigationDesc": "\u4FDD\u6301\u5BFC\u822A\u5E38\u9A7B\u5E76\u8BB0\u4F4F\u9009\u62E9\uFF1B\u5173\u95ED\u540E\u7ACB\u5373\u6536\u8D77\uFF0C\u53EF\u4ECE\u5DE6\u4E0A\u89D2\u4E34\u65F6\u6253\u5F00\u3002",
  "composer.diffFontSize": "\u4EE3\u7801\u5B57\u53F7",
  "composer.resizeMetadata": "\u8C03\u6574\u5386\u53F2\u4FE1\u606F\u5217\u5BBD\u5EA6",
  // Desktop workflow and truthful generation status
  "common.close": "\u5173\u95ED",
  "common.confirm": "\u786E\u8BA4\u64CD\u4F5C",
  "common.loading": "\u6B63\u5728\u52A0\u8F7D\u2026",
  "composer.scope": "\u672C\u6B21\u63D0\u4EA4\u8303\u56F4",
  "composer.included": "\u5305\u542B {n} \u4E2A\u6587\u4EF6",
  "composer.excluded": "\u53E6\u6709 {n} \u4E2A\u672A\u6682\u5B58\u6587\u4EF6\u4E0D\u5305\u542B\u5728\u5185",
  "composer.stageAllHint": "\u5C1A\u672A\u6682\u5B58\u6587\u4EF6\u3002\u63D0\u4EA4\u65F6\u5C06\u6682\u5B58\u5E76\u63D0\u4EA4\u5168\u90E8\u4FEE\u6539\u3002",
  "composer.showFiles": "\u67E5\u770B\u5305\u542B\u7684\u6587\u4EF6",
  "composer.hideFiles": "\u6536\u8D77\u6587\u4EF6\u6E05\u5355",
  "composer.title": "\u63D0\u4EA4\u6807\u9898",
  "composer.titlePlaceholder": "\u7B80\u660E\u63CF\u8FF0\u672C\u6B21\u6539\u52A8",
  "composer.body": "\u8BE6\u7EC6\u8BF4\u660E\uFF08\u53EF\u9009\uFF09",
  "composer.bodyPlaceholder": "\u8BF4\u660E\u6539\u52A8\u539F\u56E0\u548C\u9700\u8981\u6CE8\u610F\u7684\u4E8B\u9879",
  "composer.generate": "\u751F\u6210\u63D0\u4EA4\u8BF4\u660E",
  "composer.generating": "\u6B63\u5728\u751F\u6210\u2026",
  "composer.localRules": "\u672C\u5730\u89C4\u5219 \xB7 \u65E0\u9700 API",
  "composer.localFallback": "\u672C\u5730\u89C4\u5219 \xB7 API \u672A\u5B8C\u6210\u751F\u6210",
  "composer.configureAi": "\u914D\u7F6E AI",
  "composer.fallbackTitle": "\u5DF2\u56DE\u9000\u5230\u672C\u5730\u89C4\u5219",
  "composer.fallbackDesc": "\u5927\u6A21\u578B\u672A\u5B8C\u6210\u751F\u6210\uFF0C\u9884\u89C8\u5185\u5BB9\u7531\u672C\u5730\u89C4\u5219\u751F\u6210\u3002\u8BF7\u68C0\u67E5 API \u914D\u7F6E\u6216\u8FDE\u63A5\u3002",
  "composer.preview": "\u9884\u89C8\u751F\u6210\u7684\u8BF4\u660E",
  "composer.keepDraft": "\u4FDD\u7559\u539F\u7A3F",
  "composer.replaceDraft": "\u66FF\u6362\u8349\u7A3F",
  "composer.replaceDraftDesc": "\u5F53\u524D\u5DF2\u6709\u63D0\u4EA4\u8BF4\u660E\u3002\u662F\u5426\u7528\u6240\u9009\u63D0\u4EA4\u7684\u8BF4\u660E\u66FF\u6362\uFF1F",
  "composer.useMessage": "\u4F7F\u7528\u6B64\u8BF4\u660E",
  "composer.copyMessage": "\u4F7F\u7528\u6B64\u8BF4\u660E",
  "composer.moreOptions": "\u66F4\u591A\u63D0\u4EA4\u9009\u9879",
  "composer.amendWarning": "\u5C06\u4FEE\u6539\u5F53\u524D\u5206\u652F\u7684\u4E0A\u4E00\u6761\u63D0\u4EA4\uFF0C\u5E76\u6539\u53D8\u5176\u63D0\u4EA4\u6807\u8BC6\u3002\u5DF2\u63A8\u9001\u7684\u63D0\u4EA4\u4F1A\u5F71\u54CD\u534F\u4F5C\u8005\uFF0C\u5EFA\u8BAE\u521B\u5EFA\u65B0\u63D0\u4EA4\u3002",
  "composer.cancelAmend": "\u9000\u51FA\u4FEE\u6539\u4E0A\u4E00\u6761\u63D0\u4EA4\u6A21\u5F0F",
  "composer.amendPush": "\u4FEE\u6539\u4E0A\u4E00\u6761\u63D0\u4EA4\u5E76\u63A8\u9001",
  "composer.scopeChanged": "\u63D0\u4EA4\u8303\u56F4\u5DF2\u53D8\u5316",
  "composer.scopeChangedDesc": "\u5DF2\u5237\u65B0\u6587\u4EF6\u72B6\u6001\uFF0C\u8BF7\u68C0\u67E5\u672C\u6B21\u63D0\u4EA4\u8303\u56F4\u540E\u91CD\u8BD5\u3002",
  "composer.changedFiles": "\u53D8\u66F4\u6587\u4EF6",
  "composer.commitBody": "\u5C55\u5F00\u8BE6\u7EC6\u8BF4\u660E",
  "composer.retry": "\u91CD\u8BD5",
  "composer.selectCommit": "\u9009\u62E9\u4E00\u6761\u63D0\u4EA4\u67E5\u770B\u8BE6\u60C5",
  "composer.navigation": "\u4ED3\u5E93\u5BFC\u822A",
  "composer.fetch": "\u83B7\u53D6\u66F4\u65B0",
  "composer.moreActions": "\u66F4\u591A\u4ED3\u5E93\u64CD\u4F5C",
  "composer.repositoryActions": "\u4ED3\u5E93\u64CD\u4F5C",
  "composer.historyActions": "\u63D0\u4EA4\u5386\u53F2\u64CD\u4F5C",
  "composer.columns": "\u663E\u793A\u5217",
  "composer.column.author": "\u4F5C\u8005",
  "composer.column.date": "\u65F6\u95F4",
  "composer.column.hash": "\u63D0\u4EA4\u6807\u8BC6",
  "composer.discardWarning": "\u5C06\u4E22\u5F03\u6B64\u6587\u4EF6\u5C1A\u672A\u6682\u5B58\u7684\u4FEE\u6539\uFF0C\u4FDD\u7559\u5DF2\u6682\u5B58\u7684\u5185\u5BB9\u3002\u4E22\u5F03\u7684\u4FEE\u6539\u65E0\u6CD5\u901A\u8FC7\u672C\u5E94\u7528\u6062\u590D\uFF0C\u8BF7\u5148\u786E\u8BA4 Diff\u3002",
  "composer.discardHunkWarning": "\u4EC5\u4E22\u5F03\u4E0B\u9762\u8FD9\u4E00\u5904\u672A\u6682\u5B58\u7684\u4FEE\u6539\uFF0C\u5176\u4F59\u4FEE\u6539\u4FDD\u7559\u3002\u4E22\u5F03\u7684\u5185\u5BB9\u65E0\u6CD5\u901A\u8FC7\u672C\u5E94\u7528\u6062\u590D\u3002",
  "composer.hardResetWarning": "\u672A\u63D0\u4EA4\u7684\u5DF2\u8DDF\u8E2A\u6587\u4EF6\u4FEE\u6539\u5C06\u4E22\u5931\uFF0C\u76EE\u6807\u63D0\u4EA4\u4E4B\u540E\u7684\u63D0\u4EA4\u5C06\u4ECE\u5F53\u524D\u5206\u652F\u79FB\u9664\u3002\u672C\u5E94\u7528\u4E0D\u63D0\u4F9B\u81EA\u52A8\u6062\u590D\u3002",
  "composer.deleteBranchWarning": "\u5220\u9664\u8FD9\u4E2A\u672C\u5730\u5206\u652F\uFF0C\u5DE5\u4F5C\u533A\u6587\u4EF6\u4FDD\u6301\u4E0D\u53D8\u3002\u786E\u8BA4\u8BE5\u5206\u652F\u7684\u63D0\u4EA4\u5DF2\u5408\u5E76\u6216\u53E6\u6709\u4FDD\u7559\u3002",
  "composer.deleteTagWarning": "\u5220\u9664\u672C\u5730\u6807\u7B7E\u5F15\u7528\uFF0C\u63D0\u4EA4\u548C\u8FDC\u7A0B\u6807\u7B7E\u4FDD\u6301\u4E0D\u53D8\u3002",
  "composer.deleteRemoteTagWarning": "\u4ECE\u8FDC\u7A0B\u4ED3\u5E93\u5220\u9664\u6B64\u6807\u7B7E\uFF0C\u4F1A\u5F71\u54CD\u534F\u4F5C\u8005\u3002\u6B64\u5E94\u7528\u4E0D\u63D0\u4F9B\u81EA\u52A8\u6062\u590D\u3002",
  "composer.dropStashWarning": "\u5220\u9664\u8FD9\u6761\u8D2E\u85CF\u53CA\u5176\u4FDD\u5B58\u7684\u4FEE\u6539\u3002\u672C\u5E94\u7528\u4E0D\u63D0\u4F9B\u81EA\u52A8\u6062\u590D\uFF0C\u8BF7\u5148\u9884\u89C8\u5E76\u786E\u8BA4\u5185\u5BB9\u3002",
  "composer.removeRemote": "\u79FB\u9664\u8FDC\u7A0B\u4ED3\u5E93\u914D\u7F6E",
  "composer.mergePr": "\u5408\u5E76\u62C9\u53D6\u8BF7\u6C42",
  "composer.closePr": "\u5173\u95ED\u62C9\u53D6\u8BF7\u6C42",
  "composer.keyboardFiles": "\u9009\u62E9\u6587\u4EF6",
  "composer.keyboardStage": "\u6682\u5B58 / \u53D6\u6D88\u6682\u5B58\u9009\u4E2D\u6587\u4EF6",
  "composer.keyboardMenu": "\u6253\u5F00\u64CD\u4F5C\u83DC\u5355",
  "rightPane.toggleSort": "\u5207\u6362\u6587\u4EF6\u6392\u5E8F\u65B9\u5411",
  "rightPane.pathView": "\u6309\u8DEF\u5F84\u663E\u793A\u6587\u4EF6",
  "rightPane.treeView": "\u6309\u76EE\u5F55\u663E\u793A\u6587\u4EF6",
  "fileStatus.modified": "\u4FEE\u6539",
  "fileStatus.added": "\u65B0\u589E",
  "fileStatus.deleted": "\u5220\u9664",
  "fileStatus.renamed": "\u91CD\u547D\u540D",
  "fileStatus.untracked": "\u672A\u8DDF\u8E2A",
  "fileStatus.conflicted": "\u51B2\u7A81",
  "banner.abortCherryPick": "\u4E2D\u6B62 Cherry-pick",
  "banner.continueCherryPick": "\u7EE7\u7EED Cherry-pick",
  // ============ 通用 ============
  "common.loaded": "\u5DF2\u52A0\u8F7D",
  "common.never": "\u4ECE\u4E0D",
  "common.detect": "\u68C0\u6D4B",
  "common.disconnect": "\u65AD\u5F00\u8FDE\u63A5",
  "common.connected": "\u5DF2\u8FDE\u63A5",
  "common.notOpen": "\u672A\u6253\u5F00",
  // ============ 设置对话框 ============
  "settings.title": "\u9996\u9009\u9879\u8BBE\u7F6E",
  "settings.tab.appearance": "\u5916\u89C2\u4E0E\u4E3B\u9898",
  "settings.tab.git": "Git \u6838\u5FC3\u914D\u7F6E",
  "settings.tab.ai": "AI \u667A\u80FD\u5F15\u64CE",
  "settings.tab.github": "GitHub \u8D26\u53F7",
  "settings.tab.shortcuts": "\u5FEB\u6377\u952E\u6E05\u5355",
  "settings.panel.appearance": "\u5916\u89C2\u4E0E\u8272\u5F69\u4E3B\u9898",
  "settings.panel.git": "Git \u6267\u884C\u5F15\u64CE\u4E0E\u81EA\u52A8\u83B7\u53D6",
  "settings.panel.ai": "AI \u63D0\u4EA4\u8BF4\u660E\u751F\u6210\u5F15\u64CE\u914D\u7F6E",
  "settings.panel.github": "GitHub \u8D26\u53F7\u7BA1\u7406",
  "settings.panel.shortcuts": "\u5168\u5C40\u952E\u76D8\u5FEB\u6377\u952E",
  "settings.appearance.themeLabel": "\u754C\u9762\u8272\u5F69\u4E3B\u9898",
  "settings.cursor.label": "\u9F20\u6807\u6307\u9488",
  "settings.cursor.description": "\u4EC5\u4F5C\u7528\u4E8E\u5E94\u7528\u5185\uFF0C\u9009\u62E9\u540E\u7ACB\u5373\u751F\u6548\u5E76\u81EA\u52A8\u4FDD\u5B58\u3002",
  "settings.cursor.system": "\u7CFB\u7EDF\u9ED8\u8BA4\uFF08\u9ED8\u8BA4\uFF09",
  "settings.cursor.ice": "\u51B0\u767D\u5706\u89D2",
  "settings.cursor.systemHint": "\u8DDF\u968F\u7CFB\u7EDF\u5F53\u524D\u7684\u9F20\u6807\u6837\u5F0F\u548C\u5927\u5C0F\u3002\u8F93\u5165\u6587\u5B57\u3001\u62D6\u62FD\u53CA\u7981\u7528\u72B6\u6001\u4FDD\u7559\u7CFB\u7EDF\u5149\u6807\u3002",
  "settings.cursor.preview": "\u9F20\u6807\u6307\u9488\u9884\u89C8",
  "settings.cursor.lightPreview": "\u6D45\u8272\u80CC\u666F",
  "settings.cursor.darkPreview": "\u6697\u8272\u80CC\u666F",
  "settings.cursor.arrow": "\u9ED8\u8BA4\u7BAD\u5934",
  "settings.cursor.hand": "\u70B9\u51FB\u624B\u5F62",
  "settings.cursor.previewHint": "\u56FE\u793A\u653E\u5927 2 \u500D\uFF1B\u79FB\u52A8\u9F20\u6807\u6216\u60AC\u505C\u6309\u94AE\u53EF\u4F53\u9A8C\u5B9E\u9645\u5927\u5C0F\u3002",
  "settings.appearance.theme.dark.name": "\u6DF1\u8272\u6697\u9ED1 (Dark)",
  "settings.appearance.theme.dark.desc": "\u9ED1\u7070\u5E95\u8272\u4E0E\u78E8\u7802\u73BB\u7483",
  "settings.appearance.theme.light.name": "\u660E\u4EAE\u6D45\u8272 (Light)",
  "settings.appearance.theme.light.desc": "\u4E2D\u6027\u6D45\u7070\u4E0E\u901A\u900F\u9762\u677F",
  "settings.appearance.theme.system.name": "\u8DDF\u968F\u7CFB\u7EDF (System)",
  "settings.appearance.theme.system.desc": "\u81EA\u52A8\u9002\u914D\u7CFB\u7EDF\u5916\u89C2",
  "settings.appearance.languageLabel": "\u754C\u9762\u8BED\u8A00 (Language)",
  "settings.appearance.languageDesc": "\u5207\u6362\u754C\u9762\u663E\u793A\u8BED\u8A00\uFF0C\u7ACB\u5373\u751F\u6548",
  "settings.appearance.compact": "\u7D27\u51D1\u6A21\u5F0F",
  "settings.appearance.compactDesc": "\u7F29\u51CF\u5143\u7D20\u5185\u8FB9\u8DDD\u4E0E\u5B57\u4F53\u884C\u9AD8\u4EE5\u5C55\u793A\u66F4\u591A\u4EE3\u7801",
  "settings.appearance.compactOn": "\u5DF2\u5F00\u542F\u7D27\u51D1\u6392\u7248\u6A21\u5F0F",
  "settings.appearance.compactOff": "\u5DF2\u6062\u590D\u6807\u51C6\u6392\u7248\u6A21\u5F0F",
  "settings.appearance.panelLayout": "\u5206\u680F\u4E0E\u533A\u57DF\u5BBD\u5EA6\u5E03\u5C40",
  "settings.appearance.panelLayoutDesc": "\u5DF2\u652F\u6301\u81EA\u7531\u62D6\u62FD\u5DE6\u4FA7\u680F\u3001\u53F3\u4FA7\u63D0\u4EA4\u9762\u677F\u53CA\u5B50\u5217\u8868\u5206\u680F\u7EBF\uFF0C\u4F4D\u7F6E\u81EA\u52A8\u5B58\u5165\u672C\u5730\u5B58\u50A8",
  "settings.appearance.resetLayout": "\u6062\u590D\u9ED8\u8BA4\u5E03\u5C40",
  "settings.appearance.resetLayoutToast": "\u5DF2\u6062\u590D\u9ED8\u8BA4\u533A\u57DF\u5BBD\u5EA6\u5E03\u5C40",
  "settings.git.cliPathLabel": "\u7CFB\u7EDF Git CLI \u53EF\u6267\u884C\u6587\u4EF6\u8DEF\u5F84",
  "settings.git.cliPathPlaceholder": "\u4F8B\u5982 git \u6216 C:\\Program Files\\Git\\bin\\git.exe",
  "settings.git.versionLabel": "\u5F53\u524D\u68C0\u6D4B\u5230\u7684\u7CFB\u7EDF Git \u7248\u672C:",
  "settings.git.autoFetchLabel": "\u540E\u53F0\u81EA\u52A8\u83B7\u53D6\u53D8\u66F4",
  "settings.git.autoFetch.every5": "\u6BCF 5 \u5206\u949F",
  "settings.git.autoFetch.every10": "\u6BCF 10 \u5206\u949F (\u63A8\u8350)",
  "settings.git.autoFetch.every30": "\u6BCF 30 \u5206\u949F",
  "settings.git.autoFetchDesc": "\u5F00\u542F\u540E\u5C06\u5728\u540E\u53F0\u9759\u9ED8\u6267\u884C git fetch\uFF0C\u5B9E\u65F6\u66F4\u65B0 Ahead/Behind \u63D0\u4EA4\u8BA1\u6570\u3002",
  "settings.git.autoFetchToast": "\u5DF2\u8BBE\u7F6E\u81EA\u52A8\u83B7\u53D6\u95F4\u9694",
  "settings.ai.strategyLabel": "AI \u63D0\u4EA4\u8BF4\u660E\u751F\u6210\u7B56\u7565",
  "settings.ai.builtin.name": "\u672C\u5730\u89C4\u5219\u751F\u6210",
  "settings.ai.builtin.desc": "\u65E0\u9700 API Key\uFF0C\u4F9D\u636E\u6587\u4EF6\u53D8\u66F4\u548C Diff \u6458\u5F55\u751F\u6210\u63D0\u4EA4\u8BF4\u660E\uFF0C\u4E0D\u8C03\u7528\u5916\u90E8\u6A21\u578B\u3002",
  "settings.ai.api.name": "\u81EA\u5B9A\u4E49\u5927\u6A21\u578B API",
  "settings.ai.api.desc": "\u652F\u6301 Chat Completions\u3001Responses \u548C Anthropic Messages \u534F\u8BAE\uFF0C\u751F\u6210\u63D0\u4EA4\u8BF4\u660E\u5E76\u8F85\u52A9\u7406\u89E3\u53D8\u66F4\u3002",
  "settings.ai.protocol": "API \u534F\u8BAE",
  "settings.ai.protocolHint": "\u8BF7\u9009\u62E9\u670D\u52A1\u652F\u6301\u7684\u534F\u8BAE\uFF0C\u5E76\u586B\u5199\u5BF9\u5E94\u5730\u5740\u548C\u6A21\u578B\uFF1B\u5207\u6362\u534F\u8BAE\u4F1A\u4FDD\u7559\u539F\u6709\u914D\u7F6E\u3002",
  "settings.ai.needModel": "\u8BF7\u586B\u5199\u6A21\u578B\u540D\u79F0",
  "settings.ai.endpoint": "API \u7AEF\u70B9 (Base URL)",
  "settings.ai.endpointHint": "\u53EF\u586B\u5199 Base URL \u6216\u5B8C\u6574\u63A5\u53E3\u5730\u5740\uFF0C\u81EA\u52A8\u5904\u7406\u63A5\u53E3\u540E\u7F00\uFF0C\u4E0D\u4F1A\u91CD\u590D\u62FC\u63A5\u3002",
  "settings.ai.testTimeout": "\u8FDE\u63A5\u6D4B\u8BD5\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u670D\u52A1\u5730\u5740\u3001\u7F51\u7EDC\u6216\u7A0D\u540E\u91CD\u8BD5\u3002",
  "err.aiInvalidResponse": "\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\uFF0C\u4EE5\u4E0B\u662F\u5B8C\u6574\u539F\u59CB\u5185\u5BB9\uFF1A",
  "settings.ai.model": "\u6A21\u578B\u540D\u79F0",
  "settings.ai.testBtn": "\u6D4B\u8BD5\u8FDE\u63A5",
  "settings.ai.testing": "\u6B63\u5728\u6D4B\u8BD5...",
  "settings.ai.apiKeyLabel": "API \u5BC6\u94A5",
  "settings.github.notConnected": "GitHub \u8D26\u53F7\u672A\u8FDE\u63A5",
  "settings.github.notConnectedDesc": "\u901A\u8FC7\u5B89\u5168 OAuth \u767B\u5F55\u4EE5\u67E5\u770B Actions \u4E0E PR",
  "settings.github.login": "\u767B\u5F55 GitHub",
  "settings.github.disconnectToast": "\u5DF2\u65AD\u5F00 GitHub \u8D26\u53F7\u8FDE\u63A5",
  "settings.github.accountsTitle": "\u5DF2\u8FDE\u63A5\u7684\u8D26\u53F7",
  "settings.github.currentBadge": "\u5F53\u524D\u4F7F\u7528",
  "settings.github.switchTo": "\u5207\u6362",
  "settings.github.removedToast": "\u5DF2\u65AD\u5F00 {login} \u7684\u8D26\u53F7\u8FDE\u63A5",
  // ============ 顶栏 ============
  "header.login": "\u767B\u5F55",
  "header.repository": "\u4ED3\u5E93",
  "header.branch": "\u5206\u652F",
  "header.undo": "\u64A4\u56DE\u4E0A\u6B21\u63D0\u4EA4",
  "header.redo": "\u6062\u590D\u64A4\u56DE\u7684\u63D0\u4EA4",
  "header.pull": "\u62C9\u53D6",
  "header.push": "\u63A8\u9001",
  "header.branchAction": "\u65B0\u5EFA\u5206\u652F",
  "header.stash": "\u8D2E\u85CF",
  "header.pop": "\u6062\u590D\u5E76\u79FB\u9664\u8D2E\u85CF",
  "header.terminal": "Git \u63A7\u5236\u53F0",
  "header.actions": "Actions",
  "header.search": "\u641C\u7D22",
  "header.undoTooltip": "\u64A4\u9500\u6700\u65B0\u4E00\u6B21\u63D0\u4EA4 (git reset --soft HEAD~1)",
  "header.undoTooltipEmpty": "\u5F53\u524D\u5206\u652F\u6682\u65E0\u63D0\u4EA4\u53EF\u64A4\u9500",
  "header.redoTooltipPrefix": "\u91CD\u505A\u5E76\u6062\u590D\u63D0\u4EA4",
  "header.redoTooltipEmpty": "\u6682\u65E0\u53EF\u91CD\u505A\u7684\u64CD\u4F5C (Redo)",
  "header.pullTooltip": "\u4ECE\u8FDC\u7A0B\u62C9\u53D6\u6700\u65B0\u63D0\u4EA4 (git pull)",
  "header.pullMenu": "Pull (git pull)",
  "header.pullRebase": "Pull with Rebase",
  "header.fetchAll": "\u83B7\u53D6\u6240\u6709\u8FDC\u7A0B\u4ED3\u5E93 (git fetch --all)",
  "header.pushTooltip": "\u63A8\u9001\u672C\u5730\u63D0\u4EA4\u81F3\u8FDC\u7A0B (git push)",
  "header.branchTooltip": "\u521B\u5EFA\u65B0\u5206\u652F (git branch)",
  "header.stashTooltip": "\u8D2E\u85CF\u5F53\u524D\u672A\u63D0\u4EA4\u6539\u52A8 (git stash)",
  "header.stashTooltipEmpty": "\u5F53\u524D\u5DE5\u4F5C\u533A\u65E0\u6539\u52A8\u53EF\u8D2E\u85CF",
  "header.popTooltip": "\u6062\u590D\u6700\u65B0\u8D2E\u85CF",
  "header.popTooltipEmpty": "\u6682\u65E0\u8D2E\u85CF\u53EF\u6062\u590D",
  "header.terminalTooltip": "\u6253\u5F00 Git \u547D\u4EE4\u63A7\u5236\u53F0\uFF08Ctrl+`\uFF09\uFF0C\u5176\u4ED6\u547D\u4EE4\u8BF7\u4F7F\u7528\u7CFB\u7EDF\u7EC8\u7AEF",
  "header.morePullOptions": "\u66F4\u591A\u62C9\u53D6\u9009\u9879",
  "header.repoMenu.current": "\u5F53\u524D\u4ED3\u5E93",
  "header.repoMenu.openOther": "\u6253\u5F00\u5176\u4ED6\u672C\u5730\u4ED3\u5E93...",
  "header.repoMenu.recent": "\u6700\u8FD1\u6253\u5F00",
  "header.repoMenu.switchedToast": "\u5DF2\u5207\u6362\u81F3\u4ED3\u5E93",
  "header.branchMenu.searchPlaceholder": "\u641C\u7D22\u5E76\u5207\u6362\u5206\u652F...",
  "header.branchMenu.local": "\u672C\u5730\u5206\u652F",
  "header.branchMenu.noMatch": "\u672A\u5339\u914D\u5230\u5206\u652F",
  "header.branchMenu.create": "\u521B\u5EFA\u65B0\u5206\u652F...",
  "header.branchMenu.head": "HEAD",
  "header.expandLeftSidebar": "\u5C55\u5F00\u5DE6\u4FA7\u8FB9\u680F",
  "header.collapseLeftSidebar": "\u6536\u8D77\u5DE6\u4FA7\u8FB9\u680F",
  "header.expandRightPane": "\u5C55\u5F00\u63D0\u4EA4\u4E0E\u68C0\u67E5\u9762\u677F",
  "header.collapseRightPane": "\u6536\u8D77\u53F3\u4FA7\u9762\u677F",
  // ============ 欢迎页 ============
  "welcome.title": "AuuGit",
  "welcome.tagline": "\u8F7B\u91CF\u3001\u73B0\u4EE3\u3001\u7F8E\u89C2\u3001\u6781\u901F\u7684\u684C\u9762 Git \u5BA2\u6237\u7AEF\u4E0E GitHub \u5F00\u53D1\u8005\u4EEA\u8868\u76D8\u3002",
  "welcome.openRepo": "\u6253\u5F00\u672C\u5730\u4ED3\u5E93",
  "welcome.openRepoDesc": "\u6D4F\u89C8\u5E76\u8F7D\u5165\u5DF2\u6709\u9879\u76EE",
  "welcome.cloneRepo": "\u514B\u9686\u8FDC\u7A0B\u4ED3\u5E93",
  "welcome.cloneRepoDesc": "\u4ECE GitHub \u6216 URL \u514B\u9686",
  "welcome.initRepo": "\u65B0\u5EFA\u672C\u5730\u4ED3\u5E93",
  "welcome.initRepoDesc": "\u521D\u59CB\u5316\u5168\u65B0 Git \u4ED3\u5E93",
  "welcome.recent": "\u6700\u8FD1\u4F7F\u7528\u7684\u9879\u76EE",
  "welcome.rightPane.title": "\u672A\u9009\u62E9\u4ED3\u5E93",
  "welcome.rightPane.desc": "\u8BF7\u5728\u5DE6\u4FA7\u6216\u4E3B\u754C\u9762\u6253\u5F00\u4E00\u4E2A Git \u4ED3\u5E93\u4EE5\u67E5\u770B\u63D0\u4EA4\u5386\u53F2\u6216\u5DE5\u4F5C\u533A\u53D8\u66F4\u3002",
  "welcome.status.ready": "\u5C31\u7EEA - \u6682\u672A\u8F7D\u5165 Git \u4ED3\u5E93",
  // ============ 左侧边栏 ============
  "sidebar.changes": "\u5DE5\u4F5C\u533A\u53D8\u66F4",
  "sidebar.review": "\u63D0\u4EA4\u5386\u53F2 \xB7 \u9636\u6BB5\u590D\u6838",
  "sidebar.changes.clean": "\u5E72\u51C0",
  "sidebar.history": "\u63D0\u4EA4\u5386\u53F2",
  "sidebar.pullRequests": "\u62C9\u53D6\u8BF7\u6C42",
  "sidebar.actions": "GitHub Actions",
  "sidebar.viewing": "\u67E5\u770B",
  "sidebar.commits": "\u4E2A\u63D0\u4EA4",
  "sidebar.diagnose": "\u8BCA\u65AD",
  "sidebar.filterPlaceholder": "\u7B5B\u9009 (Ctrl+Alt+F)...",
  "sidebar.local": "\u672C\u5730\u5206\u652F",
  "sidebar.remote": "\u8FDC\u7A0B\u5206\u652F",
  "sidebar.tags": "\u6807\u7B7E",
  "sidebar.stashes": "\u8D2E\u85CF",
  "sidebar.mergeInto": "\u5408\u5E76\u5230\u5F53\u524D\u5206\u652F",
  "sidebar.newTag": "\u65B0\u5EFA\u6807\u7B7E",
  "sidebar.pushAllTags": "\u63A8\u9001\u6240\u6709\u6807\u7B7E\u5230\u8FDC\u7A0B (git push --tags)",
  "sidebar.stashChanges": "\u8D2E\u85CF\u5F53\u524D\u4FEE\u6539",
  "sidebar.noLocalBranches": "\u6682\u65E0\u672C\u5730\u5206\u652F",
  // ============ 右侧面板 ============
  "rightPane.inspector": "\u68C0\u67E5\u4E0E\u63D0\u4EA4",
  "rightPane.filesChanged": "\u4E2A\u6587\u4EF6\u53D8\u66F4",
  "rightPane.staged": "\u5DF2\u6682\u5B58",
  "rightPane.path": "\u8DEF\u5F84",
  "rightPane.tree": "\u6811\u5F62",
  "rightPane.noPendingChanges": "\u6682\u65E0\u5F85\u63D0\u4EA4\u7684\u6587\u4EF6\u4FEE\u6539",
  "rightPane.commitMessage": "\u63D0\u4EA4\u4FE1\u606F",
  "rightPane.recomposeAi": "\u751F\u6210\u63D0\u4EA4\u8BF4\u660E",
  "rightPane.messagePlaceholder": "\u7B80\u660E\u63CF\u8FF0\u6539\u52A8 (Ctrl + Enter \u5FEB\u901F\u63D0\u4EA4)...",
  "rightPane.amend": "\u4FEE\u6539\u4E0A\u4E00\u6761\u63D0\u4EA4",
  "rightPane.commitAmend": "\u8986\u76D6\u63D0\u4EA4",
  "rightPane.stageAllCommit": "\u6682\u5B58\u5168\u90E8\u5E76\u63D0\u4EA4",
  "rightPane.filesSuffix": "\u4E2A\u6587\u4EF6",
  "rightPane.commit": "\u63D0\u4EA4\u53D8\u66F4",
  "rightPane.commitPush": "\u63D0\u4EA4\u5E76\u63A8\u9001",
  "rightPane.stageAllCommitPush": "\u6682\u5B58\u5168\u90E8\u3001\u63D0\u4EA4\u5E76\u63A8\u9001",
  "rightPane.noFileSelected": "\u672A\u9009\u62E9\u4EFB\u4F55\u6587\u4EF6",
  "rightPane.noFileSelectedDesc": "\u8BF7\u5728\u5DE6\u4FA7\u9009\u62E9\u9700\u8981\u5BF9\u6BD4\u7684\u6587\u4EF6",
  "rightPane.changes": "\u53D8\u66F4",
  // ============ 状态栏 ============
  "status.ready": "\u5C31\u7EEA - \u6682\u672A\u8F7D\u5165 Git \u4ED3\u5E93",
  "status.gitReady": "Git \u5C31\u7EEA",
  // ============ 工作区视图 ============
  "changes.empty": "\u5DE5\u4F5C\u533A\u975E\u5E38\u5E72\u51C0",
  "changes.emptyDesc": "\u6CA1\u6709\u4EFB\u4F55\u672A\u63D0\u4EA4\u7684\u4FEE\u6539\u6216\u672A\u8DDF\u8E2A\u6587\u4EF6\u3002",
  "changes.section.staged": "\u5DF2\u6682\u5B58",
  "changes.section.unstaged": "\u672A\u6682\u5B58\u6539\u52A8",
  "changes.untracked": "\u672A\u8DDF\u8E2A\u6587\u4EF6",
  "changes.stageAll": "\u6682\u5B58\u5168\u90E8",
  "changes.unstageAll": "\u5168\u90E8\u53D6\u6D88",
  "changes.stageAllToast": "\u5DF2\u6682\u5B58\u6240\u6709\u5DE5\u4F5C\u533A\u4FEE\u6539",
  "changes.unstageAllToast": "\u5DF2\u53D6\u6D88\u5168\u90E8\u6682\u5B58",
  "changes.discardConfirm": "\u7684\u6240\u6709\u672A\u6682\u5B58\u4FEE\u6539\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\uFF01",
  "changes.discardConfirmPrefix": "\u786E\u8BA4\u653E\u5F03",
  "changes.discarded": "\u5DF2\u8FD8\u539F\u6587\u4EF6",
  "changes.discardFailed": "\u8FD8\u539F\u5931\u8D25",
  "changes.stagedToast": "\u5DF2\u6682\u5B58",
  "changes.stageFailed": "\u6682\u5B58\u5931\u8D25",
  "changes.unstagedToast": "\u5DF2\u53D6\u6D88\u6682\u5B58",
  "changes.unstageFailed": "\u53D6\u6D88\u6682\u5B58\u5931\u8D25",
  "changes.tracked": "\u5DF2\u6DFB\u52A0\u8DDF\u8E2A",
  "changes.trackedFailed": "\u6DFB\u52A0\u8DDF\u8E2A\u5931\u8D25",
  "changes.resolved": "\u5DF2\u6807\u8BB0\u89E3\u51B3",
  "changes.resolvedFailed": "\u6807\u8BB0\u89E3\u51B3\u5931\u8D25",
  // ============ 右栏补充 ============
  "rightPane.commitDetails": "\u63D0\u4EA4\u8BE6\u60C5",
  "rightPane.operationFailed": "\u64CD\u4F5C\u5931\u8D25",
  "rightPane.copyHash": "\u5DF2\u590D\u5236 Commit Hash",
  "rightPane.copyHashTitle": "\u70B9\u51FB\u590D\u5236\u5B8C\u6574 Hash",
  "rightPane.aiReorganize": "\u5C06\u6B64\u63D0\u4EA4\u7684\u8BF4\u660E\u590D\u5236\u5230\u5DE5\u4F5C\u533A\u8349\u7A3F",
  "rightPane.extractedToChanges": "\u5DF2\u63D0\u53D6\u63D0\u4EA4\u4FE1\u606F\u81F3\u5DE5\u4F5C\u533A\u5E76\u5207\u6362",
  "rightPane.sortAsc": "\u6309\u540D\u79F0\u5347\u5E8F",
  "rightPane.sortDesc": "\u6309\u540D\u79F0\u964D\u5E8F",
  "rightPane.loadingChanges": "\u6B63\u5728\u52A0\u8F7D\u53D8\u66F4\u6587\u4EF6...",
  "rightPane.noFileChanges": "\u6B64\u63D0\u4EA4\u65E0\u6587\u4EF6\u6539\u52A8",
  "rightPane.viewDiffHint": "\u70B9\u51FB\u67E5\u770B Diff",
  "rightPane.closePreview": "\u5173\u95ED\u9884\u89C8",
  "rightPane.loadingDiff": "\u6B63\u5728\u83B7\u53D6\u5DEE\u5F02\u5BF9\u6BD4...",
  "rightPane.noTextDiff": "\u65E0\u6587\u672C\u5DEE\u5F02\u6216\u4E3A\u4E8C\u8FDB\u5236\u6587\u4EF6",
  "rightPane.diffTruncated": "\u4EC5\u9884\u89C8\u524D 100 \u884C\u5DEE\u5F02",
  "rightPane.checksPass": "\u901A\u8FC7",
  "rightPane.noChecks": "\u672A\u914D\u7F6E\u6216\u65E0\u6B63\u5728\u6267\u884C\u7684 Checks",
  "rightPane.aiGenHint": "\u6839\u636E\u672C\u6B21\u63D0\u4EA4\u8303\u56F4\u751F\u6210\u8BF4\u660E\uFF0C\u751F\u6210\u7ED3\u679C\u5148\u9884\u89C8\u3002",
  "rightPane.aiSuccessLlm": "AI (\u5927\u6A21\u578B) \u63D0\u4EA4\u8BF4\u660E\u751F\u6210\u6210\u529F",
  "rightPane.aiSuccessBuiltin": "\u672C\u5730\u89C4\u5219\u5DF2\u751F\u6210\u63D0\u4EA4\u8BF4\u660E",
  "rightPane.aiFailed": "\u751F\u6210\u5931\u8D25",
  "rightPane.aiFailedDesc": "\u65E0\u6CD5\u5206\u6790\u6587\u4EF6\u751F\u6210\u63D0\u4EA4\u8BF4\u660E",
  "rightPane.noRepoTitle": "\u672A\u6253\u5F00\u4ED3\u5E93",
  "rightPane.noRepoDesc": "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Git \u4ED3\u5E93",
  "rightPane.noChangesTitle": "\u65E0\u53D8\u66F4\u6587\u4EF6",
  "rightPane.noChangesDesc": "\u5DE5\u4F5C\u533A\u6682\u65E0\u53EF\u4F9B AI \u5206\u6790\u7684\u6587\u4EF6",
  "rightPane.needCommitMessage": "\u8BF7\u8F93\u5165\u63D0\u4EA4\u4FE1\u606F",
  "rightPane.needCommitMessageDesc": "Commit message \u4E0D\u80FD\u4E3A\u7A7A",
  "rightPane.nothingToCommit": "\u65E0\u53EF\u63D0\u4EA4\u7684\u53D8\u66F4",
  "rightPane.nothingToCommitDesc": "\u5F53\u524D\u5DE5\u4F5C\u533A\u65E0\u4EFB\u4F55\u4FEE\u6539",
  "rightPane.autoStaging": "\u6B63\u5728\u81EA\u52A8\u6682\u5B58\u6240\u6709\u5DE5\u4F5C\u533A\u4FEE\u6539...",
  "rightPane.amendSuccess": "\u5DF2\u8986\u76D6\u4FEE\u6539\u4E0A\u4E00\u6761\u63D0\u4EA4 (Amend)",
  "rightPane.commitSuccess": "\u65B0\u63D0\u4EA4\u521B\u5EFA\u6210\u529F\uFF01",
  "rightPane.pushing": "\u6B63\u5728\u63A8\u9001\u672C\u5730\u63D0\u4EA4\u5230\u8FDC\u7A0B (git push)...",
  "rightPane.pushSuccess": "\u5DF2\u6210\u529F\u63A8\u9001\u5230\u8FDC\u7A0B\u4ED3\u5E93",
  "rightPane.pushFailed": "\u63A8\u9001\u5931\u8D25",
  "rightPane.commitFailed": "\u63D0\u4EA4\u5931\u8D25",
  // ============ 工作区补充 ============
  "changes.conflictBadge": "\u5B58\u5728\u672A\u89E3\u51B3\u4EE3\u7801\u51B2\u7A81",
  "changes.conflict": "\u51B2\u7A81",
  "changes.copiedPath": "\u5DF2\u590D\u5236\u6587\u4EF6\u8DEF\u5F84",
  "changes.quickStashMsg": "\u5DE5\u4F5C\u533A\u5FEB\u6377\u6682\u5B58",
  "changes.stashSuccess": "\u5DF2\u5B58\u5165\u8D2E\u85CF (Stash)",
  "changes.stashSuccessDesc": "\u4FEE\u6539\u5DF2\u5B58\u5165\u8D2E\u85CF\u5806\u6808",
  "changes.stashFailed": "\u8D2E\u85CF\u5931\u8D25",
  "changes.quickStashTitle": "\u5FEB\u901F\u6682\u5B58\u5F53\u524D\u4FEE\u6539\u5E76\u8FD8\u539F\u5DE5\u4F5C\u533A",
  "changes.stash": "\u8D2E\u85CF",
  "changes.unstageTitle": "\u53D6\u6D88\u6682\u5B58",
  "changes.stageAllSection": "\u5168\u90E8\u6682\u5B58",
  "changes.unstageAllSection": "\u5168\u90E8\u53D6\u6D88",
  "changes.addAllSection": "\u5168\u90E8\u6DFB\u52A0",
  "changes.addAllToast": "\u5DF2\u6DFB\u52A0\u5168\u90E8\u672A\u8DDF\u8E2A\u6587\u4EF6",
  "changes.openConflictTool": "\u6253\u5F00\u89E3\u51B3\u51B2\u7A81\u5DE5\u4F5C\u53F0",
  "changes.takeOurs": "\u91C7\u7528\u5F53\u524D\u66F4\u6539 (Ours)",
  "changes.tookOurs": "\u5DF2\u91C7\u7528\u5F53\u524D\u7248\u672C",
  "changes.takeTheirs": "\u91C7\u7528\u4F20\u5165\u66F4\u6539 (Theirs)",
  "changes.tookTheirs": "\u5DF2\u91C7\u7528\u4F20\u5165\u7248\u672C",
  "changes.resetMarkers": "\u91CD\u7F6E\u56DE\u51B2\u7A81\u6807\u8BB0 (Reset Markers)",
  "changes.markersReset": "\u5DF2\u91CD\u7F6E\u51B2\u7A81\u6807\u8BB0",
  "changes.resetFailed": "\u91CD\u7F6E\u5931\u8D25",
  "ignore.title": "\u5FFD\u7565\u2026",
  "ignore.manage": "\u5FFD\u7565\u89C4\u5219\u2026",
  "ignore.selected": "\u5DF2\u9009\u62E9 {n} \u4E2A\u672A\u8DDF\u8E2A\u6587\u4EF6",
  "ignore.destination": "\u4FDD\u5B58\u4F4D\u7F6E",
  "ignore.shared": "\u4ED3\u5E93\u5171\u4EAB\u89C4\u5219\uFF08.gitignore\uFF09",
  "ignore.local": "\u4EC5\u672C\u673A\u6B64\u4ED3\u5E93\uFF08.git/info/exclude\uFF09",
  "ignore.sharedHint": "\u89C4\u5219\u968F .gitignore \u63D0\u4EA4\u540E\u53EF\u4E0E\u56E2\u961F\u5171\u4EAB\u3002",
  "ignore.localHint": "\u89C4\u5219\u53EA\u4FDD\u5B58\u5728\u6B64\u4ED3\u5E93\u7684\u672C\u673A Git \u914D\u7F6E\u4E2D\u3002",
  "ignore.range": "\u5FFD\u7565\u8303\u56F4",
  "ignore.mode.file": "\u4EC5\u6240\u9009\u6587\u4EF6",
  "ignore.mode.typeHere": "\u6240\u5728\u76EE\u5F55\u4E0B\u7684\u540C\u7C7B\u578B\u6587\u4EF6",
  "ignore.mode.typeTree": "\u6240\u5728\u76EE\u5F55\u53CA\u5B50\u76EE\u5F55\u4E0B\u7684\u540C\u7C7B\u578B\u6587\u4EF6",
  "ignore.mode.typeAll": "\u4ED3\u5E93\u4E2D\u6240\u6709\u540C\u7C7B\u578B\u6587\u4EF6",
  "ignore.mode.directory": "\u6574\u4E2A\u6240\u5728\u76EE\u5F55",
  "ignore.mode.custom": "\u81EA\u5B9A\u4E49\u89C4\u5219",
  "ignore.hint.file": "\u53EA\u5339\u914D\u6240\u9009\u6587\u4EF6\u7684\u5B8C\u6574\u8DEF\u5F84\u3002",
  "ignore.hint.typeHere": "\u6309\u4E0B\u65B9\u663E\u793A\u7684\u6269\u5C55\u540D\u5339\u914D\uFF0C\u4E0D\u5305\u542B\u5B50\u76EE\u5F55\u3002",
  "ignore.hint.typeTree": "\u6309\u4E0B\u65B9\u663E\u793A\u7684\u6269\u5C55\u540D\u5339\u914D\uFF0C\u5305\u542B\u6240\u6709\u5B50\u76EE\u5F55\u3002",
  "ignore.hint.typeAll": "\u6309\u4E0B\u65B9\u663E\u793A\u7684\u6269\u5C55\u540D\u5339\u914D\u4ED3\u5E93\u4E2D\u7684\u6240\u6709\u76EE\u5F55\u3002",
  "ignore.hint.directory": "\u5FFD\u7565\u6240\u5728\u76EE\u5F55\u53CA\u5176\u5168\u90E8\u5185\u5BB9\u3002",
  "ignore.editor": "\u7F16\u8F91\u89C4\u5219",
  "ignore.rules": "\u5C06\u6DFB\u52A0\u7684\u89C4\u5219\uFF08\u6BCF\u884C\u4E00\u6761\uFF09",
  "ignore.loading": "\u6B63\u5728\u68C0\u67E5\u89C4\u5219\u548C\u5F71\u54CD\u8303\u56F4\u2026",
  "ignore.affected": "\u5C06\u5FFD\u7565 {n} \u4E2A\u5F53\u524D\u672A\u8DDF\u8E2A\u6587\u4EF6",
  "ignore.showFiles": "\u67E5\u770B\u6587\u4EF6\u5217\u8868",
  "ignore.tracked": "\u53E6\u6709 {n} \u4E2A\u5DF2\u8DDF\u8E2A\u6587\u4EF6\u5339\u914D\u89C4\u5219\uFF0C\u4ECD\u4F1A\u7EE7\u7EED\u8DDF\u8E2A",
  "ignore.exceptions": "\u6709 {n} \u4E2A\u6240\u9009\u8DEF\u5F84\u4E0D\u4F1A\u88AB\u5FFD\u7565\uFF0C\u8BF7\u68C0\u67E5\u89C4\u5219\u548C\u5B50\u76EE\u5F55\u4E2D\u7684\u4F8B\u5916\u3002",
  "ignore.previewHint": "\u9884\u89C8\u57FA\u4E8E\u5F53\u524D\u6587\u4EF6\u53CA\u4ED3\u5E93\u5185\u89C4\u5219\uFF1B\u540E\u7EED\u65B0\u6587\u4EF6\u4E5F\u4F1A\u6309\u8FD9\u4E9B\u89C4\u5219\u5339\u914D\u3002\u5DF2\u8DDF\u8E2A\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD\u3002",
  "ignore.checkPath": "\u67E5\u8BE2\u6587\u4EF6\u8DEF\u5F84",
  "ignore.check": "\u67E5\u8BE2\u5DF2\u4FDD\u5B58\u7684\u89C4\u5219",
  "ignore.checkHint": "\u8F93\u5165\u4ED3\u5E93\u76F8\u5BF9\u8DEF\u5F84\uFF1B\u67E5\u8BE2\u4F7F\u7528 Git \u5B9E\u9645\u89C4\u5219\uFF0C\u4E0D\u5305\u542B\u5C1A\u672A\u4FDD\u5B58\u7684\u7F16\u8F91\u3002",
  "ignore.notIgnored": "\u6CA1\u6709\u5339\u914D\u7684\u5FFD\u7565\u89C4\u5219\u3002",
  "ignore.save": "\u4FDD\u5B58\u89C4\u5219",
  "ignore.add": "\u6DFB\u52A0\u5FFD\u7565\u89C4\u5219",
  "ignore.saved": "\u5FFD\u7565\u89C4\u5219\u5DF2\u4FDD\u5B58",
  "ignore.undo": "\u64A4\u9500",
  "ignore.undone": "\u5DF2\u64A4\u9500\u672C\u6B21\u89C4\u5219\u4FEE\u6539",
  "ignore.undoFailed": "\u65E0\u6CD5\u64A4\u9500\uFF1A\u89C4\u5219\u53EF\u80FD\u5DF2\u88AB\u4FEE\u6539\uFF0C\u8BF7\u5728\u5FFD\u7565\u89C4\u5219\u4E2D\u68C0\u67E5",
  "ignore.changed": "\u89C4\u5219\u5DF2\u5728\u5916\u90E8\u4FEE\u6539\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u540E\u518D\u4FDD\u5B58\uFF1B\u91CD\u65B0\u52A0\u8F7D\u4F1A\u4E22\u5F03\u5F53\u524D\u7F16\u8F91\u3002",
  "ignore.reload": "\u91CD\u65B0\u52A0\u8F7D\u89C4\u5219",
  "ignore.verifyWarning": "Git \u68C0\u67E5\u53D1\u73B0\u4ECD\u6709 {n} \u4E2A\u5339\u914D\u6587\u4EF6\u672A\u88AB\u5FFD\u7565\uFF0C\u8BF7\u67E5\u770B\u5FFD\u7565\u89C4\u5219\u3002",
  "ignore.verifyFailed": "\u89C4\u5219\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u6682\u65F6\u65E0\u6CD5\u9A8C\u8BC1 Git \u7684\u5FFD\u7565\u7ED3\u679C\uFF0C\u8BF7\u5237\u65B0\u68C0\u67E5\u3002",
  "worktree.title": "Worktrees \u7BA1\u7406\u2026",
  "worktree.description": "\u6BCF\u4E2A Worktree \u90FD\u6709\u72EC\u7ACB\u7684\u5DE5\u4F5C\u76EE\u5F55\u3002\u6253\u5F00\u5DF2\u5360\u7528\u5206\u652F\u65F6\u4F1A\u8F6C\u5230\u5BF9\u5E94\u76EE\u5F55\uFF0C\u4FDD\u7559\u5F53\u524D\u76EE\u5F55\u7684\u4FEE\u6539\u3002",
  "worktree.existing": "\u5DF2\u6709 Worktrees",
  "worktree.refresh": "\u5237\u65B0\u5217\u8868",
  "worktree.loading": "\u6B63\u5728\u8BFB\u53D6 Worktrees\u2026",
  "worktree.bare": "\u88F8\u4ED3\u5E93",
  "worktree.detached": "\u5206\u79BB\u7684 HEAD",
  "worktree.main": "\u4E3B\u5DE5\u4F5C\u533A",
  "worktree.current": "\u5F53\u524D\u76EE\u5F55",
  "worktree.locked": "\u5DF2\u9501\u5B9A",
  "worktree.unavailable": "\u76EE\u5F55\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u78C1\u76D8\u6216\u8DEF\u5F84\u3002",
  "worktree.open": "\u6253\u5F00 Worktree",
  "worktree.create": "\u521B\u5EFA Worktree",
  "worktree.created": "Worktree \u5DF2\u521B\u5EFA",
  "worktree.branchMode": "\u5206\u652F\u65B9\u5F0F",
  "worktree.newBranch": "\u521B\u5EFA\u65B0\u5206\u652F",
  "worktree.useExisting": "\u4F7F\u7528\u7A7A\u95F2\u7684\u5DF2\u6709\u5206\u652F",
  "worktree.branchName": "\u5206\u652F\u540D\u79F0",
  "worktree.base": "\u8D77\u59CB\u7248\u672C",
  "worktree.pickFree": "\u8BF7\u9009\u62E9\u672A\u88AB Worktree \u4F7F\u7528\u7684\u5206\u652F",
  "worktree.path": "\u65B0\u5DE5\u4F5C\u76EE\u5F55\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09",
  "worktree.openAfter": "\u521B\u5EFA\u540E\u6253\u5F00\u6B64 Worktree",
  "worktree.invalidPath": "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u65B0\u5DE5\u4F5C\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\u3002",
  "worktree.invalidBranch": "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u5206\u652F\u540D\u79F0\u6216\u8D77\u59CB\u7248\u672C\u3002",
  "worktree.inUse": "\u8BE5\u5206\u652F\u5DF2\u5728 Worktree \u4E2D\u4F7F\u7528\uFF0C\u8BF7\u5148\u6253\u5F00\u5BF9\u5E94\u76EE\u5F55\uFF1A{path}",
  "changes.opFailed": "\u64CD\u4F5C\u5931\u8D25",
  "changes.discardTitle": "\u653E\u5F03\u4FEE\u6539 (Discard)",
  "changes.stageTitle": "\u6682\u5B58\u6B64\u6587\u4EF6 (Stage)",
  "changes.resolvedTitle": "\u51B2\u7A81\u5DF2\u5168\u90E8\u89E3\u51B3\uFF0C\u6682\u5B58\u6B64\u6587\u4EF6 (Stage)",
  "changes.trackStageTitle": "\u8DDF\u8E2A\u5E76\u6682\u5B58",
  "changes.resizeHint": "\u6309\u4F4F\u62D6\u62FD\u8C03\u8282\u53D8\u66F4\u5217\u8868\u5BBD\u5EA6\uFF0C\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4",
  "changes.copyPath": "\u590D\u5236\u8DEF\u5F84",
  "changes.stagedSuffix": "(\u5DF2\u6682\u5B58)",
  "changes.resolveConflict": "\u89E3\u51B3\u51B2\u7A81",
  "changes.viewDiff": "\u67E5\u770B Diff",
  "changes.unstageOrStage": "\u53D6\u6D88\u6682\u5B58",
  "changes.stageThisFile": "\u6682\u5B58\u6B64\u6587\u4EF6",
  "changes.emptyDiffUntracked": "\u65E0\u6587\u672C\u5DEE\u5F02\uFF08\u6587\u4EF6\u53EF\u80FD\u4E3A\u7A7A\uFF0C\u6216\u4EC5\u6709\u5C5E\u6027\u53D8\u5316\uFF09",
  // ============ Header 补充 ============
  "header.themeSwitchedDark": "\u5DF2\u5207\u6362\u4E3A\u6DF1\u8272\u6697\u9ED1\u4E3B\u9898",
  "header.themeSwitchedLight": "\u5DF2\u5207\u6362\u4E3A\u660E\u4EAE\u6D45\u8272\u4E3B\u9898",
  "header.fetching": "\u6B63\u5728\u83B7\u53D6\u8FDC\u7A0B\u66F4\u65B0 (git fetch)...",
  "header.fetchFailed": "Fetch \u5931\u8D25",
  "header.fetchDone": "\u5DF2\u540C\u6B65\u83B7\u53D6\u8FDC\u7A0B\u6700\u65B0\u53D8\u66F4 (Fetch completed)",
  "header.pulling": "\u6B63\u5728\u62C9\u53D6\u8FDC\u7A0B\u66F4\u65B0 (git pull)...",
  "header.pulled": "\u5DF2\u6210\u529F\u62C9\u53D6\u6700\u65B0\u63D0\u4EA4",
  "header.pullFailed": "Pull \u5931\u8D25",
  "header.pushing": "\u6B63\u5728\u63A8\u9001\u672C\u5730\u63D0\u4EA4\u5230\u8FDC\u7A0B (git push)...",
  "header.pushed": "\u5DF2\u6210\u529F\u63A8\u9001\u5230\u8FDC\u7A0B\u4ED3\u5E93",
  "header.pushFailed": "\u63A8\u9001\u5931\u8D25",
  "header.morePushOptions": "\u66F4\u591A\u63A8\u9001\u9009\u9879",
  "header.forcePush": "\u5F3A\u5236\u63A8\u9001 (--force-with-lease)",
  "header.forcePushConfirm": "\u786E\u5B9A\u8981\u5F3A\u5236\u63A8\u9001\u5417\uFF1F\u8FDC\u7A0B\u5206\u652F\u5C06\u88AB\u672C\u5730\u63D0\u4EA4\u8986\u76D6\uFF08--force-with-lease \u4EC5\u5728\u8FDC\u7A0B\u65E0\u4ED6\u4EBA\u65B0\u63D0\u4EA4\u65F6\u751F\u6548\uFF09\u3002\u6B64\u64CD\u4F5C\u53EF\u80FD\u5F71\u54CD\u534F\u4F5C\u8005\uFF0C\u8BF7\u8C28\u614E\u4F7F\u7528\uFF01",
  "header.undoing": "\u6B63\u5728\u5B89\u5168\u64A4\u9500\u6700\u65B0\u63D0\u4EA4 (git reset --soft HEAD~1)...",
  "header.undoFailed": "\u64A4\u9500\u63D0\u4EA4\u5931\u8D25",
  "header.redoCannot": "\u65E0\u6CD5\u91CD\u505A",
  "header.redoBelongsTo": "\u8BE5\u63D0\u4EA4\u5C5E\u4E8E\u5206\u652F",
  "header.redoing": "\u6B63\u5728\u91CD\u505A\u6062\u590D\u63D0\u4EA4",
  "header.redone": "\u5DF2\u6210\u529F\u91CD\u505A\u6062\u590D\u63D0\u4EA4",
  "header.redoFailed": "\u91CD\u505A\u5931\u8D25",
  "header.stashed": "\u5DE5\u4F5C\u533A\u53D8\u52A8\u5DF2\u5B89\u5168\u6682\u5B58 (Stash)",
  "header.popDone": "\u5DF2\u6062\u590D\u6700\u65B0\u8D2E\u85CF\u5230\u5DE5\u4F5C\u533A (Stash Pop)",
  "header.popFailed": "\u5F39\u51FA\u8D2E\u85CF\u5931\u8D25",
  "header.terminalOpened": "\u5DF2\u8C03\u8D77\u5185\u5D4C\u547D\u4EE4\u884C\u7EC8\u7AEF",
  "header.terminalClosed": "\u5DF2\u6536\u8D77\u5185\u5D4C\u7EC8\u7AEF",
  "header.closeRepoTab": "\u5173\u95ED\u4ED3\u5E93\u6807\u7B7E\u9875",
  "header.loggedInAs": "\u5DF2\u767B\u5F55",
  "header.signGithubTooltip": "\u767B\u5F55 GitHub",
  "header.rebasePulling": "\u6B63\u5728\u6267\u884C\u53D8\u57FA\u62C9\u53D6 (git pull --rebase)...",
  "header.rebasePulled": "\u53D8\u57FA\u62C9\u53D6\u5B8C\u6210",
  "header.rebasePullFailed": "\u53D8\u57FA\u62C9\u53D6\u5931\u8D25",
  "header.switchedToBranch": "\u5DF2\u5207\u6362\u81F3\u5206\u652F",
  "header.switchBranchFailed": "\u5207\u6362\u5206\u652F\u5931\u8D25",
  "header.noMatchBranches": "\u672A\u5339\u914D\u5230\u5206\u652F",
  "header.currentHead": "\u5F53\u524D HEAD",
  // ============ 命令面板补充 ============
  "palette.group.git": "Git \u534F\u540C\u64CD\u4F5C",
  "palette.group.settings": "\u7CFB\u7EDF\u8BBE\u7F6E\u4E0E\u4E3B\u9898",
  "palette.group.repos": "\u4ED3\u5E93",
  "palette.switchedToDark": "\u5DF2\u5207\u6362\u4E3A\u6DF1\u8272\u6A21\u5F0F",
  "palette.switchedToLight": "\u5DF2\u5207\u6362\u4E3A\u6D45\u8272\u6A21\u5F0F",
  // ============ 左侧边栏补充 ============
  "sidebar.ctx.checkedOut": "\u5F53\u524D\u5DF2\u68C0\u51FA",
  "sidebar.ctx.checkout": "\u68C0\u51FA\u6B64\u5206\u652F",
  "sidebar.ctx.switchFailed": "\u68C0\u51FA\u5206\u652F\u5931\u8D25",
  "sidebar.ctx.mergeIntoCurrent": "\u5408\u5E76\u5230\u5F53\u524D\u5206\u652F",
  "sidebar.ctx.rebaseCurrentOnto": "\u53D8\u57FA\u5F53\u524D\u5206\u652F\u5230",
  "sidebar.ctx.newBranchFromHere": "\u4ECE\u6B64\u5904\u521B\u5EFA\u65B0\u5206\u652F...",
  "sidebar.ctx.pushToRemote": "\u63A8\u9001\u5230\u8FDC\u7A0B",
  "sidebar.ctx.pushingBranch": "\u6B63\u5728\u63A8\u9001\u5206\u652F",
  "sidebar.ctx.pushBranchDone": "\u63A8\u9001\u6210\u529F",
  "sidebar.ctx.pushBranchFailed": "\u63A8\u9001\u5931\u8D25",
  "sidebar.ctx.copyBranchName": "\u590D\u5236\u5206\u652F\u540D\u79F0",
  "sidebar.ctx.branchCopied": "\u5DF2\u590D\u5236\u5206\u652F\u540D\u79F0\u5230\u526A\u8D34\u677F",
  "sidebar.ctx.cannotDeleteCurrent": "\u65E0\u6CD5\u5220\u9664\u5F53\u524D\u68C0\u51FA\u7684\u5206\u652F",
  "sidebar.ctx.deleteBranch": "\u5220\u9664\u5206\u652F",
  "sidebar.ctx.deleteBranchConfirm": "\u786E\u8BA4\u8981\u5220\u9664\u672C\u5730\u5206\u652F",
  "sidebar.ctx.branchDeleted": "\u5DF2\u5220\u9664\u5206\u652F",
  "sidebar.ctx.deleteBranchFailed": "\u5220\u9664\u5206\u652F\u5931\u8D25",
  "sidebar.ctx.checkoutTrackLocal": "\u68C0\u51FA\u5E76\u8FFD\u8E2A\u5230\u672C\u5730",
  "sidebar.ctx.remoteCheckedOut": "\u5DF2\u68C0\u51FA\u8FDC\u7A0B\u8FFD\u8E2A\u5206\u652F",
  "sidebar.ctx.remoteCheckedOutTracked": "\u5DF2\u68C0\u51FA\u5E76\u8FFD\u8E2A\u8FDC\u7A0B\u5206\u652F",
  "sidebar.ctx.remoteCheckoutFailed": "\u68C0\u51FA\u8FDC\u7A0B\u5206\u652F\u5931\u8D25",
  "sidebar.ctx.rebaseCurrentOntoRemote": "\u53D8\u57FA\u5F53\u524D\u5206\u652F\u5230\u6B64\u8FDC\u7A0B\u5206\u652F...",
  "sidebar.ctx.copyRemoteBranchName": "\u590D\u5236\u8FDC\u7A0B\u5206\u652F\u540D\u79F0",
  "sidebar.ctx.locatedCommit": "\u5DF2\u5B9A\u4F4D\u5206\u652F\u63D0\u4EA4",
  "sidebar.ctx.locatedRemoteCommit": "\u5DF2\u5B9A\u4F4D\u8FDC\u7A0B\u5206\u652F\u63D0\u4EA4",
  "sidebar.ctx.checkoutToLocal": "\u68C0\u51FA\u5230\u672C\u5730",
  "sidebar.ctx.noRemoteTracking": "\u6682\u65E0\u8FDC\u7A0B\u8DDF\u8E2A\u5206\u652F",
  "sidebar.ctx.checkoutTag": "\u68C0\u51FA\u6B64\u6807\u7B7E",
  "sidebar.ctx.tagCheckedOut": "\u5DF2\u68C0\u51FA\u81F3\u6807\u7B7E",
  "sidebar.ctx.tagCheckoutFailed": "\u68C0\u51FA\u6807\u7B7E\u5931\u8D25",
  "sidebar.ctx.newBranchFromTag": "\u4ECE\u6807\u7B7E\u521B\u5EFA\u65B0\u5206\u652F...",
  "sidebar.ctx.pushTag": "\u63A8\u9001\u6B64\u6807\u7B7E\u5230\u8FDC\u7A0B...",
  "sidebar.ctx.tagPushed": "\u5DF2\u63A8\u9001\u6807\u7B7E\u5230\u8FDC\u7A0B",
  "sidebar.ctx.tagPushFailed": "\u63A8\u9001\u6807\u7B7E\u5931\u8D25",
  "sidebar.ctx.copyTagName": "\u590D\u5236\u6807\u7B7E\u540D\u79F0",
  "sidebar.ctx.tagNameCopied": "\u5DF2\u590D\u5236\u6807\u7B7E\u540D\u79F0",
  "sidebar.ctx.deleteLocalTag": "\u5220\u9664\u672C\u5730\u6807\u7B7E",
  "sidebar.ctx.deleteTagConfirm": "\u786E\u8BA4\u8981\u5220\u9664\u6807\u7B7E",
  "sidebar.ctx.tagDeleted": "\u5DF2\u5220\u9664\u6807\u7B7E",
  "sidebar.ctx.deleteTagFailed": "\u5220\u9664\u6807\u7B7E\u5931\u8D25",
  "sidebar.ctx.deleteRemoteTag": "\u5220\u9664\u8FDC\u7A0B\u6807\u7B7E",
  "sidebar.ctx.deleteRemoteTagConfirm": "\u786E\u8BA4\u8981\u4ECE\u8FDC\u7A0B\u4ED3\u5E93\u5220\u9664\u6807\u7B7E",
  "sidebar.ctx.deleteRemoteTagConfirmSuffix": "\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u9006\uFF01",
  "sidebar.ctx.remoteTagDeleted": "\u5DF2\u5220\u9664\u8FDC\u7A0B\u6807\u7B7E",
  "sidebar.ctx.deleteRemoteTagFailed": "\u5220\u9664\u8FDC\u7A0B\u6807\u7B7E\u5931\u8D25",
  "sidebar.ctx.applyStash": "\u5E94\u7528\u8D2E\u85CF (Apply Stash)",
  "sidebar.ctx.stashApplied": "\u5DF2\u5E94\u7528\u8D2E\u85CF\u4FEE\u6539",
  "sidebar.ctx.stashApplyFailed": "\u5E94\u7528\u8D2E\u85CF\u5931\u8D25",
  "sidebar.ctx.popStash": "\u5F39\u51FA\u5E76\u79FB\u9664\u8D2E\u85CF (Pop Stash)",
  "sidebar.ctx.stashPopped": "\u5DF2\u5E94\u7528\u5E76\u5F39\u51FA\u8D2E\u85CF",
  "sidebar.ctx.dropStash": "\u5220\u9664\u6B64\u8D2E\u85CF (Drop Stash)",
  "sidebar.ctx.dropStashConfirm": "\u786E\u8BA4\u6E05\u9664\u6B64\u8D2E\u85CF",
  "sidebar.ctx.stashDropped": "\u5DF2\u6E05\u9664\u8BE5\u8D2E\u85CF",
  "sidebar.ctx.dropFailed": "Drop \u5931\u8D25",
  "sidebar.tagCreated": "\u65B0 Tag \u521B\u5EFA\u6210\u529F",
  "sidebar.tagCreateFailed": "\u521B\u5EFA Tag \u5931\u8D25",
  "sidebar.tagDeleted": "\u5DF2\u5220\u9664 Tag",
  "sidebar.tagDeleteFailed": "\u5220\u9664 Tag \u5931\u8D25",
  "sidebar.aiAssistant": "\u5FEB\u901F\u8FDB\u5165\u63D0\u4EA4\u8BF4\u660E\u548C\u4ED3\u5E93\u8BCA\u65AD\u3002\u63D0\u4EA4\u8BF4\u660E\u652F\u6301\u672C\u5730\u89C4\u5219\u6216\u5DF2\u914D\u7F6E\u7684\u5927\u6A21\u578B\u3002",
  "sidebar.quickActions": "\u5FEB\u6377\u6307\u4EE4",
  "sidebar.switchedToChanges": "\u5DF2\u5207\u6362\u5230\u5DE5\u4F5C\u533A\u53D8\u66F4\u9762\u677F\uFF0C\u53EF\u4F7F\u7528 AI \u751F\u6210\u63D0\u4EA4\u8BF4\u660E",
  "sidebar.healthDiagnose": "\u4ED3\u5E93\u5065\u5EB7\u5EA6\u8BCA\u65AD",
  "sidebar.mergeBranchTitle": "\u5408\u5E76\u5206\u652F (Merge Branch)",
  "sidebar.rebaseBranchTitle": "\u5206\u652F\u53D8\u57FA (Rebase Branch)",
  "sidebar.newBranchTitle": "\u521B\u5EFA\u65B0\u5206\u652F (New Branch)",
  "sidebar.mergeXToCurrent": "\u5408\u5E76\u5230\u5F53\u524D\u5206\u652F",
  "sidebar.rebaseOnto": "\u53D8\u57FA\u5F53\u524D\u5206\u652F\u5230",
  "sidebar.viewRemoteBranch": "\u67E5\u770B\u6B64\u8FDC\u7A0B\u5206\u652F",
  "sidebar.viewTag": "Tag",
  "sidebar.rightClickForActions": "\u53F3\u952E\u67E5\u770B\u64CD\u4F5C",
  "sidebar.viewAllPrs": "\u5728 GitHub \u67E5\u770B\u5168\u90E8 PR",
  "sidebar.noOpenPrs": "\u6682\u65E0\u5F00\u542F\u7684 Pull Requests",
  "sidebar.pushingAllTags": "\u6B63\u5728\u63A8\u9001\u6240\u6709\u6807\u7B7E\u5230\u8FDC\u7A0B...",
  "sidebar.pushedAllTags": "\u5DF2\u6210\u529F\u63A8\u9001\u5168\u90E8 Tags \u5230\u8FDC\u7A0B",
  "sidebar.pushAllTagsFailed": "\u63A8\u9001\u6240\u6709 Tags \u5931\u8D25",
  "sidebar.tagNamePlaceholder": "\u6807\u7B7E\u540D (\u5982 v1.0.0)",
  "sidebar.tagAnnotationPlaceholder": "\u9644\u6CE8\u4FE1\u606F (\u53EF\u9009)",
  "sidebar.createTag": "\u521B\u5EFA Tag",
  "sidebar.deleteTagTitle": "\u5220\u9664\u6B64 Tag",
  "sidebar.noTags": "\u6682\u65E0 Tags",
  "sidebar.stashedToast": "\u5DF2\u5C06\u5F53\u524D\u4FEE\u6539\u6682\u5B58\u81F3 Stash",
  "sidebar.stashNotePlaceholder": "\u8D2E\u85CF\u5907\u6CE8\u4FE1\u606F (\u53EF\u9009)",
  "sidebar.doStash": "\u6267\u884C Stash",
  "sidebar.rightClickMore": "\u53F3\u952E\u67E5\u770B\u66F4\u591A\u64CD\u4F5C",
  "sidebar.popHere": "\u5F39\u51FA\u5E76\u5E94\u7528 (Pop)",
  "sidebar.popApplied": "\u5DF2\u5F39\u51FA\u8D2E\u85CF\u5E76\u5E94\u7528\u5230\u5DE5\u4F5C\u533A",
  "sidebar.popFailed": "Pop \u5931\u8D25",
  "sidebar.dropTitle": "\u5220\u9664\u6B64\u8D2E\u85CF (Drop)",
  "sidebar.noStashes": "\u6682\u65E0\u8D2E\u85CF\u5185\u5BB9",
  "sidebar.currentBranch": "\u5F53\u524D\u5206\u652F",
  "diff.unified": "\u7EDF\u4E00\u89C6\u56FE",
  "diff.split": "\u5206\u680F\u89C6\u56FE",
  "sidebar.mode.list": "\u5206\u652F",
  "sidebar.mode.agents": "\u4ED3\u5E93\u5DE5\u5177",
  "header.fetchQuietDone": "\u8FDC\u7A0B\u66F4\u65B0\u83B7\u53D6\u5B8C\u6210",
  "header.fetchQuietDesc": "\u672C\u5730\u5F15\u7528\u4E0E Ahead/Behind \u72B6\u6001\u5DF2\u5237\u65B0",
  "header.undone": "\u5DF2\u64A4\u9500\u4E0A\u4E00\u6B21\u63D0\u4EA4",
  "header.undoneDesc": "\u6539\u52A8\u5DF2\u5B89\u5168\u653E\u56DE\u5DE5\u4F5C\u533A/\u6682\u5B58\u533A",
  "header.openCloneTooltip": "\u6253\u5F00\u6216\u514B\u9686\u672C\u5730\u4EE3\u7801\u4ED3\u5E93 (Ctrl+O)",
  "header.toggleThemeTooltip": "\u5207\u6362\u8272\u5F69\u6A21\u5F0F",
  "header.openSettingsTooltip": "\u6253\u5F00\u8BBE\u7F6E",
  "header.actionsDashboardTooltip": "GitHub Actions CI \u4EEA\u8868\u76D8",
  "header.searchTooltip": "\u5168\u5C40\u547D\u4EE4\u641C\u7D22 (Ctrl+K)",
  "common.none": "\u65E0",
  "header.localBranches": "\u672C\u5730\u5206\u652F",
  "header.createBranchShort": "\u521B\u5EFA\u65B0\u5206\u652F...",
  "palette.prCenter": "GitHub Pull Requests \u5BA1\u67E5\u4E2D\u5FC3",
  "palette.actionsDash": "GitHub Actions \u5F00\u53D1\u8005\u4EEA\u8868\u76D8",
  "palette.gitFetch": "\u83B7\u53D6\u8FDC\u7A0B\u6700\u65B0\u53D8\u66F4 (Git Fetch)",
  "palette.gitPull": "\u62C9\u53D6\u8FDC\u7A0B\u5206\u652F (Git Pull)",
  "palette.gitPush": "\u63A8\u9001\u672C\u5730\u63D0\u4EA4 (Git Push)",
  "palette.group.branches": "\u5207\u6362\u672C\u5730/\u8FDC\u7A0B\u5206\u652F",
  "palette.group.tags": "\u67E5\u770B\u6807\u7B7E (Tags)",
  "sidebar.popFailedAlt": "\u5F39\u51FA\u8D2E\u85CF\u5931\u8D25",
  "sidebar.clean": "\u5E72\u51C0",
  "sidebar.aiCommitTitle": "\u64B0\u5199\u63D0\u4EA4\u8BF4\u660E",
  "sidebar.aiCommitDesc": "\u6253\u5F00\u5DE5\u4F5C\u533A\uFF0C\u68C0\u67E5\u63D0\u4EA4\u8303\u56F4\u5E76\u751F\u6210\u8BF4\u660E",
  "sidebar.healthDiagnoseDesc": "\u68C0\u6D4B\u672A\u63A8\u9001\u5206\u652F\u4E0E\u6F5C\u5728\u51B2\u7A81",
  "sidebar.viewRemoteHint": "\u652F\u6301\u62D6\u62FD\u5230\u5176\u5B83\u5206\u652F\u5408\u5E76/\u53D8\u57FA\uFF0C\u53F3\u952E\u67E5\u770B\u64CD\u4F5C",
  "palette.darkMode": "\u5207\u6362\u4E3A\u6DF1\u8272\u6A21\u5F0F (Dark Mode)",
  "palette.lightMode": "\u5207\u6362\u4E3A\u6D45\u8272\u6A21\u5F0F (Light Mode)",
  "palette.systemMode": "\u8DDF\u968F\u7CFB\u7EDF\u5916\u89C2 (System Mode)",
  "palette.systemModeRestored": "\u5DF2\u6062\u590D\u4E3A\u8DDF\u968F\u7CFB\u7EDF\u5916\u89C2",
  "palette.connectGithub": "\u8FDE\u63A5 / \u914D\u7F6E GitHub \u8D26\u53F7\u4E0E Token...",
  "palette.openPreferences": "\u6253\u5F00\u9996\u9009\u9879\u8BBE\u7F6E (Preferences)",
  "sidebar.newTagTitle": "\u65B0\u5EFA Tag (\u5982 v1.0.0)",
  "sidebar.stashWorkingChanges": "\u8D2E\u85CF\u5F53\u524D\u5DE5\u4F5C\u533A\u4FEE\u6539",
  // ============ 提交历史 ============
  "history.title": "\u63D0\u4EA4\u5386\u53F2\u4E0E Git Graph",
  "history.uncommitted": "\u672A\u63D0\u4EA4\u4FEE\u6539",
  "history.searchPlaceholder": "\u641C\u7D22\u4E3B\u9898\u3001\u4F5C\u8005\u6216 Hash...",
  "history.noMatch": "\u672A\u627E\u5230\u7B26\u5408\u6761\u4EF6\u7684\u63D0\u4EA4\u8BB0\u5F55",
  "history.wipToast": "\u5DF2\u5FEB\u901F\u8DF3\u8F6C\u81F3\u5DE5\u4F5C\u533A\u672A\u63D0\u4EA4\u53D8\u66F4 (WIP)",
  "history.wipTitle": "\u70B9\u51FB\u67E5\u770B\u5E76\u63D0\u4EA4\u5DE5\u4F5C\u533A\u53D8\u52A8",
  "history.wipLabel": "\u5DE5\u4F5C\u533A\u672A\u63D0\u4EA4\u4EE3\u7801\u4FEE\u6539 (\u70B9\u51FB\u8FDB\u5165\u68C0\u67E5)",
  "history.copyHashTitle": "\u70B9\u51FB\u590D\u5236 Hash",
  "history.copyHash": "\u5DF2\u590D\u5236 Commit Hash",
  // ============ 健康诊断 ============
  "diag.failed": "Git \u4ED3\u5E93\u5065\u5EB7\u5EA6\u8BCA\u65AD\u5931\u8D25",
  "diag.failedDesc": "\u65E0\u6CD5\u5B8C\u6210\u5065\u5EB7\u5EA6\u8BCA\u65AD\uFF0C\u8BF7\u68C0\u67E5\u672C\u5730 Git \u72B6\u6001",
  "diag.title": "Git \u4ED3\u5E93\u5168\u9879\u5065\u5EB7\u5EA6\u8BCA\u65AD",
  "diag.realtime": "\u5B9E\u65F6\u5206\u6790",
  "diag.noRepo": "\u672A\u6253\u5F00\u4ED3\u5E93",
  "diag.running": "\u6B63\u5728\u6267\u884C\u5168\u9762\u5065\u5EB7\u4F53\u68C0\uFF0C\u5206\u6790\u672A\u51B3\u51B2\u7A81\u4E0E\u5206\u652F\u540C\u6B65\u72B6\u6001...",
  "diag.runFailed": "\u8BCA\u65AD\u6267\u884C\u5931\u8D25",
  "diag.overall": "\u603B\u4F53\u5065\u5EB7\u8BC4\u7EA7",
  "diag.healthy": "\u5065\u5EB7\u826F\u597D",
  "diag.warning": "\u5B58\u5728\u9690\u60A3",
  "diag.danger": "\u9AD8\u5371\u963B\u585E",
  "diag.score": "\u5065\u5EB7\u5EA6\u5F97\u5206",
  "diag.items": "\u68C0\u6D4B\u9879\u76EE\u660E\u7EC6",
  "diag.rescan": "\u91CD\u65B0\u626B\u63CF",
  "common.ok": "\u786E\u5B9A",
  // ============ 冲突横幅 ============
  "banner.rebaseTitle": "\u53D8\u57FA\u8FDB\u884C\u4E2D (Rebase)",
  "banner.mergeTitle": "\u5206\u652F\u5408\u5E76\u4E2D (Merge)",
  "banner.aborted": "\u5DF2\u4E2D\u6B62\u53D8\u57FA",
  "banner.mergeAborted": "\u5DF2\u4E2D\u6B62\u5408\u5E76",
  "banner.abortedDesc": "\u5DE5\u4F5C\u533A\u5DF2\u8FD8\u539F\u81F3\u64CD\u4F5C\u524D\u72B6\u6001",
  "banner.abortFailed": "\u4E2D\u6B62\u64CD\u4F5C\u5931\u8D25",
  "banner.rebaseDone": "\u53D8\u57FA\u5DF2\u6210\u529F\u5B8C\u6210\uFF01",
  "banner.mergeDone": "\u5408\u5E76\u63D0\u4EA4\u5DF2\u6210\u529F\u521B\u5EFA\uFF01",
  "banner.completeFailed": "\u5B8C\u6210\u64CD\u4F5C\u5931\u8D25",
  "banner.statusTitle": "\u51B2\u7A81\u5904\u7406\u72B6\u6001",
  "banner.allResolved": "\u6240\u6709\u51B2\u7A81\u5DF2\u6807\u8BB0\u89E3\u51B3",
  "banner.pending": "\u5F85\u89E3\u51B3\u51B2\u7A81",
  "banner.filesUnit": "\u4E2A\u6587\u4EF6",
  "banner.allResolvedDesc": "\u6240\u6709\u51B2\u7A81\u4EE3\u7801\u5747\u5DF2\u6807\u8BB0\u89E3\u51B3\u5E76\u6682\u5B58\uFF0C\u70B9\u51FB\u53F3\u4FA7\u5B8C\u6210\u6536\u5C3E\u63D0\u4EA4\u3002",
  "banner.resolveHintPrefix": "\u8BF7\u5728\u53D8\u66F4\u5217\u8868\u4E2D\u89E3\u51B3",
  "banner.resolveHintSuffix": "\uFF0C\u6682\u5B58\u540E\u5373\u53EF\u7EE7\u7EED\u3002",
  "banner.andMore": "\u7B49\u5171",
  "banner.confirmAbort": "\u786E\u8BA4\u4E2D\u6B62\uFF1F",
  "banner.confirm": "\u786E\u8BA4",
  "banner.cancel": "\u53D6\u6D88",
  "banner.abortRebaseRestore": "\u4E2D\u6B62\u53D8\u57FA\u5E76\u6062\u590D\u73B0\u573A",
  "banner.abortMergeRestore": "\u4E2D\u6B62\u5408\u5E76\u5E76\u6062\u590D\u73B0\u573A",
  "banner.abortRebase": "\u4E2D\u6B62\u53D8\u57FA",
  "banner.abortMerge": "\u4E2D\u6B62\u5408\u5E76",
  "banner.continueRebase": "\u7EE7\u7EED\u53D8\u57FA\u4E0B\u4E00\u63D0\u4EA4",
  "banner.commitMerge": "\u63D0\u4EA4\u5408\u5E76\u4EE3\u7801",
  "banner.needStageFirst": "\u9700\u5148\u6682\u5B58\u6240\u6709\u89E3\u51B3\u540E\u7684\u51B2\u7A81\u6587\u4EF6",
  "banner.continueBtn": "\u7EE7\u7EED\u53D8\u57FA (--continue)",
  "banner.finishMergeBtn": "\u5B8C\u6210\u63D0\u4EA4\u5408\u5E76",
  // ============ 合并分支弹窗 ============
  "merge.success": "\u5206\u652F\u5408\u5E76\u5B8C\u6210",
  "merge.successDesc": "\u5DF2\u6210\u529F\u5C06 {src} \u5408\u5E76\u5165 {dst}",
  "merge.failed": "\u5408\u5E76\u5931\u8D25",
  "merge.conflict": "\u5408\u5E76\u9047\u5230\u51B2\u7A81 (Conflict)",
  "merge.conflictDesc": "\u5DE5\u4F5C\u533A\u5B58\u5728\u4EE3\u7801\u51B2\u7A81\uFF0C\u8BF7\u5728\u5DE5\u4F5C\u533A\u4E2D\u68C0\u67E5\u5E76\u89E3\u51B3\u51B2\u7A81",
  "merge.title": "\u5408\u5E76\u5206\u652F",
  "merge.desc": "\u5C06\u9009\u5B9A\u5206\u652F\u7684\u4EE3\u7801\u6539\u52A8\u5408\u5E76\u5230\u5F53\u524D\u5206\u652F",
  "merge.sourceLabel": "\u6765\u6E90\u5206\u652F (\u5C06\u88AB\u5408\u5E76)",
  "merge.none": "\u672A\u9009\u62E9",
  "merge.targetLabel": "\u76EE\u6807\u5F53\u524D\u5206\u652F (HEAD)",
  "merge.pickSource": "\u9009\u62E9\u8981\u5408\u5E76\u5165\u5F53\u524D\u5206\u652F\u7684\u6765\u6E90\u5206\u652F",
  "merge.noBranches": "\u6682\u65E0\u5176\u4ED6\u53EF\u9009\u5206\u652F",
  "merge.remoteSuffix": "(\u8FDC\u7A0B)",
  "merge.noFf": "\u59CB\u7EC8\u521B\u5EFA\u5408\u5E76\u63D0\u4EA4 (--no-ff)",
  "merge.customMsg": "\u81EA\u5B9A\u4E49\u5408\u5E76\u63D0\u4EA4\u8BF4\u660E (\u53EF\u9009)",
  "common.cancel": "\u53D6\u6D88",
  "merge.run": "\u6267\u884C\u5408\u5E76",
  // ============ 新建分支弹窗 ============
  "create.nameEmpty": "\u5206\u652F\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A",
  "create.nameNoSpace": "\u5206\u652F\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u7A7A\u683C",
  "create.success": "\u65B0\u5206\u652F {name} \u521B\u5EFA\u6210\u529F\uFF01",
  "create.switched": "\u5DF2\u81EA\u52A8\u5207\u6362\u81F3\u65B0\u5206\u652F",
  "create.stayed": "\u7559\u5728\u5F53\u524D\u5206\u652F",
  "create.failed": "\u521B\u5EFA\u5206\u652F\u5931\u8D25",
  "create.title": "\u65B0\u5EFA Git \u5206\u652F",
  "create.descPrefix": "\u5728\u4ED3\u5E93 {repo} \u4E2D\u521B\u5EFA\u65B0\u5206\u652F",
  "create.nameLabel": "\u65B0\u5206\u652F\u540D\u79F0 (Branch Name)",
  "create.baseLabel": "\u57FA\u4E8E\u57FA\u5E95 (Base Source)",
  "create.base.current": "\u5F53\u524D\u5206\u652F HEAD",
  "create.base.branch": "\u5176\u4ED6\u5206\u652F",
  "create.base.commit": "\u7279\u5B9A Commit",
  "create.fromCurrentPrefix": "\u5C06\u4ECE\u5F53\u524D\u6240\u5728\u5206\u652F",
  "create.fromCurrentSuffix": "\u7684\u6700\u65B0\u63D0\u4EA4\u68C0\u51FA\u3002",
  "create.currentSuffix": "(\u5F53\u524D)",
  "create.checkoutAfter": "\u521B\u5EFA\u540E\u7ACB\u5373\u5207\u6362\u81F3\u65B0\u5206\u652F (Checkout branch)",
  "create.run": "\u521B\u5EFA\u5206\u652F",
  // ============ 变基弹窗 ============
  "rebase.success": "\u53D8\u57FA\u5B8C\u6210",
  "rebase.successDesc": "\u5DF2\u6210\u529F\u5C06 {cur} \u53D8\u57FA\u5230 {onto}",
  "rebase.failed": "\u53D8\u57FA\u5931\u8D25",
  "rebase.conflict": "\u53D8\u57FA\u9047\u5230\u51B2\u7A81 (Conflict)",
  "rebase.conflictDesc": "\u8BF7\u5148\u5728\u5DE5\u4F5C\u533A\u89E3\u51B3\u51B2\u7A81\u6587\u4EF6\uFF0C\u7136\u540E\u70B9\u51FB\u201C\u7EE7\u7EED\u53D8\u57FA\u201D",
  "rebase.continueDone": "\u53D8\u57FA\u7EE7\u7EED\u5B8C\u6210\uFF01",
  "rebase.continueFailed": "\u7EE7\u7EED\u53D8\u57FA\u5931\u8D25",
  "rebase.aborted": "\u5DF2\u4E2D\u6B62\u53D8\u57FA",
  "rebase.abortedDesc": "\u5DE5\u4F5C\u533A\u5DF2\u8FD8\u539F\u81F3\u53D8\u57FA\u524D\u72B6\u6001",
  "rebase.abortFailed": "\u4E2D\u6B62\u53D8\u57FA\u5931\u8D25",
  "rebase.title": "\u5206\u652F\u53D8\u57FA",
  "rebase.desc": "\u5C06\u5F53\u524D\u5206\u652F\u7684\u63D0\u4EA4\u91CD\u65B0\u57FA\u5E95\u5230\u76EE\u6807\u5206\u652F\u4E4B\u4E0A",
  "rebase.warn": "\u53D8\u57FA (Rebase) \u4F1A\u91CD\u65B0\u7F16\u5199\u5F53\u524D\u5206\u652F\u7684 Commit \u63D0\u4EA4\u5386\u53F2\u3002\u8BF7\u786E\u4FDD\u60A8\u4EC5\u5BF9\u672C\u5730\u672A\u516C\u5F00\u6216\u7279\u6027\u5206\u652F\u8FDB\u884C\u6B64\u64CD\u4F5C\uFF0C\u907F\u514D\u5BF9\u5171\u4EAB\u4E3B\u5E72\u5206\u652F\u6267\u884C\u53D8\u57FA\u3002",
  "rebase.conflictState": "\u5F53\u524D\u53D8\u57FA\u5904\u4E8E\u51B2\u7A81\u72B6\u6001\uFF0C\u8BF7\u9009\u62E9\u64CD\u4F5C\uFF1A",
  "rebase.abort": "\u4E2D\u6B62\u53D8\u57FA (--abort)",
  "rebase.continue": "\u5DF2\u89E3\u51B3\u51B2\u7A81\uFF0C\u7EE7\u7EED (--continue)",
  "rebase.currentLabel": "\u5F53\u524D\u5206\u652F (\u91CD\u57FA\u5E95)",
  "rebase.ontoLabel": "\u76EE\u6807\u57FA\u5E95\u5206\u652F (Onto)",
  "rebase.pickUpstream": "\u9009\u62E9\u4F5C\u4E3A\u65B0\u57FA\u5E95\u7684\u76EE\u6807\u5206\u652F (Upstream)",
  "rebase.noBranches": "\u6682\u65E0\u5176\u4ED6\u53EF\u9009\u5206\u652F",
  "rebase.remoteSuffix": "(\u8FDC\u7A0B)",
  "rebase.run": "\u5F00\u59CB\u53D8\u57FA (Rebase)",
  // ============ 拖拽操作弹窗 ============
  "drag.checkingOut": "\u6B63\u5728\u68C0\u51FA\u76EE\u6807\u5206\u652F",
  "drag.merging": "\u6B63\u5728\u5C06 {src} \u5408\u5E76\u5230 {dst}...",
  "drag.mergeDone": "\u5408\u5E76\u6210\u529F\uFF01",
  "drag.rebasing": "\u6B63\u5728\u5C06 {src} \u53D8\u57FA\u5230 {dst}...",
  "drag.rebaseDone": "\u53D8\u57FA\u6210\u529F\uFF01",
  "drag.failedLog": "\u62D6\u62FD\u6267\u884C\u5931\u8D25:",
  "drag.failed": "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u53EF\u80FD\u5B58\u5728\u4EE3\u7801\u51B2\u7A81\uFF0C\u8BF7\u68C0\u67E5\u5DE5\u4F5C\u533A",
  "drag.opIncomplete": "\u64CD\u4F5C\u672A\u5B8C\u6210",
  "drag.title": "\u5206\u652F\u64CD\u4F5C\u9884\u89C8",
  "drag.pickOp": "\u8BF7\u9009\u62E9\u60A8\u5E0C\u671B\u5BF9\u8FD9\u4E24\u4E2A\u5206\u652F\u6267\u884C\u7684 Git \u64CD\u4F5C",
  "drag.source": "\u6E90\u5206\u652F (Source)",
  "drag.target": "\u76EE\u6807\u5206\u652F (Target)",
  "drag.merge": "\u5408\u5E76 (Merge)",
  "drag.recommended": "\u63A8\u8350",
  "drag.mergeDescPrefix": "\u5C06",
  "drag.mergeDescMid": "\u5408\u5E76\u5230",
  "drag.rebaseTarget": "\u53D8\u57FA\u76EE\u6807\u5206\u652F (Rebase Target onto Source)",
  "drag.rebaseDescSuffix": "\u4E4B\u540E",
  "drag.rebaseSource": "\u53D8\u57FA\u6E90\u5206\u652F (Rebase Source onto Target)",
  "drag.confirm": "\u786E\u8BA4\u6267\u884C",
  // ============ PR 视图 ============
  "pr.fetching": "\u6B63\u5728\u4ECE GitHub \u8FDC\u7AEF\u62C9\u53D6 PR #{n} \u63D0\u4EA4\u8BB0\u5F55...",
  "pr.fetched": "PR #{n} \u8FDC\u7A0B\u5206\u652F\u62C9\u53D6\u6210\u529F\uFF01",
  "pr.switchedTo": "\u672C\u5730\u5DE5\u4F5C\u533A\u5206\u652F\u5DF2\u5207\u6362\u81F3",
  "pr.checkoutFailed": "\u68C0\u51FA PR \u5206\u652F\u5931\u8D25",
  "pr.count": "\u4E2A\u8BF7\u6C42",
  "pr.filterOpen": "\u5F00\u542F (Open)",
  "pr.filterClosed": "\u5DF2\u5408\u5E76/\u5173\u95ED (Closed)",
  "pr.filterAll": "\u5168\u90E8 (All)",
  "pr.searchPlaceholder": "\u641C\u7D22\u6807\u9898\u3001\u4F5C\u8005\u6216\u7F16\u53F7...",
  "pr.refreshTitle": "\u5237\u65B0 PR \u5217\u8868",
  "pr.noMatch": "\u672A\u627E\u5230\u7B26\u5408\u6761\u4EF6\u7684 Pull Request",
  "pr.resizeHint": "\u6309\u4F4F\u62D6\u62FD\u8C03\u8282 PR \u5217\u8868\u5BBD\u5EA6\uFF0C\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4",
  "pr.pickToReview": "\u8BF7\u5728\u5DE6\u4FA7\u9009\u62E9\u9700\u8981\u5BA1\u67E5\u7684 Pull Request",
  "pr.mergeInto": "\u5408\u5E76\u81F3",
  "pr.openedBy": "\u7531 @{user} \u63D0\u4EA4",
  "pr.checkoutTitle": "\u5728\u672C\u5730\u521B\u5EFA\u5E76\u68C0\u51FA pr-{n} \u5206\u652F",
  "pr.checkingOut": "\u6B63\u5728\u68C0\u51FA...",
  "pr.checkout": "\u68C0\u51FA PR \u5206\u652F (Checkout)",
  "pr.openInBrowser": "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00 GitHub PR",
  "pr.viewOnWeb": "\u7F51\u9875\u67E5\u770B",
  "pr.reviewStatus": "\u8BC4\u5BA1\u72B6\u6001 (Review)",
  "pr.approved": "\u5DF2\u6279\u51C6 (Approved)",
  "pr.changesRequested": "\u8BF7\u6C42\u4FEE\u6539 (Changes Requested)",
  "pr.commented": "\u5DF2\u6709\u8BC4\u5BA1\u610F\u89C1 (Commented)",
  "pr.pendingReview": "\u5F85\u8BC4\u5BA1 (Pending Review)",
  "pr.checks": "CI / CD \u68C0\u67E5 (Checks)",
  "pr.checksPass": "\u901A\u8FC7",
  "pr.checksFailed": "\u5931\u8D25",
  "pr.noChecks": "\u672A\u914D\u7F6E\u68C0\u67E5\u6216\u6B63\u5728\u68C0\u6D4B",
  "pr.diffStats": "\u4EE3\u7801\u6539\u52A8\u7EDF\u8BA1",
  "pr.filesCount": "\u6587\u4EF6",
  "pr.body": "Pull Request \u8BF4\u660E\u6B63\u6587",
  "pr.noBody": "\u8BE5 Pull Request \u672A\u9644\u5E26\u8BE6\u7EC6\u63CF\u8FF0\u4FE1\u606F\u3002",
  // ============ Actions 仪表盘 ============
  "actions.title": "GitHub Actions \u5F00\u53D1\u8005\u4EEA\u8868\u76D8",
  "actions.connectedAs": "\u5DF2\u8FDE\u63A5",
  "actions.connectReal": "\u8FDE\u63A5\u771F\u5B9E GitHub \u8D26\u53F7",
  "actions.refresh": "\u5237\u65B0",
  "actions.refreshing": "\u5237\u65B0\u4E2D\u2026",
  "actions.workflows": "\u5DE5\u4F5C\u6D41",
  "actions.allWorkflows": "\u5168\u90E8\u5DE5\u4F5C\u6D41 (All)",
  "actions.viewYaml": "\u67E5\u770B YAML \u6E90\u7801",
  "actions.dispatch": "\u624B\u52A8\u8FD0\u884C (Dispatch)",
  "actions.resizeHint": "\u6309\u4F4F\u62D6\u62FD\u8C03\u8282\u5DE5\u4F5C\u6D41\u5217\u8868\u5BBD\u5EA6\uFF0C\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4",
  "actions.runHistory": "\u8FD0\u884C\u5386\u53F2\u8BB0\u5F55 (Workflow Runs)",
  "actions.cancelRun": "\u53D6\u6D88\u8FD0\u884C",
  "actions.cancelRunConfirmTitle": "\u786E\u8BA4\u53D6\u6D88\u6B64\u6B21\u8FD0\u884C\uFF1F",
  "actions.cancelRunConfirmDesc": "\u5C06\u7EC8\u6B62\u8FDB\u884C\u4E2D\u7684 CI \u8FD0\u884C\uFF0C\u5DF2\u5B8C\u6210\u6B65\u9AA4\u4E0D\u4F1A\u56DE\u6EDA\uFF1B\u4E4B\u540E\u53EF\u91CD\u65B0\u8FD0\u884C\u6574\u4E2A\u5DE5\u4F5C\u6D41\u3002",
  "actions.rerunFailed": "\u91CD\u8DD1\u5931\u8D25",
  "actions.rerunAll": "\u91CD\u65B0\u8FD0\u884C\u5168\u90E8",
  "actions.autoTriggered": "\u81EA\u52A8\u89E6\u53D1",
  "actions.jobsTitle": "\u6267\u884C\u9636\u6BB5\u4E0E Jobs",
  "actions.pickRun": "\u9009\u62E9\u8FD0\u884C\u8BB0\u5F55\u4EE5\u67E5\u770B Jobs",
  "actions.building": "\u6B63\u5728\u6784\u5EFA\u4E2D...",
  "actions.passed": "\u5168\u90E8\u6210\u529F (Passed)",
  "actions.failed": "\u6267\u884C\u5931\u8D25 (Failed)",
  "actions.noJobs": "\u6682\u65E0\u9636\u6BB5\u4EFB\u52A1\u8BE6\u60C5",
  "actions.viewLogs": "\u67E5\u770B\u6784\u5EFA\u65E5\u5FD7",
  // ============ 工作流弹窗 ============
  "dispatch.title": "\u624B\u52A8\u89E6\u53D1\u5DE5\u4F5C\u6D41 (Dispatch)",
  "dispatch.useFrom": "\u4F7F\u7528\u6B64\u5206\u652F\u7684\u5DE5\u4F5C\u6D41\u5B9A\u4E49 (Use workflow from)",
  "dispatch.currentHead": "(\u5F53\u524D HEAD)",
  "dispatch.inputs": "\u81EA\u5B9A\u4E49\u6267\u884C\u53C2\u6570 (Inputs - \u53EF\u9009)",
  "dispatch.inputsPlaceholder": "\u4F8B\u5982: release_tag=v1.2.0 \u6216 channel=stable",
  "dispatch.config": "\u5DE5\u4F5C\u6D41\u914D\u7F6E",
  "dispatch.running": "\u6B63\u5728\u63D0\u4EA4\u8C03\u5EA6...",
  "dispatch.run": "\u8FD0\u884C\u5DE5\u4F5C\u6D41 (Run Workflow)",
  "logs.copied": "\u5DF2\u590D\u5236\u5B8C\u6574\u6784\u5EFA\u65E5\u5FD7",
  "logs.toggleFullscreen": "\u5207\u6362\u5168\u5C4F",
  "logs.lines": "\u884C\u65E5\u5FD7",
  "logs.searchPlaceholder": "\u641C\u7D22\u65E5\u5FD7...",
  "logs.scrollToBottom": "\u81EA\u52A8\u6EDA\u52A8\u5230\u5E95\u90E8",
  "logs.scroll": "\u6EDA\u52A8",
  "logs.copyAll": "\u590D\u5236\u5168\u90E8\u65E5\u5FD7",
  "logs.copy": "\u590D\u5236",
  "logs.loading": "\u6B63\u5728\u83B7\u53D6\u65E5\u5FD7\u2026",
  "logs.waitingBadge": "\u5C1A\u672A\u5C31\u7EEA",
  "logs.failed": "\u65E5\u5FD7\u83B7\u53D6\u5931\u8D25",
  "logs.waiting": "\u4EFB\u52A1\u4ECD\u5728\u8FD0\u884C\u6216\u6392\u961F\uFF0C\u5B8C\u6574\u65E5\u5FD7\u5C1A\u672A\u5C31\u7EEA\u3002",
  "logs.waitingHint": "\u6BCF 15 \u79D2\u68C0\u67E5\u4E00\u6B21\u4EFB\u52A1\u72B6\u6001\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u83B7\u53D6\u5B8C\u6574\u65E5\u5FD7\u3002\u5B9E\u65F6\u65E5\u5FD7\u8BF7\u5728 GitHub \u67E5\u770B\u3002",
  "logs.empty": "GitHub \u8FD4\u56DE\u4E86\u7A7A\u65E5\u5FD7\u3002\u53EF\u7A0D\u540E\u91CD\u8BD5\u6216\u5728 GitHub \u67E5\u770B\u3002",
  "logs.openGitHub": "\u5728 GitHub \u67E5\u770B\u5B9E\u65F6\u65E5\u5FD7",
  "logs.retry": "\u91CD\u65B0\u83B7\u53D6",
  "logs.openFailed": "\u65E0\u6CD5\u6253\u5F00 GitHub \u65E5\u5FD7\u9875\u9762",
  "logs.noMatch": "\u672A\u627E\u5230\u5339\u914D\u7684\u65E5\u5FD7\u5185\u5BB9",
  "yaml.copied": "\u5DF2\u590D\u5236\u5DE5\u4F5C\u6D41 YAML \u5185\u5BB9",
  "yaml.copy": "\u590D\u5236\u4EE3\u7801",
  // ============ 冲突解决工作台 ============
  "resolver.loadFailed": "\u52A0\u8F7D\u51B2\u7A81\u6587\u4EF6\u5931\u8D25",
  "resolver.allResolvedToast": "\u6240\u6709\u51B2\u7A81\u5DF2\u89E3\u51B3\uFF01",
  "resolver.allResolvedDesc": "\u8BF7\u70B9\u51FB\u53F3\u4E0A\u89D2\u201C\u4FDD\u5B58\u5E76\u6807\u8BB0\u5DF2\u89E3\u51B3\u201D\u6682\u5B58\u6B64\u6587\u4EF6\u3002",
  "resolver.allOurs": "\u5DF2\u5168\u90E8\u91C7\u7528\u5F53\u524D\u66F4\u6539 (HEAD)",
  "resolver.allTheirs": "\u5DF2\u5168\u90E8\u91C7\u7528\u4F20\u5165\u66F4\u6539",
  "resolver.allBoth": "\u5DF2\u5168\u90E8\u4FDD\u7559\u53CC\u65B9\u66F4\u6539",
  "resolver.stageHint": "\u8BF7\u70B9\u51FB\u201C\u4FDD\u5B58\u5E76\u6807\u8BB0\u5DF2\u89E3\u51B3\u201D\u5B8C\u6210\u6682\u5B58\u3002",
  "resolver.oursResolved": "\u5DF2\u91C7\u7528\u5F53\u524D\u7248\u672C\u5E76\u6807\u8BB0\u5DF2\u89E3\u51B3",
  "resolver.theirsResolved": "\u5DF2\u91C7\u7528\u4F20\u5165\u7248\u672C\u5E76\u6807\u8BB0\u5DF2\u89E3\u51B3",
  "resolver.opFailed": "\u64CD\u4F5C\u5931\u8D25",
  "resolver.markersResetToast": "\u5DF2\u91CD\u7F6E\u56DE\u521D\u59CB\u51B2\u7A81\u6807\u8BB0",
  "resolver.resetFailed": "\u91CD\u7F6E\u5931\u8D25",
  "resolver.savedStaged": "\u51B2\u7A81\u89E3\u51B3\u6210\u529F\u5DF2\u6682\u5B58\uFF01",
  "resolver.saveFailed": "\u4FDD\u5B58\u5931\u8D25",
  "resolver.analyzing": "\u6B63\u5728\u5206\u6790\u51B2\u7A81\u4EE3\u7801\u4E0E\u6807\u8BB0...",
  "resolver.remaining": "\u5269\u4F59 {n} \u5904\u51B2\u7A81",
  "resolver.allDone": "\u2713 \u51B2\u7A81\u5DF2\u5168\u90E8\u89E3\u51B3",
  "resolver.prevConflict": "\u4E0A\u4E00\u5904\u51B2\u7A81",
  "resolver.nextConflict": "\u4E0B\u4E00\u5904\u51B2\u7A81",
  "resolver.takeAllOursTitle": "\u6240\u6709\u51B2\u7A81\u5757\u7EDF\u4E00\u91C7\u7528\u672C\u5730\u4FEE\u6539",
  "resolver.takeAllOurs": "\u5168\u90E8\u91C7\u7528\u5F53\u524D",
  "resolver.takeAllTheirsTitle": "\u6240\u6709\u51B2\u7A81\u5757\u7EDF\u4E00\u91C7\u7528\u4F20\u5165\u5206\u652F\u4FEE\u6539",
  "resolver.takeAllTheirs": "\u5168\u90E8\u91C7\u7528\u4F20\u5165",
  "resolver.oursFileTitle": "\u76F4\u63A5\u5C06\u5F53\u524D\u5206\u652F\u6574\u4E2A\u6587\u4EF6\u4F5C\u4E3A\u89E3\u51B3\u7ED3\u679C",
  "resolver.oursFile": "\u6574\u6587\u4EF6\u7528\u5F53\u524D",
  "resolver.theirsFileTitle": "\u76F4\u63A5\u5C06\u4F20\u5165\u5206\u652F\u6574\u4E2A\u6587\u4EF6\u4F5C\u4E3A\u89E3\u51B3\u7ED3\u679C",
  "resolver.theirsFile": "\u6574\u6587\u4EF6\u7528\u4F20\u5165",
  "resolver.resetTitle": "\u8FD8\u539F\u4E3A\u539F\u59CB\u51B2\u7A81\u6807\u8BB0",
  "resolver.resetMarkers": "\u91CD\u7F6E\u6807\u8BB0",
  "resolver.saveStageTitle": "\u5C06\u89E3\u51B3\u540E\u7684\u6587\u4EF6\u5199\u5165\u5E76\u6267\u884C git add",
  "resolver.saveStage": "\u4FDD\u5B58\u5E76\u6682\u5B58",
  "resolver.fullyResolved": "\u5DF2\u5B8C\u5168\u89E3\u51B3\uFF0C\u6682\u5B58",
  "resolver.closeTitle": "\u5173\u95ED\u51B2\u7A81\u89E3\u51B3\u5668\u5E76\u8FD4\u56DE Diff \u89C6\u56FE",
  "resolver.successTitle": "\u6240\u6709\u51B2\u7A81\u6807\u8BB0\u5DF2\u6210\u529F\u6D88\u9664\uFF01",
  "resolver.successDesc": "\u5DF2\u6309\u6240\u9009\u51B3\u7B56\u5408\u6210\u4E86\u6700\u7EC8\u6587\u4EF6\uFF0C\u8BF7\u70B9\u51FB\u53F3\u4E0A\u89D2\u3010\u4FDD\u5B58\u5E76\u6682\u5B58\u3011\u5199\u5165\u78C1\u76D8\u5E76\u6807\u8BB0\u5DF2\u89E3\u51B3\u3002",
  "resolver.stageNow": "\u7ACB\u5373\u5B8C\u6210\u6682\u5B58",
  "resolver.conflictNo": "\u51B2\u7A81 #{n}",
  "resolver.lines": "\u7B2C {a} - {b} \u884C",
  "resolver.keepOursTitle": "\u4FDD\u7559\u5F53\u524D\u5206\u652F\u4EE3\u7801",
  "resolver.takeOurs": "\u91C7\u7528\u5F53\u524D (Ours)",
  "resolver.keepTheirsTitle": "\u4FDD\u7559\u4F20\u5165\u5206\u652F\u4EE3\u7801",
  "resolver.takeTheirs": "\u91C7\u7528\u4F20\u5165 (Theirs)",
  "resolver.keepBothTitle": "\u540C\u65F6\u4FDD\u7559\u53CC\u65B9\u4FEE\u6539\uFF08\u5F53\u524D\u5728\u524D\uFF0C\u4F20\u5165\u5728\u540E\uFF09",
  "resolver.keepBoth": "\u4FDD\u7559\u53CC\u65B9",
  "resolver.oursHeader": "\u25C0 \u5F53\u524D\u5206\u652F\u66F4\u6539",
  "resolver.takeSegment": "\u91C7\u7528\u6B64\u6BB5",
  "resolver.emptyLine": "<\u7A7A\u884C>",
  "resolver.baseHeader": "\u516C\u5171\u7956\u5148\u57FA\u5E95 (Base)",
  "resolver.theirsHeader": "\u25B6 \u4F20\u5165\u5206\u652F\u66F4\u6539",
  // ============ GitHub 登录弹窗 ============
  "auth.codeCopied": "\u6838\u9A8C\u7801\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01",
  "auth.codeIs": "\u6838\u9A8C\u7801",
  "auth.oauthSuccess": "GitHub OAuth \u6388\u6743\u767B\u5F55\u6210\u529F\uFF01",
  "auth.oauthFailedLog": "OAuth \u6388\u6743\u5931\u8D25:",
  "auth.oauthFailed": "OAuth \u6388\u6743\u5931\u8D25",
  "auth.incomplete": "\u6388\u6743\u672A\u5B8C\u6210",
  "auth.patSuccess": "GitHub \u5F00\u53D1\u8005\u8D26\u53F7\u8FDE\u63A5\u6210\u529F\uFF01",
  "auth.patVerifyFailed": "Token \u9A8C\u8BC1\u5931\u8D25",
  "auth.authFailed": "\u8BA4\u8BC1\u5931\u8D25",
  "auth.title": "GitHub \u5F00\u53D1\u8005\u8D26\u53F7\u8BA4\u8BC1",
  "auth.boundRepo": "\u5F53\u524D\u5DF2\u5173\u8054\u4ED3\u5E93",
  "auth.boundNone": "\u8FDE\u63A5 GitHub \u4EE5\u540C\u6B65\u4E91\u7AEF Actions \u5DE5\u4F5C\u6D41\u3001PR \u4E0E\u4EE3\u7801\u5BA1\u67E5",
  "auth.logoutToast": "\u5DF2\u6CE8\u9500 GitHub \u8BA4\u8BC1\u51ED\u8BC1",
  "auth.logout": "\u6CE8\u9500\u65AD\u5F00",
  "auth.scopesSuffix": "\u6743\u9650\u3002\u53EF\u76F4\u63A5\u5728\u5BA2\u6237\u7AEF\u5185\u89E6\u53D1 GitHub Actions \u6216\u67E5\u770B PR \u8BE6\u60C5\u3002",
  "auth.oauthTab": "OAuth \u5FEB\u901F\u767B\u5F55\uFF08\u63A8\u8350\uFF09",
  "auth.patTab": "\u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C (PAT)",
  "auth.oauthCard.title": "\u514D\u914D\u7F6E Token \xB7 \u5B89\u5168\u6781\u901F\u6388\u6743",
  "auth.oauthCard.desc": "\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u5C06\u83B7\u53D6\u4E00\u7EC4\u4E00\u6B21\u6027 8 \u4F4D\u6838\u9A8C\u7801\uFF0C\u5E76\u81EA\u52A8\u6253\u5F00 GitHub \u5B98\u65B9\u6388\u6743\u9875\u9762\u3002\u5728\u7F51\u9875\u4E2D\u70B9\u51FB\u786E\u8BA4\u540E\uFF0C\u5BA2\u6237\u7AEF\u5C06\u81EA\u52A8\u5B8C\u6210\u767B\u5F55\u63E1\u624B\u3002",
  "auth.badge.repo": "\u{1F4E6} \u4ED3\u5E93\u540C\u6B65\u4E0E PR \u67E5\u770B",
  "auth.badge.actions": "\u26A1 Actions \u5DE5\u4F5C\u6D41\u67E5\u770B\u4E0E\u89E6\u53D1",
  "auth.badge.deviceFlow": "\u{1F6E1}\uFE0F GitHub \u5B98\u65B9 Device Flow \u534F\u8BAE",
  "auth.gettingCode": "\u6B63\u5728\u83B7\u53D6 GitHub \u6388\u6743\u7801...",
  "auth.startOauth": "\u4E00\u952E\u5F00\u542F GitHub OAuth \u6388\u6743",
  "auth.codeReady": "\u6388\u6743\u7801\u5DF2\u751F\u6210 \xB7 \u8BF7\u5728\u7F51\u9875\u4E2D\u786E\u8BA4",
  "auth.remaining": "\u6709\u6548\u5269\u4F59",
  "auth.copyCode": "\u590D\u5236\u6838\u9A8C\u7801",
  "auth.autoCopied": "\u5DF2\u81EA\u52A8\u5C06\u6388\u6743\u7801\u590D\u5236\u5230\u526A\u8D34\u677F\u5E76\u5C1D\u8BD5\u8C03\u8D77\u6D4F\u89C8\u5668\u3002",
  "auth.reopenPage": "\u91CD\u65B0\u6253\u5F00\u7F51\u9875",
  "auth.waitingConfirm": "\u6B63\u5728\u7B49\u5F85\u60A8\u5728 GitHub \u9875\u9762\u4E0A\u6388\u6743\u786E\u8BA4",
  "auth.pollAttempt": "\u7B2C {n} \u6B21\u8F6E\u8BE2",
  "auth.cancelOauth": "\u53D6\u6D88\u6388\u6743",
  "auth.openGeneratePage": "\u4E00\u952E\u524D\u5F80\u7F51\u9875\u751F\u6210",
  "auth.patPlaceholder": "ghp_xxxxxxxxxxxxxxxxxxxx \u6216 github_pat_...",
  "auth.patLabel": "GitHub \u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C\uFF08PAT\uFF09",
  // ============ 仓库对话框 ============
  "repo.pickFolderFailed": "\u9009\u62E9\u6587\u4EF6\u5939\u5931\u8D25",
  "repo.needPath": "\u8BF7\u8F93\u5165\u6216\u6D4F\u89C8\u9009\u62E9\u672C\u5730\u4ED3\u5E93\u76EE\u5F55",
  "repo.opened": "\u5DF2\u6210\u529F\u8F7D\u5165 Git \u4ED3\u5E93",
  "repo.openFailed": "\u6253\u5F00\u4ED3\u5E93\u5931\u8D25",
  "repo.openFailedDesc": "\u8BF7\u786E\u8BA4\u8BE5\u76EE\u5F55\u662F\u6709\u6548\u7684 Git \u4ED3\u5E93",
  "repo.needUrl": "\u8BF7\u8F93\u5165\u8FDC\u7A0B\u4ED3\u5E93 URL",
  "repo.needTarget": "\u8BF7\u6307\u5B9A\u514B\u9686\u4FDD\u5B58\u7684\u76EE\u6807\u76EE\u5F55",
  "repo.cloning": "\u6B63\u5728\u514B\u9686\u8FDC\u7A0B\u4ED3\u5E93 (git clone)...",
  "repo.cloningDesc": "\u8017\u65F6\u53D6\u51B3\u4E8E\u7F51\u7EDC\u4E0E\u4ED3\u5E93\u5927\u5C0F\uFF0C\u8BF7\u7A0D\u5019",
  "repo.cloned": "\u8FDC\u7A0B\u4ED3\u5E93\u514B\u9686\u6210\u529F\u5E76\u5DF2\u8F7D\u5165\u5DE5\u4F5C\u533A",
  "repo.cloneFailed": "\u514B\u9686\u4ED3\u5E93\u5931\u8D25",
  "repo.needInitPath": "\u8BF7\u8F93\u5165\u65B0\u5EFA\u4ED3\u5E93\u7684\u76EE\u5F55\u8DEF\u5F84",
  "repo.inited": "Git \u4ED3\u5E93\u521D\u59CB\u5316\u6210\u529F",
  "repo.initFailed": "\u521D\u59CB\u5316\u4ED3\u5E93\u5931\u8D25",
  "repo.title.open": "\u6253\u5F00\u672C\u5730 Git \u4ED3\u5E93",
  "repo.title.clone": "\u4ECE\u8FDC\u7A0B\u514B\u9686\u4ED3\u5E93 (Git Clone)",
  "repo.title.init": "\u521D\u59CB\u5316\u5168\u65B0 Git \u4ED3\u5E93 (Git Init)",
  "repo.tab.open": "\u6253\u5F00\u73B0\u6709",
  "repo.tab.clone": "\u514B\u9686\u8FDC\u7A0B",
  "repo.tab.init": "\u65B0\u5EFA\u9879\u76EE",
  "repo.localPath": "\u672C\u5730\u4ED3\u5E93\u8DEF\u5F84",
  "repo.toggleTree": "\u5728\u5E94\u7528\u5185\u6D4F\u89C8\u76EE\u5F55",
  "repo.collapseTree": "\u6536\u8D77\u76EE\u5F55\u6811",
  "repo.pathPlaceholder": "\u4F8B\u5982: E:/code/auu_github_desktop",
  "repo.browseFolder": "\u6D4F\u89C8\u6587\u4EF6\u5939...",
  "repo.browse": "\u6D4F\u89C8...",
  "repo.detecting": "\u6B63\u5728\u68C0\u6D4B\u76EE\u5F55...",
  "repo.detected": "\u68C0\u6D4B\u5230\u6709\u6548\u7684 Git \u4ED3\u5E93",
  "repo.notGitRepo": "\u8BE5\u6587\u4EF6\u5939\u5B58\u5728\uFF0C\u4F46\u5C1A\u672A\u521D\u59CB\u5316\u4E3A Git \u4ED3\u5E93\u3002",
  "repo.initHere": "\u5728\u6B64\u6587\u4EF6\u5939\u4E00\u952E\u521D\u59CB\u5316 Git (git init)",
  "repo.pathMissing": "\u8BE5\u76EE\u5F55\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5\u540E\u91CD\u8BD5",
  "repo.recent": "\u8FD1\u671F\u6253\u5F00\u8FC7\u7684\u4ED3\u5E93",
  "repo.removeRecent": "\u4ECE\u6700\u8FD1\u5217\u8868\u4E2D\u79FB\u9664",
  "repo.openBtn": "\u6253\u5F00\u6B64\u4ED3\u5E93",
  "repo.opening": "\u6B63\u5728\u8F7D\u5165\u4ED3\u5E93...",
  "repo.cloneUrl": "\u8FDC\u7A0B\u4ED3\u5E93 URL (HTTPS / SSH)",
  "repo.targetDir": "\u76EE\u6807\u672C\u5730\u76EE\u5F55",
  "repo.cloneBranch": "\u514B\u9686\u6307\u5B9A\u5206\u652F (\u53EF\u9009\uFF0C\u9ED8\u8BA4\u4E3A\u8FDC\u7A0B\u9ED8\u8BA4\u5206\u652F)",
  "repo.cloneBtn": "\u5F00\u59CB\u514B\u9686 (Git Clone)",
  "repo.cloningBtn": "\u6B63\u5728\u514B\u9686\u4ED3\u5E93\u4E2D\uFF0C\u8BF7\u7A0D\u5019...",
  "repo.initDir": "\u65B0\u5EFA\u4ED3\u5E93\u672C\u5730\u76EE\u5F55",
  "repo.defaultBranch": "\u9ED8\u8BA4\u4E3B\u5206\u652F\u540D\u79F0",
  "repo.initBtn": "\u6267\u884C\u521D\u59CB\u5316 (Git Init)",
  "repo.initializing": "\u6B63\u5728\u521D\u59CB\u5316...",
  // ============ 内嵌终端 ============
  "terminal.banner": "AuuGit \u8D5B\u535A\u5185\u5D4C\u7EC8\u7AEF\u5DF2\u5C31\u7EEA\uFF0C\u652F\u6301 Git \u4E0E Shell \u64CD\u4F5C\u3002",
  "terminal.gitOnlyHint": "\u63D0\u793A\uFF1A\u8F93\u5165 Git \u547D\u4EE4\u6267\u884C\u4ED3\u5E93\u64CD\u4F5C\uFF0C\u4F8B\u5982 'git status'\u3001'git log -n 5'\u3001'git diff'",
  "ui.dismissError": "\u5173\u95ED\u9519\u8BEF\u63D0\u793A",
  "terminal.resizeHint": "\u62D6\u52A8\u8C03\u6574\u7EC8\u7AEF\u9AD8\u5EA6",
  "terminal.clear": "\u6E05\u5C4F (Clear)",
  "terminal.openExternal": "\u5728\u72EC\u7ACB\u5916\u90E8\u7CFB\u7EDF\u7EC8\u7AEF\u4E2D\u6253\u5F00",
  "terminal.desktopOnly": "\u8BF7\u5728\u684C\u9762\u5E94\u7528\u4E2D\u6253\u5F00\u5916\u90E8\u7EC8\u7AEF",
  "terminal.openFailed": "\u65E0\u6CD5\u6253\u5F00\u5916\u90E8\u7EC8\u7AEF",
  "terminal.restore": "\u8FD8\u539F",
  "terminal.maximize": "\u6700\u5927\u5316",
  "terminal.close": "\u5173\u95ED\u7EC8\u7AEF\u9762\u677F",
  "terminal.running": "\u6B63\u5728\u6267\u884C\u4E2D...",
  "terminal.placeholder": "\u8F93\u5165 git \u547D\u4EE4\uFF0C\u5982 git status, git log -n 3 ...",
  // ============ 设置补充 ============
  "settings.git.detecting": "\u6B63\u5728\u68C0\u6D4B\u7CFB\u7EDF Git \u7248\u672C...",
  "settings.git.notFound": "\u672A\u68C0\u6D4B\u5230\u53EF\u7528 Git CLI",
  "settings.git.detectFailed": "\u68C0\u6D4B\u5931\u8D25: \u8BF7\u786E\u8BA4 Git \u8DEF\u5F84\u6B63\u786E\u914D\u7F6E",
  "settings.ai.builtinReady": "\u672C\u5730\u89C4\u5219\u5DF2\u5C31\u7EEA",
  "settings.ai.builtinReadyDesc": "\u751F\u6210\u8FC7\u7A0B\u5728\u672C\u5730\u5B8C\u6210\uFF0C\u4E0D\u8C03\u7528\u5916\u90E8\u6A21\u578B\u3002",
  "settings.ai.needKey": "\u8BF7\u8F93\u5165 API Key \u540E\u518D\u6D4B\u8BD5\u8FDE\u63A5",
  "settings.ai.testOk": "AI API \u8FDE\u63A5\u6D4B\u8BD5\u6210\u529F\uFF01",
  "settings.ai.testOkDesc": "\u5DF2\u6210\u529F\u8FDE\u901A {model}",
  "settings.ai.testFailed": "AI \u8FDE\u63A5\u6D4B\u8BD5\u5931\u8D25",
  "settings.ai.modelPlaceholder": "\u4F8B\u5982 deepseek-chat \u6216 gpt-4o-mini",
  "settings.github.patHintPrefix": "\u63D0\u793A\uFF1A\u652F\u6301 GitHub \u5B98\u65B9 OAuth \u8BBE\u5907\u6D41\u4E00\u952E\u6388\u6743\uFF0C\u4E5F\u53EF\u4F7F\u7528\u5305\u542B",
  "settings.github.patHintSuffix": "\u6743\u9650\u7684 Personal Access Token \u8FDB\u884C\u8FDE\u63A5\u3002",
  "settings.shortcuts.cmdPalette": "\u6253\u5F00\u5168\u5C40\u547D\u4EE4\u641C\u7D22\u9762\u677F (Command Palette)",
  "settings.shortcuts.push": "\u63A8\u9001\u672C\u5730\u63D0\u4EA4\u5230\u8FDC\u7A0B (Git Push)",
  "settings.shortcuts.pull": "\u62C9\u53D6\u8FDC\u7A0B\u66F4\u65B0 (Git Pull)",
  "settings.shortcuts.fetch": "\u83B7\u53D6\u8FDC\u7A0B\u53D8\u66F4 (Git Fetch)",
  "settings.shortcuts.commit": "\u63D0\u4EA4\u6682\u5B58\u7684\u6587\u4EF6 (Commit)",
  "settings.shortcuts.createBranch": "\u65B0\u5EFA\u5206\u652F (Create Branch)",
  "settings.shortcuts.createTag": "\u65B0\u5EFA\u6807\u7B7E (Create Tag)",
  "settings.shortcuts.toggleTerminal": "\u6253\u5F00/\u5173\u95ED\u5185\u5D4C\u7EC8\u7AEF",
  // ============ 命令面板收尾 ============
  "palette.placeholder": "\u8F93\u5165\u547D\u4EE4\u3001\u5206\u652F\u3001Tag \u6216\u64CD\u4F5C (\u5982 Commit, Push, CI)...",
  "palette.noMatch": "\u672A\u627E\u5230\u5339\u914D\u7684\u547D\u4EE4\u6216\u5206\u652F",
  "palette.group.nav": "\u89C6\u56FE\u5BFC\u822A",
  "sidebar.noMatchBranches": "\u672A\u5339\u914D\u5230\u672C\u5730\u5206\u652F",
  "toast.copyErrorDetails": "\u590D\u5236\u9519\u8BEF\u8BE6\u60C5",
  // ============ 收尾 ============
  "auth.scopesPrefix": "\u5DF2\u5177\u5907",
  "auth.patScopesPrefix": "\u9700\u5305\u542B",
  "auth.scopesDot": "\u6743\u9650\u3002",
  "layout.resizeLeft": "\u6309\u4F4F\u62D6\u62FD\u8C03\u8282\u5DE6\u4FA7\u8FB9\u680F\u5BBD\u5EA6\uFF0C\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4",
  "layout.resizeRight": "\u6309\u4F4F\u62D6\u62FD\u8C03\u8282\u53F3\u4FA7\u9762\u677F\u5BBD\u5EA6\uFF0C\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4",
  "create.namePlaceholder": "\u4F8B\u5982 feature/awesome-feature \u6216 fix/bug-123",
  "browser.loadFailed": "\u8BFB\u53D6\u76EE\u5F55\u5931\u8D25",
  "browser.backTitle": "\u8FD4\u56DE\u4E0A\u4E00\u7EA7\u76EE\u5F55",
  "browser.drivesTitle": "\u67E5\u770B\u6240\u6709\u78C1\u76D8\u9A71\u52A8\u5668",
  "browser.myComputer": "\u6211\u7684\u7535\u8111 (\u78C1\u76D8\u6839\u76EE\u5F55)",
  "browser.selectCurrent": "\u9009\u62E9\u5F53\u524D\u76EE\u5F55",
  "browser.scanning": "\u6B63\u5728\u626B\u63CF\u76EE\u5F55...",
  "browser.backToRoot": "\u8FD4\u56DE\u6839\u9A71\u52A8\u5668",
  "browser.noSubfolders": "\u6B64\u76EE\u5F55\u4E0B\u6CA1\u6709\u5B50\u6587\u4EF6\u5939",
  "browser.gitRepo": "Git \u4ED3\u5E93",
  "browser.select": "\u9009\u62E9",
  // ============ 语言纯度收尾补漏 ============
  "rightPane.bannerFilesChanged": "\u4E2A\u5DE5\u4F5C\u533A\u6587\u4EF6\u53D8\u66F4",
  "rightPane.viewChanges": "\u67E5\u770B\u53D8\u66F4",
  "rightPane.commitHashLabel": "\u63D0\u4EA4:",
  "rightPane.recomposeBtn": "\u4F7F\u7528\u6B64\u8BF4\u660E",
  "rightPane.authored": "\u63D0\u4EA4\u4E8E",
  "rightPane.parentLabel": "\u7236\u63D0\u4EA4:",
  "rightPane.zeroFiles": "0 \u4E2A\u6587\u4EF6\u53D8\u66F4",
  "rightPane.statAdded": "\u65B0\u589E",
  "rightPane.statModified": "\u4FEE\u6539",
  "rightPane.statDeleted": "\u5220\u9664",
  "rightPane.viewAllFiles": "\u67E5\u770B\u5168\u90E8\u6587\u4EF6",
  "rightPane.collapseAll": "\u5168\u90E8\u6298\u53E0",
  "rightPane.githubChecks": "GitHub \u68C0\u67E5",
  "history.col.branchTag": "\u5206\u652F / \u6807\u7B7E",
  "history.col.graph": "\u56FE\u5F62",
  "history.col.message": "\u63D0\u4EA4\u4FE1\u606F",
  "history.col.authorDate": "\u4F5C\u8005 / \u65E5\u671F",
  "terminal.title": "Git \u63A7\u5236\u53F0",
  "pr.title": "GitHub \u62C9\u53D6\u8BF7\u6C42",
  "sidebar.gitAiAgent": "Git \u5FEB\u6377\u5DE5\u5177",
  "time.justNow": "\u521A\u521A",
  "time.minutesAgo": "{n} \u5206\u949F\u524D",
  "time.hoursAgo": "{n} \u5C0F\u65F6\u524D",
  "time.daysAgo": "{n} \u5929\u524D",
  "time.locale": "zh-CN",
  "history.commitCount": "\u4E2A\u63D0\u4EA4",
  "history.viewChanges": "\u67E5\u770B\u53D8\u66F4 \u2192",
  "changes.stageHunk": "\u6682\u5B58\u6B64\u5757",
  "changes.unstageHunk": "\u53D6\u6D88\u6682\u5B58\u6B64\u5757",
  "changes.discardHunk": "\u653E\u5F03\u6B64\u5757",
  "changes.hunkStaged": "\u5DF2\u6682\u5B58\u6240\u9009\u5757",
  "changes.hunkUnstaged": "\u5DF2\u53D6\u6D88\u6682\u5B58\u6240\u9009\u5757",
  "changes.hunkDiscarded": "\u5DF2\u653E\u5F03\u6240\u9009\u5757\u6539\u52A8",
  "changes.hunkOpFailed": "\u5757\u64CD\u4F5C\u5931\u8D25",
  "changes.mode.diff": "\u5DEE\u5F02",
  "changes.mode.blame": "\u8FFD\u6EAF",
  "changes.mode.history": "\u6587\u4EF6\u5386\u53F2",
  "changes.blameEmpty": "\u8BE5\u6587\u4EF6\u8FD8\u6CA1\u6709\u53EF\u8FFD\u6EAF\u7684\u63D0\u4EA4\uFF08\u672A\u8DDF\u8E2A\u6216\u65B0\u6587\u4EF6\uFF09",
  "changes.fileHistoryEmpty": "\u8BE5\u6587\u4EF6\u6CA1\u6709\u63D0\u4EA4\u8BB0\u5F55",
  "changes.commitNotLoaded": "\u8BE5\u63D0\u4EA4\u4E0D\u5728\u5DF2\u52A0\u8F7D\u7684\u5386\u53F2\u4E2D\uFF0C\u53EF\u5728\u63D0\u4EA4\u5386\u53F2\u91CC\u641C\u7D22\u54C8\u5E0C\u5B9A\u4F4D",
  "changes.loadingData": "\u6B63\u5728\u52A0\u8F7D...",
  "pr.newPR": "\u65B0\u5EFA\u62C9\u53D6\u8BF7\u6C42",
  "pr.createTitle": "\u521B\u5EFA\u62C9\u53D6\u8BF7\u6C42",
  "pr.noRepoBound": "\u672A\u7ED1\u5B9A\u4ED3\u5E93",
  "pr.needLogin": "\u9700\u8981\u767B\u5F55 GitHub \u5E76\u6253\u5F00 GitHub \u4ED3\u5E93\u540E\u624D\u80FD\u64CD\u4F5C",
  "pr.sourceBranch": "\u6E90\u5206\u652F",
  "pr.targetBranch": "\u76EE\u6807\u5206\u652F",
  "pr.titleLabel": "\u6807\u9898",
  "pr.titlePlaceholder": "\u6807\u9898\uFF0C\u4F8B\u5982\uFF1A\u4FEE\u590D\u767B\u5F55\u8D85\u65F6\u95EE\u9898",
  "pr.descLabel": "\u63CF\u8FF0",
  "pr.descPlaceholder": "\u63CF\u8FF0\u672C\u6B21\u53D8\u66F4\u7684\u5185\u5BB9\u4E0E\u52A8\u673A...",
  "pr.titleEmpty": "\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A",
  "pr.branchMissing": "\u8BF7\u9009\u62E9\u6E90\u5206\u652F\u4E0E\u76EE\u6807\u5206\u652F",
  "pr.sameBranch": "\u6E90\u5206\u652F\u4E0E\u76EE\u6807\u5206\u652F\u4E0D\u80FD\u76F8\u540C",
  "pr.loadingBase": "\u6B63\u5728\u83B7\u53D6\u9ED8\u8BA4\u5206\u652F...",
  "pr.submitting": "\u521B\u5EFA\u4E2D...",
  "pr.createFailed": "\u521B\u5EFA\u5931\u8D25",
  "pr.created": "\u62C9\u53D6\u8BF7\u6C42 #{n} \u5DF2\u521B\u5EFA",
  "pr.noCommitsDiff": "\u521B\u5EFA\u5931\u8D25\uFF1A\u6E90\u5206\u652F\u6CA1\u6709\u9886\u5148\u76EE\u6807\u5206\u652F\u7684\u63D0\u4EA4\uFF0C\u6216\u8BE5\u62C9\u53D6\u8BF7\u6C42\u5DF2\u5B58\u5728",
  "pr.merge": "\u5408\u5E76",
  "pr.merging": "\u5408\u5E76\u4E2D...",
  "pr.mergeMethod": "\u5408\u5E76\u65B9\u5F0F",
  "pr.mergeMethod.merge": "\u666E\u901A\u5408\u5E76 (merge)",
  "pr.mergeMethod.squash": "\u538B\u7F29\u5408\u5E76 (squash)",
  "pr.mergeMethod.rebase": "\u53D8\u57FA\u5408\u5E76 (rebase)",
  "pr.mergeTitle": "\u5C06\u62C9\u53D6\u8BF7\u6C42 #{n} \u5408\u5E76\u5230\u76EE\u6807\u5206\u652F",
  "pr.mergeConfirm": "\u786E\u5B9A\u5C06\u62C9\u53D6\u8BF7\u6C42 #{n} \u5408\u5E76\u5230 {base} \u5417\uFF1F\u6B64\u64CD\u4F5C\u4F1A\u5199\u5165\u8FDC\u7A0B\u4ED3\u5E93\u3002",
  "pr.mergeMerged": "\u62C9\u53D6\u8BF7\u6C42 #{n} \u5DF2\u5408\u5E76",
  "pr.mergeNotMerged": "\u62C9\u53D6\u8BF7\u6C42\u672A\u5408\u5E76",
  "pr.mergeFailed": "\u5408\u5E76\u5931\u8D25",
  "pr.closePR": "\u5173\u95ED",
  "pr.closing": "\u5173\u95ED\u4E2D...",
  "pr.closeConfirmTitle": "\u4E0D\u5408\u5E76\u76F4\u63A5\u5173\u95ED\u6B64\u62C9\u53D6\u8BF7\u6C42",
  "pr.closeConfirm": "\u786E\u5B9A\u4E0D\u5408\u5E76\u3001\u76F4\u63A5\u5173\u95ED\u62C9\u53D6\u8BF7\u6C42 #{n} \u5417\uFF1F",
  "pr.closed": "\u62C9\u53D6\u8BF7\u6C42 #{n} \u5DF2\u5173\u95ED",
  "pr.closeFailed": "\u5173\u95ED\u5931\u8D25",
  "history.ctx.copyHash": "\u590D\u5236\u54C8\u5E0C",
  "history.ctx.cherryPick": "\u62E9\u53D6\u6B64\u63D0\u4EA4 (Cherry-pick)",
  "history.ctx.revert": "\u8FD8\u539F\u6B64\u63D0\u4EA4 (Revert)",
  "history.ctx.resetSoft": "\u8F6F\u91CD\u7F6E\u5230\u6B64\u63D0\u4EA4\uFF08\u4FDD\u7559\u6539\u52A8\uFF09",
  "history.ctx.resetHard": "\u786C\u91CD\u7F6E\u5230\u6B64\u63D0\u4EA4\uFF08\u4E22\u5F03\u6539\u52A8\uFF09",
  "history.cherryPicked": "\u5DF2\u62E9\u53D6\u63D0\u4EA4 {h} \u5230\u5F53\u524D\u5206\u652F",
  "history.cherryPickFailed": "Cherry-pick \u5931\u8D25",
  "history.reverted": "\u5DF2\u751F\u6210 {h} \u7684\u8FD8\u539F\u63D0\u4EA4",
  "history.revertFailed": "Revert \u5931\u8D25",
  "history.resetDone": "\u5DF2\u91CD\u7F6E\u5230 {h}",
  "history.resetFailed": "\u91CD\u7F6E\u5931\u8D25",
  "history.resetSoftConfirm": "\u786E\u5B9A\u8F6F\u91CD\u7F6E\u5230 {h} \u5417\uFF1F\n\u5176\u540E\u7684\u63D0\u4EA4\u5C06\u64A4\u9500\uFF0C\u6539\u52A8\u4FDD\u7559\u5728\u6682\u5B58\u533A\u3002",
  "history.resetHardConfirm": "\u786E\u5B9A\u786C\u91CD\u7F6E\u5230 {h} \u5417\uFF1F\n\u5176\u540E\u6240\u6709\u63D0\u4EA4\u4E0E\u672A\u63D0\u4EA4\u6539\u52A8\u90FD\u5C06\u88AB\u4E22\u5F03\uFF0C\u4E14\u65E0\u6CD5\u6062\u590D\uFF01",
  "ci.watching": "\u5DF2\u63A8\u9001\uFF0C\u6B63\u5728\u76D1\u542C CI \u68C0\u67E5...",
  "ci.watchingDesc": "\u53EF\u7A0D\u540E\u5728 Actions \u9875\u67E5\u770B\u8FDB\u5EA6",
  "ci.passed": "CI \u5168\u90E8\u901A\u8FC7",
  "ci.failed": "CI \u5B58\u5728\u5931\u8D25\u9879",
  "ci.passedCount": "\u9879\u68C0\u67E5\u901A\u8FC7",
  "ci.stillRunning": "CI \u4ECD\u5728\u8FD0\u884C\u4E2D",
  "ci.jobFallback": "\u4EFB\u52A1 #{id}",
  "ci.dispatchSubmitted": "\u8C03\u5EA6\u8BF7\u6C42\u5DF2\u63D0\u4EA4\u81F3 GitHub",
  "ci.rerunRequested": "\u91CD\u8DD1\u8BF7\u6C42\u5DF2\u53D1\u9001",
  "ci.rerunFailed": "\u91CD\u65B0\u8FD0\u884C\u5931\u8D25",
  "ci.cancelRequested": "\u53D6\u6D88\u8BF7\u6C42\u5DF2\u53D1\u9001",
  "ci.cancelFailed": "\u53D6\u6D88\u5DE5\u4F5C\u6D41\u5931\u8D25",
  // ============ 服务层用户可见错误与诊断文案 ============
  "err.gitFailed": "Git \u6267\u884C\u5931\u8D25 (\u9000\u51FA\u7801 {c}): {m}",
  "err.unknownGit": "\u672A\u77E5\u9519\u8BEF",
  "err.noBackendProxy": "\u672A\u68C0\u6D4B\u5230\u672C\u5730\u540E\u7AEF\u4EE3\u7406\u670D\u52A1\uFF0C\u8BF7\u786E\u4FDD\u5728\u684C\u9762\u7AEF\u6216\u5F00\u53D1\u73AF\u5883\u4E2D\u8FD0\u884C",
  "err.networkExec": "\u7F51\u7EDC\u8FDE\u63A5\u6216\u6267\u884C\u5F02\u5E38",
  "err.commitEmpty": "\u63D0\u4EA4\u4FE1\u606F\u4E0D\u80FD\u4E3A\u7A7A",
  "err.writeFailed": "\u65E0\u6CD5\u5199\u5165\u6587\u4EF6 {p}",
  "err.prFetchFailed": "\u4ECE\u8FDC\u7A0B\u62C9\u53D6 PR #{n} \u5931\u8D25\uFF1A\u8BF7\u786E\u8BA4\u8FDC\u7A0B\u4ED3\u5E93\u4E0E\u7F51\u7EDC\u8FDE\u63A5 ({m})",
  "err.ghBadCredentials": "GitHub \u51ED\u8BC1\u65E0\u6548\u6216\u5DF2\u8FC7\u671F (Bad credentials)",
  "err.ghAuthFailed": "GitHub \u8BA4\u8BC1\u5931\u8D25: HTTP {s}",
  "err.ghRepoInfo": "\u83B7\u53D6\u4ED3\u5E93\u4FE1\u606F\u5931\u8D25: HTTP {s}",
  "err.ghDispatch": "\u89E6\u53D1\u5DE5\u4F5C\u6D41\u8C03\u5EA6\u5931\u8D25 (HTTP {s}): {m}",
  "err.ghRerun": "\u91CD\u65B0\u8FD0\u884C\u5DE5\u4F5C\u6D41\u5931\u8D25 (HTTP {s})",
  "err.ghCancel": "\u53D6\u6D88\u5DE5\u4F5C\u6D41\u8FD0\u884C\u5931\u8D25 (HTTP {s})",
  "err.ghLogs": "\u83B7\u53D6\u6784\u5EFA\u65E5\u5FD7\u5931\u8D25 (HTTP {s})",
  "err.ghYaml": "\u83B7\u53D6\u5DE5\u4F5C\u6D41\u914D\u7F6E\u6587\u4EF6\u5931\u8D25 (HTTP {s})",
  "err.ghNoCredentials": "GitHub \u672A\u8FD4\u56DE\u6709\u6548\u6388\u6743\u51ED\u636E",
  "err.ghDeviceFailed": "\u83B7\u53D6 GitHub \u8BBE\u5907\u7801\u5931\u8D25: {m}",
  "err.ghNoProxy": "\u672A\u68C0\u6D4B\u5230\u540E\u7AEF\u8BA4\u8BC1\u4EE3\u7406\u670D\u52A1\uFF0C\u8BF7\u5728\u684C\u9762\u5BA2\u6237\u7AEF\u6216\u5F00\u53D1\u73AF\u5883\u4E2D\u8FD0\u884C",
  "err.ghDeviceHttp": "\u83B7\u53D6 GitHub \u8BBE\u5907\u7801\u5931\u8D25 (HTTP {s})",
  "err.ghNoDevice": "GitHub \u672A\u8FD4\u56DE\u6709\u6548\u7684\u8BBE\u5907\u6388\u6743\u51ED\u636E",
  "err.ghPollFailed": "\u8F6E\u8BE2 GitHub Token \u5F02\u5E38: {m}",
  "err.ghPollHttp": "\u8F6E\u8BE2 GitHub Token \u5F02\u5E38 (HTTP {s})",
  "err.ghCodeExpired": "\u8BBE\u5907\u6388\u6743\u9A8C\u8BC1\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u53D1\u8D77\u767B\u5F55",
  "err.ghUserDenied": "\u7528\u6237\u5728 GitHub \u9875\u9762\u4E0A\u62D2\u7EDD\u4E86\u6388\u6743\u8BF7\u6C42",
  "err.ghAuthError": "\u6388\u6743\u5F02\u5E38: {m}",
  "err.ghTimeout": "\u6388\u6743\u8BF7\u6C42\u5DF2\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5",
  "err.aiNoFiles": "\u5F53\u524D\u65E0\u53EF\u63D0\u4EA4\u6216\u5206\u6790\u7684\u6587\u4EF6",
  "err.aiHttp": "API \u8BF7\u6C42\u5931\u8D25 (HTTP {s}): {m}",
  "err.aiEmptyResponse": "API \u8FD4\u56DE\u5185\u5BB9\u4E3A\u7A7A",
  "diag.issue.conflictTitle": "\u5B58\u5728 {n} \u5904\u672A\u89E3\u51B3\u7684\u4EE3\u7801\u51B2\u7A81",
  "diag.issue.conflictDesc": "\u68C0\u6D4B\u5230\u4EE5\u4E0B\u6587\u4EF6\u5305\u542B Git \u51B2\u7A81\u6807\u8BB0\uFF1A{files}",
  "diag.issue.conflictHint": "\u5728\u5DE5\u4F5C\u533A\u89E3\u51B3\u51B2\u7A81\u6807\u8BB0\u540E\u6267\u884C git add \u6807\u8BB0\u5DF2\u89E3\u51B3\u3002",
  "diag.issue.rebaseTitle": "\u53D8\u57FA (Rebase) \u8FDB\u884C\u4E2D",
  "diag.issue.rebaseDesc": "\u6709\u672A\u5B8C\u6210\u7684\u53D8\u57FA\u6D41\u7A0B\uFF0C\u9700\u8981 continue \u6536\u5C3E\u6216 abort \u4E2D\u6B62\u3002",
  "diag.issue.rebaseHint": "\u4F7F\u7528\u9876\u90E8\u83DC\u5355\u6267\u884C Rebase Continue \u6216 Rebase Abort\u3002",
  "diag.issue.mergeTitle": "\u5408\u5E76 (Merge) \u4E2D\u95F4\u72B6\u6001",
  "diag.issue.mergeDesc": "\u5408\u5E76\u6D41\u7A0B\u5C1A\u672A\u901A\u8FC7\u63D0\u4EA4\u6536\u5C3E\u3002",
  "diag.issue.mergeHint": "\u63D0\u4EA4\u4EE3\u7801\u5B8C\u6210\u5408\u5E76\uFF0C\u6216\u6267\u884C Merge Abort \u8FD8\u539F\u3002",
  "diag.issue.detachedTitle": "\u6E38\u79BB\u5934\u6307\u9488\u72B6\u6001 (Detached HEAD)",
  "diag.issue.detachedDesc": "\u5F53\u524D\u672A\u5904\u4E8E\u4EFB\u4F55\u5177\u540D\u5206\u652F\u4E0A\uFF0C\u6B64\u65F6\u7684\u65B0\u63D0\u4EA4\u5728\u5207\u5206\u652F\u540E\u53EF\u80FD\u53D8\u6210\u5B64\u7ACB\u63D0\u4EA4\u3002",
  "diag.issue.detachedHint": "\u5EFA\u8BAE\u901A\u8FC7\u65B0\u5EFA\u5206\u652F\u4FDD\u5B58\u5F53\u524D\u63D0\u4EA4\u8FDB\u5EA6\u3002",
  "diag.issue.behindTitle": "\u672C\u5730\u5206\u652F\u843D\u540E\u8FDC\u7A0B {n} \u4E2A\u63D0\u4EA4",
  "diag.issue.behindDesc": "\u8FDC\u7AEF\u5B58\u5728\u65B0\u7684\u56E2\u961F\u63D0\u4EA4\u5C1A\u672A\u540C\u6B65\u81F3\u672C\u5730\u3002",
  "diag.issue.behindHint": "\u5EFA\u8BAE\u70B9\u51FB\u9876\u90E8\u5DE5\u5177\u680F\u7684\u62C9\u53D6\u6309\u94AE\u62C9\u53D6\u6700\u65B0\u66F4\u65B0\u3002",
  "diag.issue.unpushedTitle": "\u672C\u5730\u6709 {n} \u4E2A\u5DF2\u63D0\u4EA4\u4F46\u672A\u63A8\u9001\u7684\u6539\u52A8",
  "diag.issue.unpushedDesc": "\u8FD9\u4E9B\u63D0\u4EA4\u4EC5\u4FDD\u5B58\u5728\u672C\u5730\u5DE5\u4F5C\u533A\uFF0C\u8FDC\u7AEF\u534F\u4F5C\u8005\u6682\u4E0D\u53EF\u89C1\u3002",
  "diag.issue.unpushedHint": "\u53EF\u4F7F\u7528\u9876\u90E8\u5DE5\u5177\u680F\u7684\u63A8\u9001\u6309\u94AE\u63A8\u9001\u5230\u8FDC\u7AEF\u4ED3\u5E93\u3002",
  "diag.issue.localOnlyTitle": "\u53D1\u73B0 {n} \u4E2A\u672A\u8BBE\u4E0A\u6E38\u7684\u672C\u5730\u5206\u652F",
  "diag.issue.localOnlyDesc": "\u8FD9\u4E9B\u5206\u652F\u672A\u914D\u7F6E\u4E0A\u6E38\u8FFD\u8E2A\uFF0C\u5982\u4E0D\u518D\u9700\u8981\u53EF\u6E05\u7406\u5206\u652F\u4FDD\u6301\u6574\u6D01\u3002",
  "diag.issue.cleanTitle": "\u4ED3\u5E93\u72B6\u6001\u6781\u4F73\uFF0C\u65E0\u6F5C\u5728\u5F02\u5E38",
  "diag.issue.cleanDesc": "\u65E0\u672A\u51B3\u4EE3\u7801\u51B2\u7A81\u3001\u65E0\u4E2D\u95F4\u6001\u60AC\u7A7A\u63D0\u4EA4\uFF0C\u5206\u652F\u540C\u6B65\u72B6\u6001\u5065\u5EB7\u3002",
  "diag.summary.healthy": "\u672C\u5730\u4ED3\u5E93\u6574\u4F53\u7ED3\u6784\u5065\u5EB7\uFF0C\u65E0\u963B\u585E\u6027\u4EE3\u7801\u98CE\u9669\u3002",
  "diag.summary.warning": "\u68C0\u6D4B\u5230\u90E8\u5206\u5EFA\u8BAE\u5904\u7406\u7684\u4E8B\u9879\uFF08\u5982\u843D\u540E\u63D0\u4EA4\u6216\u6E38\u79BB HEAD\uFF09\u3002",
  "diag.summary.danger": "\u68C0\u6D4B\u5230\u9AD8\u98CE\u9669\u5F02\u5E38\uFF08\u5982\u51B2\u7A81\u672A\u89E3\u51B3\u6216\u64CD\u4F5C\u4E2D\u65AD\uFF09\uFF0C\u5EFA\u8BAE\u4F18\u5148\u5904\u7406\u3002",
  "err.dirPickerFailed": "\u6253\u5F00\u6587\u4EF6\u5939\u9009\u62E9\u5668\u5931\u8D25",
  "err.dirNoBackend": "\u672A\u68C0\u6D4B\u5230\u540E\u7AEF\u672C\u5730\u5F00\u53D1\u670D\u52A1",
  "err.dirListFailed": "\u83B7\u53D6\u76EE\u5F55\u5931\u8D25",
  "err.keyringReadFailed": "\u65E0\u6CD5\u8BFB\u53D6\u7CFB\u7EDF\u51ED\u636E\uFF1A{m}",
  "err.credentialCleanupFailed": "\u65E0\u6CD5\u6E05\u7406\u51ED\u636E",
  "err.headUnavailable": "\u65E0\u6CD5\u83B7\u53D6\u5F53\u524D HEAD \u63D0\u4EA4\uFF0C\u4ED3\u5E93\u53EF\u80FD\u8FD8\u6CA1\u6709\u4EFB\u4F55\u63D0\u4EA4",
  "err.redoBranchMismatch": "\u65E0\u6CD5\u5728\u5F53\u524D\u5206\u652F\u91CD\u505A\uFF0C\u8BE5\u63D0\u4EA4\u5C5E\u4E8E\u5206\u652F\uFF1A{branch}",
  "err.noRepoOpen": "\u672A\u6253\u5F00\u4EFB\u4F55 Git \u4ED3\u5E93",
  "err.aiCredentialReadFailed": "\u65E0\u6CD5\u8BFB\u53D6\u6216\u8FC1\u79FB AI \u51ED\u636E\uFF1A{m}",
  "err.aiCredentialSaveFailed": "\u65E0\u6CD5\u5B89\u5168\u4FDD\u5B58 AI \u51ED\u636E\uFF1A{m}",
  "history.loadMore": "\u52A0\u8F7D\u66F4\u591A\u63D0\u4EA4",
  "history.allLoaded": "\u5DF2\u52A0\u8F7D\u5168\u90E8\u63D0\u4EA4",
  "sidebar.viewStashPatch": "\u67E5\u770B\u8865\u4E01",
  "settings.remotes.title": "\u8FDC\u7A0B\u4ED3\u5E93 (Remote)",
  "settings.remotes.add": "\u6DFB\u52A0\u8FDC\u7A0B",
  "settings.remotes.namePlaceholder": "\u8FDC\u7A0B\u540D\u79F0\uFF0C\u5982 origin / upstream",
  "settings.remotes.urlPlaceholder": "\u4ED3\u5E93\u5730\u5740\uFF0C\u5982 https://github.com/user/repo.git",
  "settings.remotes.missingFields": "\u8BF7\u586B\u5199\u8FDC\u7A0B\u540D\u79F0\u4E0E\u4ED3\u5E93\u5730\u5740",
  "settings.remotes.added": "\u8FDC\u7A0B\u5DF2\u6DFB\u52A0",
  "settings.remotes.addFailed": "\u6DFB\u52A0\u8FDC\u7A0B\u5931\u8D25",
  "settings.remotes.removed": "\u5DF2\u79FB\u9664\u8FDC\u7A0B {name}",
  "settings.remotes.removeFailed": "\u79FB\u9664\u8FDC\u7A0B\u5931\u8D25",
  "settings.remotes.removeConfirm": "\u786E\u5B9A\u79FB\u9664\u8FDC\u7A0B {name} \u5417\uFF1F\u672C\u5730\u5206\u652F\u4E0E\u63D0\u4EA4\u4E0D\u53D7\u5F71\u54CD\u3002",
  "settings.remotes.urlSaved": "\u8FDC\u7A0B\u5730\u5740\u5DF2\u66F4\u65B0",
  "settings.remotes.urlSaveFailed": "\u66F4\u65B0\u8FDC\u7A0B\u5730\u5740\u5931\u8D25",
  "settings.remotes.edit": "\u7F16\u8F91\u5730\u5740",
  "settings.remotes.save": "\u4FDD\u5B58\u5730\u5740",
  "settings.remotes.remove": "\u79FB\u9664\u8FDC\u7A0B",
  "settings.remotes.empty": "\u5C1A\u672A\u914D\u7F6E\u4EFB\u4F55\u8FDC\u7A0B\u4ED3\u5E93\u3002",
  "pr.aiGenerate": "\u751F\u6210\u63CF\u8FF0",
  "pr.aiGenerating": "\u751F\u6210\u4E2D...",
  "pr.aiGenerateTitle": "\u6839\u636E\u5206\u652F\u5DEE\u5F02\u81EA\u52A8\u751F\u6210 PR \u63CF\u8FF0\uFF08\u672A\u914D\u7F6E API Key \u65F6\u4F7F\u7528\u672C\u5730\u6A21\u677F\uFF09",
  "pr.aiGenerateFailed": "AI \u63CF\u8FF0\u751F\u6210\u5931\u8D25",
  "pr.aiFallbackUsed": "\u63CF\u8FF0\u7531\u672C\u5730\u6A21\u677F\u751F\u6210",
  "pr.aiNoDiff": "\u6E90\u5206\u652F\u76F8\u5BF9\u76EE\u6807\u5206\u652F\u6CA1\u6709\u5DEE\u5F02\uFF0C\u65E0\u6CD5\u751F\u6210\u63CF\u8FF0",
  "pr.aiLocalSummary": "\u672C\u5206\u652F\u76F8\u5BF9\u57FA\u51C6\u5206\u652F\u7684\u53D8\u66F4\u6458\u8981\uFF1A",
  "pr.aiFilesCount": "\u4E2A\u6587\u4EF6",
  "pr.aiGroupAdded": "## \u65B0\u589E\u6587\u4EF6",
  "pr.aiGroupModified": "## \u4FEE\u6539\u6587\u4EF6",
  "pr.aiGroupDeleted": "## \u5220\u9664\u6587\u4EF6",
  "settings.shortcuts.switchViews": "\u5207\u6362\u5DE5\u4F5C\u533A / \u5386\u53F2 / \u62C9\u53D6\u8BF7\u6C42 / Actions \u89C6\u56FE",
  "settings.shortcuts.filterFocus": "\u805A\u7126\u63D0\u4EA4\u5386\u53F2\u7B5B\u9009\u6846",
  "settings.shortcuts.openSettings": "\u6253\u5F00\u8BBE\u7F6E",
  "settings.shortcuts.cheatSheet": "\u6253\u5F00\u5FEB\u6377\u952E\u901F\u67E5",
  "cheatsheet.title": "\u5FEB\u6377\u952E\u901F\u67E5",
  "cheatsheet.hint": "\u968F\u65F6\u6309 ? \u91CD\u65B0\u6253\u5F00",
  "cheatsheet.group.global": "\u5168\u5C40",
  "cheatsheet.group.git": "Git \u64CD\u4F5C",
  "cheatsheet.group.view": "\u89C6\u56FE",
  "update.available": "\u53D1\u73B0\u65B0\u7248\u672C v{v}",
  "update.downloading": "\u6B63\u5728\u540E\u53F0\u4E0B\u8F7D\u5B89\u88C5...",
  "update.installed": "\u66F4\u65B0\u5DF2\u5C31\u7EEA",
  "update.restartHint": "\u91CD\u542F AuuGit \u540E\u751F\u6548",
  "update.upToDate": "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C",
  "update.checkFailed": "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25",
  "header.refresh": "\u5237\u65B0",
  "header.refreshed": "\u4ED3\u5E93\u72B6\u6001\u5DF2\u5237\u65B0",
  "header.refreshFailed": "\u5237\u65B0\u5931\u8D25",
  "header.refreshTooltip": "\u5237\u65B0\u4ED3\u5E93\u72B6\u6001\uFF0C\u68C0\u6D4B\u7EC8\u7AEF/\u7F16\u8F91\u5668\u7B49\u5916\u90E8\u53D8\u66F4",
  "history.searchingAll": "\u6B63\u5728\u641C\u7D22\u5B8C\u6574\u4ED3\u5E93\u5386\u53F2\u2026",
  "diff.search": "\u67E5\u627E\u5DEE\u5F02\u5185\u5BB9",
  "diff.previousMatch": "\u4E0A\u4E00\u4E2A\u5339\u914D",
  "diff.nextMatch": "\u4E0B\u4E00\u4E2A\u5339\u914D",
  "diff.wrap": "\u81EA\u52A8\u6362\u884C",
  "diff.ignoreWhitespace": "\u5FFD\u7565\u7A7A\u767D",
  "diff.ignoreHint": "\u4EC5\u5F71\u54CD\u663E\u793A\u3002\u5B8C\u6574\u6587\u4EF6\u6682\u5B58\u4ECD\u5305\u542B\u7A7A\u767D\u4FEE\u6539\uFF1B\u4EE3\u7801\u5757\u64CD\u4F5C\u8BF7\u5173\u95ED\u6B64\u9009\u9879\u3002",
  "changes.selectionActions": "\u6279\u91CF\u6587\u4EF6\u64CD\u4F5C",
  "changes.selected": "\u4E2A\u5DF2\u9009",
  "changes.pickFile": "\u52FE\u9009\u52A0\u5165\u6279\u91CF\u64CD\u4F5C",
  "changes.stageSelected": "\u6682\u5B58\u9009\u4E2D",
  "changes.unstageSelected": "\u53D6\u6D88\u6682\u5B58\u9009\u4E2D",
  "changes.clearSelection": "\u6E05\u9664\u9009\u62E9",
  "changes.processing": "\u6B63\u5728\u5904\u7406 Git \u64CD\u4F5C\u2026",
  "changes.selectionHint": "\u52FE\u9009\u590D\u9009\u6846\u52A0\u5165\u6279\u91CF\u64CD\u4F5C\uFF0CShift \u52FE\u9009\u8FDE\u7EED\u9009\u62E9\uFF0CCtrl / \u2318 \u70B9\u51FB\u6587\u4EF6\u591A\u9009",
  "safety.preview": "\u64CD\u4F5C\u9884\u89C8",
  "safety.checking": "\u6B63\u5728\u6BD4\u8F83\u5206\u652F\u5E76\u68C0\u67E5\u5408\u5E76\u51B2\u7A81\u2026",
  "safety.onto": "\u57FA\u4E8E",
  "safety.uniqueCommits": "\u4E2A\u72EC\u6709\u63D0\u4EA4",
  "safety.historyResult": "\u6267\u884C\u540E\u7684\u5386\u53F2\u7ED3\u6784",
  "safety.diagramHint": "\u793A\u610F\u56FE\uFF1B\u8282\u70B9\u6570\u91CF\u4E0D\u4EE3\u8868\u5B9E\u9645\u63D0\u4EA4\u6570\u91CF\u3002",
  "safety.upToDate": "\u76EE\u6807\u5206\u652F\u5DF2\u5305\u542B\u6E90\u5206\u652F\u7684\u63D0\u4EA4\uFF0C\u65E0\u9700\u5408\u5E76\u3002",
  "safety.fastForward": "\u53EF\u5FEB\u8FDB\uFF1A\u76EE\u6807\u5206\u652F\u76F4\u63A5\u79FB\u52A8\u5230\u6E90\u5206\u652F\uFF0C\u4E0D\u65B0\u589E\u5408\u5E76\u63D0\u4EA4\u3002",
  "safety.mergeHistory": "\u4FDD\u7559\u53CC\u65B9\u5386\u53F2\uFF0C\u5E76\u521B\u5EFA\u5408\u5E76\u63D0\u4EA4\u8FDE\u63A5\u4E24\u4E2A\u5206\u652F\u3002",
  "safety.rebaseHistory": "\u5C06\u88AB\u53D8\u57FA\u5206\u652F\u7684\u63D0\u4EA4\u91CD\u653E\u5230\u53E6\u4E00\u5206\u652F\u4E4B\u540E\uFF0C\u63D0\u4EA4\u7F16\u53F7\u53EF\u80FD\u6539\u53D8\u3002",
  "safety.conflict.clean": "\u5408\u5E76\u6A21\u62DF\u672A\u53D1\u73B0\u6587\u672C\u51B2\u7A81\uFF1B\u4ECD\u9700\u68C0\u67E5\u903B\u8F91\u5E76\u8FD0\u884C\u6D4B\u8BD5\u3002",
  "safety.conflict.conflicts": "\u5408\u5E76\u6A21\u62DF\u53D1\u73B0\u51B2\u7A81\uFF0C\u6267\u884C\u540E\u9700\u8981\u89E3\u51B3\u4EE5\u4E0B\u6587\u4EF6\uFF1A",
  "safety.conflict.unavailable": "\u65E0\u6CD5\u5B8C\u6210\u5408\u5E76\u6A21\u62DF\uFF08\u53EF\u80FD\u9700\u8981\u66F4\u65B0 Git\uFF09\uFF1B\u51B2\u7A81\u60C5\u51B5\u672A\u77E5\u3002",
  "safety.rebaseConflictHint": "\u4EE5\u4E0A\u4E3A\u6700\u7EC8\u5408\u5E76\u7684\u51B2\u7A81\u68C0\u67E5\u3002\u53D8\u57FA\u9010\u4E2A\u91CD\u653E\u63D0\u4EA4\uFF0C\u4ECD\u53EF\u80FD\u5728\u4E2D\u9014\u4EA7\u751F\u51B2\u7A81\u3002",
  "safety.incomingFiles": "\u6E90\u5206\u652F\u81EA\u5171\u540C\u7956\u5148\u4EE5\u6765\u4FEE\u6539\u7684\u6587\u4EF6",
  "safety.recoveryHint": "\u6267\u884C\u524D\u81EA\u52A8\u4FDD\u5B58\u53D7\u5F71\u54CD\u5206\u652F\u7684\u63D0\u4EA4\u6062\u590D\u70B9\u3002\u8BF7\u5148\u63D0\u4EA4\u6216\u6682\u5B58\u5230 Stash\uFF0C\u4FDD\u6301\u5DE5\u4F5C\u533A\u5E72\u51C0\u3002",
  "safety.cleanRequired": "\u8BF7\u5148\u63D0\u4EA4\u6216 Stash \u6240\u6709\u4FEE\u6539\uFF08\u5305\u62EC\u672A\u8DDF\u8E2A\u6587\u4EF6\uFF09\uFF0C\u518D\u6267\u884C\u6B64\u64CD\u4F5C\u3002\u6062\u590D\u70B9\u53EA\u4FDD\u5B58\u63D0\u4EA4\uFF0C\u4E0D\u4FDD\u5B58\u672A\u63D0\u4EA4\u5185\u5BB9\u3002",
  "safety.operationActive": "\u8BF7\u5148\u5B8C\u6210\u6216\u4E2D\u6B62\u5F53\u524D\u7684\u5408\u5E76\u3001\u53D8\u57FA\u6216 Cherry-pick\u3002",
  "safety.stale": "\u5206\u652F\u5DF2\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u9884\u89C8\u540E\u91CD\u8BD5\u3002",
  "safety.localRequired": "\u53D7\u5F71\u54CD\u7684\u5206\u652F\u5FC5\u987B\u662F\u672C\u5730\u5206\u652F\u3002\u8BF7\u5148\u521B\u5EFA\u6216\u9009\u62E9\u5BF9\u5E94\u7684\u672C\u5730\u5206\u652F\u3002",
  "safety.sameBranch": "\u8BF7\u5148\u5207\u6362\u5230\u6B64\u6062\u590D\u70B9\u5BF9\u5E94\u7684\u672C\u5730\u5206\u652F\u3002",
  "recovery.title": "\u6062\u590D\u4E2D\u5FC3",
  "recovery.description": "\u4FDD\u7559\u5408\u5E76\u3001\u53D8\u57FA\u548C\u63D0\u4EA4\u6574\u7406\u524D\u7684\u4F4D\u7F6E\uFF0C\u4E5F\u53EF\u624B\u52A8\u521B\u5EFA\u6062\u590D\u70B9\u3002\u6062\u590D\u53EA\u5F71\u54CD\u5F53\u524D\u672C\u5730\u5206\u652F\uFF0C\u4E0D\u4FEE\u6539\u8FDC\u7AEF\uFF1B\u6062\u590D\u524D\u4F1A\u518D\u4FDD\u5B58\u5F53\u524D\u63D0\u4EA4\u3002",
  "recovery.create": "\u4FDD\u5B58\u5F53\u524D\u6062\u590D\u70B9",
  "recovery.created": "\u6062\u590D\u70B9\u5DF2\u4FDD\u5B58",
  "recovery.empty": "\u8FD8\u6CA1\u6709\u6062\u590D\u70B9\u3002\u53EF\u4EE5\u5148\u4FDD\u5B58\u5F53\u524D\u5206\u652F\u7684\u63D0\u4EA4\u4F4D\u7F6E\u3002",
  "recovery.restore": "\u6062\u590D\u5230\u6B64\u4F4D\u7F6E",
  "recovery.confirm": "\u5C06\u672C\u5730\u5206\u652F {branch} \u4ECE {from} \u6062\u590D\u5230 {to}\uFF0C\u5E76\u540C\u6B65\u66F4\u65B0\u5DE5\u4F5C\u533A\u3002\u5F53\u524D\u63D0\u4EA4\u4F1A\u5148\u4FDD\u5B58\u4E3A\u65B0\u7684\u6062\u590D\u70B9\u3002\u6B64\u64CD\u4F5C\u4E0D\u4F1A\u63A8\u9001\u5230\u8FDC\u7AEF\u3002",
  "recovery.restored": "\u672C\u5730\u5206\u652F\u5DF2\u6062\u590D\uFF0C\u539F\u63D0\u4EA4\u5DF2\u4FDD\u7559\u4E3A\u6062\u590D\u70B9",
  "recovery.op.merge": "\u5408\u5E76\u524D",
  "recovery.op.rebase": "\u53D8\u57FA\u524D",
  "recovery.op.manual": "\u624B\u52A8\u4FDD\u5B58",
  "recovery.op.restore": "\u6062\u590D\u64CD\u4F5C\u524D",
  "explain.title": "AI \u89E3\u91CA\u53D8\u66F4",
  "explain.consent": "\u70B9\u51FB\u201C\u751F\u6210\u89E3\u91CA\u201D\u540E\uFF0C\u5C06\u4E0B\u65B9\u63D0\u4EA4\u4FE1\u606F\u4E0E\u4EE3\u7801\u5DEE\u5F02\u53D1\u9001\u5230\u5DF2\u914D\u7F6E\u7684\u6A21\u578B\u670D\u52A1\uFF1A",
  "explain.configure": "\u8BF7\u5728\u8BBE\u7F6E\u7684 AI \u914D\u7F6E\u4E2D\u542F\u7528\u517C\u5BB9\u63A5\u53E3\uFF0C\u5E76\u586B\u5199\u6A21\u578B\u3001\u5730\u5740\u548C API Key\u3002",
  "explain.settings": "\u6253\u5F00 AI \u8BBE\u7F6E",
  "explain.context": "\u67E5\u770B\u5C06\u53D1\u9001\u7684\u5185\u5BB9",
  "explain.characters": "\u5B57\u7B26",
  "explain.truncated": "\u5185\u5BB9\u5DF2\u622A\u65AD\u5230 16,000 \u5B57\u7B26\uFF0C\u89E3\u91CA\u53EA\u8986\u76D6\u6240\u5C55\u793A\u7684\u5185\u5BB9\u3002",
  "explain.generate": "\u751F\u6210\u89E3\u91CA",
  "explain.again": "\u91CD\u65B0\u751F\u6210",
  "explain.cancelled": "\u8BF7\u6C42\u5DF2\u53D6\u6D88\u6216\u8D85\u65F6\uFF0C\u53EF\u4EE5\u91CD\u65B0\u751F\u6210\u3002",
  "explain.requestFailed": "\u6A21\u578B\u8BF7\u6C42\u5931\u8D25\uFF08HTTP {status}\uFF09\uFF0C\u8BF7\u68C0\u67E5 AI \u8BBE\u7F6E\u540E\u91CD\u8BD5\u3002",
  "recovery.op.rewrite": "\u63D0\u4EA4\u6574\u7406\u524D",
  "permissions.title": "\u5DF2\u6388\u6743\u7684\u6587\u4EF6\u5939",
  "permissions.cancelled": "\u5DF2\u53D6\u6D88\u4ED3\u5E93\u8BBF\u95EE\u6388\u6743",
  "permissions.description": "\u9996\u6B21\u8BBF\u95EE\u9700\u8981\u786E\u8BA4\u3002\u64A4\u9500\u6388\u6743\u4F1A\u5173\u95ED\u5BF9\u5E94\u4ED3\u5E93\uFF0C\u4E0B\u6B21\u6253\u5F00\u65F6\u91CD\u65B0\u786E\u8BA4\u3002",
  "permissions.empty": "\u6682\u65E0\u5DF2\u6388\u6743\u7684\u6587\u4EF6\u5939",
  "permissions.revoke": "\u64A4\u9500\u6388\u6743",
  "permissions.revoked": "\u5DF2\u64A4\u9500\u6587\u4EF6\u5939\u6388\u6743",
  "permissions.failed": "\u64A4\u9500\u6388\u6743\u5931\u8D25",
  "permissions.chooseFolder": "\u8BF7\u9009\u62E9\u6587\u4EF6\u5939\uFF0C\u6216\u70B9\u51FB\u6253\u5F00\u540E\u786E\u8BA4\u8BBF\u95EE\u3002",
  "stashPreview.empty": "\u8BE5\u8D2E\u85CF\u6CA1\u6709\u53EF\u663E\u793A\u7684\u6539\u52A8\u5185\u5BB9",
  // ===== UI 波次组件层修复新增（新增键必须与 en.ts 成对出现）=====
  "sidebar.worktreeBadge": "\u5DE5\u4F5C\u6811",
  "sidebar.popAction": "\u5F39\u51FA",
  "terminal.noRepoError": "\u9519\u8BEF\uFF1A\u672A\u6253\u5F00\u4EFB\u4F55\u4ED3\u5E93",
  "terminal.doneExitZero": "\u5B8C\u6210 (\u9000\u51FA\u7801 0)",
  "yaml.modalLabel": "\u5DE5\u4F5C\u6D41\u914D\u7F6E",
  "stashPreview.title": "\u8D2E\u85CF\u9884\u89C8",
  "pr.stateOpen": "\u5F00\u542F",
  "pr.stateMerged": "\u5DF2\u5408\u5E76",
  "pr.stateClosed": "\u5DF2\u5173\u95ED",
  ...workflowZh,
  ...resilienceZh,
  ...optimizationZh,
  ...workingReviewZh
};

// src/i18n/en.ts
var en = {
  "textMenu.title": "Text actions",
  "textMenu.undo": "Undo",
  "textMenu.redo": "Redo",
  "textMenu.cut": "Cut",
  "textMenu.copy": "Copy",
  "textMenu.copyContent": "Copy displayed content",
  "textMenu.paste": "Paste",
  "textMenu.selectAll": "Select all",
  "textMenu.selectContent": "Select displayed content",
  "textMenu.failed": "Text action failed. Try the keyboard shortcut.",
  "window.controls": "Window controls",
  "window.minimize": "Minimize window",
  "window.maximize": "Maximize window",
  "window.restore": "Restore window",
  "window.close": "Close window",
  "window.statusbar": "Window status bar",
  "window.desktopOnly": "Window controls are available in the desktop app",
  "window.operationFailed": "Window action failed",
  ...commitBatchEn,
  ...uiReviewEn,
  ...remoteEn,
  ...fileTreeEn,
  ...historySearchEn,
  ...conflictBaseEn,
  ...externalToolsEn,
  ...profilesEn,
  ...bisectEn,
  ...releaseNotesEn,
  ...prReviewEn,
  ...notificationsEn,
  ...workspacesEn,
  ...repoToolsEn,
  ...submodulesEn,
  ...lfsEn,
  ...signingEn,
  ...forgeEn,
  ...reviewEn,
  "layout.pinNavigation": "Pin left navigation",
  "layout.unpinNavigation": "Unpin and hide navigation",
  "layout.pinNavigationDesc": "Keep navigation visible and remember this choice. Turn off to hide it immediately; use the top-left button to open it temporarily.",
  "composer.diffFontSize": "Code font size",
  "composer.resizeMetadata": "Resize history metadata column",
  // Desktop workflow and truthful generation status
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.loading": "Loading\u2026",
  "composer.scope": "Included in this commit",
  "composer.included": "Includes {n} files",
  "composer.excluded": "Excludes {n} unstaged files",
  "composer.stageAllHint": "Nothing is staged. Committing will stage and include all changes.",
  "composer.showFiles": "Show included files",
  "composer.hideFiles": "Hide included files",
  "composer.title": "Commit title",
  "composer.titlePlaceholder": "Describe this change briefly",
  "composer.body": "Description (optional)",
  "composer.bodyPlaceholder": "Explain why this change is needed",
  "composer.generate": "Generate message",
  "composer.generating": "Generating\u2026",
  "composer.localRules": "Local rules \xB7 No API",
  "composer.localFallback": "Local rules \xB7 API did not complete",
  "composer.configureAi": "Configure AI",
  "composer.fallbackTitle": "Used local rules",
  "composer.fallbackDesc": "The model did not complete generation. This preview uses local rules. Check your API settings or connection.",
  "composer.preview": "Preview generated message",
  "composer.keepDraft": "Keep draft",
  "composer.replaceDraft": "Replace draft",
  "composer.replaceDraftDesc": "A commit draft already exists. Replace it with the selected commit message?",
  "composer.useMessage": "Use this message",
  "composer.copyMessage": "Reuse message",
  "composer.moreOptions": "More commit options",
  "composer.amendWarning": "This rewrites the latest commit on the current branch and changes its hash. Rewriting a published commit affects collaborators; consider a new commit.",
  "composer.cancelAmend": "Cancel amend mode",
  "composer.amendPush": "Amend and push",
  "composer.scopeChanged": "Commit scope changed",
  "composer.scopeChangedDesc": "File status was refreshed. Review the included changes and try again.",
  "composer.changedFiles": "Changed files",
  "composer.commitBody": "Show full description",
  "composer.retry": "Retry",
  "composer.selectCommit": "Select a commit to inspect it",
  "composer.navigation": "Repository navigation",
  "composer.fetch": "Fetch",
  "composer.moreActions": "More repository actions",
  "composer.repositoryActions": "Repository actions",
  "composer.historyActions": "History actions",
  "composer.columns": "Columns",
  "composer.column.author": "Author",
  "composer.column.date": "Date",
  "composer.column.hash": "Commit hash",
  "composer.discardWarning": "Discard unstaged changes in this file, preserving staged content. Discarded edits cannot be restored through this app. Review the diff first.",
  "composer.discardHunkWarning": "Discard only the unstaged hunk below. Other changes remain. The discarded edits cannot be restored through this app.",
  "composer.hardResetWarning": "Uncommitted tracked-file changes will be lost. Commits after the target will be removed from this branch. This app does not provide automatic recovery.",
  "composer.deleteBranchWarning": "Delete this local branch without changing working files. Ensure its commits are merged or retained elsewhere.",
  "composer.deleteTagWarning": "Delete the local tag reference. Commits and remote tags remain.",
  "composer.deleteRemoteTagWarning": "Delete this tag from the remote repository, affecting collaborators. This app does not provide automatic recovery.",
  "composer.dropStashWarning": "Delete this stash and its saved changes. This app does not provide automatic recovery. Preview the changes first.",
  "composer.removeRemote": "Remove remote configuration",
  "composer.mergePr": "Merge pull request",
  "composer.closePr": "Close pull request",
  "composer.keyboardFiles": "Select a file",
  "composer.keyboardStage": "Stage / unstage selected file",
  "composer.keyboardMenu": "Open context menu",
  "rightPane.toggleSort": "Reverse file sort order",
  "rightPane.pathView": "Show file paths",
  "rightPane.treeView": "Group files by directory",
  "fileStatus.modified": "Modified",
  "fileStatus.added": "Added",
  "fileStatus.deleted": "Deleted",
  "fileStatus.renamed": "Renamed",
  "fileStatus.untracked": "Untracked",
  "fileStatus.conflicted": "Conflict",
  "banner.abortCherryPick": "Abort cherry-pick",
  "banner.continueCherryPick": "Continue cherry-pick",
  // ============ Common ============
  "common.loaded": "Loaded",
  "common.never": "Never",
  "common.detect": "Detect",
  "common.disconnect": "Disconnect",
  "common.connected": "Connected",
  "common.notOpen": "Not Open",
  // ============ Settings ============
  "settings.title": "Preferences",
  "settings.tab.appearance": "Appearance",
  "settings.tab.git": "Git Core",
  "settings.tab.ai": "AI Engine",
  "settings.tab.github": "GitHub Account",
  "settings.tab.shortcuts": "Shortcuts",
  "settings.panel.appearance": "Appearance & Color Theme",
  "settings.panel.git": "Git Engine & Auto Fetch",
  "settings.panel.ai": "AI Commit Message Engine",
  "settings.panel.github": "GitHub Accounts",
  "settings.panel.shortcuts": "Global Keyboard Shortcuts",
  "settings.appearance.themeLabel": "UI Color Theme",
  "settings.cursor.label": "Mouse cursor",
  "settings.cursor.description": "Applies within the app. Changes take effect and are saved immediately.",
  "settings.cursor.system": "System default (default)",
  "settings.cursor.ice": "Ice Rounded",
  "settings.cursor.systemHint": "Uses your system cursor style and size. Text editing, resizing and disabled states keep their native cursors.",
  "settings.cursor.preview": "Mouse cursor preview",
  "settings.cursor.lightPreview": "Light background",
  "settings.cursor.darkPreview": "Dark background",
  "settings.cursor.arrow": "Default arrow",
  "settings.cursor.hand": "Link pointer",
  "settings.cursor.previewHint": "Images are shown at 2\xD7 size. Move the mouse or hover a button to try the actual size.",
  "settings.appearance.theme.dark.name": "Dark",
  "settings.appearance.theme.dark.desc": "Charcoal gray, frosted glass",
  "settings.appearance.theme.light.name": "Light",
  "settings.appearance.theme.light.desc": "Neutral gray, translucent panels",
  "settings.appearance.theme.system.name": "System",
  "settings.appearance.theme.system.desc": "Follow system appearance",
  "settings.appearance.languageLabel": "Language / \u754C\u9762\u8BED\u8A00",
  "settings.appearance.languageDesc": "Switch UI display language, effective immediately",
  "settings.appearance.compact": "Compact UI",
  "settings.appearance.compactDesc": "Reduce padding and line height to show more code",
  "settings.appearance.compactOn": "Compact layout enabled",
  "settings.appearance.compactOff": "Standard layout restored",
  "settings.appearance.panelLayout": "Panel Layout",
  "settings.appearance.panelLayoutDesc": "Drag to resize the sidebar, commit panel and list splitters. Positions are stored locally.",
  "settings.appearance.resetLayout": "Reset Layout",
  "settings.appearance.resetLayoutToast": "Panel widths restored to defaults",
  "settings.git.cliPathLabel": "System Git CLI Executable Path",
  "settings.git.cliPathPlaceholder": "e.g. git or C:\\Program Files\\Git\\bin\\git.exe",
  "settings.git.versionLabel": "Detected system Git version:",
  "settings.git.autoFetchLabel": "Background Auto Fetch",
  "settings.git.autoFetch.every5": "Every 5 minutes",
  "settings.git.autoFetch.every10": "Every 10 minutes (recommended)",
  "settings.git.autoFetch.every30": "Every 30 minutes",
  "settings.git.autoFetchDesc": "Runs git fetch silently in the background to keep Ahead/Behind counts up to date.",
  "settings.git.autoFetchToast": "Auto fetch interval set",
  "settings.ai.strategyLabel": "AI Commit Message Strategy",
  "settings.ai.builtin.name": "Local rules",
  "settings.ai.builtin.desc": "No API key required. Generates a message from file changes and diff excerpts without calling an external model.",
  "settings.ai.api.name": "Custom LLM API",
  "settings.ai.api.desc": "Supports Chat Completions, Responses, and Anthropic Messages for commit messages and change explanations.",
  "settings.ai.protocol": "API protocol",
  "settings.ai.protocolHint": "Choose a protocol your service supports and enter its endpoint and model. Switching protocols preserves your settings.",
  "settings.ai.needModel": "Enter a model name",
  "settings.ai.endpoint": "API Endpoint (Base URL)",
  "settings.ai.endpointHint": "Enter a base URL or a full API URL. The endpoint suffix is handled automatically without duplication.",
  "settings.ai.testTimeout": "Connection test timed out. Check the endpoint and network, or try again later.",
  "err.aiInvalidResponse": "The service returned an invalid response. Full raw content follows:",
  "settings.ai.model": "Model Name",
  "settings.ai.testBtn": "Test Connection",
  "settings.ai.testing": "Testing...",
  "settings.ai.apiKeyLabel": "API Key",
  "settings.github.notConnected": "GitHub Account Not Connected",
  "settings.github.notConnectedDesc": "Sign in via secure OAuth to view Actions and PRs",
  "settings.github.login": "Sign in to GitHub",
  "settings.github.disconnectToast": "GitHub account disconnected",
  "settings.github.accountsTitle": "Connected accounts",
  "settings.github.currentBadge": "Current",
  "settings.github.switchTo": "Switch",
  "settings.github.removedToast": "Disconnected account {login}",
  // ============ Header ============
  "header.login": "Sign In",
  "header.repository": "repository",
  "header.branch": "branch",
  "header.undo": "Undo last commit",
  "header.redo": "Restore undone commit",
  "header.pull": "Pull",
  "header.push": "Push",
  "header.branchAction": "Branch",
  "header.stash": "Stash",
  "header.pop": "Apply and remove stash",
  "header.terminal": "Git console",
  "header.actions": "Actions",
  "header.search": "Search",
  "header.undoTooltip": "Undo latest commit (git reset --soft HEAD~1)",
  "header.undoTooltipEmpty": "No commits to undo on this branch",
  "header.redoTooltipPrefix": "Redo and restore commit",
  "header.redoTooltipEmpty": "Nothing to redo (Redo)",
  "header.pullTooltip": "Fetch latest commits from remote (git pull)",
  "header.pullMenu": "Pull (git pull)",
  "header.pullRebase": "Pull with Rebase",
  "header.fetchAll": "Fetch all remotes (git fetch --all)",
  "header.pushTooltip": "Push local commits to remote (git push)",
  "header.branchTooltip": "Create new branch (git branch)",
  "header.stashTooltip": "Stash uncommitted changes (git stash)",
  "header.stashTooltipEmpty": "No working changes to stash",
  "header.popTooltip": "Restore latest stash",
  "header.popTooltipEmpty": "No stashes available",
  "header.terminalTooltip": "Open the Git command console (Ctrl+`). Use the system terminal for other commands.",
  "header.morePullOptions": "More pull options",
  "header.repoMenu.current": "Current Repository",
  "header.repoMenu.openOther": "Open another local repository...",
  "header.repoMenu.recent": "Recently Opened",
  "header.repoMenu.switchedToast": "Switched to repository",
  "header.branchMenu.searchPlaceholder": "Search and switch branches...",
  "header.branchMenu.local": "Local Branches",
  "header.branchMenu.noMatch": "No matching branches",
  "header.branchMenu.create": "Create new branch...",
  "header.branchMenu.head": "HEAD",
  "header.expandLeftSidebar": "Expand left sidebar",
  "header.collapseLeftSidebar": "Collapse left sidebar",
  "header.expandRightPane": "Expand commit inspector",
  "header.collapseRightPane": "Collapse commit inspector",
  // ============ Welcome ============
  "welcome.title": "AuuGit",
  "welcome.tagline": "A lightweight, modern, beautiful and blazing-fast desktop Git client & GitHub developer dashboard.",
  "welcome.openRepo": "Open Local Repository",
  "welcome.openRepoDesc": "Browse and load an existing project",
  "welcome.cloneRepo": "Clone Remote Repository",
  "welcome.cloneRepoDesc": "Clone from GitHub or URL",
  "welcome.initRepo": "New Local Repository",
  "welcome.initRepoDesc": "Initialize a brand-new Git repository",
  "welcome.recent": "Recently Used Projects",
  "welcome.rightPane.title": "No Repository Selected",
  "welcome.rightPane.desc": "Open a Git repository from the sidebar or main view to browse history and working changes.",
  "welcome.status.ready": "Ready - No Git repository loaded",
  // ============ Sidebar ============
  "sidebar.changes": "Working Changes",
  "sidebar.review": "History \xB7 Checkpoint review",
  "sidebar.changes.clean": "Clean",
  "sidebar.history": "History & Graph",
  "sidebar.pullRequests": "Pull Requests",
  "sidebar.actions": "GitHub Actions",
  "sidebar.viewing": "Viewing",
  "sidebar.commits": "commits",
  "sidebar.diagnose": "Diagnose",
  "sidebar.filterPlaceholder": "Filter (Ctrl+Alt+F)...",
  "sidebar.local": "LOCAL",
  "sidebar.remote": "REMOTE",
  "sidebar.tags": "TAGS",
  "sidebar.stashes": "STASHES",
  "sidebar.mergeInto": "Merge into current branch",
  "sidebar.newTag": "New Tag",
  "sidebar.pushAllTags": "Push all tags to remote (git push --tags)",
  "sidebar.stashChanges": "Stash Changes",
  "sidebar.noLocalBranches": "No local branches",
  // ============ Right Pane ============
  "rightPane.inspector": "Review and commit",
  "rightPane.filesChanged": "file(s) changed",
  "rightPane.staged": "staged",
  "rightPane.path": "Path",
  "rightPane.tree": "Tree",
  "rightPane.noPendingChanges": "No pending file changes",
  "rightPane.commitMessage": "Commit Message",
  "rightPane.recomposeAi": "Generate message",
  "rightPane.messagePlaceholder": "Describe your changes (Ctrl + Enter to commit)...",
  "rightPane.amend": "Amend last commit",
  "rightPane.commitAmend": "Amend Commit",
  "rightPane.stageAllCommit": "Stage All & Commit",
  "rightPane.filesSuffix": "file(s)",
  "rightPane.commit": "Commit",
  "rightPane.commitPush": "Commit & Push",
  "rightPane.stageAllCommitPush": "Stage All, Commit & Push",
  "rightPane.noFileSelected": "No file selected",
  "rightPane.noFileSelectedDesc": "Select a file on the left to compare",
  "rightPane.changes": "Changes",
  // ============ Status Bar ============
  "status.ready": "Ready - No Git repository loaded",
  "status.gitReady": "Git Ready",
  // ============ Working Changes ============
  "changes.empty": "Working tree is clean",
  "changes.emptyDesc": "No uncommitted changes or untracked files.",
  "changes.section.staged": "Staged",
  "changes.section.unstaged": "Unstaged Changes",
  "changes.untracked": "Untracked",
  "changes.stageAll": "Stage All",
  "changes.unstageAll": "Unstage All",
  "changes.stageAllToast": "All changes staged",
  "changes.unstageAllToast": "All staging cleared",
  "changes.discardConfirmPrefix": "Discard all unstaged changes of",
  "changes.discardConfirm": "? This action cannot be undone!",
  "changes.discarded": "File restored",
  "changes.discardFailed": "Restore failed",
  "changes.stagedToast": "Staged",
  "changes.stageFailed": "Stage failed",
  "changes.unstagedToast": "Unstaged",
  "changes.unstageFailed": "Unstage failed",
  "changes.tracked": "Now tracking",
  "changes.trackedFailed": "Track failed",
  "changes.resolved": "Marked as resolved",
  "changes.resolvedFailed": "Mark resolve failed",
  // ============ Right Pane extras ============
  "rightPane.commitDetails": "Commit Details",
  "rightPane.operationFailed": "Operation failed",
  "rightPane.copyHash": "Commit hash copied",
  "rightPane.copyHashTitle": "Click to copy full hash",
  "rightPane.aiReorganize": "Copy this commit message to your workspace draft",
  "rightPane.extractedToChanges": "Message extracted to working changes",
  "rightPane.sortAsc": "Sort ascending",
  "rightPane.sortDesc": "Sort descending",
  "rightPane.loadingChanges": "Loading changed files...",
  "rightPane.noFileChanges": "No file changes in this commit",
  "rightPane.viewDiffHint": "Click to view diff",
  "rightPane.closePreview": "Close preview",
  "rightPane.loadingDiff": "Loading diff...",
  "rightPane.noTextDiff": "No text diff or binary file",
  "rightPane.diffTruncated": "Showing first 100 diff lines only",
  "rightPane.checksPass": "passed",
  "rightPane.noChecks": "No checks configured or running",
  "rightPane.aiGenHint": "Generate a preview using only changes included in this commit.",
  "rightPane.aiSuccessLlm": "AI (LLM) commit message generated",
  "rightPane.aiSuccessBuiltin": "Commit message generated by local rules",
  "rightPane.aiFailed": "Generation failed",
  "rightPane.aiFailedDesc": "Unable to analyze files to generate a message",
  "rightPane.noRepoTitle": "No repository open",
  "rightPane.noRepoDesc": "Open a Git repository first",
  "rightPane.noChangesTitle": "No changed files",
  "rightPane.noChangesDesc": "No working changes for AI to analyze",
  "rightPane.needCommitMessage": "Commit message required",
  "rightPane.needCommitMessageDesc": "Commit message cannot be empty",
  "rightPane.nothingToCommit": "Nothing to commit",
  "rightPane.nothingToCommitDesc": "No changes in the working tree",
  "rightPane.autoStaging": "Auto-staging all working changes...",
  "rightPane.amendSuccess": "Last commit amended",
  "rightPane.commitSuccess": "Commit created successfully!",
  "rightPane.pushing": "Pushing local commits to remote (git push)...",
  "rightPane.pushSuccess": "Pushed to remote successfully",
  "rightPane.pushFailed": "Push failed",
  "rightPane.commitFailed": "Commit failed",
  // ============ Working Changes extras ============
  "changes.conflictBadge": "Unresolved conflict markers",
  "changes.conflict": "Conflict",
  "changes.copiedPath": "File path copied",
  "changes.quickStashMsg": "Quick stash",
  "changes.stashSuccess": "Stashed",
  "changes.stashSuccessDesc": "Changes saved to the stash stack",
  "changes.stashFailed": "Stash failed",
  "changes.quickStashTitle": "Quick stash current changes and clean the working tree",
  "changes.stash": "Stash",
  "changes.unstageTitle": "Unstage",
  "changes.stageAllSection": "Stage All",
  "changes.unstageAllSection": "Unstage All",
  "changes.addAllSection": "Add All",
  "changes.addAllToast": "All untracked files added",
  "changes.openConflictTool": "Open conflict workbench",
  "changes.takeOurs": "Take current change (Ours)",
  "changes.tookOurs": "Applied current version",
  "changes.takeTheirs": "Take incoming change (Theirs)",
  "changes.tookTheirs": "Applied incoming version",
  "changes.resetMarkers": "Reset to conflict markers",
  "changes.markersReset": "Conflict markers restored",
  "changes.resetFailed": "Reset failed",
  "ignore.title": "Ignore\u2026",
  "ignore.manage": "Ignore rules\u2026",
  "ignore.selected": "{n} untracked files selected",
  "ignore.destination": "Save to",
  "ignore.shared": "Shared repository rules (.gitignore)",
  "ignore.local": "Only this local repository (.git/info/exclude)",
  "ignore.sharedHint": "Commit .gitignore to share these rules with your team.",
  "ignore.localHint": "These rules stay in this repository\u2019s local Git metadata.",
  "ignore.range": "Ignore scope",
  "ignore.mode.file": "Only selected files",
  "ignore.mode.typeHere": "Same file types in these directories",
  "ignore.mode.typeTree": "Same file types in these directories and descendants",
  "ignore.mode.typeAll": "Same file types throughout the repository",
  "ignore.mode.directory": "Entire containing directories",
  "ignore.mode.custom": "Custom rules",
  "ignore.hint.file": "Match only the complete paths of the selected files.",
  "ignore.hint.typeHere": "Match the extensions shown below, excluding subdirectories.",
  "ignore.hint.typeTree": "Match the extensions shown below in all descendant directories.",
  "ignore.hint.typeAll": "Match the extensions shown below in every directory in the repository.",
  "ignore.hint.directory": "Ignore the containing directories and all their contents.",
  "ignore.editor": "Edit rules",
  "ignore.rules": "Rules to add (one per line)",
  "ignore.loading": "Checking rules and affected files\u2026",
  "ignore.affected": "{n} current untracked files will be ignored",
  "ignore.showFiles": "Show file list",
  "ignore.tracked": "{n} tracked files also match; they will remain tracked",
  "ignore.exceptions": "{n} selected paths will remain visible. Check the rules and nested exceptions.",
  "ignore.previewHint": "Preview uses current files and repository rules. Future files will also match these rules. Tracked files are unaffected.",
  "ignore.checkPath": "Check a file path",
  "ignore.check": "Check saved rules",
  "ignore.checkHint": "Enter a repository-relative path. This checks saved Git rules, excluding unsaved edits.",
  "ignore.notIgnored": "No matching ignore rule.",
  "ignore.save": "Save rules",
  "ignore.add": "Add ignore rules",
  "ignore.saved": "Ignore rules saved",
  "ignore.undo": "Undo",
  "ignore.undone": "Rule changes undone",
  "ignore.undoFailed": "Unable to undo. Rules may have changed; check the ignore rules editor.",
  "ignore.changed": "Rules changed on disk. Reload before saving; reloading discards your current edits.",
  "ignore.reload": "Reload rules",
  "ignore.verifyWarning": "Git reports {n} matching files are still visible. Check the ignore rules.",
  "ignore.verifyFailed": "Rules were saved, but Git verification failed. Refresh to check the result.",
  "worktree.title": "Manage worktrees\u2026",
  "worktree.description": "Each worktree has its own working directory. Opening an occupied branch switches to that directory and preserves changes in the current one.",
  "worktree.existing": "Existing worktrees",
  "worktree.refresh": "Refresh list",
  "worktree.loading": "Loading worktrees\u2026",
  "worktree.bare": "Bare repository",
  "worktree.detached": "Detached HEAD",
  "worktree.main": "Main worktree",
  "worktree.current": "Current directory",
  "worktree.locked": "Locked",
  "worktree.unavailable": "Directory unavailable. Check the disk or path.",
  "worktree.open": "Open worktree",
  "worktree.create": "Create worktree",
  "worktree.created": "Worktree created",
  "worktree.branchMode": "Branch mode",
  "worktree.newBranch": "Create a new branch",
  "worktree.useExisting": "Use an existing unoccupied branch",
  "worktree.branchName": "Branch name",
  "worktree.base": "Starting revision",
  "worktree.pickFree": "Select a branch not used by a worktree",
  "worktree.path": "New working directory (absolute path)",
  "worktree.openAfter": "Open this worktree after creating it",
  "worktree.invalidPath": "Enter a valid absolute path for the new working directory.",
  "worktree.invalidBranch": "Enter a valid branch name or starting revision.",
  "worktree.inUse": "This branch is in use by a worktree. Open its directory first: {path}",
  "changes.opFailed": "Operation failed",
  "changes.discardTitle": "Discard Changes",
  "changes.stageTitle": "Stage this file",
  "changes.resolvedTitle": "All conflicts resolved, stage this file",
  "changes.trackStageTitle": "Track & Stage",
  "changes.resizeHint": "Drag to resize the changes list, double-click to reset",
  "changes.copyPath": "Copy path",
  "changes.stagedSuffix": "(staged)",
  "changes.resolveConflict": "Resolve Conflict",
  "changes.viewDiff": "View Diff",
  "changes.unstageOrStage": "Unstage",
  "changes.stageThisFile": "Stage this file",
  "changes.emptyDiffUntracked": "No text diff (the file may be empty or only metadata changed)",
  // ============ Header extras ============
  "header.themeSwitchedDark": "Switched to dark theme",
  "header.themeSwitchedLight": "Switched to light theme",
  "header.fetching": "Fetching from remote (git fetch)...",
  "header.fetchFailed": "Fetch failed",
  "header.fetchDone": "Fetched latest changes (Fetch completed)",
  "header.pulling": "Pulling from remote (git pull)...",
  "header.pulled": "Latest commits pulled",
  "header.pullFailed": "Pull failed",
  "header.pushing": "Pushing local commits to remote (git push)...",
  "header.pushed": "Pushed to remote successfully",
  "header.pushFailed": "Push failed",
  "header.morePushOptions": "More push options",
  "header.forcePush": "Force Push (--force-with-lease)",
  "header.forcePushConfirm": "Force push? The remote branch will be overwritten by your local commits (--force-with-lease only applies if nobody else pushed in the meantime). This may affect collaborators \u2014 use with care!",
  "header.undoing": "Safely undoing latest commit (git reset --soft HEAD~1)...",
  "header.undoFailed": "Undo failed",
  "header.redoCannot": "Cannot redo",
  "header.redoBelongsTo": "Commit belongs to branch",
  "header.redoing": "Redoing commit",
  "header.redone": "Commit restored successfully",
  "header.redoFailed": "Redo failed",
  "header.stashed": "Working changes stashed (Stash)",
  "header.popDone": "Latest stash restored to working tree (Stash Pop)",
  "header.popFailed": "Stash pop failed",
  "header.terminalOpened": "Embedded terminal opened",
  "header.terminalClosed": "Embedded terminal closed",
  "header.closeRepoTab": "Close repository tab",
  "header.loggedInAs": "Signed in",
  "header.signGithubTooltip": "Sign in to GitHub",
  "header.rebasePulling": "Pulling with rebase (git pull --rebase)...",
  "header.rebasePulled": "Pull with rebase completed",
  "header.rebasePullFailed": "Pull with rebase failed",
  "header.switchedToBranch": "Switched to branch",
  "header.switchBranchFailed": "Branch switch failed",
  "header.noMatchBranches": "No matching branches",
  "header.currentHead": "Current HEAD",
  // ============ Command palette extras ============
  "palette.group.git": "Git Operations",
  "palette.group.settings": "System & Theme",
  "palette.group.repos": "Repositories",
  "palette.switchedToDark": "Switched to dark mode",
  "palette.switchedToLight": "Switched to light mode",
  // ============ Sidebar extras ============
  "sidebar.ctx.checkedOut": "Checked out",
  "sidebar.ctx.checkout": "Checkout branch",
  "sidebar.ctx.switchFailed": "Checkout failed",
  "sidebar.ctx.mergeIntoCurrent": "Merge into",
  "sidebar.ctx.rebaseCurrentOnto": "Rebase current branch onto",
  "sidebar.ctx.newBranchFromHere": "Create new branch from here...",
  "sidebar.ctx.pushToRemote": "Push to remote",
  "sidebar.ctx.pushingBranch": "Pushing branch",
  "sidebar.ctx.pushBranchDone": "pushed successfully",
  "sidebar.ctx.pushBranchFailed": "Push failed",
  "sidebar.ctx.copyBranchName": "Copy branch name",
  "sidebar.ctx.branchCopied": "Branch name copied to clipboard",
  "sidebar.ctx.cannotDeleteCurrent": "Cannot delete the checked-out branch",
  "sidebar.ctx.deleteBranch": "Delete branch",
  "sidebar.ctx.deleteBranchConfirm": "Delete local branch",
  "sidebar.ctx.branchDeleted": "Branch deleted",
  "sidebar.ctx.deleteBranchFailed": "Branch deletion failed",
  "sidebar.ctx.checkoutTrackLocal": "Checkout & track locally",
  "sidebar.ctx.remoteCheckedOut": "Remote-tracking branch checked out",
  "sidebar.ctx.remoteCheckedOutTracked": "Checked out with tracking",
  "sidebar.ctx.remoteCheckoutFailed": "Remote checkout failed",
  "sidebar.ctx.rebaseCurrentOntoRemote": "Rebase current branch onto this remote branch...",
  "sidebar.ctx.copyRemoteBranchName": "Copy remote branch name",
  "sidebar.ctx.locatedCommit": "Located branch commit",
  "sidebar.ctx.locatedRemoteCommit": "Located remote branch commit",
  "sidebar.ctx.checkoutToLocal": "Checkout to local",
  "sidebar.ctx.noRemoteTracking": "No remote-tracking branches",
  "sidebar.ctx.checkoutTag": "Checkout this tag",
  "sidebar.ctx.tagCheckedOut": "Checked out at tag",
  "sidebar.ctx.tagCheckoutFailed": "Tag checkout failed",
  "sidebar.ctx.newBranchFromTag": "Create new branch from tag...",
  "sidebar.ctx.pushTag": "Push this tag to remote...",
  "sidebar.ctx.tagPushed": "Tag pushed to remote",
  "sidebar.ctx.tagPushFailed": "Tag push failed",
  "sidebar.ctx.copyTagName": "Copy tag name",
  "sidebar.ctx.tagNameCopied": "Tag name copied",
  "sidebar.ctx.deleteLocalTag": "Delete local tag",
  "sidebar.ctx.deleteTagConfirm": "Delete tag",
  "sidebar.ctx.tagDeleted": "Tag deleted",
  "sidebar.ctx.deleteTagFailed": "Tag deletion failed",
  "sidebar.ctx.deleteRemoteTag": "Delete remote tag",
  "sidebar.ctx.deleteRemoteTagConfirm": "Delete remote tag",
  "sidebar.ctx.deleteRemoteTagConfirmSuffix": "This action cannot be undone!",
  "sidebar.ctx.remoteTagDeleted": "Remote tag deleted",
  "sidebar.ctx.deleteRemoteTagFailed": "Remote tag deletion failed",
  "sidebar.ctx.applyStash": "Apply Stash",
  "sidebar.ctx.stashApplied": "Stash applied",
  "sidebar.ctx.stashApplyFailed": "Stash apply failed",
  "sidebar.ctx.popStash": "Pop Stash",
  "sidebar.ctx.stashPopped": "Stash popped and applied",
  "sidebar.ctx.dropStash": "Drop Stash",
  "sidebar.ctx.dropStashConfirm": "Drop stash",
  "sidebar.ctx.stashDropped": "Stash dropped",
  "sidebar.ctx.dropFailed": "Drop failed",
  "sidebar.tagCreated": "Tag created successfully",
  "sidebar.tagCreateFailed": "Tag creation failed",
  "sidebar.tagDeleted": "Tag deleted",
  "sidebar.tagDeleteFailed": "Tag deletion failed",
  "sidebar.aiAssistant": "Shortcuts to commit messages and repository diagnostics. Message generation uses local rules or your configured model.",
  "sidebar.quickActions": "Quick Actions",
  "sidebar.switchedToChanges": "Switched to Working Changes. Use AI to draft commit messages.",
  "sidebar.healthDiagnose": "Repository health diagnosis",
  "sidebar.mergeBranchTitle": "Merge Branch",
  "sidebar.rebaseBranchTitle": "Rebase Branch",
  "sidebar.newBranchTitle": "New Branch",
  "sidebar.mergeXToCurrent": "Merge into current branch",
  "sidebar.rebaseOnto": "Rebase current branch onto",
  "sidebar.viewRemoteBranch": "View remote branch",
  "sidebar.viewTag": "Tag",
  "sidebar.rightClickForActions": "Right-click for actions",
  "sidebar.viewAllPrs": "View all PRs on GitHub",
  "sidebar.noOpenPrs": "No open Pull Requests",
  "sidebar.pushingAllTags": "Pushing all tags to remote...",
  "sidebar.pushedAllTags": "All tags pushed to remote",
  "sidebar.pushAllTagsFailed": "Failed to push all tags",
  "sidebar.tagNamePlaceholder": "Tag name (e.g. v1.0.0)",
  "sidebar.tagAnnotationPlaceholder": "Annotation (optional)",
  "sidebar.createTag": "Create Tag",
  "sidebar.deleteTagTitle": "Delete this tag",
  "sidebar.noTags": "No tags",
  "sidebar.stashedToast": "Changes stashed",
  "sidebar.stashNotePlaceholder": "Stash note (optional)",
  "sidebar.doStash": "Stash",
  "sidebar.rightClickMore": "Right-click for more actions",
  "sidebar.popHere": "Pop here",
  "sidebar.popApplied": "Stash popped and applied",
  "sidebar.popFailed": "Pop failed",
  "sidebar.dropTitle": "Drop this stash",
  "sidebar.noStashes": "No stashes",
  "sidebar.currentBranch": "current branch",
  "header.fetchQuietDone": "Remote updated",
  "header.fetchQuietDesc": "Local refs and Ahead/Behind status refreshed",
  "header.undone": "Commit undone",
  "header.undoneDesc": "Changes safely returned to working tree/staging",
  "header.openCloneTooltip": "Open or clone a local repository (Ctrl+O)",
  "header.toggleThemeTooltip": "Toggle color mode",
  "header.openSettingsTooltip": "Open settings",
  "header.actionsDashboardTooltip": "GitHub Actions CI dashboard",
  "header.searchTooltip": "Global command search (Ctrl+K)",
  "common.none": "None",
  "header.localBranches": "Local Branches",
  "header.createBranchShort": "Create new branch...",
  "palette.prCenter": "GitHub Pull Requests Review Center",
  "palette.actionsDash": "GitHub Actions Developer Dashboard",
  "palette.gitFetch": "Fetch from remote (Git Fetch)",
  "palette.gitPull": "Pull from remote (Git Pull)",
  "palette.gitPush": "Push local commits (Git Push)",
  "palette.group.branches": "Switch Branch",
  "palette.group.tags": "Tags",
  "sidebar.popFailedAlt": "Stash pop failed",
  "sidebar.clean": "Clean",
  "sidebar.aiCommitTitle": "Write a commit message",
  "sidebar.aiCommitDesc": "Open the workspace to review included changes and generate a message",
  "sidebar.healthDiagnoseDesc": "Detect unpushed branches and potential conflicts",
  "sidebar.viewRemoteHint": "Drag onto another branch to merge/rebase, right-click for actions",
  "palette.darkMode": "Switch to Dark Mode",
  "palette.lightMode": "Switch to Light Mode",
  "palette.systemMode": "Follow System Appearance",
  "palette.systemModeRestored": "Restored to follow system appearance",
  "palette.connectGithub": "Connect / configure GitHub account & token...",
  "palette.openPreferences": "Open Preferences",
  "sidebar.newTagTitle": "New Tag (e.g. v1.0.0)",
  "sidebar.stashWorkingChanges": "Stash working changes",
  "diff.unified": "Unified",
  "diff.split": "Split",
  "sidebar.mode.list": "Branches",
  "sidebar.mode.agents": "Repository tools",
  "history.title": "History & Git Graph",
  "history.uncommitted": "uncommitted changes",
  "history.searchPlaceholder": "Search subject, author or hash...",
  "history.noMatch": "No matching commits",
  "history.wipToast": "Jumped to uncommitted working changes (WIP)",
  "history.wipTitle": "Click to review and commit working changes",
  "history.wipLabel": "Uncommitted working changes (click to inspect)",
  "history.copyHashTitle": "Click to copy hash",
  "history.copyHash": "Commit hash copied",
  "diag.failed": "Repository health diagnosis failed",
  "diag.failedDesc": "Unable to complete diagnosis. Check local Git status",
  "diag.title": "Full Repository Health Diagnosis",
  "diag.realtime": "Live analysis",
  "diag.noRepo": "No repository open",
  "diag.running": "Running full health check, analyzing conflicts and branch sync...",
  "diag.runFailed": "Diagnosis failed",
  "diag.overall": "Overall Rating",
  "diag.healthy": "Healthy",
  "diag.warning": "Issues found",
  "diag.danger": "Critical",
  "diag.score": "Health Score",
  "diag.items": "Detected Items",
  "diag.rescan": "Rescan",
  "common.ok": "OK",
  "banner.rebaseTitle": "Rebase in progress",
  "banner.mergeTitle": "Merge in progress",
  "banner.aborted": "Rebase aborted",
  "banner.mergeAborted": "Merge aborted",
  "banner.abortedDesc": "Working tree restored to the pre-operation state",
  "banner.abortFailed": "Abort failed",
  "banner.rebaseDone": "Rebase completed successfully!",
  "banner.mergeDone": "Merge commit created successfully!",
  "banner.completeFailed": "Complete failed",
  "banner.statusTitle": "Conflict Status",
  "banner.allResolved": "All conflicts marked resolved",
  "banner.pending": "Unresolved conflicts",
  "banner.filesUnit": "files",
  "banner.allResolvedDesc": "All conflicts are resolved and staged. Click complete to finish.",
  "banner.resolveHintPrefix": "Resolve conflicts in the changes list:",
  "banner.resolveHintSuffix": ". Stage them to continue.",
  "banner.andMore": "and",
  "banner.confirmAbort": "Confirm abort?",
  "banner.confirm": "Confirm",
  "banner.cancel": "Cancel",
  "banner.abortRebaseRestore": "Abort rebase and restore",
  "banner.abortMergeRestore": "Abort merge and restore",
  "banner.abortRebase": "Abort rebase",
  "banner.abortMerge": "Abort merge",
  "banner.continueRebase": "Continue to next commit",
  "banner.commitMerge": "Commit the merge",
  "banner.needStageFirst": "Stage all resolved conflict files first",
  "banner.continueBtn": "Continue (--continue)",
  "banner.finishMergeBtn": "Finish Merge Commit",
  "merge.success": "Merge completed",
  "merge.successDesc": "Merged {src} into {dst}",
  "merge.failed": "Merge failed",
  "merge.conflict": "Merge conflicts (Conflict)",
  "merge.conflictDesc": "Working tree has conflicts. Resolve them in the working changes view",
  "merge.title": "Merge Branch",
  "merge.desc": "Merge changes from the selected branch into the current branch",
  "merge.sourceLabel": "Source branch (to be merged)",
  "merge.none": "None",
  "merge.targetLabel": "Target current branch (HEAD)",
  "merge.pickSource": "Pick the source branch to merge into current",
  "merge.noBranches": "No other branches",
  "merge.remoteSuffix": "(remote)",
  "merge.noFf": "Always create a merge commit (--no-ff)",
  "merge.customMsg": "Custom merge message (optional)",
  "common.cancel": "Cancel",
  "merge.run": "Run Merge",
  "create.nameEmpty": "Branch name cannot be empty",
  "create.nameNoSpace": "Branch name cannot contain spaces",
  "create.success": "Branch {name} created!",
  "create.switched": "Switched to the new branch",
  "create.stayed": "Stayed on current branch",
  "create.failed": "Branch creation failed",
  "create.title": "New Git Branch",
  "create.descPrefix": "Create a new branch in {repo}",
  "create.nameLabel": "Branch Name",
  "create.baseLabel": "Base Source",
  "create.base.current": "Current branch HEAD",
  "create.base.branch": "Another branch",
  "create.base.commit": "Specific commit",
  "create.fromCurrentPrefix": "Will check out from the latest commit of",
  "create.fromCurrentSuffix": "",
  "create.currentSuffix": "(current)",
  "create.checkoutAfter": "Checkout new branch after creation",
  "create.run": "Create Branch",
  "rebase.success": "Rebase completed",
  "rebase.successDesc": "Rebased {cur} onto {onto}",
  "rebase.failed": "Rebase failed",
  "rebase.conflict": "Rebase conflicts (Conflict)",
  "rebase.conflictDesc": "Resolve conflict files in the working tree first, then click Continue",
  "rebase.continueDone": "Rebase continued successfully!",
  "rebase.continueFailed": "Continue rebase failed",
  "rebase.aborted": "Rebase aborted",
  "rebase.abortedDesc": "Working tree restored to pre-rebase state",
  "rebase.abortFailed": "Abort rebase failed",
  "rebase.title": "Rebase Branch",
  "rebase.desc": "Replay current branch commits on top of the target branch",
  "rebase.warn": "Rebase rewrites the commit history of the current branch. Only rebase local unpublished or feature branches; avoid rebasing shared mainline branches.",
  "rebase.conflictState": "Rebase is in a conflict state, choose an action:",
  "rebase.abort": "Abort (--abort)",
  "rebase.continue": "Conflicts resolved, continue (--continue)",
  "rebase.currentLabel": "Current branch (being rebased)",
  "rebase.ontoLabel": "Target base branch (Onto)",
  "rebase.pickUpstream": "Pick the target branch as new base (Upstream)",
  "rebase.noBranches": "No other branches",
  "rebase.remoteSuffix": "(remote)",
  "rebase.run": "Start Rebase",
  "drag.checkingOut": "Checking out target branch",
  "drag.merging": "Merging {src} into {dst}...",
  "drag.mergeDone": "Merged!",
  "drag.rebasing": "Rebasing {src} onto {dst}...",
  "drag.rebaseDone": "Rebased!",
  "drag.failedLog": "Drag operation failed:",
  "drag.failed": "Operation incomplete. There may be conflicts, check the working tree",
  "drag.opIncomplete": "Operation incomplete",
  "drag.title": "Branch Drag Quick Actions",
  "drag.pickOp": "Choose the Git operation for these two branches",
  "drag.source": "Source",
  "drag.target": "Target",
  "drag.merge": "Merge",
  "drag.recommended": "recommended",
  "drag.mergeDescPrefix": "Merge",
  "drag.mergeDescMid": "into",
  "drag.rebaseTarget": "Rebase Target onto Source",
  "drag.rebaseDescSuffix": "after",
  "drag.rebaseSource": "Rebase Source onto Target",
  "drag.confirm": "Confirm",
  "pr.fetching": "Fetching PR #{n} commits from GitHub...",
  "pr.fetched": "PR #{n} remote branch fetched!",
  "pr.switchedTo": "Local branch switched to",
  "pr.checkoutFailed": "PR checkout failed",
  "pr.count": "requests",
  "pr.filterOpen": "Open",
  "pr.filterClosed": "Merged/Closed",
  "pr.filterAll": "All",
  "pr.searchPlaceholder": "Search title, author or number...",
  "pr.refreshTitle": "Refresh PR list",
  "pr.noMatch": "No matching Pull Requests",
  "pr.resizeHint": "Drag to resize the PR list, double-click to reset",
  "pr.pickToReview": "Select a Pull Request on the left to review",
  "pr.mergeInto": "wants to merge into",
  "pr.openedBy": "opened by @{user}",
  "pr.checkoutTitle": "Create and checkout pr-{n} locally",
  "pr.checkingOut": "Checking out...",
  "pr.checkout": "Checkout PR branch",
  "pr.openInBrowser": "Open GitHub PR in browser",
  "pr.viewOnWeb": "View on web",
  "pr.reviewStatus": "Review Status",
  "pr.approved": "Approved",
  "pr.changesRequested": "Changes Requested",
  "pr.commented": "Commented",
  "pr.pendingReview": "Pending Review",
  "pr.checks": "CI / CD Checks",
  "pr.checksPass": "passed",
  "pr.checksFailed": "failed",
  "pr.noChecks": "No checks configured or running",
  "pr.diffStats": "Diff Stats",
  "pr.filesCount": "files",
  "pr.body": "Pull Request Description",
  "pr.noBody": "This Pull Request has no description.",
  "actions.title": "GitHub Actions Dashboard",
  "actions.connectedAs": "Connected",
  "actions.connectReal": "Connect GitHub Account",
  "actions.refresh": "Refresh",
  "actions.refreshing": "Refreshing\u2026",
  "actions.workflows": "Workflows",
  "actions.allWorkflows": "All Workflows",
  "actions.viewYaml": "View YAML source",
  "actions.dispatch": "Run workflow (Dispatch)",
  "actions.resizeHint": "Drag to resize the workflow list, double-click to reset",
  "actions.runHistory": "Workflow Runs",
  "actions.cancelRun": "Cancel run",
  "actions.cancelRunConfirmTitle": "Cancel this run?",
  "actions.cancelRunConfirmDesc": "This terminates the in-progress CI run. Completed steps will not be rolled back; you can re-run the whole workflow afterwards.",
  "actions.rerunFailed": "Re-run failed jobs",
  "actions.rerunAll": "Re-run all jobs",
  "actions.autoTriggered": "Auto triggered",
  "actions.jobsTitle": "Jobs",
  "actions.pickRun": "Select a run to view jobs",
  "actions.building": "Building...",
  "actions.passed": "Passed",
  "actions.failed": "Failed",
  "actions.noJobs": "No job details",
  "actions.viewLogs": "View logs",
  "dispatch.title": "Dispatch Workflow",
  "dispatch.useFrom": "Use workflow from",
  "dispatch.currentHead": "(current HEAD)",
  "dispatch.inputs": "Custom inputs (optional)",
  "dispatch.inputsPlaceholder": "e.g. release_tag=v1.2.0 or channel=stable",
  "dispatch.config": "Workflow config",
  "dispatch.running": "Dispatching...",
  "dispatch.run": "Run Workflow",
  "logs.copied": "Full build log copied",
  "logs.toggleFullscreen": "Toggle fullscreen",
  "logs.lines": "lines",
  "logs.searchPlaceholder": "Search logs...",
  "logs.scrollToBottom": "Auto scroll to bottom",
  "logs.scroll": "Scroll",
  "logs.copyAll": "Copy all logs",
  "logs.copy": "Copy",
  "logs.loading": "Loading logs\u2026",
  "logs.waitingBadge": "Not ready",
  "logs.failed": "Unable to load logs",
  "logs.waiting": "The job is running or queued. Full logs are not ready yet.",
  "logs.waitingHint": "Checking job status every 15 seconds. Full logs load automatically when it finishes. View live logs on GitHub.",
  "logs.empty": "GitHub returned an empty log. Retry later or view it on GitHub.",
  "logs.openGitHub": "View live logs on GitHub",
  "logs.retry": "Reload logs",
  "logs.openFailed": "Unable to open the GitHub logs page",
  "logs.noMatch": "No matching log lines",
  "yaml.copied": "Workflow YAML copied",
  "yaml.copy": "Copy",
  "resolver.loadFailed": "Failed to load conflict file",
  "resolver.allResolvedToast": "All conflicts resolved!",
  "resolver.allResolvedDesc": 'Click "Save & Mark Resolved" at the top right to stage this file.',
  "resolver.allOurs": "Applied current (HEAD) for all conflicts",
  "resolver.allTheirs": "Applied incoming for all conflicts",
  "resolver.allBoth": "Kept both sides for all conflicts",
  "resolver.stageHint": 'Click "Save & Mark Resolved" to stage.',
  "resolver.oursResolved": "Applied current version and marked resolved",
  "resolver.theirsResolved": "Applied incoming version and marked resolved",
  "resolver.opFailed": "Operation failed",
  "resolver.markersResetToast": "Restored to original conflict markers",
  "resolver.resetFailed": "Reset failed",
  "resolver.savedStaged": "Conflicts resolved and staged!",
  "resolver.saveFailed": "Save failed",
  "resolver.analyzing": "Analyzing conflict code and markers...",
  "resolver.remaining": "{n} conflicts left",
  "resolver.allDone": "\u2713 All conflicts resolved",
  "resolver.prevConflict": "Previous conflict",
  "resolver.nextConflict": "Next conflict",
  "resolver.takeAllOursTitle": "Apply local change to all conflict blocks",
  "resolver.takeAllOurs": "Take all current",
  "resolver.takeAllTheirsTitle": "Apply incoming change to all conflict blocks",
  "resolver.takeAllTheirs": "Take all incoming",
  "resolver.oursFileTitle": "Use the whole current-branch file as the resolution",
  "resolver.oursFile": "Use current file",
  "resolver.theirsFileTitle": "Use the whole incoming-branch file as the resolution",
  "resolver.theirsFile": "Use incoming file",
  "resolver.resetTitle": "Restore original conflict markers",
  "resolver.resetMarkers": "Reset markers",
  "resolver.saveStageTitle": "Write the resolved file and run git add",
  "resolver.saveStage": "Save & Stage",
  "resolver.fullyResolved": "Fully resolved, stage",
  "resolver.closeTitle": "Close resolver and return to diff view",
  "resolver.successTitle": "All conflict markers eliminated!",
  "resolver.successDesc": 'Final file synthesized from your decisions. Click "Save & Stage" at the top right to write to disk and mark resolved.',
  "resolver.stageNow": "Stage Now",
  "resolver.conflictNo": "Conflict #{n}",
  "resolver.lines": "Lines {a} - {b}",
  "resolver.keepOursTitle": "Keep current branch code",
  "resolver.takeOurs": "Take current (Ours)",
  "resolver.keepTheirsTitle": "Keep incoming branch code",
  "resolver.takeTheirs": "Take incoming (Theirs)",
  "resolver.keepBothTitle": "Keep both (current first, incoming after)",
  "resolver.keepBoth": "Keep both",
  "resolver.oursHeader": "\u25C0 Current branch changes",
  "resolver.takeSegment": "Take this segment",
  "resolver.emptyLine": "<empty>",
  "resolver.baseHeader": "Common ancestor base",
  "resolver.theirsHeader": "\u25B6 Incoming branch changes",
  "auth.codeCopied": "Verification code copied to clipboard!",
  "auth.codeIs": "Code",
  "auth.oauthSuccess": "GitHub OAuth sign-in successful!",
  "auth.oauthFailedLog": "OAuth failed:",
  "auth.oauthFailed": "OAuth failed",
  "auth.incomplete": "Authorization incomplete",
  "auth.patSuccess": "GitHub developer account connected!",
  "auth.patVerifyFailed": "Token verification failed",
  "auth.authFailed": "Authentication failed",
  "auth.title": "GitHub Developer Authentication",
  "auth.boundRepo": "Currently bound repository",
  "auth.boundNone": "Connect GitHub to sync cloud Actions workflows, PRs and code review",
  "auth.logoutToast": "GitHub credentials signed out",
  "auth.logout": "Sign out",
  "auth.scopesSuffix": "scopes. Trigger GitHub Actions or browse PR details right inside the client.",
  "auth.oauthTab": "OAuth Sign-in (Recommended)",
  "auth.patTab": "Personal Access Token (PAT)",
  "auth.oauthCard.title": "Zero-config Token \xB7 Fast & Secure",
  "auth.oauthCard.desc": "Click the button below to get a one-time 8-character code and open the official GitHub authorization page. Confirm on the web page and the client completes the handshake automatically.",
  "auth.badge.repo": "\u{1F4E6} Repo sync & PR review",
  "auth.badge.actions": "\u26A1 View & trigger Actions workflows",
  "auth.badge.deviceFlow": "\u{1F6E1}\uFE0F Official GitHub Device Flow",
  "auth.gettingCode": "Requesting GitHub authorization code...",
  "auth.startOauth": "Start GitHub OAuth authorization",
  "auth.codeReady": "Code generated \xB7 Confirm on the web page",
  "auth.remaining": "Expires in",
  "auth.copyCode": "Copy verification code",
  "auth.autoCopied": "Code copied to clipboard and browser opened automatically.",
  "auth.reopenPage": "Reopen page",
  "auth.waitingConfirm": "Waiting for your confirmation on GitHub",
  "auth.pollAttempt": "poll #{n}",
  "auth.cancelOauth": "Cancel authorization",
  "auth.openGeneratePage": "Open GitHub to generate",
  "auth.patPlaceholder": "ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_...",
  "auth.patLabel": "GitHub Personal Access Token (PAT)",
  "repo.pickFolderFailed": "Failed to pick folder",
  "repo.needPath": "Enter or browse a local repository path",
  "repo.opened": "Git repository loaded",
  "repo.openFailed": "Failed to open repository",
  "repo.openFailedDesc": "Make sure the directory is a valid Git repository",
  "repo.needUrl": "Enter the remote repository URL",
  "repo.needTarget": "Specify the clone target directory",
  "repo.cloning": "Cloning remote repository (git clone)...",
  "repo.cloningDesc": "Duration depends on network and repository size",
  "repo.cloned": "Repository cloned and loaded",
  "repo.cloneFailed": "Clone failed",
  "repo.needInitPath": "Enter the directory path for the new repository",
  "repo.inited": "Git repository initialized",
  "repo.initFailed": "Init failed",
  "repo.title.open": "Open Local Git Repository",
  "repo.title.clone": "Clone from Remote (Git Clone)",
  "repo.title.init": "Initialize New Git Repository (Git Init)",
  "repo.tab.open": "Open",
  "repo.tab.clone": "Clone",
  "repo.tab.init": "Init",
  "repo.localPath": "Local repository path",
  "repo.toggleTree": "Browse in app",
  "repo.collapseTree": "Collapse tree",
  "repo.pathPlaceholder": "e.g. E:/code/auu_github_desktop",
  "repo.browseFolder": "Browse folders...",
  "repo.browse": "Browse...",
  "repo.detecting": "Detecting directory...",
  "repo.detected": "Valid Git repository detected",
  "repo.notGitRepo": "This folder exists but is not a Git repository yet.",
  "repo.initHere": "Initialize Git here in one click (git init)",
  "repo.pathMissing": "Path does not exist, please check and retry",
  "repo.recent": "Recently opened repositories",
  "repo.removeRecent": "Remove from recent list",
  "repo.openBtn": "Open Repository",
  "repo.opening": "Opening repository...",
  "repo.cloneUrl": "Remote URL (HTTPS / SSH)",
  "repo.targetDir": "Target local directory",
  "repo.cloneBranch": "Branch to clone (optional, defaults to remote default)",
  "repo.cloneBtn": "Start Clone (Git Clone)",
  "repo.cloningBtn": "Cloning, please wait...",
  "repo.initDir": "New repository local directory",
  "repo.defaultBranch": "Default branch name",
  "repo.initBtn": "Initialize (Git Init)",
  "repo.initializing": "Initializing...",
  "terminal.banner": "AuuGit embedded cyber terminal ready for Git & Shell operations.",
  "terminal.gitOnlyHint": "Tip: run Git commands in this repository, e.g. 'git status', 'git log -n 5', 'git diff'",
  "ui.dismissError": "Dismiss error",
  "terminal.resizeHint": "Drag to resize terminal height",
  "terminal.clear": "Clear",
  "terminal.openExternal": "Open in external system terminal",
  "terminal.desktopOnly": "Open an external terminal from the desktop app",
  "terminal.openFailed": "Unable to open external terminal",
  "terminal.restore": "Restore",
  "terminal.maximize": "Maximize",
  "terminal.close": "Close terminal panel",
  "terminal.running": "Running...",
  "terminal.placeholder": "Enter a git command, e.g. git status, git log -n 3 ...",
  "settings.git.detecting": "Detecting system Git version...",
  "settings.git.notFound": "No usable Git CLI found",
  "settings.git.detectFailed": "Detection failed: check the Git path setting",
  "settings.ai.builtinReady": "Local rules ready",
  "settings.ai.builtinReadyDesc": "Generation runs locally without an external model.",
  "settings.ai.needKey": "Enter the API key before testing",
  "settings.ai.testOk": "AI API connection test succeeded!",
  "settings.ai.testOkDesc": "Connected to {model}",
  "settings.ai.testFailed": "AI connection test failed",
  "settings.ai.modelPlaceholder": "e.g. deepseek-chat or gpt-4o-mini",
  "settings.github.patHintPrefix": "Tip: besides the official GitHub OAuth device flow, you can connect with a Personal Access Token containing",
  "settings.github.patHintSuffix": "scopes.",
  "settings.shortcuts.cmdPalette": "Open global command palette",
  "settings.shortcuts.push": "Push local commits to remote (Git Push)",
  "settings.shortcuts.pull": "Pull remote updates (Git Pull)",
  "settings.shortcuts.fetch": "Fetch remote changes (Git Fetch)",
  "settings.shortcuts.commit": "Commit staged files (Commit)",
  "settings.shortcuts.createBranch": "Create branch",
  "settings.shortcuts.createTag": "Create tag",
  "settings.shortcuts.toggleTerminal": "Toggle embedded terminal",
  "palette.placeholder": "Type a command, branch, tag or action (e.g. Commit, Push, CI)...",
  "palette.noMatch": "No matching commands",
  "palette.group.nav": "Navigation",
  "sidebar.noMatchBranches": "No matching local branches",
  "toast.copyErrorDetails": "Copy error details",
  "auth.scopesPrefix": "Requires",
  "auth.patScopesPrefix": "Must include",
  "auth.scopesDot": "scopes.",
  "layout.resizeLeft": "Drag to resize left sidebar, double-click to reset",
  "layout.resizeRight": "Drag to resize right panel, double-click to reset",
  "create.namePlaceholder": "e.g. feature/awesome-feature or fix/bug-123",
  "browser.loadFailed": "Failed to read directory",
  "browser.backTitle": "Go to parent directory",
  "browser.drivesTitle": "View all disk drives",
  "browser.myComputer": "My Computer (drive root)",
  "browser.selectCurrent": "Select current directory",
  "browser.scanning": "Scanning directory...",
  "browser.backToRoot": "Back to root drives",
  "browser.noSubfolders": "No subfolders in this directory",
  "browser.gitRepo": "Git repo",
  "browser.select": "Select",
  // ============ Language purity follow-up keys ============
  "rightPane.bannerFilesChanged": "file changes in working directory",
  "rightPane.viewChanges": "View Changes",
  "rightPane.commitHashLabel": "commit:",
  "rightPane.recomposeBtn": "Reuse message",
  "rightPane.authored": "authored",
  "rightPane.parentLabel": "parent:",
  "rightPane.zeroFiles": "0 files changed",
  "rightPane.statAdded": "added",
  "rightPane.statModified": "modified",
  "rightPane.statDeleted": "deleted",
  "rightPane.viewAllFiles": "View all files",
  "rightPane.collapseAll": "Collapse All",
  "rightPane.githubChecks": "GitHub Checks",
  "history.col.branchTag": "BRANCH / TAG",
  "history.col.graph": "GRAPH",
  "history.col.message": "COMMIT MESSAGE",
  "history.col.authorDate": "AUTHOR / DATE",
  "terminal.title": "Git console",
  "pr.title": "GitHub Pull Requests",
  "sidebar.gitAiAgent": "Git tools",
  "time.justNow": "just now",
  "time.minutesAgo": "{n} min ago",
  "time.hoursAgo": "{n} hours ago",
  "time.daysAgo": "{n} days ago",
  "time.locale": "en-US",
  "history.commitCount": "commits",
  "history.viewChanges": "View Changes \u2192",
  "changes.stageHunk": "Stage this hunk",
  "changes.unstageHunk": "Unstage this hunk",
  "changes.discardHunk": "Discard this hunk",
  "changes.hunkStaged": "Hunk staged",
  "changes.hunkUnstaged": "Hunk unstaged",
  "changes.hunkDiscarded": "Hunk discarded",
  "changes.hunkOpFailed": "Hunk operation failed",
  "changes.mode.diff": "Diff",
  "changes.mode.blame": "Blame",
  "changes.mode.history": "File History",
  "changes.blameEmpty": "No blame history yet (untracked or new file)",
  "changes.fileHistoryEmpty": "No commits found for this file",
  "changes.commitNotLoaded": "Commit not in loaded history \u2014 search the hash in the history view",
  "changes.loadingData": "Loading...",
  "pr.newPR": "New Pull Request",
  "pr.createTitle": "Create Pull Request",
  "pr.noRepoBound": "no repo bound",
  "pr.needLogin": "Sign in to GitHub and open a GitHub repository first",
  "pr.sourceBranch": "Source branch",
  "pr.targetBranch": "Target branch",
  "pr.titleLabel": "Title",
  "pr.titlePlaceholder": "Title, e.g. Fix login timeout",
  "pr.descLabel": "Description",
  "pr.descPlaceholder": "Describe what changed and why...",
  "pr.titleEmpty": "Title cannot be empty",
  "pr.branchMissing": "Pick both source and target branches",
  "pr.sameBranch": "Source and target branches must differ",
  "pr.loadingBase": "Loading default branch...",
  "pr.submitting": "Creating...",
  "pr.createFailed": "Failed to create",
  "pr.created": "Pull request #{n} created",
  "pr.noCommitsDiff": "Failed: source branch has no commits ahead of target, or the PR already exists",
  "pr.merge": "Merge",
  "pr.merging": "Merging...",
  "pr.mergeMethod": "Merge method",
  "pr.mergeMethod.merge": "Create merge commit",
  "pr.mergeMethod.squash": "Squash and merge",
  "pr.mergeMethod.rebase": "Rebase and merge",
  "pr.mergeTitle": "Merge pull request #{n} into the target branch",
  "pr.mergeConfirm": "Merge pull request #{n} into {base}? This writes to the remote repository.",
  "pr.mergeMerged": "Pull request #{n} merged",
  "pr.mergeNotMerged": "Pull request was not merged",
  "pr.mergeFailed": "Merge failed",
  "pr.closePR": "Close",
  "pr.closing": "Closing...",
  "pr.closeConfirmTitle": "Close this pull request without merging",
  "pr.closeConfirm": "Close pull request #{n} without merging?",
  "pr.closed": "Pull request #{n} closed",
  "pr.closeFailed": "Failed to close",
  "history.ctx.copyHash": "Copy hash",
  "history.ctx.cherryPick": "Cherry-pick this commit",
  "history.ctx.revert": "Revert this commit",
  "history.ctx.resetSoft": "Soft reset to this commit (keep changes)",
  "history.ctx.resetHard": "Hard reset to this commit (discard changes)",
  "history.cherryPicked": "Cherry-picked {h} onto current branch",
  "history.cherryPickFailed": "Cherry-pick failed",
  "history.reverted": "Created a revert commit for {h}",
  "history.revertFailed": "Revert failed",
  "history.resetDone": "Reset to {h}",
  "history.resetFailed": "Reset failed",
  "history.resetSoftConfirm": "Soft reset to {h}?\nLater commits will be undone; changes stay staged.",
  "history.resetHardConfirm": "Hard reset to {h}?\nAll later commits and uncommitted changes will be discarded permanently!",
  "ci.watching": "Pushed \u2014 watching CI checks...",
  "ci.watchingDesc": "Check the Actions page for progress later",
  "ci.passed": "All CI checks passed",
  "ci.failed": "Some CI checks failed",
  "ci.passedCount": "checks passed",
  "ci.stillRunning": "CI is still running",
  "ci.jobFallback": "Job #{id}",
  "ci.dispatchSubmitted": "Dispatch request submitted to GitHub",
  "ci.rerunRequested": "Re-run request sent",
  "ci.rerunFailed": "Re-run failed",
  "ci.cancelRequested": "Cancellation request sent",
  "ci.cancelFailed": "Failed to cancel workflow",
  // ============ Service-layer user-visible errors & diagnostics ============
  "err.gitFailed": "Git command failed (exit {c}): {m}",
  "err.unknownGit": "unknown error",
  "err.noBackendProxy": "Local backend proxy not detected \u2014 run inside the desktop app or the dev environment",
  "err.networkExec": "network or execution error",
  "err.commitEmpty": "Commit message cannot be empty",
  "err.writeFailed": "Failed to write file {p}",
  "err.prFetchFailed": "Failed to fetch PR #{n} from remote: check the remote repo and network ({m})",
  "err.ghBadCredentials": "GitHub credentials are invalid or expired (Bad credentials)",
  "err.ghAuthFailed": "GitHub authentication failed: HTTP {s}",
  "err.ghRepoInfo": "Failed to load repository info: HTTP {s}",
  "err.ghDispatch": "Failed to dispatch workflow (HTTP {s}): {m}",
  "err.ghRerun": "Failed to rerun workflow (HTTP {s})",
  "err.ghCancel": "Failed to cancel workflow run (HTTP {s})",
  "err.ghLogs": "Failed to fetch job logs (HTTP {s})",
  "err.ghYaml": "Failed to fetch workflow file (HTTP {s})",
  "err.ghNoCredentials": "GitHub returned no valid authorization credentials",
  "err.ghDeviceFailed": "Failed to request GitHub device code: {m}",
  "err.ghNoProxy": "Backend auth proxy not detected \u2014 run inside the desktop app or the dev environment",
  "err.ghDeviceHttp": "Failed to request GitHub device code (HTTP {s})",
  "err.ghNoDevice": "GitHub returned no valid device authorization payload",
  "err.ghPollFailed": "GitHub token polling error: {m}",
  "err.ghPollHttp": "GitHub token polling error (HTTP {s})",
  "err.ghCodeExpired": "The device code has expired \u2014 start the sign-in again",
  "err.ghUserDenied": "The authorization request was denied on GitHub",
  "err.ghAuthError": "Authorization error: {m}",
  "err.ghTimeout": "The authorization request timed out \u2014 try again",
  "err.aiNoFiles": "No files to commit or analyze",
  "err.aiHttp": "API request failed (HTTP {s}): {m}",
  "err.aiEmptyResponse": "API returned an empty response",
  "diag.issue.conflictTitle": "{n} unresolved merge conflicts",
  "diag.issue.conflictDesc": "Git conflict markers found in: {files}",
  "diag.issue.conflictHint": "Resolve the markers in the working tree, then git add to mark them resolved.",
  "diag.issue.rebaseTitle": "Rebase in progress",
  "diag.issue.rebaseDesc": "An unfinished rebase needs to be continued or aborted.",
  "diag.issue.rebaseHint": "Use the toolbar to run Rebase Continue or Rebase Abort.",
  "diag.issue.mergeTitle": "Merge in progress",
  "diag.issue.mergeDesc": "The merge has not been finalized with a commit.",
  "diag.issue.mergeHint": "Commit to finish the merge, or run Merge Abort to back out.",
  "diag.issue.detachedTitle": "Detached HEAD",
  "diag.issue.detachedDesc": "You are not on any named branch; new commits may become orphaned when you switch away.",
  "diag.issue.detachedHint": "Create a branch to keep the current commits.",
  "diag.issue.behindTitle": "Local branch is {n} commits behind remote",
  "diag.issue.behindDesc": "Teammates have pushed new commits that are not synced locally yet.",
  "diag.issue.behindHint": "Use the toolbar Pull button to fetch the latest updates.",
  "diag.issue.unpushedTitle": "{n} local commits have not been pushed",
  "diag.issue.unpushedDesc": "These commits exist only in your local workspace; collaborators cannot see them.",
  "diag.issue.unpushedHint": "Use the toolbar Push button to publish them.",
  "diag.issue.localOnlyTitle": "{n} local branches without an upstream",
  "diag.issue.localOnlyDesc": "These branches have no upstream tracking; clean them up if no longer needed.",
  "diag.issue.cleanTitle": "Repository looks great \u2014 no issues found",
  "diag.issue.cleanDesc": "No pending conflicts, no dangling in-progress operations, branches in sync.",
  "diag.summary.healthy": "The repository is healthy with no blocking risks.",
  "diag.summary.warning": "Some advisory items were found (e.g. behind remote or detached HEAD).",
  "diag.summary.danger": "High-risk issues found (unresolved conflicts or interrupted operations) \u2014 handle them first.",
  "err.dirPickerFailed": "Failed to open the folder picker",
  "err.dirNoBackend": "Local backend dev service not detected",
  "err.dirListFailed": "Failed to list directories",
  "err.keyringReadFailed": "Unable to read system credentials: {m}",
  "err.credentialCleanupFailed": "Failed to clean up credentials",
  "err.headUnavailable": "Unable to read the current HEAD commit; the repository may not have any commits yet",
  "err.redoBranchMismatch": "Cannot redo on the current branch; the commit belongs to: {branch}",
  "err.noRepoOpen": "No Git repository is open",
  "err.aiCredentialReadFailed": "Unable to read or migrate AI credentials: {m}",
  "err.aiCredentialSaveFailed": "Unable to securely save AI credentials: {m}",
  "history.loadMore": "Load more commits",
  "history.allLoaded": "All commits loaded",
  "sidebar.viewStashPatch": "View patch",
  "settings.remotes.title": "Remotes",
  "settings.remotes.add": "Add remote",
  "settings.remotes.namePlaceholder": "Remote name, e.g. origin / upstream",
  "settings.remotes.urlPlaceholder": "Repository URL, e.g. https://github.com/user/repo.git",
  "settings.remotes.missingFields": "Fill in both the remote name and URL",
  "settings.remotes.added": "Remote added",
  "settings.remotes.addFailed": "Failed to add remote",
  "settings.remotes.removed": "Remote {name} removed",
  "settings.remotes.removeFailed": "Failed to remove remote",
  "settings.remotes.removeConfirm": "Remove remote {name}? Local branches and commits are not affected.",
  "settings.remotes.urlSaved": "Remote URL updated",
  "settings.remotes.urlSaveFailed": "Failed to update remote URL",
  "settings.remotes.edit": "Edit URL",
  "settings.remotes.save": "Save URL",
  "settings.remotes.remove": "Remove remote",
  "settings.remotes.empty": "No remotes configured yet.",
  "pr.aiGenerate": "Generate description",
  "pr.aiGenerating": "Generating...",
  "pr.aiGenerateTitle": "Generate the PR description from branch diff (local template when no API key)",
  "pr.aiGenerateFailed": "Failed to generate the description",
  "pr.aiFallbackUsed": "Description generated from a local template",
  "pr.aiNoDiff": "No differences between the branches to describe",
  "pr.aiLocalSummary": "Changes on this branch relative to the base:",
  "pr.aiFilesCount": "files",
  "pr.aiGroupAdded": "## Added files",
  "pr.aiGroupModified": "## Modified files",
  "pr.aiGroupDeleted": "## Deleted files",
  "settings.shortcuts.switchViews": "Switch Changes / History / Pull Requests / Actions views",
  "settings.shortcuts.filterFocus": "Focus the history filter box",
  "settings.shortcuts.openSettings": "Open settings",
  "settings.shortcuts.cheatSheet": "Open this shortcut cheat sheet",
  "cheatsheet.title": "Keyboard Shortcuts",
  "cheatsheet.hint": "Press ? anytime to reopen",
  "cheatsheet.group.global": "General",
  "cheatsheet.group.git": "Git operations",
  "cheatsheet.group.view": "Views",
  "update.available": "Update v{v} available",
  "update.downloading": "Downloading and installing in the background...",
  "update.installed": "Update ready",
  "update.restartHint": "Restart AuuGit to apply",
  "update.upToDate": "You are on the latest version",
  "update.checkFailed": "Update check failed",
  "header.refresh": "Refresh",
  "header.refreshed": "Repository state refreshed",
  "header.refreshFailed": "Refresh failed",
  "header.refreshTooltip": "Refresh repository state \u2014 picks up external changes (terminal, editor, etc.)",
  "history.searchingAll": "Searching the full repository history\u2026",
  "diff.search": "Find in diff",
  "diff.previousMatch": "Previous match",
  "diff.nextMatch": "Next match",
  "diff.wrap": "Wrap lines",
  "diff.ignoreWhitespace": "Ignore whitespace",
  "diff.ignoreHint": "Display only. Staging a whole file includes whitespace changes; turn this off for hunk actions.",
  "changes.selectionActions": "Selected file actions",
  "changes.selected": "selected",
  "changes.pickFile": "Check to include in batch actions",
  "changes.stageSelected": "Stage selected",
  "changes.unstageSelected": "Unstage selected",
  "changes.clearSelection": "Clear selection",
  "changes.processing": "Processing Git operations\u2026",
  "changes.selectionHint": "Tick checkboxes to include files in batch actions; Shift-tick for a range, Ctrl / \u2318 click to multi-select",
  "safety.preview": "Operation preview",
  "safety.checking": "Comparing branches and checking merge conflicts\u2026",
  "safety.onto": "onto",
  "safety.uniqueCommits": "unique commits",
  "safety.historyResult": "Resulting history",
  "safety.diagramHint": "Schematic; node counts do not represent actual commit counts.",
  "safety.upToDate": "The target already contains the source commits. No merge is needed.",
  "safety.fastForward": "Fast-forward possible: move the target to the source without a merge commit.",
  "safety.mergeHistory": "Preserve both histories and connect them with a merge commit.",
  "safety.rebaseHistory": "Replay commits onto the other branch. Commit IDs may change.",
  "safety.conflict.clean": "Merge simulation found no text conflicts. Review logic and run tests.",
  "safety.conflict.conflicts": "Merge simulation found conflicts in these files:",
  "safety.conflict.unavailable": "Merge simulation unavailable (Git may need updating). Conflict status is unknown.",
  "safety.rebaseConflictHint": "This checks the final merge. Rebase replays individual commits and can still encounter conflicts along the way.",
  "safety.incomingFiles": "Source files changed since the common ancestor",
  "safety.recoveryHint": "A commit recovery point is saved before execution. Commit or stash your changes first to keep the working tree clean.",
  "safety.cleanRequired": "Commit or stash all changes, including untracked files, first. Recovery points save commits, not uncommitted changes.",
  "safety.operationActive": "Finish or abort the current merge, rebase or cherry-pick first.",
  "safety.stale": "The branches have changed. Refresh the preview and try again.",
  "safety.localRequired": "The affected branch must be local. Create or select its local branch first.",
  "safety.sameBranch": "Switch to the local branch associated with this recovery point first.",
  "recovery.title": "Recovery center",
  "recovery.description": "Save commit positions before merges, rebases and history rewrites, or create a point manually. Restoring affects only the current local branch and saves its current commit first. Remotes are unchanged.",
  "recovery.create": "Save recovery point",
  "recovery.created": "Recovery point saved",
  "recovery.empty": "No recovery points yet. Save the current branch position to get started.",
  "recovery.restore": "Restore here",
  "recovery.confirm": "Restore local branch {branch} from {from} to {to} and update the working tree. The current commit will be saved as a new recovery point first. Nothing will be pushed.",
  "recovery.restored": "Local branch restored; previous commit saved as a recovery point",
  "recovery.op.merge": "Before merge",
  "recovery.op.rebase": "Before rebase",
  "recovery.op.manual": "Manually saved",
  "recovery.op.restore": "Before restore",
  "explain.title": "Explain changes with AI",
  "explain.consent": "Generate explanation sends the commit information and diff below to your configured model service:",
  "explain.configure": "Enable a compatible API in AI settings and enter the endpoint, model and API key.",
  "explain.settings": "Open AI settings",
  "explain.context": "Inspect content to be sent",
  "explain.characters": "characters",
  "explain.truncated": "Content is limited to 16,000 characters. The explanation covers only the displayed content.",
  "explain.generate": "Generate explanation",
  "explain.again": "Generate again",
  "explain.cancelled": "Request cancelled or timed out. You can try again.",
  "explain.requestFailed": "Model request failed (HTTP {status}). Check AI settings and try again.",
  "recovery.op.rewrite": "Before history rewrite",
  "permissions.title": "Authorized folders",
  "permissions.cancelled": "Repository access was cancelled",
  "permissions.description": "First access requires approval. Revoking access closes the repository; opening it again requires approval.",
  "permissions.empty": "No authorized folders",
  "permissions.revoke": "Revoke access",
  "permissions.revoked": "Folder access revoked",
  "permissions.failed": "Unable to revoke access",
  "permissions.chooseFolder": "Select a folder, or open it to approve access.",
  "stashPreview.empty": "This stash has no changes to display.",
  // ===== UI wave component-layer additions (must stay paired with zh.ts) =====
  "sidebar.worktreeBadge": "Worktree",
  "sidebar.popAction": "Pop",
  "terminal.noRepoError": "Error: No repository open",
  "terminal.doneExitZero": "Done (Exit Code 0)",
  "yaml.modalLabel": "Workflow configuration",
  "stashPreview.title": "Stash preview",
  "pr.stateOpen": "Open",
  "pr.stateMerged": "Merged",
  "pr.stateClosed": "Closed",
  ...workflowEn,
  ...resilienceEn,
  ...optimizationEn,
  ...workingReviewEn
};

// src/i18n/index.ts
var dictionaries = {
  zh,
  en
};
function translate(lang, key) {
  return dictionaries[lang]?.[key] ?? dictionaries.zh[key] ?? key;
}
function tNow(key) {
  return translate(useSettingsStore.getState().language, key);
}

// src/stores/settingsStore.ts
var SETTINGS_KEY = "auu_git_settings";
var legacyAiKey = "";
var keyVersion = 0;
var keyWrites = Promise.resolve();
var secretInit = null;
var toolsInit = null;
var isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
var DEFAULT_SETTINGS = {
  gitCliPath: "git",
  compactMode: false,
  cursorTheme: "system",
  diffFontSize: 13,
  diffWrapLines: false,
  diffIgnoreWhitespace: false,
  reviewBeforeCommit: true,
  autoFetchInterval: "10m",
  language: "zh",
  externalTools: [],
  aiConfig: {
    provider: "builtin",
    protocol: "chat-completions",
    endpoint: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat"
  }
};
function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      legacyAiKey = typeof parsed.aiConfig?.apiKey === "string" ? parsed.aiConfig.apiKey : "";
      if (parsed.aiConfig) {
        delete parsed.aiConfig.apiKey;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
      }
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        cursorTheme: normalizeCursorTheme(parsed.cursorTheme),
        diffFontSize: typeof parsed.diffFontSize === "number" && [12, 13, 14, 16, 18].includes(parsed.diffFontSize) ? parsed.diffFontSize : 13,
        reviewBeforeCommit: typeof parsed.reviewBeforeCommit === "boolean" ? parsed.reviewBeforeCommit : true,
        aiConfig: {
          ...DEFAULT_SETTINGS.aiConfig,
          ...parsed.aiConfig || {},
          protocol: ["chat-completions", "responses", "anthropic-messages"].includes(parsed.aiConfig?.protocol) ? parsed.aiConfig.protocol : "chat-completions",
          apiKey: legacyAiKey
        },
        // 工具配置归后端文件所有：localStorage 里的任何残留一律丢弃。
        externalTools: []
      };
    }
  } catch {
  }
  return DEFAULT_SETTINGS;
}
var useSettingsStore = create((set, get) => {
  const initial = loadSettings();
  applyCursorTheme(initial.cursorTheme);
  const persist = (partial) => {
    try {
      const current = {
        gitCliPath: get().gitCliPath,
        compactMode: get().compactMode,
        cursorTheme: get().cursorTheme,
        diffFontSize: get().diffFontSize,
        diffWrapLines: get().diffWrapLines,
        diffIgnoreWhitespace: get().diffIgnoreWhitespace,
        reviewBeforeCommit: get().reviewBeforeCommit,
        autoFetchInterval: get().autoFetchInterval,
        aiConfig: get().aiConfig,
        language: get().language,
        ...partial
      };
      const { apiKey: _secret, ...publicAiConfig } = current.aiConfig;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, aiConfig: publicAiConfig }));
    } catch {
    }
  };
  return {
    ...initial,
    credentialError: null,
    initSecrets: async () => {
      if (!isDesktop()) return;
      if (secretInit) return secretInit;
      const version = keyVersion;
      secretInit = (async () => {
        try {
          const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
          if (legacyAiKey && version === keyVersion) {
            const migrationKey = legacyAiKey;
            keyWrites = keyWrites.then(() => invoke2("store_ai_key", { key: migrationKey }));
            await keyWrites;
            legacyAiKey = "";
          }
          await keyWrites;
          const key = await invoke2("get_ai_key");
          if (version === keyVersion) set({ aiConfig: { ...get().aiConfig, apiKey: key || "" } });
        } catch (error) {
          set({ credentialError: tNow("err.aiCredentialReadFailed").replace("{m}", String(error)) });
        }
      })();
      return secretInit;
    },
    // 外部工具配置的加载与保存都只走后端命令（配置文件归后端所有），失败时
    // 允许重试（toolsInit 复位），由调用方决定如何提示。
    initExternalTools: async () => {
      if (!isDesktop()) return;
      if (toolsInit) return toolsInit;
      toolsInit = (async () => {
        const tools = await externalToolService.list();
        set({ externalTools: tools });
      })();
      try {
        await toolsInit;
      } catch (error) {
        toolsInit = null;
        throw error;
      }
    },
    saveExternalTool: async (tool) => {
      const tools = await externalToolService.save(tool);
      set({ externalTools: tools });
      return tools;
    },
    removeExternalTool: async (toolId) => {
      const tools = await externalToolService.remove(toolId);
      set({ externalTools: tools });
      return tools;
    },
    setGitCliPath: (gitCliPath) => {
      set({ gitCliPath });
      persist({ gitCliPath });
    },
    setCompactMode: (compactMode) => {
      set({ compactMode });
      persist({ compactMode });
      if (typeof document !== "undefined") {
        if (compactMode) {
          document.documentElement.classList.add("compact-mode");
        } else {
          document.documentElement.classList.remove("compact-mode");
        }
      }
    },
    setCursorTheme: (theme) => {
      const cursorTheme = normalizeCursorTheme(theme);
      set({ cursorTheme });
      persist({ cursorTheme });
      applyCursorTheme(cursorTheme);
    },
    setDiffFontSize: (size) => {
      if (![12, 13, 14, 16, 18].includes(size)) return;
      set({ diffFontSize: size });
      persist({ diffFontSize: size });
    },
    setDiffWrapLines: (diffWrapLines) => {
      set({ diffWrapLines });
      persist({ diffWrapLines });
    },
    setReviewBeforeCommit: (reviewBeforeCommit) => {
      set({ reviewBeforeCommit });
      persist({ reviewBeforeCommit });
    },
    setDiffIgnoreWhitespace: (diffIgnoreWhitespace) => {
      set({ diffIgnoreWhitespace });
      persist({ diffIgnoreWhitespace });
    },
    setAutoFetchInterval: (autoFetchInterval) => {
      set({ autoFetchInterval });
      persist({ autoFetchInterval });
    },
    setLanguage: (language) => {
      set({ language });
      persist({ language });
    },
    setAiConfig: (config) => {
      const updatedAi = { ...get().aiConfig, ...config };
      if (config.apiKey !== void 0) {
        keyVersion++;
        legacyAiKey = "";
        if (isDesktop()) {
          const key = config.apiKey;
          keyWrites = keyWrites.catch(() => {
          }).then(async () => {
            const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
            await invoke2("store_ai_key", { key });
            set({ credentialError: null });
          }).catch((error) => {
            set({ credentialError: tNow("err.aiCredentialSaveFailed").replace("{m}", String(error)) });
          });
        }
      }
      set({ aiConfig: updatedAi });
      persist({ aiConfig: updatedAi });
    },
    resetSettings: () => {
      get().setAiConfig({ apiKey: "" });
      set({ ...DEFAULT_SETTINGS, externalTools: get().externalTools });
      applyCursorTheme("system");
      localStorage.removeItem(SETTINGS_KEY);
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("compact-mode");
      }
    }
  };
});

// src/services/git/GitQueue.ts
var queues = /* @__PURE__ */ new Map();
var pending = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Set();
var repoKey = (path) => path.replace(/\\/g, "/").replace(/\/$/, "");
var GitQueueCancelledError = class extends Error {
};
var tasks = /* @__PURE__ */ new Map();
var activity = /* @__PURE__ */ new Map();
function publish(key) {
  const live = [...tasks.get(key) || []].filter((task) => task.cancelled === null);
  const running = live.find((task) => task.startedAt !== null);
  if (live.length) {
    pending.set(key, live.length);
    activity.set(key, {
      command: running?.command || live[0].command,
      startedAt: running?.startedAt ?? null,
      phaseStartedAt: running?.phaseStartedAt ?? null,
      queued: live.length - (running ? 1 : 0)
    });
  } else {
    pending.delete(key);
    activity.delete(key);
  }
  listeners.forEach((notify) => notify());
}
function serializeGitWrite(repoPath, run, command = "transaction") {
  const key = repoKey(repoPath);
  const task = { command, startedAt: null, phaseStartedAt: null, cancelled: null };
  if (!tasks.has(key)) tasks.set(key, /* @__PURE__ */ new Set());
  tasks.get(key).add(task);
  publish(key);
  const next = (queues.get(key) || Promise.resolve()).then(async () => {
    try {
      if (task.cancelled !== null) throw new GitQueueCancelledError(task.cancelled);
      task.startedAt = Date.now();
      task.phaseStartedAt = task.startedAt;
      publish(key);
      return await run();
    } finally {
      tasks.get(key)?.delete(task);
      if (!tasks.get(key)?.size) tasks.delete(key);
      publish(key);
    }
  });
  const tail = next.then(() => {
  }, () => {
  });
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}
function commandArgs(args) {
  let index = 0;
  while (index < args.length) {
    if (["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(args[index])) {
      index += 2;
      continue;
    }
    if (/^--(literal-pathspecs|no-literal-pathspecs|no-optional-locks|no-pager|paginate)$/.test(args[index]) || /^--(git-dir|work-tree|namespace|config-env)=/.test(args[index])) {
      index++;
      continue;
    }
    break;
  }
  return args.slice(index);
}
var getGitCommand = (args) => commandArgs(args)[0] || "transaction";
function isReadOnlyGitCommand(args) {
  const [command, ...options] = commandArgs(args);
  if (command === "check-ref-format") return true;
  if (command === "symbolic-ref") return options.filter((option) => !option.startsWith("-")).length === 1 && !options.some((option) => ["-d", "--delete"].includes(option));
  if (command === "worktree") return options[0] === "list";
  if (["status", "log", "show", "diff", "rev-parse", "for-each-ref", "ls-files", "ls-tree", "cat-file", "blame", "check-ignore", "show-ref", "rev-list", "merge-tree", "diff-tree", "--version", "help"].includes(command)) return true;
  if (command === "branch") return options.some((option) => ["--list", "--show-current", "-a", "-r", "-v", "-vv"].includes(option)) && !options.some((option) => ["-d", "-D", "-m", "-M", "-f", "--delete", "--move", "--force"].includes(option));
  if (command === "tag") return options.includes("-l") || options.includes("--list");
  if (command === "stash") return ["list", "show"].includes(options[0]);
  if (command === "remote") return options[0] === "get-url" || options[0] === "-v";
  if (command === "config") return options.some((option) => ["--get", "--get-regexp", "--list", "-l"].includes(option));
  return false;
}

// src/stores/toastStore.ts
var useToastStore = create((set, get) => ({
  toasts: [],
  history: [],
  record: (entry) => set((state) => ({ history: [{
    ...entry,
    description: entry.description && entry.description.length > 64e3 ? `${entry.description.slice(0, 64e3)}\u2026` : entry.description,
    id: `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now()
  }, ...state.history].slice(0, 100) })),
  clearHistory: () => set({ history: [] }),
  consumeAction: (id) => set((state) => ({
    history: state.history.map((entry) => entry.id === id ? { ...entry, action: void 0 } : entry),
    toasts: state.toasts.map((entry) => entry.id === id ? { ...entry, action: void 0 } : entry)
  })),
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = toast.duration ?? 4e3;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
      history: [{ ...toast, id, createdAt: Date.now(), description: toast.description && toast.description.length > 64e3 ? `${toast.description.slice(0, 64e3)}\u2026` : toast.description }, ...state.history].slice(0, 100)
    }));
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
    return id;
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }));
  },
  success: (title, description) => {
    return get().addToast({ type: "success", title, description });
  },
  error: (title, description) => {
    return get().addToast({ type: "error", title, description, duration: 6e3 });
  },
  info: (title, description) => {
    return get().addToast({ type: "info", title, description });
  },
  warning: (title, description) => {
    return get().addToast({ type: "warning", title, description });
  }
}));

// src/services/fs/RepositoryAccess.ts
var approvedBinaries = /* @__PURE__ */ new Map();
async function authorizeGitBinary(path) {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window) || /^(git|git\.exe)$/i.test(path)) return;
  let request = approvedBinaries.get(path);
  if (!request) {
    request = (async () => {
      const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
      try {
        await invoke2("authorize_git_binary", { path });
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    })();
    approvedBinaries.set(path, request);
  }
  try {
    await request;
  } catch (error) {
    if (approvedBinaries.get(path) === request) approvedBinaries.delete(path);
    throw error;
  }
}

// src/services/git/GitExecutor.ts
var GitExecutionError = class extends Error {
  exitCode;
  stdout;
  stderr;
  command;
  constructor(command, exitCode, stdout, stderr) {
    super(
      tNow("err.gitFailed").replace("{c}", String(exitCode)).replace("{m}", stderr || stdout || tNow("err.unknownGit"))
    );
    this.name = "GitExecutionError";
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.command = command;
  }
};
async function executeGit(args, cwd, stdin) {
  if (isReadOnlyGitCommand(args)) return executeGitNow(args, cwd, stdin);
  const started = Date.now();
  const command = getGitCommand(args);
  try {
    const result = await serializeGitWrite(cwd, () => executeGitNow(args, cwd, stdin), command);
    recordGitOperation(command, cwd, started);
    return result;
  } catch (error) {
    recordGitOperation(command, cwd, started, error, command === "fetch" ? async () => {
      await executeGit(args, cwd, stdin);
    } : void 0);
    throw error;
  }
}
function recordGitOperation(command, repoPath, started, error, retry) {
  const cancelled = error instanceof GitQueueCancelledError;
  useToastStore.getState().record({
    type: error ? cancelled ? "info" : "error" : "success",
    repoPath,
    elapsedMs: Date.now() - started,
    title: `Git \xB7 ${command}`,
    description: error ? error instanceof Error ? error.message : String(error) : tNow("operationLog.completed"),
    action: retry && !cancelled ? { label: tNow("operationLog.retryFetch"), onClick: retry } : void 0
  });
}
async function executeGitNow(args, cwd, stdin) {
  const customPath = useSettingsStore.getState().gitCliPath?.trim() || "git";
  const isTauri2 = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri2) {
    try {
      await authorizeGitBinary(customPath);
      const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
      const result = await invoke2("execute_git", {
        args: ["-c", "core.quotepath=false", ...args],
        cwd,
        gitBinary: customPath,
        stdin
      });
      const isNoIndexDiff = args.includes("--no-index");
      if (result.exitCode !== 0 && (!isNoIndexDiff || result.exitCode !== 1)) {
        throw new GitExecutionError(
          `git ${args.join(" ")}`,
          result.exitCode,
          result.stdout,
          result.stderr
        );
      }
      return result;
    } catch (err) {
      if (err instanceof GitExecutionError) throw err;
      throw new GitExecutionError(`git ${args.join(" ")}`, -1, "", err?.message || String(err));
    }
  }
  try {
    const res = await fetch("/api/git", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AuuGit-Request": "1"
      },
      body: JSON.stringify({
        args: ["-c", "core.quotepath=false", ...args],
        cwd,
        gitBinary: customPath,
        stdin
      })
    });
    const rawText = await res.text();
    if (rawText.trim().startsWith("<") || rawText.includes("<!DOCTYPE") || rawText.includes("<!doctype")) {
      throw new Error(tNow("err.noBackendProxy"));
    }
    if (!res.ok) {
      try {
        const error = JSON.parse(rawText);
        if (error.errorCode === "REPOSITORY_DIRECTORY_UNAVAILABLE") {
          throw new GitExecutionError(`git ${args.join(" ")}`, -1, "", tNow("remote.directoryUnavailable").replace("{path}", cwd));
        }
      } catch (error) {
        if (error instanceof GitExecutionError) throw error;
      }
      throw new Error(`HTTP ${res.status}: ${rawText}`);
    }
    const data = JSON.parse(rawText);
    const isNoIndexDiff = args.includes("--no-index");
    if (data.exitCode !== 0 && (!isNoIndexDiff || data.exitCode !== 1)) {
      throw new GitExecutionError(
        `git ${args.join(" ")}`,
        data.exitCode,
        data.stdout,
        data.stderr
      );
    }
    return data;
  } catch (err) {
    if (err instanceof GitExecutionError) throw err;
    throw new GitExecutionError(`git ${args.join(" ")}`, -1, "", err.message || tNow("err.networkExec"));
  }
}

// src/services/git/ConflictBaseService.ts
var MAX_CONFLICT_STAGE_BYTES = 2 * 1024 * 1024;
var STAGE_NUMBER = { base: 1, ours: 2, theirs: 3 };
function validateConflictFilePath(filePath) {
  const trimmed = (filePath || "").trim();
  if (!trimmed) throw new Error("Conflict file path is empty");
  if (trimmed.startsWith("-")) {
    throw new Error(`Conflict file path must not start with "-": ${trimmed}`);
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[a-z]:/i.test(trimmed)) {
    throw new Error(`Conflict file path must be relative to the repository: ${trimmed}`);
  }
  if (trimmed.split(/[/\\]/).some((part) => part === "..")) {
    throw new Error(`Conflict file path must not contain ".." segments: ${trimmed}`);
  }
  return trimmed;
}
async function fetchStage(repoPath, filePath, role) {
  const spec = `:${STAGE_NUMBER[role]}:${filePath}`;
  let size;
  try {
    const probe = await executeGit(["--literal-pathspecs", "cat-file", "-s", spec], repoPath);
    size = Number.parseInt(probe.stdout.trim(), 10);
  } catch (error) {
    if (error instanceof GitExecutionError && error.exitCode === 128) return null;
    throw error;
  }
  if (!Number.isFinite(size) || size < 0) {
    throw new Error(`Unable to determine the size of the ${role} version for ${filePath}`);
  }
  if (size > MAX_CONFLICT_STAGE_BYTES) {
    throw new Error(
      `The ${role} version of ${filePath} is ${(size / 1024 / 1024).toFixed(1)} MB, which exceeds the ${MAX_CONFLICT_STAGE_BYTES / 1024 / 1024} MB three-way comparison limit`
    );
  }
  try {
    return (await executeGit(["--literal-pathspecs", "show", spec], repoPath)).stdout;
  } catch (error) {
    if (error instanceof GitExecutionError && error.exitCode === 128) return null;
    throw error;
  }
}
async function fetchStages(repoPath, filePath) {
  if (!repoPath || !repoPath.trim()) throw new Error("Repository path is empty");
  const validated = validateConflictFilePath(filePath);
  const [base, ours, theirs] = await Promise.all([
    fetchStage(repoPath, validated, "base"),
    fetchStage(repoPath, validated, "ours"),
    fetchStage(repoPath, validated, "theirs")
  ]);
  return { base, ours, theirs };
}
var MARKER_LINE = /^(?:<{7}|\|{7}|={7}|>{7})(?: |$)/;
function contentFor(block, side) {
  if (side === "ours") return block.currentContent;
  if (side === "theirs") return block.incomingContent;
  return block.baseContent ?? null;
}
function lineCount(content) {
  return content ? content.split(/\r?\n/).length : 0;
}
function contextAnchor(blocks, blockIndex, workingLines) {
  const block = blocks[blockIndex];
  const lowerBound = blockIndex > 0 ? blocks[blockIndex - 1].endLine : 0;
  const anchor = [];
  for (let line = block.startLine - 2; line >= lowerBound && anchor.length < 3; line--) {
    const text = workingLines[line];
    if (text === void 0) break;
    if (MARKER_LINE.test(text)) continue;
    anchor.unshift(text);
  }
  return anchor;
}
function findSequence(haystack, pattern, from) {
  if (pattern.length === 0 || pattern.length > haystack.length) return -1;
  const last = haystack.length - pattern.length;
  for (let start = Math.max(0, from); start <= last; start++) {
    let matched = true;
    for (let offset = 0; offset < pattern.length; offset++) {
      if (haystack[start + offset] !== pattern[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return start;
  }
  return -1;
}
function locateBlockSpans(versionLines, blocks, workingLines, side) {
  const spans = [];
  let cursor = 0;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    const content = contentFor(block, side);
    const contentLines = content ? content.split(/\r?\n/) : [];
    const anchor = contextAnchor(blocks, blockIndex, workingLines);
    const estimated = side === "base" && contentLines.length === 0 ? Math.max(lineCount(block.currentContent), lineCount(block.incomingContent), 1) : Math.max(contentLines.length, 1);
    const candidates = [];
    if (contentLines.length > 0 && anchor.length > 0) {
      candidates.push({ pattern: [...anchor, ...contentLines], offset: anchor.length, exact: true });
    }
    if (contentLines.length > 0) {
      candidates.push({ pattern: contentLines, offset: 0, exact: true });
    }
    if (anchor.some((line) => line.length > 0)) {
      candidates.push({ pattern: anchor, offset: anchor.length, exact: false });
    }
    let span = null;
    for (const candidate of candidates) {
      let at = findSequence(versionLines, candidate.pattern, cursor);
      if (at < 0 && cursor > 0) at = findSequence(versionLines, candidate.pattern, 0);
      if (at < 0) continue;
      const start = at + candidate.offset;
      const length = candidate.exact ? contentLines.length : Math.max(estimated, 1);
      span = { start, end: Math.min(start + length, versionLines.length), matched: true };
      break;
    }
    if (!span) {
      const ratio = workingLines.length > 0 ? (block.startLine - 1) / workingLines.length : 0;
      const start = Math.max(0, Math.min(
        Math.floor(versionLines.length * ratio),
        Math.max(0, versionLines.length - estimated)
      ));
      span = { start, end: Math.min(start + estimated, versionLines.length), matched: false };
    }
    spans.push(span);
    cursor = Math.max(cursor, span.end);
  }
  return spans;
}

// src/services/git/ConflictParser.ts
var CONFLICT_START_REGEX = /^<{7}(?: (.*))?$/;
var CONFLICT_BASE_REGEX = /^\|{7}(?: (.*))?$/;
var CONFLICT_DIVIDER_REGEX = /^={7}$/;
var CONFLICT_END_REGEX = /^>{7}(?: (.*))?$/;
function hasConflictMarkers(content) {
  return /<{7}/.test(content) && /={7}/.test(content) && />{7}/.test(content);
}
function parseConflictBlocks(content) {
  if (!content) {
    return { hasConflicts: false, totalConflicts: 0, blocks: [], rawContent: "" };
  }
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let inConflict = false;
  let inBase = false;
  let inIncoming = false;
  let startLine = 0;
  let currentBranch = "\u5F53\u524D\u66F4\u6539 (HEAD)";
  let incomingBranch;
  let currentLines = [];
  let baseLines = [];
  let incomingLines = [];
  let blockIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    if (!inConflict) {
      const match = line.match(CONFLICT_START_REGEX);
      if (match) {
        inConflict = true;
        inBase = false;
        inIncoming = false;
        startLine = lineNum;
        currentBranch = (match[1] || "HEAD").trim();
        currentLines = [];
        baseLines = [];
        incomingLines = [];
      }
    } else {
      if (!inIncoming && !inBase && CONFLICT_BASE_REGEX.test(line)) {
        inBase = true;
        continue;
      }
      if (!inIncoming && CONFLICT_DIVIDER_REGEX.test(line)) {
        inIncoming = true;
        inBase = false;
        continue;
      }
      const endMatch = line.match(CONFLICT_END_REGEX);
      if (endMatch) {
        incomingBranch = (endMatch[1] || "\u4F20\u5165\u66F4\u6539").trim();
        blocks.push({
          id: `conflict-${blockIndex}-${startLine}`,
          index: blockIndex,
          startLine,
          endLine: lineNum,
          currentBranchName: currentBranch,
          incomingBranchName: incomingBranch,
          currentContent: currentLines.join("\n"),
          baseContent: baseLines.length > 0 ? baseLines.join("\n") : void 0,
          incomingContent: incomingLines.join("\n"),
          rawStartIdx: startLine - 1,
          rawEndIdx: lineNum - 1
        });
        blockIndex++;
        inConflict = false;
        inBase = false;
        inIncoming = false;
        continue;
      }
      if (inIncoming) {
        incomingLines.push(line);
      } else if (inBase) {
        baseLines.push(line);
      } else {
        currentLines.push(line);
      }
    }
  }
  return {
    hasConflicts: blocks.length > 0,
    totalConflicts: blocks.length,
    blocks,
    rawContent: content
  };
}
function locateConflictSpan(content, startLine0, endLine0) {
  let offset = 0;
  let lineIndex = 0;
  let blockStart = -1;
  let afterEnd = content.length;
  let endTerminator = "";
  let eol = "\n";
  while (offset < content.length && lineIndex <= endLine0) {
    if (lineIndex === startLine0) blockStart = offset;
    const nl = content.indexOf("\n", offset);
    const lineEnd = nl === -1 ? content.length : nl + 1;
    if (lineIndex < endLine0 && nl !== -1) {
      eol = nl > offset && content[nl - 1] === "\r" ? "\r\n" : "\n";
    }
    if (lineIndex === endLine0) {
      endTerminator = nl === -1 ? "" : nl > offset && content[nl - 1] === "\r" ? "\r\n" : "\n";
      afterEnd = lineEnd;
    }
    offset = lineEnd;
    lineIndex++;
  }
  return blockStart < 0 ? null : { blockStart, afterEnd, endTerminator, eol };
}
function resolveSingleBlock(content, blockIndex, resolution, customContent = "") {
  const parsed = parseConflictBlocks(content);
  const target = parsed.blocks.find((b) => b.index === blockIndex);
  if (!target) return content;
  let replacement = "";
  switch (resolution) {
    case "custom":
      replacement = customContent;
      break;
    case "current":
      replacement = target.currentContent;
      break;
    case "incoming":
      replacement = target.incomingContent;
      break;
    case "both":
      replacement = target.currentContent ? target.incomingContent ? `${target.currentContent}
${target.incomingContent}` : target.currentContent : target.incomingContent;
      break;
    case "both_reverse":
      replacement = target.incomingContent ? target.currentContent ? `${target.incomingContent}
${target.currentContent}` : target.incomingContent : target.currentContent;
      break;
  }
  const span = locateConflictSpan(content, target.startLine - 1, target.endLine - 1);
  if (!span) return content;
  const replacementLines = replacement.length > 0 ? replacement.split("\n") : [];
  const middle = replacementLines.length ? replacementLines.join(span.eol) + (span.endTerminator || "") : "";
  return content.slice(0, span.blockStart) + middle + content.slice(span.afterEnd);
}
function resolveAllBlocks(content, resolution) {
  let currentContent = content;
  let parsed = parseConflictBlocks(currentContent);
  while (parsed.blocks.length > 0) {
    currentContent = resolveSingleBlock(currentContent, parsed.blocks[0].index, resolution);
    parsed = parseConflictBlocks(currentContent);
  }
  return currentContent;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MAX_CONFLICT_STAGE_BYTES,
  conflictBaseEn,
  conflictBaseZh,
  fetchStages,
  hasConflictMarkers,
  locateBlockSpans,
  parseConflictBlocks,
  resolveAllBlocks,
  resolveSingleBlock,
  validateConflictFilePath
});
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
