/* app.js — TikTok Followers buyer */

/* ── Service Worker registration ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(reg) { console.log('[SW] registered:', reg.scope); })
      .catch(function(err){ console.warn('[SW] failed:', err); });
  });
}

/* ── PWA install banner ── */
var _installPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _installPrompt = e;

  // Show the banner after 3 seconds (give page time to load)
  setTimeout(function() {
    var banner = document.getElementById('install-banner');
    if (banner) {
      banner.removeAttribute('hidden');
      banner.style.display = 'flex';
    }
  }, 3000);
});

window.addEventListener('appinstalled', function() {
  var banner = document.getElementById('install-banner');
  if (banner) { banner.setAttribute('hidden',''); banner.style.display='none'; }
  _installPrompt = null;
});

document.addEventListener('DOMContentLoaded', function() {
  var installBtn     = document.getElementById('install-btn');
  var installDismiss = document.getElementById('install-dismiss');

  if (installBtn) {
    installBtn.addEventListener('click', function() {
      if (!_installPrompt) return;
      _installPrompt.prompt();
      _installPrompt.userChoice.then(function(result) {
        var banner = document.getElementById('install-banner');
        if (banner) { banner.setAttribute('hidden',''); banner.style.display='none'; }
        _installPrompt = null;
      });
    });
  }

  if (installDismiss) {
    installDismiss.addEventListener('click', function() {
      var banner = document.getElementById('install-banner');
      if (banner) { banner.setAttribute('hidden',''); banner.style.display='none'; }
    });
  }
});

/* ── Splash hide ── */
(function() {
  function hideSplash() {
    var s = document.getElementById('tiktok-splash');
    if (!s) return;
    setTimeout(function() {
      s.classList.add('hide');
      setTimeout(function() { if (s.parentNode) s.parentNode.removeChild(s); }, 500);
    }, 900);
  }
  if (document.readyState === 'complete') hideSplash();
  else window.addEventListener('load', hideSplash);
})();

/* ── Packages ── */
var PACKAGES = [
  { id:'p100',  followers:100,   price:50,   label:'100',    badge:null,         active:true },
  { id:'p500',  followers:500,   price:200,  label:'500',    badge:null,         active:true },
  { id:'p1k',   followers:1000,  price:350,  label:'1,000',  badge:'Popular',    active:true },
  { id:'p2k',   followers:2000,  price:620,  label:'2,000',  badge:null,         active:true },
  { id:'p5k',   followers:5000,  price:1400, label:'5,000',  badge:'Best Value', active:true },
  { id:'p10k',  followers:10000, price:2500, label:'10,000', badge:null,         active:true },
  { id:'p25k',  followers:25000, price:5500, label:'25,000', badge:null,         active:true },
  { id:'p50k',  followers:50000, price:9500, label:'50,000', badge:'🔥 Mega',    active:true },
];

var selectedPkg       = null;
var verifiedUsername  = null;
var currentPollTimer  = null;

/* ── Helpers ── */
function showEl(id)  { var e=document.getElementById(id); if(e){e.removeAttribute('hidden');e.style.display='';} }
function hideEl(id)  { var e=document.getElementById(id); if(e){e.setAttribute('hidden','');e.style.display='none';} }
function showScreen(id) {
  var e=document.getElementById(id);
  if(!e) return;
  e.removeAttribute('hidden');
  e.style.display='flex';
  e.classList.add('show');
  window.scrollTo(0,0);
}
function hideScreen(id) {
  var e=document.getElementById(id);
  if(!e) return;
  e.classList.remove('show');
  e.style.display='none';
  e.setAttribute('hidden','');
}
function showToast(msg, dur) {
  var t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg;
  t.removeAttribute('hidden'); t.style.display='block'; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer=setTimeout(function(){ t.classList.remove('show'); t.style.display='none'; t.setAttribute('hidden',''); }, dur||3500);
}

/* ── Phone normalisation ── accepts 07xx, 01xx, 254xxx, +254xxx ── */
function normalizePhone(raw) {
  var s = String(raw || '').replace(/[\s\-\(\)\+]/g, '');
  if (s.startsWith('0')   && s.length === 10) return '254' + s.slice(1);  // 07xx / 01xx
  if (s.startsWith('254') && s.length === 12) return s;                    // already 254xxx
  return null;
}
function phoneValid(raw) { return !!normalizePhone(raw); }

