import { PolymerElement, html } from '@polymer/polymer';
import easeInOutCubic from '../../shared/easeInOutCubic';
import supportsPassive from '../../shared/supportsPassive';

const supportSmoothScroll =
  'webkitScrollBehavior' in document.documentElement.style ||
  'scrollBehavior' in document.documentElement.style;
let uid = 0;

const SCROLL_LEFT = 'scroll-left';
const SCROLL_TOP = 'scroll-top';
const SCROLL_INTO_VIEW = 'scroll-into-view';

export default class ScrollViewElement extends PolymerElement {
  static get is() {
    return 'a-scroll-view';
  }

  /**
   * Properteies scrollLeft and scrollTop are conflicted with Element prototype,
   * so we should handle them in manual with attribute apis.
   */
  static get properties() {
    return {
      scrollX: {
        type: Boolean,
        value: false,
        computed: '_getBoolPropFromAttr("scroll-x", scrollX)',
        observer: '_observeScrollX',
      },
      scrollY: {
        type: Boolean,
        value: false,
        computed: '_getBoolPropFromAttr("scroll-y", scrollY)',
        observer: '_observeScrollY',
      },
      [SCROLL_LEFT]: Number,
      [SCROLL_TOP]: Number,
      scrollIntoView: String,
      scrollWithAnimation: {
        type: Boolean,
        value: false,
        computed:
          '_getBoolPropFromAttr("scroll-with-animation", scrollWithAnimation)',
      },
      hideScrollBar: {
        type: Boolean,
        value: false,
        observer: '_observeHideScrollBar',
      },
      upperThreshold: {
        type: Number,
        value: 50,
      },
      lowerThreshold: {
        type: Number,
        value: 50,
      },
    };
  }

  /**
   * Mark the scrollable element and direction.
   * @private
   */
  _scrollable = true;
  _scrollDirection = 'x';

  _getBoolPropFromAttr(attr, fallbackVal) {
    if (this._prevent) return false;
    if (this.hasAttribute(attr)) {
      const value = this.getAttribute(attr);
      return value === 'true' || value === '';
    } else {
      return fallbackVal;
    }
  }

  constructor() {
    super();

    // The timer ids.
    this.timerX = null;
    this.timerY = null;

    // The event interacting with the upper DSL has a 10ms throttle, which is consistent here.
    this.lastScrollTime = 0;
    this.lastScrollTop = 0;
    this.lastScrollLeft = 0;

    // Add a unique id for element to avoid style pollution.
    this._id = `scroll-view-${++uid}`;

    // Action Map
    this._actionMap = {
      [SCROLL_INTO_VIEW]: null,
      [SCROLL_LEFT]: null,
      [SCROLL_TOP]: null,
    };

    // Anmation frame id
    this._animationFrameId = 0;
    /**
     * If prevented, do not response to any user actions.
     * @type {boolean}
     * @private
     */
    let _prevent = false;
    Object.defineProperty(this, '_prevent', {
      get: () => _prevent,
      set: val => {
        _prevent = val;
        // If prevented, stop scroll by overrides CSS overflow.
        if (val) {
          this.style.overflowX = this.style.overflowY = 'hidden';
        } else {
          this.style.overflowX = this.scrollX ? 'auto' : 'hidden';
          this.style.overflowY = this.scrollY ? 'auto' : 'hidden';
        }
      },
    });
  }

  get _scrollTop() {
    return this[SCROLL_TOP];
  }
  get _scrollLeft() {
    return this[SCROLL_LEFT];
  }

  ready() {
    super.ready();
    this.setAttribute('atag-id', this._id);
  }

