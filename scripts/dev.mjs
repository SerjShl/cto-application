import { existsSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const envPath = path.join(root, '.env')

function loadDotEnv() {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match && !match[2].startsWith('#') && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  }
}

function findPython() {
  const candidates = process.platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python.exe', args: [] }, { command: 'python', args: [] }]
    : [{ command: 'python3', args: [] }, { command: 'python', args: [] }]
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true })
    const executable = result.stdout?.trim()
    if (result.status === 0 && executable && !/WindowsApps/i.test(executable)) return candidate
  }
  return null
}

function startVite() {
  return spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:vite'], { stdio: 'inherit', windowsHide: true, cwd: root })
}

loadDotEnv()
const vite = startVite()
const python = findPython()
let service

if (python) {
  const install = spawnSync(python.command, [...python.args, '-m', 'pip', 'install', '-r', 'requirements.txt'], { stdio: 'inherit', windowsHide: true, cwd: root })
  if (install.status === 0) {
    service = spawn(python.command, [...python.args, 'notification_service.py'], { stdio: 'inherit', windowsHide: true, cwd: root, env: process.env })
  } else {
    console.warn('Python найден, но зависимости не установились. Vite продолжает запуск.')
  }
} else {
  console.warn('Python не найден (или обнаружена заглушка Windows Store). Vite продолжает запуск без уведомлений.')
}

function shutdown() {
  vite.kill()
  service?.kill()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
vite.on('exit', (code) => {
  service?.kill()
  process.exit(code ?? 0)
})
