/* ============================================================
   Shape Shopfitters — advanced effects layer
   Preloader · custom cursor · magnetic buttons · 3D tilt
   split text · SVG line drawing · scroll timeline
   spotlight cards · 3D testimonial stack
   Depends on the helpers exposed by main.js (window.SSF)
   ============================================================ */
(function () {
  'use strict';

  var SSF = window.SSF || {};
  var reduceMotion = !!SSF.reduceMotion;
  var on = SSF.on || function (el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); };
  var onScroll = SSF.onScroll || function (fn) { fn(); };

  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var canAnimate = !reduceMotion;

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, min, max) { return Math.min(Math.max(v, min), max); };

  /* ==========================================================
     1. PRELOADER
     Progress is tied to real image loading, then the panels
     lift away and the hero entrance is kicked off.
     ========================================================== */
  (function preloader() {
    var root = document.querySelector('[data-preloader]');
    var bar = document.querySelector('[data-preloader-bar]');
    var countEl = document.querySelector('[data-preloader-count]');

    var MIN_MS = 900;   // let the logo finish drawing
    var MAX_MS = 3600;  // hard ceiling — never trap the visitor

    var finished = false;
    var shown = 0;

    function reveal() {
      if (finished) return;
      finished = true;

      if (bar) bar.style.transform = 'scaleX(1)';
      if (countEl) countEl.textContent = '100';

      document.body.classList.remove('is-loading');
      if (root) root.classList.add('is-done');
      if (typeof SSF.startHero === 'function') SSF.startHero();

      window.setTimeout(function () {
        if (root && root.parentNode) root.parentNode.removeChild(root);
      }, 1600);
    }

    // no overlay, or the visitor asked for reduced motion: show the page now
    if (!root || reduceMotion) {
      document.body.classList.remove('is-loading');
      if (root && root.parentNode) root.parentNode.removeChild(root);
      if (typeof SSF.startHero === 'function') SSF.startHero();
      return;
    }

    /* Hard failsafe. This is deliberately a timer rather than part of the
       rAF loop: if rAF is throttled (background tab, low power mode, busy
       CPU) the animation frames stop arriving, and anything gated inside
       them would never run. The page must always reveal itself. */
    var failsafe = window.setTimeout(reveal, MAX_MS);

    function done() {
      window.clearTimeout(failsafe);
      window.setTimeout(reveal, 220);
    }

    // count only eager images, so we are not waiting on lazy ones below the fold
    var watched = Array.prototype.slice
      .call(document.images)
      .filter(function (img) { return img.getAttribute('loading') !== 'lazy'; });

    var total = watched.length;
    var loaded = 0;

    function bump() { if (loaded < total) loaded++; }

    watched.forEach(function (img) {
      if (img.complete) { bump(); return; }
      on(img, 'load', bump);
      on(img, 'error', bump);
    });

    function target() {
      var assetRatio = total ? loaded / total : 1;
      var docRatio = document.readyState === 'complete' ? 1 : 0.7;
      return Math.min(assetRatio * 0.7 + docRatio * 0.3, 1);
    }

    var startedAt = Date.now();

    function tick() {
      if (finished) return;

      var elapsed = Date.now() - startedAt;
      var ceiling = elapsed < MIN_MS ? 0.92 : 1;

      shown = lerp(shown, Math.min(target(), ceiling), 0.1);

      var pct = Math.round(shown * 100);
      if (bar) bar.style.transform = 'scaleX(' + shown.toFixed(3) + ')';
      if (countEl) countEl.textContent = String(pct);

      if (pct >= 99 && elapsed >= MIN_MS) { done(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* ==========================================================
     2. CUSTOM CURSOR
     Dot tracks 1:1, ring eases behind it. States come from
     data-cursor on any element.
     ========================================================== */
  (function cursor() {
    if (!finePointer || !canAnimate) return;

    var root = document.querySelector('[data-cursor-root]');
    var dot = document.querySelector('[data-cursor-dot]');
    var ring = document.querySelector('[data-cursor-ring]');
    var label = document.querySelector('[data-cursor-label]');
    if (!root || !dot || !ring) return;

    document.body.classList.add('has-custom-cursor');

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;
    var seen = false;
    var running = false;

    on(window, 'mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; rx = mx; ry = my; }
      start();
    }, { passive: true });

    on(document, 'mouseleave', function () { root.classList.add('is-hidden'); });
    on(document, 'mouseenter', function () { root.classList.remove('is-hidden'); });
    on(window, 'mousedown', function () { root.classList.add('is-down'); });
    on(window, 'mouseup', function () { root.classList.remove('is-down'); });

    function start() {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    }

    /* This loop used to call requestAnimationFrame unconditionally,
       so it kept running 60 times a second for the entire life of
       the page even when the pointer never moved — style writes and
       a forced frame every tick, forever. It now parks itself once
       the ring has caught up with the pointer, and any movement
       wakes it again. */
    function frame() {
      rx = lerp(rx, mx, 0.18);
      ry = lerp(ry, my, 0.18);

      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';

      if (Math.abs(mx - rx) < 0.15 && Math.abs(my - ry) < 0.15) {
        running = false; // settled: stop asking for frames
        return;
      }
      requestAnimationFrame(frame);
    }

    // delegate state changes so dynamically added nodes work too
    var STATES = ['is-link', 'is-view', 'is-hidden'];

    function clearStates() {
      STATES.forEach(function (c) { root.classList.remove(c); });
    }

    on(document, 'mouseover', function (e) {
      var el = e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (!el) return;
      clearStates();
      var mode = el.getAttribute('data-cursor');
      if (mode === 'view') {
        root.classList.add('is-view');
        if (label) label.textContent = el.getAttribute('data-cursor-text') || 'View';
      } else if (mode === 'hide') {
        root.classList.add('is-hidden');
      } else {
        root.classList.add('is-link');
      }
    }, true);

    on(document, 'mouseout', function (e) {
      var el = e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (!el) return;
      var to = e.relatedTarget;
      if (to && to.closest && to.closest('[data-cursor]') === el) return;
      clearStates();
    }, true);
  })();

  /* ==========================================================
     POINTER EFFECT SCHEDULER
     mousemove can fire far more often than the display refreshes.
     Writing styles directly inside the handler meant several style
     recalculations per frame. Handlers now only record the pointer
     position; a single rAF loop performs the writes, and it stops
     itself when there is nothing left to animate.
     ========================================================== */
  var pointerJobs = [];
  var pointerRunning = false;

  function schedulePointer() {
    if (pointerRunning) return;
    pointerRunning = true;
    requestAnimationFrame(runPointerJobs);
  }

  function runPointerJobs() {
    var stillActive = false;
    for (var i = 0; i < pointerJobs.length; i++) {
      if (pointerJobs[i]()) stillActive = true;
    }
    pointerRunning = false;
    if (stillActive) schedulePointer();
  }

  /* ==========================================================
     3. MAGNETIC BUTTONS
     ========================================================== */
  (function magnetic() {
    if (!finePointer || !canAnimate) return;

    Array.prototype.forEach.call(document.querySelectorAll('[data-magnetic]'), function (el) {
      var STRENGTH = 0.28;
      var MAX = 9;
      var mx = 0, my = 0;
      var active = false, dirty = false;

      // rect is read on enter, not on every move, so we never
      // interleave a layout read with a style write
      var rect = null;

      on(el, 'mouseenter', function () {
        rect = el.getBoundingClientRect();
        active = true;
      });

      on(el, 'mousemove', function (e) {
        if (!rect) rect = el.getBoundingClientRect();
        mx = e.clientX; my = e.clientY;
        dirty = true;
        schedulePointer();
      });

      on(el, 'mouseleave', function () {
        active = false;
        dirty = true;
        rect = null;
        schedulePointer();
      });

      pointerJobs.push(function () {
        if (!dirty) return active;
        dirty = false;

        if (!active) { el.style.transform = ''; return false; }

        var dx = clamp((mx - (rect.left + rect.width / 2)) * STRENGTH, -MAX, MAX);
        var dy = clamp((my - (rect.top + rect.height / 2)) * STRENGTH, -MAX, MAX);
        el.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + (dy - 3).toFixed(2) + 'px,0)';
        return true;
      });
    });
  })();

  /* ==========================================================
     4. 3D TILT on images and project cards
     ========================================================== */
  (function tilt() {
    if (!finePointer || !canAnimate) return;

    Array.prototype.forEach.call(document.querySelectorAll('[data-tilt]'), function (el) {
      var MAX_DEG = el.classList.contains('proj') ? 5 : 7;
      var rect = null;
      var mx = 0, my = 0;
      var active = false, dirty = false;

      on(el, 'mouseenter', function () {
        rect = el.getBoundingClientRect();
        el.classList.add('is-tilting');
        active = true;
      });

      on(el, 'mousemove', function (e) {
        if (!rect) rect = el.getBoundingClientRect();
        mx = e.clientX; my = e.clientY;
        dirty = true;
        schedulePointer();
      });

      on(el, 'mouseleave', function () {
        active = false;
        dirty = true;
        schedulePointer();
      });

      pointerJobs.push(function () {
        if (!dirty) return active;
        dirty = false;

        if (!active) {
          el.classList.remove('is-tilting');
          el.style.transform = '';
          rect = null;
          return false;
        }

        var px = (mx - rect.left) / rect.width - 0.5;
        var py = (my - rect.top) / rect.height - 0.5;
        el.style.transform =
          'perspective(900px) rotateY(' + (px * MAX_DEG).toFixed(2) + 'deg) ' +
          'rotateX(' + (-py * MAX_DEG).toFixed(2) + 'deg)';
        return true;
      });
    });
  })();

  /* ==========================================================
     5. HERO DEPTH — layers drift with the pointer
     ========================================================== */
  (function heroDepth() {
    if (!finePointer || !canAnimate) return;

    var hero = document.querySelector('[data-hero]');
    if (!hero) return;

    var layers = Array.prototype.slice.call(hero.querySelectorAll('[data-tilt-layer]'));
    if (!layers.length) return;

    var tx = 0, ty = 0, cx = 0, cy = 0, running = false;

    on(hero, 'mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if (!running) { running = true; requestAnimationFrame(frame); }
    }, { passive: true });

    on(hero, 'mouseleave', function () { tx = 0; ty = 0; });

    function frame() {
      cx = lerp(cx, tx, 0.07);
      cy = lerp(cy, ty, 0.07);

      layers.forEach(function (el) {
        var d = parseFloat(el.getAttribute('data-tilt-layer')) || 8;
        el.style.transform = 'translate3d(' + (-cx * d).toFixed(2) + 'px,' + (-cy * d).toFixed(2) + 'px,0)';
      });

      /* The spec cards previously took a pointer offset through
         marginLeft/marginTop, which forced a layout pass on every
         frame. They keep their transform-based CSS bob instead. */

      if (Math.abs(cx - tx) > 0.001 || Math.abs(cy - ty) > 0.001) {
        requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }
  })();

  /* ==========================================================
     6. SPLIT TEXT — per-character heading reveals
     Words stay intact so line wrapping still works.
     ========================================================== */
  (function splitText() {
    var VOID_SKIP = { BR: 1 };

    function wrapNode(node, chars) {
      var frag = document.createDocumentFragment();

      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.nodeValue.split(/(\s+)/);
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
              return;
            }
            var word = document.createElement('span');
            word.className = 'word';
            for (var i = 0; i < part.length; i++) {
              var c = document.createElement('span');
              c.className = 'char';
              c.textContent = part[i];
              word.appendChild(c);
              chars.push(c);
            }
            frag.appendChild(word);
          });
        } else if (child.nodeType === 1) {
          if (VOID_SKIP[child.tagName]) {
            frag.appendChild(child.cloneNode(false));
          } else {
            var clone = child.cloneNode(false);
            clone.appendChild(wrapNode(child, chars));
            frag.appendChild(clone);
          }
        }
      });

      return frag;
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-split]'), function (el) {
      if (reduceMotion) { el.classList.add('is-split', 'is-visible'); return; }

      var chars = [];
      var frag = wrapNode(el, chars);
      if (!chars.length) return;

      el.textContent = '';
      el.appendChild(frag);
      el.classList.add('is-split');

      chars.forEach(function (c, i) {
        c.style.setProperty('--char-delay', (i * 18) + 'ms');
      });

      // the underline sweep lives inside, so trigger it with the heading
      var sweep = el.querySelector('.underline-sweep');
      if (sweep && SSF.observeReveal) SSF.observeReveal(sweep);
    });
  })();

  /* ==========================================================
     7. SVG LINE DRAWING — blueprint + service icons
     pathLength="1" in the markup means dasharray maths is
     already normalised, so we only toggle a class.
     ========================================================== */
  (function drawSvg() {
    var blueprint = document.querySelector('[data-draw]');

    if (blueprint) {
      var paths = blueprint.querySelectorAll('path, circle');
      Array.prototype.forEach.call(paths, function (p, i) {
        p.style.setProperty('--draw-delay', (300 + i * 130) + 'ms');
      });

      if (reduceMotion) {
        blueprint.classList.add('is-drawn');
      } else {
        window.setTimeout(function () { blueprint.classList.add('is-drawn'); }, 900);
      }
    }

    // service icons draw when their card scrolls in
    if (!('IntersectionObserver' in window) || reduceMotion) {
      Array.prototype.forEach.call(document.querySelectorAll('.svc'), function (c) {
        c.classList.add('is-visible');
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.35 });

    Array.prototype.forEach.call(document.querySelectorAll('.svc'), function (c) { io.observe(c); });
  })();

  /* ==========================================================
     8. SERVICE CARD SPOTLIGHT
     ========================================================== */
  (function spotlight() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-spotlight]'), function (card) {
      var glow = document.createElement('span');
      glow.className = 'svc__glow';
      glow.setAttribute('aria-hidden', 'true');
      card.insertBefore(glow, card.firstChild);

      if (!finePointer || !canAnimate) return;

      /* The glow used to be a radial-gradient whose centre was set
         from custom properties. Moving a gradient's colour stops
         repaints the element, so every pointer move repainted the
         whole card. It is now a fixed gradient sprite that gets
         translated instead, which the compositor handles for free. */
      var rect = null;
      var mx = 0, my = 0;
      var active = false, dirty = false;

      on(card, 'mouseenter', function () {
        rect = card.getBoundingClientRect();
        active = true;
      });

      on(card, 'mousemove', function (e) {
        if (!rect) rect = card.getBoundingClientRect();
        mx = e.clientX; my = e.clientY;
        dirty = true;
        schedulePointer();
      });

      on(card, 'mouseleave', function () {
        active = false;
        rect = null;
      });

      pointerJobs.push(function () {
        if (!active || !dirty) return active;
        dirty = false;
        glow.style.transform =
          'translate3d(' + (mx - rect.left).toFixed(1) + 'px,' + (my - rect.top).toFixed(1) + 'px,0)';
        return true;
      });
    });
  })();

  /* ==========================================================
     9. PROCESS TIMELINE — steps light up as you scroll past
     ========================================================== */
  (function timeline() {
    var section = document.querySelector('[data-timeline]');
    if (!section) return;

    var steps = Array.prototype.slice.call(section.querySelectorAll('[data-pstep]'));
    var meter = section.querySelector('[data-timeline-meter]');
    if (!steps.length) return;

    if (reduceMotion) {
      steps.forEach(function (s) { s.classList.add('is-on'); });
      if (meter) meter.style.transform = 'scaleX(1)';
      return;
    }

    var states = steps.map(function () { return false; });
    var ratio = 0;
    var rw = SSF.onScrollRW || function (r, w) { r(); w(); };

    rw(
      function read() {
        var line = window.innerHeight * 0.62; // activation line, a little below centre
        var reached = 0;
        for (var i = 0; i < steps.length; i++) {
          states[i] = steps[i].getBoundingClientRect().top < line;
          if (states[i]) reached++;
        }
        ratio = clamp(reached / steps.length, 0, 1);
      },
      function write() {
        for (var i = 0; i < steps.length; i++) {
          steps[i].classList.toggle('is-on', states[i]);
        }
        if (meter) meter.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
      }
    );
  })();

  /* ==========================================================
     10. TESTIMONIALS — 3D card stack with swipe + keyboard
     ========================================================== */
  (function stack() {
    var root = document.querySelector('[data-carousel]');
    if (!root) return;

    var viewport = root.querySelector('[data-carousel-viewport]');
    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-slide]'));
    var dotsWrap = root.querySelector('[data-carousel-dots]');
    var prevBtn = root.querySelector('[data-carousel-prev]');
    var nextBtn = root.querySelector('[data-carousel-next]');
    if (!slides.length) return;

    var index = 0;
    var timer = null;
    var busy = false;
    var DELAY = 6800;

    var dots = slides.map(function (_, i) {
      var d = document.createElement('button');
      d.type = 'button';
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-label', 'Testimonial ' + (i + 1));
      d.setAttribute('aria-selected', String(i === 0));
      on(d, 'click', function () { go(i); restart(); });
      if (dotsWrap) dotsWrap.appendChild(d);
      return d;
    });

    function paint() {
      slides.forEach(function (slide, i) {
        var offset = (i - index + slides.length) % slides.length;
        slide.classList.remove('is-leaving');
        slide.setAttribute('data-pos', offset <= 2 ? String(offset) : 'hidden');
        slide.setAttribute('aria-hidden', String(offset !== 0));
      });
      dots.forEach(function (d, i) { d.setAttribute('aria-selected', String(i === index)); });
    }

    function go(next, direction) {
      if (busy) return;
      var normalised = (next + slides.length) % slides.length;
      if (normalised === index) return;

      if (direction === 'forward' && !reduceMotion) {
        // front card flies toward the viewer before the stack shifts
        busy = true;
        var leaving = slides[index];
        leaving.classList.add('is-leaving');
        index = normalised;
        window.setTimeout(function () {
          paint();
          busy = false;
        }, 380);
        dots.forEach(function (d, i) { d.setAttribute('aria-selected', String(i === index)); });
        return;
      }

      index = normalised;
      paint();
    }

    function start() {
      if (reduceMotion || slides.length < 2) return;
      timer = window.setInterval(function () { go(index + 1, 'forward'); }, DELAY);
    }
    function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
    function restart() { stop(); start(); }

    on(prevBtn, 'click', function () { go(index - 1); restart(); });
    on(nextBtn, 'click', function () { go(index + 1, 'forward'); restart(); });

    on(root, 'mouseenter', stop);
    on(root, 'mouseleave', start);
    on(root, 'focusin', stop);
    on(root, 'focusout', start);
    on(document, 'visibilitychange', function () { document.hidden ? stop() : start(); });

    on(root, 'keydown', function (e) {
      if (e.key === 'ArrowLeft') { go(index - 1); restart(); }
      if (e.key === 'ArrowRight') { go(index + 1, 'forward'); restart(); }
    });

    // touch swipe
    if (viewport) {
      var sx = 0, sy = 0, tracking = false;

      on(viewport, 'touchstart', function (e) {
        if (e.touches.length !== 1) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        tracking = true;
        stop();
      }, { passive: true });

      on(viewport, 'touchend', function (e) {
        if (!tracking) return;
        tracking = false;
        var t = e.changedTouches[0];
        var dx = t.clientX - sx;
        var dy = t.clientY - sy;
        if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) {
          dx < 0 ? go(index + 1, 'forward') : go(index - 1);
        }
        start();
      }, { passive: true });
    }

    paint();
    start();
  })();

  /* ==========================================================
     11. PAUSE OFF-SCREEN ANIMATION
     Infinite CSS animations keep the compositor working even when
     the element is nowhere near the viewport. With several
     marquees, drifting gradients and the pulsing CTA rings, that
     was constant background cost on every frame of every scroll.
     ========================================================== */
  (function pauseOffscreen() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    var selectors = [
      '.ticker', '.marquee', '.bigtext__row', '.cta__rings',
      '.blob', '.aurora', '.glow', '.sheen', '.hero__scroll-track'
    ];

    var targets = [];
    selectors.forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        targets.push(el);
      });
    });
    if (!targets.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('is-paused', !entry.isIntersecting);
      });
    }, { rootMargin: '120px' });

    targets.forEach(function (el) {
      el.classList.add('is-paused'); // start paused; the observer releases what is visible
      io.observe(el);
    });
  })();

  /* ==========================================================
     12. FOOTER WORDMARK — horizontal scroll drift
     ========================================================== */
  (function wordmarkDrift() {
    var el = document.querySelector('[data-parallax-x]');
    if (!el || reduceMotion) return;

    var amount = parseFloat(el.getAttribute('data-parallax-x')) || 0.06;
    var shift = null;
    var rw = SSF.onScrollRW || function (r, w) { r(); w(); };

    rw(
      function read() {
        var r = el.getBoundingClientRect();
        var vh = window.innerHeight;
        if (r.bottom < -100 || r.top > vh + 100) { shift = null; return; }
        var progress = (vh - r.top) / (vh + r.height); // 0 → 1 across the viewport
        shift = (progress - 0.5) * r.width * amount;
      },
      function write() {
        if (shift === null) return;
        el.style.transform = 'translate3d(' + shift.toFixed(1) + 'px,0,0)';
      }
    );
  })();
})();
