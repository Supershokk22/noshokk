import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import fs from 'fs'
import path from 'path'

const svg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#aa3bff"/>
      <stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="240" fill="url(#g)"/>
  <text x="512" y="640" font-family="Segoe UI, system-ui, sans-serif" font-size="460" font-weight="800" fill="white" text-anchor="middle" letter-spacing="-12">NS</text>
</svg>
`

const outDir = 'public'
fs.mkdirSync(outDir, { recursive: true })

const svgBuf = Buffer.from(svg)
const sizes = [512, 256, 48, 32, 16]
for (const s of sizes) {
  await sharp(svgBuf).resize(s, s).png().toFile(path.join(outDir, `icon-${s}.png`))
  console.log(`[PNG] icon-${s}.png`)
}
await sharp(svgBuf).resize(512, 512).png().toFile(path.join(outDir, 'icon.png'))
console.log('[PNG] icon.png')

const icoBuf = await pngToIco(sizes.map(s => path.join(outDir, `icon-${s}.png`)))
fs.writeFileSync(path.join(outDir, 'icon.ico'), icoBuf)
console.log('[ICO] icon.ico', icoBuf.length, 'bytes')
