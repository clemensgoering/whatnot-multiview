/*
 * Source of the script injected into every stream page to hide the chat.
 *
 * This file is not executed in the app window. It only stringifies the function
 * below into window.CHAT_HOOK_SOURCE, which renderer.js hands to
 * webview.executeJavaScript(). Keeping it as real code rather than an array of
 * quoted lines means it is readable and gets syntax-checked like everything else.
 */
function mvChatHook() {
  if (window.__mvChat) return true;

  var state = { hidden: false, el: null, prev: '', selector: null };

  function area(el) {
    var b = el.getBoundingClientRect();
    return (b.width * b.height) / (innerWidth * innerHeight);
  }

  function holdsVideo(el) {
    return !!el.querySelector('video');
  }

  /** Depth from the document root, used to prefer outer containers. */
  function depth(el) {
    var d = 0;
    var n = el;
    while (n.parentElement) { d += 1; n = n.parentElement; }
    return d;
  }

  /**
   * Grows a starting element upwards to the largest ancestor that still is not
   * the whole page and does not contain the video. That turns "the message list"
   * into "the whole chat panel including its input".
   */
  function growUp(start) {
    var best = null;
    var n = start;
    while (n && n !== document.body) {
      var f = area(n);
      if (f > 0.03 && f < 0.8 && !holdsVideo(n)) best = n;
      n = n.parentElement;
    }
    return best;
  }

  /** Desktop layout: a tall, narrow column to the right of the video. */
  function byGeometry() {
    var v = document.querySelector('video');
    var vr = v ? v.getBoundingClientRect() : null;
    var minLeft = vr && vr.width > 100 ? vr.right - 40 : innerWidth * 0.5;
    var best = null;
    var bestDepth = 1e9;
    var nodes = document.querySelectorAll('div, section, aside');
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      var b = el.getBoundingClientRect();
      if (b.width < 150 || b.width > innerWidth * 0.45) continue;
      if (b.height < innerHeight * 0.4) continue;
      if (b.left < minLeft) continue;
      if (b.right < innerWidth * 0.75) continue;
      if (holdsVideo(el)) continue;
      var d = depth(el);
      if (d < bestDepth) { bestDepth = d; best = el; }
    }
    return best;
  }

  /**
   * Layout-independent: a chat is a scrollable list of many short messages.
   * Looks for the scroll container with the most children, then grows upwards
   * to include the composer. Does not depend on class names or placeholders.
   */
  function byMessageList() {
    var best = null;
    var bestScore = 0;
    var nodes = document.querySelectorAll('div, section, aside, ul, ol');
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      if (el.childElementCount < 4) continue;
      if (holdsVideo(el)) continue;
      var f = area(el);
      if (f < 0.04 || f > 0.6) continue;
      var style = getComputedStyle(el);
      var scrolls = /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 8;
      if (!scrolls) continue;
      var score = el.childElementCount;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return best ? growUp(best) : null;
  }

  /** Falls back to the chat's message field when it carries a usable label. */
  function byComposer() {
    var chatty = /chat|message|nachricht|say something|sag etwas|kommentar|comment/i;
    var fields = document.querySelectorAll('input, textarea, [contenteditable]');
    for (var i = 0; i < fields.length; i += 1) {
      var f = fields[i];
      if (f.type === 'hidden' || f.type === 'password') continue;
      var label = (f.getAttribute('placeholder') || '') + ' ' +
        (f.getAttribute('aria-label') || '') + ' ' +
        (f.getAttribute('name') || '') + ' ' +
        (f.getAttribute('data-testid') || '');
      if (!chatty.test(label)) continue;
      var grown = growUp(f);
      if (grown) return grown;
    }
    return null;
  }

  /** Builds a positional path, used to remember a manually picked element. */
  function pathTo(el) {
    var parts = [];
    var n = el;
    while (n && n !== document.body && n.parentElement && parts.length < 14) {
      var parent = n.parentElement;
      var index = Array.prototype.indexOf.call(parent.children, n) + 1;
      parts.unshift(n.tagName.toLowerCase() + ':nth-child(' + index + ')');
      n = parent;
    }
    return 'body > ' + parts.join(' > ');
  }

  function resolve() {
    if (state.selector) {
      var picked = null;
      try { picked = document.querySelector(state.selector); } catch (e) { picked = null; }
      if (picked) return picked;
    }
    if (innerWidth >= 700) {
      return byGeometry() || byMessageList() || byComposer();
    }
    return byMessageList() || byComposer() || byGeometry();
  }

  /* ---- manual picking ---- */

  var picking = null;

  function stopPicking() {
    if (!picking) return;
    document.removeEventListener('mousemove', picking.move, true);
    document.removeEventListener('click', picking.click, true);
    document.removeEventListener('keydown', picking.key, true);
    if (picking.box.parentNode) picking.box.parentNode.removeChild(picking.box);
    if (picking.tip.parentNode) picking.tip.parentNode.removeChild(picking.tip);
    picking = null;
  }

  function startPicking() {
    stopPicking();
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;' +
      'border:2px solid #ffb020;background:rgba(255,176,32,.16);border-radius:4px;' +
      'transition:all 60ms;';
    var tip = document.createElement('div');
    tip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;' +
      'left:50%;top:12px;transform:translateX(-50%);background:#14181f;color:#e7ecf3;' +
      'font:600 12px/1.4 system-ui,sans-serif;padding:7px 13px;border-radius:20px;' +
      'border:1px solid #36404f;box-shadow:0 6px 22px rgba(0,0,0,.5);';
    tip.textContent = 'Click the chat area  ·  Esc to cancel';
    document.body.appendChild(box);
    document.body.appendChild(tip);

    picking = {
      box: box,
      tip: tip,
      move: function (e) {
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === box || el === tip) return;
        var target = growUp(el) || el;
        var b = target.getBoundingClientRect();
        box.style.left = b.left + 'px';
        box.style.top = b.top + 'px';
        box.style.width = b.width + 'px';
        box.style.height = b.height + 'px';
        picking.target = target;
      },
      click: function (e) {
        e.preventDefault();
        e.stopPropagation();
        var target = picking.target ||
          growUp(document.elementFromPoint(e.clientX, e.clientY));
        stopPicking();
        if (!target) { window.__mvChat.pickResult = ''; return; }
        state.selector = pathTo(target);
        window.__mvChat.pickResult = state.selector;
      },
      key: function (e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        stopPicking();
        window.__mvChat.pickResult = '';
      },
    };

    document.addEventListener('mousemove', picking.move, true);
    document.addEventListener('click', picking.click, true);
    document.addEventListener('keydown', picking.key, true);
  }

  window.__mvChat = {
    pickResult: null,

    set: function (hide) {
      if (hide) {
        if (state.hidden) return true;
        var el = resolve();
        if (!el) return false;
        state.el = el;
        state.prev = el.style.display;
        el.style.display = 'none';
        state.hidden = true;
      } else {
        if (state.el) state.el.style.display = state.prev;
        state.el = null;
        state.hidden = false;
      }
      window.dispatchEvent(new Event('resize'));
      return state.hidden;
    },

    useSelector: function (sel) {
      state.selector = sel || null;
    },

    pick: function () {
      window.__mvChat.pickResult = null;
      if (state.hidden) window.__mvChat.set(false);
      startPicking();
      return true;
    },

    /** Structural summary for bug reports. Deliberately carries no message text. */
    describe: function () {
      var v = document.querySelector('video');
      var out = {
        url: location.pathname.slice(0, 60),
        viewport: innerWidth + 'x' + innerHeight,
        videos: document.querySelectorAll('video').length,
        video: v ? Math.round(v.getBoundingClientRect().width) + 'x' +
          Math.round(v.getBoundingClientRect().height) : null,
        byGeometry: !!byGeometry(),
        byMessageList: !!byMessageList(),
        byComposer: !!byComposer(),
        scrollables: [],
        fields: [],
      };
      var nodes = document.querySelectorAll('div, section, aside, ul, ol');
      for (var i = 0; i < nodes.length && out.scrollables.length < 8; i += 1) {
        var el = nodes[i];
        if (el.childElementCount < 3) continue;
        var s = getComputedStyle(el);
        if (!/auto|scroll/.test(s.overflowY)) continue;
        var b = el.getBoundingClientRect();
        if (b.width < 60 || b.height < 60) continue;
        out.scrollables.push({
          tag: el.tagName.toLowerCase(),
          children: el.childElementCount,
          box: Math.round(b.left) + ',' + Math.round(b.top) + ' ' +
            Math.round(b.width) + 'x' + Math.round(b.height),
          scrollable: el.scrollHeight > el.clientHeight + 8,
          hasVideo: holdsVideo(el),
        });
      }
      var fields = document.querySelectorAll('input, textarea, [contenteditable]');
      for (var j = 0; j < fields.length && out.fields.length < 8; j += 1) {
        var f = fields[j];
        out.fields.push({
          tag: f.tagName.toLowerCase(),
          type: f.getAttribute('type') || '',
          placeholder: (f.getAttribute('placeholder') || '').slice(0, 40),
          aria: (f.getAttribute('aria-label') || '').slice(0, 40),
          testid: (f.getAttribute('data-testid') || '').slice(0, 40),
        });
      }
      return JSON.stringify(out);
    },
  };

  return true;
}

window.CHAT_HOOK_SOURCE = '(' + mvChatHook.toString() + ')();';
