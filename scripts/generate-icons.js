// Generate PWA icons from SVG favicon

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcons() {
  try {
    console.log('Generating PWA icons...');
    
    // Read the SVG favicon
    const svgContent = fs.readFileSync(path.join(__dirname, '../public/favicon.svg'), 'utf8');
    
    // Create a temporary HTML to render SVG
    const htmlContent = `
      <html>
        <body style="margin:0; padding:0;">
          <div style="width:1024px; height:1024px; display:flex; align-items:center; justify-content:center;">
            ${svgContent.replace(/width="100"/, 'width="1024"').replace(/height="100"/, 'height="1024"')}
          </div>
        </body>
      </html>
    `;
    
    // Generate icons for each size
    for (const size of sizes) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      
      // Create a simple icon using canvas drawing
      // Cork board background
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#D2B48C');
      gradient.addColorStop(0.5, '#DEB887');
      gradient.addColorStop(1, '#F4A460');
      
      ctx.fillStyle = gradient;
      ctx.roundRect(0, 0, size, size, size * 0.08);
      ctx.fill();
      
      // Add some texture
      ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
      const dotSize = size * 0.02;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(
          Math.random() * size,
          Math.random() * size,
          dotSize,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      
      // Add note cards
      const cardSize = size * 0.25;
      const cardColors = ['#FFF8DC', '#E6F3FF', '#FFE6E6'];
      
      for (let i = 0; i < 3; i++) {
        const x = (size * 0.2) + (i * size * 0.2);
        const y = (size * 0.3) + (i % 2) * (size * 0.15);
        
        ctx.save();
        ctx.translate(x + cardSize/2, y + cardSize/2);
        ctx.rotate((Math.random() - 0.5) * 0.3);
        ctx.translate(-cardSize/2, -cardSize/2);
        
        // Card background
        ctx.fillStyle = cardColors[i];
        ctx.roundRect(0, 0, cardSize, cardSize, cardSize * 0.05);
        ctx.fill();
        
        // Card border
        ctx.strokeStyle = '#DDD';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Card lines
        ctx.strokeStyle = '#CCC';
        ctx.lineWidth = size * 0.002;
        for (let j = 1; j <= 3; j++) {
          const lineY = cardSize * 0.3 * j;
          ctx.beginPath();
          ctx.moveTo(cardSize * 0.1, lineY);
          ctx.lineTo(cardSize * 0.9, lineY);
          ctx.stroke();
        }
        
        // Push pin
        ctx.fillStyle = ['#E74C3C', '#3498DB', '#2ECC71'][i];
        ctx.beginPath();
        ctx.arc(cardSize/2, cardSize * 0.15, size * 0.02, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
      
      // Save the icon
      const buffer = canvas.toBuffer('image/png');
      const filename = `icon-${size}x${size}.png`;
      fs.writeFileSync(path.join(iconsDir, filename), buffer);
      
      console.log(`Generated ${filename}`);
    }
    
    console.log('All PWA icons generated successfully!');
    
  } catch (error) {
    console.error('Failed to generate icons:', error);
    // Fallback: create simple colored squares
    await generateFallbackIcons();
  }
}

async function generateFallbackIcons() {
  console.log('Generating fallback icons...');
  
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Simple gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#6b46c1');
    gradient.addColorStop(1, '#8b5cf6');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Add "C" letter
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', size/2, size/2);
    
    const buffer = canvas.toBuffer('image/png');
    const filename = `icon-${size}x${size}.png`;
    fs.writeFileSync(path.join(iconsDir, filename), buffer);
  }
  
  console.log('Fallback icons generated successfully!');
}

// Run the icon generation
generateIcons();