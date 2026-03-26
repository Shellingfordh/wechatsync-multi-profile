/**
 * WechatSync CLI
 *
 * 命令行同步文章到多个内容平台
 *
 * 使用方式:
 *   wechatsync sync article.md --platforms zhihu,juejin
 *   wechatsync platforms
 *   wechatsync auth
 */
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import open from 'open'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import {
  adapterRegistry,
  registerAdapter,
  getAdapter,
  ZhihuAdapter,
  BilibiliAdapter,
  ToutiaoAdapter,
  XiaohongshuAdapter,
  DouyinAdapter,
  type Article,
  type SyncResult,
  type PlatformMeta,
  type AuthResult,
} from '@wechatsync/core'
import { ChromeMcpRuntime } from './runtime/chrome-mcp'

const DEFAULT_PLATFORMS = 'xiaohongshu,zhihu,bilibili,toutiao,douyin'
const DEFAULT_ACCOUNTS_FILE = path.join(os.homedir(), '.wechatsync', 'accounts.json')

// 官网
const WEBSITE_URL = 'https://www.wechatsync.com'

const program = new Command()

let adaptersRegistered = false
function registerCliAdapters(): void {
  if (adaptersRegistered) return
  const adapterClasses = [ZhihuAdapter, BilibiliAdapter, ToutiaoAdapter, XiaohongshuAdapter, DouyinAdapter]
  for (const AdapterClass of adapterClasses) {
    const instance = new AdapterClass()
    registerAdapter({
      meta: instance.meta,
      factory: () => new AdapterClass(),
      preprocessConfig: (instance as { preprocessConfig?: unknown }).preprocessConfig as
        | Record<string, unknown>
        | undefined,
    })
  }
  adaptersRegistered = true
}

// ============ 多账号配置 ============

interface AccountConfig {
  id: string
  name?: string
  platforms?: string[]
  // 兼容旧配置（已不使用）
  mcp?: {
    port?: number
    token?: string
  }
  chrome?: {
    userDataDir?: string
    profileDir?: string
    executable?: string
    args?: string[]
    devtoolsPort?: number
    remoteDebuggingPort?: number
    mcpCommand?: string
    mcpArgs?: string[]
  }
  // 可选：账号级内容覆盖（不修改现有存储结构时可忽略）
  content?: AccountContentOverride
}

interface AccountsFile {
  accounts: AccountConfig[]
}

interface AccountContentOverride {
  file?: string
  title?: string
  cover?: string
  platforms?: string[]
}

interface ContentsFile {
  accounts: Record<string, AccountContentOverride>
}

function loadAccountsConfig(filePath: string): AccountConfig[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`账号配置文件不存在: ${filePath}`)
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  let data: AccountsFile
  try {
    data = JSON.parse(raw) as AccountsFile
  } catch (error) {
    throw new Error(`账号配置文件格式错误（应为 JSON）: ${(error as Error).message}`)
  }
  if (!data.accounts || !Array.isArray(data.accounts)) {
    throw new Error('账号配置文件缺少 accounts 数组')
  }
  const ids = new Set<string>()
  for (const account of data.accounts) {
    if (!account.id) {
      throw new Error('账号配置缺少 id')
    }
    if (ids.has(account.id)) {
      throw new Error(`账号 id 重复: ${account.id}`)
    }
    ids.add(account.id)
  }
  return data.accounts
}

function loadContentsMap(filePath: string): ContentsFile['accounts'] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`内容映射文件不存在: ${filePath}`)
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  let data: ContentsFile
  try {
    data = JSON.parse(raw) as ContentsFile
  } catch (error) {
    throw new Error(`内容映射文件格式错误（应为 JSON）: ${(error as Error).message}`)
  }
  if (!data.accounts || typeof data.accounts !== 'object') {
    throw new Error('内容映射文件缺少 accounts 对象')
  }
  return data.accounts
}

function resolveMaybeRelative(p: string, baseDir: string): string {
  return path.isAbsolute(p) ? p : path.resolve(baseDir, p)
}

