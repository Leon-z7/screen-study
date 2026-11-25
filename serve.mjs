import { createServer as httpServer } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { randomBytes, randomUUID, createHash, createHmac, createPrivateKey, X509Certificate } from 'node:crypto'
import { spawn } from 'node:child_process'
import { openBanks, parseBank, maxUploadBytes } from './banks.mjs'

function lanAddresses() {
  return [...new Set(Object.entries(networkInterfaces())
    .filter(([name]) => !/vpn|tunnel|^(meta|clash|tun\d*|tap\d*|tailscale|zerotier|wireguard)\b/i.test(name))
    .flatMap(([, entries]) => entries ?? [])
    .filter(({ family, internal, address }) => family === 'IPv4' && !internal &&
      /^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(address))
    .map(({ address }) => address))]
}

const hosts = lanAddresses()
if (process.argv.includes('--lan-addresses')) {
  console.log(hosts.join('\n'))
  process.exit(0)
}

const directory = process.env.STUDY_DATA
if (!directory) throw new Error('Set STUDY_DATA or launch ScreenStudy.exe.')
await mkdir(directory, { recursive: true })
const banks = await openBanks(directory)
const [mobilePage, desktopPage, desktopScript, qrScript] = await Promise.all(
  ['index.html', 'desktop.html', 'desktop.js', 'qrcode.js'].map(name => readFile(new URL(name, import.meta.url))))
const scriptType = 'text/javascript; charset=utf-8'
const ocrFiles = new Map(await Promise.all([
  ['tesseract.min.js', scriptType],
  ['worker.min.js', scriptType],
  ['tesseract-core-lstm.wasm.js', scriptType],
  ['tesseract-core-simd-lstm.wasm.js', scriptType],
  ['chi_sim.traineddata.gz', 'application/gzip'],
  ['eng.traineddata.gz', 'application/gzip']
].map(async ([name, type]) => [
  '/ocr/v1/' + name, { type, body: await readFile(new URL('./ocr/' + name, import.meta.url)) }
])))
const certPath = process.env.STUDY_TLS_CERT
const keyPath = process.env.STUDY_TLS_KEY
const rootPath = process.env.STUDY_TLS_ROOT
const root = rootPath ? await readFile(rootPath) : null
const tls = certPath && keyPath ? {
  cert: new X509Certificate(await readFile(certPath)).toString(),
  key: createPrivateKey({ key: JSON.parse(await readFile(keyPath, 'utf8')), format: 'jwk' }).export({ format: 'pem', type: 'pkcs8' })
} : null
if (keyPath) await unlink(keyPath)
const fingerprint = root ? createHash('sha256').update(root).digest('hex').toUpperCase() : ''
const seed = process.env.STUDY_PAIR_SEED
delete process.env.STUDY_PAIR_SEED

function code(purpose) {
  return (seed ? createHmac('sha256', seed).update(purpose).digest().subarray(0, 18) : randomBytes(18)).toString('base64url')
}
const token = code('knowledge')
const pairPath = '/pair/' + code('pairing')
const adminToken = randomBytes(24).toString('base64url')
const links = []
let setupError = process.env.STUDY_SETUP_ERROR || ''

