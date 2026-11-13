// package.json의 dependencies를 읽어 src/features/legal/licenses.ts를 만든다.
// 실행: npm run licenses (의존성을 바꾼 뒤 다시 실행한다)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function repositoryUrl(pkg) {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (!repo) return ''
  const url = repo.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '')
  return /^github:/.test(url) ? `https://github.com/${url.slice(7)}` : url
}

function licenseText(dir) {
  const file = readdirSync(dir).find((f) => /^(license|licence)(\.(md|txt))?$/i.test(f))
  return file ? readFileSync(join(dir, file), 'utf8').trim() : ''
}

const names = Object.keys(readJson(join(root, 'package.json')).dependencies).sort()
const entries = names.map((name) => {
  const dir = join(root, 'node_modules', name)
  if (!existsSync(dir)) throw new Error(`${name}이(가) 설치되어 있지 않습니다. npm install을 먼저 실행하세요.`)
  const pkg = readJson(join(dir, 'package.json'))
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type
  if (!license) throw new Error(`${name}의 license 필드가 없습니다.`)
  return { name, version: pkg.version, license, repository: repositoryUrl(pkg), text: licenseText(dir) }
})

const header = `// 이 파일은 scripts/generate-licenses.mjs가 만든다. 직접 고치지 말고 npm run licenses로 다시 만든다.
export interface LicenseEntry {
  name: string
  version: string
  license: string
  repository: string
  text: string
}

export const LICENSES: LicenseEntry[] = `
writeFileSync(join(root, 'src/features/legal/licenses.ts'), `${header}${JSON.stringify(entries, null, 2)}\n`)
const missing = entries.filter((e) => !e.text).map((e) => e.name)
console.log(`${entries.length}개 패키지를 기록했습니다.`)
if (missing.length) console.warn(`라이선스 본문 파일이 없는 패키지: ${missing.join(', ')}`)
