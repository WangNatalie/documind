const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, '..', 'dist');
const outputPath = path.join(__dirname, '..', 'documind.zip');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory not found. Run "npm run build" first.');
  process.exit(1);
}

try {
  // Remove old zip if exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Use system zip command (works on Windows with Git Bash, Mac, Linux)
  // For Windows without Git Bash, use PowerShell's Compress-Archive
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // PowerShell command for Windows
    const psCommand = `Compress-Archive -Path "${distDir}\\*" -DestinationPath "${outputPath}" -Force`;
    execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
  } else {
    // zip command for Mac/Linux
    execSync(`cd "${distDir}" && zip -r "${outputPath}" .`, { stdio: 'inherit' });
  }

  const stats = fs.statSync(outputPath);
  console.log(`✓ Extension packaged: documind.zip (${stats.size} bytes)`);
} catch (error) {
  console.error('Failed to create zip:', error.message);
  console.log('\nManual alternative:');
  console.log('1. Navigate to the dist/ folder');
  console.log('2. Select all files');
  console.log('3. Right-click → Send to → Compressed (zipped) folder');
  console.log('4. Rename to documind.zip');
  process.exit(1);
}

