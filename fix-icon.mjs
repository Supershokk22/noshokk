import pngToIco from 'png-to-ico'
import fs from 'fs'
const buf = await pngToIco(['public/icon-256.png','public/icon-48.png','public/icon-32.png','public/icon-16.png'])
fs.writeFileSync('public/icon.ico', buf)
console.log('[FIXED] ico', buf.length)
