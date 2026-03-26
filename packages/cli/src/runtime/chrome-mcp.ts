import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { RuntimeInterface, Cookie } from '@wechatsync/core'
import { JSDOM } from 'jsdom'

type McpToolResult = {
  content?: Array<{ type: string; text?: string }>
}

type DevtoolsPage = {
  id: number
  url?: string
  title?: string
}

type SerializedBody =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'base64'; base64: string; mimeType: string }
  | { kind: 'form'; entries: Array<SerializedFormEntry> }

type SerializedFormEntry =
  | { name: string; value: string; file?: false }
  | { name: string; file: true; filename: string; mimeType: string; base64: string }

class ChromeMcpResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Map<string, string>
  private bodyText: string

  constructor(init: { ok: boolean; status: number; statusText: string; headers: Record<string, string>; text: string }) {
    this.ok = init.ok
    this.status = init.status
    this.statusText = init.statusText
    this.headers = new Map(Object.entries(init.headers))
    this.bodyText = init.text
  }

  async text(): Promise<string> {
    return this.bodyText
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.bodyText)
  }
}

class ChromeMcpClient {
  private client: Client
  private transport: StdioClientTransport

  constructor(params: { browserUrl: string; mcpCommand?: string; mcpArgs?: string[] }) {
    const command = params.mcpCommand || 'npx'
    const args = params.mcpArgs || ['-y', 'chrome-devtools-mcp@latest', `--browser-url=${params.browserUrl}`]

    this.transport = new StdioClientTransport({
      command,
      args,
      stderr: 'pipe',
    })
    this.client = new Client({ name: 'wechatsync-cli', version: '1.0.0' })
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport)
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  async callTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const result = await this.client.callTool({ name, arguments: args ?? {} }) as McpToolResult
    const text = result.content?.map((c) => c.text || '').join('') || ''
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      return text as unknown as T
    }
  }
}

export class ChromeMcpRuntime implements RuntimeInterface {
  readonly type = 'node' as const
  private pageByOrigin = new Map<string, number>()
  private currentPageId: number | null = null
  private storageMap = new Map<string, unknown>()
  private sessionMap = new Map<string, unknown>()

  constructor(private client: ChromeMcpClient) {}

