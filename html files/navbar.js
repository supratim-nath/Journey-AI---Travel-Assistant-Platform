// Unified Navigation & Auth JS for Journey AI
(function() {
    // Inject stylesheet
    if (!document.getElementById('unified-nav-style')) {
        const link = document.createElement('link');
        link.id = 'unified-nav-style';
        link.rel = 'stylesheet';
        link.href = 'navbar.css';
        document.head.appendChild(link);
    }

    // Set initial theme setup immediately to prevent flashes
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
 
    let isHome = false, isPlan = false, isSaved = false;

    // Dynamic nav creation on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        setupNavbar();
        checkAuthStatus();
        setupPageTransitions();
    });

    function setupPageTransitions() {
        document.body.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            
            const href = link.getAttribute('href');
            if (!href) return;
            
            if (link.hostname === window.location.hostname && 
                !href.startsWith('#') && 
                !href.startsWith('javascript:') &&
                !link.getAttribute('target') && 
                !href.includes('/auth/')) {
                
                const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
                const isProtected = href.includes('saved-trips.html') || href.includes('profile.html') || href.includes('ai-suggestions.html');
                if (isProtected && !isLoggedIn) {
                    return;
                }

                let bar = document.querySelector('.global-loading-bar');
                if (!bar) {
                    bar = document.createElement('div');
                    bar.className = 'global-loading-bar';
                    document.body.appendChild(bar);
                }
                bar.style.opacity = '1';
                bar.style.width = '0%';
                setTimeout(() => {
                    bar.style.width = '85%';
                }, 10);
            }
        });
    }


    function setupNavbar() {
        // Find existing nav to replace or insert at top of body
        let navEl = document.querySelector('nav');
        if (!navEl) {
            navEl = document.createElement('nav');
            document.body.prepend(navEl);
        }
        
        navEl.className = 'unified-nav';
        navEl.id = 'unifiedNav';

        // Determine current page to set active tab
        const path = window.location.pathname;
        isHome = path.endsWith('index.html') || path === '/';
        isPlan = path.endsWith('create-trip.html');
        isSaved = path.endsWith('saved-trips.html');
 
        navEl.innerHTML = `
            <div class="unified-nav-inner">
                <a href="index.html" class="unified-nav-logo">
                    <img src="assets/logo.jpg" alt="Journey AI Logo" style="width:32px;height:32px;border-radius:10px;object-fit:cover;border:1px solid rgba(255,255,255,0.2);">
                    Journey <span>AI</span>
                </a>
                <div class="unified-nav-links">
                    <a href="index.html" class="unified-nav-link ${isHome ? 'active' : ''}">Home</a>
                    <a href="create-trip.html" class="unified-nav-link ${isPlan ? 'active' : ''}">Plan Trip</a>
                    <a href="saved-trips.html" id="navSavedLink" class="unified-nav-link ${isSaved ? 'active' : ''}" style="display:none;" onclick="handleProtectedRedirect(event, 'saved-trips.html')">Saved</a>
                </div>
                <div class="unified-account-container" id="unifiedAuthContainer">
                    <button onclick="toggleTheme()" class="unified-iphone-btn" style="width:40px;height:40px;padding:0;justify-content:center;">
                        <i id="unifiedThemeIcon" class="fa-solid fa-moon"></i>
                    </button>
                    <!-- Loading skeleton -->
                    <div style="width:80px;height:36px;background:rgba(0,0,0,0.05);border-radius:9999px;animation:pulse 1.5s infinite;"></div>
                </div>
                <button class="unified-hamburger-btn" id="unifiedHamburger" onclick="toggleMobileMenu(event)">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
            <div class="unified-mobile-menu" id="unifiedMobileMenu"></div>
        `;

        // Inject standard login modal at bottom of body
        if (!document.getElementById('unifiedLoginModal')) {
            const modalContainer = document.createElement('div');
            modalContainer.id = 'unifiedLoginModal';
            modalContainer.className = 'unified-modal';
            modalContainer.innerHTML = `
                <div class="unified-modal-panel">
                    <button class="unified-modal-close" onclick="toggleLoginModal()">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <div id="unifiedLoginView">
                        <div class="unified-modal-header">
                            <h2>Welcome Back</h2>
                            <p>Log in to access your saved trips and plans.</p>
                        </div>
                        <button class="unified-btn-google" onclick="handleGoogleLogin(event)">
                            <img src="https://authjs.dev/img/providers/google.svg" alt="Google Logo">
                            Continue with Google
                        </button>
                        <div class="unified-divider">or</div>
                        <form onsubmit="handleLoginSubmit(event)">
                            <div class="unified-input-group">
                                <i class="fa-solid fa-envelope"></i>
                                <input type="email" id="unifiedLoginEmail" class="unified-input" placeholder="Email Address" required>
                            </div>
                            <div class="unified-input-group">
                                <i class="fa-solid fa-lock"></i>
                                <input type="password" id="unifiedLoginPassword" class="unified-input" placeholder="Password" required>
                            </div>
                            <button type="submit" class="unified-btn-submit">Log In</button>
                        </form>
                        <div class="unified-modal-footer">
                            Don't have an account? <a href="#" onclick="toggleAuthView('signup'); return false;">Sign up</a>
                        </div>
                    </div>

                    <div id="unifiedSignupView" style="display: none;">
                        <div class="unified-modal-header">
                            <h2>Create Account</h2>
                            <p>Unlock infinite possibilities for your next adventure.</p>
                        </div>
                        <button class="unified-btn-google" onclick="handleGoogleLogin(event)">
                            <img src="https://authjs.dev/img/providers/google.svg" alt="Google Logo">
                            Continue with Google
                        </button>
                        <div class="unified-divider">or</div>
                        <form onsubmit="handleSignupSubmit(event)">
                            <div class="unified-input-group">
                                <i class="fa-solid fa-user"></i>
                                <input type="text" id="unifiedSignupName" class="unified-input" placeholder="Full Name" required>
                            </div>
                            <div class="unified-input-group">
                                <i class="fa-solid fa-envelope"></i>
                                <input type="email" id="unifiedSignupEmail" class="unified-input" placeholder="Email Address" required>
                            </div>
                            <div class="unified-input-group">
                                <i class="fa-solid fa-lock"></i>
                                <input type="password" id="unifiedSignupPassword" class="unified-input" placeholder="Create Password" required>
                            </div>
                            <button type="submit" class="unified-btn-submit">Sign Up</button>
                        </form>
                        <div class="unified-modal-footer">
                            Already have an account? <a href="#" onclick="toggleAuthView('login'); return false;">Log in</a>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalContainer);
        }

        // Inject standard feedback modal at bottom of body
        if (!document.getElementById('unifiedFeedbackModal')) {
            const feedbackModal = document.createElement('div');
            feedbackModal.id = 'unifiedFeedbackModal';
            feedbackModal.className = 'unified-modal';
            feedbackModal.innerHTML = `
                <div class="unified-modal-panel">
                    <button class="unified-modal-close" onclick="toggleFeedbackModal()">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <div>
                        <div class="unified-modal-header">
                            <h2>Share Your Feedback</h2>
                            <p>Help us make Journey AI even better for travelers!</p>
                        </div>
                        <form onsubmit="handleFeedbackSubmit(event)">
                            <div class="flex flex-col gap-2 mb-6">
                                <label class="text-xs font-black uppercase opacity-65 tracking-wider">How would you rate us?</label>
                                <div class="flex gap-2 text-2xl select-none" id="feedbackStars" style="color: #cbd5e1;">
                                    <i class="fa-solid fa-star cursor-pointer star-opt transition-colors hover:text-yellow-400 active" data-value="1" onclick="setFeedbackRating(1)"></i>
                                    <i class="fa-solid fa-star cursor-pointer star-opt transition-colors hover:text-yellow-400 active" data-value="2" onclick="setFeedbackRating(2)"></i>
                                    <i class="fa-solid fa-star cursor-pointer star-opt transition-colors hover:text-yellow-400 active" data-value="3" onclick="setFeedbackRating(3)"></i>
                                    <i class="fa-solid fa-star cursor-pointer star-opt transition-colors hover:text-yellow-400 active" data-value="4" onclick="setFeedbackRating(4)"></i>
                                    <i class="fa-solid fa-star cursor-pointer star-opt transition-colors hover:text-yellow-400 active" data-value="5" onclick="setFeedbackRating(5)"></i>
                                </div>
                                <input type="hidden" id="feedbackRatingInput" value="5">
                            </div>
                            <div class="unified-input-group mb-6">
                                <textarea id="feedbackComment" class="unified-input unified-textarea w-full" placeholder="Tell us what you liked or how we can improve..." required></textarea>
                            </div>
                            <button type="submit" class="unified-btn-submit">Submit Feedback</button>
                        </form>
                    </div>
                </div>
            `;
            document.body.appendChild(feedbackModal);
            setupStarHoverHandlers();
        }

        // Inject feedback floating button
        if (!document.getElementById('unifiedFeedbackBtn')) {
            const feedbackBtn = document.createElement('button');
            feedbackBtn.id = 'unifiedFeedbackBtn';
            feedbackBtn.className = 'floating-feedback-btn';
            feedbackBtn.onclick = () => toggleFeedbackModal();
            feedbackBtn.innerHTML = `<i class="fa-solid fa-comments"></i> Feedback`;
            document.body.appendChild(feedbackBtn);
        }

        updateThemeIcon(savedTheme);
        setupModalOutsideClick();
    }

    function setupModalOutsideClick() {
        window.onclick = e => {
            const menu = document.getElementById('unifiedProfileMenu');
            if (menu && !e.target.closest('#unifiedAuthContainer')) {
                menu.classList.remove('active');
            }
 
            const mobileMenu = document.getElementById('unifiedMobileMenu');
            const burger = document.getElementById('unifiedHamburger');
            if (mobileMenu && burger && !e.target.closest('#unifiedMobileMenu') && !e.target.closest('#unifiedHamburger')) {
                mobileMenu.classList.remove('active');
                burger.classList.remove('active');
            }

            const loginModal = document.getElementById('unifiedLoginModal');
            if (loginModal && e.target === loginModal) {
                loginModal.classList.remove('active');
            }

            const feedbackModal = document.getElementById('unifiedFeedbackModal');
            if (feedbackModal && e.target === feedbackModal) {
                feedbackModal.classList.remove('active');
            }
        };
    }

    async function checkAuthStatus() {
        const container = document.getElementById('unifiedAuthContainer');
        if (!container) return;

        try {
            const response = await fetch('/auth/status');
            const data = await response.json();

            if (data.authenticated) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userData', JSON.stringify(data.user));
                renderUserMenu(data.user);
            } else {
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('userData');
                renderLoginButton();
            }
        } catch (err) {
            console.warn('Backend auth check failed, checking local state:', err);
            const localLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            if (localLoggedIn) {
                const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                renderUserMenu(userData);
            } else {
                renderLoginButton();
            }
        }
    }

    function renderUserMenu(user) {
        const container = document.getElementById('unifiedAuthContainer');
        const savedLink = document.getElementById('navSavedLink');
        if (savedLink) savedLink.style.display = 'block';

        const userImage = user.image || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
        const userName = user.fullName || user.name || 'Traveler';
        const userEmail = user.email || '';

        container.innerHTML = `
            <button onclick="toggleTheme()" class="unified-iphone-btn" style="width:40px;height:40px;padding:0;justify-content:center;">
                <i id="unifiedThemeIcon" class="fa-solid fa-moon"></i>
            </button>
            <button onclick="toggleProfile()" class="unified-iphone-btn" style="padding:4px 16px 4px 4px; gap: 8px;">
                <div style="width:32px;height:32px;background:#38BDF8;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    <img src="${userImage}" alt="${userName}" class="navbar-avatar" style="width:100%;height:100%;object-fit:cover;" referrerpolicy="no-referrer" onerror="this.onerror=null; const d=document.createElement('div'); d.textContent=this.alt.charAt(0).toUpperCase(); d.style.cssText='width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#38bdf8,#6366f1);color:white;font-weight:800;font-size:11px;border-radius:50%;'; this.parentNode.replaceChild(d,this);">
                </div>
                <span>Account</span>
            </button>
            <div id="unifiedProfileMenu" class="unified-profile-menu">
                <div class="unified-dropdown-header">
                    <img src="${userImage}" alt="${userName}" class="navbar-avatar" referrerpolicy="no-referrer" onerror="this.onerror=null; const d=document.createElement('div'); d.textContent=this.alt.charAt(0).toUpperCase(); d.style.cssText='width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#38bdf8,#6366f1);color:white;font-weight:800;font-size:14px;border:2px solid rgba(56,189,248,0.4);'; this.parentNode.replaceChild(d,this);">
                    <div class="unified-dropdown-userinfo">
                        <span class="unified-dropdown-name">${userName}</span>
                        <span class="unified-dropdown-email">${userEmail}</span>
                    </div>
                </div>
                <a href="profile.html" class="unified-menu-item">
                    <i class="fa-solid fa-user" style="color:#38BDF8;width:16px;"></i> Profile
                </a>
                <a href="saved-trips.html" class="unified-menu-item">
                    <i class="fa-solid fa-bookmark" style="color:#38BDF8;width:16px;"></i> Saved Trips
                </a>
                <a href="ai-suggestions.html" class="unified-menu-item">
                    <i class="fa-solid fa-wand-magic-sparkles" style="color:#A855F7;width:16px;"></i> AI Suggestions
                </a>
                <div class="unified-menu-divider"></div>
                <button onclick="handleLogout()" class="unified-menu-item unified-menu-logout">
                    <i class="fa-solid fa-right-from-bracket" style="width:16px;"></i> Logout
                </button>
            </div>
        `;

        const mobileMenu = document.getElementById('unifiedMobileMenu');
        if (mobileMenu) {
            mobileMenu.innerHTML = `
                <div class="unified-dropdown-header" style="padding: 0 0 12px 0; margin-bottom: 12px;">
                    <img src="${userImage}" alt="${userName}" class="navbar-avatar" referrerpolicy="no-referrer" onerror="this.onerror=null; const d=document.createElement('div'); d.textContent=this.alt.charAt(0).toUpperCase(); d.style.cssText='width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#38bdf8,#6366f1);color:white;font-weight:800;font-size:14px;border:2px solid rgba(56,189,248,0.4);'; this.parentNode.replaceChild(d,this);">
                    <div class="unified-dropdown-userinfo">
                        <span class="unified-dropdown-name">${userName}</span>
                        <span class="unified-dropdown-email">${userEmail}</span>
                    </div>
                </div>
                <a href="index.html" class="unified-mobile-menu-item ${isHome ? 'active' : ''}">
                    <i class="fa-solid fa-house" style="width:16px;"></i> Home
                </a>
                <a href="create-trip.html" class="unified-mobile-menu-item ${isPlan ? 'active' : ''}">
                    <i class="fa-solid fa-compass" style="width:16px;"></i> Plan Trip
                </a>
                <a href="saved-trips.html" class="unified-mobile-menu-item ${isSaved ? 'active' : ''}" onclick="handleProtectedRedirect(event, 'saved-trips.html')">
                    <i class="fa-solid fa-bookmark" style="width:16px;"></i> Saved Trips
                </a>
                <a href="profile.html" class="unified-mobile-menu-item">
                    <i class="fa-solid fa-user" style="width:16px;"></i> Profile
                </a>
                <a href="ai-suggestions.html" class="unified-mobile-menu-item">
                    <i class="fa-solid fa-wand-magic-sparkles" style="color:#A855F7;width:16px;"></i> AI Suggestions
                </a>
                <div class="unified-menu-divider"></div>
                <button onclick="handleLogout()" class="unified-mobile-menu-item unified-menu-logout" style="border:none;background:transparent;width:100%;text-align:left;">
                    <i class="fa-solid fa-right-from-bracket" style="width:16px;"></i> Logout
                </button>
            `;
        }

        updateThemeIcon(document.documentElement.getAttribute('data-theme'));
    }

    function renderLoginButton() {
        const container = document.getElementById('unifiedAuthContainer');
        const savedLink = document.getElementById('navSavedLink');
        if (savedLink) savedLink.style.display = 'none';

        container.innerHTML = `
            <button onclick="toggleTheme()" class="unified-iphone-btn" style="width:40px;height:40px;padding:0;justify-content:center;">
                <i id="unifiedThemeIcon" class="fa-solid fa-moon"></i>
            </button>
            <button onclick="toggleLoginModal()" class="unified-iphone-btn" style="background:rgba(56,189,248,0.15);color:#38BDF8;border:1px solid rgba(56,189,248,0.25);">
                <i class="fa-solid fa-user"></i> Login
            </button>
        `;

        const mobileMenu = document.getElementById('unifiedMobileMenu');
        if (mobileMenu) {
            mobileMenu.innerHTML = `
                <a href="index.html" class="unified-mobile-menu-item ${isHome ? 'active' : ''}">
                    <i class="fa-solid fa-house" style="width:16px;"></i> Home
                </a>
                <a href="create-trip.html" class="unified-mobile-menu-item ${isPlan ? 'active' : ''}">
                    <i class="fa-solid fa-compass" style="width:16px;"></i> Plan Trip
                </a>
                <div class="unified-menu-divider"></div>
                <button onclick="toggleLoginModal(); toggleMobileMenu();" class="unified-mobile-menu-item" style="border:none;background:rgba(56,189,248,0.15);color:#38BDF8;width:100%;text-align:left;cursor:pointer;">
                    <i class="fa-solid fa-user"></i> Login
                </button>
            `;
        }

        updateThemeIcon(document.documentElement.getAttribute('data-theme'));
    }

    window.toggleLoginModal = function() {
        const modal = document.getElementById('unifiedLoginModal');
        if (modal) {
            modal.classList.toggle('active');
            if (modal.classList.contains('active')) {
                toggleAuthView('login');
            }
        }
    }

    window.toggleProfile = function() {
        const menu = document.getElementById('unifiedProfileMenu');
        if (menu) menu.classList.toggle('active');
    }

    window.toggleMobileMenu = function(e) {
        if (e) e.stopPropagation();
        const burger = document.getElementById('unifiedHamburger');
        const menu = document.getElementById('unifiedMobileMenu');
        if (burger && menu) {
            burger.classList.toggle('active');
            menu.classList.toggle('active');
        }
    }

    window.toggleTheme = function() {
        const current = document.documentElement.getAttribute('data-theme');
        const target = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', target);
        localStorage.setItem('theme', target);
        updateThemeIcon(target);
        
        // Dispatch global event for pages to respond to theme change (like Leaflet map recoloring)
        window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: target } }));
    }

    function updateThemeIcon(theme) {
        const icon = document.getElementById('unifiedThemeIcon');
        if (icon) {
            icon.className = theme === 'dark' ? 'fa-solid fa-sun text-yellow-400' : 'fa-solid fa-moon text-slate-500';
        }
    }

    window.toggleAuthView = function(view) {
        const loginView = document.getElementById('unifiedLoginView');
        const signupView = document.getElementById('unifiedSignupView');
        if (view === 'signup') {
            loginView.style.display = 'none';
            signupView.style.display = 'block';
        } else {
            signupView.style.display = 'none';
            loginView.style.display = 'block';
        }
    }

    window.handleProtectedRedirect = function(e, url) {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (isLoggedIn) {
            if (e) {
                // If it is a normal click redirect
                window.location.href = url;
            }
            return true;
        } else {
            if (e) e.preventDefault();
            // Store target redirect URL so we can send them there after login!
            sessionStorage.setItem('postLoginRedirect', url);
            toggleLoginModal();
            return false;
        }
    }

    window.handleGoogleLogin = function(e) {
        e.preventDefault();
        window.location.href = '/auth/google';
    }

    window.handleLoginSubmit = async function(e) {
        e.preventDefault();
        const email = document.getElementById('unifiedLoginEmail').value;
        const password = document.getElementById('unifiedLoginPassword').value;

        try {
            const response = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            if (data.success) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userData', JSON.stringify(data.user));
                toggleLoginModal();
                checkAuthStatus();
                // Redirect directly to destination if queued, else reload
                const redirectUrl = sessionStorage.getItem('postLoginRedirect');
                if (redirectUrl) {
                    sessionStorage.removeItem('postLoginRedirect');
                    window.location.href = redirectUrl;
                } else {
                    window.location.reload();
                }
            } else {
                showToastNotification(data.message || 'Login failed', 'error');
            }
        } catch (err) {
            console.error('Login error:', err);
            showToastNotification('Connection error during login', 'error');
        }
    }

    window.handleSignupSubmit = async function(e) {
        e.preventDefault();
        const fullName = document.getElementById('unifiedSignupName').value;
        const email = document.getElementById('unifiedSignupEmail').value;
        const password = document.getElementById('unifiedSignupPassword').value;

        try {
            const response = await fetch('/api/users/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, email, password })
            });

            const data = await response.json();
            if (data.success) {
                showToastNotification('Registration successful! Please log in.', 'success');
                toggleAuthView('login');
            } else {
                showToastNotification(data.message || 'Registration failed', 'error');
            }
        } catch (err) {
            console.error('Signup error:', err);
            showToastNotification('Connection error during registration', 'error');
        }
    }

    window.handleLogout = async function() {
        try {
            const response = await fetch('/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userData');
            sessionStorage.removeItem('ritu_session_id');

            window.location.href = 'index.html';
        } catch (err) {
            console.error('Logout error:', err);
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userData');
            window.location.href = 'index.html';
        }
    }

    // ─── CUSTOM TOAST NOTIFICATION ───
    function showToastNotification(message, type = 'success') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        
        let iconClass = 'fa-circle-check';
        if (type === 'error') iconClass = 'fa-circle-xmark';
        else if (type === 'info') iconClass = 'fa-circle-info';

        toast.innerHTML = `
            <i class="fa-solid ${iconClass}"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        // Slide in
        setTimeout(() => toast.classList.add('active'), 50);

        // Slide out and remove
        setTimeout(() => {
            toast.classList.remove('active');
            toast.classList.add('exit');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 400);
        }, 4000);
    }
    window.showNotification = showToastNotification;
    window.showToastNotification = showToastNotification;

    // ─── UNIFIED FEEDBACK DIALOG CALLBACKS ───
    window.toggleFeedbackModal = function() {
        const modal = document.getElementById('unifiedFeedbackModal');
        if (modal) {
            modal.classList.toggle('active');
            if (modal.classList.contains('active')) {
                setFeedbackRating(5);
                document.getElementById('feedbackComment').value = '';
            }
        }
    }

    window.setFeedbackRating = function(value) {
        document.getElementById('feedbackRatingInput').value = value;
        const stars = document.querySelectorAll('.star-opt');
        stars.forEach((star, idx) => {
            star.classList.toggle('active', idx < value);
        });
    }

    window.handleFeedbackSubmit = async function(e) {
        e.preventDefault();
        const rating = document.getElementById('feedbackRatingInput').value;
        const comment = document.getElementById('feedbackComment').value;
        const pageUrl = window.location.href;
        // Try to detect trip destination from session storage or URL
        let tripDestination = '';
        try {
            const tempTrip = JSON.parse(sessionStorage.getItem('tempTrip') || '{}');
            tripDestination = tempTrip.destination || '';
            if (!tripDestination) {
                const urlParams = new URLSearchParams(window.location.search);
                tripDestination = urlParams.get('dest') || '';
            }
        } catch (_) {}

        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating, comment, pageUrl, tripDestination })
            });
            const data = await response.json();
            if (data.success) {
                showToastNotification('Feedback submitted! Thank you.');
                toggleFeedbackModal();
            } else {
                showToastNotification('Failed to submit feedback: ' + data.message, 'error');
            }
        } catch (err) {
            console.error('Feedback Submit Error:', err);
            showToastNotification('Failed to submit feedback due to a connection error.', 'error');
        }
    }

    function setupStarHoverHandlers() {
        const starsContainer = document.getElementById('feedbackStars');
        if (!starsContainer) return;
        const stars = starsContainer.querySelectorAll('.star-opt');
        stars.forEach(star => {
            star.addEventListener('mouseover', function() {
                const val = parseInt(this.getAttribute('data-value'));
                stars.forEach((s, idx) => {
                    s.classList.toggle('hover-active', idx < val);
                });
            });
        });
        starsContainer.addEventListener('mouseleave', function() {
            stars.forEach(s => s.classList.remove('hover-active'));
        });
    }
})();