function profileFor(certificate) {
  const digest = createHash('sha256').update(certificate).digest('hex')
  const uuid = part => part.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
  const id = uuid(digest.slice(0, 32))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadType</key><string>Configuration</string><key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>local.screen-study.${id}</string>
<key>PayloadUUID</key><string>${id}</string>
<key>PayloadDisplayName</key><string>ScreenStudy Local CA</string>
<key>PayloadContent</key><array><dict>
<key>PayloadType</key><string>com.apple.security.root</string><key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>local.screen-study.${id}.root</string>
<key>PayloadUUID</key><string>${uuid(digest.slice(32))}</string>
<key>PayloadDisplayName</key><string>ScreenStudy Local CA</string>
<key>PayloadContent</key><data>${certificate.toString('base64')}</data>
</dict></array></dict></plist>`
}

function send(response, type, body, status = 200) {
  response.writeHead(status, { 'Content-Type': type }).end(body)
}
function json(response, body, status = 200) {
  send(response, 'application/json; charset=utf-8', JSON.stringify(body), status)
}
function html(response, body) { send(response, 'text/html; charset=utf-8', body) }
function headers(response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
}

function pairPage(host, port, os) {
  const ios = os === 'ios'
  const certPath = ios ? 'trust.mobileconfig' : 'root.cer'
  const instructions = ios
    ? '<li>打开 iPhone「设置 → 已下载描述文件」，核对证书后安装。</li><li>前往「设置 → 通用 → 关于本机 → 证书信任设置」，为 ScreenStudy Local CA 开启完全信任。</li>'
    : '<li>打开 Android「设置」，搜索「安装证书」或「加密与凭据」，选择「CA 证书」，从下载文件中选择 ScreenStudy-Local-CA.cer。不同品牌的菜单名称可能不同。</li><li>回到 Chrome。若仍显示证书旧状态，关闭该标签页后重新打开配对链接。</li>'
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>连接 ScreenStudy</title><style>body{margin:2rem auto;padding:0 1rem;max-width:36rem;font:17px/1.65 system-ui;color:#172f29}a{color:#076047}li{margin:.65rem 0}code{overflow-wrap:anywhere}</style>
<h1>${ios ? 'iPhone' : 'Android'} 连接 ScreenStudy</h1>
<p>手机和电脑连接同一 Wi-Fi。请核对电脑控制台显示的证书 SHA-256 指纹，再信任自己电脑生成的证书。</p>
<p><code>${fingerprint}</code></p>
<ol><li><a href="${pairPath}/${certPath}">下载本机证书</a>。此手机已信任证书时可直接点下方的打开链接。</li>${instructions}
<li>点「打开拍屏查题」，选择「开始实时扫描」，允许摄像头。</li></ol>
<p><a id="open" href="https://${host}:${port}/">打开拍屏查题</a></p>
<p>证书、识别组件和题库均由本机通过局域网提供，无需连接外网。</p>
<p>完成后可从手机设置移除 ScreenStudy Local CA。工作管理设备可能限制安装用户 CA。</p>
<script>const link=document.getElementById('open');if(/^#[A-Za-z0-9_-]{24}$/.test(location.hash))link.href+=location.hash;</script></html>`
}

function createMobile(cert) {
  return httpsServer(cert, (request, response) => {
    headers(response)
    if (request.method === 'GET' && request.url === '/') return html(response, mobilePage)
    const asset = ocrFiles.get(request.url)
    if (request.method === 'GET' && asset) {
      response.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
      return send(response, asset.type, asset.body)
    }
    if (request.method === 'GET' && request.url === '/knowledge' &&
        request.headers.authorization === 'Bearer ' + token) {
      const data = banks.knowledge()
      const etag = '"' + data.revision + '"'
      response.setHeader('ETag', etag)
      if (request.headers['if-none-match'] === etag) return response.writeHead(304).end()
      return json(response, data)
    }
    response.writeHead(404).end()
  })
}
function createPair(host, port) {
  return httpServer((request, response) => {
    headers(response)
    if (request.method !== 'GET') return response.writeHead(404).end()
    if (request.url === pairPath + '/trust.mobileconfig') {
      response.setHeader('Content-Disposition', 'attachment; filename="ScreenStudy.mobileconfig"')
      return send(response, 'application/x-apple-aspen-config', profileFor(root))
    }
    if (request.url === pairPath + '/root.cer') {
      response.setHeader('Content-Disposition', 'attachment; filename="ScreenStudy-Local-CA.cer"')
      return send(response, 'application/x-x509-ca-cert', root)
    }
    for (const os of ['ios', 'android']) {
      if (request.url === pairPath + '/' + os) return html(response, pairPage(host, port, os))
    }
    response.writeHead(404).end()
  })
}
function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.removeListener('error', reject)
      server.on('error', error => console.error(error.message))
      resolve(server.address().port)
    })
  })
}