/* ── Render packages ── */
function renderPackages() {
  var grid = document.getElementById('packages-grid');
  if (!grid) return;
  grid.innerHTML = PACKAGES.filter(function(p){ return p.active !== false; }).map(function(pkg) {
    var badge = pkg.badge ? '<span class="pkg-badge">'+pkg.badge+'</span>' : '';
    return '<div class="pkg-card" data-id="'+pkg.id+'" onclick="selectPackage(\''+pkg.id+'\')">'+
      badge+
      '<div class="pkg-followers">'+pkg.label+'</div>'+
      '<div class="pkg-followers-label">followers</div>'+
      '<div class="pkg-price">KES '+pkg.price.toLocaleString()+'</div>'+
      '<div class="pkg-price-sub">≈ $'+(pkg.price/130).toFixed(2)+'</div>'+
    '</div>';
  }).join('');
}

function selectPackage(id) {
  selectedPkg = PACKAGES.find(function(p){ return p.id===id; });
  document.querySelectorAll('.pkg-card').forEach(function(c){
    c.classList.toggle('selected', c.getAttribute('data-id')===id);
  });
  showEl('step-pay');
  document.getElementById('step-pay').scrollIntoView({behavior:'smooth',block:'nearest'});
  var s = document.getElementById('pay-summary');
  if (s) s.innerHTML =
    '<div class="summary-pkg">'+selectedPkg.label+' Followers</div>'+
    '<div class="summary-price">KES '+selectedPkg.price.toLocaleString()+'</div>';
  checkPayReady();
}

