/* ===== Home Page Styles ===== */

/* PWA Offline Indicator */
.offline-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
  padding: 12px 20px;
  text-align: center;
  font-weight: 600;
  font-size: 14px;
  z-index: 10000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.offline-indicator.hidden {
  display: none;
}

/* PWA Update Banner */
.update-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #2f61f3, #45B7D1);
  color: white;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 10001;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.2);
  transform: translateY(100%);
  transition: transform 0.3s ease;
}

.update-banner.show {
  transform: translateY(0);
}

.update-banner.hidden {
  transform: translateY(100%);
}

.update-banner .update-icon {
  font-size: 20px;
}

.update-banner .update-message {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.update-banner .update-btn {
  background: white;
  color: #2f61f3;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.update-banner .update-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.update-banner .update-dismiss {
  background: transparent;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.update-banner .update-dismiss:hover {
  opacity: 1;
}

/* PWA Status */
.pwa-status {
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 8px;
  opacity: 0.7;
}

/* ===== Quote Container Styles ===== */
.quote-container {
  margin-top: 24px;
  animation: fadeInQuote 0.8s ease;
}

@keyframes fadeInQuote {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.quote-wrapper {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 24px 28px;
  max-width: 700px;
  margin: 0 auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
  position: relative;
}

.quote-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.quote-text {
  font-size: 18px;
  font-style: italic;
  color: var(--ink);
  line-height: 1.6;
  margin: 0 0 12px 0;
  quotes: none;
}

.quote-author {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
  font-style: normal;
}

/* Hub Header */
.hub-header {
  text-align: center;
  padding: 60px 20px 40px;
  animation: fadeIn 0.6s ease;
  margin-top: 50px; /* Space for offline indicator */
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hub-header h1 {
  margin: 0 0 16px 0;
  font-size: clamp(32px, 5vw, 48px);
  color: var(--ink);
  font-weight: 800;
  letter-spacing: -1px;
}

.hub-header .tagline {
  margin: 0;
  font-size: clamp(16px, 2.5vw, 20px);
  color: var(--ink-soft);
  font-weight: 500;
}

/* Search Container */
.search-container {
  max-width: 600px;
  margin: 0 auto 40px;
  padding: 0 20px;
}

.search-bar {
  width: 100%;
  padding: 16px 24px;
  font-size: 16px;
  border: 2px solid var(--border);
  border-radius: 50px;
  background: var(--card);
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
}

.search-bar:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 4px rgba(47, 97, 243, 0.1);
}

/* Categories Grid */
.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 0 20px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Category Card */
.category-card {
  position: relative;
  background: var(--card);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
  text-decoration: none;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border: 2px solid transparent;
}

.category-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-md);
  border-color: var(--success);
}

.category-card.image-card {
  background: var(--card);
  padding: 20px;
}

.category-card img {
  max-width: 100%;
  max-height: 160px;
  object-fit: contain;
  transition: transform 0.3s ease;
}

.category-card:hover img {
  transform: scale(1.05);
}

.category-card .fallback-icon {
  display: none;
  font-size: 64px;
  text-align: center;
}

.category-card .card-arrow {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.3s ease;
}

.category-card:hover .card-arrow {
  opacity: 1;
  transform: translateX(0);
}

/* Hub Footer */
.hub-footer {
  text-align: center;
  padding: 60px 20px 40px;
  color: var(--ink-soft);
  font-size: 14px;
}

.hub-footer p {
  margin: 0 0 8px 0;
}

/* Install PWA Button */
.install-pwa-btn {
  display: none;
  margin: 20px auto;
  padding: 12px 24px;
  background: linear-gradient(135deg, var(--primary), var(--success));
  color: white;
  border: none;
  border-radius: 30px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(47, 97, 243, 0.3);
}

.install-pwa-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(47, 97, 243, 0.4);
}

.install-pwa-btn.show {
  display: inline-block;
}

/* Responsive */
@media (max-width: 768px) {
  .hub-header {
    padding: 40px 16px 30px;
    margin-top: 50px;
  }

  .hub-header h1 {
    font-size: 28px;
  }

  .hub-header .tagline {
    font-size: 15px;
  }

  .categories-grid {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 0 16px;
  }

  .category-card {
    min-height: 160px;
  }

  .category-card .card-arrow {
    opacity: 1;
    transform: translateX(0);
  }

  .quote-wrapper {
    padding: 20px;
    margin: 0 10px;
  }

  .quote-text {
    font-size: 16px;
  }

  .quote-author {
    font-size: 13px;
  }

  .update-banner {
    flex-wrap: wrap;
    padding: 12px 16px;
    gap: 8px;
  }

  .update-banner .update-message {
    flex-basis: 100%;
    text-align: center;
    order: 1;
  }

  .update-banner .update-icon {
    order: 0;
  }

  .update-banner .update-btn {
    order: 2;
  }

  .update-banner .update-dismiss {
    order: 3;
    position: absolute;
    top: 8px;
    right: 8px;
  }
}

@media (max-width: 480px) {
  .hub-header h1 {
    font-size: 24px;
  }

  .category-card {
    min-height: 140px;
  }

  .quote-icon {
    font-size: 24px;
  }

  .quote-text {
    font-size: 15px;
  }
}

/* Safe area insets for iOS PWA */
@supports (padding-top: env(safe-area-inset-top)) {
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
  
  .offline-indicator {
    padding-top: calc(12px + env(safe-area-inset-top));
  }

  .update-banner {
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }
}