const services = []
if (tls && root) {
  for (const host of hosts) {
    const mobile = createMobile(tls)
    try {
      const port = await listen(mobile, Number(process.env.STUDY_PORT ?? 8797), host)
      const pairing = createPair(host, port)
      const pairPort = await listen(pairing, Number(process.env.STUDY_PAIR_PORT ?? 8798), host)
      services.push(mobile, pairing)
      const base = `http://${host}:${pairPort}${pairPath}`
      links.push({ host, ios: base + '/ios#' + token, android: base + '/android#' + token })
    } catch (error) {
      mobile.close()
      setupError = host + '：' + error.message
    }
  }
}
if (!hosts.length && !setupError) setupError = '未发现可用的局域网地址。连上 Wi-Fi 后退出并重新打开 ScreenStudy。'

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size <= maxUploadBytes) chunks.push(chunk)
    if (size > maxUploadBytes) {
      request.resume()
      throw new Error('文件不能超过 8 MiB。')
    }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
}

const admin = httpServer(async (request, response) => {
  headers(response)
  if (request.headers.host !== '127.0.0.1:' + admin.address().port) return response.writeHead(403).end()
  const { pathname, searchParams } = new URL(request.url, 'http://127.0.0.1')
  if (request.method === 'GET' && pathname === '/') return html(response, desktopPage)
  if (request.method === 'GET' && pathname === '/desktop.js') return send(response, 'text/javascript; charset=utf-8', desktopScript)
  if (request.method === 'GET' && pathname === '/qrcode.js') return send(response, 'text/javascript; charset=utf-8', qrScript)
  if (request.headers.authorization !== 'Bearer ' + adminToken) return response.writeHead(403).end()
  if (request.method === 'GET' && pathname === '/api/state') return json(response, { banks: banks.list(), links, fingerprint, setupError })
  if (request.method === 'POST' && pathname === '/api/quit') {
    json(response, { ok: true })
    for (const service of [...services, admin]) service.close()
    return
  }
  try {
    if (request.method === 'POST' && pathname === '/api/import') {
      const name = searchParams.get('name')
      if (!name || name.length > 200 || /[\\/\u0000-\u001f]/.test(name)) throw new Error('文件名无效。')
      const data = parseBank(name, await readBody(request))
      await banks.update(current => [...current, { id: randomUUID(), name, enabled: true, ...data }])
      return json(response, { banks: banks.list() }, 201)
    }
    const id = /^\/api\/banks\/([\w-]+)$/.exec(pathname)?.[1]
    if (id && ['PATCH', 'DELETE'].includes(request.method)) {
      const enabled = request.method === 'PATCH' ? JSON.parse(await readBody(request)).enabled : null
      if (request.method === 'PATCH' && typeof enabled !== 'boolean') throw new Error('启用状态无效。')
      await banks.update(current => {
        if (!current.some(bank => bank.id === id)) throw new Error('找不到该资料。')
        return request.method === 'DELETE' ? current.filter(bank => bank.id !== id)
          : current.map(bank => bank.id === id ? { ...bank, enabled } : bank)
      })
      return json(response, { banks: banks.list() })
    }
  } catch (error) {
    return json(response, { error: error.code ? '保存失败，请检查应用数据目录。' : error.message }, 400)
  }
  response.writeHead(404).end()
})
const address = `http://127.0.0.1:${await listen(admin, 0, '127.0.0.1')}/#${adminToken}`
if (process.env.STUDY_CONTROL) await writeFile(process.env.STUDY_CONTROL, address, 'utf8')
console.log(address)
if (process.argv.includes('--open')) {
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', address], { windowsHide: true, stdio: 'ignore' })
  browser.on('error', error => console.error(error.message))
}
