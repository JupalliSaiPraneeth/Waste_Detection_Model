/* ============================================================
   WastageDetection — Enhanced GSAP Animations & Premium Interactions v2.0
   ============================================================ */

if (typeof gsap !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// ============================================================
// PAGE INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNavbarAnimations();
  initHeroAnimations();
  initCardAnimations();
  initScrollAnimations();
  initButtonEffects();
  initStatsCounters();
  setActiveNav();
});

// ============================================================
// NAVBAR ANIMATIONS
// ============================================================

function initNavbarAnimations() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  let lastScrollY = 0;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > 100) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    
    lastScrollY = currentScrollY;
  });

  // Logo hover animation
  const logo = document.querySelector('.brand');
  if (logo) {
    logo.addEventListener('mouseenter', () => {
      gsap.to('.brand-mark', {
        rotation: 360,
        duration: 0.6,
        ease: 'back.out'
      });
    });
  }

  // Nav link hover effects
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('mouseenter', function() {
      gsap.to(this, {
        color: 'var(--primary)',
        duration: 0.3,
        ease: 'power2.out'
      });
    });

    link.addEventListener('mouseleave', function() {
      if (!this.classList.contains('active')) {
        gsap.to(this, {
          color: 'var(--text-secondary)',
          duration: 0.3,
          ease: 'power2.out'
        });
      }
    });
  });
}

// ============================================================
// HERO ANIMATIONS
// ============================================================

function initHeroAnimations() {
  const heroSection = document.querySelector('.hero-section');
  if (!heroSection) return;

  // Staggered text animations
  const heroTitle = heroSection.querySelector('h1');
  const heroSub = heroSection.querySelector('p');
  const heroButtons = heroSection.querySelectorAll('.btn');

  if (heroTitle) {
    gsap.from(heroTitle, {
      opacity: 0,
      y: 30,
      duration: 0.8,
      ease: 'power2.out',
      delay: 0.2
    });
  }

  if (heroSub) {
    gsap.from(heroSub, {
      opacity: 0,
      y: 20,
      duration: 0.8,
      ease: 'power2.out',
      delay: 0.4
    });
  }

  if (heroButtons.length > 0) {
    gsap.from(heroButtons, {
      opacity: 0,
      y: 20,
      duration: 0.6,
      ease: 'power2.out',
      stagger: 0.1,
      delay: 0.6
    });
  }

  // Scroll indicator animation
  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator) {
    gsap.from(scrollIndicator, {
      opacity: 0,
      y: -20,
      duration: 0.8,
      ease: 'power2.out',
      delay: 1
    });
  }
}

// ============================================================
// CARD ANIMATIONS
// ============================================================

function initCardAnimations() {
  const cards = document.querySelectorAll('.card');
  if (cards.length === 0) return;

  // Card entrance animations with stagger
  gsap.from(cards, {
    opacity: 0,
    y: 30,
    duration: 0.6,
    ease: 'power2.out',
    stagger: {
      amount: 0.3,
      from: 'start'
    },
    scrollTrigger: {
      trigger: cards[0],
      start: 'top 80%',
      markers: false
    }
  });

  // Hover animations for cards
  cards.forEach(card => {
    const isHoverable = !card.closest('.card-trends') || 
                       !card.closest('.card-ministats');

    card.addEventListener('mouseenter', function() {
      gsap.to(this, {
        y: -8,
        duration: 0.3,
        ease: 'power2.out'
      });
    });

    card.addEventListener('mouseleave', function() {
      gsap.to(this, {
        y: 0,
        duration: 0.3,
        ease: 'power2.out'
      });
    });
  });
}

// ============================================================
// SCROLL ANIMATIONS
// ============================================================

function initScrollAnimations() {
  const sections = document.querySelectorAll('.upload-section, .stats-grid');
  
  sections.forEach(section => {
    gsap.fromTo(section, 
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 85%',
          markers: false
        }
      }
    );
  });

  // Stat counter animations
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach((card, index) => {
    gsap.fromTo(card, 
      { opacity: 0, y: 20 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
        delay: index * 0.1,
        scrollTrigger: {
          trigger: card,
          start: 'top 90%',
          markers: false
        }
      }
    );
  });
}

// ============================================================
// BUTTON EFFECTS
// ============================================================

