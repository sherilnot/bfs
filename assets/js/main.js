/* ============================================================
   Shape Shopfitters — core interaction layer
   Vanilla JS, no dependencies, no build step.
   Advanced graphics/motion live in effects.js
   ============================================================ */
window.SSF = window.SSF || {};

(function () {
  'use strict';

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = motionQuery.matches;

  var on = function (el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); };

  /* shared helpers for effects.js */
  window.SSF.reduceMotion = reduceMotion;
  window.SSF.on = on;

  /* A single rAF-throttled scroll bus, split into a measure phase and
     a mutate phase. Subscribers used to read geometry and write styles
     back to back, so each one invalidated layout for the next and the
     browser had to recalculate it synchronously several times a frame.
     All reads now happen first, then all writes. */
  var scrollSubs = [];
  var scrollQueued = false;

  // simple subscribers that only write (no geometry reads)
  window.SSF.onScroll = function (fn) {
    scrollSubs.push({ read: null, write: fn });
    fn();
  };

  // subscribers that must measure before they mutate
  window.SSF.onScrollRW = function (read, write) {
    scrollSubs.push({ read: read, write: write });
    read();
    write();
  };

  function flushScroll() {
    var i;
    for (i = 0; i < scrollSubs.length; i++) {
      if (scrollSubs[i].read) scrollSubs[i].read();
    }
    for (i = 0; i < scrollSubs.length; i++) {
      if (scrollSubs[i].write) scrollSubs[i].write();
    }
    scrollQueued = false;
  }
  on(window, 'scroll', function () {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(flushScroll);
  }, { passive: true });
  on(window, 'resize', function () {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(flushScroll);
  });

  /* ----------------------------------------------------------
     1. Sticky header + scroll progress + back-to-top ring
     ---------------------------------------------------------- */
  var header = document.querySelector('[data-header]');
  var progressBar = document.querySelector('[data-progress-bar]');
  var toTopRing = document.querySelector('[data-to-top-ring]');

  var scrollY = 0, scrollRatio = 0;

  window.SSF.onScrollRW(
    function read() {
      scrollY = window.scrollY || window.pageYOffset;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      scrollRatio = max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0;
    },
    function write() {
      if (header) header.classList.toggle('is-stuck', scrollY > 40);
      if (progressBar) progressBar.style.transform = 'scaleX(' + scrollRatio.toFixed(4) + ')';
      if (toTopRing) toTopRing.style.strokeDashoffset = (1 - scrollRatio).toFixed(4);
    }
  );

  /* ----------------------------------------------------------
     2. Mobile menu
     ---------------------------------------------------------- */
  var menuToggle = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('[data-menu]');

  function setMenu(open) {
    if (!menu || !menuToggle) return;

    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('is-locked', open);

    if (open) {
      menu.hidden = false;
      requestAnimationFrame(function () { menu.classList.add('is-open'); });
    } else {
      menu.classList.remove('is-open');
      var hide = function () { menu.hidden = true; };
      reduceMotion ? hide() : window.setTimeout(hide, 650);
    }
  }

  on(menuToggle, 'click', function () {
    setMenu(menuToggle.getAttribute('aria-expanded') !== 'true');
  });

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-menu-link]'),
    function (link) { on(link, 'click', function () { setMenu(false); }); }
  );

  on(document, 'keydown', function (e) {
    if (e.key === 'Escape' && menu && menu.classList.contains('is-open')) {
      setMenu(false);
      menuToggle.focus();
    }
  });

  /* ----------------------------------------------------------
     3. Hero entrance — staggered words
     ---------------------------------------------------------- */
  var hero = document.querySelector('[data-hero]');
  if (hero) {
    Array.prototype.forEach.call(
      hero.querySelectorAll('[data-word]'),
      function (word, i) { word.style.setProperty('--word-delay', (120 + i * 85) + 'ms'); }
    );
    // effects.js delays this until the preloader clears; this is the fallback
    window.SSF.startHero = function () { hero.classList.add('is-ready'); };
    window.setTimeout(function () { hero.classList.add('is-ready'); }, 3600);
  }

  /* ----------------------------------------------------------
     4. Scroll reveal (IntersectionObserver)
     ---------------------------------------------------------- */
  var revealTargets = [];

  Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (el) {
    var delay = el.getAttribute('data-reveal-delay');
    if (delay) el.style.setProperty('--reveal-delay', delay + 'ms');
    revealTargets.push(el);
  });

  // children of a [data-stagger] parent get an automatic cascade
  Array.prototype.forEach.call(document.querySelectorAll('[data-stagger]'), function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) {
      child.style.setProperty('--reveal-delay', (i * 110) + 'ms');
      revealTargets.push(child);
    });
  });

  ['[data-reveal-mask]', '.underline-sweep', '.stat', '[data-split]'].forEach(function (sel) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
      if (revealTargets.indexOf(el) === -1) revealTargets.push(el);
    });
  });

  window.SSF.observeReveal = function (el) {
    if (!el) return;
    if (reduceMotion || !('IntersectionObserver' in window)) { el.classList.add('is-visible'); return; }
    revealObserver.observe(el);
  };

  var revealObserver = null;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ----------------------------------------------------------
     5. Animated counters
     ---------------------------------------------------------- */
  function runCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;

    if (reduceMotion) { el.textContent = String(target); return; }

    var duration = 1700;
    var start = null;

    function step(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = String(target);
    }
    requestAnimationFrame(step);
  }

  var counters = document.querySelectorAll('[data-count]');
  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(counters, runCounter);
  } else {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCounter(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(counters, function (el) { countObserver.observe(el); });
  }

  /* ----------------------------------------------------------
     6. Seamless marquees
     Works for the logo strip, hero ticker and big-type rows.
     The set is cloned once so translateX(-50%) loops perfectly.
     ---------------------------------------------------------- */
  if (!reduceMotion) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-marquee-clone]'), function (root) {
      var set = root.querySelector('[data-marquee-set]');
      if (!set) return;

      var track = set.parentElement;
      var clone = set.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.removeAttribute('data-marquee-set');
      track.appendChild(clone);

      // constant pixel-per-second speed regardless of content width
      var w = set.getBoundingClientRect().width;
      if (w > 0) {
        var speed = Math.min(90, Math.max(16, Math.round(w / 55)));
        track.style.setProperty('--marquee-speed', speed + 's');
      }
    });
  }

  /* ----------------------------------------------------------
     7. Subtle parallax on flagged images
     ---------------------------------------------------------- */
  var parallaxItems = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'))
    .map(function (el) {
      return { el: el, amount: parseFloat(el.getAttribute('data-parallax')) || 0.08, offset: null };
    });

  if (parallaxItems.length && !reduceMotion) {
    window.SSF.onScrollRW(
      function read() {
        var vh = window.innerHeight;
        for (var i = 0; i < parallaxItems.length; i++) {
          var item = parallaxItems[i];
          var rect = item.el.getBoundingClientRect();
          if (rect.bottom < -200 || rect.top > vh + 200) { item.offset = null; continue; }
          item.offset = (rect.top + rect.height / 2 - vh / 2) * item.amount * -1;
        }
      },
      function write() {
        for (var i = 0; i < parallaxItems.length; i++) {
          var item = parallaxItems[i];
          if (item.offset === null) continue;
          item.el.style.transform = 'translate3d(0,' + item.offset.toFixed(2) + 'px,0) scale(1.06)';
        }
      }
    );
  }

  /* ----------------------------------------------------------
     8. Smooth in-page nav + back to top
     ---------------------------------------------------------- */
  function scrollToEl(el) {
    var headerH = header ? header.offsetHeight : 0;
    var top = el.getBoundingClientRect().top + window.scrollY - headerH - 12;
    window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (link) {
    on(link, 'click', function (e) {
      var id = link.getAttribute('href');
      if (!id || id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      scrollToEl(target);
    });
  });

  on(document.querySelector('[data-to-top]'), 'click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  /* ----------------------------------------------------------
     9. Active nav highlight while scrolling
     ---------------------------------------------------------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));

  if (sections.length && navLinks.length && 'IntersectionObserver' in window) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = '#' + entry.target.id;
        navLinks.forEach(function (link) {
          var match = link.getAttribute('href') === id;
          link.classList.toggle('is-current', match);
          match ? link.setAttribute('aria-current', 'page')
                : link.removeAttribute('aria-current');
        });
      });
    }, { threshold: 0.4, rootMargin: '-15% 0px -45% 0px' });

    sections.forEach(function (section) { navObserver.observe(section); });
  }
})();
