/**
 * Generate app and tray icons for Figma AI Responder
 *
 * Creates:
 * - Tray icons (16x16, 32x32) for menu bar - active and inactive states
 * - App icon (multiple sizes) for dock/app bundle
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.join(__dirname, '..', 'assets');

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Chat bubble SVG - filled (active state)
const chatBubbleActiveSVG = `
<svg width="SIZE" height="SIZE" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V10C14 10.5523 13.5523 11 13 11H5L2 14V3Z" fill="black"/>
  <circle cx="11" cy="6.5" r="1.5" fill="white"/>
</svg>
`;

// Chat bubble SVG - outline (inactive state)
const chatBubbleInactiveSVG = `
<svg width="SIZE" height="SIZE" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <path d="M2.5 3C2.5 2.72386 2.72386 2.5 3 2.5H13C13.2761 2.5 13.5 2.72386 13.5 3V10C13.5 10.2761 13.2761 10.5 13 10.5H4.70711L2.5 12.7071V3Z" stroke="black" stroke-width="1" fill="none"/>
</svg>
`;

// App icon SVG - colorful version for dock
const appIconSVG = `
<svg width="SIZE" height="SIZE" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0D99FF"/>
      <stop offset="100%" style="stop-color:#A855F7"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <path d="M96 144C96 126.327 110.327 112 128 112H384C401.673 112 416 126.327 416 144V320C416 337.673 401.673 352 384 352H192L96 448V144Z" fill="white"/>
  <circle cx="352" cy="232" r="40" fill="#0D99FF"/>
</svg>
`;

async function generateTrayIcons() {
  console.log('Generating tray icons...');

  // Generate active icons (16x16 and 32x32 for retina)
  for (const size of [16, 32]) {
    const svg = chatBubbleActiveSVG.replace(/SIZE/g, size);
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(assetsDir, size === 16 ? 'tray-icon-active.png' : 'tray-icon-active@2x.png'));
  }

  // Generate inactive icons
  for (const size of [16, 32]) {
    const svg = chatBubbleInactiveSVG.replace(/SIZE/g, size);
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(assetsDir, size === 16 ? 'tray-icon-inactive.png' : 'tray-icon-inactive@2x.png'));
  }

  console.log('Tray icons created in assets/');
}

async function generateAppIcon() {
  console.log('Generating app icon...');

  const iconsetPath = path.join(assetsDir, 'icon.iconset');

  // Create iconset directory
  if (!fs.existsSync(iconsetPath)) {
    fs.mkdirSync(iconsetPath, { recursive: true });
  }

  // Required sizes for macOS iconset
  const sizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of sizes) {
    const svg = appIconSVG.replace(/SIZE/g, size);

    // Regular size
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetPath, `icon_${size}x${size}.png`));

    // @2x size (for retina, use next size up)
    if (size <= 512) {
      const size2x = size * 2;
      const svg2x = appIconSVG.replace(/SIZE/g, size2x);
      await sharp(Buffer.from(svg2x))
        .resize(size2x, size2x)
        .png()
        .toFile(path.join(iconsetPath, `icon_${size}x${size}@2x.png`));
    }
  }

  console.log('Icon files created in assets/icon.iconset/');

  // Try to create .icns file using iconutil (macOS only)
  try {
    execSync(`iconutil -c icns "${iconsetPath}" -o "${path.join(assetsDir, 'icon.icns')}"`, {
      stdio: 'inherit'
    });
    console.log('Created assets/icon.icns');
  } catch (e) {
    console.log('Note: Could not create .icns file. The iconset folder is ready for manual conversion.');
  }
}

async function main() {
  try {
    await generateTrayIcons();
    await generateAppIcon();
    console.log('\nDone! Icons generated successfully.');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
