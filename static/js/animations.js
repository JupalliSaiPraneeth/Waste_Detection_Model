/* ============================================================
   GSAP Animations & Premium Interactions
   ============================================================ */

// Register GSAP plugins if available
if (typeof gsap !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// ============================================================
// PAGE INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNavbarAnimations();
  initHeroAnimations();
  initStatsCounters();
  initCardAnimations();
  initScrollAnimations();
  initMicroInteractions();
  initButtonEffects();
  setActiveNav();
});

// ============================================================
// NAVBAR ANIMATIONS
// ============================================================

function initNavbarAnimations() {
  const navbar = document.querySelector('.navbar');
  let lastScrollY = 0;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > 100 && !navbar.classList.contains('scrolled')) {
      // Keep navbar appearance consistent; only mark as scrolled for semantic hooks.
      navbar.classList.add('scrolled');
    } else if (currentScrollY <= 100 && navbar.classList.contains('scrolled')) {
      navbar.classList.remove('scrolled');
    }
    
    lastScrollY = currentScrollY;
  });

  // Logo hover animation
  const logo = document.querySelector('.brand');
  if (logo) {
    logo.addEventListener('mouseenter', () => {
      gsap.to('.brand-mark', {
        scale: 1.2,
        rotation: 10,
        duration: 0.3
      });
    });

    logo.addEventListener('mouseleave', () => {
      gsap.to('.brand-mark', {
        scale: 1,
        rotation: 0,
        duration: 0.3
      });
    });
  }
}

// ============================================================
// HERO SECTION ANIMATIONS
// ============================================================

function initHeroAnimations() {
  const heroSection = document.querySelector('.hero-section');
  if (!heroSection) return;

  // Particle animation
  initParticleBackground();

  // Stagger text animation
  const heroTitle = document.querySelector('.hero-title');
  const heroSub = document.querySelector('.hero-sub');
  const heroCtas = document.querySelector('.hero-ctas');

  if (typeof gsap !== 'undefined' && heroTitle) {
    const tl = gsap.timeline();
    
    tl.fromTo(heroTitle, 
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.8 }
    )
    .fromTo(heroSub,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6 },
      '-=0.4'
    )
    .fromTo('.hero-ctas .btn',
      { opacity: 0, y: 20, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.15 },
      '-=0.3'
    );
  }

  // Magnetic button effect on hero CTAs
  document.querySelectorAll('.hero-ctas .btn').forEach(btn => {
    addMagneticEffect(btn);
  });
}

// ============================================================
// PARTICLE BACKGROUND
// ============================================================

function initParticleBackground() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = canvas.offsetHeight;

  const particles = [];
  const particleCount = 50;

  class Particle {
    constructor() {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.size = Math.random() * 2 + 1;
      this.speedX = Math.random() * 0.5 - 0.25;
      this.speedY = Math.random() * 0.5 - 0.25;
      this.opacity = Math.random() * 0.5 + 0.2;
    }

    update() {
      this.x += this.speedX;
      this.y += this.speedY;

      if (this.x > w) this.x = 0;
      if (this.x < 0) this.x = w;
      if (this.y > h) this.y = 0;
      if (this.y < 0) this.y = h;
    }

    draw() {
      ctx.fillStyle = `rgba(16, 185, 129, ${this.opacity})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Create particles
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  // Animation loop
  function animate() {
    ctx.clearRect(0, 0, w, h);
    
    particles.forEach(p => {
      p.update();
      p.draw();
    });

    requestAnimationFrame(animate);
  }

  animate();

  // Resize handler
  window.addEventListener('resize', () => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  });
}

// ============================================================
// STATS COUNTERS WITH ANIMATION
// ============================================================

function initStatsCounters() {
  if (typeof gsap === 'undefined') return;

  const statValues = document.querySelectorAll('[data-target]');
  
  statValues.forEach(el => {
    const target = parseInt(el.getAttribute('data-target')) || 0;
    const counter = { value: 0 };

    gsap.to(counter, {
      value: target,
      duration: 2.5,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 80%',
        once: true
      },
      onUpdate: () => {
        el.textContent = Math.round(counter.value);
      }
    });
  });
}

// ============================================================
// SCROLL-TRIGGERED ANIMATIONS
// ============================================================

function initScrollAnimations() {
  if (typeof gsap === 'undefined' || !ScrollTrigger) return;

  // Animate cards on scroll
  document.querySelectorAll('.glass-card, .img-card, .stat-card').forEach((card, index) => {
    gsap.fromTo(card,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        scrollTrigger: {
          trigger: card,
          start: 'top 85%',
          once: true
        },
        delay: index * 0.1
      }
    );
  });

  // Parallax effect
  const parallaxElements = document.querySelectorAll('[data-parallax]');
  parallaxElements.forEach(el => {
    gsap.to(el, {
      y: () => ScrollTrigger.getEntry(el).progress * 50,
      scrollTrigger: {
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        scrub: 1
      }
    });
  });
}

// ============================================================
// MICRO INTERACTIONS - BUTTON EFFECTS
// ============================================================

function initButtonEffects() {
  document.querySelectorAll('.btn').forEach(btn => {
    // Ripple effect
    btn.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.classList.add('ripple');

      this.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });

    // Add ripple style if not already present
    if (!document.querySelector('style[data-ripple]')) {
      const style = document.createElement('style');
      style.setAttribute('data-ripple', 'true');
      style.textContent = `
        .btn { position: relative; overflow: hidden; }
        .ripple {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.6);
          transform: scale(0);
          animation: rippleAnimation 0.6s ease-out;
          pointer-events: none;
        }
        @keyframes rippleAnimation {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
  });
}

