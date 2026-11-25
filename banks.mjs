import { readFile, writeFile, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export const maxUploadBytes = 8 * 1024 * 1024

export function parseBank(name, content) {
  const input = content.replace(/^\uFEFF/, '').trim()
  let rows
  if (/\.txt$/i.test(name)) {
    rows = input.split(/\n\s*\n/).filter(Boolean).map((text, index) => ({ page: index + 1, text }))
  } else if (/\.json$/i.test(name)) {
    try { rows = JSON.parse(input) } catch { throw new Error('JSON 格式错误。') }
  } else {
    throw new Error('请使用 .json 或 .txt 文件。')
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error('资料为空或缺少 JSON 数组。')
  if (rows.every(row => Number.isInteger(row?.page) && typeof row.text === 'string' && row.text.trim())) {
    return { kind: 'reference', rows }
  }
  if (rows.every(row => typeof row?.question === 'string' && /[\p{L}\p{N}]/u.test(row.question) &&
      typeof row.answer === 'string' && row.answer.trim())) {
    return { kind: 'answers', rows }
  }
  throw new Error('一份文件须统一使用 page、text，或 question、answer 字段。')
}

export async function openBanks(directory) {
  const path = join(directory, 'banks.json')
  const initial = [{ id: 'sample', name: '示例题库.json', enabled: true, kind: 'answers',
    rows: [{ question: '太阳系中体积最大的行星是什么？', answer: '木星', source: '虚构示例题库' }] }]
  let banks
  try {
    banks = JSON.parse(await readFile(path, 'utf8'))
    if (!Array.isArray(banks)) throw new Error('题库配置格式异常：' + path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    banks = initial
  }
  let revision = randomUUID()
  let pending = Promise.resolve()
  return {
    list: () => banks.map(({ rows, ...bank }) => ({ ...bank, count: rows.length })),
    knowledge: () => ({ revision, banks: banks.filter(bank => bank.enabled) }),
    update(change) {
      const result = pending.then(async () => {
        const updated = await change(banks)
        const temporary = path + '.tmp'
        await writeFile(temporary, JSON.stringify(updated), 'utf8')
        await rename(temporary, path)
        banks = updated
        revision = randomUUID()
      })
      pending = result.catch(() => {})
      return result
    }
  }
}