function resolveCover(coverInput: string | undefined, baseDir: string): string | undefined {
  if (!coverInput) return undefined
  if (coverInput.startsWith('http') || coverInput.startsWith('data:')) return coverInput
  const coverPath = resolveMaybeRelative(coverInput, baseDir)
  if (!fs.existsSync(coverPath)) {
    throw new Error(`封面图文件不存在: ${coverPath}`)
  }
  const coverBuffer = fs.readFileSync(coverPath)
  const ext = path.extname(coverPath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  const mimeType = mimeTypes[ext] || 'image/png'
  return `data:${mimeType};base64,${coverBuffer.toString('base64')}`
}

async function promptContinue(message: string): Promise<void> {
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(chalk.yellow(message), () => {
      rl.close()
      resolve()
    })
  })
}

function selectAccounts(accounts: AccountConfig[], ids?: string[]): AccountConfig[] {
  if (!ids || ids.length === 0) return accounts
  const set = new Set(ids)
  const selected = accounts.filter((a) => set.has(a.id))
  if (selected.length === 0) {
    throw new Error(`未找到指定账号: ${ids.join(', ')}`)
  }
  return selected
}

function ensureUniqueDevtoolsPorts(accounts: AccountConfig[]): void {
  const seen = new Map<number, string>()
  for (const account of accounts) {
    const port = account.chrome?.devtoolsPort ?? account.chrome?.remoteDebuggingPort
    if (!port) continue
    if (seen.has(port)) {
      throw new Error(`DevTools 端口重复: ${port}（账号 ${seen.get(port)} 与 ${account.id}）`)
    }
    seen.set(port, account.id)
  }
}

async function launchChromeProfiles(accounts: AccountConfig[]): Promise<void> {
  for (const account of accounts) {
    const userDataDir = account.chrome?.userDataDir
    if (!userDataDir) continue

    const resolvedUserDataDir = path.isAbsolute(userDataDir)
      ? userDataDir
      : path.join(os.homedir(), userDataDir)

    const args = [`--user-data-dir=${resolvedUserDataDir}`]
    const devtoolsPort = account.chrome?.devtoolsPort ?? account.chrome?.remoteDebuggingPort
    if (devtoolsPort) {
      args.push(`--remote-debugging-port=${devtoolsPort}`)
    }
    if (account.chrome?.profileDir) {
      args.push(`--profile-directory=${account.chrome.profileDir}`)
    }
    if (account.chrome?.args?.length) {
      args.push(...account.chrome.args)
    }

    if (account.chrome?.executable) {
      const child = spawn(account.chrome.executable, args, { detached: true, stdio: 'ignore' })
      child.unref()
    } else {
      await open('about:blank', {
        app: { name: 'Google Chrome', arguments: args },
        wait: false,
      })
    }
  }
}

program
  .name('wechatsync')
  .description('同步文章到多个内容平台 (小红书、知乎、B站、头条、抖音)')
  .version('1.0.0')

// ============ 图片处理 ============

interface LocalImage {
  originalRef: string  // 原始引用，如 ![alt](./img.png) 或 <img src="./img.png">
  localPath: string    // 本地路径
  absolutePath: string // 绝对路径
}

/**
 * MIME 类型映射
 */
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
}

/**
 * 查找内容中的本地图片引用
 */
function findLocalImages(content: string, basePath: string): LocalImage[] {
  const images: LocalImage[] = []
  const seen = new Set<string>()

  // Markdown 图片: ![alt](path)
  const mdImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  let match
  while ((match = mdImageRegex.exec(content)) !== null) {
    const imgPath = match[1].trim()
    // 跳过网络图片和 data URI
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('data:')) {
      continue
    }
    if (!seen.has(imgPath)) {
      seen.add(imgPath)
      images.push({
        originalRef: match[0],
        localPath: imgPath,
        absolutePath: path.resolve(basePath, imgPath),
      })
    }
  }

  // HTML 图片: <img src="path">
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  while ((match = htmlImageRegex.exec(content)) !== null) {
    const imgPath = match[1].trim()
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('data:')) {
      continue
    }
    if (!seen.has(imgPath)) {
      seen.add(imgPath)
      images.push({
        originalRef: match[0],
        localPath: imgPath,
        absolutePath: path.resolve(basePath, imgPath),
      })
    }
  }

  return images
}

