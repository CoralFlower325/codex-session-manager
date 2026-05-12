// ─── animateCardDelete ───────────────────────────────────────────────────────

export function animateCardDelete(cardElement) {
  return new Promise((resolve) => {
    if (!cardElement) { resolve(); return; }

    cardElement.classList.add('card-exit');

    const onEnd = () => {
      cardElement.removeEventListener('animationend', onEnd);
      cardElement.remove();
      resolve();
    };

    cardElement.addEventListener('animationend', onEnd);

    // Fallback in case animationend doesn't fire
    setTimeout(() => {
      if (cardElement.parentNode) {
        cardElement.remove();
      }
      resolve();
    }, 600);
  });
}

// ─── animateCardInsert ──────────────────────────────────────────────────────

export function animateCardInsert(container, cardElement, index = 0) {
  if (!container || !cardElement) return;

  cardElement.classList.add('card-enter');

  if (index === 0) {
    container.prepend(cardElement);
  } else {
    const children = container.children;
    if (index < children.length) {
      container.insertBefore(cardElement, children[index]);
    } else {
      container.appendChild(cardElement);
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cardElement.classList.add('card-enter-active');
    });
  });

  cardElement.addEventListener('animationend', () => {
    cardElement.classList.remove('card-enter', 'card-enter-active');
  }, { once: true });
}

// ─── staggerCards ────────────────────────────────────────────────────────────

export function staggerCards(cards) {
  if (!cards) return;
  const nodeList = cards instanceof NodeList ? Array.from(cards) : Array.from(cards);
  nodeList.forEach((card, i) => {
    card.style.animationDelay = `${i * 50}ms`;
    card.classList.add('stagger-in');
  });
}

// ─── animateViewTransition ──────────────────────────────────────────────────

export function animateViewTransition(fromView, toView) {
  return new Promise((resolve) => {
    if (fromView) {
      fromView.classList.add('view-exit');
    }

    const fromDuration = fromView
      ? parseFloat(getComputedStyle(fromView).animationDuration) * 1000 || 300
      : 0;

    setTimeout(() => {
      if (fromView) {
        fromView.classList.remove('view-exit');
        fromView.style.display = 'none';
      }
      if (toView) {
        toView.style.display = 'block';
        toView.classList.add('view-enter');
        requestAnimationFrame(() => {
          toView.classList.add('view-enter-active');
        });
        toView.addEventListener('animationend', () => {
          toView.classList.remove('view-enter', 'view-enter-active');
          resolve();
        }, { once: true });

        // Fallback
        setTimeout(() => {
          toView.classList.remove('view-enter', 'view-enter-active');
          resolve();
        }, 600);
      } else {
        resolve();
      }
    }, fromDuration || 300);
  });
}

// ─── createParticleBurst ────────────────────────────────────────────────────

export function createParticleBurst(x, y) {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const particleCount = 20 + Math.floor(Math.random() * 11); // 20-30
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 2.5,
      alpha: 1,
      // Ice-blue to white gradient
      r: Math.floor(180 + Math.random() * 75),
      g: Math.floor(210 + Math.random() * 45),
      b: 255,
    });
  }

  let frame;
  const startTime = performance.now();
  const lifetime = 2000;

  function draw(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / lifetime, 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.alpha = 1 - progress;

      if (p.alpha > 0) {
        alive = true;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha})`;
        ctx.fill();
      }
    }

    if (alive && progress < 1) {
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
      canvas.remove();
    }
  }

  frame = requestAnimationFrame(draw);

  // Safety cleanup
  setTimeout(() => {
    cancelAnimationFrame(frame);
    if (canvas.parentNode) canvas.remove();
  }, lifetime + 200);
}

