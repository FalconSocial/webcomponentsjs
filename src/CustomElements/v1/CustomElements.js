/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

/**
 * 2.3
 * http://w3c.github.io/webcomponents/spec/custom/#dfn-element-definition
 *
 * @typedef {Object} Definition
 * @property {Function} name
 * @property {Function} localName
 * @property {Function} constructor
 * @property {Function} connectedCallback
 * @property {Function} disconnectedCallback
 * @property {Function} attributeChangedCallback
 * @property {String[]} observedAttributes
 * http://w3c.github.io/webcomponents/spec/custom/#dfn-element-definition-construction-stack
 * @property {Function[]} constructionStack
 */

(function() {
  'use strict';

  var reservedTagList = [
    'annotation-xml',
    'color-profile',
    'font-face',
    'font-face-src',
    'font-face-uri',
    'font-face-format',
    'font-face-name',
    'missing-glyph',
  ];

  var customNameValidation = /^[a-z][.0-9_a-z]*-[\-.0-9_a-z]*$/;

  function checkCallback(callback, elementName, calllbackName) {
    if (callback !== undefined && typeof callback !== 'function') {
      console.warn(typeof callback);
      throw new Error(`TypeError: ${elementName} '${calllbackName}' is not a Function`);
    }
  }

  function isReservedTag(name) {
    return reservedTagList.indexOf(name) !== -1;
  }

  function CustomElementsRegistry() {
    // @type {Map<String, Definition>}
    this._definitions = new Map();
    this._observer = this._observeRoot(document);
    this._attributeObserver =
        new MutationObserver(this._handleAttributeChange.bind(this));
    this._newInstance;
    this._newTagName;
    this.polyfilled = true;
  }

  CustomElementsRegistry.prototype = {
    define(name, constructor, options) {
      // 5.1.1
      if (typeof constructor !== 'function') {
        throw new TypeError('constructor must be a Constructor');
      }

      // 5.1.2
      name = name.toString().toLowerCase();

      // 5.1.3
      if (!customNameValidation.test(name)) {
        throw new Error(`NotSupportedError: Document.defineElement failed for '${name}'. The element name is not valid.`);
      }
      if (isReservedTag(name)) {
        throw new Error(`NotSupportedError: Document.defineElement failed for '${name}'. The element name is reserved.`);
      }

      // 5.1.4? Can't polyfill?

      // 5.1.5
      if (this._definitions.has(name)) {
        throw new Error(`NotSupportedError: Document.defineElement an element with name '${name}' is already registered`);
      }

      // 5.1.6
      // IE11 doesn't support Map.values, only Map.forEach
      this._definitions.forEach(function(value, key) {
        if (value.constructor === constructor) {
          throw new Error(`NotSupportedError: Document.defineElement failed for '${name}'. The constructor is already used.`);
        }
      });

      // 5.1.7
      var localName = name;

      // 5.1.8
      var _extends = options && options.extends || '';

      // 5.1.9
      if (_extends !== null) {
        // skip for now
      }

      // 5.1.10, 5.1.11
      var observedAttributes = constructor.observedAttributes || [];

      // 5.1.12
      var prototype = constructor.prototype;

      // 5.1.13?

      // 5.1.14
      var connectedCallback = prototype.connectedCallback;
      // 5.1.15
      checkCallback(connectedCallback, localName, 'connectedCallback');
      // 5.1.16
      var disconnectedCallback = prototype.disconnectedCallback;
      // 5.1.17
      checkCallback(disconnectedCallback, localName, 'disconnectedCallback');
      // 5.1.18
      var attributeChangedCallback = prototype.attributeChangedCallback;
      // 5.1.19
      checkCallback(attributeChangedCallback, localName, 'attributeChangedCallback');

      // 5.1.20
      // @type {Definition}
      var definition = {
        name: name,
        localName: localName,
        constructor: constructor,
        connectedCallback: connectedCallback,
        disconnectedCallback: disconnectedCallback,
        attributeChangedCallback: attributeChangedCallback,
        observedAttributes: observedAttributes,
      };

      // 5.1.21
      this._definitions.set(localName, definition);

      // 5.1.22
      // this causes an upgrade of the document
      this._addNodes(document.childNodes);
    },

    flush() {
      this._handleMutations(this._observer.takeRecords());
    },

    setCurrentTag(tagName) {
      this._newTagName = this._newTagName || tagName;
    },

    _setNewInstance(instance) {
      console.assert(this._newInstance == null);
      this._newInstance = instance;
    },

    _observeRoot(root) {
      if (!root.__observer) {
        var observer = new MutationObserver(this._handleMutations.bind(this));
        observer.observe(root, {childList: true, subtree: true});
        root.__observer = observer;
      }
      return root.__observer;
    },

    _handleMutations(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'childList') {
          this._addNodes(mutation.addedNodes);
          this._removeNodes(mutation.removedNodes);
        }
      }
    },

    _addNodes(nodeList) {
      for (var i = 0; i < nodeList.length; i++) {
        var root = nodeList[i];
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        do {
          var node = walker.currentNode;
          var definition = this._definitions.get(node.localName);
          if (!definition) {
            continue;
          }
          if (!node.__upgraded) {
            this._upgradeElement(node, definition, true);
          }
          if (node.__upgraded && !node.__attached) {
            node.__attached = true;
            if (definition && definition.connectedCallback) {
              definition.connectedCallback.call(node);
            }
          }
        } while (walker.nextNode())
      }
    },

    _removeNodes(nodeList) {
      for (var i = 0; i < nodeList.length; i++) {
        var root = nodeList[i];
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        do {
          var node = walker.currentNode;
          if (node.__upgraded && node.__attached) {
            node.__attached = false;
            var definition = this._definitions.get(node.localName);
            if (definition && definition.disconnectedCallback) {
              definition.disconnectedCallback.call(node);
            }
          }
        } while (walker.nextNode())
      }
    },

    _upgradeElement(element, definition, callConstructor) {
      var prototype = definition.constructor.prototype;
      Object.setPrototypeOf(element, prototype);
      if (callConstructor) {
        this._setNewInstance(element);
        element.__upgraded = true;
        new (definition.constructor)();
        console.assert(this._newInstance == null);
      }
      if (definition.attributeChangedCallback && definition.observedAttributes.length > 0) {
        this._attributeObserver.observe(element, {
          attributes: true,
          attributeOldValue: true,
          attributeFilter: definition.observedAttributes,
        });
      }
    },

    _handleAttributeChange(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'attributes') {
          var name = mutation.attributeName;
          var oldValue = mutation.oldValue;
          var target = mutation.target;
          var newValue = target.getAttribute(name);
          var namespace = mutation.attributeNamespace;
          target.attributeChangedCallback(name, oldValue, newValue, namespace);
        }
      }
    },

  };

  function patchHTMLElement(win) {
    // TODO: patch up all built-in subclasses of HTMLElement to use the fake
    // HTMLElement.prototype
    var origHTMLElement = HTMLElement;
    window.HTMLElement = function() {
      if (win.customElements._newInstance) {
        var i = win.customElements._newInstance;
        win.customElements._newInstance = null;
        win.customElements._newTagName = null;
        return i;
      }
      if (win.customElements._newTagName) {
        var tagName = win.customElements._newTagName.toLowerCase();
        win.customElements._newTagName = null;
        return win.document._createElement(tagName, false);
      }
      throw new Error('unknown constructor');
    }
    HTMLElement.prototype = Object.create(origHTMLElement.prototype);
    Object.defineProperty(HTMLElement.prototype, 'constructor', {
      writable: false,
      configurable: true,
      enumerable: false,
      value: HTMLElement,
    });
  }

  function patchCreateElement(win) {
    var doc = win.document;
    var rawCreateElement = doc.createElement.bind(document);
    doc._createElement = function(tagName, callConstructor) {
      var element = rawCreateElement(tagName);
      var definition = win.customElements._definitions.get(tagName.toLowerCase());
      if (definition) {
        win.customElements._upgradeElement(element, definition, callConstructor);
      }
      return element;
    };
    doc.createElement = function(tagName) {
      return doc._createElement(tagName, true);
    }
  }

  function patchCreateElementNS(win) {
    var doc = win.document;
    var HTMLNS = 'http://www.w3.org/1999/xhtml';
    var _origCreateElementNS = document.createElementNS;
    doc.createElementNS = function(namespaceURI, qualifiedName) {
      if (namespaceURI === 'http://www.w3.org/1999/xhtml') {
        return doc.createElement(qualifiedName);
      } else {
        return _origCreateElementNS(namespaceURI, qualifiedName);
      }
    };
  }

  window.customElements = new CustomElementsRegistry();
  patchHTMLElement(window);
  patchCreateElement(window);
  patchCreateElementNS(window);
})();