/**
 * 读取本地图片为 base64
 */
function readImageAsBase64(imagePath: string): { data: string; mimeType: string } | null {
  if (!fs.existsSync(imagePath)) {
    return null
  }

  const ext = path.extname(imagePath).toLowerCase()
  const mimeType = MIME_TYPES[ext]
  if (!mimeType) {
    return null
  }

  const buffer = fs.readFileSync(imagePath)
  return {
    data: buffer.toString('base64'),
    mimeType,
  }
}

/**
 * 将本地图片转换为 data URI（推荐方式）
 * 让各平台适配器自己处理图片上传，确保图片存储在目标平台的图床
 */
function convertImagesToDataUri(
  content: string,
  basePath: string
): { content: string; convertedCount: number; failedCount: number } {
  const images = findLocalImages(content, basePath)

  if (images.length === 0) {
    return { content, convertedCount: 0, failedCount: 0 }
  }

  let processedContent = content
  let convertedCount = 0
  let failedCount = 0

  for (const img of images) {
    const imageData = readImageAsBase64(img.absolutePath)
    if (!imageData) {
      console.log(chalk.yellow(`  ⚠ 跳过: ${img.localPath} (文件不存在或格式不支持)`))
      failedCount++
      continue
    }

    // 构建 data URI
    const dataUri = `data:${imageData.mimeType};base64,${imageData.data}`

    // 替换内容中的引用
    if (img.originalRef.startsWith('![')) {
      // Markdown 格式
      const newRef = img.originalRef.replace(img.localPath, dataUri)
      processedContent = processedContent.replace(img.originalRef, newRef)
    } else {
      // HTML 格式
      const newRef = img.originalRef.replace(img.localPath, dataUri)
      processedContent = processedContent.replace(img.originalRef, newRef)
    }

    console.log(chalk.green(`  ✓ 转换: ${img.localPath}`))
    convertedCount++
  }

  return { content: processedContent, convertedCount, failedCount }
}

// ============ Markdown/HTML 处理 ============

interface ParsedContent {
  title: string | null
  content: string
  format: 'markdown' | 'html'
}

/**
 * 解析文件内容，提取标题和正文
 */
function parseFileContent(filePath: string): ParsedContent {
  const content = fs.readFileSync(filePath, 'utf-8')
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.md' || ext === '.markdown') {
    return parseMarkdown(content)
  } else if (ext === '.html' || ext === '.htm') {
    return parseHtml(content)
  } else {
    // 当作纯文本处理
    return {
      title: path.basename(filePath, ext),
      content: content,
      format: 'markdown',
    }
  }
}

/**
 * 解析 Markdown 文件
 */
function parseMarkdown(content: string): ParsedContent {
  let title: string | null = null
  let body = content

  // 1. 尝试从 YAML front matter 提取
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (yamlMatch) {
    const frontMatter = yamlMatch[1]
    const titleMatch = frontMatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }
    // 移除 front matter
    body = content.slice(yamlMatch[0].length)
  }

  // 2. 尝试从 # 标题提取
  if (!title) {
    const h1Match = body.match(/^#\s+(.+)$/m)
    if (h1Match) {
      title = h1Match[1].trim()
      // 移除标题行（只移除第一个匹配的）
      body = body.replace(/^#\s+.+\n+/, '')
    }
  }

  // 3. 清理内容
  body = body.trim()

  // 4. 如果内容为空，返回原始内容
  if (!body) {
    body = content
  }

  return {
    title,
    content: body,
    format: 'markdown',
  }
}

/**
 * 解析 HTML 文件
 */
function parseHtml(content: string): ParsedContent {
  let title: string | null = null

  // 从 <title> 标签提取
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    title = titleMatch[1].trim()
  }

  // 从 <h1> 标签提取
  if (!title) {
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (h1Match) {
      title = h1Match[1].trim()
    }
  }

  // 提取 body 内容
  let body = content
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    body = bodyMatch[1].trim()
  }

  return {
    title,
    content: body,
    format: 'html',
  }
}

