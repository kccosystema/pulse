// Generates public/img/qr-pulsepic.svg (the desktop page's "open on your phone"
// code). Run: npm run qr
import QRCode from 'qrcode';
import { writeFile } from 'node:fs/promises';

const svg = await QRCode.toString('https://pulsepic.com/?utm_source=desktop-qr', {
  type: 'svg', errorCorrectionLevel: 'M', margin: 2,
  color: { dark: '#0b0b10', light: '#ffffff' },
});
await writeFile(new URL('../public/img/qr-pulsepic.svg', import.meta.url), svg);
console.log('wrote public/img/qr-pulsepic.svg');
