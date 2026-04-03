/**
 * components.js — shared nav + footer loader
 *
 * Fetches /components/nav.html and /components/footer.html, injects them
 * into #site-nav and #site-footer, then wires up all nav behaviour:
 *   - Mobile drawer open/close
 *   - Nav scroll shadow (adds .scrolled when page scrolls > 10px)
 *   - Active link highlighting based on current pathname
 *   - Auth-aware link labels (via window.CP.updateNav once cp-api loads)
 *   - CONFIG email/phone hydration (via window.CONFIG)
 *
 * This is a plain classic script — no ES module syntax — so it runs on
 * every page regardless of whether that page uses type="module" scripts.
 * It must be placed AFTER config.js and AFTER the cp-api.js module tag.
 */

(function () {
  'use strict';

  /* ── 1. Fetch both components in parallel ── */
  var navReq    = fetch('/components/nav.html').then(function (r) { return r.text(); });
  var footerReq = fetch('/components/footer.html').then(function (r) { return r.text(); });

  Promise.all([navReq, footerReq]).then(function (results) {
    var navHtml    = results[0];
    var footerHtml = results[1];

    /* ── 2. Inject HTML ── */
    var navSlot    = document.getElementById('site-nav');
    var footerSlot = document.getElementById('site-footer');
    if (navSlot)    navSlot.innerHTML    = navHtml;
    if (footerSlot) footerSlot.innerHTML = footerHtml;

    /* ── Customize nav for apply pages ── */
    if (window.location.pathname.startsWith('/apply/')) {
      var navInner = document.querySelector('.nav-inner');
      if (navInner) {
        // Add back link before logo
        var backLink = document.createElement('a');
        backLink.href = '/listings.html';
        backLink.className = 'nav-back-link';
        backLink.innerHTML = '← <span>Back to Listings</span>';
        var navLogo = navInner.querySelector('.nav-logo');
        if (navLogo) {
          navInner.insertBefore(backLink, navLogo);
        }
        // Add language toggle to nav-links
        var navLinks = navInner.querySelector('.nav-links');
        if (navLinks) {
          var langBtn = document.createElement('button');
          langBtn.type = 'button';
          langBtn.id = 'langToggle';
          langBtn.className = 'nav-lang-toggle';
          langBtn.innerHTML = '<i class="fas fa-language"></i> <span id="langText">Español</span>';
          navLinks.appendChild(langBtn);
        }
      }
      // Add to mobile drawer
      var drawerBody = document.querySelector('.nav-drawer-body');
      if (drawerBody) {
        var langBtnDrawer = document.createElement('button');
        langBtnDrawer.type = 'button';
        langBtnDrawer.id = 'langToggleDrawer';
        langBtnDrawer.className = 'nav-drawer-link';
        langBtnDrawer.innerHTML = '<i class="fas fa-language"></i> <span id="langTextDrawer">Español</span>';
        drawerBody.appendChild(langBtnDrawer);
      }
    }

    /* ── I-030: Set og:url to the real current URL ── */
    /* Overrides any hardcoded staging domain in the HTML meta tag.    */
    /* property.html manages its own #ogUrl dynamically — querySelector */
    /* will still find it but location.href is always correct there too.*/
    var ogUrlMeta = document.querySelector('meta[property="og:url"]');
    if (ogUrlMeta) ogUrlMeta.setAttribute('content', location.href);

    /* ── 3. Set active nav link by pathname or route prefix ── */
    var path = window.location.pathname;
    document.querySelectorAll('[data-nav-path]').forEach(function (el) {
      var targetPath = el.getAttribute('data-nav-path');
      if (!targetPath) return;

      if (targetPath === path) {
        el.classList.add('active');
        return;
      }

      // Landlord/admin pages share top-level context with toggle links.
      if (targetPath === '/landlord/register.html' && path.indexOf('/landlord/') === 0) {
        el.classList.add('active');
        return;
      }
      if (targetPath === '/admin/login.html' && path.indexOf('/admin/') === 0) {
        el.classList.add('active');
        return;
      }
    });

    /* ── 4. Wire mobile drawer ── */
    setupMobileDrawer();

    /* ── 5. Wire nav scroll shadow ── */
    setupNavScroll();

    /* ── 6. Hydrate CONFIG email/phone ── */
    hydrateConfig();

    /* ── 7. Call updateNav once window.CP is ready ── */
    waitForCP(function () {
      window.CP.updateNav();
    });

  }).catch(function (err) {
    console.error('[components.js] Failed to load nav/footer components:', err);
  });

  /* ─────────────────────────────────────────────────────────────
   * setupMobileDrawer
   * Canonical implementation — replaces all per-page inline versions.
   * ───────────────────────────────────────────────────────────── */
  function setupMobileDrawer() {
    var toggle  = document.getElementById('mobileToggle');
    var drawer  = document.getElementById('navDrawer');
    var overlay = document.getElementById('drawerOverlay');
    var close   = document.getElementById('drawerClose');
    if (!toggle || !drawer || !overlay || !close) return;

    function openDrawer() {
      overlay.classList.add('visible');
      setTimeout(function () {
        overlay.classList.add('open');
        drawer.classList.add('open');
      }, 10);
      document.body.style.overflow = 'hidden';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
    }

    function closeDrawer() {
      overlay.classList.remove('open');
      drawer.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(function () {
        overlay.classList.remove('visible');
      }, 360);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    }

    toggle.addEventListener('click', openDrawer);
    close.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    });
  }

  /* ─────────────────────────────────────────────────────────────
   * setupNavScroll
   * Adds .scrolled to #mainNav when page scrolls > 10px.
   * ───────────────────────────────────────────────────────────── */
  function setupNavScroll() {
    var nav = document.getElementById('mainNav');
    if (!nav) return;
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────
   * hydrateConfig
   * Fills data-cfg-email / data-cfg-phone elements from window.CONFIG.
   * Also sets #drawerFooterEmail.
   * ───────────────────────────────────────────────────────────── */
  function hydrateConfig() {
    if (!window.CONFIG) return;
    document.querySelectorAll('[data-cfg-email]').forEach(function (el) {
      el.href = 'mailto:' + CONFIG.COMPANY_EMAIL;
      el.textContent = CONFIG.COMPANY_EMAIL;
    });
    document.querySelectorAll('[data-cfg-phone]').forEach(function (el) {
      el.href = 'tel:' + CONFIG.COMPANY_PHONE.replace(/\D/g, '');
      el.textContent = CONFIG.COMPANY_PHONE;
    });
    var drawerEmail = document.getElementById('drawerFooterEmail');
    if (drawerEmail) {
      drawerEmail.href = 'mailto:' + CONFIG.COMPANY_EMAIL;
      drawerEmail.textContent = CONFIG.COMPANY_EMAIL;
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * waitForCP
   * Polls for window.CP (set by cp-api.js module) then runs cb.
   * Gives up after ~3 seconds to avoid infinite loops on pages
   * where cp-api is genuinely not present.
   * ───────────────────────────────────────────────────────────── */
  function waitForCP(cb) {
    if (window.CP && window.CP.updateNav) { cb(); return; }
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (window.CP && window.CP.updateNav) {
        clearInterval(timer);
        cb();
      } else if (attempts > 60) {
        clearInterval(timer); // give up after ~3 s
      }
    }, 50);
  }

})();