// ============================================================
// CARD HOVER ANIMATIONS
// ============================================================

function initCardAnimations() {
  document.querySelectorAll('.glass-card, .img-card, .stat-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
      if (typeof gsap !== 'undefined') {
        gsap.to(this, {
          duration: 0.3,
          boxShadow: '0 20px 48px rgba(16, 185, 129, 0.3)',
          ease: 'power2.out'
        });
      }
    });

    card.addEventListener('mouseleave', function() {
      if (typeof gsap !== 'undefined') {
        gsap.to(this, {
          duration: 0.3,
          boxShadow: 'inherit',
          ease: 'power2.out'
        });
      }
    });
  });
}

// ============================================================
// MAGNETIC CURSOR EFFECT
// ============================================================

function addMagneticEffect(element) {
  if (typeof gsap === 'undefined') return;

  let mouseX = 0;
  let mouseY = 0;
  let elementX = 0;
  let elementY = 0;

  element.addEventListener('mousemove', (e) => {
    const rect = element.getBoundingClientRect();
    mouseX = e.clientX - rect.left - rect.width / 2;
    mouseY = e.clientY - rect.top - rect.height / 2;

    gsap.to(element, {
      x: mouseX * 0.3,
      y: mouseY * 0.3,
      duration: 0.4,
      ease: 'power2.out'
    });
  });

  element.addEventListener('mouseleave', () => {
    gsap.to(element, {
      x: 0,
      y: 0,
      duration: 0.4,
      ease: 'power2.out'
    });
  });
}

// ============================================================
// DROPDOWN/TOGGLE ANIMATIONS
// ============================================================

function animateDropdown(trigger, content) {
  if (typeof gsap === 'undefined') return;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = content.style.display !== 'none';
    
    if (isOpen) {
      gsap.to(content, {
        opacity: 0,
        height: 0,
        duration: 0.3,
        onComplete: () => {
          content.style.display = 'none';
        }
      });
    } else {
      content.style.display = 'block';
      gsap.fromTo(content, 
        { opacity: 0, height: 0 },
        { opacity: 1, height: 'auto', duration: 0.3 }
      );
    }
  });
}

// ============================================================
// LOADING STATE ANIMATIONS
// ============================================================