/**
 * 简单的 Markdown 转 HTML（用于需要 HTML 的平台）
 */
function markdownToHtml(markdown: string): string {
  let html = markdown

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // 标题
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // 粗体和斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 无序列表
  html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // 有序列表
  html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')

  // 引用
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')

  // 水平线
  html = html.replace(/^---+$/gm, '<hr />')

  // 段落（连续的非空行）
  html = html.replace(/^(?!<[a-z])((?:[^\n]+\n?)+)/gm, (match) => {
    const trimmed = match.trim()
    if (trimmed && !trimmed.startsWith('<')) {
      return `<p>${trimmed}</p>\n`
    }
    return match
  })

  return html
}

// ============ Chrome MCP Runtime ============

async function createRuntime(params: {
  devtoolsPort: number
  mcpCommand?: string
  mcpArgs?: string[]
  label?: string
}): Promise<ChromeMcpRuntime> {
  const spinnerLabel = params.label ? `(${params.label}) ` : ''
  const spinner = ora(`${spinnerLabel}连接 Chrome MCP...`).start()
  try {
    const runtime = await ChromeMcpRuntime.create({
      devtoolsPort: params.devtoolsPort,
      mcpCommand: params.mcpCommand,
      mcpArgs: params.mcpArgs,
    })
    spinner.succeed(`${spinnerLabel}Chrome MCP 已连接`)
    return runtime
  } catch (error) {
    spinner.fail(`${spinnerLabel}Chrome MCP 连接失败`)
    throw error
  }
}

async function syncWithRuntime(params: {
  runtime: ChromeMcpRuntime
  platforms: string[]
  title: string
  cover?: string
  parsedContent: { format: 'markdown' | 'html'; content: string }
  fileDir: string
}): Promise<SyncResult[]> {
  const { runtime, platforms, title, cover, parsedContent, fileDir } = params

  registerCliAdapters()
  adapterRegistry.setRuntime(runtime)

  let markdown = parsedContent.format === 'markdown' ? parsedContent.content : ''
  let html = parsedContent.format === 'html'
    ? parsedContent.content
    : markdownToHtml(parsedContent.content)

  const localImages = findLocalImages(parsedContent.content, fileDir)
  if (localImages.length > 0) {
    console.log(chalk.bold(`发现 ${localImages.length} 张本地图片，转换为 data URI...`))
    console.log()

    const imageResult = convertImagesToDataUri(parsedContent.content, fileDir)
    if (imageResult.convertedCount > 0) {
      if (parsedContent.format === 'markdown') {
        markdown = imageResult.content
        html = markdownToHtml(imageResult.content)
      } else {
        html = imageResult.content
      }
    }

    console.log()
    console.log(
      `图片转换完成: ${chalk.green(imageResult.convertedCount + ' 成功')}, ${chalk.red(imageResult.failedCount + ' 失败')}`
    )
    console.log()
  }

  const article: Article = {
    title,
    markdown,
    html,
    cover,
  }

  const results: SyncResult[] = []
  for (const platform of platforms) {
    const adapter = await getAdapter(platform)
    if (!adapter) {
      results.push({ platform, success: false, error: '平台未注册', timestamp: Date.now() })
      continue
    }

    let auth: AuthResult
    try {
      auth = await adapter.checkAuth()
    } catch (error) {
      results.push({ platform, success: false, error: (error as Error).message, timestamp: Date.now() })
      continue
    }

    if (!auth.isAuthenticated) {
      results.push({ platform, success: false, error: '未登录或登录失效', timestamp: Date.now() })
      continue
    }

    try {
      const result = await adapter.publish(article, { draftOnly: true })
      results.push(result)
    } catch (error) {
      results.push({ platform, success: false, error: (error as Error).message, timestamp: Date.now() })
    }
  }

  return results
}

// ============ sync 命令 ============