function initButtonEffects() {
  const buttons = document.querySelectorAll('.btn');
  
  buttons.forEach(button => {
    // Hover animations
    button.addEventListener('mouseenter', function() {
      gsap.to(this, {
        scale: 1.05,
        duration: 0.2,
        ease: 'back.out',
        overwrite: 'auto'
      });
    });

    button.addEventListener('mouseleave', function() {
      gsap.to(this, {
        scale: 1,
        duration: 0.2,
        ease: 'power2.out',
        overwrite: 'auto'
      });
    });

    // Click ripple effect
    button.addEventListener('click', function(e) {
      if (this.classList.contains('disabled')) return;

      const rect = this.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        pointer-events: none;
      `;

      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.style.width = ripple.style.height = size + 'px';

      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.appendChild(ripple);

      gsap.to(ripple, {
        scale: 2,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
        onComplete: () => ripple.remove()
      });
    });
  });

  // Icon button animations
  const iconButtons = document.querySelectorAll('.icon-btn');
  iconButtons.forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      gsap.to(this, {
        scale: 1.1,
        duration: 0.2,
        ease: 'back.out'
      });
    });

    btn.addEventListener('mouseleave', function() {
      gsap.to(this, {
        scale: 1,
        duration: 0.2,
        ease: 'power2.out'
      });
    });
  });
}

// ============================================================
// STATS COUNTER ANIMATIONS
// ============================================================

function initStatsCounters() {
  const statCounts = document.querySelectorAll('.stat-count');
  
  statCounts.forEach(stat => {
    // Skip if it contains text like "—" or "N/A"
    const text = stat.textContent.trim();
    if (!text || text === '—' || text === 'N/A' || isNaN(parseInt(text))) return;

    const finalValue = parseInt(text);
    const trigger = stat.closest('.stat-card');

    gsap.from(stat, {
      textContent: 0,
      duration: 1.5,
      ease: 'power2.out',
      snap: { textContent: 1 },
      scrollTrigger: trigger ? {
        trigger: trigger,
        start: 'top 90%',
        markers: false
      } : false,
      onUpdate: function() {
        if (stat) {
          stat.textContent = Math.floor(this.targets()[0].textContent);
        }
      }
    });
  });
}

// ============================================================
// DROPZONE ANIMATIONS
// ============================================================

function initDropzoneAnimations() {
  const dropzone = document.getElementById('dropzone');
  if (!dropzone) return;

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    gsap.to(dropzone, {
      scale: 1.02,
      borderColor: 'var(--primary)',
      duration: 0.2,
      ease: 'power2.out'
    });
  });

  dropzone.addEventListener('dragleave', () => {
    gsap.to(dropzone, {
      scale: 1,
      borderColor: 'var(--border)',
      duration: 0.2,
      ease: 'power2.out'
    });
  });

  dropzone.addEventListener('drop', () => {
    gsap.to(dropzone, {
      scale: 1,
      duration: 0.2,
      ease: 'power2.out'
    });
  });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function setActiveNav() {
  if (typeof window.setActiveNav === 'function' && window.setActiveNav !== setActiveNav) {
    window.setActiveNav();
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

initDropzoneAnimations();

// Export animation library for external use
window.AnimationLib = {
  showNotification: function(msg, type = 'info') {
    const flash = document.createElement('div');
    flash.className = 'flash';
    flash.textContent = msg;
    flash.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background: var(--gradient-primary);
      color: #000;
      border-radius: 0.75rem;
      font-weight: 700;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0, 217, 255, 0.25);
    `;
    document.body.appendChild(flash);
    
    gsap.from(flash, {
      opacity: 0,
      x: 100,
      duration: 0.3,
      ease: 'power2.out'
    });

    gsap.to(flash, {
      opacity: 0,
      x: 100,
      duration: 0.3,
      ease: 'power2.in',
      delay: 2.7
    });

    setTimeout(() => flash.remove(), 3000);
  },

  animateIn: function(element, duration = 0.6) {
    gsap.from(element, {
      opacity: 0,
      y: 20,
      duration: duration,
      ease: 'power2.out'
    });
  },

  pulse: function(element) {
    gsap.to(element, {
      scale: 1.05,
      duration: 0.4,
      ease: 'back.out',
      yoyo: true,
      repeat: 1
    });
  }
};

// Page reveal animation
gsap.from('body', {
  opacity: 0,
  duration: 0.5,
  ease: 'power2.out'
});