function showLoadingState(element) {
  if (typeof gsap === 'undefined') {
    element.style.opacity = '0.6';
    return;
  }

  gsap.to(element, {
    opacity: 0.6,
    duration: 0.2
  });

  // Create spinner
  const spinner = document.createElement('div');
  spinner.className = 'spinner-overlay';
  spinner.innerHTML = '<div class="spinner"></div>';
  
  const style = document.createElement('style');
  style.textContent = `
    .spinner-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.3);
      border-radius: inherit;
      z-index: 10;
    }
    .spinner {
      width: 30px;
      height: 30px;
      border: 3px solid rgba(16, 185, 129, 0.3);
      border-top-color: #10b981;
      border-radius: 50%;
      animation: spinnerRotate 1s linear infinite;
    }
    @keyframes spinnerRotate {
      to { transform: rotate(360deg); }
    }
  `;
  
  if (!document.querySelector('style[data-spinner]')) {
    style.setAttribute('data-spinner', 'true');
    document.head.appendChild(style);
  }

  element.style.position = 'relative';
  element.appendChild(spinner);

  return spinner;
}

function hideLoadingState(spinner) {
  if (typeof gsap === 'undefined') {
    if (spinner) spinner.remove();
    return;
  }

  if (spinner && spinner.parentElement) {
    gsap.to(spinner, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => spinner.remove()
    });
  }
}

// ============================================================
// TOAST/NOTIFICATION ANIMATIONS
// ============================================================

function showNotification(message, type = 'info', duration = 3000) {
  if (typeof gsap === 'undefined') {
    alert(message);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      background: #1e293b;
      color: #f1f5f9;
      border-left: 4px solid;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      z-index: 1000;
      max-width: 300px;
      word-wrap: break-word;
    }
    .toast-success { border-left-color: #10b981; }
    .toast-error { border-left-color: #ef4444; }
    .toast-warning { border-left-color: #f59e0b; }
    .toast-info { border-left-color: #06b6d4; }
  `;
  
  if (!document.querySelector('style[data-toast]')) {
    style.setAttribute('data-toast', 'true');
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  gsap.fromTo(toast,
    { opacity: 0, x: 400 },
    { opacity: 1, x: 0, duration: 0.3 }
  );

  setTimeout(() => {
    gsap.to(toast, {
      opacity: 0,
      x: 400,
      duration: 0.3,
      onComplete: () => toast.remove()
    });
  }, duration);
}

// ============================================================
// INPUT FOCUS ANIMATIONS
// ============================================================

function initInputAnimations() {
  document.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('focus', function() {
      this.parentElement?.classList.add('focused');
    });

    input.addEventListener('blur', function() {
      if (!this.value) {
        this.parentElement?.classList.remove('focused');
      }
    });
  });
}

// ============================================================
// PAGE TRANSITION ANIMATIONS
// ============================================================

function animatePageTransition(callback) {
  if (typeof gsap === 'undefined') {
    callback?.();
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #10b981, #06b6d4);
    z-index: 9999;
  `;
  document.body.appendChild(overlay);

  gsap.fromTo(overlay,
    { opacity: 0, scaleY: 0 },
    { 
      opacity: 1, 
      scaleY: 1, 
      duration: 0.4,
      transformOrigin: 'top',
      onComplete: () => {
        callback?.();
        gsap.to(overlay, {
          opacity: 0,
          scaleY: 0,
          duration: 0.4,
          transformOrigin: 'bottom',
          onComplete: () => overlay.remove()
        });
      }
    }
  );
}

// ============================================================
// ACTIVE NAV HIGHLIGHT
// ============================================================

function setActiveNav() {
  const links = document.querySelectorAll('.nav-link');
  if (links.length === 0) return;

  const current = window.location.pathname.replace(/\/$/, '') || '/';
  
  links.forEach(a => {
    try {
      const url = new URL(a.href);
      const path = url.pathname.replace(/\/$/, '') || '/';
      if (path === current) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    } catch (e) {
      // ignore invalid URLs
    }
  });
}

// ============================================================
// GENERAL MICRO-INTERACTIONS
// ============================================================

function initMicroInteractions() {
  // Smooth scroll anchors
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      
      e.preventDefault();
      const target = document.querySelector(href);
      if (target && typeof gsap !== 'undefined') {
        gsap.to(window, {
          scrollTo: { y: target, offsetY: 70 },
          duration: 0.8,
          ease: 'power2.inOut'
        });
      }
    });
  });

  // Initialize input animations
  initInputAnimations();
}

// ============================================================
// EXPORT FOR USE
// ============================================================

window.AnimationLib = {
  showLoadingState,
  hideLoadingState,
  showNotification,
  animatePageTransition,
  addMagneticEffect,
  animateDropdown
};