program
  .command('sync <file>')
  .description('同步 Markdown/HTML 文件到平台')
  .option('-p, --platforms <platforms>', '目标平台，逗号分隔', DEFAULT_PLATFORMS)
  .option('-t, --title <title>', '文章标题（默认从文件提取）')
  .option('--cover <url>', '封面图 URL 或本地路径')
  .option('--dry-run', '仅显示将要执行的操作，不实际同步')
  .option('--accounts <ids>', '账号 id 列表（逗号分隔，启用多账号模式）')
  .option('--accounts-file <path>', '账号配置文件路径', DEFAULT_ACCOUNTS_FILE)
  .option('--content-map <path>', '账号内容映射文件路径（JSON）')
  .option('--all-accounts', '使用账号配置文件中的全部账号')
  .option('--launch-profiles', '同步前启动浏览器 profiles')
  .option('--wait-login', '启动 profiles 后等待手动登录确认')
  .option('--devtools-port <port>', '单账号模式指定 Chrome DevTools 端口')
  .action(async (file: string, options) => {
    // 检查文件是否存在
    const filePath = path.resolve(file)
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`文件不存在: ${filePath}`))
      process.exit(1)
    }

    // 解析文件（默认内容）
    const parsed = parseFileContent(filePath)

    // 确定标题（默认）
    const title = options.title || parsed.title
    if (!title) {
      console.error(chalk.red('无法从文件提取标题，请使用 --title 指定'))
      console.log(chalk.gray('提示: Markdown 文件需要包含 # 标题 或 YAML front matter'))
      process.exit(1)
    }

    // 处理封面图（默认）
    let cover: string | undefined
    try {
      cover = resolveCover(options.cover, path.dirname(filePath))
    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }

    const platforms = options.platforms.split(',').map((p: string) => p.trim().toLowerCase())

    // 准备内容
    const markdown = parsed.format === 'markdown' ? parsed.content : undefined
    const html = parsed.format === 'html' ? parsed.content : markdownToHtml(parsed.content)

    console.log()
    console.log(chalk.bold('同步信息:'))
    console.log(`  文件: ${chalk.cyan(path.basename(filePath))}`)
    console.log(`  标题: ${chalk.cyan(title)}`)
    console.log(`  格式: ${chalk.cyan(parsed.format)}`)
    console.log(`  平台: ${chalk.cyan(platforms.join(', '))}`)
    console.log(`  内容: ${chalk.gray(parsed.content.length + ' 字符')}`)
    if (cover) {
      console.log(`  封面: ${chalk.cyan(cover.startsWith('data:') ? '(本地图片)' : cover)}`)
    }
    console.log()

    if (options.dryRun) {
      console.log(chalk.yellow('(dry-run 模式，不实际同步)'))
      console.log()
      console.log(chalk.bold('内容预览:'))
      console.log(chalk.gray(parsed.content.slice(0, 300) + (parsed.content.length > 300 ? '...' : '')))
      process.exit(0)
    }

    const fileDir = path.dirname(filePath)
    const parsedContent = { format: parsed.format, content: parsed.content } as { format: 'markdown' | 'html'; content: string }

    const accountIds = options.accounts
      ? options.accounts.split(',').map((id: string) => id.trim()).filter(Boolean)
      : []

    if (accountIds.length > 0 || options.allAccounts) {
      const accounts = loadAccountsConfig(options.accountsFile)
      const accountsFileDir = path.dirname(path.resolve(options.accountsFile))
      const contentMap = options.contentMap
        ? loadContentsMap(options.contentMap)
        : null
      const contentMapDir = options.contentMap ? path.dirname(path.resolve(options.contentMap)) : null
      const selected = options.allAccounts ? accounts : selectAccounts(accounts, accountIds)
      ensureUniqueDevtoolsPorts(selected)

      if (options.launchProfiles) {
        for (const account of selected) {
          const devtoolsPort = account.chrome?.devtoolsPort ?? account.chrome?.remoteDebuggingPort
          if (!devtoolsPort) {
            console.error(chalk.red(`账号 ${account.id} 缺少 chrome.devtoolsPort`))
            process.exit(1)
          }
        }
        console.log(chalk.gray('正在启动浏览器 profiles...'))
        await launchChromeProfiles(selected)
      }

      if (options.launchProfiles && options.waitLogin) {
        console.log()
        console.log(chalk.bold('请在打开的浏览器中完成登录/验证码等操作。'))
        console.log(chalk.gray('完成后回到此终端继续。'))
        await promptContinue('已完成登录，请按回车继续...')
      }

      const allResults: Array<{ accountId: string; results: SyncResult[] }> = []

      const useAccountPlatforms = options.platforms === DEFAULT_PLATFORMS

      for (const account of selected) {
        const contentOverride = (contentMap?.[account.id] || account.content || {}) as AccountContentOverride
        const accountFilePath = contentOverride.file
          ? resolveMaybeRelative(contentOverride.file, contentMapDir || accountsFileDir)
          : filePath
        if (!fs.existsSync(accountFilePath)) {
          console.log(chalk.red(`账号 ${account.id} 的内容文件不存在: ${accountFilePath}`))
          continue
        }

        const accountParsed = parseFileContent(accountFilePath)
        const accountTitle = contentOverride.title || options.title || accountParsed.title
        if (!accountTitle) {
          console.log(chalk.red(`账号 ${account.id} 无法从内容文件提取标题，请使用 --title 或内容映射指定 title`))
          continue
        }

        let accountCover: string | undefined
        try {
          accountCover = resolveCover(contentOverride.cover || options.cover, path.dirname(accountFilePath))
        } catch (error) {
          console.log(chalk.red(`账号 ${account.id} 封面处理失败: ${(error as Error).message}`))
          continue
        }

        const accountParsedContent = { format: accountParsed.format, content: accountParsed.content } as { format: 'markdown' | 'html'; content: string }
        const accountFileDir = path.dirname(accountFilePath)

        const accountPlatforms = useAccountPlatforms && account.platforms?.length
          ? account.platforms.map((p: string) => p.toLowerCase())
          : platforms

        const overridePlatforms = contentOverride.platforms?.length
          ? contentOverride.platforms.map(p => p.toLowerCase())
          : null

        console.log()
        console.log(chalk.bold(`账号: ${account.id}${account.name ? ` (${account.name})` : ''}`))
        console.log(`  内容: ${chalk.cyan(path.basename(accountFilePath))}`)
        console.log(`  平台: ${chalk.cyan((overridePlatforms || accountPlatforms).join(', '))}`)
        console.log()
        const devtoolsPort = account.chrome?.devtoolsPort ?? account.chrome?.remoteDebuggingPort
        if (!devtoolsPort) {
          console.log(chalk.red(`账号 ${account.id} 缺少 chrome.devtoolsPort，已跳过`))
          continue
        }

        const runtime = await createRuntime({
          devtoolsPort,
          mcpCommand: account.chrome?.mcpCommand,
          mcpArgs: account.chrome?.mcpArgs,
          label: account.id,
        })

        const syncSpinner = ora(`(${account.id}) 正在同步...`).start()
        try {
          const results = await syncWithRuntime({
            runtime,
            platforms: overridePlatforms || accountPlatforms,
            title: accountTitle,
            cover: accountCover,
            parsedContent: accountParsedContent,
            fileDir: accountFileDir,
          })
          syncSpinner.stop()
          allResults.push({ accountId: account.id, results })
        } catch (error) {
          syncSpinner.fail(`(${account.id}) 同步失败`)
          console.error(chalk.red((error as Error).message))
          allResults.push({ accountId: account.id, results: [] })
        } finally {
          await runtime.close()
        }
      }

      console.log()
      console.log(chalk.bold('多账号同步结果:'))
      console.log()

      for (const entry of allResults) {
        console.log(chalk.cyan(`账号: ${entry.accountId}`))
        if (entry.results.length === 0) {
          console.log(chalk.gray('  无结果或同步失败'))
          continue
        }
        for (const result of entry.results) {
          if (result.success) {
            console.log(
              chalk.green('  ✓'),
              chalk.bold(result.platform),
              result.draftOnly ? chalk.gray('(草稿)') : ''
            )
            if (result.postUrl) {
              console.log(`    ${chalk.cyan(result.postUrl)}`)
            }
          } else {
            console.log(chalk.red('  ✗'), chalk.bold(result.platform))
            console.log(`    ${chalk.red(result.error || '未知错误')}`)
          }
        }
      }

      process.exit(0)
    }

    const devtoolsPort = options.devtoolsPort ? parseInt(options.devtoolsPort, 10) : null
    if (!devtoolsPort) {
      console.error(chalk.red('单账号模式需要 --devtools-port'))
      process.exit(1)
    }
    const runtime = await createRuntime({ devtoolsPort })

    const syncSpinner = ora('正在同步...').start()

    try {
      const results = await syncWithRuntime({
        runtime,
        platforms,
        title,
        cover,
        parsedContent,
        fileDir,
      })

      syncSpinner.stop()
      console.log()
      console.log(chalk.bold('同步结果:'))
      console.log()

      for (const result of results) {
        if (result.success) {
          console.log(
            chalk.green('  ✓'),
            chalk.bold(result.platform),
            result.draftOnly ? chalk.gray('(草稿)') : ''
          )
          if (result.postUrl) {
            console.log(`    ${chalk.cyan(result.postUrl)}`)
          }
        } else {
          console.log(chalk.red('  ✗'), chalk.bold(result.platform))
          console.log(`    ${chalk.red(result.error || '未知错误')}`)
        }
      }

      const successCount = results.filter((r) => r.success).length
      console.log()
      console.log(
        `同步完成: ${chalk.green(successCount + ' 成功')}, ${chalk.red((results.length - successCount) + ' 失败')}`
      )
    } catch (error) {
      syncSpinner.fail('同步失败')
      console.error(chalk.red((error as Error).message))
    } finally {
      await runtime.close()
      process.exit(0)
    }
  })

