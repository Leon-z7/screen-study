const $ = id => document.getElementById(id)
const token = location.hash.slice(1)
let links = []
let os = 'ios'

async function api(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { Authorization: 'Bearer ' + token } })
  if (response.status === 403) throw new Error('控制台链接已失效，请重新打开 ScreenStudy。')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '操作失败。')
  return data
}
function notice(message) { $('status').textContent = message }
function showPairingQr(url) {
  const canvas = $('qr')
  canvas.hidden = true
  if (!url) return false

  try {
    const code = qrcode(0, 'M')
    code.addData(url)
    code.make()
    const modules = code.getModuleCount()
    const scale = 4
    const margin = 4
    canvas.width = canvas.height = (modules + 2 * margin) * scale
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#000'
    for (let row = 0; row < modules; row++) {
      for (let column = 0; column < modules; column++) {
        if (code.isDark(row, column)) {
          context.fillRect((column + margin) * scale, (row + margin) * scale, scale, scale)
        }
      }
    }
    canvas.hidden = false
    return true
  } catch {
    return false
  }
}
function selectPlatform(platform) {
  os = platform
  for (const item of ['ios', 'android']) {
    $(item).classList.toggle('primary', item === os)
    $(item).setAttribute('aria-pressed', String(item === os))
  }
  const browser = os === 'ios' ? 'Safari' : 'Chrome'
  const url = links[$('host').selectedIndex]?.[os] || ''
  $('pair').value = url
  const hasQr = showPairingQr(url)
  let instructions = '等待电脑生成配对链接。'
  if (url) instructions = `复制配对链接到手机 ${browser} 打开。`
  if (hasQr) instructions = '扫描下方二维码，或' + instructions
  $('browser').textContent = instructions
  $('install').textContent = os === 'ios'
    ? '首次按配对页提示安装描述文件，并在「证书信任设置」开启完全信任。'
    : '首次下载 CA 证书，并在系统设置中选择「安装 CA 证书」。'
}
$('ios').onclick = () => selectPlatform('ios')
$('android').onclick = () => selectPlatform('android')
$('host').onchange = () => selectPlatform(os)
$('copy').onclick = async () => {
  $('pair').select()
  try {
    await navigator.clipboard.writeText($('pair').value)
    $('connection').textContent = '已复制配对链接。请在手机浏览器打开。'
  } catch {
    $('connection').textContent = '请按 Ctrl+C 复制选中的配对链接。'
  }
}
function renderBanks(banks) {
  const rows = banks.map(bank => {
    const row = document.createElement('div')
    row.className = 'file'
    const details = document.createElement('div')
    const label = document.createElement('label')
    label.className = 'fileTitle'
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = bank.enabled
    label.append(box, document.createTextNode(bank.name))
    const meta = document.createElement('small')
    meta.className = 'meta'
    meta.textContent = bank.kind === 'answers' ? `题库 · ${bank.count} 道题` : `知识库 · ${bank.count} 条资料`
    details.append(label, meta)
    const remove = document.createElement('button')
    remove.textContent = '移除'
    remove.setAttribute('aria-label', '移除 ' + bank.name)
    box.onchange = async () => {
      box.disabled = true
      const enabled = box.checked
      try {
        await api('/api/banks/' + bank.id, { method: 'PATCH', body: JSON.stringify({ enabled }) })
        notice(enabled ? '已参与检索。' : '已暂停参与检索。')
      } catch (error) {
        box.checked = !enabled
        notice(error.message)
      } finally {
        box.disabled = false
      }
    }
    remove.onclick = async () => {
      if (!confirm('从 ScreenStudy 移除 ' + bank.name + '？')) return
      remove.disabled = true
      try {
        await api('/api/banks/' + bank.id, { method: 'DELETE' })
        row.remove()
        notice('已移除。')
      } catch (error) {
        remove.disabled = false
        notice(error.message)
      }
    }
    row.append(details, remove)
    return row
  })
  $('banks').replaceChildren(...rows)
}
$('import').onchange = async () => {
  const picker = $('import')
  const messages = []
  let imported = 0
  picker.disabled = true
  for (const file of [...picker.files]) {
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('文件不能超过 8 MiB。')
      const { banks } = await api('/api/import?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
      imported++
      renderBanks(banks)
    } catch (error) {
      messages.push(file.name + '：' + error.message)
    }
  }
  picker.disabled = false
  picker.value = ''
  notice([`已导入 ${imported} 份文件。`, ...messages].join(' '))
}
$('quit').onclick = async () => {
  try {
    await api('/api/quit', { method: 'POST' })
    document.querySelector('main').textContent = 'ScreenStudy 已退出。可关闭此标签页。'
  } catch (error) {
    notice(error.message)
  }
}
selectPlatform(os)
api('/api/state').then(data => {
  renderBanks(data.banks)
  links = data.links
  $('host').replaceChildren(...links.map(link => new Option(link.host)))
  $('links').hidden = !links.length
  $('certificate').hidden = !links.length
  $('fingerprint').textContent = data.fingerprint
  $('connection').textContent = data.setupError || '连接失败时，请检查 Windows 防火墙是否允许专用网络访问。'
  selectPlatform(os)
}).catch(error => notice(error.message))
