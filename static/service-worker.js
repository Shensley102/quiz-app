/* Home Page Styling - Fixed to display category images completely */

:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    --accent-color: #2e7d32;
    --light-bg: #f5f5f5;
    --border-radius: 16px;
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    --shadow-hover: 0 12px 48px rgba(0, 0, 0, 0.15);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(180deg, #f8f9ff 0%, #f0f4ff 100%);
    min-height: 100vh;
    color: #333;
}

.container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}

/* ==================== HEADER ==================== */

.header {
    text-align: center;
    margin-bottom: 50px;
    padding: 40px 20px;
}

.header h1 {
    font-size: 2.5rem;
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 15px;
    font-weight: 700;
}

.header p {
    font-size: 1.1rem;
    color: #666;
    font-weight: 500;
}

/* ==================== OFFLINE INDICATOR ==================== */

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

/* ==================== CATEGORIES GRID ==================== */

.categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 30px;
    margin-bottom: 40px;
}

/* ==================== CATEGORY CARD ==================== */

.category-card {
    background: white;
    border-radius: var(--border-radius);
    overflow: hidden;
    box-shadow: var(--shadow);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.category-card:hover {
    transform: translateY(-8px);
    box-shadow: var(--shadow-hover);
}

.category-card:active {
    transform: translateY(-4px);
}

/* ==================== CATEGORY IMAGE ==================== */

.category-image-container {
    width: 100%;
    height: 220px;
    background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.category-image-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
}

/* Fallback styling for missing images */
.category-image-container.no-image {
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    color: white;
    font-size: 3rem;
}

/* ==================== CATEGORY INFO ==================== */

.category-info {
    padding: 25px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.category-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
}

.category-icon {
    font-size: 2rem;
    flex-shrink: 0;
}

.category-title {
    font-size: 1.3rem;
    font-weight: 700;
    color: #333;
    margin: 0;
}

.category-description {
    font-size: 0.95rem;
    color: #666;
    line-height: 1.6;
    margin-bottom: 18px;
    flex-grow: 1;
}

.category-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    transition: all 0.2s ease;
    width: fit-content;
}

.category-link:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.category-link:active {
    transform: translateX(2px);
}

.category-link::after {
    content: '→';
    font-weight: bold;
}

/* ==================== RESPONSIVE DESIGN ==================== */

@media (max-width: 1024px) {
    .categories-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 25px;
    }

    .header h1 {
        font-size: 2rem;
    }

    .header p {
        font-size: 1rem;
    }
}

@media (max-width: 640px) {
    .container {
        padding: 15px;
    }

    .header {
        margin-bottom: 30px;
        padding: 30px 15px;
    }

    .header h1 {
        font-size: 1.6rem;
    }

    .header p {
        font-size: 0.95rem;
    }

    .categories-grid {
        grid-template-columns: 1fr;
        gap: 20px;
    }

    .category-image-container {
        height: 200px;
    }

    .category-info {
        padding: 20px;
    }

    .category-title {
        font-size: 1.2rem;
    }

    .category-description {
        font-size: 0.9rem;
        margin-bottom: 15px;
    }
}

/* ==================== ACCESSIBILITY ==================== */

@media (prefers-reduced-motion: reduce) {
    .category-card,
    .category-link {
        transition: none;
    }

    .category-card:hover {
        transform: none;
    }

    .category-link:hover {
        transform: none;
    }
}

/* ==================== HIGH CONTRAST MODE ==================== */

@media (prefers-contrast: more) {
    .category-card {
        border: 2px solid #333;
    }

    .category-title {
        font-weight: 900;
    }

    .category-description {
        color: #333;
    }
}

/* ==================== DARK MODE SUPPORT ==================== */

@media (prefers-color-scheme: dark) {
    body {
        background: linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%);
        color: #e0e0e0;
    }

    .category-card {
        background: #2a2a2a;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .category-card:hover {
        box-shadow: 0 12px 48px rgba(102, 126, 234, 0.3);
    }

    .category-title {
        color: #e0e0e0;
    }

    .category-description {
        color: #b0b0b0;
    }

    .header h1 {
        -webkit-text-fill-color: white;
    }

    .header p {
        color: #a0a0a0;
    }
}

/* ==================== PRINT STYLES ==================== */

@media print {
    .offline-indicator,
    .category-link {
        display: none;
    }

    .category-card {
        page-break-inside: avoid;
        box-shadow: none;
        border: 1px solid #ddd;
    }

    body {
        background: white;
    }
}