// ============ platforms 命令 ============

program
  .command('platforms')
  .alias('ls')
  .description('列出所有支持的平台')
  .option('-a, --auth', '同时显示登录状态')
  .option('--devtools-port <port>', '指定 Chrome DevTools 端口（用于检查登录状态）')
  .action(async (options) => {
    registerCliAdapters()
    const platforms = adapterRegistry.getAllMeta()
    const spinner = ora('获取平台列表...').start()

    try {
      let authMap = new Map<string, AuthResult>()
      if (options.auth) {
        const devtoolsPort = options.devtoolsPort ? parseInt(options.devtoolsPort, 10) : null
        if (!devtoolsPort) {
          spinner.fail('需要 --devtools-port 才能检查登录状态')
          process.exit(1)
        }
        const runtime = await createRuntime({ devtoolsPort })
        adapterRegistry.setRuntime(runtime)
        for (const meta of platforms) {
          const adapter = await getAdapter(meta.id)
          if (!adapter) continue
          authMap.set(meta.id, await adapter.checkAuth())
        }
        await runtime.close()
      }

      spinner.stop()
      console.log()
      console.log(chalk.bold(`支持的平台 (${platforms.length}):`))
      console.log()

      for (const p of platforms) {
        const auth = authMap.get(p.id)
        const status = options.auth
          ? auth?.isAuthenticated
            ? chalk.green('✓ 已登录')
            : chalk.red('✗ 未登录')
          : ''
        console.log(`  ${chalk.cyan(p.id.padEnd(15))} ${p.name.padEnd(10)} ${status}`)
      }
      console.log()
    } catch (error) {
      spinner.fail('获取失败')
      console.error(chalk.red((error as Error).message))
    } finally {
      process.exit(0)
    }
  })

