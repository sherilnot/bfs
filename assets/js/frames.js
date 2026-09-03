/* ============================================================
   Shape Shopfitters — hero frame sequence
   Plays a converted video (240 WebP frames) once on load and
   holds on the final frame.

   MEMORY IS THE WHOLE STORY HERE.
   A 60 KB WebP decodes to 1280 x 720 x 4 bytes = 3.5 MB of raw
   RGBA. The first version of this file kept every decoded frame
   in an array, so peak memory hit ~960 MB and the entire page
   juddered under the pressure. This version:

   - decodes to ImageBitmap and calls close() the moment a frame
     leaves the screen, which releases the pixels immediately
     instead of waiting for garbage collection
   - only reads ahead a bounded number of frames, so peak memory
     is roughly READ_AHEAD x 3.5 MB rather than 240 x 3.5 MB
   - draws at device pixel ratio 1: the source is 1280 px wide, so
     a higher-density canvas invents no detail and costs several
     times the fill rate

   It also pauses while the hero is off screen or the tab is in
   the background, and falls back to a single static image on
   reduced motion, metered or slow connections, and small screens.
   ============================================================ */
(function () {
  'use strict';

  var SSF = window.SSF || {};
  var on = SSF.on || function (el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); };

  var COUNT = 240;
  var FPS = 24;
  var PATH = 'assets/frames/frame-';
  var EXT = '.webp';
  var FINAL_SRC = 'assets/frames/final.webp';

  var READ_AHEAD = 18;   // bounds peak memory (~63 MB of decoded pixels)
  var CONCURRENCY = 4;   // parallel fetches
  var HEAD_START = 12;   // frames buffered before playback begins

  var canvas = document.querySelector('[data-frames]');
  if (!canvas) return;

  var stage = canvas.parentNode;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  /* ----------------------------------------------------------
     Should the sequence run at all?
     ---------------------------------------------------------- */
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var slowNetwork = false;
  if (conn) {
    if (conn.saveData) slowNetwork = true;
    var et = conn.effectiveType || '';
    if (et === 'slow-2g' || et === '2g' || et === '3g') slowNetwork = true;
  }
  var smallScreen = window.matchMedia('(max-width: 900px)').matches;
  var staticOnly = SSF.reduceMotion || slowNetwork || smallScreen;

  /* ----------------------------------------------------------
     Canvas sizing (cover crop)
     ---------------------------------------------------------- */
  var held = null;      // ImageBitmap or HTMLImageElement currently on screen
  var heldIsBitmap = false;

  function resize() {
    var w = stage.offsetWidth || window.innerWidth;
    var h = stage.offsetHeight || window.innerHeight;

    // Deliberately DPR 1 — see the note at the top of this file.
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    if (held) paint(held);
  }

  function paint(src) {
    var cw = canvas.width, ch = canvas.height;
    var iw = src.width || src.naturalWidth || 1280;
    var ih = src.height || src.naturalHeight || 720;

    var scale = Math.max(cw / iw, ch / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.drawImage(src, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  var resizeTimer = null;
  on(window, 'resize', function () {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 140);
  });

  function reveal() {
    canvas.classList.add('is-ready');
  }

  /* ----------------------------------------------------------
     Decoding helpers
     ---------------------------------------------------------- */
  var canBitmap = typeof window.createImageBitmap === 'function' &&
                  typeof window.fetch === 'function';

  function pad(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : '' + n); }

  function loadBitmap(url) {
    return fetch(url, { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { return b ? createImageBitmap(b) : null; })
      .catch(function () { return null; });
  }

  function loadElement(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function release(src) {
    if (src && typeof src.close === 'function') src.close();
  }

  /* ---------- static fallback ---------- */
  if (staticOnly) {
    resize();
    loadElement(FINAL_SRC).then(function (img) {
      if (!img) return;
      held = img; heldIsBitmap = false;
      paint(img);
      reveal();
    });
    return;
  }

  /* ----------------------------------------------------------
     Sequence state
     ---------------------------------------------------------- */
  var buffer = {};       // index -> decoded frame
  var queued = 0;        // next index to request
  var ready = 0;         // how many have arrived
  var playhead = -1;     // index currently displayed
  var inFlight = 0;
  var started = false;
  var finished = false;

  resize();

  function pump() {
    while (inFlight < CONCURRENCY &&
           queued < COUNT &&
           queued - Math.max(playhead, 0) < READ_AHEAD) {
      request(queued++);
    }
  }

  function request(i) {
    inFlight++;
    var url = PATH + pad(i + 1) + EXT;
    var loader = canBitmap ? loadBitmap(url) : loadElement(url);

    loader.then(function (frame) {
      inFlight--;
      if (finished) { release(frame); return; }

      buffer[i] = frame; // null on failure; playback steps over it
      ready++;

      if (i === 0 && frame && playhead < 0) {
        playhead = 0;
        held = frame; heldIsBitmap = canBitmap;
        paint(frame);
        reveal();
      }

      if (!started && ready >= HEAD_START) start();
      pump();
    });
  }

  /* ----------------------------------------------------------
     Playback — time based so the sequence runs at the intended
     rate regardless of refresh rate.
     ---------------------------------------------------------- */
  var frameMs = 1000 / FPS;
  var clock = 0;
  var paused = false;
  var pausedAt = 0;

  function start() {
    started = true;
    clock = performance.now();
    requestAnimationFrame(tick);
  }

  function pause() {
    if (paused || finished || !started) return;
    paused = true;
    pausedAt = performance.now();
  }

  function resume() {
    if (!paused || finished) return;
    paused = false;
    clock += performance.now() - pausedAt; // shift so no frames are skipped
    requestAnimationFrame(tick);
  }

  function tick(now) {
    if (finished || paused) return;

    var target = Math.floor((now - clock) / frameMs);
    if (target >= COUNT - 1) {
      // only finish once the genuinely final frame has arrived
      if (buffer[COUNT - 1] !== undefined) { advanceTo(COUNT - 1); finish(); return; }
      target = COUNT - 2;
    }

    if (target > playhead) {
      var moved = advanceTo(target);
      if (!moved) {
        // network has not kept up: hold, and slide the clock so
        // playback resumes smoothly rather than jumping ahead
        clock = now - Math.max(playhead, 0) * frameMs;
      }
    }

    pump();
    requestAnimationFrame(tick);
  }

  /* Steps forward one frame at a time, releasing each frame as we
     leave it, and paints only the frame we land on. */
  function advanceTo(target) {
    var moved = false;

    while (playhead < target && buffer[playhead + 1] !== undefined) {
      var leaving = playhead;
      playhead++;
      if (leaving >= 0) {
        release(buffer[leaving]);
        delete buffer[leaving];
      }
      moved = true;
    }

    if (moved && buffer[playhead]) {
      held = buffer[playhead];
      paint(held);
    }
    return moved;
  }

  /* Once the sequence holds, its content never changes again — so
     there is no reason to keep a full-viewport canvas in the
     compositor. Handing the final frame to a plain <img> and
     removing the canvas restored scroll performance in Firefox,
     which was paying for that layer on every scroll frame long
     after playback had ended. */
  function finish() {
    finished = true;

    var poster = document.querySelector('[data-poster]');

    function dropCanvas() {
      canvas.classList.remove('is-ready');   // fade out; the <img> beneath is identical
      window.setTimeout(function () {
        canvas.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = canvas.height = 1;    // free the backing store
      }, 600);

      releaseAll();
    }

    function releaseAll() {
      for (var k in buffer) {
        if (Object.prototype.hasOwnProperty.call(buffer, k)) {
          release(buffer[k]);
          delete buffer[k];
        }
      }
      if (heldIsBitmap) { release(held); }
      held = null;
    }

    if (poster) {
      poster.onload = dropCanvas;
      poster.onerror = dropCanvas;
      poster.src = FINAL_SRC;
      // already cached and decoded
      if (poster.complete && poster.naturalWidth) dropCanvas();
      return;
    }

    // no poster in the markup: keep the canvas and just draw the final frame
    loadElement(FINAL_SRC).then(function (img) {
      if (img) {
        paint(img);
        var old = held;
        held = img; heldIsBitmap = false;
        if (old && old !== img) release(old);
      }
    });
  }

  /* ----------------------------------------------------------
     Don't burn work the visitor cannot see
     ---------------------------------------------------------- */
  on(document, 'visibilitychange', function () {
    document.hidden ? pause() : resume();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.isIntersecting ? resume() : pause(); });
    }, { threshold: 0.05 }).observe(stage);
  }

  pump();
})();