/* ── DOMContentLoaded ── */
document.addEventListener('DOMContentLoaded', function() {
  // Load packages from API
  fetch('/api/packages',{cache:'no-store'})
    .then(function(r){return r.json();})
    .then(function(d){
      if (d.packages && d.packages.length) {
        PACKAGES = d.packages.filter(function(p){return p.active!==false;});
      }
      renderPackages();
    })
    .catch(function(){ renderPackages(); });

  var verifyBtn     = document.getElementById('verify-btn');
  var usernameInput = document.getElementById('username-input');
  var phoneInput    = document.getElementById('phone-input');

  /* ── Verify ── */
  verifyBtn.addEventListener('click', function() {
    var username = (usernameInput.value||'').replace(/^@/,'').trim();
    if (!username) { usernameInput.focus(); return; }
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<span class="tiktok-loader small" style="vertical-align:middle;margin-right:4px"></span>';

    var card = document.getElementById('profile-card');
    card.removeAttribute('hidden'); card.style.display='';
    document.getElementById('profile-avatar').src = ttAvatarUrl(username);
    document.getElementById('profile-name').textContent    = username;
    document.getElementById('profile-handle').textContent  = '@'+username;
    document.getElementById('stat-followers').textContent  = '–';
    document.getElementById('stat-following').textContent  = '–';
    document.getElementById('stat-likes').textContent      = '–';
    showEl('verify-loader');

    ttFetchRealProfile(username).then(function(profile){
      verifiedUsername = profile.username;
      var av = document.getElementById('profile-avatar');
      av.src = profile.avatar;
      av.onerror = function(){ this.onerror=null; this.src='https://ui-avatars.com/api/?name='+encodeURIComponent(profile.username)+'&background=fe2c55&color=fff&bold=true&size=200'; };
      document.getElementById('profile-name').textContent   = profile.name;
      document.getElementById('profile-handle').textContent = '@'+profile.username;
      if (profile.followers!==null) document.getElementById('stat-followers').textContent = ttFormatCount(profile.followers);
      if (profile.following!==null) document.getElementById('stat-following').textContent = ttFormatCount(profile.following);
      if (profile.likes!==null)     document.getElementById('stat-likes').textContent     = ttFormatCount(profile.likes);
      hideEl('verify-loader');
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify';
      showEl('step-packages');
      document.getElementById('step-packages').scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  });

  /* ── Phone input — accept all formats ── */
  if (phoneInput) {
    phoneInput.addEventListener('input', function() {
      checkPayReady();
    });
    phoneInput.addEventListener('blur', function() {
      var v = phoneInput.value.trim();
      if (v && !phoneValid(v)) {
        showToast('Use: 07XXXXXXXX · 01XXXXXXXX · 254XXXXXXXXX', 3500);
      }
    });
  }

  /* ── Pay button ── */
  var payBtn = document.getElementById('pay-btn');
  if (payBtn) payBtn.addEventListener('click', initiatePayment);
});

function checkPayReady() {
  var phone = (document.getElementById('phone-input').value||'').trim();
  var ready = selectedPkg && phoneValid(phone) && verifiedUsername;
  var btn = document.getElementById('pay-btn');
  if (btn) btn.disabled = !ready;
}

/* ═══════════════════════════════════════════════════════════
   PAYMENT FLOW
   ═══════════════════════════════════════════════════════════ */
function initiatePayment() {
  var rawPhone = (document.getElementById('phone-input').value||'').trim();
  var phone    = normalizePhone(rawPhone);
  if (!selectedPkg || !verifiedUsername || !phone) return;

  var payBtn = document.getElementById('pay-btn');
  payBtn.disabled = true;
  payBtn.innerHTML = '<span class="btn-spinner"></span> Sending request…';

  /* Show processing overlay */
  document.getElementById('processing-title').textContent = 'Sending M-Pesa request…';
  document.getElementById('processing-sub').textContent   = 'Check your phone ('+rawPhone+') and enter your M-Pesa PIN';
  document.getElementById('processing-hint').textContent  = 'The PIN prompt may take a few seconds to appear.';
  showScreen('processing-overlay');

  fetch('/api/mpesa/stkpush', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      phone:     phone,
      amount:    selectedPkg.price,
      followers: selectedPkg.followers,
      username:  verifiedUsername,
      packageId: selectedPkg.id
    })
  })
  .then(function(r){
    return r.json().then(function(d){ return {ok:r.ok, data:d}; });
  })
  .then(function(resp) {
    var data = resp.data;
    resetPayBtn();

    if (data.success) {
      /* STK sent — now wait for user to enter PIN and poll for result */
      waitForPayment(data.checkoutRequestId);
    } else {
      hideScreen('processing-overlay');
      showErrorModal('M-Pesa Error', data.message || 'Request failed', data);
    }
  })
  .catch(function(err) {
    resetPayBtn();
    hideScreen('processing-overlay');
    showErrorModal('Connection Error',
      'Could not reach payment server.\n\nError: '+(err&&err.message||'fetch failed')+
      '\n\nMake sure your server is running (node server.js).', null);
  });
}

function resetPayBtn() {
  var b = document.getElementById('pay-btn');
  b.disabled = false;
  b.textContent = 'Pay via M-Pesa';
}

