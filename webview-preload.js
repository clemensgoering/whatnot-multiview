/*
 * Runs in every stream page before its own scripts do.
 *
 * ## Why this exists
 *
 * Whatnot plays its streams over WebRTC: there is a single <video> fed by a
 * MediaStream, and that element is `muted`. The sound is routed through the Web
 * Audio API instead — which is presumably how their own volume slider works, and
 * which means setting `element.volume` cannot affect it at all. Measured on a
 * live stream: zeroing the volume of every media element on the page left it
 * playing at full level.
 *
 * So volume has to be taken at the point every Web Audio graph must pass
 * through: the connection into the context's destination. Any node connecting
 * there is rerouted through a gain node we own. The page's graph is otherwise
 * untouched — nothing is disconnected, no node is replaced — and every hook is
 * wrapped so that a failure degrades to the original behaviour rather than
 * breaking playback.
 *
 * ## Why it is injected rather than run directly
 *
 * A preload runs in an isolated world under contextIsolation, so anything it
 * puts on `window` is invisible to the page — and, more importantly, patching
 * `AudioNode.prototype` there would patch the wrong realm.
 *
 * webFrame.executeJavaScript runs in the page's own world and needs no DOM, so
 * it lands before the first page script. The obvious alternative, appending a
 * <script> element, does not work here: at preload time document.documentElement
 * does not exist yet, and by the time it does the page has already built its
 * audio graph. That was measured, not assumed — the element route consistently
 * arrived one step too late. It stays as a fallback.
 */

const SOURCE = String.raw`
(() => {
  if (window.__mvAudio) return;

  var level = 1;
  var gains = [];
  var patched = false;
  var patchError = null;
  var injectedAt = document.readyState;

  /*
   * A DOM query is not enough. A WebRTC player commonly creates its audio sink
   * with createElement and never appends it, so querySelectorAll never sees the
   * element that is actually making the sound. Everything that could become an
   * audio sink is registered here instead: elements created, elements told to
   * play, and elements handed a MediaStream.
   */
  var registry = [];
  function remember(el) {
    if (!el || registry.indexOf(el) !== -1) return el;
    registry.push(el);
    try { el.volume = level; } catch (e) { /* not ready */ }
    return el;
  }
  function isMedia(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    return tag === 'video' || tag === 'audio';
  }

  function applyToElements() {
    var list = document.querySelectorAll('video, audio');
    for (var i = 0; i < list.length; i += 1) remember(list[i]);
    for (var j = 0; j < registry.length; j += 1) {
      try {
        var el = registry[j];
        // Never unmute an element the page muted on purpose: with WebRTC the
        // muted <video> is deliberate, and unmuting it would double the audio.
        if (Math.abs(el.volume - level) > 0.001) el.volume = level;
      } catch (e) { /* not ready */ }
    }
  }

  /* ---- catch media elements that never reach the DOM ---- */
  try {
    var createElement = Document.prototype.createElement;
    Object.defineProperty(Document.prototype, 'createElement', {
      value: function (tag) {
        var el = createElement.apply(this, arguments);
        if (isMedia(el)) remember(el);
        return el;
      },
      writable: true, configurable: true,
    });

    var mediaProto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (mediaProto) {
      var play = mediaProto.play;
      Object.defineProperty(mediaProto, 'play', {
        value: function () { remember(this); return play.apply(this, arguments); },
        writable: true, configurable: true,
      });

      var srcObject = Object.getOwnPropertyDescriptor(mediaProto, 'srcObject');
      if (srcObject && srcObject.set) {
        Object.defineProperty(mediaProto, 'srcObject', {
          get: srcObject.get,
          set: function (value) { remember(this); return srcObject.set.call(this, value); },
          configurable: true,
        });
      }
    }
  } catch (e) { patchError = 'registry: ' + String(e && e.message ? e.message : e); }

  function applyToGains() {
    for (var i = 0; i < gains.length; i += 1) {
      try { gains[i].gain.value = level; } catch (e) { /* context closed */ }
    }
  }

  /* ---- take the output of every Web Audio graph ---- */
  try {
    var AnyDestination = window.AudioDestinationNode;
    var proto = window.AudioNode && window.AudioNode.prototype;
    if (!proto) patchError = 'no AudioNode';
    else if (!AnyDestination) patchError = 'no AudioDestinationNode';
    if (proto && AnyDestination && typeof proto.connect === 'function') {
      var originalConnect = proto.connect;
      var replacement = function (destination) {
        try {
          if (destination instanceof AnyDestination) {
            var ctx = destination.context;
            if (!ctx.__mvGain) {
              var gain = ctx.createGain();
              gain.gain.value = level;
              originalConnect.call(gain, destination);
              ctx.__mvGain = gain;
              gains.push(gain);
            }
            var rest = Array.prototype.slice.call(arguments, 1);
            return originalConnect.apply(this, [ctx.__mvGain].concat(rest));
          }
        } catch (e) {
          /* fall through to the untouched behaviour */
        }
        return originalConnect.apply(this, arguments);
      };
      // Plain assignment fails silently here: connect is defined non-writable
      // on the prototype, and this code is not in strict mode.
      Object.defineProperty(proto, 'connect', {
        value: replacement, writable: true, configurable: true,
      });
      patched = proto.connect === replacement;
      if (!patched) patchError = 'connect could not be replaced';
    }
  } catch (e) { patchError = String(e && e.message ? e.message : e); }

  window.__mvAudio = {
    set: function (v) {
      level = Math.max(0, Math.min(1, Number(v) || 0));
      applyToGains();
      applyToElements();
      return level;
    },
    get: function () { return level; },
    describe: function () {
      var media = [];
      var list = document.querySelectorAll('video, audio');
      for (var i = 0; i < list.length && i < 6; i += 1) {
        var el = list[i];
        media.push({
          tag: el.tagName.toLowerCase(),
          volume: Math.round(el.volume * 100) / 100,
          muted: el.muted, paused: el.paused, readyState: el.readyState,
          srcObject: Boolean(el.srcObject),
        });
      }
      return JSON.stringify({
        url: location.pathname.slice(0, 60),
        wanted: level,
        mediaCount: list.length,
        registered: registry.length,
        registeredDetail: registry.slice(0, 6).map(function (el) {
          return {
            tag: el.tagName.toLowerCase(),
            inDom: document.contains(el),
            volume: Math.round(el.volume * 100) / 100,
            muted: el.muted, paused: el.paused,
            srcObject: Boolean(el.srcObject),
          };
        }),
        media: media,
        webAudioGains: gains.length,
        patched: patched,
        patchError: patchError,
        injectedAt: injectedAt,
        iframes: document.querySelectorAll('iframe').length,
        hookInstalledAt: 'preload',
      });
    },
  };

  setInterval(function () { applyToGains(); applyToElements(); }, 500);
  document.addEventListener('play', applyToElements, true);
  document.addEventListener('loadedmetadata', applyToElements, true);
})();
`;

/*
 * document.documentElement does not exist yet at the very start, so this retries
 * until there is somewhere to put the script.
 */
function injectViaScriptElement() {
  const root = document.documentElement || document.head || document.body;
  if (!root) return false;
  const script = document.createElement('script');
  script.textContent = SOURCE;
  root.appendChild(script);
  script.remove();
  return true;
}

try {
  const { webFrame } = require('electron');
  webFrame.executeJavaScript(SOURCE);
} catch (e) {
  if (!injectViaScriptElement()) {
    const timer = setInterval(() => {
      if (injectViaScriptElement()) clearInterval(timer);
    }, 5);
    setTimeout(() => clearInterval(timer), 5000);
  }
}