  attributeChangedCallback(key, oldVal, newVal) {
    super.attributeChangedCallback(key, oldVal, newVal);
    switch (key) {
      case SCROLL_TOP:
      case SCROLL_LEFT:
      case SCROLL_INTO_VIEW:
        this._dispatchAction(key, newVal);
        break;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // Improving Scroll Performance with Passive Event Listeners
    window.addEventListener(
      'scroll',
      this._handleScroll,
      supportsPassive
        ? {
          capture: true,
          passive: true,
        }
        : true,
    );

    this.addEventListener('touchstart', this._handleTouchStart, false);
    this.addEventListener('touchend', this._handleTouchEnd, false);
    this.addEventListener('touchcancel', this._handleTouchEnd, false);
  }

  _handleTouchStart = evt => {
    /**
     * @Note: Same direction scroll-view handled by webview automaticlly.
     * Otherwise, parent scroll-view overflow hidden, child scroll-view also stop scrolls.
     */
    this._parentSameDirectionScrollElement = this._getNearestParentElement(
      this,
      el =>
        el._scrollable === true &&
        el._scrollDirection === this._scrollDirection &&
        !(el instanceof ScrollViewElement),
    );
    if (this._parentSameDirectionScrollElement) {
      evt.stopPropagation();
      this._parentSameDirectionScrollElement._prevent = true;
    }
  };
  _handleTouchEnd = evt => {
    if (this._parentSameDirectionScrollElement) {
      evt.stopPropagation();
      this._parentSameDirectionScrollElement._prevent = false;
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(
      'scroll',
      this._handleScroll,
      supportsPassive
        ? {
          capture: true,
          passive: true,
        }
        : true,
    );
    this.removeEventListener('touchstart', this._handleTouchStart, true);
    this.removeEventListener('touchend', this._handleTouchEnd, true);
    this.removeEventListener('touchcancel', this._handleTouchEnd, true);
  }

  /**
   * Dispatch actions in a frame
   * @param {String} action
   * @param {String|Number} value
   */
  _dispatchAction(action, value) {
    this._actionMap[action] = value;
    cancelAnimationFrame(this._animationFrameId);
    this._animationFrameId = requestAnimationFrame(() => {
      const isScrollTop = this._actionMap[SCROLL_TOP] !== null;
      const isScrollLeft = this._actionMap[SCROLL_LEFT] !== null;
      if (isScrollTop || isScrollLeft) {
        const offset = isScrollTop ? this._actionMap[SCROLL_TOP] : this._actionMap[SCROLL_LEFT];
        if (this.scrollWithAnimation) {
          isScrollTop ? this._smoothScrollToY(offset) : this._smoothScrollToX(offset);
        } else {
          const DIREACTION = isScrollTop ? 'top' : 'left';
          this.scrollTo({
            [DIREACTION]: offset,
            behavior: 'instant',
          });
        }
      } else {
        const scrollIntoViewId = this._actionMap[SCROLL_INTO_VIEW];
        if (scrollIntoViewId !== null) {
          const targetNode = document.getElementById(scrollIntoViewId);
          if (targetNode) {
            const containerRect = this.getBoundingClientRect();
            const targetNodeRect = targetNode.getBoundingClientRect();

            const offset = this.scrollX ? this.scrollLeft + targetNodeRect.left - containerRect.left
              : this.scrollTop + targetNodeRect.top - containerRect.top;

            if (this.scrollWithAnimation) {
              this.scrollX ? this._smoothScrollToX(offset) : this._smoothScrollToY(offset);
            } else {
              const DIREACTION = this.scrollX ? 'left' : 'top';
              this.scrollTo({
                [DIREACTION]: offset,
                behavior: 'instant',
              });
            }
          }
        }
      }
      this._actionMap = {
        [SCROLL_INTO_VIEW]: null,
        [SCROLL_LEFT]: null,
        [SCROLL_TOP]: null,
      };
    });
  }

  _observeScrollX() {
    this.style.overflowX = this.scrollX ? 'auto' : 'hidden';
    if (this.scrollX) {
      this._scrollDirection = 'x';
    }
  }

  _observeScrollY() {
    this.style.overflowY = this.scrollY ? 'auto' : 'hidden';
    if (this.scrollY) {
      this._scrollDirection = 'y';
    }
  }
  /**
   * If smooth scrolling works, use Element.scrollTop/scrollLeft
   */
  _smoothScrollToX(value) {
    if (!supportSmoothScroll) {
      if (this.timerX) {
        clearInterval(this.timerX);
        this.timerX = 0;
      }
      let startTime = Date.now();
      let duration = 800;
      let initialValue = this.scrollLeft;
      this.timerX = setInterval(() => {
        let deltaTime = Date.now() - startTime;
        if (deltaTime > duration) {
          clearInterval(this.timerX);
          this.timerX = 0;
          this.scrollLeft = value;
        } else {
          const process = easeInOutCubic(deltaTime / duration);
          this.scrollLeft = initialValue + process * (value - initialValue);
        }
      }, 16);
    } else {
      this.scrollLeft = value;
    }
  }

  _smoothScrollToY(value) {
    if (!supportSmoothScroll) {
      if (this.timerY) {
        clearInterval(this.timerY);
        this.timerY = 0;
      }
      let startTime = Date.now();
      let duration = 400;
      let initialValue = this._scrollTop;
      this.timerY = setInterval(() => {
        let deltaTime = Date.now() - startTime;
        if (deltaTime > duration) {
          clearInterval(this.timerY);
          this.timerY = 0;
          this.scrollTop = value;
        } else {
          const process = easeInOutCubic(deltaTime / duration);
          this.scrollTop = initialValue + process * (value - initialValue);
        }
      }, 16);
    } else {
      this.scrollTop = value;
    }
  }

  /**
   * Find nearnet parent element.
   * @param el {HTMLElement} Base element.
   * @param isTarget {Function} Judge the right element, return true if is target.
   * @private
   */
  _getNearestParentElement(el, isTarget) {
    while (el) {
      el = el.parentElement;
      if (!el || isTarget(el)) return el;
    }
  }

  _handleScroll = evt => {
    /**
     * Because it is captured on the window, it is necessary to judge
     * whether it is really its own rolling event.
     */
    if (evt.target !== this) {
      return;
    }
    /**
     * Avoid infinite loops
     */
    if (evt instanceof CustomEvent) {
      return;
    }
    /**
     * Terminate the native scroll event
     */
    evt.stopPropagation();

    /**
     *  Send a custom scroll event with detail information added
     */
    const deltaX = this.scrollLeft - this.lastScrollLeft;
    const deltaY = this.scrollTop - this.lastScrollTop;
    const scrollEvent = new CustomEvent('scroll', {
      bubbles: false,
      cancelable: true,
      detail: {
        scrollLeft: this.scrollLeft,
        scrollTop: this.scrollTop,
        scrollHeight: this.scrollHeight,
        scrollWidth: this.scrollWidth,
        deltaX,
        deltaY,
      },
    });
    this.dispatchEvent(scrollEvent);

    /**
     * To trigger a bubble event to indicate that a scrolling is happening.
     * For swiper, when a scrolling is happening, disable all inner dragging.
     */
    this.dispatchEvent(new CustomEvent('_scrollviewscroll', {
      bubbles: true,
    }));

    this.lastScrollTop = this.scrollTop;
    this.lastScrollLeft = this.scrollLeft;
    if (evt.timeStamp - this.lastScrollTime < 10) {
      return;
    }
    this.lastScrollTime = evt.timeStamp;

    if ( deltaX < 0 && this.scrollLeft <= this.upperThreshold || deltaY < 0 && this.scrollTop <= this.upperThreshold) {
      if (!this.scrolledToUpper) {
        const scrollToUpperEvent = new CustomEvent('scrolltoupper');
        this.dispatchEvent(scrollToUpperEvent);
      }
      this.scrolledToUpper = true;
    } else {
      this.scrolledToUpper = false;
    }

    if ( deltaX > 0 && this.scrollWidth - this.scrollLeft - this.clientWidth <= this.lowerThreshold || deltaY > 0 && this.scrollHeight - this.scrollTop - this.clientHeight <= this.lowerThreshold ) {
      if (!this.scrolledToLower) {
        const scrollToLowerEvent = new CustomEvent('scrolltolower');
        this.dispatchEvent(scrollToLowerEvent);
      }
      this.scrolledToLower = true;
    } else {
      this.scrolledToLower = false;
    }
  };

  _observeHideScrollBar(enableScrollBar) {
    if (enableScrollBar) {
      this._createCustomStyle();
      const hideScrollBarStyle = 'display: none;';
      /**
       * A way to compatible with WebComponents polyfill
       */
      this._customStyle.textContent = `
        :host::-webkit-scrollbar {
          ${hideScrollBarStyle}
        }
        a-scroll-view[atag-id=${this._id}]::-webkit-scrollbar {
          ${hideScrollBarStyle}
        }
      `;
    } else {
      this._customStyle && this.shadowRoot.removeChild(this._customStyle);
    }
  }

  _createCustomStyle() {
    if (this._customStyle) return;
    this._customStyle = document.createElement('style');
    const shadowRoot = this.shadowRoot || this.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(this._customStyle);
  }

  static get template() {
    return html`
      <style>
        :host {
          position: relative;
          display: block;
          box-sizing: border-box;

          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
      </style>
      <slot></slot>
    `;
  }
}

customElements.define(ScrollViewElement.is, ScrollViewElement);