// ============ auth 命令 ============

program
  .command('auth [platform]')
  .description('检查平台登录状态')
  .option('-r, --refresh', '强制刷新状态')
  .option('--devtools-port <port>', '指定 Chrome DevTools 端口')
  .action(async (platform: string | undefined, options) => {
    registerCliAdapters()
    const devtoolsPort = options.devtoolsPort ? parseInt(options.devtoolsPort, 10) : null
    if (!devtoolsPort) {
      console.error(chalk.red('auth 需要 --devtools-port'))
      process.exit(1)
    }
    const runtime = await createRuntime({ devtoolsPort })
    adapterRegistry.setRuntime(runtime)
    const spinner = ora('检查登录状态...').start()

    try {
      if (platform) {
        const adapter = await getAdapter(platform)
        if (!adapter) {
          spinner.fail('平台未注册')
          process.exit(1)
        }
        const result = await adapter.checkAuth()

        spinner.stop()
        console.log()

        if (result.isAuthenticated) {
          console.log(chalk.green(`✓ ${platform} 已登录`))
          if (result.username) {
            console.log(`  用户: ${chalk.cyan(result.username)}`)
          }
        } else {
          console.log(chalk.red(`✗ ${platform} 未登录`))
          if (result.error) {
            console.log(`  错误: ${chalk.gray(result.error)}`)
          }
        }
      } else {
        const platforms = adapterRegistry.getAllMeta()
        const statuses: Array<{ meta: PlatformMeta; auth: AuthResult }> = []
        for (const meta of platforms) {
          const adapter = await getAdapter(meta.id)
          if (!adapter) continue
          statuses.push({ meta, auth: await adapter.checkAuth() })
        }

        spinner.stop()

        const authenticated = statuses.filter((p) => p.auth.isAuthenticated)
        const unauthenticated = statuses.filter((p) => !p.auth.isAuthenticated)

        console.log()
        console.log(chalk.bold('登录状态:'))
        console.log()

        if (authenticated.length > 0) {
          console.log(chalk.green(`已登录 (${authenticated.length}):`))
          for (const p of authenticated) {
            console.log(`  ${chalk.cyan(p.meta.id.padEnd(15))} ${p.meta.name}`)
          }
          console.log()
        }

        if (unauthenticated.length > 0) {
          console.log(chalk.red(`未登录 (${unauthenticated.length}):`))
          for (const p of unauthenticated) {
            console.log(`  ${chalk.gray(p.meta.id.padEnd(15))} ${p.meta.name}`)
          }
          console.log()
        }
      }
    } catch (error) {
      spinner.fail('检查失败')
      console.error(chalk.red((error as Error).message))
    } finally {
      await runtime.close()
      process.exit(0)
    }
  })