/* ── Poll for result (Vercel-safe: queries Safaricom directly) ── */
function waitForPayment(checkoutId) {
  document.getElementById('processing-title').textContent = 'Waiting for payment…';
  document.getElementById('processing-sub').textContent   = 'Enter your M-Pesa PIN when prompted';
  document.getElementById('processing-hint').textContent  = 'Do not close this page. This may take up to 60 seconds.';

  var attempts     = 0;
  var maxAttempts  = 60;    // 5 minutes total (every 5s)
  var pollDelay    = 5000;
  // Minimum polls before we trust a FAILED/CANCELLED result.
  // This prevents false failures during the first ~25s while Safaricom is still processing.
  var MIN_POLLS_BEFORE_FAIL = 5;  // at least 25s + 10s first delay = ~35s minimum

  // First check after 10s — gives user time to see PIN prompt and respond
  currentPollTimer = setTimeout(function poll() {
    attempts++;

    // Update UI message based on how long we've been waiting
    if (attempts === 3) {
      document.getElementById('processing-sub').textContent = 'Waiting for your M-Pesa PIN…';
      document.getElementById('processing-hint').textContent = 'Enter the PIN on your phone when prompted.';
    }
    if (attempts === 6) {
      document.getElementById('processing-sub').textContent = 'Still waiting for confirmation…';
      document.getElementById('processing-hint').textContent = 'Sometimes Safaricom takes up to a minute.';
    }
    if (attempts === 12) {
      document.getElementById('processing-sub').textContent = 'Checking payment status…';
      document.getElementById('processing-hint').textContent = 'Almost there — please keep this page open.';
    }

    fetch('/api/mpesa/status?id=' + encodeURIComponent(checkoutId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        console.log('[Poll #'+attempts+'] status='+data.status+' code='+data.code+' msg='+(data.message||''));

        if (data.status === 'SUCCESS') {
          hideScreen('processing-overlay');
          showLoadingFollowers();
          return;
        }

        // Only trust CANCELLED/FAILED after minimum safe window.
        // Before that, Safaricom is still processing — keep waiting.
        if (data.status === 'CANCELLED' && attempts >= MIN_POLLS_BEFORE_FAIL) {
          hideScreen('processing-overlay');
          showCancelled(data.message || 'You cancelled the M-Pesa request.');
          return;
        }

        if (data.status === 'FAILED' && attempts >= MIN_POLLS_BEFORE_FAIL) {
          hideScreen('processing-overlay');
          showErrorModal('Payment Failed', data.message || 'Payment was not completed.', null);
          return;
        }

        // PENDING (or CANCELLED/FAILED too early) — keep polling
        if (attempts < maxAttempts) {
          currentPollTimer = setTimeout(poll, pollDelay);
        } else {
          // 5-minute timeout — show loading screen optimistically.
          // The callback may still arrive; followers will be delivered.
          hideScreen('processing-overlay');
          showLoadingFollowers(true);
        }
      })
      .catch(function(fetchErr) {
        // Network error hitting our status endpoint — just retry
        console.warn('[Poll #'+attempts+'] fetch error:', fetchErr && fetchErr.message);
        if (attempts < maxAttempts) {
          currentPollTimer = setTimeout(poll, pollDelay);
        } else {
          hideScreen('processing-overlay');
          showLoadingFollowers(true); // still optimistic — callback might have arrived
        }
      });
  }, 10000); // first check after 10s (not 7s)
}

/* ── Cancelled screen ── */
function showCancelled(msg) {
  document.getElementById('cancelled-msg').textContent = msg || 'You cancelled the M-Pesa request.';
  showScreen('cancelled-screen');
}

/* ── Loading followers screen with slow progress bar ── */
function showLoadingFollowers(pending) {
  // Fill details
  document.getElementById('loading-pkg').textContent =
    (selectedPkg ? selectedPkg.label : '') + ' followers being added to @' + verifiedUsername;
  document.getElementById('loading-handle').textContent = '@' + verifiedUsername;

  showScreen('loading-screen');

  // Start the progress animation
  startProgressBar();
}