  static async create(params: { devtoolsPort: number; mcpCommand?: string; mcpArgs?: string[] }): Promise<ChromeMcpRuntime> {
    const browserUrl = `http://127.0.0.1:${params.devtoolsPort}`
    const client = new ChromeMcpClient({ browserUrl, mcpCommand: params.mcpCommand, mcpArgs: params.mcpArgs })
    await client.connect()
    return new ChromeMcpRuntime(client)
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  private async selectPage(pageId: number): Promise<void> {
    if (this.currentPageId === pageId) return
    await this.client.callTool('select_page', { pageId })
    this.currentPageId = pageId
  }

  private async listPages(): Promise<DevtoolsPage[]> {
    const pages = await this.client.callTool<DevtoolsPage[]>('list_pages')
    return Array.isArray(pages) ? pages : []
  }

  private async ensurePageForUrl(url: string): Promise<number> {
    const origin = new URL(url).origin
    const existing = this.pageByOrigin.get(origin)
    if (existing) {
      await this.selectPage(existing)
      return existing
    }

    await this.client.callTool('new_page', { url: origin, background: true })
    const pages = await this.listPages()
    const last = pages[pages.length - 1]
    const pageId = last?.id ?? pages.find((p) => p.url?.startsWith(origin))?.id
    if (!pageId) {
      throw new Error(`无法创建页面: ${origin}`)
    }
    this.pageByOrigin.set(origin, pageId)
    await this.selectPage(pageId)
    await this.client.callTool('navigate_page', { type: 'url', url })
    return pageId
  }

  private async evaluateOnPage<T>(pageId: number, fn: string, args?: unknown[]): Promise<T> {
    await this.selectPage(pageId)
    const result = await this.client.callTool<T>('evaluate_script', { function: fn, args })
    return result
  }

  private async resolveCookieString(domain: string): Promise<string> {
    const url = `https://${domain.replace(/^\./, '')}/`
    const pageId = await this.ensurePageForUrl(url)
    const cookieString = await this.evaluateOnPage<string>(
      pageId,
      '() => document.cookie'
    )
    return cookieString || ''
  }

  private async serializeBody(body: BodyInit | undefined): Promise<SerializedBody> {
    if (!body) return { kind: 'none' }

    if (typeof body === 'string') {
      return { kind: 'text', text: body }
    }

    if (body instanceof URLSearchParams) {
      return { kind: 'text', text: body.toString() }
    }

    if (body instanceof ArrayBuffer) {
      return {
        kind: 'base64',
        base64: Buffer.from(body).toString('base64'),
        mimeType: 'application/octet-stream',
      }
    }

    if (body instanceof Uint8Array) {
      return {
        kind: 'base64',
        base64: Buffer.from(body).toString('base64'),
        mimeType: 'application/octet-stream',
      }
    }

    if (body instanceof Blob) {
      const buffer = await body.arrayBuffer()
      return {
        kind: 'base64',
        base64: Buffer.from(buffer).toString('base64'),
        mimeType: body.type || 'application/octet-stream',
      }
    }

    if (body instanceof FormData) {
      const entries: SerializedFormEntry[] = []
      for (const [name, value] of body.entries()) {
        if (typeof value === 'string') {
          entries.push({ name, value, file: false })
        } else {
          const file = value as File
          const buffer = await file.arrayBuffer()
          entries.push({
            name,
            file: true,
            filename: file.name || 'file',
            mimeType: file.type || 'application/octet-stream',
            base64: Buffer.from(buffer).toString('base64'),
          })
        }
      }
      return { kind: 'form', entries }
    }

    return { kind: 'text', text: String(body) }
  }

  private static buildFetchFunction(): string {
    return `(payload) => {
      const { url, options, body } = payload;
      const buildBody = (bodySpec) => {
        if (!bodySpec || bodySpec.kind === 'none') return undefined;
        if (bodySpec.kind === 'text') return bodySpec.text;
        if (bodySpec.kind === 'base64') {
          const binary = atob(bodySpec.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new Blob([bytes], { type: bodySpec.mimeType });
        }
        if (bodySpec.kind === 'form') {
          const fd = new FormData();
          for (const entry of bodySpec.entries || []) {
            if (!entry.file) {
              fd.append(entry.name, entry.value);
            } else {
              const binary = atob(entry.base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const blob = new Blob([bytes], { type: entry.mimeType });
              fd.append(entry.name, blob, entry.filename);
            }
          }
          return fd;
        }
        return undefined;
      };

      const headers = options?.headers || {};
      const init = {
        method: options?.method || 'GET',
        headers,
        credentials: options?.credentials || 'include',
        body: buildBody(body),
      };
      return fetch(url, init).then(async (res) => {
        const headersObj = {};
        res.headers.forEach((value, key) => { headersObj[key] = value; });
        const text = await res.text();
        return {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          headers: headersObj,
          text,
        };
      });
    }`
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const pageId = await this.ensurePageForUrl(url)

    const headers: Record<string, string> = {}
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => { headers[key] = value })
      } else if (Array.isArray(options.headers)) {
        for (const [key, value] of options.headers) {
          headers[key] = value
        }
      } else {
        Object.assign(headers, options.headers)
      }
    }

    const body = await this.serializeBody(options?.body)
    const result = await this.evaluateOnPage<{
      ok: boolean
      status: number
      statusText: string
      headers: Record<string, string>
      text: string
    }>(
      pageId,
      ChromeMcpRuntime.buildFetchFunction(),
      [{ url, options: { method: options?.method, headers, credentials: options?.credentials }, body }]
    )

    return new ChromeMcpResponse(result) as unknown as Response
  }

  cookies = {
    get: async (domain: string): Promise<Cookie[]> => {
      const cookieString = await this.resolveCookieString(domain)
      if (!cookieString) return []
      return cookieString.split(';').map((pair) => {
        const [name, ...rest] = pair.trim().split('=')
        return {
          name,
          value: rest.join('='),
          domain,
          path: '/',
        }
      })
    },
    set: async (cookie: Cookie): Promise<void> => {
      const url = `https://${cookie.domain.replace(/^\./, '')}/`
      const pageId = await this.ensurePageForUrl(url)
      const value = `${cookie.name}=${cookie.value}; path=${cookie.path || '/'}`
      await this.evaluateOnPage(pageId, `(val) => { document.cookie = val; return true; }`, [value])
    },
    remove: async (name: string, domain: string): Promise<void> => {
      const url = `https://${domain.replace(/^\./, '')}/`
      const pageId = await this.ensurePageForUrl(url)
      const value = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
      await this.evaluateOnPage(pageId, `(val) => { document.cookie = val; return true; }`, [value])
    },
  }

  async getCookie(domain: string, name: string): Promise<string | null> {
    const cookieString = await this.resolveCookieString(domain)
    const cookies = cookieString.split(';').map((p) => p.trim())
    for (const entry of cookies) {
      if (entry.startsWith(`${name}=`)) {
        return entry.slice(name.length + 1)
      }
    }
    return null
  }

  storage = {
    get: async <T>(key: string): Promise<T | null> => {
      return (this.storageMap.get(key) as T) ?? null
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      this.storageMap.set(key, value)
    },
    remove: async (key: string): Promise<void> => {
      this.storageMap.delete(key)
    },
  }

  session = {
    get: async <T>(key: string): Promise<T | null> => {
      return (this.sessionMap.get(key) as T) ?? null
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      this.sessionMap.set(key, value)
    },
  }

  tabs = {
    query: async (urlPattern: string): Promise<Array<{ id: number; url?: string }>> => {
      const pages = await this.listPages()
      if (!urlPattern.includes('*')) return pages.filter((p) => p.url === urlPattern)
      const pattern = new RegExp('^' + urlPattern.replace(/[.+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '.*') + '$')
      return pages.filter((p) => p.url && pattern.test(p.url)).map((p) => ({ id: p.id, url: p.url }))
    },
    create: async (url: string, _active = false): Promise<{ id: number }> => {
      await this.client.callTool('new_page', { url, background: true })
      const pages = await this.listPages()
      const last = pages[pages.length - 1]
      if (!last) throw new Error('无法创建新页面')
      return { id: last.id }
    },
    waitForLoad: async (tabId: number, timeout = 30000): Promise<void> => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const readyState = await this.evaluateOnPage<string>(tabId, '() => document.readyState')
        if (readyState === 'complete') return
        await new Promise((r) => setTimeout(r, 300))
      }
      throw new Error('Tab load timeout')
    },
    executeScript: async <T, A extends unknown[]>(
      tabId: number,
      func: (...args: A) => T | Promise<T>,
      args: A
    ): Promise<T> => {
      const fnSource = func.toString()
      return this.evaluateOnPage<T>(tabId, fnSource, args)
    },
  }

  dom = {
    parseHTML: async (html: string): Promise<Document> => {
      const dom = new JSDOM(html)
      return dom.window.document
    },
    querySelector: (doc: Document, selector: string): Element | null => doc.querySelector(selector),
    querySelectorAll: (doc: Document, selector: string): Element[] => Array.from(doc.querySelectorAll(selector)),
    getTextContent: (element: Element): string => element.textContent || '',
    getInnerHTML: (element: Element): string => (element as HTMLElement).innerHTML,
  }
}
