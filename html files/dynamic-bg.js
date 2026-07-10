(function () {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.right = '0';
    canvas.style.bottom = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width, height;
    let time = 0;
    let particles = [];

    function initParticles() {
        particles = [];
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const count = isDark ? 60 : 35;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                size: (Math.random() * 2 + 0.6) * window.devicePixelRatio,
                speedX: (Math.random() - 0.5) * 0.5 * window.devicePixelRatio,
                speedY: (Math.random() - 0.5) * 0.5 * window.devicePixelRatio,
                alpha: Math.random() * 0.45 + 0.1,
                phase: Math.random() * Math.PI
            });
        }
    }

    function resize() {
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = window.innerHeight;
        width = canvas.width = viewportWidth * window.devicePixelRatio;
        height = canvas.height = viewportHeight * window.devicePixelRatio;
        canvas.style.width = viewportWidth + 'px';
        canvas.style.height = viewportHeight + 'px';
        initParticles();
    }
    window.addEventListener('resize', resize);
    resize();


    function drawBundle(lineCount, baseY, colorR, colorG, colorB, baseAlpha, timeSpeed, freq1, freq2) {
        for (let i = 0; i < lineCount; i++) {
            ctx.beginPath();
            // Vary alpha a bit throughout the bundle to give depth
            const alpha = baseAlpha * (0.3 + (i / lineCount) * 0.7);

            // Resolve colors if they are functions (for gradients across the bundle)
            const r = typeof colorR === 'function' ? colorR(i, lineCount) : colorR;
            const g = typeof colorG === 'function' ? colorG(i, lineCount) : colorG;
            const b = typeof colorB === 'function' ? colorB(i, lineCount) : colorB;

            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.lineWidth = window.devicePixelRatio * 1.5;

            // Define points across width
            for (let x = -100; x <= width + 100; x += 40) {
                const nx = x / width; // normalized x (0 to 1)

                // Construct organic fluid movement using multiple sine waves
                const wave1 = Math.sin(nx * freq1 + time * timeSpeed) * height * 0.2;
                const wave2 = Math.cos(nx * freq2 - time * timeSpeed * 0.8) * height * 0.2;
                const wave3 = Math.sin(nx * (freq1 + freq2) + time * timeSpeed * 1.2) * height * 0.1;

                // Cause lines to naturally bundle and spread out by making the distance between them 
                // wave-based rather than constant
                const distFromCenter = i - lineCount / 2;
                const gapMultiplier = height * 0.015 + Math.sin(nx * 4 + time * timeSpeed) * height * 0.01;
                const offset = distFromCenter * gapMultiplier;

                const y = baseY + wave1 + wave2 + wave3 + offset;

                if (x === -100) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        time += 0.002;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Draw and update drifting background stardust
        particles.forEach(p => {
            p.x += p.speedX;
            p.y += p.speedY;

            if (p.x < -10) p.x = width + 10;
            if (p.x > width + 10) p.x = -10;
            if (p.y < -10) p.y = height + 10;
            if (p.y > height + 10) p.y = -10;

            p.phase += 0.015;
            const currentAlpha = p.alpha * (0.4 + 0.6 * Math.sin(p.phase));

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = isDark ? `rgba(56, 189, 248, ${currentAlpha})` : `rgba(14, 165, 233, ${currentAlpha * 0.4})`;
            ctx.fill();
        });

        // Dark Mode: lower opacity, Light Mode: higher opacity against white bg
        // Wait, against white bg we need stronger colors (higher opacity) to be visible but elegant.
        const baseAlpha = isDark ? 0.3 : 0.5;

        // Bundle 1: Top-left flowing to center (Blue / Cyan Theme)
        drawBundle(
            25, // count
            height * 0.3, // baseY
            (i, total) => 56 + (i / total) * 40, // R (mix primary 56,189,248) -> slight shift
            (i, total) => 189 - (i / total) * 30, // G
            248, // B
            baseAlpha * 0.8,
            1.0,  // speed
            2.5,  // freq1
            4.0,  // freq2
        );

        // Bundle 2: Bottom-right flowing up (Purple / Pink Theme)
        drawBundle(
            20,
            height * 0.7,
            (i, total) => 139 + (i / total) * 40, // R (purple: 139, 92, 246)
            (i, total) => 92 + (i / total) * 20,  // G
            246,                              // B
            baseAlpha * 1.0,
            0.8,
            3.0,
            2.0
        );

        // Bundle 3: Faint background ambient wave
        drawBundle(
            15,
            height * 0.5,
            56, 189, 248,
            baseAlpha * 0.2,
            0.5,
            1.5,
            2.0
        );

        requestAnimationFrame(draw);
    }

    // Ensure body is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(draw));
    } else {
        requestAnimationFrame(draw);
    }
})();