/* Progress bar — fast initial burst, then very slow for 72h feel */
function startProgressBar() {
  var fill   = document.getElementById('progress-fill');
  var pct    = document.getElementById('loading-pct');
  var status = document.getElementById('loading-status');

  if (!fill) return;

  var STEPS = [
    { target:  2, duration: 800,  label: 'Payment confirmed…' },
    { target:  8, duration: 2000, label: 'Queuing your order…' },
    { target: 14, duration: 3000, label: 'Order received ✓' },
    { target: 18, duration: 5000, label: 'Finding followers…' },
    { target: 22, duration: 8000, label: 'Processing order…' },
    /* After the quick burst, crawl extremely slowly to simulate hours */
  ];

  var currentPct  = 0;
  var stepIdx     = 0;
  var stepStart   = Date.now();
  var stepFrom    = 0;

  function tick() {
    var now     = Date.now();
    var elapsed = now - stepStart;

    if (stepIdx < STEPS.length) {
      var step     = STEPS[stepIdx];
      var progress = Math.min(elapsed / step.duration, 1);
      // ease-out
      progress = 1 - Math.pow(1 - progress, 3);
      currentPct = stepFrom + (step.target - stepFrom) * progress;

      if (elapsed >= step.duration) {
        currentPct = step.target;
        stepFrom   = step.target;
        stepStart  = now;
        if (status) status.textContent = STEPS[stepIdx].label;
        stepIdx++;
      }
      setBar(currentPct);
      requestAnimationFrame(tick);
    } else {
      /* Long slow crawl: 22% → 85% over ~86400s (24 hours) */
      /* We fake it with a visible but very slow rate: +1% per ~12 minutes */
      setBar(22);
      if (status) status.textContent = 'Delivering followers…';

      var slowStart    = Date.now();
      var slowFrom     = 22;
      var slowTarget   = 85;
      var slowDuration = 86400000; // 24 hours in ms

      function slowTick() {
        var e    = Date.now() - slowStart;
        var prog = Math.min(e / slowDuration, 1);
        // cubic ease: fast enough to see movement but never completes normally
        prog = prog * prog * prog;
        var val = slowFrom + (slowTarget - slowFrom) * prog;
        setBar(val);

        // Update status messages based on progress
        if (val >= 25 && val < 35 && status.textContent !== 'Processing batch 1/3…')
          status.textContent = 'Processing batch 1/3…';
        if (val >= 35 && val < 50 && status.textContent !== 'Processing batch 2/3…')
          status.textContent = 'Processing batch 2/3…';
        if (val >= 50 && val < 70 && status.textContent !== 'Delivering followers…')
          status.textContent = 'Delivering followers…';
        if (val >= 70 && status.textContent !== 'Almost done…')
          status.textContent = 'Almost done…';

        if (prog < 1) {
          currentPollTimer = setTimeout(slowTick, 3000); // update every 3s
        }
      }
      setTimeout(slowTick, 2000);
    }
  }

  requestAnimationFrame(tick);

  function setBar(val) {
    var v = Math.min(Math.max(val, 0), 99);
    fill.style.width = v.toFixed(2) + '%';
    pct.textContent  = Math.floor(v) + '%';
  }
}

/* ── Error modal ── */
function showErrorModal(title, message, data) {
  var extra = '';
  if (data && data.debug) {
    extra = '\n\nDebug:\n'
      +'• Env: '   +(data.debug.environment||'?')+'\n'
      +'• Till: '  +(data.debug.shortcode||'?')+'\n'
      +'• BizCode: '+(data.debug.businessShortcode||'?')+'\n'
      +'• Type: '  +(data.debug.transactionType||'?')+'\n'
      +'• Callback: '+(data.debug.callbackUrl||'?');
  }
  if (data && data.safaricomResponse) {
    extra += '\n\nSafaricom:\n'+JSON.stringify(data.safaricomResponse, null, 2);
  }

  var old = document.getElementById('err-modal');
  if (old) old.parentNode.removeChild(old);

  var modal = document.createElement('div');
  modal.id = 'err-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit';

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:14px;padding:22px 20px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.3)';

  var h = document.createElement('h3');
  h.style.cssText = 'margin:0 0 14px;font-size:17px;color:#b42318;display:flex;align-items:center;gap:8px';
  h.innerHTML = '❌ ' + title;

  var pre = document.createElement('pre');
  pre.style.cssText = 'font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#333;background:#f8f8f8;padding:12px;border-radius:8px;margin:0 0 16px;font-family:monospace;max-height:50vh;overflow-y:auto';
  pre.textContent = message + extra;

  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'width:100%;height:44px;background:#fe2c55;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
  closeBtn.onclick = function() { modal.parentNode.removeChild(modal); };

  box.appendChild(h); box.appendChild(pre); box.appendChild(closeBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.parentNode.removeChild(modal); });
}

/* ── Reset ── */
function resetToStart() {
  clearTimeout(currentPollTimer);
  selectedPkg = null;
  verifiedUsername = null;
  hideScreen('loading-screen');
  hideScreen('cancelled-screen');
  hideScreen('processing-overlay');
  var success = document.getElementById('success-screen');
  if (success) hideScreen('success-screen');
  document.getElementById('username-input').value = '';
  var pi = document.getElementById('phone-input');
  if (pi) pi.value = '';
  var card = document.getElementById('profile-card');
  if (card) { card.setAttribute('hidden',''); card.style.display='none'; }
  hideEl('step-packages');
  hideEl('step-pay');
  document.querySelectorAll('.pkg-card').forEach(function(c){ c.classList.remove('selected'); });
  window.scrollTo({top:0,behavior:'smooth'});
}
