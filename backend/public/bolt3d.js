/* ============================================================
   SHAX STORE — 3D Golden Lightning (hero decoration)
   A rotatable, glowing gold lightning bolt. Drag/touch to spin.
   Tap/click to spark — smaller bolts burst outward and fade.
   Purely decorative. Falls back to a flat SVG bolt if WebGL or
   Three.js is unavailable.
   ============================================================ */

(function () {
  'use strict';

  function initBolt3D() {
    const canvas   = document.getElementById('bolt-3d-canvas');
    const fallback = document.getElementById('bolt-3d-fallback');
    if (!canvas) return;

    if (typeof THREE === 'undefined') {
      if (fallback) fallback.style.display = 'flex';
      canvas.style.display = 'none';
      return;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch (e) {
      if (fallback) fallback.style.display = 'flex';
      canvas.style.display = 'none';
      return;
    }

    const wrap = canvas.parentElement;
    const size = () => ({ w: wrap.clientWidth || 320, h: wrap.clientHeight || 340 });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    let { w, h } = size();
    renderer.setSize(w, h, false);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(0, 0, 12);

    /* ── Lighting ── */
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xf0f4f8, 2.2);
    key.position.set(5, 7, 8); scene.add(key);
    const rim = new THREE.DirectionalLight(0xd8e0e8, 1.5);
    rim.position.set(-7, 3, -5); scene.add(rim);
    const glow = new THREE.PointLight(0xc0c8d0, 1.4, 50);
    glow.position.set(0, 2, 8); scene.add(glow);

    /* ── Environment map (so the gold reflects + shines) ── */
    let envTex = null;
    (function makeEnv() {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0.0, '#e8ecf0');
        g.addColorStop(0.45, '#9aa0a8');
        g.addColorStop(0.5, '#4a5060');
        g.addColorStop(1.0, '#1a1a20');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(70, 60, 26, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(195, 90, 16, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        envTex = new THREE.CanvasTexture(c);
        envTex.mapping = THREE.EquirectangularReflectionMapping;
        if (THREE.sRGBEncoding) envTex.encoding = THREE.sRGBEncoding;
        scene.environment = envTex;
      } catch (e) { /* optional */ }
    })();

    /* ── Lightning bolt shape (2D outline) ── */
    function makeBoltShape(scale) {
      scale = scale || 1;
      const pts = [
        [ 0.55,  2.0],
        [-0.65,  0.15],
        [ 0.05,  0.15],
        [-0.45, -2.0],
        [ 0.95,  0.35],
        [ 0.20,  0.35]
      ].map(p => [p[0] * scale, p[1] * scale]);

      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.lineTo(pts[0][0], pts[0][1]);
      return s;
    }

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xB0B8C4, metalness: 1.0, roughness: 0.22,
      emissive: 0x4a5060, emissiveIntensity: 0.5
    });
    if (envTex) { goldMat.envMap = envTex; goldMat.envMapIntensity = 1.3; }

    const extrude = {
      steps: 1, depth: 0.5,
      bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16,
      bevelSegments: 5, curveSegments: 6
    };

    const mainGeo = new THREE.ExtrudeGeometry(makeBoltShape(1), extrude);
    mainGeo.center();
    mainGeo.computeVertexNormals();

    const bolt = new THREE.Mesh(mainGeo, goldMat);
    scene.add(bolt);
    bolt.rotation.x = -0.1;

    /* ── Soft glow sprite behind the bolt ── */
    let glowSprite = null;
    (function makeGlow() {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        const rg = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        rg.addColorStop(0, 'rgba(200,210,220,0.55)');
        rg.addColorStop(0.4, 'rgba(176,184,196,0.25)');
        rg.addColorStop(1, 'rgba(176,184,196,0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        const mat = new THREE.SpriteMaterial({
          map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        });
        glowSprite = new THREE.Sprite(mat);
        glowSprite.scale.set(7, 7, 1);
        glowSprite.position.z = -1;
        scene.add(glowSprite);
      } catch (e) { /* optional */ }
    })();

    /* ── Spark bolts (spawned on tap) ──
       Each spark is a small bolt mesh that flies outward, spins, and fades. */
    const sparks = [];
    const sparkMat = new THREE.MeshStandardMaterial({
      color: 0xD4D8DC, metalness: 0.9, roughness: 0.25,
      emissive: 0xA0B0C0, emissiveIntensity: 0.9,
      transparent: true, opacity: 1
    });
    if (envTex) { sparkMat.envMap = envTex; }

    const sparkGeo = new THREE.ExtrudeGeometry(makeBoltShape(0.32), {
      steps: 1, depth: 0.2, bevelEnabled: true,
      bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4
    });
    sparkGeo.center();
    sparkGeo.computeVertexNormals();

    function spawnSparks() {
      const count = 7 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.06 + Math.random() * 0.10;
        m.userData = {
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          vz: (Math.random() - 0.5) * 0.06,
          rx: (Math.random() - 0.5) * 0.3,
          ry: (Math.random() - 0.5) * 0.3,
          rz: (Math.random() - 0.5) * 0.3,
          life: 1
        };
        m.position.set(0, 0, 0.5);
        const s = 0.7 + Math.random() * 0.7;
        m.scale.set(s, s, s);
        scene.add(m);
        sparks.push(m);
      }
      // Quick flash on the main bolt + glow
      goldMat.emissiveIntensity = 1.6;
      if (glowSprite) glowSprite.scale.set(10, 10, 1);
    }

    function updateSparks() {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const m = sparks[i];
        const d = m.userData;
        m.position.x += d.vx;
        m.position.y += d.vy;
        m.position.z += d.vz;
        m.rotation.x += d.rx;
        m.rotation.y += d.ry;
        m.rotation.z += d.rz;
        d.vx *= 0.96; d.vy *= 0.96;
        d.life -= 0.025;
        m.material.opacity = Math.max(0, d.life);
        const sc = m.scale.x * 0.98;
        m.scale.set(sc, sc, sc);
        if (d.life <= 0) {
          scene.remove(m);
          m.material.dispose();
          sparks.splice(i, 1);
        }
      }
      // ease main bolt flash + glow back to normal
      goldMat.emissiveIntensity += (0.5 - goldMat.emissiveIntensity) * 0.08;
      if (glowSprite) {
        const gx = glowSprite.scale.x + (7 - glowSprite.scale.x) * 0.08;
        glowSprite.scale.set(gx, gx, 1);
      }
    }

    /* ── Drag / touch to rotate, tap to spark ── */
    let dragging = false, moved = false;
    let lastX = 0, lastY = 0, velX = 0, velY = 0;
    let autoSpin = true;

    function down(x, y) {
      dragging = true; moved = false; autoSpin = false;
      lastX = x; lastY = y; velX = velY = 0;
      canvas.classList.add('grabbing');
    }
    function move(x, y) {
      if (!dragging) return;
      const dx = x - lastX, dy = y - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      bolt.rotation.y += dx * 0.012;
      bolt.rotation.x += dy * 0.012;
      bolt.rotation.x = Math.max(-1.0, Math.min(1.0, bolt.rotation.x));
      velX = dx * 0.012; velY = dy * 0.012;
      lastX = x; lastY = y;
    }
    function up() {
      if (dragging && !moved) spawnSparks();   // a tap (no real drag) = spark
      dragging = false;
      canvas.classList.remove('grabbing');
    }

    canvas.addEventListener('mousedown', e => down(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener('touchend', up);

    /* ── Resize ── */
    function onResize() {
      const s = size(); w = s.w; h = s.h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    /* ── Render loop ── */
    function animate() {
      requestAnimationFrame(animate);

      if (autoSpin) {
        bolt.rotation.y += 0.012;
      } else if (!dragging) {
        bolt.rotation.y += velX;
        bolt.rotation.x += velY;
        velX *= 0.95; velY *= 0.95;
        bolt.rotation.x += (-0.1 - bolt.rotation.x) * 0.02;
        if (Math.abs(velX) < 0.0007 && Math.abs(velY) < 0.0007) autoSpin = true;
      }
      // gentle bob
      bolt.position.y = Math.sin(Date.now() * 0.0015) * 0.12;

      updateSparks();
      renderer.render(scene, camera);
    }
    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBolt3D);
  } else {
    initBolt3D();
  }
})();