// ============ wechat 命令 ============

program
  .command('wechat')
  .description('使用本地脚本发布微信公众号（手动维护脚本逻辑）')
  .option('--script <path>', '脚本路径', path.join(os.homedir(), 'Downloads', 'wechat.py'))
  .option('--python <path>', 'Python 可执行文件路径', 'python3')
  .action(async (options) => {
    const scriptPath = path.resolve(options.script)
    if (!fs.existsSync(scriptPath)) {
      console.error(chalk.red(`脚本不存在: ${scriptPath}`))
      process.exit(1)
    }
    const python = options.python

    console.log(chalk.gray(`运行脚本: ${scriptPath}`))
    const child = spawn(python, [scriptPath], { stdio: 'inherit' })

    child.on('exit', (code) => {
      if (code === 0) {
        console.log(chalk.green('脚本执行完成'))
      } else {
        console.error(chalk.red(`脚本执行失败，退出码: ${code}`))
      }
      process.exit(code ?? 1)
    })
  })

// ============ extract 命令 ============

program
  .command('extract')
  .description('从当前浏览器页面提取文章')
  .option('-o, --output <file>', '输出到文件')
  .action(async (options) => {
    console.error(chalk.red('extract 依赖浏览器扩展，当前 CLI 已切换为 Chrome MCP 流程'))
    console.error(chalk.gray('如需提取功能，请使用旧版扩展或自行实现页面抓取脚本。'))
    process.exit(1)
  })

// ============ 默认行为 ============

if (process.argv.length <= 2) {
  console.log()
  console.log(chalk.bold('WechatSync CLI') + ' - 同步文章到多个内容平台')
  console.log()
  console.log(`官网: ${chalk.cyan(WEBSITE_URL)}`)
  console.log()
  console.log('支持的平台: 小红书、知乎、B站、头条、抖音')
  console.log()
  program.outputHelp()
  process.exit(0)
}

program.parse()
